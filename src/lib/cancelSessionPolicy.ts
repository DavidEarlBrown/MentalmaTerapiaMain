import type { ClientRequest } from '../types';
import { getZonedDateTimeUtcMs, normalizeTimeToHHMM } from './professionalScheduling';
import { getClientRequestStatusValue, type SessionStatusCode } from './sessionStatus';
import { normalizeTimezone } from './timezone';

export const CANCEL_SESSION_NOTICE_HOURS = 24;
export const CANCEL_SESSION_PREFILL_KEY = 'cancel_session_request_id';
/** Prefill Request a Session for Change Session from Display My Appointments / View My Sessions. */
export const CHANGE_SESSION_PREFILL_KEY = 'change_session_request_id';

export type CancelDisposition = 'refund' | 'credit';

export interface ClientRequestScheduleDisplay {
  date: string;
  time: string;
  endTime?: string;
  timeZone: string;
  isConfirmed: boolean;
  hasStoredTimeSlot: boolean;
}

export interface ClientRequestTimeSlotInfo {
  id: string;
  start_time: string;
  end_time: string;
}

const CANCELED_STATUS_CODES = new Set<SessionStatusCode>([2, 3, 4]);

export function isCanceledSessionStatus(status: SessionStatusCode): boolean {
  return CANCELED_STATUS_CODES.has(status);
}

export function isCancellableSessionStatus(status: SessionStatusCode): boolean {
  return status === 0 || status === 1;
}

function scheduleLocale(language: string): string {
  return language === 'es' ? 'es' : 'en-US';
}

