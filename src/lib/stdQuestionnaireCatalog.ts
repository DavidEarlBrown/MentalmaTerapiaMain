/**
 * Shared helpers for the std_questionnaires table + storage bucket.
 * Request Session loads stored catalog items; Admin syncs storage → table
 * and adds instruments discovered by AI search.
 */
import { supabase } from './supabaseClient';
import { standardQuestionnaires, type Questionnaire } from './questionnaireDefinitions';

export const STD_QUESTIONNAIRES_BUCKET = 'std_questionnaires';

export interface StoredQuestionnaireJson {
  name?: string;
  description?: string;
  questions?: Array<{ question?: string; options?: string[] }>;
}

export interface CatalogSummary {
  id: string;
  name: string;
  description: string;
  hasStorage: boolean;
}

export interface StorageQuestionnaireFolder {
  id: string;
  enPath?: string;
  esPath?: string;
}

export interface SyncResult {
  id: string;
  status: 'ok' | 'error' | 'skipped';
  message?: string;
}

const SKIP_FOLDER_NAMES = new Set(['_general']);

function normalizeQuestionnaireId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function isQuestionnaireFolderName(name: string): boolean {
  if (!name || SKIP_FOLDER_NAMES.has(name)) return false;
  if (name.includes('@') || name.includes('comprehensive_analysis')) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,80}$/.test(name);
}

export function definitionToStoredJson(def: Questionnaire, lang: 'en' | 'es'): StoredQuestionnaireJson {
  return {
    name: lang === 'en' ? def.name_en : def.name_es,
    description: lang === 'en' ? def.description_en : def.description_es,
    questions: def.questions.map(q => ({
      question: lang === 'en' ? q.question_en : q.question_es,
      options: lang === 'en' ? q.options_en : q.options_es,
    })),
  };
}

export function findHardcodedDefinition(id: string, name?: string): Questionnaire | undefined {
  const keys = [id, name]
    .filter(Boolean)
    .map(v => String(v).toLowerCase().replace(/[^a-z0-9]/g, ''));
  return standardQuestionnaires.find(def => {
    const defKeys = [def.id, def.name_en, def.name_es].map(v => v.toLowerCase().replace(/[^a-z0-9]/g, ''));
    return keys.some(key => defKeys.some(defKey => key === defKey || key.includes(defKey) || defKey.includes(key)));
  });
}

export async function downloadQuestionnaireJson(path: string): Promise<StoredQuestionnaireJson | null> {
  try {
    const { data, error } = await supabase.storage.from(STD_QUESTIONNAIRES_BUCKET).download(path);
    if (error || !data) return null;
    const parsed = JSON.parse(await data.text()) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as StoredQuestionnaireJson;
    return null;
  } catch {
    return null;
  }
}

