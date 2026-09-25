import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabaseClient';
import { evaluateRefundEligibility } from '../lib/cancelSessionRefundRules';
import {
  buildCancellationNote,
  CANCEL_SESSION_NOTICE_HOURS,
  filterRemainingPackageSessions,
  formatClientRequestScheduleDisplay,
  formatClientRequestScheduleCompact,
  isCancellableSessionStatus,
  isOnTimeCancellation,
  resolveStatusAfterCancel,
  type CancelDisposition,
  type ClientRequestTimeSlotInfo,
} from '../lib/cancelSessionPolicy';
import {
  buildClientRequestStatusUpdate,
  getClientRequestStatusValue,
  getSessionStatusFilterLabel,
} from '../lib/sessionStatus';
import type { ClientRequest, Professional, SessionPrice, UserFormData } from '../types';
import { fetchSessionPrices } from '../lib/api';
import { postZohoRefundCredit } from '../lib/zohoCancelRefund';

interface CancelSessionPanelProps {
  currentUser?: UserFormData | null;
  initialRequestId?: string | null;
  onClose: () => void;
  onCompleted?: () => void;
}

type CancelScope = 'single' | 'remaining';

function getClientDisplayName(request: ClientRequest): string {
  return request.client_name?.trim()
    || request.full_name?.trim()
    || request.username?.trim()
    || request.client_email?.trim()
    || '—';
}

function getProfessionalDisplayName(
  professional: Professional | undefined,
  language: string,
): string {
  if (!professional) return '—';
  return language === 'es'
    ? professional.name_es || professional.name_en
    : professional.name_en || professional.name_es;
}

