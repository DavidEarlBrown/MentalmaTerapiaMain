import type { Professional } from '../types';
import { normalizeTimezone } from './timezone';

export const DEFAULT_MINIMUM_NOTICE_HOURS = 24;

export interface ReservedSessionBlock {
  startMs: number;
  endMs: number;
}

/** Minimum booking notice in hours (default 24 when null or negative). */
export function getProfessionalMinimumNoticeHours(professional?: Professional | null): number {
  if (!professional) return DEFAULT_MINIMUM_NOTICE_HOURS;

  const record = professional as Professional & { 'Minimum Notice'?: number | string | null };
  const raw = (record.minimum_notice ?? record['Minimum Notice']) as number | string | null | undefined;

  if (typeof raw === 'number' && raw >= 0) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
  }

  return DEFAULT_MINIMUM_NOTICE_HOURS;
}

/** UTC epoch ms for a local date/time in an IANA timezone. */
export function getZonedDateTimeUtcMs(dateStr: string, timeStr: string, timeZone: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  const tz = normalizeTimezone(timeZone);
  const fakeUtc = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(fakeUtc);

  let tzHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const tzMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  if (tzHour === 24) tzHour = 0;

  let offsetMinutes = tzHour * 60 + tzMinute - (hours * 60 + minutes);
  if (offsetMinutes > 720) offsetMinutes -= 1440;
  if (offsetMinutes < -720) offsetMinutes += 1440;

  return fakeUtc.getTime() - offsetMinutes * 60 * 1000;
}

export function getEarliestBookableUtcMs(noticeHours: number, fromMs: number = Date.now()): number {
  return fromMs + noticeHours * 60 * 60 * 1000;
}

/** YYYY-MM-DD for the earliest bookable calendar day in a timezone. */
export function getMinimumBookableDateString(noticeHours: number, timeZone: string, fromMs: number = Date.now()): string {
  const earliestMs = getEarliestBookableUtcMs(noticeHours, fromMs);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeTimezone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(earliestMs));
}

export function isTimeBlockedByReservation(
  dateStr: string,
  timeStr: string,
  professionalTimeZone: string,
  sessionLengthHours: number,
  reservedBlocks: ReservedSessionBlock[],
): boolean {
  const startMs = getZonedDateTimeUtcMs(dateStr, timeStr, professionalTimeZone);
  const endMs = startMs + sessionLengthHours * 60 * 60 * 1000;

  return reservedBlocks.some(block => startMs < block.endMs && endMs > block.startMs);
}

export function isSlotBookable(
  dateStr: string,
  timeStr: string,
  professionalTimeZone: string,
  noticeHours: number,
  sessionLengthHours: number,
  reservedBlocks: ReservedSessionBlock[],
  fromMs: number = Date.now(),
): boolean {
  const startMs = getZonedDateTimeUtcMs(dateStr, timeStr, professionalTimeZone);
  if (startMs < getEarliestBookableUtcMs(noticeHours, fromMs)) return false;
  return !isTimeBlockedByReservation(dateStr, timeStr, professionalTimeZone, sessionLengthHours, reservedBlocks);
}

export function normalizeTimeToHHMM(value: string | undefined | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  const hhmmMatch = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (hhmmMatch) {
    return `${hhmmMatch[1].padStart(2, '0')}:${hhmmMatch[2]}`;
  }
  return trimmed;
}

export function buildReservedBlock(
  dateStr: string,
  timeStr: string,
  professionalTimeZone: string,
  sessionLengthHours: number,
): ReservedSessionBlock | null {
  const normalizedTime = normalizeTimeToHHMM(timeStr);
  if (!dateStr || !normalizedTime) return null;

  const startMs = getZonedDateTimeUtcMs(dateStr, normalizedTime, professionalTimeZone);
  return {
    startMs,
    endMs: startMs + Math.max(sessionLengthHours, 1) * 60 * 60 * 1000,
  };
}
