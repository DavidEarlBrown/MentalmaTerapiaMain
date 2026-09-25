import type {
  AdminTableRow,
  Specialty,
  Professional,
  AvailableSlot,
  CalendarItem,
  ClientRequest,
  ClientRequestFormData,
  User,
  UserFormData,
  SessionPrice,
  CounselingType,
  PaymentTransaction,
  PaymentFormData,
  Session,
  ConsultLogEntry,
  Problem,
  Profession,
  Resume,
} from '../types';
import { supabase } from './supabaseClient';

const API_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api`;
const API_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

export async function fetchProfessions(): Promise<Profession[]> {
  const response = await fetch(`${API_BASE_URL}/professions`, { headers });
  if (!response.ok) {
    throw new Error('Failed to fetch professions');
  }
  return response.json();
}

export async function createProfession(data: Partial<Profession>): Promise<Profession> {
  const response = await fetch(`${API_BASE_URL}/admin/professions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create profession');
  }
  return response.json();
}

export async function updateProfession(id: string, data: Partial<Profession>): Promise<Profession> {
  const response = await fetch(`${API_BASE_URL}/admin/row/professions/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update profession');
  }
  return response.json();
}

export async function deleteProfession(id: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/admin/row/professions/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete profession');
  }
  return response.json();
}

export async function fetchSpecialties(professionId?: string): Promise<Specialty[]> {
  const url = professionId
    ? `${API_BASE_URL}/specialties?profession_id=${encodeURIComponent(professionId)}`
    : `${API_BASE_URL}/specialties`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error('Failed to fetch specialties');
  }
  return response.json();
}

export async function fetchProfessionals(professionId?: string): Promise<Professional[]> {
  const url = professionId
    ? `${API_BASE_URL}/professionals?profession_id=${encodeURIComponent(professionId)}`
    : `${API_BASE_URL}/professionals`;
  const response = await fetch(url, { headers, cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to fetch professionals');
  }
  return response.json();
}

export async function fetchAvailableSlots(professionalId: string): Promise<AvailableSlot[]> {
  const response = await fetch(`${API_BASE_URL}/slots?professional_id=${professionalId}`, { headers });
  if (!response.ok) {
    throw new Error('Failed to fetch available slots');
  }
  return response.json();
}

/** Calendar entries for a day: sessions + client_requests (deduped by TimeSlotId). */
export async function fetchCalendarItemsByDate(date: string): Promise<CalendarItem[]> {
  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${date}T23:59:59.999`;

  const [sessionsResult, requestsResult] = await Promise.all([
    supabase
      .from('sessions')
      .select(
        'id, professional_id, client_name, full_name, client_email, username, session_date, status, notes, amount, currency, PriceCharged, num_sessions, TimeSlotId'
      )
      .gte('session_date', dayStart)
      .lte('session_date', dayEnd)
      .order('session_date', { ascending: true }),
    supabase
      .from('client_requests')
      .select(
        'id, professional_id, client_name, full_name, username, client_email, client_phone, issue, preferred_date, preferred_time, scheduled_datetime, status, price_amount, price_currency, num_sessions, TimeSlotId'
      )
      .eq('preferred_date', date)
      .order('preferred_time', { ascending: true }),
  ]);

  if (sessionsResult.error) {
    throw new Error(sessionsResult.error.message);
  }
  if (requestsResult.error) {
    throw new Error(requestsResult.error.message);
  }

  const sessionItems: CalendarItem[] = (sessionsResult.data || []).map((row) => {
    const clientName =
      String(row.client_name || row.full_name || row.username || '').trim() ||
      String(row.client_email || '');
    return {
      id: String(row.id),
      source: 'session' as const,
      professional_id: String(row.professional_id || ''),
      client_name: clientName,
      client_email: String(row.client_email || ''),
      subject: String(row.notes || ''),
      status: String(row.status || 'pending'),
      scheduled_at: String(row.session_date || `${date}T00:00:00`),
      price_amount: row.PriceCharged != null ? String(row.PriceCharged) : row.amount != null ? String(row.amount) : undefined,
      price_currency: row.currency != null ? String(row.currency) : undefined,
      num_sessions: row.num_sessions != null ? Number(row.num_sessions) : undefined,
      TimeSlotId: row.TimeSlotId != null ? String(row.TimeSlotId) : undefined,
    };
  });

  const sessionSlotIds = new Set(
    sessionItems.map((item) => item.TimeSlotId).filter((id): id is string => Boolean(id))
  );

  const requestItems: CalendarItem[] = (requestsResult.data || [])
    .filter((row) => {
      const slotId = row.TimeSlotId != null ? String(row.TimeSlotId) : '';
      return !slotId || !sessionSlotIds.has(slotId);
    })
    .map((row) => {
      const clientName =
        String(row.client_name || row.full_name || row.username || '').trim() ||
        String(row.client_email || '');
      const timePart = String(row.preferred_time || '00:00').slice(0, 5);
      const scheduledAt = row.scheduled_datetime
        ? String(row.scheduled_datetime)
        : `${date}T${timePart}:00`;
      return {
        id: String(row.id),
        source: 'client_request' as const,
        professional_id: String(row.professional_id || ''),
        client_name: clientName,
        client_email: String(row.client_email || ''),
        client_phone: row.client_phone != null ? String(row.client_phone) : undefined,
        subject: String(row.issue || ''),
        status: String(row.status || 'pending'),
        scheduled_at: scheduledAt,
        price_amount: row.price_amount != null ? String(row.price_amount) : undefined,
        price_currency: row.price_currency != null ? String(row.price_currency) : undefined,
        num_sessions: row.num_sessions != null ? Number(row.num_sessions) : undefined,
        TimeSlotId: row.TimeSlotId != null ? String(row.TimeSlotId) : undefined,
      };
    });

  return [...sessionItems, ...requestItems].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  );
}

