import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useProfession } from '../contexts/ProfessionContext';
import { supabase } from '../lib/supabaseClient';
import { fetchProfessionals } from '../lib/api';
import type { UserFormData, Professional } from '../types';

interface SessionCommentsViewerProps {
  currentUser: UserFormData | null;
  onClose: () => void;
}

interface SessionResults {
  score: number;
  maxScore: number;
  percentage: number;
  interpretation: string;
  interpretationEs: string;
  questionScores: number[];
}

interface QuestionItem {
  question: string;
  options: string[];
}

interface SessionCommentRow {
  id: number;
  created_at: string;
  comment_id: string | null;
  comment: string | null;
  sessionquestionnaire: string | null;
  sessionresults: string | null;
  session_id: string | null;
  session?: {
    session_date: string;
    client_name?: string;
    full_name?: string;
    client_email: string;
    professional_id: string;
    status: string;
    notes?: string;
  };
}

interface SessionRow {
  id: string;
  session_date: string;
  client_name?: string;
  full_name?: string;
  client_email: string;
  professional_id: string;
  status: string;
  notes?: string;
}

export function SessionCommentsViewer({ currentUser, onClose }: SessionCommentsViewerProps) {
  const { language } = useLanguage();
  const { activeProfession } = useProfession();

  const [rows, setRows] = useState<SessionCommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const userRole = currentUser?.user_type || 'client';

  useEffect(() => {
    loadData();
  }, [activeProfession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch professionals for display names (and profession-based filtering)
      const profs = await fetchProfessionals(activeProfession?.id);
      setProfessionals(profs);
      const professionProfIds = profs.map(p => p.id);

      // Build the sessioncomments query based on user role
      let commentsQuery = supabase
        .from('sessioncomments')
        .select('*')
        .order('created_at', { ascending: false });

      if (userRole === 'Professional') {
        // Professionals: restrict to their own sessions only
        const { data: profData } = await supabase
          .from('professionals')
          .select('id')
          .eq('email', currentUser?.email ?? '')
          .maybeSingle();

        if (profData?.id) {
          const { data: ownSessions } = await supabase
            .from('sessions')
            .select('id')
            .eq('professional_id', profData.id);

          const ownIds = (ownSessions || []).map((s: { id: string }) => s.id);
          if (ownIds.length > 0) {
            commentsQuery = commentsQuery.in('session_id', ownIds);
          } else {
            setRows([]);
            setLoading(false);
            return;
          }
        }
      } else if (userRole !== 'Administrator' && professionProfIds.length > 0) {
        // Non-admin, non-professional: restrict to profession's sessions
        const { data: sessionData } = await supabase
          .from('sessions')
          .select('id')
          .in('professional_id', professionProfIds);
        const professionSessionIds = (sessionData || []).map((s: { id: string }) => s.id);
        if (professionSessionIds.length > 0) {
          commentsQuery = commentsQuery.in('session_id', professionSessionIds);
        } else {
          setRows([]);
          setLoading(false);
          return;
        }
      } else if (userRole === 'Administrator' && professionProfIds.length > 0) {
        // Admins: filter by active profession's sessions when a profession is selected
        const { data: sessionData } = await supabase
          .from('sessions')
          .select('id')
          .in('professional_id', professionProfIds);
        const professionSessionIds = (sessionData || []).map((s: { id: string }) => s.id);
        if (professionSessionIds.length > 0) {
          commentsQuery = commentsQuery.in('session_id', professionSessionIds);
        }
        // If no sessions found for this profession, admins still see all comments (no early return)
      }

      const { data: comments, error: fetchError } = await commentsQuery;
      if (fetchError) throw fetchError;

      const commentRows = (comments || []) as SessionCommentRow[];

      // Fetch session data separately for the returned comment rows
      const sessionIds = [...new Set(
        commentRows.map(r => r.session_id).filter(Boolean) as string[]
      )];

      let sessionsMap: Record<string, SessionRow> = {};
      if (sessionIds.length > 0) {
        const { data: sessionData } = await supabase
          .from('sessions')
          .select('id, session_date, client_name, full_name, client_email, professional_id, status, notes')
          .in('id', sessionIds);

        sessionsMap = Object.fromEntries(
          (sessionData || []).map((s: SessionRow) => [s.id, s])
        );
      }

      // Merge session data into comment rows
      const enriched = commentRows.map(row => ({
        ...row,
        session: row.session_id ? sessionsMap[row.session_id] : undefined,
      }));

      setRows(enriched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const getProfessionalName = (professionalId?: string) => {
    if (!professionalId) return '—';
    const prof = professionals.find(p => p.id === professionalId);
    return prof ? (language === 'en' ? prof.name_en : prof.name_es) : professionalId;
  };

  const parseResults = (raw: string | null): SessionResults | null => {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };

  const parseQuestionnaire = (raw: string | null): { questions: QuestionItem[]; responses: Record<number, number> } | null => {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };

  const getResultColor = (percentage: number) => {
    if (percentage >= 75) return { bg: '#e8f5e9', border: '#4caf50', text: '#2e7d32' };
    if (percentage >= 55) return { bg: '#fff8e1', border: '#ffc107', text: '#f57f17' };
    return { bg: '#fdecea', border: '#f44336', text: '#c62828' };
  };

  const getInterpretation = (results: SessionResults) =>
    language === 'es' ? results.interpretationEs : results.interpretation;

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ margin: '0 0 0.25rem 0', color: '#1a237e' }}>
            {language === 'es' ? 'Comentarios y Evaluaciones de Sesión' : 'Session Comments & Evaluations'}
          </h2>
          <p style={{ margin: 0, color: '#666', fontSize: '0.875rem' }}>
            {language === 'es'
              ? 'Comentarios de sesión y resultados del cuestionario de evaluación por IA.'
              : 'Session comments and AI evaluation questionnaire results.'}
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          style={{
            padding: '0.5rem 1rem', backgroundColor: '#fff', color: '#1a237e',
            border: '1px solid #1a237e', borderRadius: '8px', fontSize: '0.85rem',
            fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
          </svg>
          {loading ? (language === 'es' ? 'Cargando...' : 'Loading...') : (language === 'es' ? 'Actualizar' : 'Refresh')}
        </button>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fdecea', border: '1px solid #f44336', borderRadius: '6px', color: '#c62828', marginBottom: '1rem', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
          {language === 'es' ? 'Cargando comentarios...' : 'Loading comments...'}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#999', fontStyle: 'italic' }}>
          {language === 'es' ? 'No hay comentarios de sesión registrados.' : 'No session comments recorded yet.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {rows.map(row => {
            const results = parseResults(row.sessionresults);
            const questionnaire = parseQuestionnaire(row.sessionquestionnaire);
            const isExpanded = expandedId === row.id;
            const sessionDate = row.session?.session_date
              ? new Date(row.session.session_date).toLocaleDateString(
                  language === 'es' ? 'es-ES' : 'en-US',
                  { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }
                )
              : (language === 'es' ? 'Fecha desconocida' : 'Unknown date');

            const clientName = row.session?.client_name || row.session?.full_name || row.session?.client_email || '—';
            const professionalName = getProfessionalName(row.session?.professional_id);
            const colors = results ? getResultColor(results.percentage) : null;

            return (
              <div key={row.id} style={{
                border: '1px solid #e0e0e0', borderRadius: '10px',
                overflow: 'hidden', backgroundColor: '#fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}>
                {/* Card header — always visible */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : row.id)}
                  style={{
                    padding: '1rem 1.25rem', cursor: 'pointer',
                    backgroundColor: isExpanded ? '#f5f5ff' : '#fff',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    gap: '1rem', flexWrap: 'wrap',
                    borderBottom: isExpanded ? '1px solid #e0e0e0' : 'none',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    {/* Date + client + professional */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 700, color: '#1a237e', fontSize: '0.95rem' }}>{sessionDate}</span>
                      <span style={{ fontSize: '0.8rem', color: '#555' }}>·</span>
                      <span style={{ fontSize: '0.875rem', color: '#333', fontWeight: 600 }}>{clientName}</span>
                      <span style={{ fontSize: '0.8rem', color: '#555' }}>·</span>
                      <span style={{ fontSize: '0.82rem', color: '#546e7a' }}>{professionalName}</span>
                    </div>

                    {/* Comment preview */}
                    {row.comment && (
                      <p style={{ margin: '0.1rem 0 0 0', fontSize: '0.85rem', color: '#555', lineHeight: 1.4 }}>
                        {!isExpanded && row.comment.length > 120
                          ? row.comment.slice(0, 120) + '…'
                          : !isExpanded ? row.comment : ''}
                        {isExpanded && ''}
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    {/* Results badge — highlighted in yellow when adequate, green when good, red when poor */}
                    {results && (
                      <div style={{
                        padding: '0.35rem 0.85rem',
                        backgroundColor: '#ffeb3b',  // always yellow highlight as requested
                        border: `1px solid ${colors?.border || '#ffc107'}`,
                        borderRadius: '20px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: '#333',
                        display: 'flex', alignItems: 'center', gap: '0.35rem',
                        whiteSpace: 'nowrap',
                      }}>
                        <span>{results.percentage}%</span>
                        <span style={{ color: colors?.text || '#333', fontSize: '0.78rem' }}>
                          {getInterpretation(results)}
                        </span>
                      </div>
                    )}
                    {!results && questionnaire && (
                      <span style={{ fontSize: '0.78rem', color: '#666', fontStyle: 'italic' }}>
                        {language === 'es' ? 'Sin resultados' : 'No results'}
                      </span>
                    )}

                    {/* Expand chevron */}
                    <svg
                      width="18" height="18" viewBox="0 0 24 24" fill="#666"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}
                    >
                      <path d="M7 10l5 5 5-5z"/>
                    </svg>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                    {/* Full comment */}
                    {row.comment && (
                      <div>
                        <h4 style={{ margin: '0 0 0.5rem 0', color: '#1a237e', fontSize: '0.9rem' }}>
                          {language === 'es' ? 'Comentarios' : 'Comments'}
                        </h4>
                        <p style={{
                          margin: 0, padding: '0.75rem 1rem',
                          backgroundColor: '#f9f9f9', borderRadius: '6px',
                          border: '1px solid #eeee', fontSize: '0.875rem',
                          color: '#333', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                        }}>
                          {row.comment}
                        </p>
                      </div>
                    )}

                    {/* Results summary — highlighted yellow */}
                    {results && (
                      <div>
                        <h4 style={{ margin: '0 0 0.5rem 0', color: '#1a237e', fontSize: '0.9rem' }}>
                          {language === 'es' ? 'Resultados del Cuestionario' : 'Questionnaire Results'}
                        </h4>
                        <div style={{
                          padding: '1rem 1.25rem',
                          backgroundColor: '#ffeb3b',
                          border: '2px solid #f9a825',
                          borderRadius: '8px',
                        }}>
                          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#333', lineHeight: 1 }}>
                                {results.percentage}%
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#555', marginTop: '0.2rem' }}>
                                {language === 'es' ? 'Puntuación' : 'Score'}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: colors?.text || '#333' }}>
                                {getInterpretation(results)}
                              </div>
                              <div style={{ fontSize: '0.82rem', color: '#555', marginTop: '0.1rem' }}>
                                {results.score} / {results.maxScore} {language === 'es' ? 'puntos' : 'points'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Questionnaire Q&A */}
                    {questionnaire && questionnaire.questions.length > 0 && (
                      <div>
                        <h4 style={{ margin: '0 0 0.75rem 0', color: '#1a237e', fontSize: '0.9rem' }}>
                          {language === 'es' ? 'Cuestionario Detallado' : 'Detailed Questionnaire'}
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {questionnaire.questions.map((q, qi) => {
                            const chosenIdx = questionnaire.responses[qi];
                            const qScore = results?.questionScores[qi];
                            const scoreColor = qScore === 3 ? '#2e7d32' : qScore === 2 ? '#f57f17' : qScore === 1 ? '#e65100' : '#c62828';

                            return (
                              <div key={qi} style={{
                                padding: '0.75rem 1rem',
                                backgroundColor: '#fafafa',
                                border: '1px solid #eee',
                                borderRadius: '6px',
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.4rem' }}>
                                  <p style={{ margin: 0, fontWeight: 600, color: '#333', fontSize: '0.85rem', flex: 1 }}>
                                    {qi + 1}. {q.question}
                                  </p>
                                  {qScore !== undefined && (
                                    <span style={{
                                      fontSize: '0.72rem', padding: '1px 7px', borderRadius: '10px',
                                      backgroundColor: '#ffeb3b', color: scoreColor,
                                      fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
                                      border: `1px solid ${scoreColor}`,
                                    }}>
                                      {qScore}/3
                                    </span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                  {q.options.map((opt, oi) => {
                                    const isSelected = chosenIdx === oi;
                                    return (
                                      <div key={oi} style={{
                                        padding: '0.3rem 0.6rem',
                                        borderRadius: '4px',
                                        fontSize: '0.82rem',
                                        backgroundColor: isSelected ? '#ffeb3b' : 'transparent',
                                        fontWeight: isSelected ? 700 : 400,
                                        color: isSelected ? '#333' : '#666',
                                        border: isSelected ? '1px solid #f9a825' : '1px solid transparent',
                                      }}>
                                        {isSelected && '✓ '}{opt}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div style={{ fontSize: '0.75rem', color: '#aaa', textAlign: 'right' }}>
                      {language === 'es' ? 'Registrado:' : 'Recorded:'}{' '}
                      {new Date(row.created_at).toLocaleString(language === 'es' ? 'es-ES' : 'en-US')}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Close button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '1.5rem', marginTop: '0.5rem', borderTop: '1px solid #e0e0e0' }}>
        <button
          onClick={onClose}
          style={{
            padding: '0.65rem 1.75rem', backgroundColor: '#fff',
            color: '#555', border: '1px solid #ccc', borderRadius: '8px',
            fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f5f5f5'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fff'; }}
        >
          {language === 'es' ? 'Cerrar' : 'Close'}
        </button>
      </div>
    </div>
  );
}
