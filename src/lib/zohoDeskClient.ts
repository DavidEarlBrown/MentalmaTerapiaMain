/**
 * Zoho Desk API client — proxied via Supabase Edge Function.
 *
 * All requests go through the `zoho-desk-proxy` edge function so the
 * browser never calls desk.zoho.com directly (CORS restriction).
 *
 * Required env variables (Supabase Function secrets):
 *   ZOHO_DESK_ORG_ID    — Zoho Desk organisation ID
 *
 * Required Zoho OAuth scopes (Books + Desk):
 *   ZohoBooks.contacts.CREATE, ZohoBooks.contacts.READ,
 *   ZohoBooks.invoices.CREATE, ZohoBooks.invoices.READ,
 *   Desk.tickets.ALL, Desk.contacts.READ,
 *   Desk.departments.READ, Desk.search.READ
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateTicketParams {
  subject: string;
  description: string;
  contactEmail: string;
  contactName?: string;
  contactPhone?: string;
  ticketNumber?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
  departmentId?: string;
}

export interface ZohoDeskTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  createdTime: string;
  modifiedTime: string;
  email: string;
  contactId?: string;
  departmentId?: string;
  webUrl?: string;
  assigneeId?: string;
  contact?: { name?: string; email?: string };
}

export interface ZohoDeskComment {
  id: string;
  content: string;
  isPublic: boolean;
  createdTime: string;
  author?: { name?: string; photoURL?: string };
}

export interface ZohoDeskListResponse {
  data: ZohoDeskTicket[];
  count: number;
}

export interface ZohoDeskCommentListResponse {
  data: ZohoDeskComment[];
  count: number;
}

export type TicketStatusFilter =
  | 'All'
  | 'Open'
  | 'In Progress'
  | 'On Hold'
  | 'Closed'
  | 'Resolved';

// ── Department resolution ─────────────────────────────────────────────────────

/** Name of the Zoho Desk department used for all Mentalma support tickets. */
const DEPT_NAME = 'MentalmaSupport';

interface ZohoDeskDept { id: string; name: string; }
interface ZohoDeskDeptList { data: ZohoDeskDept[]; }

/** Module-level cache so we only call /departments once per page load. */
let _deptIdCache: string | null = null;

/**
 * Resolves the department ID for DEPT_NAME.
 * Falls back to VITE_ZOHO_DESK_DEPT_ID if set, then '' (Zoho default dept).
 */
async function resolveDeptId(): Promise<string> {
  if (_deptIdCache !== null) return _deptIdCache;

  // Env-var override takes priority (useful when dept lookup scope is missing)
  const envId = (import.meta.env.VITE_ZOHO_DESK_DEPT_ID as string | undefined) || '';
  if (envId) { _deptIdCache = envId; return envId; }

  try {
    const result = await deskRequest<ZohoDeskDeptList>('/departments?limit=50');
    const match = (result.data ?? []).find(
      d => d.name.toLowerCase() === DEPT_NAME.toLowerCase(),
    );
    _deptIdCache = match?.id ?? '';
    if (!_deptIdCache) {
      console.warn(`Zoho Desk: department "${DEPT_NAME}" not found; tickets will use default dept`);
    }
  } catch {
    _deptIdCache = ''; // don't block ticket ops if dept lookup fails
  }
  return _deptIdCache;
}

// ── Proxy helpers ─────────────────────────────────────────────────────────────

function getOrgId(): string {
  return (import.meta.env.VITE_ZOHO_DESK_ORG_ID as string | undefined) || '';
}

function getProxyUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  return `${supabaseUrl}/functions/v1/zoho-desk-proxy`;
}

function getAnonKey(): string {
  return import.meta.env.VITE_SUPABASE_ANON_KEY as string;
}

function getZohoClientId(): string {
  return (import.meta.env.VITE_ZOHO_API_CLIENT_ID as string | undefined) || '';
}

function getZohoClientSecret(): string {
  return (import.meta.env.VITE_ZOHO_API_CLIENT_SECRET as string | undefined) || '';
}