export async function submitClientRequest(data: ClientRequestFormData): Promise<ClientRequest> {
  const response = await fetch(`${API_BASE_URL}/client-requests`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to submit client request');
  }

  return response.json();
}

export async function fetchUserByUsername(username: string): Promise<User | null> {
  try {
    const key = username.trim();
    if (!key) return null;

    // Preferred: service-role fetch-user (works after API deploy with ?username=)
    const response = await fetch(
      `${API_BASE_URL}/fetch-user?username=${encodeURIComponent(key)}`,
      { headers }
    );
    if (response.ok) {
      const data = await response.json();
      if (data) return data as User;
    }

    // Fallback for older deployed APIs: admin rows filter (also service-role)
    const fallback = await fetch(
      `${API_BASE_URL}/admin/rows/users?user=${encodeURIComponent(key)}`,
      { headers }
    );
    if (!fallback.ok) return null;
    const rows = (await fallback.json()) as User[];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const lower = key.toLowerCase();
    const exact = rows.find(
      (u) =>
        (u.username || '').toLowerCase() === lower ||
        (u.email || '').toLowerCase() === lower
    );
    return exact || rows[0] || null;
  } catch (error) {
    console.error('Error fetching user by username:', error);
    return null;
  }
}

export async function fetchResumes(): Promise<Resume[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${supabaseUrl}/rest/v1/resumes?select=*&order=created_at.desc`, {
    method: 'GET',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch resumes');
  }

  return (await response.json()) as Resume[];
}

export async function createUser(data: UserFormData): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create user');
  }

  return response.json();
}

export async function fetchUserById(userId: string): Promise<User | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/fetch-user?id=${encodeURIComponent(userId)}`, { headers });
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.error('Error fetching user by ID:', error);
    return null;
  }
}

export async function fetchUserByEmail(email: string): Promise<User | null> {
  try {
    const normalized = email.trim().toLowerCase();
    const response = await fetch(`${API_BASE_URL}/fetch-user?email=${encodeURIComponent(normalized)}`, { headers });
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.error('Error fetching user by email:', error);
    return null;
  }
}