function formatDateFromParts(
  year: number,
  month: number,
  day: number,
  locale: string,
): string {
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatTimeFromParts(hour: number, minute: number, locale: string): string {
  const date = new Date(Date.UTC(2000, 0, 1, hour, minute, 0));
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(date);
}

function resolveStoredStartTime(
  request: ClientRequest,
  slot?: ClientRequestTimeSlotInfo | null,
): string | null {
  return normalizeTimeToHHMM(request.preferred_time)
    || (slot ? normalizeTimeToHHMM(slot.start_time) : null);
}

function resolveStoredEndTime(
  request: ClientRequest,
  slot?: ClientRequestTimeSlotInfo | null,
  startTime?: string | null,
): string | null {
  const fromSlot = slot ? normalizeTimeToHHMM(slot.end_time) : null;
  if (fromSlot) return fromSlot;

  const start = startTime || resolveStoredStartTime(request, slot);
  const sessionLengthHours = request.session_length ?? 1;
  if (!start || sessionLengthHours <= 0) return null;

  const [hour, minute] = start.split(':').map(part => parseInt(part, 10));
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

  const totalMinutes = hour * 60 + minute + Math.round(sessionLengthHours * 60);
  const endHour = Math.floor(totalMinutes / 60) % 24;
  const endMinute = totalMinutes % 60;
  return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
}

export function formatClientRequestScheduleDisplay(
  request: ClientRequest,
  language: string = 'en',
  slot?: ClientRequestTimeSlotInfo | null,
): ClientRequestScheduleDisplay | null {
  const locale = scheduleLocale(language);
  const timeZone = normalizeTimezone(request.time_zone || 'America/Bogota');

  if (request.scheduled_datetime) {
    const scheduled = new Date(request.scheduled_datetime);
    if (!Number.isNaN(scheduled.getTime())) {
      const date = new Intl.DateTimeFormat(locale, {
        timeZone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(scheduled);
      const time = new Intl.DateTimeFormat(locale, {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(scheduled);
      return {
        date,
        time,
        timeZone,
        isConfirmed: true,
        hasStoredTimeSlot: true,
      };
    }
  }

  const dateStr = String(request.preferred_date || '').split('T')[0];
  if (!dateStr) return null;

  const storedStart = resolveStoredStartTime(request, slot);
  const storedEnd = resolveStoredEndTime(request, slot, storedStart);
  const hasStoredTimeSlot = Boolean(storedStart || request.TimeSlotId);

  const [year, month, day] = dateStr.split('-').map(part => parseInt(part, 10));
  if (!year || !month || !day) {
    return {
      date: dateStr,
      time: storedStart || '—',
      endTime: storedEnd || undefined,
      timeZone,
      isConfirmed: false,
      hasStoredTimeSlot,
    };
  }

  const time = storedStart
    ? formatTimeFromParts(
        parseInt(storedStart.slice(0, 2), 10),
        parseInt(storedStart.slice(3, 5), 10),
        locale,
      )
    : '—';
  const endTime = storedEnd
    ? formatTimeFromParts(
        parseInt(storedEnd.slice(0, 2), 10),
        parseInt(storedEnd.slice(3, 5), 10),
        locale,
      )
    : undefined;

  return {
    date: formatDateFromParts(year, month, day, locale),
    time,
    endTime,
    timeZone,
    isConfirmed: false,
    hasStoredTimeSlot,
  };
}

export function formatClientRequestScheduleCompact(
  request: ClientRequest,
  language: string = 'en',
  slot?: ClientRequestTimeSlotInfo | null,
): string {
  const schedule = formatClientRequestScheduleDisplay(request, language, slot);
  if (!schedule) return '—';
  const timeLabel = schedule.endTime ? `${schedule.time} – ${schedule.endTime}` : schedule.time;
  return `${schedule.date} · ${timeLabel}`;
}

export function getClientRequestScheduledUtcMs(
  request: ClientRequest,
  slot?: ClientRequestTimeSlotInfo | null,
): number | null {
  if (request.scheduled_datetime) {
    const scheduled = new Date(request.scheduled_datetime);
    if (!Number.isNaN(scheduled.getTime())) return scheduled.getTime();
  }

  const dateStr = String(request.preferred_date || '').split('T')[0];
  if (!dateStr) return null;

  const timeStr = resolveStoredStartTime(request, slot) || '12:00';
  const timeZone = request.time_zone || 'America/Bogota';

  try {
    return getZonedDateTimeUtcMs(dateStr, timeStr, timeZone);
  } catch {
    const fallback = new Date(`${dateStr}T${timeStr}`);
    return Number.isNaN(fallback.getTime()) ? null : fallback.getTime();
  }
}

export function isOnTimeCancellation(
  request: ClientRequest,
  fromMs: number = Date.now(),
  slot?: ClientRequestTimeSlotInfo | null,
): boolean {
  const scheduledMs = getClientRequestScheduledUtcMs(request, slot);
  if (scheduledMs == null) return false;
  const noticeMs = CANCEL_SESSION_NOTICE_HOURS * 60 * 60 * 1000;
  return scheduledMs - fromMs >= noticeMs;
}

export function resolveStatusAfterCancel(
  wasPaid: boolean,
  disposition: CancelDisposition,
  refundEligible: boolean,
): SessionStatusCode {
  if (!wasPaid) return 2;
  if (disposition === 'refund' && refundEligible) return 4;
  return 3;
}

export function filterRemainingPackageSessions(
  allRequests: ClientRequest[],
  selected: ClientRequest,
): ClientRequest[] {
  const packageSize = Math.max(1, selected.num_sessions ?? 1);
  if (packageSize <= 1) return [selected];

  const selectedNo = Math.max(1, selected.session_no ?? 1);
  const priceId = selected.session_price_id;
  const clientKey = selected.user_id || selected.client_email;

  return allRequests.filter(req => {
    if (!req.id) return false;
    if ((req.user_id || req.client_email) !== clientKey) return false;
    if (priceId != null && req.session_price_id !== priceId) return false;
    if (Math.max(1, req.num_sessions ?? 1) !== packageSize) return false;

    const status = getClientRequestStatusValue(req);
    if (!isCancellableSessionStatus(status)) return false;

    const sessionNo = Math.max(1, req.session_no ?? 1);
    return sessionNo >= selectedNo;
  }).sort((a, b) => (a.session_no ?? 1) - (b.session_no ?? 1));
}

export function buildCancellationNote(
  onTime: boolean,
  disposition: CancelDisposition,
  cancelAllRemaining: boolean,
  sessionsCanceled: number,
  language: string,
  refundEligible: boolean = true,
): string {
  const timing = onTime
    ? (language === 'es' ? 'a tiempo' : 'on time')
    : (language === 'es' ? 'fuera de plazo' : 'late');
  const scope = cancelAllRemaining
    ? (language === 'es'
      ? `paquete (${sessionsCanceled} sesiones restantes)`
      : `package (${sessionsCanceled} remaining sessions)`)
    : (language === 'es' ? 'esta sesión' : 'this session');
  const payout = disposition === 'refund' && refundEligible
    ? (language === 'es' ? 'reembolso solicitado' : 'refund requested')
    : !refundEligible
      ? (language === 'es'
        ? 'sin reembolso ni crédito Zoho; calendario y Meet cancelados'
        : 'no refund or Zoho credit; calendar and Meet canceled')
      : (language === 'es' ? 'crédito para sesiones futuras' : 'credit for future sessions');

  return language === 'es'
    ? `Cancelación ${timing} — ${scope} — ${payout}.`
    : `Cancellation ${timing} — ${scope} — ${payout}.`;
}
