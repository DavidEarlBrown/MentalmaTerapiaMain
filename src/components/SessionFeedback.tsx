import { useState, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { useLanguage } from '../contexts/LanguageContext';
import { useProfession } from '../contexts/ProfessionContext';
import { supabase } from '../lib/supabaseClient';
import { fetchSpecialties, fetchCounselingTypes, fetchProfessionals } from '../lib/api';
import type { Session, UserFormData, Specialty, CounselingType, Professional, ClientRequest } from '../types';
import { GeminiAiIcon } from './GeminiAiIcon';

interface SessionFeedbackProps {
  currentUser: UserFormData | null;
  onClose: () => void;
}

interface QuestionItem {
  question: string;
  options: string[];
}

interface SessionResults {
  score: number;
  maxScore: number;
  percentage: number;
  interpretation: string;
  interpretationEs: string;
  questionScores: number[];
}

interface FeedbackRecord {
  id: string;
  session_id: string;
  comment: string;
  sessionquestionnaire: {
    questions: QuestionItem[];
    responses: Record<number, number>;
  } | null;
  sessionresults: string | null;
  created_at: string;
}

export function SessionFeedback({ currentUser, onClose }: SessionFeedbackProps) {
  const { language } = useLanguage();
  const { activeProfession } = useProfession();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [clientRequest, setClientRequest] = useState<ClientRequest | null>(null);

  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [counselingTypes, setCounselingTypes] = useState<CounselingType[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);

  const [comment, setComment] = useState('');
  const [clientRating, setClientRating] = useState<number | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [responses, setResponses] = useState<Record<number, number>>({});
  const [generatingQ, setGeneratingQ] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [existingFeedback, setExistingFeedback] = useState<FeedbackRecord | null>(null);
  const [loadingFeedback, setLoadingFeedback] = useState(false);

  const userRole = currentUser?.user_type || 'client';

  useEffect(() => {
    loadReferenceData();
  }, [activeProfession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentUser) loadSessions();
  }, [currentUser, activeProfession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedSession) {
      loadClientRequest(selectedSession);
      loadExistingFeedback(selectedSession.id);
      setComment('');
      setClientRating(
        typeof selectedSession.client_rating === 'number' ? selectedSession.client_rating : null
      );
      setQuestions([]);
      setResponses({});
      setSaved(false);
      setSaveError(null);
      setAiError(null);
    }
  }, [selectedSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadReferenceData = async () => {
    try {
      const [specs, types, profs] = await Promise.all([
        fetchSpecialties(activeProfession?.id),
        fetchCounselingTypes(activeProfession?.id),
        fetchProfessionals(activeProfession?.id),
      ]);
      setSpecialties(specs);
      setCounselingTypes(types);
      setProfessionals(profs);
    } catch (err) {
      console.error('Error loading reference data:', err);
    }
  };

  /** For professionals: only sessions that are still booked or already held (exclude cancelled etc.). */
  const filterAndSortProfessionalFeedbackSessions = (rows: Session[]): Session[] => {
    const allowed = new Set(['scheduled', 'completed']);
    const filtered = rows.filter((s) => allowed.has(String(s.status ?? '').toLowerCase()));
    const scheduled = filtered.filter((s) => String(s.status ?? '').toLowerCase() === 'scheduled');
    const completed = filtered.filter((s) => String(s.status ?? '').toLowerCase() === 'completed');
    scheduled.sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime());
    completed.sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime());
    return [...scheduled, ...completed];
  };

  const loadSessions = async () => {
    if (!currentUser) return;
    setLoadingSessions(true);
    try {
      // Get professionals belonging to the active profession to restrict results
      const professionProfessionals = await fetchProfessionals(activeProfession?.id);
      const professionProfIds = professionProfessionals.map(p => p.id);

      let query = supabase
        .from('sessions')
        .select('*')
        .order('session_date', { ascending: false });

      if (userRole === 'client') {
        // Clients only see their own sessions
        query = query.eq('client_email', currentUser.email);
        // Also restrict to sessions with professionals in the active profession
        if (professionProfIds.length > 0) {
          query = query.in('professional_id', professionProfIds);
        }
      } else if (userRole === 'Professional') {
        // Signed-in professional: match row by user_id first, then email (same as SessionBooking)
        let professionalId: string | null = null;
        if (currentUser.id) {
          const { data: byUid } = await supabase
            .from('professionals')
            .select('id')
            .eq('user_id', currentUser.id)
            .maybeSingle();
          if (byUid?.id) professionalId = byUid.id;
        }
        if (!professionalId && currentUser.email?.trim()) {
          const { data: byEmail } = await supabase
            .from('professionals')
            .select('id')
            .ilike('email', currentUser.email.trim())
            .maybeSingle();
          if (byEmail?.id) professionalId = byEmail.id;
        }

        if (professionalId) {
          query = query.eq('professional_id', professionalId);
        } else {
          setSessions([]);
          return;
        }
      } else {
        // Administrators: restrict to active profession professionals only
        if (professionProfIds.length > 0) {
          query = query.in('professional_id', professionProfIds);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      const rows = data || [];
      if (userRole === 'Professional') {
        setSessions(filterAndSortProfessionalFeedbackSessions(rows));
      } else {
        setSessions(rows);
      }
    } catch (err) {
      console.error('Error loading sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const loadClientRequest = async (session: Session) => {
    try {
      const { data } = await supabase
        .from('client_requests')
        .select('*')
        .eq('client_email', session.client_email)
        .eq('professional_id', session.professional_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setClientRequest(data || null);
    } catch {
      setClientRequest(null);
    }
  };

  const loadExistingFeedback = async (sessionId: string) => {
    setLoadingFeedback(true);
    try {
      const { data } = await supabase
        .from('sessioncomments')
        .select('*')
        .eq('session_id', sessionId)
        .maybeSingle();

      if (data) {
        const fb = data as FeedbackRecord;
        setExistingFeedback(fb);
        setComment(fb.comment || '');
        if (fb.sessionquestionnaire) {
          try {
            // sessionquestionnaire is stored as text JSON
            const parsed = typeof fb.sessionquestionnaire === 'string'
              ? JSON.parse(fb.sessionquestionnaire)
              : fb.sessionquestionnaire;
            setQuestions(parsed.questions || []);
            setResponses(parsed.responses || {});
          } catch {
            setQuestions([]);
            setResponses({});
          }
        }
        setSaved(true);
      } else {
        setExistingFeedback(null);
      }
    } catch (err) {
      console.error('Error loading existing feedback:', err);
      setExistingFeedback(null);
    } finally {
      setLoadingFeedback(false);
    }
  };

  // Score: option index 0 (A) = 3pts (best), 1 (B) = 2pts, 2 (C) = 1pt, 3 (D) = 0pts (worst)
  const computeResults = (qs: QuestionItem[], resp: Record<number, number>): SessionResults => {
    const questionScores = qs.map((_, i) => {
      const optionIdx = resp[i];
      if (optionIdx === undefined) return 0;
      return Math.max(0, 3 - optionIdx);
    });
    const score = questionScores.reduce((s, v) => s + v, 0);
    const maxScore = qs.length * 3;
    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

    let interpretation = 'Needs Improvement';
    let interpretationEs = 'Necesita Mejora';
    if (percentage >= 90) { interpretation = 'Excellent'; interpretationEs = 'Excelente'; }
    else if (percentage >= 75) { interpretation = 'Good'; interpretationEs = 'Bueno'; }
    else if (percentage >= 55) { interpretation = 'Adequate'; interpretationEs = 'Adecuado'; }

    return { score, maxScore, percentage, interpretation, interpretationEs, questionScores };
  };

  const getSessionProfessional = () =>
    professionals.find(p => p.id === selectedSession?.professional_id);

  const buildPrompt = (): string => {
    const professionName = activeProfession
      ? (language === 'es' ? activeProfession.name_es : activeProfession.name_en)
      : (language === 'es' ? 'Psicología' : 'Psychology');

    const professionDesc = activeProfession
      ? (language === 'es' ? activeProfession.description_es : activeProfession.description_en)
      : '';

    const issue = clientRequest?.issue || selectedSession?.notes || '';

    const specialty = clientRequest?.specialty_id
      ? specialties.find(s => s.id === clientRequest.specialty_id)
      : null;
    const specialtyName = specialty
      ? (language === 'es' ? specialty.name_es : specialty.name_en)
      : '';

    const counselingType = clientRequest?.counseling_type_id
      ? counselingTypes.find(c => c.id === clientRequest.counseling_type_id)
      : null;
    const counselingTypeName = counselingType
      ? (language === 'es' ? counselingType.name_es : counselingType.name_en)
      : '';

    const professional = getSessionProfessional();
    const professionalName = professional
      ? (language === 'en' ? professional.name_en : professional.name_es)
      : '';
    const professionalTitle = professional
      ? [professional.Título, professional.Clasificación].filter(Boolean).join(', ')
      : '';
    const professionalSpecialties = professional
      ? (language === 'en' ? professional.specialties_en : professional.specialties_es)?.join(', ')
      : '';

    const durationText = selectedSession?.duration_minutes
      ? `${selectedSession.duration_minutes} ${language === 'es' ? 'minutos' : 'minutes'}`
      : selectedSession?.session_length
        ? `${(selectedSession.session_length) * 60} ${language === 'es' ? 'minutos' : 'minutes'}`
        : (language === 'es' ? 'No especificada' : 'Not specified');

    if (language === 'es') {
      return `Eres un evaluador clínico experto en ${professionName}.${professionDesc ? ` ${professionDesc}` : ''}

Genera exactamente 10 preguntas de opción múltiple (4 opciones cada una) para evaluar el éxito y la efectividad de una sesión terapéutica reciente, considerando estos factores:

PROFESIÓN Y PROFESIONAL:
- Campo profesional: ${professionName}
- Nombre del profesional: ${professionalName || 'No especificado'}
- Título/Clasificación: ${professionalTitle || 'No especificado'}
- Especialidades del profesional: ${professionalSpecialties || 'No especificadas'}

SESIÓN:
- Problema principal del cliente: ${issue || 'No especificado'}
- Especialidad clínica de la sesión: ${specialtyName || 'No especificada'}
- Modalidad/Tipo de terapia: ${counselingTypeName || 'No especificado'}
- Duración: ${durationText}

Las preguntas DEBEN hacer referencia específica al profesional ${professionalName ? `(${professionalName})` : ''} y a su enfoque en ${professionName}, y cubrir:
1. Alianza terapéutica con ${professionalName || 'el profesional'}
2. Progreso hacia los objetivos terapéuticos bajo la guía de ${professionalName || 'el profesional'}
3. Participación y motivación del cliente
4. Aplicación de técnicas de ${professionName} por parte de ${professionalName || 'el profesional'}
5. Manejo del problema presentado: ${issue || 'los problemas discutidos'}
6. Efectividad de la modalidad ${counselingTypeName || 'terapéutica'} utilizada
7. Estado emocional del cliente al final de la sesión
8. Plan de seguimiento propuesto por ${professionalName || 'el profesional'}
9. Cumplimiento de los objetivos de la sesión
10. Evaluación general del desempeño de ${professionalName || 'el profesional'} y el resultado de la sesión

IMPORTANTE: La opción A siempre debe ser la respuesta MÁS POSITIVA y D la MÁS NEGATIVA.

Devuelve ÚNICAMENTE un array JSON válido con exactamente 10 objetos con "question" y "options" (array de 4 strings):
[{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."]}]`;
    }

    return `You are a clinical evaluator expert in ${professionName}.${professionDesc ? ` ${professionDesc}` : ''}

Generate exactly 10 multiple-choice questions (4 options each) to evaluate the success and effectiveness of a recent therapy session, considering these factors:

PROFESSION AND PROFESSIONAL:
- Professional field: ${professionName}
- Professional's name: ${professionalName || 'Not specified'}
- Title/Classification: ${professionalTitle || 'Not specified'}
- Professional's specialties: ${professionalSpecialties || 'Not specified'}

SESSION:
- Client's main issue: ${issue || 'Not specified'}
- Clinical specialty of session: ${specialtyName || 'Not specified'}
- Therapy type / modality: ${counselingTypeName || 'Not specified'}
- Duration: ${durationText}

Questions MUST make specific reference to professional ${professionalName ? `(${professionalName})` : ''} and their ${professionName} approach, covering:
1. Therapeutic alliance with ${professionalName || 'the professional'}
2. Progress toward therapeutic goals under ${professionalName || 'the professional'}'s guidance
3. Client engagement and motivation during the session
4. Application of ${professionName} techniques by ${professionalName || 'the professional'}
5. Management of the presenting problem: ${issue || 'the issues discussed'}
6. Effectiveness of the ${counselingTypeName || 'therapeutic'} modality used
7. Client's emotional state at session close
8. Follow-up plan proposed by ${professionalName || 'the professional'}
9. Achievement of session objectives
10. Overall evaluation of ${professionalName || 'the professional'}'s performance and session outcome

IMPORTANT: Option A must always be the MOST POSITIVE answer and D the MOST NEGATIVE.

Return ONLY a valid JSON array with exactly 10 objects with "question" and "options" (array of 4 strings):
[{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."]}]`;
  };

  const handleGenerateQuestionnaire = async () => {
    if (!selectedSession) return;
    setGeneratingQ(true);
    setAiError(null);
    setQuestions([]);
    setResponses({});
    setSaved(false);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error('Gemini API key not configured');

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.4, topP: 0.85, topK: 40 },
      });

      const result = await model.generateContent(buildPrompt());
      const text = result.response.text();

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error(language === 'es' ? 'Formato de respuesta inválido' : 'Invalid response format');

      const parsed: QuestionItem[] = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed) || parsed.length === 0)
        throw new Error(language === 'es' ? 'No se generaron preguntas' : 'No questions generated');

      setQuestions(parsed.slice(0, 10));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : (language === 'es' ? 'Error al generar el cuestionario' : 'Error generating questionnaire'));
    } finally {
      setGeneratingQ(false);
    }
  };

  const handleSave = async () => {
    if (!selectedSession) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);

    try {
      const hasCommentOrQuestionnaire = Boolean(comment.trim() || questions.length > 0 || existingFeedback);

      if (hasCommentOrQuestionnaire) {
        // Compute results if questionnaire has been answered
        let sessionresults: string | null = null;
        if (questions.length > 0 && Object.keys(responses).length > 0) {
          const results = computeResults(questions, responses);
          sessionresults = JSON.stringify(results);
        }

        const payload = {
          session_id: selectedSession.id,
          comment_id: selectedSession.id, // FK to sessions.id
          comment: comment,
          sessionquestionnaire: questions.length > 0
            ? JSON.stringify({ questions, responses })
            : null,
          sessionresults,
        };

        let error;

        if (existingFeedback) {
          ({ error } = await supabase
            .from('sessioncomments')
            .update(payload)
            .eq('id', existingFeedback.id));
        } else {
          ({ error } = await supabase
            .from('sessioncomments')
            .insert([payload]));
        }

        if (error) {
          console.error('Supabase save error:', error);
          throw new Error(error.message);
        }
      }

      const { error: ratingError } = await supabase
        .from('sessions')
        .update({ client_rating: clientRating })
        .eq('id', selectedSession.id);

      if (ratingError) {
        console.error('Supabase client_rating save error:', ratingError);
        throw new Error(ratingError.message);
      }

      setSelectedSession({ ...selectedSession, client_rating: clientRating });
      setSessions((prev) =>
        prev.map((s) => (s.id === selectedSession.id ? { ...s, client_rating: clientRating } : s))
      );
      setSaved(true);
      if (hasCommentOrQuestionnaire) {
        await loadExistingFeedback(selectedSession.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setSaveError(language === 'es' ? `Error al guardar: ${msg}` : `Error saving: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const getProfessionalName = (professionalId: string) => {
    const prof = professionals.find(p => p.id === professionalId);
    return prof ? (language === 'en' ? prof.name_en : prof.name_es) : professionalId;
  };

  const getSpecialtyName = (id?: string) => {
    if (!id) return '';
    const s = specialties.find(sp => sp.id === id);
    return s ? (language === 'en' ? s.name_en : s.name_es) : '';
  };

  const getCounselingTypeName = (id?: string) => {
    if (!id) return '';
    const c = counselingTypes.find(ct => ct.id === id);
    return c ? (language === 'en' ? c.name_en : c.name_es) : '';
  };

  const unansweredCount = questions.filter((_, i) => responses[i] === undefined).length;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      <h2 style={{ marginBottom: '0.25rem', color: '#1a237e' }}>
        {language === 'es' ? 'Retroalimentación de Sesión' : 'Session Feedback'}
      </h2>
      <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        {userRole === 'Professional'
          ? language === 'es'
            ? 'Lista: sesiones programadas (próximas primero) y completadas (más recientes después). Elige una, añade comentarios y completa el cuestionario de evaluación generado por IA.'
            : 'List: scheduled sessions (soonest first) and completed sessions (most recent after that). Pick one, add comments, and complete the AI-generated evaluation questionnaire.'
          : language === 'es'
            ? 'Selecciona una sesión, agrega comentarios y completa el cuestionario de evaluación generado por IA.'
            : 'Select a session, add comments, and complete the AI-generated evaluation questionnaire.'}
      </p>

      {/* Session selector */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.5rem', color: '#333' }}>
          {language === 'es' ? 'Seleccionar Sesión' : 'Select Session'}
        </label>
        {loadingSessions ? (
          <p style={{ color: '#666' }}>{language === 'es' ? 'Cargando sesiones...' : 'Loading sessions...'}</p>
        ) : sessions.length === 0 ? (
          <p style={{ color: '#999', fontStyle: 'italic' }}>
            {language === 'es' ? 'No hay sesiones disponibles.' : 'No sessions available.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '260px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '8px', padding: '0.5rem' }}>
            {sessions.map(s => {
              const isSelected = selectedSession?.id === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedSession(s)}
                  style={{
                    padding: '0.75rem 1rem', borderRadius: '6px', cursor: 'pointer',
                    backgroundColor: isSelected ? '#1a237e' : '#f8f9fa',
                    color: isSelected ? '#fff' : '#333',
                    border: isSelected ? '1px solid #1a237e' : '1px solid #e0e0e0',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = '#e8eaf6'; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = '#f8f9fa'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.25rem' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                        {new Date(s.session_date).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
                          weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                        })}
                      </div>
                      <div style={{ fontSize: '0.82rem', opacity: 0.85, marginTop: '0.1rem' }}>
                        {s.client_name || s.full_name || s.client_email}
                        {userRole !== 'client' && ` — ${getProfessionalName(s.professional_id)}`}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px',
                      backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : '#e3f2fd',
                      color: isSelected ? '#fff' : '#1565c0', fontWeight: 600,
                    }}>
                      {s.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedSession && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Session context */}
          <div style={{ padding: '1rem 1.25rem', borderRadius: '8px', backgroundColor: '#f3f4f6', border: '1px solid #e0e0e0' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', color: '#1a237e', fontSize: '0.95rem' }}>
              {language === 'es' ? 'Contexto de la Sesión' : 'Session Context'}
            </h4>
            {loadingFeedback ? (
              <p style={{ color: '#666', margin: 0 }}>{language === 'es' ? 'Cargando...' : 'Loading...'}</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem', fontSize: '0.85rem' }}>
                {activeProfession && (
                  <div>
                    <span style={{ color: '#666' }}>{language === 'es' ? 'Profesión: ' : 'Profession: '}</span>
                    <strong>{language === 'es' ? activeProfession.name_es : activeProfession.name_en}</strong>
                  </div>
                )}
                {userRole !== 'client' && (
                  <div>
                    <span style={{ color: '#666' }}>{language === 'es' ? 'Profesional: ' : 'Professional: '}</span>
                    <strong>{getProfessionalName(selectedSession.professional_id)}</strong>
                  </div>
                )}
                {clientRequest?.specialty_id && (
                  <div>
                    <span style={{ color: '#666' }}>{language === 'es' ? 'Especialidad: ' : 'Specialty: '}</span>
                    <strong>{getSpecialtyName(clientRequest.specialty_id)}</strong>
                  </div>
                )}
                {clientRequest?.counseling_type_id && (
                  <div>
                    <span style={{ color: '#666' }}>{language === 'es' ? 'Tipo de terapia: ' : 'Therapy type: '}</span>
                    <strong>{getCounselingTypeName(clientRequest.counseling_type_id)}</strong>
                  </div>
                )}
                {clientRequest?.issue && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ color: '#666' }}>{language === 'es' ? 'Problema: ' : 'Issue: '}</span>
                    <strong>{clientRequest.issue.length > 120 ? clientRequest.issue.slice(0, 120) + '…' : clientRequest.issue}</strong>
                  </div>
                )}
                {existingFeedback && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: '0.78rem', color: '#2e7d32', backgroundColor: '#e8f5e9', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                      ✓ {language === 'es' ? 'Retroalimentación guardada' : 'Feedback saved'}
                      {existingFeedback.created_at && ` — ${new Date(existingFeedback.created_at).toLocaleDateString()}`}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Comments */}
          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.5rem', color: '#333' }}>
              {language === 'es' ? 'Comentarios sobre la Sesión' : 'Session Comments'}
            </label>
            <textarea
              value={comment}
              onChange={(e) => { setComment(e.target.value); setSaved(false); setSaveError(null); }}
              rows={5}
              placeholder={language === 'es'
                ? 'Escribe tus observaciones, notas clínicas o comentarios generales sobre esta sesión...'
                : 'Write your observations, clinical notes, or general comments about this session...'}
              style={{
                width: '100%', padding: '0.75rem', borderRadius: '6px',
                border: '1px solid #ccc', fontSize: '0.9rem', resize: 'vertical',
                fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.5,
              }}
            />
          </div>

          {/* Generate questionnaire */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <label style={{ fontWeight: 600, color: '#333' }}>
                {language === 'es' ? 'Cuestionario de Evaluación (IA — 10 preguntas)' : 'AI Evaluation Questionnaire (10 questions)'}
              </label>
              <button
                type="button"
                onClick={handleGenerateQuestionnaire}
                disabled={generatingQ}
                style={{
                  padding: '0.55rem 1.1rem', backgroundColor: generatingQ ? '#9e9e9e' : '#6c63ff',
                  color: '#fff', border: 'none', borderRadius: '8px',
                  fontSize: '0.85rem', fontWeight: 600, cursor: generatingQ ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.4rem', transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => { if (!generatingQ) e.currentTarget.style.backgroundColor = '#5852d6'; }}
                onMouseLeave={(e) => { if (!generatingQ) e.currentTarget.style.backgroundColor = '#6c63ff'; }}
              >
                <GeminiAiIcon />
                {generatingQ
                  ? (language === 'es' ? 'Generando...' : 'Generating...')
                  : questions.length > 0
                    ? (language === 'es' ? 'Regenerar' : 'Regenerate')
                    : (language === 'es' ? 'Generar con IA' : 'Generate with AI')}
              </button>
            </div>

            {aiError && (
              <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px', color: '#856404', fontSize: '0.875rem', marginBottom: '1rem' }}>
                {aiError}
              </div>
            )}

            {generatingQ && (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6c63ff', fontSize: '0.9rem' }}>
                {language === 'es' ? '✨ Generando cuestionario personalizado...' : '✨ Generating personalized questionnaire...'}
              </div>
            )}

            {questions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {questions.map((q, qi) => (
                  <div key={qi} style={{
                    padding: '1rem 1.25rem', borderRadius: '8px',
                    border: `1px solid ${responses[qi] !== undefined ? '#4caf50' : '#e0e0e0'}`,
                    backgroundColor: responses[qi] !== undefined ? '#f9fffe' : '#fff',
                    transition: 'border-color 0.2s',
                  }}>
                    <p style={{ margin: '0 0 0.75rem 0', fontWeight: 600, color: '#1a237e', fontSize: '0.9rem' }}>
                      {qi + 1}. {q.question}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {q.options.map((opt, oi) => {
                        const isChosen = responses[qi] === oi;
                        return (
                          <label key={oi} style={{
                            display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                            padding: '0.5rem 0.75rem', borderRadius: '6px', cursor: 'pointer',
                            backgroundColor: isChosen ? '#e8eaf6' : 'transparent',
                            border: isChosen ? '1px solid #5c6bc0' : '1px solid transparent',
                            transition: 'background-color 0.15s',
                          }}
                            onMouseEnter={(e) => { if (!isChosen) e.currentTarget.style.backgroundColor = '#f5f5f5'; }}
                            onMouseLeave={(e) => { if (!isChosen) e.currentTarget.style.backgroundColor = 'transparent'; }}
                          >
                            <input
                              type="radio"
                              name={`q-${qi}`}
                              checked={isChosen}
                              onChange={() => { setResponses(prev => ({ ...prev, [qi]: oi })); setSaved(false); }}
                              style={{ marginTop: '2px', accentColor: '#5c6bc0', flexShrink: 0 }}
                            />
                            <span style={{ fontSize: '0.875rem', color: '#333', lineHeight: 1.4 }}>{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {unansweredCount > 0 && (
                  <p style={{ color: '#f57c00', fontSize: '0.82rem', margin: 0 }}>
                    ⚠ {language === 'es'
                      ? `${unansweredCount} pregunta(s) sin responder`
                      : `${unansweredCount} question(s) unanswered`}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Client rating → sessions.client_rating */}
          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.5rem', color: '#333' }}>
              {language === 'es' ? 'Calificación del Cliente' : 'Client Rating'}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5].map((value) => {
                const selected = clientRating === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setClientRating(value);
                      setSaved(false);
                      setSaveError(null);
                    }}
                    aria-label={language === 'es' ? `Calificación ${value} de 5` : `Rating ${value} of 5`}
                    aria-pressed={selected}
                    style={{
                      width: '2.5rem',
                      height: '2.5rem',
                      borderRadius: '8px',
                      border: selected ? '2px solid #1a237e' : '1px solid #ccc',
                      backgroundColor: selected ? '#e8eaf6' : '#fff',
                      color: selected ? '#1a237e' : '#555',
                      fontWeight: 700,
                      fontSize: '1rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {value}
                  </button>
                );
              })}
              {clientRating != null && (
                <button
                  type="button"
                  onClick={() => {
                    setClientRating(null);
                    setSaved(false);
                    setSaveError(null);
                  }}
                  style={{
                    marginLeft: '0.25rem',
                    padding: '0.4rem 0.75rem',
                    border: 'none',
                    background: 'transparent',
                    color: '#666',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {language === 'es' ? 'Borrar' : 'Clear'}
                </button>
              )}
            </div>
            <p style={{ margin: '0.4rem 0 0', color: '#888', fontSize: '0.8rem' }}>
              {language === 'es' ? '1 = Bajo · 5 = Excelente' : '1 = Low · 5 = Excellent'}
            </p>
          </div>

          {/* Save error */}
          {saveError && (
            <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fdecea', border: '1px solid #f44336', borderRadius: '6px', color: '#c62828', fontSize: '0.875rem' }}>
              {saveError}
            </div>
          )}

          {/* Save + Close buttons */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
            gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid #e0e0e0', flexWrap: 'wrap',
          }}>
            {saved && !saveError && (
              <span style={{ color: '#2e7d32', fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                {language === 'es' ? 'Guardado' : 'Saved'}
              </span>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.65rem 1.5rem', backgroundColor: '#fff',
                color: '#555', border: '1px solid #ccc', borderRadius: '8px',
                fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f5f5f5'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fff'; }}
            >
              {language === 'es' ? 'Cerrar' : 'Close'}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || (!comment.trim() && questions.length === 0 && clientRating == null)}
              style={{
                padding: '0.65rem 1.75rem',
                backgroundColor: saving ? '#9e9e9e' : '#1a237e',
                color: '#fff', border: 'none', borderRadius: '8px',
                fontSize: '0.9rem', fontWeight: 600,
                cursor: (saving || (!comment.trim() && questions.length === 0 && clientRating == null)) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.4rem', transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => { if (!saving) e.currentTarget.style.backgroundColor = '#283593'; }}
              onMouseLeave={(e) => { if (!saving) e.currentTarget.style.backgroundColor = '#1a237e'; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
              </svg>
              {saving
                ? (language === 'es' ? 'Guardando...' : 'Saving...')
                : existingFeedback
                  ? (language === 'es' ? 'Actualizar' : 'Update')
                  : (language === 'es' ? 'Guardar' : 'Save')}
            </button>
          </div>
        </div>
      )}

      {/* Close button when no session selected */}
      {!selectedSession && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #e0e0e0' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.65rem 1.5rem', backgroundColor: '#fff',
              color: '#555', border: '1px solid #ccc', borderRadius: '8px',
              fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f5f5f5'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fff'; }}
          >
            {language === 'es' ? 'Cerrar' : 'Close'}
          </button>
        </div>
      )}
    </div>
  );
}