export async function updateUserProfile(
  userId: string,
  data: Pick<UserFormData, 'username' | 'email' | 'full_name' | 'phone'>
): Promise<User> {
  const emailNorm = data.email.trim().toLowerCase();
  const { data: updated, error } = await supabase
    .from('users')
    .update({
      username: data.username.trim(),
      email: emailNorm,
      full_name: data.full_name.trim(),
      phone: data.phone?.trim() || '',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return updated as User;
}

export async function completeUserProfile(data: UserFormData & { id: string; auth_provider?: string }): Promise<User> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const authToken = sessionData?.session?.access_token;

    const response = await fetch(`${API_BASE_URL}/complete-profile`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken || API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: data.id,
        username: data.username,
        email: data.email,
        full_name: data.full_name,
        phone: data.phone || '',
        auth_provider: data.auth_provider || 'google',
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to complete profile');
    }

    return response.json();
  } catch (error) {
    console.error('Error completing user profile:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to complete profile');
  }
}

export async function createSpecialty(data: Partial<Specialty>): Promise<Specialty> {
  const response = await fetch(`${API_BASE_URL}/admin/specialties`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create specialty');
  }

  return response.json();
}

export async function updateSpecialty(id: string, data: Partial<Specialty>): Promise<Specialty> {
  const response = await fetch(`${API_BASE_URL}/admin/row/specialties/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update specialty');
  }

  return response.json();
}

export async function deleteSpecialty(id: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/admin/row/specialties/${id}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete specialty');
  }

  return response.json();
}

export async function deleteAllRows(tableName: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/admin/delete-all/${tableName}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete rows');
  }

  return response.json();
}

export async function fetchTableRows(tableName: string, userFilter?: string): Promise<AdminTableRow[]> {
  if (tableName === 'std_questionnaires') {
    let query = supabase.from('std_questionnaires').select('*');
    if (userFilter) query = query.ilike('id', `%${userFilter}%`);
    query = query.order('id', { ascending: true });
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as AdminTableRow[];
  }

  if (tableName === 'questionnaire_results') {
    let query = supabase.from('questionnaire_results').select('*');
    query = query.order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as AdminTableRow[];
  }

  const url = userFilter
    ? `${API_BASE_URL}/admin/rows/${tableName}?user=${encodeURIComponent(userFilter)}`
    : `${API_BASE_URL}/admin/rows/${tableName}`;

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error('Failed to fetch table rows');
  }

  return (await response.json()) as AdminTableRow[];
}

export async function updateRow(
  tableName: string,
  rowId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (tableName === 'questionnaire_results') {
    const { data: updated, error } = await supabase
      .from('questionnaire_results')
      .update(data)
      .eq('id', rowId)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error('Row not found');
    return updated as Record<string, unknown>;
  }

  const response = await fetch(`${API_BASE_URL}/admin/row/${tableName}/${rowId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update row');
  }

  return (await response.json()) as Record<string, unknown>;
}

export async function deleteRow(tableName: string, rowId: string): Promise<{ success: boolean; message: string }> {
  if (tableName === 'questionnaire_results') {
    const { error } = await supabase
      .from('questionnaire_results')
      .delete()
      .eq('id', rowId);
    if (error) throw new Error(error.message);
    return { success: true, message: 'Row deleted' };
  }

  const response = await fetch(`${API_BASE_URL}/admin/row/${tableName}/${rowId}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete row');
  }

  return response.json();
}

export async function insertRow(
  tableName: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (tableName === 'questionnaire_results') {
    const { data: inserted, error } = await supabase
      .from('questionnaire_results')
      .insert(data)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (inserted ?? {}) as Record<string, unknown>;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/admin/row/${tableName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to insert row';
      try {
        const error = await response.json();
        errorMessage = error.error || error.message || errorMessage;
      } catch (parseError) {
        errorMessage = `Server error: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    console.error('Insert row error:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to insert row: Network or server error');
  }
}

export async function fetchSessionPrices(): Promise<SessionPrice[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${supabaseUrl}/rest/v1/sessionPrices?select=*&order=NumSessions.asc`, {
    method: 'GET',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch session prices');
  }

  return response.json();
}

export async function createSessionPrice(data: Omit<SessionPrice, 'id' | 'created_at'>): Promise<SessionPrice> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${supabaseUrl}/rest/v1/sessionPrices`, {
    method: 'POST',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create session price');
  }

  const result = await response.json();
  return result[0];
}

export async function updateSessionPrice(id: number, data: Partial<SessionPrice>): Promise<SessionPrice> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${supabaseUrl}/rest/v1/sessionPrices?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update session price');
  }

  const result = await response.json();
  return result[0];
}

