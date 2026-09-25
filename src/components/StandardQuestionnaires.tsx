import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useProfession } from '../contexts/ProfessionContext';
import { supabase } from '../lib/supabaseClient';
import { analyzeCompletedQuestionnaire } from '../lib/mariService';
import { CompanyAiIcon } from './CompanyAiIcon';
import { standardQuestionnaires } from '../lib/questionnaireDefinitions';
import type { Questionnaire } from '../lib/questionnaireDefinitions';
import { ensureStorageForAllCatalogRows, isCatalogRowActive } from '../lib/stdQuestionnaireCatalog';

export interface StandardQuestionnairesHandle {
  handleSave: () => Promise<void>;
  savingToDb: boolean;
  isSaved: boolean;
  hasSelectedQuestionnaire: boolean;
}

interface StandardQuestionnairesProps {
  clientEmail?: string;
  clientName?: string;
  issue?: string;
  professionalId?: string;
  appUserId?: string;
  onStateChange?: () => void;
  currentUser?: { id?: string; user_type?: string; email?: string };
  /** Catalog ids recommended for the current request-session issue. */
  recommendedIds?: string[];
}

type QuestionnaireQuestion = Questionnaire['questions'][number];

/** DB row + AI-saved JSON may use `question` / `options` instead of *_en / *_es. */
type RuntimeQuestionnaireQuestion = QuestionnaireQuestion & {
  question?: string;
  options?: string[];
};

/** Shape of AI-generated questionnaire data stored in Supabase. */
interface DbQuestionnaireData {
  name?: string;
  description?: string;
  questions?: RuntimeQuestionnaireQuestion[];
}

interface StandardQuestionnaireDbRow {
  id: string;
  name?: string | null;
  description?: string | null;
  questionnaire_data_en?: unknown;
  questionnaire_data_es?: unknown;
  storage_location?: { en?: string; es?: string } | string | null;
  active?: boolean | null;
  client_avail?: boolean | null;
}

/** Per-row catalog flags from `std_questionnaires` (list is driven by the table, not static definitions). */
interface StdQuestionnaireCatalogMeta {
  id: string;
  active: boolean;
  client_avail: boolean;
  name: string | null;
  description: string | null;
}

async function downloadQuestionnaireJsonFromStorage(path: string): Promise<DbQuestionnaireData | null> {
  try {
    const { data, error } = await supabase.storage.from('std_questionnaires').download(path);
    if (error || !data) return null;
    const text = await data.text();
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as DbQuestionnaireData;
    return null;
  } catch {
    return null;
  }
}

function formatCatalogLoadError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const maybeSupabaseError = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [
      maybeSupabaseError.message,
      maybeSupabaseError.details,
      maybeSupabaseError.hint,
      maybeSupabaseError.code ? `Code: ${maybeSupabaseError.code}` : null,
    ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0);

    if (parts.length > 0) return parts.join(' ');
    return JSON.stringify(error);
  }
  return String(error);
}