export async function uploadQuestionnaireJson(
  questionnaireId: string,
  lang: 'en' | 'es',
  data: unknown,
): Promise<string> {
  const filePath = `${questionnaireId}/${lang}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const { error } = await supabase.storage
    .from(STD_QUESTIONNAIRES_BUCKET)
    .upload(filePath, blob, { contentType: 'application/json', upsert: true });
  if (error) throw new Error(error.message);
  return filePath;
}

export async function listStorageQuestionnaireFolders(): Promise<StorageQuestionnaireFolder[]> {
  const { data, error } = await supabase.storage
    .from(STD_QUESTIONNAIRES_BUCKET)
    .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw new Error(error.message);

  const folders = (data ?? []).filter(item => isQuestionnaireFolderName(item.name));
  const results: StorageQuestionnaireFolder[] = [];

  for (const folder of folders) {
    const { data: files } = await supabase.storage
      .from(STD_QUESTIONNAIRES_BUCKET)
      .list(folder.name, { limit: 50 });
    const names = new Set((files ?? []).map(f => f.name));
    results.push({
      id: folder.name,
      enPath: names.has('en.json') ? `${folder.name}/en.json` : undefined,
      esPath: names.has('es.json') ? `${folder.name}/es.json` : undefined,
    });
  }

  return results;
}

export interface StdQuestionnaireRow {
  id: string;
  name?: string | null;
  description?: string | null;
  storage_location?: { en?: string; es?: string } | null;
  active?: boolean | null;
  client_avail?: boolean | null;
  questionnaire_data_en?: unknown;
  questionnaire_data_es?: unknown;
  updated_at?: string | null;
}

/** Hidden only when `active` is explicitly false. Null/missing counts as visible. */
export function isCatalogRowActive(row: { active?: boolean | null }): boolean {
  return row.active !== false;
}

/**
 * Load catalog rows without SQL filters that drop existing data.
 * `.eq('active', true)` hid every row when `active` was null or the column
 * was missing from the API schema cache.
 */
export async function fetchStdQuestionnaireRows(): Promise<StdQuestionnaireRow[]> {
  const attempts: Array<() => Promise<{ data: unknown[] | null; error: { message?: string } | null }>> = [
    () => supabase.from('std_questionnaires').select('*').order('id', { ascending: true }),
    () => supabase.from('std_questionnaires').select('*'),
    () => supabase.from('std_questionnaires').select('id, name, description, storage_location'),
  ];

  let lastError: Error | null = null;
  for (const attempt of attempts) {
    const { data, error } = await attempt();
    if (!error) {
      return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
        ...row,
        id: String(row.id ?? ''),
      })).filter(row => row.id);
    }
    lastError = new Error(error.message || 'Failed to load std_questionnaires');
  }
  throw lastError ?? new Error('Failed to load std_questionnaires');
}

export async function loadActiveCatalogSummaries(): Promise<CatalogSummary[]> {
  const rows = await fetchStdQuestionnaireRows();
  return rows.filter(isCatalogRowActive).map(row => ({
    id: row.id,
    name: row.name?.trim() || row.id,
    description: row.description?.trim() || '',
    hasStorage: !!(row.storage_location?.en || row.storage_location?.es),
  }));
}

export async function loadStoredQuestionsForLanguage(
  questionnaireId: string,
  language: 'en' | 'es',
  storageLocation?: { en?: string; es?: string } | null,
): Promise<StoredQuestionnaireJson | null> {
  const preferred = language === 'en'
    ? (storageLocation?.en || `${questionnaireId}/en.json`)
    : (storageLocation?.es || `${questionnaireId}/es.json`);
  const fallback = language === 'en'
    ? (storageLocation?.es || `${questionnaireId}/es.json`)
    : (storageLocation?.en || `${questionnaireId}/en.json`);

  return (await downloadQuestionnaireJson(preferred))
    ?? (await downloadQuestionnaireJson(fallback));
}

async function upsertCatalogRow(input: {
  id: string;
  name?: string;
  description?: string;
  storage_location?: { en?: string; es?: string };
  questionnaire_data_en?: StoredQuestionnaireJson | null;
  questionnaire_data_es?: StoredQuestionnaireJson | null;
}): Promise<void> {
  const { data: existing } = await supabase
    .from('std_questionnaires')
    .select('id, name, description, storage_location')
    .eq('id', input.id)
    .maybeSingle();

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.name) payload.name = input.name;
  if (input.description) payload.description = input.description;
  if (input.storage_location) payload.storage_location = input.storage_location;
  if (input.questionnaire_data_en) payload.questionnaire_data_en = input.questionnaire_data_en;
  if (input.questionnaire_data_es) payload.questionnaire_data_es = input.questionnaire_data_es;

  if (existing) {
    if (!existing.name && !input.name) {
      /* keep empty name */
    }
    const { error } = await supabase.from('std_questionnaires').update(payload).eq('id', input.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from('std_questionnaires').insert({
    id: input.id,
    name: input.name || input.id,
    description: input.description || '',
    storage_location: input.storage_location || {},
    active: true,
    client_avail: true,
    ...payload,
  });
  if (error) throw new Error(error.message);
}

function parseGeminiJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error('Invalid JSON from AI');
  return JSON.parse(match[0]) as T;
}

async function getGeminiModel() {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY not configured');
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.5, topP: 0.95, topK: 40 },
  });
}

export async function generateStoredQuestionnairePair(
  nameEn: string,
  nameEs: string,
  descriptionEn: string,
  descriptionEs: string,
  questionnaireId?: string,
): Promise<{ en: StoredQuestionnaireJson; es: StoredQuestionnaireJson }> {
  const def = findHardcodedDefinition(questionnaireId || nameEn, nameEs)
    ?? findHardcodedDefinition(nameEn, nameEs)
    ?? findHardcodedDefinition(nameEn);
  if (def) {
    return { en: definitionToStoredJson(def, 'en'), es: definitionToStoredJson(def, 'es') };
  }

  const model = await getGeminiModel();
  const result = await model.generateContent(`You are MarI, a mental health AI assistant. Generate a standard clinical questionnaire in English and Spanish.

English name: ${nameEn}
Spanish name: ${nameEs}
English description: ${descriptionEn}
Spanish description: ${descriptionEs}

Return ONLY valid JSON:
{
  "en": { "name": "...", "description": "...", "questions": [{ "question": "...", "options": ["...", "...", "...", "..."] }] },
  "es": { "name": "...", "description": "...", "questions": [{ "question": "...", "options": ["...", "...", "...", "..."] }] }
}

Requirements:
- 7 to 15 clinically relevant multiple-choice questions
- 4 or 5 options per question
- Spanish must be a proper clinical adaptation, not a word-for-word translation`);

  const parsed = parseGeminiJson<{ en: StoredQuestionnaireJson; es: StoredQuestionnaireJson }>(
    result.response.text(),
  );
  if (!parsed?.en?.questions || !parsed?.es?.questions) {
    throw new Error('AI did not return bilingual questionnaire questions');
  }
  return { en: parsed.en, es: parsed.es };
}

export async function ensureStorageForRow(
  row: StdQuestionnaireRow,
): Promise<{ en: StoredQuestionnaireJson | null; es: StoredQuestionnaireJson | null; created: boolean }> {
  const id = row.id;
  const loc = row.storage_location ?? {};
  const defaultEn = `${id}/en.json`;
  const defaultEs = `${id}/es.json`;

  const storedEn = await downloadQuestionnaireJson(loc.en || defaultEn)
    ?? (loc.en && loc.en !== defaultEn ? await downloadQuestionnaireJson(defaultEn) : null);
  const storedEs = await downloadQuestionnaireJson(loc.es || defaultEs)
    ?? (loc.es && loc.es !== defaultEs ? await downloadQuestionnaireJson(defaultEs) : null);

  let en = storedEn ?? (row.questionnaire_data_en as StoredQuestionnaireJson | null);
  let es = storedEs ?? (row.questionnaire_data_es as StoredQuestionnaireJson | null);

  if (storedEn?.questions?.length && storedEs?.questions?.length) {
    if (!loc.en || !loc.es) {
      await upsertCatalogRow({
        id,
        storage_location: { en: loc.en || defaultEn, es: loc.es || defaultEs },
      });
    }
    return { en: storedEn, es: storedEs, created: false };
  }

  if (!en?.questions?.length || !es?.questions?.length) {
    const pair = await generateStoredQuestionnairePair(
      en?.name || row.name || id,
      es?.name || row.name || id,
      en?.description || row.description || '',
      es?.description || row.description || '',
      id,
    );
    if (!en?.questions?.length) en = pair.en;
    if (!es?.questions?.length) es = pair.es;
  }

  const [pathEn, pathEs] = await Promise.all([
    storedEn?.questions?.length
      ? Promise.resolve(loc.en || defaultEn)
      : uploadQuestionnaireJson(id, 'en', en),
    storedEs?.questions?.length
      ? Promise.resolve(loc.es || defaultEs)
      : uploadQuestionnaireJson(id, 'es', es),
  ]);
  await upsertCatalogRow({
    id,
    name: en?.name || row.name || id,
    description: en?.description || row.description || '',
    storage_location: { en: pathEn, es: pathEs },
    questionnaire_data_en: en,
    questionnaire_data_es: es,
  });
  return { en, es, created: true };
}

/** Create EN/ES storage files for every table row that does not already have them. */
export async function ensureStorageForAllCatalogRows(
  onProgress?: (label: string) => void,
): Promise<{ rows: StdQuestionnaireRow[]; results: SyncResult[] }> {
  const rows = await fetchStdQuestionnaireRows();
  const results: SyncResult[] = [];

  for (const row of rows) {
    onProgress?.(row.name?.trim() || row.id);
    try {
      const { created } = await ensureStorageForRow(row);
      results.push({
        id: row.id,
        status: 'ok',
        message: created ? 'Created storage files' : 'Storage already present',
      });
    } catch (err) {
      results.push({
        id: row.id,
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { rows: await fetchStdQuestionnaireRows(), results };
}

export async function loadAllCatalogSummaries(): Promise<CatalogSummary[]> {
  const rows = await fetchStdQuestionnaireRows();
  return rows.map(row => ({
    id: row.id,
    name: row.name?.trim() || row.id,
    description: row.description?.trim() || '',
    hasStorage: !!(row.storage_location?.en || row.storage_location?.es),
  }));
}

/** Fill missing EN/ES storage files for existing table rows. */
export async function generateMissingCatalogContent(
  onProgress?: (label: string) => void,
): Promise<SyncResult[]> {
  const { data: rows, error } = await supabase
    .from('std_questionnaires')
    .select('id, name, description, storage_location, questionnaire_data_en, questionnaire_data_es')
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);

  const results: SyncResult[] = [];
  for (const row of rows ?? []) {
    const id = String(row.id);
    onProgress?.(id);
    try {
      const loc = (row.storage_location as { en?: string; es?: string } | null) ?? {};
      let en = (row.questionnaire_data_en as StoredQuestionnaireJson | null)
        ?? (loc.en ? await downloadQuestionnaireJson(loc.en) : await downloadQuestionnaireJson(`${id}/en.json`));
      let es = (row.questionnaire_data_es as StoredQuestionnaireJson | null)
        ?? (loc.es ? await downloadQuestionnaireJson(loc.es) : await downloadQuestionnaireJson(`${id}/es.json`));

      const needsGenerate = !en?.questions?.length || !es?.questions?.length;
      if (needsGenerate) {
        const pair = await generateStoredQuestionnairePair(
          en?.name || row.name || id,
          es?.name || row.name || id,
          en?.description || row.description || '',
          es?.description || row.description || '',
        );
        en = en?.questions?.length ? en : pair.en;
        es = es?.questions?.length ? es : pair.es;
      }

      const [pathEn, pathEs] = await Promise.all([
        uploadQuestionnaireJson(id, 'en', en),
        uploadQuestionnaireJson(id, 'es', es),
      ]);
      await upsertCatalogRow({
        id,
        name: en?.name || row.name || id,
        description: en?.description || row.description || '',
        storage_location: { en: pathEn, es: pathEs },
        questionnaire_data_en: en,
        questionnaire_data_es: es,
      });
      results.push({
        id,
        status: 'ok',
        message: needsGenerate ? 'Generated and uploaded' : 'Uploaded existing content',
      });
    } catch (err) {
      results.push({ id, status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  if ((rows ?? []).length === 0) {
    results.push({ id: 'table', status: 'skipped', message: 'No rows in std_questionnaires' });
  }
  return results;
}

/** List storage folders and insert/update matching std_questionnaires rows. */
export async function syncStorageToTable(
  onProgress?: (label: string) => void,
): Promise<SyncResult[]> {
  const folders = await listStorageQuestionnaireFolders();
  const results: SyncResult[] = [];

  for (const folder of folders) {
    onProgress?.(folder.id);
    try {
      const en = folder.enPath ? await downloadQuestionnaireJson(folder.enPath) : null;
      const es = folder.esPath ? await downloadQuestionnaireJson(folder.esPath) : null;
      const def = findHardcodedDefinition(folder.id, en?.name || es?.name);
      const name = en?.name || es?.name || def?.name_en || folder.id;
      const description = en?.description || es?.description || def?.description_en || '';

      await upsertCatalogRow({
        id: folder.id,
        name,
        description,
        storage_location: {
          ...(folder.enPath ? { en: folder.enPath } : {}),
          ...(folder.esPath ? { es: folder.esPath } : {}),
        },
        questionnaire_data_en: en,
        questionnaire_data_es: es,
      });

      results.push({ id: folder.id, status: 'ok', message: 'Synced from storage' });
    } catch (err) {
      results.push({ id: folder.id, status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  if (folders.length === 0) {
    results.push({ id: 'storage', status: 'skipped', message: 'No questionnaire folders found in storage' });
  }

  return results;
}

export interface AiFoundQuestionnaire {
  id: string;
  name_en: string;
  name_es: string;
  description_en: string;
  description_es: string;
}

/** Discover standard instruments via AI + hardcoded catalog, then add missing table/storage rows. */
export async function searchAndAddStandardQuestionnaires(
  onProgress?: (label: string) => void,
): Promise<SyncResult[]> {
  const { data: existingRows, error } = await supabase
    .from('std_questionnaires')
    .select('id, name, storage_location');
  if (error) throw new Error(error.message);

  const existingIds = new Set(
    (existingRows ?? []).map(row => normalizeQuestionnaireId(String(row.id))),
  );

  const model = await getGeminiModel();
  const existingList = (existingRows ?? [])
    .map(row => `- ${row.id}: ${row.name || row.id}`)
    .join('\n') || '(none)';

  onProgress?.('AI search');
  const aiResult = await model.generateContent(`You are a clinical assessment expert. Suggest widely used standardized mental-health questionnaires that should be in a therapy-platform catalog.

Already in the catalog:
${existingList}

Return ONLY a JSON array of additional well-known instruments (skip any already listed). Prefer established tools such as PHQ-9, GAD-7, PCL-5, Y-BOCS, AUDIT, DASS-21, BDI, ISI, MDQ, ASRS when missing.
[
  {
    "id": "short-slug-like-phq9",
    "name_en": "English name",
    "name_es": "Nombre en español",
    "description_en": "One-sentence English description",
    "description_es": "Descripción en una frase"
  }
]
Return 6 to 12 items. Use stable lowercase ids without spaces.`);

  let found: AiFoundQuestionnaire[] = [];
  try {
    const parsed = parseGeminiJson<AiFoundQuestionnaire[]>(aiResult.response.text());
    if (Array.isArray(parsed)) found = parsed;
  } catch {
    found = [];
  }

  const candidates = new Map<string, AiFoundQuestionnaire>();

  for (const def of standardQuestionnaires) {
    const id = normalizeQuestionnaireId(def.id);
    if (!existingIds.has(id)) {
      candidates.set(id, {
        id,
        name_en: def.name_en,
        name_es: def.name_es,
        description_en: def.description_en,
        description_es: def.description_es,
      });
    }
  }

  for (const item of found) {
    const id = normalizeQuestionnaireId(item.id || item.name_en);
    if (!id || existingIds.has(id) || candidates.has(id)) continue;
    candidates.set(id, {
      id,
      name_en: item.name_en || id,
      name_es: item.name_es || item.name_en || id,
      description_en: item.description_en || '',
      description_es: item.description_es || item.description_en || '',
    });
  }

  const results: SyncResult[] = [];
  if (candidates.size === 0) {
    results.push({ id: 'ai-search', status: 'skipped', message: 'No new standard questionnaires found' });
    return results;
  }

  for (const item of candidates.values()) {
    onProgress?.(item.id);
    try {
      const pair = await generateStoredQuestionnairePair(
        item.name_en,
        item.name_es,
        item.description_en,
        item.description_es,
      );
      const [pathEn, pathEs] = await Promise.all([
        uploadQuestionnaireJson(item.id, 'en', pair.en),
        uploadQuestionnaireJson(item.id, 'es', pair.es),
      ]);
      await upsertCatalogRow({
        id: item.id,
        name: item.name_en,
        description: item.description_en,
        storage_location: { en: pathEn, es: pathEs },
        questionnaire_data_en: pair.en,
        questionnaire_data_es: pair.es,
      });
      existingIds.add(item.id);
      results.push({ id: item.id, status: 'ok', message: `Added ${item.name_en}` });
    } catch (err) {
      results.push({ id: item.id, status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return results;
}

export async function recommendCatalogQuestionnaires(
  issue: string,
  catalog: CatalogSummary[],
  language: string,
): Promise<{ recommendedIds: string[]; context: string }> {
  if (catalog.length === 0) {
    return { recommendedIds: [], context: '' };
  }

  const catalogLines = catalog
    .map(item => `- ${item.id}: ${item.name}${item.description ? ` — ${item.description}` : ''}`)
    .join('\n');

  const model = await getGeminiModel();
  const prompt = language === 'es'
    ? `Como profesional de salud mental, elige los cuestionarios estándar del catálogo que mejor apliquen al problema del cliente. No inventes cuestionarios que no estén en la lista.

Problema del cliente:
"${issue}"

Catálogo:
${catalogLines}

Devuelve SOLO JSON:
{
  "recommendedIds": ["id1", "id2"],
  "context": "3-4 párrafos empáticos en español explicando por qué estos cuestionarios del catálogo son útiles. Menciona los nombres. No se emitirá un cuestionario nuevo; se usarán los almacenados."
}

recommendedIds debe usar solo ids de la lista, máximo 4, el más relevante primero.`
    : `As a mental health professional, choose the standard questionnaires from the catalog that best fit the client's problem. Do not invent questionnaires that are not in the list.

Client problem:
"${issue}"

Catalog:
${catalogLines}

Return ONLY JSON:
{
  "recommendedIds": ["id1", "id2"],
  "context": "3-4 empathetic English paragraphs explaining why these catalog questionnaires are useful. Mention their names. A new questionnaire will not be created; stored ones will be used."
}

recommendedIds must use only ids from the list, maximum 4, most relevant first.`;

  try {
    const result = await model.generateContent(prompt);
    const parsed = parseGeminiJson<{ recommendedIds?: string[]; context?: string }>(result.response.text());
    const allowed = new Set(catalog.map(item => item.id));
    const recommendedIds = (parsed.recommendedIds ?? []).filter(id => allowed.has(id)).slice(0, 4);
    return {
      recommendedIds: recommendedIds.length > 0 ? recommendedIds : [catalog[0].id],
      context: parsed.context?.trim() || '',
    };
  } catch {
    return {
      recommendedIds: catalog.slice(0, 2).map(item => item.id),
      context: language === 'es'
        ? 'Estos cuestionarios estándar de su catálogo pueden ayudar a su profesional a comprender mejor su situación.'
        : 'These standard questionnaires from your catalog can help your professional better understand your situation.',
    };
  }
}
