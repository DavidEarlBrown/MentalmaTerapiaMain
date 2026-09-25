import { supabase } from './supabaseClient';
import { buildClientRequestStatusUpdate, getClientRequestStatusValue } from './sessionStatus';
import type { ClientRequest, Session } from '../types';

/** Lifecycle status: Canceled no payment. */
export const CANCELED_NO_PAYMENT = 2 as const;

export function isUnpaidPendingRequest(request: ClientRequest | null | undefined): boolean {
  if (!request?.id) return false;
  if (getClientRequestStatusValue(request) !== 0) return false;
  const status = (request.status || 'pending').toLowerCase();
  return status === 'pending' || status === '';
}

export function isUnpaidPendingAppointment(session: Session | null | undefined): boolean {
  if (!session) return false;
  const st = (session.status || '').toLowerCase();
  if (st === 'cancelled' || st === 'canceled' || st === 'completed') return false;
  const pay = (session.payment_status || '').toLowerCase();
  return pay !== 'paid' && pay !== 'completed';
}

function hasOwnColumn(request: ClientRequest, column: string): boolean {
  return Object.prototype.hasOwnProperty.call(request, column);
}

function buildCanceledNoPaymentPayload(request: ClientRequest, cancelNote: string): Record<string, unknown> {
  const existing = request.notes?.trim() || '';
  const payload: Record<string, unknown> = {
    ...buildClientRequestStatusUpdate(request, CANCELED_NO_PAYMENT),
    status: 'cancelled',
    notes: existing ? `${existing}\n${cancelNote}` : cancelNote,
  };
  // Only write session_status when the loaded row actually has that column.
  if (hasOwnColumn(request, 'session_status') && !('session_status' in payload)) {
    payload.session_status = CANCELED_NO_PAYMENT;
  }
  return payload;
}

function isUnknownColumnError(message: string, column: string): boolean {
  return new RegExp(`\\b${column}\\b`, 'i').test(message)
    && /could not find|schema cache|column/i.test(message);
}

async function updateClientRequestViaApi(
  requestId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const response = await fetch(`${supabaseUrl}/functions/v1/api/admin/row/client_requests/${requestId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `API update failed (${response.status})`;
    try {
      const json = await response.json() as { error?: string };
      if (json?.error) message = json.error;
    } catch {
      // keep status message
    }
    throw new Error(message);
  }
}

async function persistClientRequestUpdate(
  requestId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const attempt = async (body: Record<string, unknown>): Promise<{ ok: boolean; message: string }> => {
    const { data, error } = await supabase
      .from('client_requests')
      .update(body)
      .eq('id', requestId)
      .select('id')
      .maybeSingle();

    if (!error && data?.id) return { ok: true, message: '' };

    const message = error?.message || 'Update did not apply';

    try {
      await updateClientRequestViaApi(requestId, body);
      return { ok: true, message: '' };
    } catch (apiErr) {
      const apiMessage = apiErr instanceof Error ? apiErr.message : message;
      return { ok: false, message: apiMessage || message };
    }
  };

  let body = { ...payload };
  let result = await attempt(body);
  if (result.ok) return;

  if (isUnknownColumnError(result.message, 'session_status') && 'session_status' in body) {
    const { session_status: _ignored, ...rest } = body;
    body = rest;
    result = await attempt(body);
    if (result.ok) return;
  }

  if (isUnknownColumnError(result.message, 'statusvalue') && 'statusvalue' in body) {
    const { statusvalue: _ignored, ...rest } = body;
    body = rest;
    result = await attempt(body);
    if (result.ok) return;
  }

  throw new Error(result.message);
}

async function cancelCalendarEvent(calendarEventId: string | null | undefined): Promise<void> {
  if (!calendarEventId) return;
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    await fetch(`${supabaseUrl}/functions/v1/google-meet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        Apikey: anonKey,
      },
      body: JSON.stringify({
        action: 'cancel-event',
        calendar_event_id: calendarEventId,
      }),
    });
  } catch (err) {
    console.warn('Could not cancel Google Calendar event:', err);
  }
}

async function bestEffortCancelSessions(params: {
  session?: Session | null;
  request?: ClientRequest | null;
}): Promise<void> {
  const { session, request } = params;
  try {
    if (session?.id) {
      await supabase
        .from('sessions')
        .update({
          status: 'cancelled',
          online_meeting_id: null,
          online_meeting_url: null,
          online_platform: null,
        })
        .eq('id', session.id);
      return;
    }
    if (request?.TimeSlotId) {
      await supabase
        .from('sessions')
        .update({ status: 'cancelled' })
        .eq('TimeSlotId', request.TimeSlotId);
      return;
    }
    if (request?.client_email && request.preferred_date) {
      const day = request.preferred_date.split('T')[0];
      await supabase
        .from('sessions')
        .update({ status: 'cancelled' })
        .eq('client_email', request.client_email)
        .gte('session_date', `${day}T00:00:00`)
        .lte('session_date', `${day}T23:59:59.999`);
    }
  } catch (err) {
    console.warn('Could not update matching sessions row:', err);
  }
}

/**
 * Soft-cancel an unpaid pending session: keep the row, set status to
 * Canceled no payment (2). Does not physically delete.
 */
export async function markCanceledNoPayment(params: {
  request?: ClientRequest | null;
  session?: Session | null;
  note?: string;
}): Promise<void> {
  const { request, session, note } = params;
  const cancelNote = note || 'Canceled no payment.';

  if (request?.id) {
    if (getClientRequestStatusValue(request) === 1) {
      throw new Error('This session has a payment and cannot be marked Canceled no payment.');
    }

    await persistClientRequestUpdate(request.id, buildCanceledNoPaymentPayload(request, cancelNote));

    if (request.calendar_event_id) {
      await cancelCalendarEvent(request.calendar_event_id);
      try {
        await supabase
          .from('client_requests')
          .update({ calendar_event_id: null, meeting_uri: null, meeting_code: null })
          .eq('id', request.id);
      } catch (err) {
        console.warn('Could not clear calendar fields:', err);
      }
    }
  }

  await bestEffortCancelSessions({ session, request });
}