export function filterPricesForProfessional(
  allPrices: SessionPrice[],
  professionalId?: string | null,
): SessionPrice[] {
  const professionalSpecific = allPrices.filter(
    p => p.professional_id && p.professional_id === professionalId
  );
  if (professionalSpecific.length > 0) return professionalSpecific;

  return allPrices.filter(p => !p.professional_id);
}

export async function deleteSessionPrice(id: number): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${supabaseUrl}/rest/v1/sessionPrices?id=eq.${id}`, {
    method: 'DELETE',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete session price');
  }
}

export async function fetchCounselingTypes(professionId?: string): Promise<CounselingType[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  let url = `${supabaseUrl}/rest/v1/counseling_types?select=*&is_active=eq.true&order=name_en.asc`;
  if (professionId) url += `&or=(profession_id.eq.${encodeURIComponent(professionId)},profession_id.is.null)`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch counseling types');
  }

  return response.json();
}

export async function fetchProblems(professionId?: string): Promise<Problem[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  let url = `${supabaseUrl}/rest/v1/problems?select=*&order=problem_abrev.asc`;
  if (professionId) {
    url += `&profession_id=eq.${encodeURIComponent(professionId)}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch problems');
  }

  return response.json();
}

export async function createPaymentTransaction(data: PaymentFormData): Promise<PaymentTransaction> {
  const insertData = {
    client_name: data.client_name,
    client_email: data.client_email,
    client_phone: data.client_phone || '',
    payment_amount: Number(data.payment_amount) || 0,
    payment_currency: data.payment_currency || 'USD',
    payment_status: data.payment_status,
    payment_method: data.payment_method,
    num_sessions: data.num_sessions,
    session_price_id: data.session_price_id,
    transaction_reference: data.transaction_reference || '',
    notes: data.notes || '',
    professional_id: data.professional_id,
    client_request_id: data.client_request_id,
    exchange_rate: data.exchange_rate,
    payment_date: new Date().toISOString(),
    ...(data.payment_method === 'Bank Transfer' || data.payment_method === 'Wompi PSE'
      ? {
          pse_type: 'PSE',
          user_type: data.user_type ?? 0,
          user_legal_id_type: data.user_legal_id_type || '',
          user_legal_id: data.user_legal_id || '',
          financial_institution_code: data.financial_institution_code || '',
          payment_description: data.payment_description || '',
        }
      : {}),
    ...(data.payment_method === 'Wompi'
      ? {
          wompi_type: 'CARD',
          wompi_token: data.token || '',
          installments: data.installments ?? 1,
        }
      : {}),
    ...(data.payment_method === 'Wompi PSE'
      ? {
          wompi_type: 'PSE',
        }
      : {}),
  };

  const { data: result, error } = await supabase
    .from('payment_transactions')
    .insert(insertData)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to create payment transaction');
  }

  return result as PaymentTransaction;
}

