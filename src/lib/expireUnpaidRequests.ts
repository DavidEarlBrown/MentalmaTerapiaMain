/**
 * Auto-cancel unpaid pending client requests after a short hold window.
 *
 * Flow:
 *  - Client submits "Request a Session" → status='pending', statusvalue=0
 *  - Slot is soft-reserved via time overlap
 *  - If unpaid for UNPAID_HOLD_MINUTES, set statusvalue=2 ("Canceled no payment")
 *    and status='cancelled' so the time frees for other clients
 */

import { supabase } from './supabaseClient';

/** Minutes an unpaid pending request may hold a slot before auto-cancel. */
export const UNPAID_HOLD_MINUTES = 15;

/** Status code: Canceled no payment (see sessionStatus.ts). */
const CANCELED_NO_PAYMENT = 2;

function isStillPendingLifecycle(row: Record<string, unknown>): boolean {
  const raw =
    row.statusvalue ??
    row.StatusValue ??
    row.status_value ??
    row.session_status ??
    0;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? '0'), 10);
  return n === 0 || Number.isNaN(n);
}

/**
 * Cancel unpaid pending client_requests older than UNPAID_HOLD_MINUTES.
 * Returns the number of rows cancelled.
 *
 * Safe to call often (idempotent). Prefers the DB RPC when available;
 * falls back to a direct client update.
 */
export async function expireUnpaidPendingRequests(): Promise<number> {
  // 1) Prefer server RPC (works even with tighter RLS; also used by cron).
  try {
    const { data, error } = await supabase.rpc('expire_unpaid_pending_client_requests', {
      p_minutes: UNPAID_HOLD_MINUTES,
    });
    if (!error && typeof data === 'number') {
      return data;
    }
    // If RPC missing, fall through to client-side path.
    if (error && !/could not find|does not exist|404|PGRST202/i.test(error.message)) {
      console.warn('expire_unpaid_pending_client_requests RPC:', error.message);
    }
  } catch {
    /* fall through */
  }

  // 2) Client-side fallback
  const cutoff = new Date(Date.now() - UNPAID_HOLD_MINUTES * 60_000).toISOString();

  const { data: candidates, error: selectError } = await supabase
    .from('client_requests')
    .select('id, status, statusvalue, session_status, created_at')
    .eq('status', 'pending')
    .lte('created_at', cutoff);

  if (selectError) {
    console.warn('expireUnpaidPendingRequests select:', selectError.message);
    return 0;
  }

  const pending = (candidates ?? []).filter(row =>
    isStillPendingLifecycle(row as Record<string, unknown>),
  );
  if (pending.length === 0) return 0;

  // Do not cancel if a Completed payment already exists for the request.
  const ids = pending.map(r => r.id).filter(Boolean) as string[];
  let paidIds = new Set<string>();
  if (ids.length > 0) {
    const { data: payments } = await supabase
      .from('payment_transactions')
      .select('client_request_id, payment_status')
      .in('client_request_id', ids)
      .ilike('payment_status', 'completed');
    paidIds = new Set(
      (payments ?? [])
        .map(p => p.client_request_id)
        .filter((id): id is string => !!id),
    );
  }

  const toCancel = pending.filter(r => r.id && !paidIds.has(r.id));
  if (toCancel.length === 0) return 0;

  const note = `[auto] Unpaid hold expired after ${UNPAID_HOLD_MINUTES} minutes — cancelled, slot released.`;
  let cancelled = 0;

  for (const row of toCancel) {
    const { data: existingRaw } = await supabase
      .from('client_requests')
      .select('notes, statusvalue, session_status')
      .eq('id', row.id)
      .maybeSingle();

    const existing = existingRaw as {
      notes?: string | null;
      statusvalue?: number | null;
      session_status?: number | null;
    } | null;

    const existingNotes = existing?.notes?.trim() || '';
    const update: Record<string, unknown> = {
      status: 'cancelled',
      statusvalue: CANCELED_NO_PAYMENT,
      notes: existingNotes ? `${existingNotes}\n${note}` : note,
    };
    // Keep session_status in sync when the column is present on the row.
    if (existing && existing.session_status !== undefined) {
      update.session_status = CANCELED_NO_PAYMENT;
    }

    const { error } = await supabase
      .from('client_requests')
      .update(update)
      .eq('id', row.id)
      .eq('status', 'pending');

    if (!error) cancelled += 1;
    else console.warn('expireUnpaidPendingRequests update:', error.message);
  }

  return cancelled;
}