/** All Zoho Desk API calls go here. Throws on error. */
async function deskRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' = 'GET',
  body?: unknown,
): Promise<T> {
  const res = await fetch(getProxyUrl(), {
    method: 'POST',                          // always POST to the proxy
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${getAnonKey()}`,
    },
    body: JSON.stringify({
      path,
      method,
      body,
      // Do NOT pass localStorage token — let the proxy always use the
      // DB-stored token (which has the correct Desk scopes after re-auth).
      accessToken: '',
      orgId: getOrgId(),
      // Pass client credentials so the proxy can refresh the token
      // without needing server-side secrets (they're in the VITE_ bundle anyway).
      clientId:     getZohoClientId(),
      clientSecret: getZohoClientSecret(),
    }),
  });

  // Guard against empty responses (e.g. network errors, 204 No Content)
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(`Zoho Desk proxy returned an empty response (HTTP ${res.status})`);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Zoho Desk proxy response is not valid JSON: ${text.slice(0, 120)}`);
  }

  if (!res.ok) {
    // Surface the actual Zoho Desk message if present
    const zohoMsg =
      (data as { message?: string })?.message ||
      (data as { errorMessage?: string })?.errorMessage ||
      (data as { error?: string })?.error;
    throw new Error(zohoMsg || `Zoho Desk error ${res.status}`);
  }

  // Zoho Desk may embed its own error code even on 200
  if ((data as { errorCode?: string })?.errorCode) {
    const zohoMsg =
      (data as { message?: string })?.message ||
      (data as { errorCode?: string }).errorCode;
    throw new Error(zohoMsg ?? 'Zoho Desk unknown error');
  }

  return data as T;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List tickets filtered by status (defaults to All).
 */
export async function listDeskTickets(
  status: TicketStatusFilter = 'All',
  limit = 50,
  from = 0,
): Promise<ZohoDeskTicket[]> {
  // Minimal params — no department filter, no sortBy.
  // Zoho Desk returns all tickets the agent can see.
  const params = new URLSearchParams({ limit: String(limit) });
  if (from > 0) params.set('from', String(from));
  if (status !== 'All') params.set('status', status);

  const result = await deskRequest<ZohoDeskListResponse>(
    `/tickets?${params.toString()}`,
  );
  return result.data ?? [];
}

/**
 * List tickets for a specific contact email.
 */
export async function listDeskTicketsByEmail(
  email: string,
  status: TicketStatusFilter = 'All',
  limit = 50,
): Promise<ZohoDeskTicket[]> {
  const params = new URLSearchParams({
    email,
    limit: String(limit),
  });
  if (status !== 'All') params.set('status', status);
  const result = await deskRequest<ZohoDeskListResponse>(`/tickets?${params}`);
  return result.data ?? [];
}

/**
 * Create a new support ticket.
 */
export async function createDeskTicket(params: CreateTicketParams): Promise<ZohoDeskTicket> {
  const deptId = params.departmentId || await resolveDeptId();

  const subject = params.ticketNumber
    ? `[${params.ticketNumber}] ${params.subject}`
    : params.subject;

  // Zoho Desk requires departmentId — omit only if truly unknown;
  // Zoho will use the default dept when it's absent on some org configs.
  const payload: Record<string, unknown> = {
    subject,
    description: params.description,
    email:       params.contactEmail,
    priority:    params.priority || 'Medium',
  };
  if (deptId) payload['departmentId'] = deptId;

  if (params.contactName || params.contactPhone) {
    payload['contact'] = {
      ...(params.contactName  ? { lastName: params.contactName }  : {}),
      ...(params.contactPhone ? { phone:    params.contactPhone } : {}),
    };
  }

  return deskRequest<ZohoDeskTicket>('/tickets', 'POST', payload);
}

/**
 * Get a single ticket by ID.
 */
export async function getDeskTicket(ticketId: string): Promise<ZohoDeskTicket> {
  return deskRequest<ZohoDeskTicket>(`/tickets/${ticketId}`);
}

/**
 * Partially update a ticket (status, priority, subject, description).
 */
export async function updateDeskTicket(
  ticketId: string,
  changes: Partial<Pick<ZohoDeskTicket, 'status' | 'priority' | 'subject' | 'description'>>,
): Promise<ZohoDeskTicket> {
  return deskRequest<ZohoDeskTicket>(`/tickets/${ticketId}`, 'PATCH', changes);
}

/**
 * Fetch comments for a ticket (oldest first).
 */
export async function getDeskTicketComments(ticketId: string): Promise<ZohoDeskComment[]> {
  const result = await deskRequest<ZohoDeskCommentListResponse>(
    `/tickets/${ticketId}/comments?limit=50`,
  );
  return result.data ?? [];
}

/**
 * Add a comment to a ticket.
 * @param isPublic  true = customer-visible; false = internal note
 */
export async function addDeskTicketComment(
  ticketId: string,
  content:  string,
  isPublic = true,
): Promise<ZohoDeskComment> {
  return deskRequest<ZohoDeskComment>(`/tickets/${ticketId}/comments`, 'POST', {
    content,
    isPublic,
  });
}

/**
 * Returns true if the error message indicates an expired / invalid token.
 */
export function isDeskTokenError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('invalid_token') ||
    lower.includes('token') ||
    lower.includes('unauthorized') ||
    lower.includes('401')
  );
}

/**
 * Maps a Zoho Desk ticket status to a display colour.
 */
export function statusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'open':        return '#2563eb';
    case 'in progress':
    case 'inprogress':  return '#d97706';
    case 'on hold':     return '#7c3aed';
    case 'closed':      return '#16a34a';
    case 'resolved':    return '#059669';
    case 'cancelled':   return '#6b7280';
    default:            return '#475569';
  }
}