export async function fetchPaymentTransactions(): Promise<PaymentTransaction[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${supabaseUrl}/rest/v1/payment_transactions?select=*&order=payment_date.desc`, {
    method: 'GET',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch payment transactions');
  }

  return response.json();
}

export async function updatePaymentTransaction(id: string, data: Partial<PaymentTransaction>): Promise<PaymentTransaction> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${supabaseUrl}/rest/v1/payment_transactions?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update payment transaction');
  }

  const result = await response.json();
  return result[0];
}

/** Counts for home-page bottom labels (clients = users with user_type Client). */
export async function fetchHomeStatCounts(): Promise<{
  clientCount: number;
  sessionCount: number;
  averageClientRating: number | null;
}> {
  const [clientsResult, sessionsResult, ratingsResult] = await Promise.all([
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .ilike('user_type', 'client'),
    supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('sessions')
      .select('client_rating')
      .not('client_rating', 'is', null),
  ]);

  if (clientsResult.error) {
    throw new Error(clientsResult.error.message);
  }
  if (sessionsResult.error) {
    throw new Error(sessionsResult.error.message);
  }
  if (ratingsResult.error) {
    throw new Error(ratingsResult.error.message);
  }

  // Skip null/undefined/empty ratings (Number(null) === 0 would skew the average).
  const ratings = (ratingsResult.data || [])
    .map((row) => row.client_rating)
    .filter((value): value is number | string => value != null && value !== '')
    .map((value) => Number(value))
    .filter((n) => Number.isFinite(n));
  const averageClientRating =
    ratings.length > 0
      ? Math.round((ratings.reduce((sum, n) => sum + n, 0) / ratings.length) * 10) / 10
      : null;

  return {
    clientCount: clientsResult.count ?? 0,
    sessionCount: sessionsResult.count ?? 0,
    averageClientRating,
  };
}

export async function fetchSessions(clientEmail?: string, professionalId?: string): Promise<Session[]> {
  // Both filters are optional, but at least one must be provided to avoid
  // returning every session in the database (sessions RLS is permissive).
  if (!clientEmail?.trim() && !professionalId?.trim()) {
    return [];
  }

  let query = supabase
    .from('sessions')
    .select('*')
    .order('session_date', { ascending: true });

  if (clientEmail) {
    const normalized = clientEmail.trim();
    query = normalized ? query.ilike('client_email', normalized) : query;
  }

  if (professionalId) {
    query = query.eq('professional_id', professionalId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function updateSession(sessionId: string, updates: Partial<Session>): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update(updates)
    .eq('id', sessionId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function logSessionChange(logEntry: Omit<ConsultLogEntry, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase
    .from('ConsultLog')
    .insert([logEntry]);

  if (error) {
    throw new Error(error.message);
  }
}

export async function clearProfessionalSchedule(professionalId: string): Promise<void> {
  const { error } = await supabase
    .from('available_slots')
    .delete()
    .eq('professional_id', professionalId)
    .eq('is_booked', false);

  if (error) {
    throw new Error(error.message);
  }
}

export async function addAvailableSlot(slotData: {
  professional_id: string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
  saturday?: string;
  sunday?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('available_slots')
    .insert([slotData]);

  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchAvailableSlotsByDay(professionalId: string, dayOfWeek: string): Promise<AvailableSlot[]> {
  const dayColumn = dayOfWeek.toLowerCase();

  const { data, error } = await supabase
    .from('available_slots')
    .select('*')
    .eq('professional_id', professionalId)
    .eq('is_booked', false)
    .eq(dayColumn, 'Y')
    .order('start_time', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export interface TimeSlot {
  id: string;
  slotId: string;
  startTime: string;
  endTime: string;
  display: string;
}

export function generateTimeSlotsFromRange(availableSlots: AvailableSlot[], slotDurationMinutes: number = 30): TimeSlot[] {
  const generatedSlots: TimeSlot[] = [];

  availableSlots.forEach((slot) => {
    const startTime = slot.start_time;
    const endTime = slot.end_time;

    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    for (let currentMinutes = startMinutes; currentMinutes < endMinutes; currentMinutes += slotDurationMinutes) {
      const nextMinutes = currentMinutes + slotDurationMinutes;

      if (nextMinutes > endMinutes) break;

      const currentHour = Math.floor(currentMinutes / 60);
      const currentMin = currentMinutes % 60;
      const nextHour = Math.floor(nextMinutes / 60);
      const nextMin = nextMinutes % 60;

      const start = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;
      const end = `${String(nextHour).padStart(2, '0')}:${String(nextMin).padStart(2, '0')}`;

      const startDate = new Date(`2000-01-01T${start}:00`);
      const endDate = new Date(`2000-01-01T${end}:00`);

      const display = `${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - ${endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;

      generatedSlots.push({
        id: `${slot.id}-${start}`,
        slotId: slot.id,
        startTime: start,
        endTime: end,
        display,
      });
    }
  });

  return generatedSlots;
}
