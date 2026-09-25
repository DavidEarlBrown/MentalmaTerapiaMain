/**
 * Side effects when a client changes an existing session request:
 * - Google Calendar / Meet invite refresh (especially on psychologist change)
 * - Zoho Books invoice correction
 */
import { supabase } from './supabaseClient';
import { createZohoBooksClient, refreshZohoAccessToken, isTokenError } from './zohoBooksClient';
import type { ClientRequest, ClientRequestFormData, Professional } from '../types';

export interface SessionChangeSyncResult {
  calendarUpdated: boolean;
  zohoUpdated: boolean;
  warnings: string[];
}

function buildScheduledDatetime(preferredDate: string, preferredTime?: string): string | null {
  if (!preferredDate) return null;
  if (preferredDate.includes('T')) {
    const dt = new Date(preferredDate);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  if (preferredTime) {
    const dt = new Date(`${preferredDate}T${preferredTime}`);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  return null;
}

async function cancelCalendarEvent(calendarEventId: string): Promise<void> {
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
}

async function createCalendarMeet(input: {
  request: ClientRequest;
  professional: Professional | null;
  language: string;
}): Promise<{ meetingUri: string; meetingCode: string; calendarEventId: string } | null> {
  const { request, professional, language } = input;
  if (!request.scheduled_datetime) return null;
  if (request.meeting_platform === 'manual') return null;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const professionalName = professional
    ? (language === 'es' ? professional.name_es : professional.name_en)
    : '';
  const specialties = language === 'es' ? professional?.specialties_es : professional?.specialties_en;
  const specialty = specialties && specialties.length > 0 ? specialties[0] : '';

  const response = await fetch(`${supabaseUrl}/functions/v1/google-meet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      Apikey: anonKey,
    },
    body: JSON.stringify({
      client_email: request.client_email,
      client_name: request.full_name || request.client_name || request.username,
      meeting_date: request.scheduled_datetime,
      professional_name: professionalName,
      professional_email: professional?.email || '',
      specialty,
      description: request.issue,
      platform: 'google',
    }),
  });

  if (!response.ok) return null;
  const result = await response.json();
  if (!result.success) return null;

  return {
    meetingUri: result.meetingUri as string,
    meetingCode: (result.meetingCode || '') as string,
    calendarEventId: (result.calendarEventId || '') as string,
  };
}

async function correctZohoInvoice(input: {
  request: ClientRequest;
  professional: Professional | null;
  language: string;
  original: ClientRequest;
}): Promise<{ updated: boolean; warning?: string }> {
  const { request, professional, language, original } = input;
  if (!request.id) return { updated: false };

  const accountingChanged =
    original.professional_id !== request.professional_id
    || String(original.price_amount ?? '') !== String(request.price_amount ?? '')
    || String(original.price_currency ?? '') !== String(request.price_currency ?? '')
    || String(original.preferred_date ?? '') !== String(request.preferred_date ?? '')
    || String(original.preferred_time ?? '') !== String(request.preferred_time ?? '')
    || (original.num_sessions ?? 1) !== (request.num_sessions ?? 1);

  if (!accountingChanged) return { updated: false };

  const { data: payments } = await supabase
    .from('payment_transactions')
    .select('id, zoho_invoice_id, payment_status, payment_amount, payment_currency')
    .eq('client_request_id', request.id)
    .order('payment_date', { ascending: false })
    .limit(5);

  const paidTxn = (payments ?? []).find(
    (p) => {
      const status = String(p.payment_status ?? '').toLowerCase();
      return status === 'completed' || status === 'paid';
    },
  );
  const invoiceId = paidTxn?.zoho_invoice_id
    || (payments ?? []).find((p) => p.zoho_invoice_id)?.zoho_invoice_id;

  if (!invoiceId) {
    return {
      updated: false,
      warning: language === 'es'
        ? 'No se encontró factura Zoho vinculada para corregir.'
        : 'No linked Zoho invoice found to correct.',
    };
  }

  let zoho = createZohoBooksClient();
  if (!zoho) {
    return {
      updated: false,
      warning: language === 'es'
        ? 'Zoho Books no está configurado.'
        : 'Zoho Books is not configured.',
    };
  }

  const professionalName = professional
    ? (language === 'es' ? professional.name_es : professional.name_en)
    : 'Professional';
  const sessionDateStr = request.scheduled_datetime || request.preferred_date || '';
  const sessionDate = sessionDateStr ? new Date(sessionDateStr).toLocaleDateString() : '';
  const rate = parseFloat(String(request.price_amount ?? '0').replace(/[^0-9.-]/g, '')) || 0;
  const changeNote = language === 'es'
    ? `Sesión actualizada: profesional ${professionalName}, fecha ${sessionDate}.`
    : `Session updated: professional ${professionalName}, date ${sessionDate}.`;

  const lineItems = [
    {
      name: language === 'es' ? 'Sesion de Terapia' : 'Therapy Session',
      description: language === 'es'
        ? `Sesion de terapia con ${professionalName}${sessionDate ? ` - ${sessionDate}` : ''}\n${request.num_sessions || 1} sesion(es)\n${changeNote}`
        : `Therapy session with ${professionalName}${sessionDate ? ` - ${sessionDate}` : ''}\n${request.num_sessions || 1} session(s)\n${changeNote}`,
      rate,
      quantity: 1,
    },
  ];

  const tryUpdate = async () => {
    const invoiceResp = await zoho!.getInvoice(invoiceId);
    const invoice = invoiceResp.invoice;
    const balance = Number(invoice?.balance ?? 0);
    const status = String(invoice?.status ?? '').toLowerCase();
    const isPaid = balance <= 0 || status === 'paid';

    if (isPaid) {
      // Paid invoices: append correction note; create a replacement invoice for the new details.
      const priorNotes = (invoice as { notes?: string } | undefined)?.notes || '';
      await zoho!.updateInvoice(invoiceId, {
        notes: `${priorNotes}\n${changeNote}`.trim(),
        reason: changeNote,
      });

      const created = await zoho!.createInvoice({
        customerName: request.full_name || request.client_name || request.username || 'Client',
        customerEmail: request.client_email,
        customerPhone: request.client_phone,
        invoiceDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        currencyCode: request.price_currency || invoice?.currency_code || 'USD',
        lineItems,
        notes: changeNote,
        terms: language === 'es'
          ? 'Factura de corrección por cambio de sesión.'
          : 'Correction invoice for session change.',
        referenceNumber: `REQ-${request.id}-CHG`,
      });

      const newInvoiceId = created.invoice?.invoice_id;
      if (newInvoiceId && paidTxn?.id) {
        await supabase
          .from('payment_transactions')
          .update({ zoho_invoice_id: newInvoiceId })
          .eq('id', paidTxn.id);
      }

      if (newInvoiceId) {
        try {
          await zoho!.sendInvoice(
            newInvoiceId,
            [request.client_email],
            {
              ccEmails: professional?.email ? [professional.email] : [],
              subject: language === 'es'
                ? `Factura actualizada por cambio de sesión`
                : `Updated invoice for session change`,
            },
          );
        } catch (emailErr) {
          console.warn('Could not email corrected Zoho invoice:', emailErr);
        }
      }

      return true;
    }

    // Unpaid: update in place; if Zoho rejects, void and recreate.
    let targetInvoiceId = invoiceId;
    try {
      await zoho!.updateInvoice(invoiceId, {
        line_items: lineItems,
        notes: changeNote,
        currency_code: request.price_currency || invoice?.currency_code || 'USD',
        reference_number: `REQ-${request.id}`,
        reason: changeNote,
      });
    } catch (updateErr) {
      console.warn('Zoho invoice update failed; voiding and recreating:', updateErr);
      try {
        await zoho!.voidInvoice(invoiceId, changeNote);
      } catch (voidErr) {
        console.warn('Zoho void failed:', voidErr);
      }
      const created = await zoho!.createInvoice({
        customerName: request.full_name || request.client_name || request.username || 'Client',
        customerEmail: request.client_email,
        customerPhone: request.client_phone,
        invoiceDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        currencyCode: request.price_currency || invoice?.currency_code || 'USD',
        lineItems,
        notes: changeNote,
        terms: language === 'es'
          ? 'Factura actualizada por cambio de sesión.'
          : 'Invoice updated for session change.',
        referenceNumber: `REQ-${request.id}-CHG`,
      });
      targetInvoiceId = created.invoice?.invoice_id || invoiceId;
      if (created.invoice?.invoice_id && paidTxn?.id) {
        await supabase
          .from('payment_transactions')
          .update({ zoho_invoice_id: created.invoice.invoice_id })
          .eq('id', paidTxn.id);
      }
    }

    try {
      await zoho!.sendInvoice(
        targetInvoiceId,
        [request.client_email],
        {
          ccEmails: professional?.email ? [professional.email] : [],
          subject: language === 'es'
            ? `Factura actualizada por cambio de sesión`
            : `Updated invoice for session change`,
        },
      );
    } catch (emailErr) {
      console.warn('Could not re-send updated Zoho invoice:', emailErr);
    }

    return true;
  };

  try {
    await tryUpdate();
    return { updated: true };
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err ?? '');
    if (isTokenError(errMessage)) {
      const newToken = await refreshZohoAccessToken();
      if (newToken) {
        zoho = createZohoBooksClient();
        if (zoho) {
          try {
            await tryUpdate();
            return { updated: true };
          } catch (retryErr) {
            console.error('Zoho correction retry failed:', retryErr);
          }
        }
      }
    }
    console.error('Zoho correction failed:', err);
    return {
      updated: false,
      warning: language === 'es'
        ? `No se pudo corregir Zoho Books: ${errMessage || 'error'}`
        : `Could not correct Zoho Books: ${errMessage || 'error'}`,
    };
  }
}

/** Persist form edits onto an existing client_request and sync calendar/Zoho. */
export async function applyClientRequestChanges(input: {
  requestId: string;
  formData: ClientRequestFormData;
  original: ClientRequest;
  professional: Professional | null;
  language: string;
}): Promise<{ updated: ClientRequest; sync: SessionChangeSyncResult }> {
  const { requestId, formData, original, professional, language } = input;
  const warnings: string[] = [];

  const preferredDate = formData.preferred_date.includes('T')
    ? formData.preferred_date.split('T')[0]
    : formData.preferred_date;
  const scheduledDatetime = buildScheduledDatetime(preferredDate, formData.preferred_time);

  const updatePayload: Record<string, unknown> = {
    username: formData.username,
    full_name: formData.full_name || formData.client_name || '',
    client_name: formData.client_name,
    client_email: formData.client_email,
    client_phone: formData.client_phone || '',
    issue: formData.issue,
    preferred_date: preferredDate,
    preferred_time: formData.preferred_time || null,
    time_zone: formData.time_zone || 'America/Bogota',
    session_length: formData.session_length || 1,
    professional_id: formData.professional_id,
    specialty_id: formData.specialty_id || null,
    counseling_type_id: formData.counseling_type_id || null,
    session_price_id: formData.session_price_id ?? null,
    price_amount: formData.price_amount || null,
    price_currency: formData.price_currency || null,
    num_sessions: Math.max(1, formData.num_sessions ?? 1),
    session_no: formData.session_no ?? 1,
    TimeSlotId: formData.TimeSlotId || null,
    statusvalue: formData.statusvalue ?? formData.session_status ?? original.statusvalue ?? 0,
    session_status: formData.statusvalue ?? formData.session_status ?? original.session_status ?? 0,
  };

  if (scheduledDatetime) {
    updatePayload.scheduled_datetime = scheduledDatetime;
  }

  const professionalChanged = original.professional_id !== formData.professional_id;
  const scheduleChanged =
    String(original.preferred_date ?? '').split('T')[0] !== preferredDate
    || String(original.preferred_time ?? '') !== String(formData.preferred_time ?? '')
    || String(original.time_zone ?? '') !== String(formData.time_zone ?? '');

  const needsCalendarRefresh =
    (professionalChanged || scheduleChanged)
    && (Boolean(original.calendar_event_id) || Boolean(scheduledDatetime));

  // Cancel previous invite before writing new meet details.
  if (needsCalendarRefresh && original.calendar_event_id) {
    try {
      await cancelCalendarEvent(original.calendar_event_id);
    } catch (err) {
      console.warn('Could not cancel previous calendar event:', err);
      warnings.push(
        language === 'es'
          ? 'No se pudo cancelar la invitación de calendario anterior.'
          : 'Could not cancel the previous calendar invite.',
      );
    }
  }

  const { data: updatedRow, error } = await supabase
    .from('client_requests')
    .update(updatePayload)
    .eq('id', requestId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  let updated = updatedRow as ClientRequest;

  // Keep sessions row in sync when linked by TimeSlotId (old or new).
  const slotIds = [original.TimeSlotId, formData.TimeSlotId].filter(Boolean) as string[];
  if (slotIds.length > 0 || updated.client_email) {
    const sessionUpdate: Record<string, unknown> = {
      professional_id: formData.professional_id,
      client_email: formData.client_email,
      client_name: formData.client_name || formData.full_name,
      notes: formData.issue,
    };
    if (scheduledDatetime) {
      sessionUpdate.session_date = scheduledDatetime;
    }
    if (formData.session_length) {
      sessionUpdate.duration_minutes = Math.round(formData.session_length * 60);
      sessionUpdate.session_length = formData.session_length;
    }
    if (formData.num_sessions) {
      sessionUpdate.num_sessions = formData.num_sessions;
      sessionUpdate.session_no = formData.session_no ?? 1;
    }

    if (formData.TimeSlotId) {
      await supabase.from('sessions').update(sessionUpdate).eq('TimeSlotId', formData.TimeSlotId);
    }
    if (original.TimeSlotId && original.TimeSlotId !== formData.TimeSlotId) {
      await supabase
        .from('sessions')
        .update({ ...sessionUpdate, status: 'rescheduled' })
        .eq('TimeSlotId', original.TimeSlotId);
    }
  }

  let calendarUpdated = false;
  if (needsCalendarRefresh && scheduledDatetime && updated.meeting_platform !== 'manual') {
    try {
      const meet = await createCalendarMeet({
        request: { ...updated, scheduled_datetime: scheduledDatetime },
        professional,
        language,
      });
      if (meet) {
        const meetUpdate = {
          meeting_uri: meet.meetingUri,
          meeting_code: meet.meetingCode,
          meeting_platform: 'google_meet',
          calendar_event_id: meet.calendarEventId || null,
        };
        const { data: withMeet } = await supabase
          .from('client_requests')
          .update(meetUpdate)
          .eq('id', requestId)
          .select('*')
          .single();
        if (withMeet) updated = withMeet as ClientRequest;

        if (formData.TimeSlotId) {
          await supabase
            .from('sessions')
            .update({
              online_meeting_id: meet.meetingUri,
              online_meeting_url: meet.meetingUri,
              online_platform: 'GoogleMeet',
            })
            .eq('TimeSlotId', formData.TimeSlotId);
        }
        calendarUpdated = true;
      } else {
        warnings.push(
          language === 'es'
            ? 'No se pudo crear la nueva invitación de Google Meet/calendario.'
            : 'Could not create the new Google Meet/calendar invite.',
        );
      }
    } catch (err) {
      console.error('Calendar/Meet refresh failed:', err);
      warnings.push(
        language === 'es'
          ? 'Error al actualizar Google Meet/calendario.'
          : 'Error updating Google Meet/calendar.',
      );
    }
  }

  const zohoResult = await correctZohoInvoice({
    request: updated,
    professional,
    language,
    original,
  });
  if (zohoResult.warning) warnings.push(zohoResult.warning);

  return {
    updated,
    sync: {
      calendarUpdated,
      zohoUpdated: zohoResult.updated,
      warnings,
    },
  };
}