function normalizeQuestionnaireKey(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findStandardQuestionnaireDefinition(meta: Pick<StdQuestionnaireCatalogMeta, 'id' | 'name'>): Questionnaire | undefined {
  const rowKeys = [meta.id, meta.name]
    .map(normalizeQuestionnaireKey)
    .filter(Boolean);

  return standardQuestionnaires.find((definition) => {
    const definitionKeys = [
      definition.id,
      definition.name_en,
      definition.name_es,
    ].map(normalizeQuestionnaireKey);

    return rowKeys.some((rowKey) =>
      definitionKeys.some((definitionKey) =>
        rowKey === definitionKey ||
        rowKey.includes(definitionKey) ||
        definitionKey.includes(rowKey)
      )
    );
  });
}

function getQuestionnaireStoragePath(
  storageLocation: StandardQuestionnaireDbRow['storage_location'],
  languageCode: 'en' | 'es',
  questionnaireId: string
): string {
  if (storageLocation && typeof storageLocation === 'object') {
    const path = storageLocation[languageCode];
    if (typeof path === 'string' && path.trim()) return path;
  }

  if (typeof storageLocation === 'string' && storageLocation.trim() && languageCode === 'en') {
    return storageLocation;
  }

  return `${questionnaireId}/${languageCode}.json`;
}

export const StandardQuestionnaires = forwardRef<StandardQuestionnairesHandle, StandardQuestionnairesProps>(function StandardQuestionnaires({ clientEmail, clientName, issue, professionalId, appUserId, onStateChange, currentUser, recommendedIds = [] }, ref) {
  const { language } = useLanguage();
  const isAdminUser = currentUser?.user_type === 'Administrator';
  const { activeProfession } = useProfession();
  const professionName = activeProfession
    ? (language === 'en' ? activeProfession.name_en : activeProfession.name_es)
    : (language === 'es' ? 'salud mental' : 'mental health');
  const [selectedQuestionnaire, setSelectedQuestionnaire] = useState<Questionnaire | null>(null);
  const [responses, setResponses] = useState<Record<number, number>>({});
  const [savedQuestionnaires, setSavedQuestionnaires] = useState<Set<string>>(new Set());
  const [savingToDb, setSavingToDb] = useState(false);
  const [loadedQuestionnaires, setLoadedQuestionnaires] = useState<Map<string, { en: DbQuestionnaireData | null; es: DbQuestionnaireData | null }>>(new Map());
  const [catalogRows, setCatalogRows] = useState<StdQuestionnaireCatalogMeta[]>([]);
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null);
  const [ensuringStorage, setEnsuringStorage] = useState(false);
  const [storageProgress, setStorageProgress] = useState<string | null>(null);
  const [savingQuestionnaire, setSavingQuestionnaire] = useState(false);
  const [savedQuestionnaireVersion, setSavedQuestionnaireVersion] = useState(false);
  const [savingEmptyToStorage, setSavingEmptyToStorage] = useState(false);
  const [savedEmptyToStorage, setSavedEmptyToStorage] = useState(false);
  const [refreshingQuestionnaire, setRefreshingQuestionnaire] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<string | null>(null);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [sessionProfessionalUserId, setSessionProfessionalUserId] = useState<string | null>(null);
  const [sessionProfessionalEmail, setSessionProfessionalEmail] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    handleSave,
    savingToDb,
    isSaved: selectedQuestionnaire ? savedQuestionnaires.has(selectedQuestionnaire.id) : false,
    hasSelectedQuestionnaire: !!selectedQuestionnaire,
  }), [savingToDb, savedQuestionnaires, selectedQuestionnaire, responses]);

  useEffect(() => {
    loadQuestionnairesFromSupabase();
  }, []);

  useEffect(() => {
    onStateChange?.();
  }, [selectedQuestionnaire, savingToDb, savedQuestionnaires]);

  useEffect(() => {
    if (!selectedQuestionnaire || catalogRows.length === 0) return;
    const meta = catalogRows.find(r => r.id === selectedQuestionnaire.id);
    if (!meta) {
      setSelectedQuestionnaire(null);
      setResponses({});
    }
  }, [catalogRows, selectedQuestionnaire, isAdminUser]);

  const getDisplayDataForSelected = (): DbQuestionnaireData | null => {
    if (!selectedQuestionnaire) return null;
    const supabaseData = loadedQuestionnaires.get(selectedQuestionnaire.id);
    const entry = supabaseData ? (language === 'en' ? supabaseData.en : supabaseData.es) : null;
    return entry ?? null;
  };

  const getActiveQuestionsList = (): RuntimeQuestionnaireQuestion[] => {
    if (!selectedQuestionnaire) return [];
    const displayData = getDisplayDataForSelected();
    if (
      displayData &&
      typeof displayData === 'object' &&
      displayData !== null &&
      'questions' in displayData &&
      Array.isArray((displayData as { questions: unknown }).questions)
    ) {
      return (displayData as { questions: RuntimeQuestionnaireQuestion[] }).questions;
    }
    return selectedQuestionnaire.questions;
  };

  const buildQuestionnaireTextForSaveAndAnalysis = (): string | null => {
    if (!selectedQuestionnaire) return null;
    const displayData = getDisplayDataForSelected();
    const questions = getActiveQuestionsList();
    return questions
      .map((q: RuntimeQuestionnaireQuestion, index: number) => {
        const questionText = displayData ? q.question : (language === 'en' ? q.question_en : q.question_es);
        const options = (displayData ? q.options : language === 'en' ? q.options_en : q.options_es) ?? [];
        const selectedOption = responses[index] !== undefined ? options[responses[index]] : 'N/A';
        const optionsText = options
          .map((opt: string, optIdx: number) =>
            `${String.fromCharCode(65 + optIdx)}) ${opt}${responses[index] === optIdx ? ' [SELECTED]' : ''}`
          )
          .join('\n');
        return `${index + 1}. ${questionText}\n${optionsText}\nAnswer: ${selectedOption}`;
      })
      .join('\n\n');
  };

  useEffect(() => {
    if (!professionalId) return;
    const fetchProfessionalUser = async () => {
      try {
        const { data } = await supabase
          .from('professionals')
          .select('user_id, email')
          .eq('id', professionalId)
          .maybeSingle();
        if (data) {
          setSessionProfessionalUserId(data.user_id || null);
          setSessionProfessionalEmail(data.email || null);
        }
      } catch {
        // non-critical
      }
    };
    fetchProfessionalUser();
  }, [professionalId]);

  const loadQuestionnairesFromSupabase = async () => {
    setCatalogLoadError(null);
    setEnsuringStorage(true);
    setStorageProgress(null);
    try {
      const { rows } = await ensureStorageForAllCatalogRows((label) => {
        setStorageProgress(label);
      });

      console.log('[std_questionnaires] catalog rows returned:', rows.length, rows);

      const questionnaireMap = new Map<string, { en: DbQuestionnaireData | null; es: DbQuestionnaireData | null }>();
      const metaList: StdQuestionnaireCatalogMeta[] = [];

      await Promise.all(
        rows.map(async (row) => {
          const loc = row.storage_location;
          let en = (row.questionnaire_data_en as DbQuestionnaireData | null) ?? null;
          let es = (row.questionnaire_data_es as DbQuestionnaireData | null) ?? null;

          if (en == null) {
            const fromStorage = await downloadQuestionnaireJsonFromStorage(getQuestionnaireStoragePath(loc, 'en', row.id));
            if (fromStorage) en = fromStorage;
          }
          if (es == null) {
            const fromStorage = await downloadQuestionnaireJsonFromStorage(getQuestionnaireStoragePath(loc, 'es', row.id));
            if (fromStorage) es = fromStorage;
          }

          questionnaireMap.set(row.id, { en, es });
          metaList.push({
            id: row.id,
            active: isCatalogRowActive(row),
            client_avail: row.client_avail !== false,
            name: row.name ?? null,
            description: row.description ?? null,
          });
        })
      );

      setLoadedQuestionnaires(questionnaireMap);
      setCatalogRows(metaList);
    } catch (error) {
      console.error('Error loading questionnaires:', error);
      setCatalogLoadError(formatCatalogLoadError(error));
    } finally {
      setEnsuringStorage(false);
      setStorageProgress(null);
    }
  };

  const uploadQuestionnaireToStorage = async (
    questionnaireId: string,
    lang: 'en' | 'es',
    data: unknown
  ): Promise<string> => {
    const filePath = `${questionnaireId}/${lang}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const { error } = await supabase.storage
      .from('std_questionnaires')
      .upload(filePath, blob, { contentType: 'application/json', upsert: true });

    if (error) throw new Error(`Storage upload failed for ${filePath}: ${error.message}`);
    return filePath;
  };

  const handleSaveEmptyToStorage = async () => {
    if (!selectedQuestionnaire) return;
    setSavingEmptyToStorage(true);
    setSavedEmptyToStorage(false);
    try {
      const dbEntry = loadedQuestionnaires.get(selectedQuestionnaire.id);

      const dataEn: unknown = dbEntry?.en ?? {
        name: selectedQuestionnaire.name_en,
        description: selectedQuestionnaire.description_en,
        questions: selectedQuestionnaire.questions.map(q => ({
          question: q.question_en,
          options: q.options_en,
        })),
      };

      const dataEs: unknown = dbEntry?.es ?? {
        name: selectedQuestionnaire.name_es,
        description: selectedQuestionnaire.description_es,
        questions: selectedQuestionnaire.questions.map(q => ({
          question: q.question_es,
          options: q.options_es,
        })),
      };

      const [pathEn, pathEs] = await Promise.all([
        uploadQuestionnaireToStorage(selectedQuestionnaire.id, 'en', dataEn),
        uploadQuestionnaireToStorage(selectedQuestionnaire.id, 'es', dataEs),
      ]);

      const storageLocation = { en: pathEn, es: pathEs };

      const { data: existing } = await supabase
        .from('std_questionnaires')
        .select('id')
        .eq('id', selectedQuestionnaire.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('std_questionnaires')
          .update({ storage_location: storageLocation, updated_at: new Date().toISOString() })
          .eq('id', selectedQuestionnaire.id);
      } else {
        await supabase
          .from('std_questionnaires')
          .insert({ id: selectedQuestionnaire.id, storage_location: storageLocation });
      }

      setSavedEmptyToStorage(true);
      setTimeout(() => setSavedEmptyToStorage(false), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Error saving empty questionnaire to storage:', msg);
      alert(language === 'es'
        ? `Error al guardar en Storage: ${msg}`
        : `Error saving to Storage: ${msg}`);
    } finally {
      setSavingEmptyToStorage(false);
    }
  };

  const buildQuestionnaireForCatalog = (meta: StdQuestionnaireCatalogMeta): Questionnaire => {
    const def = findStandardQuestionnaireDefinition(meta);
    const dbEntry = loadedQuestionnaires.get(meta.id);
    const dataEn = dbEntry?.en;
    const dataEs = dbEntry?.es;
    const nameFromJsonEn =
      dataEn && typeof dataEn === 'object' && dataEn !== null && 'name' in dataEn
        ? String((dataEn as { name?: string }).name ?? '')
        : '';
    const nameFromJsonEs =
      dataEs && typeof dataEs === 'object' && dataEs !== null && 'name' in dataEs
        ? String((dataEs as { name?: string }).name ?? '')
        : '';
    const descFromJsonEn =
      dataEn && typeof dataEn === 'object' && dataEn !== null && 'description' in dataEn
        ? String((dataEn as { description?: string }).description ?? '')
        : '';
    const descFromJsonEs =
      dataEs && typeof dataEs === 'object' && dataEs !== null && 'description' in dataEs
        ? String((dataEs as { description?: string }).description ?? '')
        : '';

    return {
      id: meta.id,
      name_en: nameFromJsonEn || meta.name || def?.name_en || meta.id,
      name_es: nameFromJsonEs || meta.name || def?.name_es || meta.id,
      description_en: descFromJsonEn || meta.description || def?.description_en || '',
      description_es: descFromJsonEs || meta.description || def?.description_es || '',
      questions: def?.questions ?? [],
    };
  };

  const handleSelectQuestionnaire = (questionnaire: Questionnaire) => {
    setSelectedQuestionnaire(questionnaire);
    setResponses({});
    setSavedQuestionnaireVersion(false);
  };

  const uploadGeneralDescription = async (model: import('@google/generative-ai').GenerativeModel) => {
    try {
      const profDescEn = activeProfession?.description_en ?? '';
      const profNameEn = activeProfession?.name_en ?? 'mental health';
      const profNameEs = activeProfession?.name_es ?? 'salud mental';
      const profDescEs = activeProfession?.description_es ?? '';

      const prompt = `You are MarI. Generate a brief professional introduction (2-3 sentences) for a standard psychological questionnaires section in a mental health platform specializing in ${profNameEn}${profDescEn ? ` (${profDescEn})` : ''}.
Also provide the Spanish translation for the same introduction for ${profNameEs}${profDescEs ? ` (${profDescEs})` : ''}.

Return ONLY valid JSON in this exact structure, no additional text:
{
  "en": { "title": "Standard Psychological Questionnaires", "description": "..." },
  "es": { "title": "Cuestionarios Psicológicos Estándar", "description": "..." }
}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;

      const parsed = JSON.parse(jsonMatch[0]) as { en: unknown; es: unknown };

      await Promise.allSettled([
        supabase.storage.from('std_questionnaires').upload(
          '_general/en.json',
          new Blob([JSON.stringify(parsed.en, null, 2)], { type: 'application/json' }),
          { contentType: 'application/json', upsert: true }
        ),
        supabase.storage.from('std_questionnaires').upload(
          '_general/es.json',
          new Blob([JSON.stringify(parsed.es, null, 2)], { type: 'application/json' }),
          { contentType: 'application/json', upsert: true }
        ),
      ]);
    } catch (err) {
      console.error('Error uploading general description to storage:', err);
    }
  };

  const handleSaveQuestionnaireToSupabase = async () => {
    if (!selectedQuestionnaire) return;

    setSavingQuestionnaire(true);
    setSavedQuestionnaireVersion(false);

    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error('Gemini API key not configured');

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.7, topP: 0.95, topK: 40 },
      });

      const profDescEn = activeProfession?.description_en ?? '';
      const profNameEn = activeProfession?.name_en ?? 'mental health';
      const profNameEs = activeProfession?.name_es ?? 'salud mental';

      const prompt = `You are MarI, an empathetic AI assistant. Generate a detailed psychological questionnaire for both English and Spanish for the assessment "${selectedQuestionnaire.name_en}" / "${selectedQuestionnaire.name_es}", adapted to ${profNameEn}${profDescEn ? ` (${profDescEn})` : ''}.

English description: ${selectedQuestionnaire.description_en}
Spanish description: ${selectedQuestionnaire.description_es}

Generate BOTH language versions using the descriptions above. The Spanish version must be a proper clinical translation and adaptation of the English, NOT a word-for-word machine translation.

Return ONLY valid JSON in this exact structure, no additional text:
{
  "en": {
    "name": "${selectedQuestionnaire.name_en}",
    "description": "...",
    "questions": [
      { "question": "Question in English", "options": ["Option 1", "Option 2", "Option 3", "Option 4"] }
    ]
  },
  "es": {
    "name": "${selectedQuestionnaire.name_es}",
    "description": "...",
    "questions": [
      { "question": "Pregunta en español", "options": ["Opción 1", "Opción 2", "Opción 3", "Opción 4"] }
    ]
  }
}

Requirements for both languages:
1. Generate between 7-15 clinically relevant questions for ${profNameEn} / ${profNameEs}
2. Each question must have 4-5 answer options
3. Questions must be clear, professional, and culturally appropriate
4. Follow appropriate clinical standards for this assessment type`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Invalid JSON response from AI');

      const both = JSON.parse(jsonMatch[0]) as { en: unknown; es: unknown };
      const dataEn = both.en;
      const dataEs = both.es;

      const [storageEn, storageEs] = await Promise.allSettled([
        uploadQuestionnaireToStorage(selectedQuestionnaire.id, 'en', dataEn),
        uploadQuestionnaireToStorage(selectedQuestionnaire.id, 'es', dataEs),
        uploadGeneralDescription(model),
      ]);

      const pathEn = storageEn.status === 'fulfilled' ? storageEn.value : null;
      const pathEs = storageEs.status === 'fulfilled' ? storageEs.value : null;
      if (pathEn || pathEs) {
        const storageLocation = { ...(pathEn ? { en: pathEn } : {}), ...(pathEs ? { es: pathEs } : {}) };
        const { error } = await supabase
          .from('std_questionnaires')
          .update({ storage_location: storageLocation, updated_at: new Date().toISOString() })
          .eq('id', selectedQuestionnaire.id);
        if (error) throw error;
      }

      await loadQuestionnairesFromSupabase();
      setSavedQuestionnaireVersion(true);
      setTimeout(() => setSavedQuestionnaireVersion(false), 3000);
    } catch (error) {
      console.error('Error saving questionnaire:', error);
      alert(language === 'es'
        ? 'Error al guardar el cuestionario. Por favor, intente de nuevo.'
        : 'Error saving questionnaire. Please try again.');
    } finally {
      setSavingQuestionnaire(false);
    }
  };

  const handleRefreshQuestionnaire = async () => {
    setRefreshingQuestionnaire(true);
    try {
      await loadQuestionnairesFromSupabase();
    } finally {
      setRefreshingQuestionnaire(false);
    }
  };

  const handleResponseChange = (questionIndex: number, optionIndex: number) => {
    setResponses({
      ...responses,
      [questionIndex]: optionIndex
    });
  };

  const handleSave = async () => {
    if (!selectedQuestionnaire) return;
    const meta = catalogRows.find(r => r.id === selectedQuestionnaire.id);

    const questions = getActiveQuestionsList();
    const allQuestionsAnswered = questions.every((_, index) => responses[index] !== undefined);

    if (!allQuestionsAnswered) {
      alert(language === 'es'
        ? 'Por favor responda todas las preguntas antes de guardar el cuestionario.'
        : 'Please answer all questions before saving the questionnaire.');
      return;
    }

    const questionnaireText = buildQuestionnaireTextForSaveAndAnalysis();
    if (!questionnaireText) return;

    setSavingToDb(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();

      const questionnaireName = language === 'en' ? selectedQuestionnaire.name_en : selectedQuestionnaire.name_es;
      const displayData = getDisplayDataForSelected();

      const { error } = await supabase
        .from('questionnaire_results')
        .insert({
          user_id: authUser?.id || null,
          professional_id: professionalId || null,
          content_type: 'standard_questionnaire',
          original_text: issue || '',
          generated_text: questionnaireText,
          language: language,
          metadata: {
            questionnaire_id: selectedQuestionnaire.id,
            questionnaire_name: questionnaireName,
            client_email: clientEmail || null,
            client_name: clientName || null,
            app_user_id: appUserId || null,
            question_count: questions.length,
            client_results_visible: meta?.client_avail !== false,
            responses: Object.entries(responses).reduce((acc, [qIdx, oIdx]) => {
              const qIndex = parseInt(qIdx);
              const q = questions[qIndex];
              if (!q) return acc;
              const options = (displayData ? q.options : (language === 'en' ? q.options_en : q.options_es)) ?? [];
              const questionText = (displayData ? q.question : (language === 'en' ? q.question_en : q.question_es)) ?? '';
              acc[qIndex] = {
                option_index: Number(oIdx),
                selected_option: options[Number(oIdx)] ?? null,
                question: questionText,
              };
              return acc;
            }, {} as Record<number, { option_index: number; selected_option: string | null; question: string }>),
          }
        });

      if (error) {
        console.error('Error saving standard questionnaire:', error);
        alert(language === 'es' ? 'Error al guardar el cuestionario' : 'Error saving questionnaire');
      } else {
        setSavedQuestionnaires(prev => new Set(prev).add(selectedQuestionnaire.id));
      }
    } catch (error) {
      console.error('Error saving standard questionnaire:', error);
      alert(language === 'es' ? 'Error al guardar el cuestionario' : 'Error saving questionnaire');
    } finally {
      setSavingToDb(false);
    }
  };

  const isAllAnswered = selectedQuestionnaire
    ? getActiveQuestionsList().every((_, index) => responses[index] !== undefined)
    : false;

  const canEvaluate = (() => {
    if (!currentUser) return false;
    const meta = selectedQuestionnaire ? catalogRows.find(r => r.id === selectedQuestionnaire.id) : null;
    const resultsOnlyForPsychologist = meta?.client_avail === false;
    if (currentUser.user_type === 'Administrator') return true;
    if (currentUser.user_type === 'Professional') {
      if (sessionProfessionalUserId && currentUser.id === sessionProfessionalUserId) return true;
      if (sessionProfessionalEmail && currentUser.email === sessionProfessionalEmail) return true;
    }
    if (!resultsOnlyForPsychologist && appUserId && currentUser.id === appUserId) return true;
    return false;
  })();

  const handleEvaluate = async () => {
    if (!selectedQuestionnaire || !isAllAnswered) return;

    setIsEvaluating(true);
    setEvaluationResult(null);
    setShowEvaluation(true);

    try {
      const questionnaireName = language === 'en' ? selectedQuestionnaire.name_en : selectedQuestionnaire.name_es;
      const text = buildQuestionnaireTextForSaveAndAnalysis();
      if (!text) throw new Error('No questionnaire text');
      const { analysis } = await analyzeCompletedQuestionnaire(text, questionnaireName, language as 'en' | 'es');
      setEvaluationResult(analysis);
    } catch (error) {
      console.error('Error evaluating questionnaire:', error);
      setEvaluationResult(language === 'es'
        ? 'Error al generar la evaluación. Por favor, intente de nuevo.'
        : 'Error generating evaluation. Please try again.');
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleBack = async () => {
    if (selectedQuestionnaire && !savedQuestionnaires.has(selectedQuestionnaire.id)) {
      const allQuestionsAnswered = selectedQuestionnaire.questions.every((_, index) => responses[index] !== undefined);

      if (allQuestionsAnswered) {
        const shouldSave = window.confirm(
          language === 'es'
            ? '¿Desea guardar sus respuestas antes de volver?'
            : 'Do you want to save your responses before going back?'
        );
        if (shouldSave) {
          await handleSave();
          setSelectedQuestionnaire(null);
          setResponses({});
          return;
        }
      } else if (Object.keys(responses).length > 0) {
        const shouldDiscard = window.confirm(
          language === 'es'
            ? 'Tiene respuestas sin guardar. ¿Desea descartar sus respuestas?'
            : 'You have unsaved responses. Do you want to discard your responses?'
        );
        if (!shouldDiscard) {
          return;
        }
      }
    }

    setSelectedQuestionnaire(null);
    setResponses({});
  };

  if (selectedQuestionnaire) {
    const metaSelected = catalogRows.find(r => r.id === selectedQuestionnaire.id);
    if (metaSelected && !metaSelected.active) {
      return (
        <section className="section">
          <div style={{ marginBottom: '1.5rem' }}>
            <button
              type="button"
              onClick={handleBack}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '1rem',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
              </svg>
              {language === 'es' ? 'Volver a la lista' : 'Back to list'}
            </button>
          </div>
          <p style={{ color: '#92400e', fontWeight: 600, fontSize: '1.05rem', margin: 0 }}>
            {language === 'es'
              ? 'Este cuestionario no está disponible.'
              : 'This questionnaire is not available.'}
          </p>
        </section>
      );
    }

    const supabaseData = loadedQuestionnaires.get(selectedQuestionnaire.id);
    const displayData: DbQuestionnaireData | null = supabaseData
      ? ((language === 'en' ? supabaseData.en : supabaseData.es) ?? null)
      : null;

    return (
      <section className="section">
        <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <button
            onClick={handleBack}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '1rem'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
            {language === 'es' ? 'Volver a la lista' : 'Back to list'}
          </button>

          {isAdminUser && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleRefreshQuestionnaire}
                disabled={refreshingQuestionnaire || savingQuestionnaire}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.4rem 0.85rem',
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  border: '1px solid #fcd34d',
                  borderRadius: '6px',
                  cursor: refreshingQuestionnaire || savingQuestionnaire ? 'not-allowed' : 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  opacity: refreshingQuestionnaire || savingQuestionnaire ? 0.7 : 1,
                }}
              >
                {refreshingQuestionnaire ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                  </svg>
                )}
                {refreshingQuestionnaire
                  ? (language === 'es' ? 'Actualizando...' : 'Refreshing...')
                  : (language === 'es' ? 'Actualizar' : 'Refresh')}
              </button>

              <button
                type="button"
                onClick={handleSaveQuestionnaireToSupabase}
                disabled={savingQuestionnaire || refreshingQuestionnaire}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.4rem 0.85rem',
                  backgroundColor: savedQuestionnaireVersion ? '#dcfce7' : '#f0f9ff',
                  color: savedQuestionnaireVersion ? '#166534' : '#0369a1',
                  border: `1px solid ${savedQuestionnaireVersion ? '#86efac' : '#bae6fd'}`,
                  borderRadius: '6px',
                  cursor: savingQuestionnaire || refreshingQuestionnaire ? 'not-allowed' : 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  opacity: savingQuestionnaire || refreshingQuestionnaire ? 0.7 : 1,
                }}
              >
                <CompanyAiIcon size={18} />
                {savingQuestionnaire
                  ? (language === 'es' ? 'Generando EN + ES...' : 'Generating EN + ES...')
                  : savedQuestionnaireVersion
                    ? (language === 'es' ? '✓ EN + ES guardados' : '✓ EN + ES saved')
                    : (language === 'es' ? 'Generar EN + ES' : 'Generate EN + ES')}
              </button>
            </div>
          )}
        </div>

        <h2>{displayData?.name || (language === 'en' ? selectedQuestionnaire.name_en : selectedQuestionnaire.name_es)}</h2>
        <p style={{ marginBottom: '2rem', color: '#666', lineHeight: '1.6' }}>
          {displayData?.description || (language === 'en' ? selectedQuestionnaire.description_en : selectedQuestionnaire.description_es)}
        </p>
        {metaSelected?.client_avail === false && (
          <p style={{ margin: '-1rem 0 2rem', color: '#92400e', fontSize: '0.95rem', fontWeight: 600 }}>
            {language === 'es'
              ? 'Resultados solo disponibles para el psicólogo'
              : 'Results only available to psychologist'}
          </p>
        )}

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem'
        }}>
          {(displayData?.questions || selectedQuestionnaire.questions).map((question: RuntimeQuestionnaireQuestion, qIndex: number) => (
            <div key={qIndex} style={{
              padding: '1.5rem',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              borderLeft: '4px solid #6c63ff'
            }}>
              <p style={{
                margin: '0 0 1rem 0',
                lineHeight: '1.6',
                fontWeight: '600',
                color: '#2c3e50'
              }}>
                {qIndex + 1}. {displayData ? question.question : (language === 'en' ? question.question_en : question.question_es)}
              </p>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                marginLeft: '1rem'
              }}>
                {((displayData ? question.options : (language === 'en' ? question.options_en : question.options_es)) ?? []).map((option: string, oIndex: number) => (
                  <label
                    key={oIndex}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      cursor: 'pointer',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      backgroundColor: responses[qIndex] === oIndex ? '#e8f4f8' : 'white',
                      transition: 'background-color 0.2s',
                      border: responses[qIndex] === oIndex ? '2px solid #3498db' : '2px solid transparent'
                    }}
                    onMouseEnter={(e) => {
                      if (responses[qIndex] !== oIndex) {
                        e.currentTarget.style.backgroundColor = '#f0f0f0';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (responses[qIndex] !== oIndex) {
                        e.currentTarget.style.backgroundColor = 'white';
                      }
                    }}
                  >
                    <input
                      type="radio"
                      name={`question-${qIndex}`}
                      checked={responses[qIndex] === oIndex}
                      onChange={() => handleResponseChange(qIndex, oIndex)}
                      style={{ marginTop: '0.25rem' }}
                    />
                    <span style={{ lineHeight: '1.4' }}>{option}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '4px',
          color: '#856404'
        }}>
          <p style={{ margin: 0, lineHeight: '1.6' }}>
            {language === 'es'
              ? `Nota: Este cuestionario es solo para fines informativos. Comparta sus respuestas con su profesional de ${professionName} durante su sesión para una evaluación profesional.`
              : `Note: This questionnaire is for informational purposes only. Share your responses with your ${professionName} professional during your session for a professional assessment.`}
          </p>
        </div>

        <div
          style={{
            marginTop: '2rem',
            paddingTop: '1.5rem',
            borderTop: '2px solid #e5e7eb',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!isAllAnswered || savingToDb || (selectedQuestionnaire ? savedQuestionnaires.has(selectedQuestionnaire.id) : false)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                backgroundColor: (selectedQuestionnaire && savedQuestionnaires.has(selectedQuestionnaire.id)) ? '#28a745' : (!isAllAnswered || savingToDb) ? '#9ca3af' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: !isAllAnswered || savingToDb || (selectedQuestionnaire && savedQuestionnaires.has(selectedQuestionnaire.id)) ? 'not-allowed' : 'pointer',
                fontSize: '1rem',
                fontWeight: 600,
                opacity: savingToDb ? 0.85 : 1,
              }}
            >
              {savingToDb ? (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  {language === 'es' ? 'Enviando...' : 'Submitting...'}
                </>
              ) : selectedQuestionnaire && savedQuestionnaires.has(selectedQuestionnaire.id) ? (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                  {language === 'es' ? 'Enviado' : 'Submitted'}
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                  {language === 'es' ? 'Enviar respuestas' : 'Submit responses'}
                </>
              )}
            </button>

            {canEvaluate && isAllAnswered && (
              <button
                type="button"
                onClick={() => void handleEvaluate()}
                disabled={isEvaluating}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  backgroundColor: isEvaluating ? '#9ca3af' : '#7c3aed',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isEvaluating ? 'not-allowed' : 'pointer',
                  fontSize: '1rem',
                  fontWeight: 600,
                  transition: 'background-color 0.2s',
                  boxShadow: '0 2px 6px rgba(124,58,237,0.3)',
                }}
                onMouseEnter={(e) => { if (!isEvaluating) e.currentTarget.style.backgroundColor = '#6d28d9'; }}
                onMouseLeave={(e) => { if (!isEvaluating) e.currentTarget.style.backgroundColor = '#7c3aed'; }}
              >
                {isEvaluating ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                    {language === 'es' ? 'Evaluando...' : 'Evaluating...'}
                  </>
                ) : (
                  <>
                    <CompanyAiIcon size={20} />
                    {language === 'es' ? 'Evaluar con IA' : 'Evaluate with AI'}
                  </>
                )}
              </button>
            )}
          </div>

          {canEvaluate && (
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>
              {language === 'es'
                ? 'Evaluar con IA usa el mismo análisis MarI que en solicitud de sesión. Disponible para el cliente, el profesional asignado y el administrador.'
                : 'Evaluate with AI uses the same MarI analysis as in the client request flow. Available to the client, assigned professional, and administrator.'}
            </p>
          )}

          {isAdminUser && (
          <button
            type="button"
            onClick={() => void handleSaveEmptyToStorage()}
            disabled={savingEmptyToStorage}
            style={{
              alignSelf: 'flex-start',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 1.25rem',
              backgroundColor: savedEmptyToStorage ? '#dcfce7' : '#f8fafc',
              color: savedEmptyToStorage ? '#166534' : '#475569',
              border: `1px solid ${savedEmptyToStorage ? '#86efac' : '#cbd5e1'}`,
              borderRadius: '8px',
              cursor: savingEmptyToStorage ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
              opacity: savingEmptyToStorage ? 0.7 : 1,
              transition: 'background-color 0.15s, border-color 0.15s',
            }}
          >
            {savingEmptyToStorage ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
                {language === 'es' ? 'Guardando...' : 'Saving...'}
              </>
            ) : savedEmptyToStorage ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                {language === 'es' ? '✓ Guardado en Storage' : '✓ Saved to Storage'}
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                {language === 'es' ? 'Guardar cuestionario vacío' : 'Save empty questionnaire'}
              </>
            )}
          </button>
          )}
        </div>

        {showEvaluation && (
          <div style={{
            marginTop: '1.5rem',
            padding: '1.5rem',
            backgroundColor: '#faf5ff',
            border: '2px solid #7c3aed',
            borderRadius: '12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, color: '#5b21b6', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CompanyAiIcon size={22} />
                {language === 'es' ? 'Evaluación Clínica IA' : 'AI Clinical Evaluation'}
              </h3>
              <button
                type="button"
                onClick={() => setShowEvaluation(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#6b7280',
                  fontSize: '1.2rem',
                  padding: '0.25rem',
                }}
              >
                ✕
              </button>
            </div>
            {isEvaluating ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#7c3aed' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 1rem', display: 'block' }}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
                <p style={{ margin: 0, fontWeight: 500 }}>
                  {language === 'es' ? 'Generando evaluación clínica...' : 'Generating clinical evaluation...'}
                </p>
              </div>
            ) : evaluationResult ? (
              <div style={{ lineHeight: '1.7', color: '#374151', whiteSpace: 'pre-wrap' }}>
                {evaluationResult}
              </div>
            ) : null}
            <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#ede9fe', borderRadius: '6px', fontSize: '0.82rem', color: '#5b21b6' }}>
              {language === 'es'
                ? '⚠️ Esta evaluación es generada por IA como herramienta de apoyo clínico. No constituye un diagnóstico definitivo. El juicio clínico del profesional prevalece.'
                : '⚠️ This evaluation is AI-generated as a clinical support tool. It does not constitute a definitive diagnosis. The professional\'s clinical judgment prevails.'}
            </div>
          </div>
        )}

      </section>
    );
  }

  return (
    <section className="section">
      <h2>{language === 'es' ? 'Cuestionarios Psicológicos Estándar' : 'Standard Psychological Questionnaires'}</h2>
      <p style={{ marginBottom: '2rem', color: '#666', lineHeight: '1.6' }}>
        {language === 'es'
          ? 'Estos son cuestionarios estandarizados ampliamente utilizados en la práctica clínica para evaluar diversos aspectos de la salud mental. Seleccione un cuestionario para completarlo.'
          : 'These are standardized questionnaires widely used in clinical practice to assess various aspects of mental health. Select a questionnaire to complete it.'}
      </p>

      {ensuringStorage && (
        <p style={{ marginBottom: '1rem', color: '#4338ca', fontWeight: 600 }}>
          {language === 'es'
            ? `Preparando el catálogo y creando archivos en storage si faltan${storageProgress ? ` — ${storageProgress}` : '…'}`
            : `Loading the full catalog and creating missing storage files${storageProgress ? ` — ${storageProgress}` : '…'}`}
        </p>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '1.5rem'
      }}>
        {(() => {
          const recommendedSet = new Set(recommendedIds);
          const visibleCatalog = [...catalogRows].sort((a, b) => {
            const aRec = recommendedSet.has(a.id) ? recommendedIds.indexOf(a.id) : 999;
            const bRec = recommendedSet.has(b.id) ? recommendedIds.indexOf(b.id) : 999;
            return aRec - bRec;
          });
          if (catalogLoadError) {
            return (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem' }}>
                <p style={{ color: '#b91c1c', fontWeight: 600, marginBottom: '0.5rem' }}>
                  {language === 'es'
                    ? 'Error al cargar el catálogo de cuestionarios.'
                    : 'Error loading the questionnaire catalog.'}
                </p>
                <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>
                  {catalogLoadError}
                </p>
                <button
                  type="button"
                  onClick={() => void loadQuestionnairesFromSupabase()}
                  style={{
                    padding: '0.5rem 1.25rem',
                    backgroundColor: '#6c63ff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 500,
                  }}
                >
                  {language === 'es' ? 'Reintentar' : 'Retry'}
                </button>
              </div>
            );
          }
          if (visibleCatalog.length === 0) {
            return (
              <p style={{ gridColumn: '1 / -1', color: '#64748b', textAlign: 'center', padding: '2rem' }}>
                {language === 'es'
                  ? 'No hay cuestionarios en el catálogo (tabla std_questionnaires).'
                  : 'No questionnaires in the catalog (std_questionnaires table).'}
              </p>
            );
          }

          return visibleCatalog.map((meta) => {
            const questionnaire = buildQuestionnaireForCatalog(meta);
            const dbEntry = loadedQuestionnaires.get(meta.id);
            const def = findStandardQuestionnaireDefinition(meta);
            const hasContent = !!(dbEntry?.en ?? dbEntry?.es);
            const questionCount = (() => {
              const d = (language === 'en' ? dbEntry?.en : dbEntry?.es) ?? dbEntry?.en ?? dbEntry?.es;
              if (d && typeof d === 'object' && Array.isArray((d as { questions?: unknown[] }).questions)) {
                return (d as { questions: unknown[] }).questions.length;
              }
              return def?.questions.length ?? 0;
            })();
            const resultsOnlyForPsychologist = !meta.client_avail;
            const isRecommended = recommendedSet.has(meta.id);

            return (
              <div
                key={meta.id}
                onClick={() => handleSelectQuestionnaire(questionnaire)}
                style={{
                  padding: '1.5rem',
                  backgroundColor: isRecommended ? '#eef2ff' : resultsOnlyForPsychologist ? '#fffbeb' : '#f8f9fa',
                  borderRadius: '8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  border: isRecommended
                    ? '2px solid #4f46e5'
                    : hasContent ? '2px solid #6c63ff' : '2px solid transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                  e.currentTarget.style.borderColor = '#6c63ff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  e.currentTarget.style.borderColor = hasContent ? '#6c63ff' : 'transparent';
                }}
              >
                <h3 style={{ marginBottom: '0.5rem', color: '#2c3e50' }}>
                  {language === 'en' ? questionnaire.name_en : questionnaire.name_es}
                  {isRecommended && (
                    <span style={{
                      marginLeft: '0.5rem',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: '#4338ca',
                      background: '#e0e7ff',
                      borderRadius: '999px',
                      padding: '0.15rem 0.5rem',
                      verticalAlign: 'middle',
                    }}>
                      {language === 'es' ? 'Recomendado' : 'Recommended'}
                    </span>
                  )}
                </h3>
                <p style={{ margin: 0, color: '#666', fontSize: '0.9rem', lineHeight: '1.5' }}>
                  {language === 'en' ? questionnaire.description_en : questionnaire.description_es}
                </p>
                {resultsOnlyForPsychologist && (
                  <p style={{ margin: '0.6rem 0 0', color: '#92400e', fontSize: '0.95rem', fontWeight: 600, lineHeight: '1.5' }}>
                    {language === 'es'
                      ? 'Resultados solo disponibles para el psicólogo'
                      : 'Results only available to psychologist'}
                  </p>
                )}
                <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#6c63ff', fontWeight: '600' }}>
                  {questionCount} {language === 'es' ? 'preguntas' : 'questions'}
                  {' →'}
                  {hasContent && (
                    <span style={{ marginLeft: '0.5rem', color: '#059669', fontWeight: 500 }}>
                      {language === 'es' ? '✓ IA' : '✓ AI'}
                    </span>
                  )}
                </div>
              </div>
            );
          });
        })()}
      </div>

      <div style={{
        marginTop: '3rem',
        padding: '1.5rem',
        backgroundColor: '#e8f4f8',
        borderRadius: '8px',
        border: '2px solid #3498db'
      }}>
        <h3 style={{ marginBottom: '1rem', color: '#2c3e50' }}>
          {language === 'es' ? '📌 Información Importante' : '📌 Important Information'}
        </h3>
        <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#555', lineHeight: '1.8' }}>
          <li>
            {language === 'es'
              ? 'Estos cuestionarios no proporcionan un diagnóstico médico oficial.'
              : 'These questionnaires do not provide an official medical diagnosis.'}
          </li>
          <li>
            {language === 'es'
              ? `Son herramientas de detección utilizadas por profesionales de ${professionName}.`
              : `They are screening tools used by ${professionName} professionals.`}
          </li>
          <li>
            {language === 'es'
              ? `Comparta sus resultados con su profesional de ${professionName} para una evaluación completa.`
              : `Share your results with your ${professionName} professional for a complete assessment.`}
          </li>
          <li>
            {language === 'es'
              ? 'Si está experimentando pensamientos de autolesión, busque ayuda inmediata.'
              : 'If you are experiencing thoughts of self-harm, please seek immediate help.'}
          </li>
        </ul>
      </div>
    </section>
  );
});
