export const SESSION_STATUS_CODES = [0, 1, 2, 3, 4, 5] as const;

export type SessionStatusCode = (typeof SESSION_STATUS_CODES)[number];

const SESSION_STATUS_LABELS_EN: Record<SessionStatusCode, string> = {
  0: 'Pending',
  1: 'paid',
  2: 'Canceled no payment',
  3: 'Canceled Payment',
  4: 'refund',
  5: 'Completed',
};

/** Lowercase labels for filters and compact status display. */
const SESSION_STATUS_FILTER_LABELS_EN: Record<SessionStatusCode, string> = {
  0: 'pending',
  1: 'paid',
  2: 'canceled no payment',
  3: 'canceled payment',
  4: 'refund',
  5: 'completed',
};

const SESSION_STATUS_LABELS_ES: Record<SessionStatusCode, string> = {
  0: 'Pendiente',
  1: 'pagado',
  2: 'Cancelado sin pago',
  3: 'Cancelado con pago',
  4: 'reembolso',
  5: 'Completado',
};

const SESSION_STATUS_FILTER_LABELS_ES: Record<SessionStatusCode, string> = {
  0: 'pendiente',
  1: 'pagado',
  2: 'cancelado sin pago',
  3: 'cancelado con pago',
  4: 'reembolso',
  5: 'completado',
};

export function normalizeSessionStatus(value: unknown): SessionStatusCode {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (SESSION_STATUS_CODES.includes(n as SessionStatusCode)) {
    return n as SessionStatusCode;
  }
  return 0;
}

export function getSessionStatusLabel(code: SessionStatusCode, language: string): string {
  const labels = language === 'es' ? SESSION_STATUS_LABELS_ES : SESSION_STATUS_LABELS_EN;
  return labels[code] ?? labels[0];
}

export function getSessionStatusFilterLabel(code: SessionStatusCode, language: string): string {
  const labels = language === 'es' ? SESSION_STATUS_FILTER_LABELS_ES : SESSION_STATUS_FILTER_LABELS_EN;
  return labels[code] ?? labels[0];
}

export function getSessionStatusOptions(language: string): Array<{ code: SessionStatusCode; label: string }> {
  return SESSION_STATUS_CODES.map(code => ({
    code,
    label: getSessionStatusLabel(code, language),
  }));
}

export function getSessionStatusFilterOptions(language: string): Array<{ code: SessionStatusCode; label: string }> {
  return SESSION_STATUS_CODES.map(code => ({
    code,
    label: getSessionStatusFilterLabel(code, language),
  }));
}

/** Extract raw status from a client_requests row (handles column name variants from Supabase). */
export function readClientRequestStatusRaw(request: unknown): unknown {
  if (!request || typeof request !== 'object') return undefined;
  const record = request as Record<string, unknown>;
  return (
    record.statusvalue
    ?? record.StatusValue
    ?? record.status_value
    ?? record['Status Value']
    ?? record.session_status
    ?? record.Session_Status
  );
}

/** Column key to use when writing status back to client_requests. */
export function getClientRequestStatusFieldName(request: unknown): string {
  if (!request || typeof request !== 'object') return 'statusvalue';
  const record = request as Record<string, unknown>;
  if ('statusvalue' in record) return 'statusvalue';
  if ('StatusValue' in record) return 'StatusValue';
  if ('status_value' in record) return 'status_value';
  if ('Status Value' in record) return 'Status Value';
  if ('session_status' in record) return 'session_status';
  return 'statusvalue';
}

export function buildClientRequestStatusUpdate(
  request: unknown,
  newStatus: SessionStatusCode,
): Record<string, number> {
  return { [getClientRequestStatusFieldName(request)]: newStatus };
}

/** Read lifecycle status from a client request. */
export function getClientRequestStatusValue(request: unknown): SessionStatusCode {
  return normalizeSessionStatus(readClientRequestStatusRaw(request));
}
