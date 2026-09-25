import type { SupabaseClient } from '@supabase/supabase-js';
import type { Professional } from '../types';

export const PROFESSIONALS_PUBLIC_SELECT =
  'id, name_en, name_es, bio_en, bio_es, specialties_en, specialties_es, photo_url, is_active, created_at, counseling_types, time_zone, email, "PrimaryLanguage", "SecondaryLanguages", "Título", "Clasificación", profession, profession_id';

export const PROFESSIONALS_ADMIN_SELECT =
  `${PROFESSIONALS_PUBLIC_SELECT}, user_id`;

export type MinimumNoticeColumn = 'minimum_notice' | 'Minimum Notice';

export function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { message?: string; code?: string; details?: string };
  const message = `${record.message ?? ''} ${record.details ?? ''}`.toLowerCase();
  return (
    record.code === '42703'
    || record.code === 'PGRST204'
    || message.includes('does not exist')
    || message.includes('could not find')
    || message.includes('minimum_notice')
    || message.includes('minimum notice')
  );
}

const NOTICE_COLUMN_ATTEMPTS: Array<{ column: MinimumNoticeColumn | null; selectSuffix: string }> = [
  { column: 'minimum_notice', selectSuffix: ', minimum_notice' },
  { column: 'Minimum Notice', selectSuffix: ', "Minimum Notice"' },
  { column: null, selectSuffix: '' },
];

export function buildMinimumNoticeSavePayload(
  column: MinimumNoticeColumn | null,
  hours: number | null,
): Record<string, number | null> {
  if (!column) return {};
  if (column === 'Minimum Notice') {
    return { 'Minimum Notice': hours };
  }
  return { minimum_notice: hours };
}

interface QueryProfessionalsOptions {
  baseSelect: string;
  includeInactive?: boolean;
  professionId?: string;
  orderAscending?: boolean;
}

export async function queryProfessionalsWithNoticeColumn(
  supabaseClient: SupabaseClient,
  options: QueryProfessionalsOptions,
): Promise<{ data: Professional[]; minimumNoticeColumn: MinimumNoticeColumn | null }> {
  let lastError: unknown = null;

  for (const attempt of NOTICE_COLUMN_ATTEMPTS) {
    let query = supabaseClient
      .from('professionals')
      .select(`${options.baseSelect}${attempt.selectSuffix}`)
      .order('created_at', { ascending: options.orderAscending ?? false });

    if (!options.includeInactive) {
      query = query.eq('is_active', true);
    }
    if (options.professionId) {
      query = query.eq('profession_id', options.professionId);
    }

    const { data, error } = await query;
    if (!error) {
      return { data: (data ?? []) as unknown as Professional[], minimumNoticeColumn: attempt.column };
    }

    if (!isMissingColumnError(error)) {
      throw error;
    }
    lastError = error;
  }

  throw lastError ?? new Error('Failed to load professionals');
}