export function CancelSessionPanel({
  currentUser,
  initialRequestId,
  onClose,
  onCompleted,
}: CancelSessionPanelProps) {
  const { language } = useLanguage();
  const label = (en: string, es: string) => (language === 'es' ? es : en);

  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [selectedId, setSelectedId] = useState(initialRequestId || '');
  const [cancelScope, setCancelScope] = useState<CancelScope>('single');
  const [disposition, setDisposition] = useState<CancelDisposition>('credit');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [completedSiblingCount, setCompletedSiblingCount] = useState<number | null>(null);
  const [sessionPrices, setSessionPrices] = useState<SessionPrice[]>([]);
  const [timeSlotMap, setTimeSlotMap] = useState<Map<string, ClientRequestTimeSlotInfo>>(new Map());
  const [professionalMap, setProfessionalMap] = useState<Map<string, Professional>>(new Map());
  const [paidRequestIds, setPaidRequestIds] = useState<Set<string>>(new Set());
  const [confirmCalendarMeet, setConfirmCalendarMeet] = useState(false);

  const loadTimeSlots = useCallback(async (rows: ClientRequest[]) => {
    const slotIds = [...new Set(rows.map(row => row.TimeSlotId).filter(Boolean) as string[])];
    if (slotIds.length === 0) {
      setTimeSlotMap(new Map());
      return;
    }

    try {
      const { data, error: slotError } = await supabase
        .from('available_slots')
        .select('id, start_time, end_time')
        .in('id', slotIds);

      if (slotError) throw slotError;

      const nextMap = new Map<string, ClientRequestTimeSlotInfo>();
      for (const slot of data ?? []) {
        if (slot.id) {
          nextMap.set(slot.id, slot as ClientRequestTimeSlotInfo);
        }
      }
      setTimeSlotMap(nextMap);
    } catch (err) {
      console.error('Error loading time slots:', err);
      setTimeSlotMap(new Map());
    }
  }, []);

  const loadProfessionals = useCallback(async (rows: ClientRequest[]) => {
    const professionalIds = [...new Set(rows.map(row => row.professional_id).filter(Boolean))];
    if (professionalIds.length === 0) {
      setProfessionalMap(new Map());
      return;
    }

    try {
      const { data, error: professionalError } = await supabase
        .from('professionals')
        .select('id, name_en, name_es')
        .in('id', professionalIds);

      if (professionalError) throw professionalError;

      const nextMap = new Map<string, Professional>();
      for (const professional of (data ?? []) as Professional[]) {
        if (professional.id) {
          nextMap.set(professional.id, professional);
        }
      }
      setProfessionalMap(nextMap);
    } catch (err) {
      console.error('Error loading professionals:', err);
      setProfessionalMap(new Map());
    }
  }, []);

  const getRequestSlot = useCallback(
    (request: ClientRequest | null | undefined) =>
      request?.TimeSlotId ? timeSlotMap.get(request.TimeSlotId) : undefined,
    [timeSlotMap],
  );

  const loadRequests = useCallback(async () => {
    if (!currentUser?.id && !currentUser?.email) {
      setRequests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('client_requests')
        .select('*')
        .order('preferred_date', { ascending: true });

      if (currentUser?.id) {
        query = query.eq('user_id', currentUser.id);
      } else if (currentUser?.email) {
        query = query.eq('client_email', currentUser.email);
      }

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      const rows = ((data ?? []) as ClientRequest[]).filter(req =>
        isCancellableSessionStatus(getClientRequestStatusValue(req)),
      );
      setRequests(rows);

      const requestIds = rows.map(r => r.id).filter(Boolean) as string[];
      const paidIds = new Set<string>(
        rows.filter(r => getClientRequestStatusValue(r) === 1 && r.id).map(r => r.id!),
      );
      if (requestIds.length > 0) {
        const { data: payments } = await supabase
          .from('payment_transactions')
          .select('client_request_id, payment_status')
          .in('client_request_id', requestIds);
        for (const payment of payments ?? []) {
          const status = String(payment.payment_status ?? '').toLowerCase();
          if (payment.client_request_id && (status === 'completed' || status === 'paid')) {
            paidIds.add(payment.client_request_id);
          }
        }
      }
      setPaidRequestIds(paidIds);

      await Promise.all([loadTimeSlots(rows), loadProfessionals(rows)]);
    } catch (err) {
      console.error('Error loading cancellable sessions:', err);
      setError(label('Failed to load sessions.', 'Error al cargar sesiones.'));
      setRequests([]);
      setPaidRequestIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [currentUser?.email, currentUser?.id, language, loadProfessionals, loadTimeSlots]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    fetchSessionPrices()
      .then(setSessionPrices)
      .catch(() => setSessionPrices([]));
  }, []);

  useEffect(() => {
    if (initialRequestId && requests.some(r => r.id === initialRequestId)) {
      setSelectedId(initialRequestId);
    } else if (requests.length > 0 && requests[0].id) {
      setSelectedId(prev => (prev && requests.some(r => r.id === prev) ? prev : requests[0].id!));
    }
  }, [initialRequestId, requests]);

  const selectedRequest = useMemo(
    () => requests.find(r => r.id === selectedId) ?? null,
    [requests, selectedId],
  );

  const selectedSlot = useMemo(
    () => getRequestSlot(selectedRequest),
    [getRequestSlot, selectedRequest],
  );

  const scheduleDisplay = useMemo(
    () => (selectedRequest ? formatClientRequestScheduleDisplay(selectedRequest, language, selectedSlot) : null),
    [language, selectedRequest, selectedSlot],
  );

  const selectedProfessional = useMemo(
    () => (selectedRequest?.professional_id
      ? professionalMap.get(selectedRequest.professional_id)
      : undefined),
    [professionalMap, selectedRequest?.professional_id],
  );

  const clientDisplayName = selectedRequest ? getClientDisplayName(selectedRequest) : '—';
  const professionalDisplayName = getProfessionalDisplayName(selectedProfessional, language);

  // ── Balance calculation ──────────────────────────────────────────────────────
  // Finds the single-session rate from the price catalog (NumSessions === 1)
  // for the same professional as the selected request.
  // Falls back to pro-rata (package price ÷ package size) when no single price exists.
  const balanceInfo = useMemo(() => {
    if (!selectedRequest) return null;
    const parsedTotal = parseFloat(String(selectedRequest.price_amount ?? '0').replace(/[^0-9.-]/g, ''));
    if (!parsedTotal || parsedTotal <= 0) return null;

    const currency = selectedRequest.price_currency || 'USD';
    const packageSize = Math.max(1, selectedRequest.num_sessions ?? 1);
    const usedCount = completedSiblingCount ?? 0;

    // Find single-session price: prefer matching professional, then any single-session price
    const singlePrices = sessionPrices.filter(p => p.NumSessions === 1);
    const matchedSingle = singlePrices.find(p => p.professional_id === selectedRequest.professional_id)
      ?? singlePrices[0];
    const singleRate = matchedSingle
      ? parseFloat(String(matchedSingle.Price).replace(/[^0-9.-]/g, ''))
      : parsedTotal / packageSize; // pro-rata fallback

    const usedValue = usedCount * singleRate;
    const balance = Math.max(0, parsedTotal - usedValue);

    return {
      totalPaid: parsedTotal,
      currency,
      packageSize,
      usedCount,
      singleRate,
      singleRateSource: matchedSingle ? matchedSingle.Name : label('pro-rata', 'prorrateo'),
      usedValue,
      balance,
      isFull: usedCount === 0,
    };
  }, [selectedRequest, completedSiblingCount, sessionPrices, language]);

  const isPackage = Math.max(1, selectedRequest?.num_sessions ?? 1) > 1;
  const onTime = selectedRequest ? isOnTimeCancellation(selectedRequest, Date.now(), selectedSlot) : false;
  const wasPaid = selectedRequest
    ? getClientRequestStatusValue(selectedRequest) === 1
      || (!!selectedRequest.id && paidRequestIds.has(selectedRequest.id))
    : false;

  const remainingPackageSessions = useMemo(() => {
    if (!selectedRequest) return [];
    return filterRemainingPackageSessions(requests, selectedRequest);
  }, [requests, selectedRequest]);

  const sessionsToCancel = useMemo(() => {
    if (!selectedRequest) return [];
    if (cancelScope === 'remaining' && isPackage) {
      return remainingPackageSessions;
    }
    return [selectedRequest];
  }, [cancelScope, isPackage, remainingPackageSessions, selectedRequest]);

  const refundEligibility = useMemo(() => {
    if (!selectedRequest) {
      return { eligible: false, eligibleAmount: 0, currency: 'USD', reason: '', reasonCode: 'unpaid' as const };
    }
    return evaluateRefundEligibility({
      request: selectedRequest,
      cancelAllRemaining: cancelScope === 'remaining' && isPackage,
      onTime,
      sessionsToCancel: sessionsToCancel.length,
      wasPaid,
      executedPackageSessions: isPackage ? (completedSiblingCount ?? 0) : 0,
    });
  }, [cancelScope, completedSiblingCount, isPackage, onTime, selectedRequest, sessionsToCancel.length, wasPaid]);

  useEffect(() => {
    if (!wasPaid) {
      setDisposition('credit');
      return;
    }
    if (disposition === 'refund' && !refundEligibility.eligible) {
      setDisposition('credit');
    }
  }, [disposition, refundEligibility.eligible, wasPaid, selectedId]);

  useEffect(() => {
    setConfirmCalendarMeet(false);
  }, [selectedId, refundEligibility.eligible]);

  useEffect(() => {
    if (!isPackage) setCancelScope('single');
  }, [isPackage, selectedId]);

  // For package requests, count how many sibling sessions are already completed
  useEffect(() => {
    if (!selectedRequest || !isPackage) {
      setCompletedSiblingCount(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        let q = supabase
          .from('client_requests')
          .select('id, statusvalue, session_status', { count: 'exact' })
          .eq('num_sessions', selectedRequest.num_sessions ?? 1);

        if (selectedRequest.session_price_id != null) {
          q = q.eq('session_price_id', selectedRequest.session_price_id);
        }
        if (currentUser?.id) {
          q = q.eq('user_id', currentUser.id);
        } else if (currentUser?.email) {
          q = q.eq('client_email', currentUser.email);
        }

        const { data } = await q;
        if (!active) return;

        const completed = (data ?? []).filter(
          (r: { statusvalue?: number | null; session_status?: number }) =>
            (r.statusvalue ?? r.session_status) === 5,
        ).length;
        setCompletedSiblingCount(completed);
      } catch {
        setCompletedSiblingCount(null);
      }
    })();
    return () => { active = false; };
  }, [selectedRequest?.id, isPackage, currentUser?.id, currentUser?.email]);

  const formatSessionLabel = (req: ClientRequest) => {
    const slot = req.TimeSlotId ? timeSlotMap.get(req.TimeSlotId) : undefined;
    const schedule = formatClientRequestScheduleCompact(req, language, slot);
    const clientName = getClientDisplayName(req);
    const professional = req.professional_id ? professionalMap.get(req.professional_id) : undefined;
    const professionalName = getProfessionalDisplayName(professional, language);
    const status = getSessionStatusFilterLabel(getClientRequestStatusValue(req), language);
    const sessionNo = req.session_no ?? 1;
    const packageSize = req.num_sessions ?? 1;
    const pkg = packageSize > 1 ? ` (${sessionNo}/${packageSize})` : '';
    return `${clientName} · ${professionalName} · ${schedule}${pkg} — ${status}`;
  };

  const handleConfirmCancel = async () => {
    if (!selectedRequest || sessionsToCancel.length === 0) return;
    if (wasPaid && !refundEligibility.eligible && !confirmCalendarMeet) {
      setError(
        label(
          'Confirm that you want to cancel the calendar event and Google Meet without a refund or Zoho credit.',
          'Confirme que desea cancelar el evento de calendario y Google Meet sin reembolso ni crédito Zoho.',
        ),
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const note = buildCancellationNote(
        onTime,
        disposition,
        cancelScope === 'remaining' && isPackage,
        sessionsToCancel.length,
        language,
        refundEligibility.eligible,
      );

      const executedCount = isPackage ? (completedSiblingCount ?? 0) : 0;

      for (const req of sessionsToCancel) {
        if (!req.id) continue;
        const paid =
          getClientRequestStatusValue(req) === 1
          || paidRequestIds.has(req.id);
        const reqSlot = getRequestSlot(req);
        const reqOnTime = isOnTimeCancellation(req, Date.now(), reqSlot);
        const reqRefund = evaluateRefundEligibility({
          request: req,
          cancelAllRemaining: false,
          onTime: reqOnTime,
          sessionsToCancel: 1,
          wasPaid: paid,
          executedPackageSessions: executedCount,
        });
        const newStatus = resolveStatusAfterCancel(
          paid,
          disposition,
          reqRefund.eligible,
        );
        const statusUpdate = buildClientRequestStatusUpdate(req, newStatus);
        const existingNotes = req.notes?.trim() || '';
        const combinedNotes = existingNotes ? `${existingNotes}\n${note}` : note;

        const updatePayload: Record<string, unknown> = {
          ...statusUpdate,
          notes: combinedNotes,
        };
        // Free soft-reserved slot when canceling (unpaid / paid cancel / refund)
        if (newStatus === 2 || newStatus === 3 || newStatus === 4) {
          updatePayload.status = 'cancelled';
        }

        const { error: updateError } = await supabase
          .from('client_requests')
          .update(updatePayload)
          .eq('id', req.id);

        if (updateError) throw updateError;

        // Cancel the Google Calendar / Meet event if one exists
        if (req.calendar_event_id) {
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
                calendar_event_id: req.calendar_event_id,
              }),
            });
            // Clear meeting fields in client_requests
            await supabase
              .from('client_requests')
              .update({ calendar_event_id: null, meeting_uri: null, meeting_code: null })
              .eq('id', req.id);
          } catch (calErr) {
            console.warn('Could not cancel Google Calendar event:', calErr);
          }
        }

        // Update sessions table: cancel status and clear meeting fields
        if (req.TimeSlotId) {
          await supabase
            .from('sessions')
            .update({ status: 'cancelled', online_meeting_id: null, online_meeting_url: null, online_platform: null })
            .eq('TimeSlotId', req.TimeSlotId);
        }
      }

      let zohoNote = '';
      if (disposition === 'refund' && wasPaid && refundEligibility.eligible && selectedRequest) {
        const creditAmount = balanceInfo?.balance && balanceInfo.balance > 0
          ? balanceInfo.balance
          : refundEligibility.eligibleAmount;
        if (creditAmount > 0) {
        const zoho = await postZohoRefundCredit({
          request: selectedRequest,
          amount: creditAmount,
          currency: balanceInfo?.currency || refundEligibility.currency || selectedRequest.price_currency,
          language,
        });
        if (zoho.posted) {
          zohoNote = language === 'es'
            ? ` Crédito Zoho ${zoho.creditNoteNumber || zoho.creditNoteId} por ${zoho.amount?.toFixed(2)}.`
            : ` Zoho credit ${zoho.creditNoteNumber || zoho.creditNoteId} for ${zoho.amount?.toFixed(2)}.`;
        } else if (zoho.warning) {
          zohoNote = ` ${zoho.warning}`;
        }
        }
      }

      setSuccess(
        label(
          `Canceled ${sessionsToCancel.length} session(s) successfully.${zohoNote}`,
          `Se canceló ${sessionsToCancel.length} sesión(es) correctamente.${zohoNote}`,
        ),
      );
      onCompleted?.();
      await loadRequests();
    } catch (err) {
      console.error('Error canceling session:', err);
      setError(label('Failed to cancel session.', 'Error al cancelar la sesión.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentUser) {
    return (
      <section className="section cancel-session-panel">
        <p>{label('Please sign in to cancel a session.', 'Inicie sesión para cancelar una sesión.')}</p>
        <button type="button" className="cancel-session-back-btn" onClick={onClose}>
          {label('Back', 'Volver')}
        </button>
      </section>
    );
  }

  return (
    <section className="section cancel-session-panel">
      <div className="cancel-session-header">
        <div>
          <h2>{label('Cancel Session', 'Cancelar Sesión')}</h2>
          <p className="section-subtitle">
            {label(
              `Refunds require at least ${CANCEL_SESSION_NOTICE_HOURS} hours’ notice. No refund is allowed for a package once any session has been completed.`,
              `Los reembolsos requieren al menos ${CANCEL_SESSION_NOTICE_HOURS} horas de aviso. No hay reembolso de un paquete una vez que se haya completado alguna sesión.`,
            )}
          </p>
        </div>
        <button type="button" className="cancel-session-back-btn" onClick={onClose}>
          {label('Back', 'Volver')}
        </button>
      </div>

      {loading ? (
        <p>{label('Loading sessions...', 'Cargando sesiones...')}</p>
      ) : requests.length === 0 ? (
        <p className="cancel-session-empty">
          {label('No sessions available to cancel.', 'No hay sesiones disponibles para cancelar.')}
        </p>
      ) : (
        <>
          <div className="cancel-session-field">
            <label htmlFor="cancel-session-select">{label('Select session', 'Seleccionar sesión')}</label>
            <select
              id="cancel-session-select"
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
            >
              {requests.map(req => (
                <option key={req.id} value={req.id}>
                  {formatSessionLabel(req)}
                </option>
              ))}
            </select>
          </div>

          {selectedRequest && (
            <>
              <div className="cancel-session-schedule">
                <h3 className="cancel-session-schedule-title">
                  {label('Scheduled session', 'Sesión programada')}
                </h3>
                <dl className="cancel-session-schedule-details">
                  <div>
                    <dt>{label('Client', 'Cliente')}</dt>
                    <dd>{clientDisplayName}</dd>
                  </div>
                  <div>
                    <dt>{label('Professional', 'Profesional')}</dt>
                    <dd>{professionalDisplayName}</dd>
                  </div>
                  {scheduleDisplay && (
                    <>
                      <div>
                        <dt>{label('Date', 'Fecha')}</dt>
                        <dd>{scheduleDisplay.date}</dd>
                      </div>
                      <div>
                        <dt>{label('Time slot', 'Horario')}</dt>
                        <dd>
                          {scheduleDisplay.endTime
                            ? `${scheduleDisplay.time} – ${scheduleDisplay.endTime}`
                            : scheduleDisplay.time}
                        </dd>
                      </div>
                      <div>
                        <dt>{label('Timezone', 'Zona horaria')}</dt>
                        <dd>{scheduleDisplay.timeZone}</dd>
                      </div>
                    </>
                  )}
                </dl>

                {/* Session / package summary */}
                {(() => {
                  const total = selectedRequest.num_sessions ?? 1;
                  const completed = completedSiblingCount ?? 0;

                  if (total <= 1) {
                    // Single session — just show open (1) or conducted (0)
                    const isAlreadyDone = completed > 0;
                    return (
                      <div
                        style={{
                          marginTop: '0.85rem',
                          padding: '0.6rem 0.9rem',
                          borderRadius: '8px',
                          backgroundColor: isAlreadyDone ? '#f0fdf4' : '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          fontSize: '0.9rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                        }}
                      >
                        <span>🗓️</span>
                        <span>
                          <strong style={{ color: '#15803d' }}>
                            {label('Sessions reserved:', 'Sesiones reservadas:')} 1
                          </strong>
                          {'  ·  '}
                          <span style={{ color: isAlreadyDone ? '#15803d' : '#1d4ed8' }}>
                            {label('Open:', 'Abiertas:')} {isAlreadyDone ? 0 : 1}
                          </span>
                          {isAlreadyDone && (
                            <>
                              {'  ·  '}
                              <span style={{ color: '#15803d' }}>
                                {label('Completed:', 'Completadas:')} 1
                              </span>
                            </>
                          )}
                        </span>
                      </div>
                    );
                  }

                  // Package — use remainingPackageSessions (includes selected + future) for active count
                  const activeSiblings = remainingPackageSessions.length;
                  const notYetBooked = Math.max(0, total - completed - activeSiblings);
                  return (
                    <div
                      style={{
                        marginTop: '0.85rem',
                        padding: '0.75rem 1rem',
                        borderRadius: '8px',
                        backgroundColor: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        fontSize: '0.9rem',
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: '0.4rem', color: '#1d4ed8' }}>
                        📦 {label('Session package', 'Paquete de sesiones')}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.2rem 0.75rem', color: '#374151' }}>
                        <span style={{ color: '#6b7280' }}>{label('Total reserved:', 'Total reservadas:')}</span>
                        <span style={{ fontWeight: 600 }}>{total}</span>
                        <span style={{ color: '#6b7280' }}>{label('Completed:', 'Completadas:')}</span>
                        <span style={{ fontWeight: 600, color: '#15803d' }}>{completed}</span>
                        <span style={{ color: '#6b7280' }}>{label('Active / pending:', 'Activas / pendientes:')}</span>
                        <span style={{ fontWeight: 600, color: '#1d4ed8' }}>{activeSiblings}</span>
                        {notYetBooked > 0 && (
                          <>
                            <span style={{ color: '#6b7280' }}>{label('Not yet booked:', 'Sin reservar aún:')}</span>
                            <span style={{ fontWeight: 600, color: '#92400e' }}>{notYetBooked}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
                {scheduleDisplay?.hasStoredTimeSlot && (
                  <p className="cancel-session-hint">
                    {label(
                      'Time slot loaded from your saved session request.',
                      'Horario cargado desde su solicitud de sesión guardada.',
                    )}
                  </p>
                )}
                {scheduleDisplay && !scheduleDisplay.isConfirmed && !scheduleDisplay.hasStoredTimeSlot && (
                  <p className="cancel-session-hint">
                    {label(
                      'Showing requested preferred date and time (session not yet confirmed in the calendar).',
                      'Mostrando fecha y hora preferidas solicitadas (sesión aún no confirmada en el calendario).',
                    )}
                  </p>
                )}
              </div>

              <div className={`cancel-session-timing ${onTime ? 'cancel-session-timing--ok' : 'cancel-session-timing--late'}`}>
                <strong>{label('Cancellation timing:', 'Plazo de cancelación:')}</strong>{' '}
                {onTime
                  ? label(
                      `On time (more than ${CANCEL_SESSION_NOTICE_HOURS} hours before the session).`,
                      `A tiempo (más de ${CANCEL_SESSION_NOTICE_HOURS} horas antes de la sesión).`,
                    )
                  : label(
                      `Late (less than ${CANCEL_SESSION_NOTICE_HOURS} hours before the session).`,
                      `Fuera de plazo (menos de ${CANCEL_SESSION_NOTICE_HOURS} horas antes de la sesión).`,
                    )}
              </div>

              {isPackage && (
                <div className="cancel-session-field">
                  <span className="cancel-session-field-label">
                    {label('Cancellation scope', 'Alcance de la cancelación')}
                  </span>
                  <div className="cancel-session-radio-group">
                    <label>
                      <input
                        type="radio"
                        name="cancel-scope"
                        checked={cancelScope === 'single'}
                        onChange={() => setCancelScope('single')}
                      />
                      {label('Cancel this session only', 'Cancelar solo esta sesión')}
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="cancel-scope"
                        checked={cancelScope === 'remaining'}
                        onChange={() => setCancelScope('remaining')}
                      />
                      {label(
                        `Cancel all remaining sessions in package (${remainingPackageSessions.length})`,
                        `Cancelar todas las sesiones restantes del paquete (${remainingPackageSessions.length})`,
                      )}
                    </label>
                  </div>
                </div>
              )}

              <div className="cancel-session-field cancel-session-payment-options">
                <span className="cancel-session-field-label">
                  {wasPaid && !refundEligibility.eligible
                    ? label('Cancellation without refund', 'Cancelación sin reembolso')
                    : label('Refund or credit', 'Reembolso o crédito')}
                </span>

                {/* ── Balance breakdown ── */}
                {wasPaid && balanceInfo && (
                  <div
                    style={{
                      marginBottom: '0.9rem',
                      padding: '0.85rem 1rem',
                      borderRadius: '8px',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      fontSize: '0.88rem',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#1e293b', fontSize: '0.92rem' }}>
                      💰 {label('Payment balance', 'Balance del pago')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 1rem', color: '#374151' }}>
                      <span style={{ color: '#6b7280' }}>{label('Total paid:', 'Total pagado:')}</span>
                      <span style={{ fontWeight: 600 }}>{balanceInfo.currency} {balanceInfo.totalPaid.toFixed(2)}</span>

                      {balanceInfo.usedCount > 0 && (
                        <>
                          <span style={{ color: '#6b7280' }}>
                            {label(
                              `Sessions used (${balanceInfo.usedCount} × ${balanceInfo.currency} ${balanceInfo.singleRate.toFixed(2)}):`,
                              `Sesiones usadas (${balanceInfo.usedCount} × ${balanceInfo.currency} ${balanceInfo.singleRate.toFixed(2)}):`,
                            )}
                          </span>
                          <span style={{ fontWeight: 600, color: '#dc2626' }}>
                            − {balanceInfo.currency} {balanceInfo.usedValue.toFixed(2)}
                          </span>
                          <span style={{ color: '#6b7280', fontSize: '0.78rem', gridColumn: '1 / -1', marginTop: '-0.1rem' }}>
                            {label(
                              `(Single-session rate: ${balanceInfo.singleRateSource})`,
                              `(Tarifa sesión individual: ${balanceInfo.singleRateSource})`,
                            )}
                          </span>
                        </>
                      )}

                      <span
                        style={{
                          color: '#1e293b',
                          fontWeight: 700,
                          borderTop: '1px solid #e2e8f0',
                          paddingTop: '0.3rem',
                          marginTop: '0.1rem',
                        }}
                      >
                        {refundEligibility.eligible
                          ? label('Balance to refund/credit:', 'Saldo a reembolsar/acreditar:')
                          : label('Remaining balance (not refundable):', 'Saldo restante (no reembolsable):')}
                      </span>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '1rem',
                          color: refundEligibility.eligible && balanceInfo.balance > 0 ? '#15803d' : '#dc2626',
                          borderTop: '1px solid #e2e8f0',
                          paddingTop: '0.3rem',
                          marginTop: '0.1rem',
                        }}
                      >
                        {balanceInfo.currency} {balanceInfo.balance.toFixed(2)}
                      </span>
                    </div>
                    {balanceInfo.usedCount > 0 && balanceInfo.packageSize > 1 && (
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                        {refundEligibility.eligible
                          ? label(
                              `Used sessions are charged at the single-session rate. The remaining balance of ${balanceInfo.currency} ${balanceInfo.balance.toFixed(2)} will be ${disposition === 'refund' ? 'refunded' : 'stored as credit'}.`,
                              `Las sesiones usadas se cobran a la tarifa de sesión individual. El saldo restante de ${balanceInfo.currency} ${balanceInfo.balance.toFixed(2)} será ${disposition === 'refund' ? 'reembolsado' : 'guardado como crédito'}.`,
                            )
                          : label(
                              'No refund is allowed for a package once any session has been completed. No Zoho credit will be issued.',
                              'No hay reembolso de un paquete una vez que se haya completado alguna sesión. No se emitirá crédito Zoho.',
                            )}
                      </p>
                    )}
                  </div>
                )}

                {wasPaid && refundEligibility.eligible ? (
                  <>
                    <div className="cancel-session-radio-group">
                      <label className={`cancel-session-option ${disposition === 'credit' ? 'cancel-session-option--selected' : ''}`}>
                        <input
                          type="radio"
                          name="cancel-disposition"
                          checked={disposition === 'credit'}
                          onChange={() => setDisposition('credit')}
                        />
                        <span>
                          <strong>
                            {label('Save as credit', 'Guardar como crédito')}
                            {balanceInfo && ` — ${balanceInfo.currency} ${balanceInfo.balance.toFixed(2)}`}
                          </strong>
                          <span className="cancel-session-option-detail">
                            {label(
                              'Keep the payment as credit for future sessions.',
                              'Mantener el pago como crédito para sesiones futuras.',
                            )}
                          </span>
                        </span>
                      </label>
                      <label className={`cancel-session-option ${disposition === 'refund' ? 'cancel-session-option--selected' : ''}`}>
                        <input
                          type="radio"
                          name="cancel-disposition"
                          checked={disposition === 'refund'}
                          onChange={() => setDisposition('refund')}
                        />
                        <span>
                          <strong>
                            {label(
                              `Request refund — ${balanceInfo ? `${balanceInfo.currency} ${balanceInfo.balance.toFixed(2)}` : `${refundEligibility.currency} ${refundEligibility.eligibleAmount.toFixed(2)}`}`,
                              `Solicitar reembolso — ${balanceInfo ? `${balanceInfo.currency} ${balanceInfo.balance.toFixed(2)}` : `${refundEligibility.currency} ${refundEligibility.eligibleAmount.toFixed(2)}`}`,
                            )}
                          </strong>
                          <span className="cancel-session-option-detail">
                            {label(
                              'Process a refund for the eligible portion of this cancellation.',
                              'Procesar un reembolso por la parte elegible de esta cancelación.',
                            )}
                          </span>
                        </span>
                      </label>
                    </div>
                    <p className="cancel-session-hint">{refundEligibility.reason}</p>
                  </>
                ) : wasPaid ? (
                  <div className="cancel-session-no-refund-notice">
                    <p className="cancel-session-hint" style={{ marginTop: 0, color: '#92400e' }}>
                      {refundEligibility.reasonCode === 'late'
                        ? label(
                            'Cancellation is less than 24 hours before the session; refund is not allowed. You can still cancel the Google Calendar event and Google Meet. No refund and no Zoho credit will be issued.',
                            'La cancelación es con menos de 24 horas de anticipación; no se permite reembolso. Aun así puede cancelar el evento de Google Calendar y Google Meet. No se emitirá reembolso ni crédito Zoho.',
                          )
                        : refundEligibility.reasonCode === 'package_executed'
                          ? label(
                              'No refund is allowed for a package once any session has been completed. You can still cancel the Google Calendar event and Google Meet. No refund and no Zoho credit will be issued.',
                              'No hay reembolso de un paquete una vez que se haya completado alguna sesión. Aun así puede cancelar el evento de Google Calendar y Google Meet. No se emitirá reembolso ni crédito Zoho.',
                            )
                          : label(
                              `${refundEligibility.reason} You can still cancel the Google Calendar event and Google Meet. No refund and no Zoho credit will be issued.`,
                              `${refundEligibility.reason} Aun así puede cancelar el evento de Google Calendar y Google Meet. No se emitirá reembolso ni crédito Zoho.`,
                            )}
                    </p>
                    <label className="cancel-session-calendar-confirm">
                      <input
                        type="checkbox"
                        checked={confirmCalendarMeet}
                        onChange={e => setConfirmCalendarMeet(e.target.checked)}
                      />
                      <span>
                        {label(
                          'Yes, cancel the calendar event and Google Meet. I understand no refund or Zoho credit will be issued.',
                          'Sí, cancelar el evento de calendario y Google Meet. Entiendo que no se emitirá reembolso ni crédito Zoho.',
                        )}
                      </span>
                    </label>
                  </div>
                ) : (
                  <p className="cancel-session-hint">
                    {label(
                      'Refund and credit options apply after the session has been paid.',
                      'Las opciones de reembolso y crédito aplican después de que la sesión haya sido pagada.',
                    )}
                  </p>
                )}
              </div>

              <div className="cancel-session-summary">
                <p>
                  <strong>{label('Sessions to cancel:', 'Sesiones a cancelar:')}</strong>{' '}
                  {sessionsToCancel.length}
                </p>
                {cancelScope === 'remaining' && isPackage && sessionsToCancel.length > 1 && (
                  <ul className="cancel-session-schedule-list">
                    {sessionsToCancel.map(req => {
                      const itemSlot = getRequestSlot(req);
                      const itemSchedule = formatClientRequestScheduleDisplay(req, language, itemSlot);
                      const sessionNo = req.session_no ?? 1;
                      return (
                        <li key={req.id}>
                          {label('Session', 'Sesión')} {sessionNo}:{' '}
                          {itemSchedule
                            ? `${itemSchedule.date} · ${itemSchedule.endTime ? `${itemSchedule.time} – ${itemSchedule.endTime}` : itemSchedule.time}`
                            : '—'}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {!wasPaid && (
                  <p className="cancel-session-hint">
                    {label(
                      'Unpaid session — status will be set to canceled (no payment).',
                      'Sesión no pagada — el estado se establecerá en cancelado (sin pago).',
                    )}
                  </p>
                )}
              </div>

              <button
                type="button"
                className="cancel-session-confirm-btn"
                disabled={submitting || (wasPaid && !refundEligibility.eligible && !confirmCalendarMeet)}
                onClick={handleConfirmCancel}
              >
                {submitting
                  ? label('Canceling...', 'Cancelando...')
                  : wasPaid && !refundEligibility.eligible
                    ? label('Cancel calendar and Google Meet', 'Cancelar calendario y Google Meet')
                    : label('Confirm cancellation', 'Confirmar cancelación')}
              </button>
            </>
          )}
        </>
      )}

      {error && <p className="cancel-session-error">{error}</p>}
      {success && <p className="cancel-session-success">{success}</p>}
    </section>
  );
}
