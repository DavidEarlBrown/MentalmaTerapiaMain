import React, { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabaseClient';
import { fetchSpecialties, fetchProfessionals, fetchCounselingTypes, fetchSessionPrices } from '../lib/api';
import { analyzeCompletedQuestionnaire } from '../lib/mariService';
import { evaluateRefundEligibility } from '../lib/cancelSessionRefundRules';
import {
  buildCancellationNote,
  isOnTimeCancellation,
  resolveStatusAfterCancel,
  CANCEL_SESSION_NOTICE_HOURS,
  CHANGE_SESSION_PREFILL_KEY,
} from '../lib/cancelSessionPolicy';
import {
  buildClientRequestStatusUpdate,
  getClientRequestStatusValue,
} from '../lib/sessionStatus';
import {
  isUnpaidPendingAppointment,
  isUnpaidPendingRequest,
  markCanceledNoPayment,
} from '../lib/cancelUnpaidSession';
import { postZohoRefundCredit } from '../lib/zohoCancelRefund';
import type { Session, UserFormData, ClientRequest, Specialty, Professional, CounselingType, SessionPrice } from '../types';

interface ProfessionalAppointmentsProps {
  currentUser: UserFormData | null;
  reviewMode?: boolean;
  onNavigate?: (section: string) => void;
  /** Opens Request a Session with this client_request loaded for editing. */
  onChangeSession?: (requestId: string) => void;
}

interface AiContentRow {
  id: string;
  created_at: string;
  content_type: string;
  generated_text: string;
  language?: string;
  metadata?: {
    questionnaire_name?: string;
    client_email?: string;
    client_name?: string;
    clinical_ai_evaluation?: string;
    clinical_ai_evaluation_updated_at?: string;
    pdf_url?: string;
    pdfLink?: string;
    pdf?: string;
    client_results_visible?: boolean;
  } | null;
}

function questionnaireDisplayTitle(q: AiContentRow, language: string): string {
  const named = q.metadata?.questionnaire_name?.trim();
  if (named) return named;
  if (q.content_type === 'questionnaire') {
    return language === 'es'
      ? 'Cuestionario específico del problema (generado por IA)'
      : 'Problem-specific questionnaire (AI-generated)';
  }
  if (q.content_type === 'standard_questionnaire') {
    return language === 'es' ? 'Cuestionario estándar' : 'Standard questionnaire';
  }
  return language === 'es' ? 'Cuestionario completado' : 'Completed questionnaire';
}

function clientCanViewQuestionnaireResult(q: AiContentRow): boolean {
  return q.metadata?.client_results_visible !== false;
}

export function ProfessionalAppointments({
  currentUser,
  reviewMode = false,
  onNavigate,
  onChangeSession,
}: ProfessionalAppointmentsProps) {
  const { t, language } = useLanguage();
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [loadingProfessional, setLoadingProfessional] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const [pendingRequests, setPendingRequests] = useState<ClientRequest[]>([]);
  const [loadingPendingRequests, setLoadingPendingRequests] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);

  const [clientPendingRequests, setClientPendingRequests] = useState<ClientRequest[]>([]);
  const [loadingClientPending, setLoadingClientPending] = useState(false);
  const [clientPendingError, setClientPendingError] = useState<string | null>(null);

  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [activeView, setActiveView] = useState<'details' | 'questionnaires' | 'cancel' | null>(null);
  const [cancelRequest, setCancelRequest] = useState<ClientRequest | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelExecutedCount, setCancelExecutedCount] = useState(0);
  const [confirmCancelCalendar, setConfirmCancelCalendar] = useState(false);

  const [deleteUnpaidConfirming, setDeleteUnpaidConfirming] = useState(false);
  const [deleteUnpaidSubmitting, setDeleteUnpaidSubmitting] = useState(false);
  const [deleteUnpaidError, setDeleteUnpaidError] = useState<string | null>(null);

  const [loadingRequest, setLoadingRequest] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [clientRequest, setClientRequest] = useState<ClientRequest | null>(null);

  const [loadingQuestionnaires, setLoadingQuestionnaires] = useState(false);
  const [questionnairesError, setQuestionnairesError] = useState<string | null>(null);
  const [questionnaires, setQuestionnaires] = useState<AiContentRow[]>([]);
  const [selectedQuestionnaire, setSelectedQuestionnaire] = useState<AiContentRow | null>(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTitle, setPanelTitle] = useState('');
  const [panelContent, setPanelContent] = useState('');
  const [panelIsQuestionnaire, setPanelIsQuestionnaire] = useState(false);
  const [panelQuestionnaireRow, setPanelQuestionnaireRow] = useState<AiContentRow | null>(null);
  const [panelAiLoading, setPanelAiLoading] = useState(false);
  const [panelAiResult, setPanelAiResult] = useState<string | null>(null);
  const [panelAiError, setPanelAiError] = useState<string | null>(null);
  const [panelQuestionnaireGeneratedText, setPanelQuestionnaireGeneratedText] = useState('');
  const [panelViewMode, setPanelViewMode] = useState<'analysis_focus' | 'with_responses'>('analysis_focus');
  const [panelSavingAnalysis, setPanelSavingAnalysis] = useState(false);
  const [panelSaveError, setPanelSaveError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const userRole = currentUser?.user_type || 'client';
  const isAdmin = userRole === 'Administrator';
  const isProfessional = userRole === 'Professional';
  const isClient = userRole === 'client';

  const [adminClientFilter, setAdminClientFilter] = useState('');
  const [adminClientOptions, setAdminClientOptions] = useState<{ email: string; label: string }[]>([]);

  // Professional view: client selector
  const [profClientFilter, setProfClientFilter] = useState('');
  const [profClientOptions, setProfClientOptions] = useState<{ email: string; label: string }[]>([]);
  const [, setLoadingProfClients] = useState(false);

  // Comprehensive client questionnaire panel
  const [showClientQPanel, setShowClientQPanel] = useState(false);
  const [clientQAll, setClientQAll] = useState<AiContentRow[]>([]);
  const [loadingClientQAll, setLoadingClientQAll] = useState(false);
  const [clientQAllError, setClientQAllError] = useState<string | null>(null);
  const [clientQExpanded, setClientQExpanded] = useState<string | null>(null);
  const [clientAllAnalysis, setClientAllAnalysis] = useState<string | null>(null);
  const [clientAllAnalysisLoading, setClientAllAnalysisLoading] = useState(false);
  const [clientAllAnalysisError, setClientAllAnalysisError] = useState<string | null>(null);
  const [savingClientAllAnalysis, setSavingClientAllAnalysis] = useState(false);
  const [savedClientAllAnalysis, setSavedClientAllAnalysis] = useState(false);
  const [clientIssueForAnalysis, setClientIssueForAnalysis] = useState('');

  // Inline (per-appointment) AI analysis of all questionnaires
  const [inlineAnalysis, setInlineAnalysis] = useState<string | null>(null);
  const [inlineAnalysisLoading, setInlineAnalysisLoading] = useState(false);
  const [inlineAnalysisError, setInlineAnalysisError] = useState<string | null>(null);
  const [savingInlineAnalysis, setSavingInlineAnalysis] = useState(false);
  const [savedInlineAnalysis, setSavedInlineAnalysis] = useState(false);
  const [copiedInlineAnalysis, setCopiedInlineAnalysis] = useState(false);
  const [copiedClientAllAnalysis, setCopiedClientAllAnalysis] = useState(false);

  const [adminProfessionals, setAdminProfessionals] = useState<
    { id: string; name_en: string; name_es: string; sessionCount?: number }[]
  >([]);
  const [loadingAdminProfessionals, setLoadingAdminProfessionals] = useState(false);
  const [adminPsychError, setAdminPsychError] = useState<string | null>(null);

  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [counselingTypes, setCounselingTypes] = useState<CounselingType[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [sessionPrices, setSessionPrices] = useState<SessionPrice[]>([]);

  const sessionProfessionalId =
    selectedSession?.professional_id ?? clientRequest?.professional_id ?? null;
  const canManageClinicalAnalysis =
    isAdmin ||
    (!!professionalId && !!sessionProfessionalId && sessionProfessionalId === professionalId);

  useEffect(() => {
    if (!currentUser?.email) return;
    if (!isProfessional) return;

    const loadProfessionalId = async () => {
      setLoadingProfessional(true);
      try {
        // Step 1: match by user_id — set this in the professionals table to make
        // lookups permanent and immune to email changes.
        const { data: byUid } = await supabase
          .from('professionals')
          .select('id')
          .eq('user_id', currentUser.id)
          .maybeSingle();

        if (byUid?.id) {
          setProfessionalId(byUid.id);
          return;
        }

        // Step 2: match by email — used when user_id is not yet stored on the
        // professionals record (set professionals.user_id to eliminate this step).
        const email = currentUser.email?.trim();
        const { data: byEmail } = email
          ? await supabase
              .from('professionals')
              .select('id')
              .ilike('email', email)
              .maybeSingle()
          : { data: null };

        if (byEmail?.id) {
          setProfessionalId(byEmail.id);
          return;
        }

        // No professional record found for this user.
        setProfessionalId(null);
      } catch (err) {
        console.error('Unexpected error fetching professional:', err);
        setProfessionalId(null);
      } finally {
        setLoadingProfessional(false);
      }
    };

    loadProfessionalId();
  }, [currentUser?.id, currentUser?.email, isProfessional]);

  useEffect(() => {
    if (!isAdmin) return;

    const loadAdminProfessionals = async () => {
      setLoadingAdminProfessionals(true);
      setAdminPsychError(null);
      try {
        const { fetchProfessionals } = await import('../lib/api');
        const allProfessionals = await fetchProfessionals();
        const options =
          allProfessionals?.map((p: Professional) => ({
            id: p.id,
            name_en: p.name_en,
            name_es: p.name_es,
          })) || [];
        setAdminProfessionals(options);
      } catch (err) {
        console.error('Error loading professionals with bookings:', err);
        setAdminPsychError(
          language === 'es'
            ? 'No se pudieron cargar los profesionales.'
            : 'Unable to load professionals.'
        );
      } finally {
        setLoadingAdminProfessionals(false);
      }
    };

    loadAdminProfessionals();
  }, [isAdmin, language]);

  useEffect(() => {
    if (!isProfessional && !isAdmin && !isClient) return;
    const loadLookups = async () => {
      try {
        const [specs, types, psychs, prices] = await Promise.all([
          fetchSpecialties(),
          fetchCounselingTypes(),
          fetchProfessionals(),
          fetchSessionPrices(),
        ]);
        setSpecialties(specs || []);
        setCounselingTypes(types || []);
        setProfessionals(psychs || []);
        setSessionPrices(prices || []);
      } catch (err) {
        console.error('Error loading request lookups:', err);
      }
    };
    loadLookups();
  }, [isProfessional, isAdmin, isClient]);

  useEffect(() => {
    if (!isAdmin || !professionalId) {
      setAdminClientOptions([]);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('sessions')
          .select('client_email, client_name')
          .eq('professional_id', professionalId);
        if (error) throw error;
        const byEmail = new Map<string, string>();
        for (const row of data || []) {
          const em = String(row.client_email || '').trim().toLowerCase();
          if (!em) continue;
          const label = String(row.client_name || '').trim() || em;
          if (!byEmail.has(em)) byEmail.set(em, label);
        }
        const opts = [...byEmail.entries()]
          .map(([email, label]) => ({ email, label }))
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
        setAdminClientOptions(opts);
      } catch (e) {
        console.error('Error loading clients for admin filter:', e);
        setAdminClientOptions([]);
      }
    })();
  }, [isAdmin, professionalId]);

  // Build client options from all available data for the current professional:
  //   sessions     – may be narrowed by adminClientFilter for admins, so include separately
  //   pendingRequests – always full list for the professional (not filtered by adminClientFilter)
  //   adminClientOptions – full unfiltered session-client list loaded for admin view
  // All three are scoped to professionalId already, so the union is correct for both roles.
  useEffect(() => {
    const byEmail = new Map<string, string>();
    const addRow = (r: { client_email?: string; client_name?: string; full_name?: string; username?: string }) => {
      const em = (r.client_email || '').trim().toLowerCase();
      if (!em) return;
      const label = (r.client_name || r.full_name || r.username || '').trim() || em;
      if (!byEmail.has(em)) byEmail.set(em, label);
    };
    sessions.forEach(addRow);
    pendingRequests.forEach(addRow);
    // adminClientOptions already has { email, label } shape
    adminClientOptions.forEach((c) => {
      if (c.email && !byEmail.has(c.email)) byEmail.set(c.email, c.label);
    });
    const opts = [...byEmail.entries()]
      .map(([email, label]) => ({ email, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    setProfClientOptions(opts);
    setLoadingProfClients(false);
  }, [sessions, pendingRequests, adminClientOptions]);

  useEffect(() => {
    let cancelled = false;

    const finish = (rows: Session[]) => {
      if (cancelled) return;
      setSessionsError(null);
      let filtered = (rows || []).filter((s) => {
        const st = (s.status || '').toLowerCase();
        return st !== 'cancelled' && st !== 'completed';
      });
      // Safety: whenever we have a professionalId in context, only show that
      // professional's sessions — guards against RLS being too broad or the
      // session query firing before the professional filter was applied.
      if (professionalId) {
        filtered = filtered.filter((s) => s.professional_id === professionalId);
      }
      filtered.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setSessions(filtered);
    };

    const loadSessions = async () => {
      setLoadingSessions(true);
      setSessionsError(null);
      try {
        const { fetchSessions } = await import('../lib/api');

        if (isClient) {
          if (!currentUser?.email) {
            setSessions([]);
            return;
          }
          const data = await fetchSessions(currentUser.email.trim(), undefined);
          finish(data || []);
          return;
        }

        if (isAdmin) {
          if (!professionalId) {
            setSessions([]);
            return;
          }
          const clientEmail =
            adminClientFilter.trim() === '' ? undefined : adminClientFilter.trim().toLowerCase();
          const data = await fetchSessions(clientEmail, professionalId);
          finish(data || []);
          return;
        }

        if (isProfessional) {
          if (!professionalId) {
            setSessions([]);
            return;
          }
          const data = await fetchSessions(undefined, professionalId);
          finish(data || []);
        }
      } catch (err) {
        console.error('Error loading sessions:', err);
        if (!cancelled) {
          setSessions([]);
          setSessionsError(
            language === 'es'
              ? 'No se pudieron cargar las citas.'
              : 'Unable to load appointments.'
          );
        }
      } finally {
        if (!cancelled) setLoadingSessions(false);
      }
    };

    if (isClient) {
      if (!currentUser?.email) {
        setLoadingSessions(false);
        setSessions([]);
      } else {
        void loadSessions();
      }
    } else if (isAdmin) {
      if (professionalId) void loadSessions();
      else {
        setLoadingSessions(false);
        setSessions([]);
      }
    } else if (isProfessional) {
      if (professionalId) void loadSessions();
      else {
        setLoadingSessions(false);
        setSessions([]);
      }
    } else {
      setLoadingSessions(false);
      setSessions([]);
    }

    return () => {
      cancelled = true;
    };
  }, [
    isClient,
    isAdmin,
    isProfessional,
    professionalId,
    currentUser?.email,
    adminClientFilter,
    language,
  ]);

  useEffect(() => {
    if (!isClient || !currentUser?.email?.trim()) {
      setClientPendingRequests([]);
      return;
    }

    const loadClientPending = async () => {
      setLoadingClientPending(true);
      setClientPendingError(null);
      try {
        const email = currentUser.email!.trim();
        const { data, error } = await supabase
          .from('client_requests')
          .select('*')
          .ilike('client_email', email)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setClientPendingRequests((data || []) as ClientRequest[]);
      } catch (err) {
        console.error('Error loading client pending requests:', err);
        setClientPendingRequests([]);
        setClientPendingError(
          language === 'es'
            ? 'No se pudieron cargar sus solicitudes pendientes.'
            : 'Unable to load your pending requests.'
        );
      } finally {
        setLoadingClientPending(false);
      }
    };

    void loadClientPending();
  }, [isClient, currentUser?.email, language]);

  useEffect(() => {
    if (!professionalId) return;
    if (!isProfessional && !isAdmin) return;

    const loadPendingRequests = async () => {
      setLoadingPendingRequests(true);
      setPendingError(null);
      try {
        const { data, error } = await supabase
          .from('client_requests')
          .select('*')
          .eq('professional_id', professionalId)
          .neq('status', 'scheduled')
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        setPendingRequests((data || []) as ClientRequest[]);
      } catch (err) {
        console.error('Error loading pending requests for professional:', err);
        setPendingError(
          language === 'es'
            ? 'No se pudieron cargar las solicitudes pendientes.'
            : 'Unable to load pending requests.'
        );
      } finally {
        setLoadingPendingRequests(false);
      }
    };

    loadPendingRequests();
  }, [professionalId, isProfessional, isAdmin, language]);

  const handleSelectSession = (session: Session) => {
    setSelectedSession(session);
    setActiveView(null);
    setClientRequest(null);
    setRequestError(null);
    setQuestionnaires([]);
    setSelectedQuestionnaire(null);
    setQuestionnairesError(null);
    setInlineAnalysis(null);
    setInlineAnalysisError(null);
    setDeleteUnpaidConfirming(false);
    setDeleteUnpaidError(null);
  };

  const handleSelectPendingRequest = (request: ClientRequest) => {
    setSelectedSession(null);
    setClientRequest(request);
    setActiveView('details');
    setRequestError(null);
    setQuestionnaires([]);
    setSelectedQuestionnaire(null);
    setQuestionnairesError(null);
    setInlineAnalysis(null);
    setInlineAnalysisError(null);
    setDeleteUnpaidConfirming(false);
    setDeleteUnpaidError(null);
  };

  const findClientRequestForSession = async (session: Session): Promise<ClientRequest | null> => {
    const email = session.client_email?.trim();
    if (!email && !session.TimeSlotId) return null;

    const sessionDayUtc = (() => {
      try {
        return new Date(session.session_date).toISOString().slice(0, 10);
      } catch {
        return '';
      }
    })();
    // Also compare against local calendar day — preferred_date is often local, not UTC.
    const sessionDayLocal = (() => {
      try {
        const d = new Date(session.session_date);
        if (Number.isNaN(d.getTime()) || !session.session_date) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(session.session_date).slice(0, 10))) {
          return String(session.session_date).slice(0, 10);
        }
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      } catch {
        return '';
      }
    })();

    const scoreRequest = (req: ClientRequest): number => {
      let score = 0;
      const prefDay = String(req.preferred_date || '').includes('T')
        ? String(req.preferred_date).split('T')[0]
        : String(req.preferred_date || '').slice(0, 10);
      const schedDay = req.scheduled_datetime
        ? new Date(req.scheduled_datetime).toISOString().slice(0, 10)
        : '';

      if (session.TimeSlotId && req.TimeSlotId === session.TimeSlotId) score += 100;
      if (session.professional_id && req.professional_id === session.professional_id) score += 20;
      if (prefDay && (prefDay === sessionDayUtc || prefDay === sessionDayLocal)) score += 40;
      if (schedDay && (schedDay === sessionDayUtc || schedDay === sessionDayLocal)) score += 40;
      // Prefer active (pending/paid) over cancelled/completed
      const status = getClientRequestStatusValue(req);
      if (status === 0 || status === 1) score += 10;
      return score;
    };

    const pickBest = (rows: ClientRequest[]): ClientRequest | null => {
      if (rows.length === 0) return null;
      const ranked = [...rows].sort((a, b) => scoreRequest(b) - scoreRequest(a));
      return ranked[0] ?? null;
    };

    // 1) Exact TimeSlotId link when present
    if (session.TimeSlotId) {
      const { data } = await supabase
        .from('client_requests')
        .select('*')
        .eq('TimeSlotId', session.TimeSlotId)
        .maybeSingle();
      if (data) return data as ClientRequest;
    }

    if (!email) return null;

    // 2) Same lookup path as "View Request": email + professional, newest first
    if (session.professional_id) {
      const { data } = await supabase
        .from('client_requests')
        .select('*')
        .ilike('client_email', email)
        .eq('professional_id', session.professional_id)
        .order('created_at', { ascending: false })
        .limit(25);
      const best = pickBest((data || []) as ClientRequest[]);
      if (best) return best;
    }

    // 3) Email + preferred/scheduled date (UTC or local day)
    const dateCandidates = [...new Set([sessionDayUtc, sessionDayLocal].filter(Boolean))];
    for (const day of dateCandidates) {
      const { data } = await supabase
        .from('client_requests')
        .select('*')
        .ilike('client_email', email)
        .eq('preferred_date', day)
        .order('created_at', { ascending: false })
        .limit(10);
      const best = pickBest((data || []) as ClientRequest[]);
      if (best) return best;
    }

    // 4) Broad fallback: any requests for this email (same as Request a Session list source)
    const { data: byEmail } = await supabase
      .from('client_requests')
      .select('*')
      .ilike('client_email', email)
      .order('created_at', { ascending: false })
      .limit(40);

    return pickBest((byEmail || []) as ClientRequest[]);
  };

  const handleConfirmDeleteUnpaid = async () => {
    setDeleteUnpaidSubmitting(true);
    setDeleteUnpaidError(null);
    try {
      let request = clientRequest;
      if (!request && selectedSession) {
        request = await findClientRequestForSession(selectedSession);
      }
      if (!request?.id && !selectedSession) {
        throw new Error(
          language === 'es'
            ? 'No se encontró la sesión para cancelar.'
            : 'Could not find the session to cancel.',
        );
      }
      await markCanceledNoPayment({
        request,
        session: selectedSession,
        note:
          language === 'es'
            ? 'Cancelado sin pago (eliminación lógica desde Mis citas).'
            : 'Canceled no payment (logical delete from Display My Appointments).',
      });

      if (request?.id) {
        setClientPendingRequests(prev => prev.filter(r => r.id !== request!.id));
        setPendingRequests(prev => prev.filter(r => r.id !== request!.id));
        setClientRequest({
          ...request,
          status: 'cancelled',
          statusvalue: 2,
          session_status: 2,
        });
      }

      if (selectedSession?.id) {
        setSessions(prev =>
          prev.map(s => (s.id === selectedSession.id ? { ...s, status: 'cancelled' } : s)),
        );
        setSelectedSession({ ...selectedSession, status: 'cancelled' });
      } else {
        setClientRequest(null);
        setActiveView(null);
      }
      setDeleteUnpaidConfirming(false);
    } catch (err) {
      console.error('Delete unpaid session error:', err);
      setDeleteUnpaidError(
        language === 'es'
          ? 'No se pudo marcar la sesión como Cancelado sin pago.'
          : 'Could not mark the session as Canceled no payment.',
      );
    } finally {
      setDeleteUnpaidSubmitting(false);
    }
  };

  const renderDeleteUnpaidControls = () => (
    <div style={{ marginTop: '0.25rem', marginBottom: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
      {!deleteUnpaidConfirming ? (
        <button
          type="button"
          onClick={() => {
            setDeleteUnpaidError(null);
            setDeleteUnpaidConfirming(true);
          }}
          style={{
            padding: '0.55rem 1.4rem',
            borderRadius: '8px',
            border: '2px solid #b91c1c',
            backgroundColor: 'white',
            color: '#b91c1c',
            fontWeight: 700,
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <span>✕</span>
          <span>{language === 'es' ? 'Eliminar sesión' : 'Delete session'}</span>
        </button>
      ) : (
        <div
          style={{
            padding: '0.75rem 0.85rem',
            borderRadius: '8px',
            border: '1px solid #fecaca',
            backgroundColor: '#fef2f2',
            maxWidth: '28rem',
          }}
        >
          <p style={{ margin: '0 0 0.65rem', fontSize: '0.88rem', color: '#7f1d1d', lineHeight: 1.4 }}>
            {language === 'es'
              ? 'Esto no elimina la sesión. El estado cambiará a Cancelado sin pago.'
              : 'This will not physically delete the session. Status will change to Canceled no payment.'}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void handleConfirmDeleteUnpaid()}
              disabled={deleteUnpaidSubmitting}
              style={{
                padding: '0.45rem 1.1rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#b91c1c',
                color: 'white',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: deleteUnpaidSubmitting ? 'wait' : 'pointer',
              }}
            >
              {deleteUnpaidSubmitting
                ? (language === 'es' ? 'Guardando…' : 'Saving…')
                : (language === 'es' ? 'Confirmar' : 'Confirm')}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteUnpaidConfirming(false);
                setDeleteUnpaidError(null);
              }}
              disabled={deleteUnpaidSubmitting}
              style={{
                padding: '0.45rem 1.1rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                backgroundColor: 'white',
                color: '#374151',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: 'pointer',
              }}
            >
              {language === 'es' ? 'Conservar sesión' : 'Keep session'}
            </button>
          </div>
        </div>
      )}
      {deleteUnpaidError && (
        <p style={{ margin: 0, color: '#b91c1c', fontSize: '0.85rem' }}>{deleteUnpaidError}</p>
      )}
    </div>
  );

  const handleOpenCancel = async () => {
    if (!selectedSession) return;
    setCancelError(null);
    setCancelSuccess(null);
    setCancelRequest(null);
    setCancelExecutedCount(0);
    setConfirmCancelCalendar(false);
    setCancelLoading(true);
    setActiveView('cancel');

    try {
      const request = await findClientRequestForSession(selectedSession);
      setCancelRequest(request);
      if (request && Math.max(1, request.num_sessions ?? 1) > 1) {
        let q = supabase
          .from('client_requests')
          .select('id, statusvalue, session_status')
          .eq('num_sessions', request.num_sessions ?? 1);
        if (request.session_price_id != null) {
          q = q.eq('session_price_id', request.session_price_id);
        }
        if (request.user_id) {
          q = q.eq('user_id', request.user_id);
        } else if (request.client_email) {
          q = q.eq('client_email', request.client_email);
        }
        const { data } = await q;
        const completed = (data ?? []).filter(
          (r: { statusvalue?: number | null; session_status?: number }) =>
            (r.statusvalue ?? r.session_status) === 5,
        ).length;
        setCancelExecutedCount(completed);
      }
    } catch (err) {
      console.error('Error loading cancel request:', err);
    } finally {
      setCancelLoading(false);
    }
  };

  const openChangeSession = (requestId: string) => {
    try {
      sessionStorage.setItem(CHANGE_SESSION_PREFILL_KEY, requestId);
    } catch {
      // sessionStorage may be unavailable
    }
    if (onChangeSession) {
      onChangeSession(requestId);
    } else {
      onNavigate?.('client-info');
    }
  };

  const handleChangeSession = async () => {
    if (!onChangeSession && !onNavigate) return;

    // Pending request selected from the list (no sessions row) — change that request directly.
    if (!selectedSession && clientRequest?.id) {
      openChangeSession(clientRequest.id);
      return;
    }

    if (!selectedSession) return;

    try {
      // Reuse already-loaded request when View Request already fetched it.
      let found = clientRequest;
      if (!found?.id) {
        found = await findClientRequestForSession(selectedSession);
      }
      if (!found?.id) {
        alert(
          language === 'es'
            ? 'No se encontró la solicitud vinculada para cambiar esta sesión.'
            : 'Could not find the linked request to change this session.',
        );
        return;
      }
      openChangeSession(found.id);
    } catch (err) {
      console.error('Error opening change session:', err);
      alert(
        language === 'es'
          ? 'Error al abrir el cambio de sesión.'
          : 'Error opening session change.',
      );
    }
  };

  const handleConfirmCancel = async (disposition: 'refund' | 'credit') => {
    if (!cancelRequest?.id || !selectedSession) return;
    setCancelSubmitting(true);
    setCancelError(null);

    try {
      const wasPaid =
        getClientRequestStatusValue(cancelRequest) === 1
        || (selectedSession.payment_status || '').toLowerCase() === 'paid';
      const slot = cancelRequest.TimeSlotId
        ? await supabase.from('available_slots').select('id,start_time,end_time').eq('id', cancelRequest.TimeSlotId).maybeSingle().then(r => r.data ?? undefined)
        : undefined;
      const onTime = isOnTimeCancellation(cancelRequest, Date.now(), slot ?? undefined);
      const eligibility = evaluateRefundEligibility({
        request: cancelRequest,
        cancelAllRemaining: false,
        onTime,
        sessionsToCancel: 1,
        wasPaid,
        executedPackageSessions: cancelExecutedCount,
      });
      const refundEligible = disposition === 'refund' && eligibility.eligible;
      if (wasPaid && !eligibility.eligible && !confirmCancelCalendar) {
        setCancelError(
          language === 'es'
            ? 'Confirme que desea cancelar el calendario y Google Meet sin reembolso ni crédito Zoho.'
            : 'Confirm that you want to cancel the calendar and Google Meet without a refund or Zoho credit.',
        );
        setCancelSubmitting(false);
        return;
      }
      const newStatus = resolveStatusAfterCancel(wasPaid, disposition, eligibility.eligible);
      const statusUpdate = buildClientRequestStatusUpdate(cancelRequest, newStatus);
      const note = buildCancellationNote(onTime, disposition, false, 1, language, eligibility.eligible);
      const existing = cancelRequest.notes?.trim() || '';
      const combinedNotes = existing ? `${existing}\n${note}` : note;

      const { error } = await supabase
        .from('client_requests')
        .update({ ...statusUpdate, notes: combinedNotes })
        .eq('id', cancelRequest.id);

      if (error) throw error;

      // Cancel the Google Calendar / Meet event if one was created
      if (cancelRequest.calendar_event_id) {
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
              calendar_event_id: cancelRequest.calendar_event_id,
            }),
          });
          // Clear the meeting fields in client_requests
          await supabase
            .from('client_requests')
            .update({ calendar_event_id: null, meeting_uri: null, meeting_code: null })
            .eq('id', cancelRequest.id!);
        } catch (calErr) {
          console.warn('Could not cancel Google Calendar event:', calErr);
        }
      }

      // Update the sessions table: cancel status and clear meeting fields
      await supabase
        .from('sessions')
        .update({ status: 'cancelled', online_meeting_id: null, online_meeting_url: null, online_platform: null })
        .eq('id', selectedSession.id);

      let zohoNote = '';
      if (refundEligible && wasPaid) {
        if (eligibility.eligibleAmount > 0) {
          const zoho = await postZohoRefundCredit({
            request: cancelRequest,
            amount: eligibility.eligibleAmount,
            currency: eligibility.currency || cancelRequest.price_currency,
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

      setCancelSuccess(
        language === 'es'
          ? `Sesión cancelada exitosamente.${zohoNote}`
          : `Session cancelled successfully.${zohoNote}`,
      );
      // Reflect the cancellation in the local sessions list
      setSessions(prev =>
        prev.map(s => s.id === selectedSession.id ? { ...s, status: 'cancelled' } : s),
      );
    } catch (err) {
      console.error('Cancel error:', err);
      setCancelError(language === 'es' ? 'Error al cancelar la sesión.' : 'Failed to cancel session.');
    } finally {
      setCancelSubmitting(false);
    }
  };

  const resolveRequestLabels = (request: ClientRequest | null) => {
    if (!request) return { specialtyName: '', counselingTypeName: '', professionalName: '', sessionPriceLabel: '' };
    const specialty = request.specialty_id ? specialties.find((s) => s.id === request.specialty_id) : null;
    const counselingType = request.counseling_type_id ? counselingTypes.find((c) => c.id === request.counseling_type_id) : null;
    const professional = request.professional_id ? professionals.find((p) => p.id === request.professional_id) : null;
    const sessionPrice = request.session_price_id != null ? sessionPrices.find((sp) => sp.id === request.session_price_id) : null;
    return {
      specialtyName: specialty ? (language === 'es' ? specialty.name_es : specialty.name_en) : '',
      counselingTypeName: counselingType ? (language === 'es' ? counselingType.name_es : counselingType.name_en) : '',
      professionalName: professional ? (language === 'es' ? professional.name_es : professional.name_en) : '',
      sessionPriceLabel: sessionPrice ? `${sessionPrice.Name} - ${sessionPrice.Price} ${sessionPrice.Currency} (${sessionPrice.NumSessions} ${sessionPrice.NumSessions === 1 ? (language === 'es' ? 'sesión' : 'session') : (language === 'es' ? 'sesiones' : 'sessions')})` : (request.price_amount ? `${request.price_amount} ${request.price_currency || ''}` : ''),
    };
  };

  const highlightClientAnswers = (text: string) => {
    const raw = (text || '').trim();
    if (!raw) {
      return <span style={{ color: '#6b7280' }}>{language === 'es' ? '(Sin contenido)' : '(No content)'}</span>;
    }
    const lines = (text || '').split('\n');
    const highlightStyle: React.CSSProperties = {
      backgroundColor: '#fde047',
      fontWeight: 700,
      padding: '0.15em 0.35em',
      borderRadius: '4px',
      display: 'inline-block',
      marginTop: '0.2em',
      marginBottom: '0.2em',
    };
    return lines.map((line, i) => {
      const isAnswerLine = /^(Answer|Respuesta):\s*/i.test(line.trim());
      const hasSelected = line.includes('[SELECTED]');
      if (isAnswerLine) {
        return (
          <div key={i} style={{ marginBottom: '0.5em' }}>
            <span style={highlightStyle}>
              {language === 'es' ? 'Respuesta del cliente: ' : "Client's answer: "}
              {line.replace(/^(Answer|Respuesta):\s*/i, '').trim()}
            </span>
          </div>
        );
      }
      if (hasSelected) {
        return (
          <div key={i} style={{ whiteSpace: 'pre-wrap' }}>
            <span style={highlightStyle}>{line}</span>
          </div>
        );
      }
      return <div key={i} style={{ whiteSpace: 'pre-wrap' }}>{line || '\u00A0'}</div>;
    });
  };

  const buildRequestSessionLines = (request: ClientRequest | null, session: Session | null) => {
    const clientEmail = request?.client_email || session?.client_email || '';
    const issue = request?.issue || session?.notes || '';
    const preferredDate =
      request?.preferred_date ||
      (session ? new Date(session.session_date).toLocaleString() : '');
    const sessionCreatedAt = session?.created_at
      ? new Date(session.created_at).toLocaleString()
      : '';
    const preferredTime = request?.preferred_time || '';
    const status = request?.status || session?.status || '';
    const labels = resolveRequestLabels(request);

    const lines: string[] = [];
    if (clientEmail) {
      lines.push(`${language === 'es' ? 'Correo' : 'Email'}: ${clientEmail}`);
    }
    if (request?.client_phone) {
      lines.push(`${language === 'es' ? 'Teléfono' : 'Phone'}: ${request.client_phone}`);
    }
    if (labels.specialtyName) {
      lines.push(`${language === 'es' ? 'Especialidad' : 'Specialty'}: ${labels.specialtyName}`);
    }
    if (labels.counselingTypeName) {
      lines.push(`${language === 'es' ? 'Tipo de consejería' : 'Counseling type'}: ${labels.counselingTypeName}`);
    }
    if (labels.professionalName) {
      lines.push(`${language === 'es' ? 'Profesional' : 'Professional'}: ${labels.professionalName}`);
    }
    if (preferredDate || preferredTime) {
      lines.push(`${language === 'es' ? 'Fecha programada' : 'Scheduled date'}: ${preferredDate} ${preferredTime}`.trim());
    }
    if (sessionCreatedAt) {
      lines.push(`${language === 'es' ? 'Fecha de creación' : 'Date created'}: ${sessionCreatedAt}`);
    }
    if (request?.session_length != null) {
      lines.push(`${language === 'es' ? 'Duración (horas)' : 'Session length (hours)'}: ${request.session_length}`);
    }
    if (labels.sessionPriceLabel) {
      lines.push(`${language === 'es' ? 'Precio' : 'Price'}: ${labels.sessionPriceLabel}`);
    }
    if (request?.num_sessions != null) {
      lines.push(`${language === 'es' ? 'Sesiones' : 'Sessions'}: ${request.num_sessions}`);
    }
    if (status) {
      lines.push(`${language === 'es' ? 'Estado' : 'Status'}: ${status}`);
    }
    lines.push('');
    lines.push(`${language === 'es' ? 'Motivo / notas:' : 'Issue / notes:'}`);
    lines.push(issue || '-');
    if (request && request.notes) {
      lines.push('');
      lines.push(`${language === 'es' ? 'Notas adicionales:' : 'Additional notes:'}`);
      lines.push(request.notes);
    }
    return lines;
  };

  const closePanel = () => {
    setPanelOpen(false);
    setPanelViewMode('analysis_focus');
    setPanelSaveError(null);
    setPanelQuestionnaireGeneratedText('');
  };

  const openRequestInPanel = (request: ClientRequest | null, session: Session | null) => {
    const title =
      (request && (request.client_name || request.full_name || request.username)) ||
      (session && (session.client_name || session.full_name)) ||
      (language === 'es' ? 'Detalle de solicitud / sesión' : 'Request / session detail');

    const lines = buildRequestSessionLines(request, session);
    const content = [title, ''].concat(lines).join('\n');

    setPanelTitle(title);
    setPanelContent(content || (language === 'es' ? '(Sin contenido)' : '(No content)'));
    setPanelIsQuestionnaire(false);
    setPanelSaveError(null);
    setPanelOpen(true);
  };

  const handleViewRequest = async () => {
    if (!selectedSession && clientRequest) {
      setActiveView('details');
      openRequestInPanel(clientRequest, null);
      return;
    }
    if (!selectedSession) return;

    setActiveView('details');
    if (clientRequest) {
      openRequestInPanel(clientRequest, selectedSession);
      return;
    }

    setLoadingRequest(true);
    setRequestError(null);
    try {
      const { data, error } = await supabase
        .from('client_requests')
        .select('*')
        .eq('client_email', selectedSession.client_email)
        .eq('professional_id', selectedSession.professional_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching client request:', error);
        setRequestError(
          language === 'es'
            ? 'No se pudo cargar la solicitud original.'
            : 'Could not load the original request.'
        );
        openRequestInPanel(null, selectedSession);
      } else {
        setClientRequest(data as ClientRequest | null);
        openRequestInPanel((data as ClientRequest | null) || null, selectedSession);
      }
    } catch (err) {
      console.error('Unexpected error fetching client request:', err);
      setRequestError(
        language === 'es'
          ? 'No se pudo cargar la solicitud original.'
          : 'Could not load the original request.'
      );
      openRequestInPanel(null, selectedSession);
    } finally {
      setLoadingRequest(false);
    }
  };

  const handleViewQuestionnaires = async () => {
    const targetEmail = selectedSession?.client_email || clientRequest?.client_email;
    if (!targetEmail) return;

    setActiveView('questionnaires');
    setSelectedQuestionnaire(null);
    setLoadingQuestionnaires(true);
    setQuestionnairesError(null);

    try {
      const { data: dataQ, error: errQ } = await supabase
        .from('questionnaire_results')
        .select('*')
        .eq('content_type', 'questionnaire')
        .contains('metadata', { client_email: targetEmail })
        .order('created_at', { ascending: false });
      const { data: dataSq, error: errSq } = await supabase
        .from('questionnaire_results')
        .select('*')
        .eq('content_type', 'standard_questionnaire')
        .contains('metadata', { client_email: targetEmail })
        .order('created_at', { ascending: false });
      const error = errQ || errSq;
      const combined = [...(dataQ || []), ...(dataSq || [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const visibleCombined = isClient
        ? combined.filter((q) => clientCanViewQuestionnaireResult(q as AiContentRow))
        : combined;

      if (error) {
        console.error('Error fetching questionnaires:', error);
        setQuestionnairesError(
          language === 'es'
            ? 'No se pudieron cargar los cuestionarios.'
            : 'Unable to load questionnaires.'
        );
      } else {
        setQuestionnaires(visibleCombined as AiContentRow[]);
      }
    } catch (err) {
      console.error('Unexpected error fetching questionnaires:', err);
      setQuestionnairesError(
        language === 'es'
          ? 'No se pudieron cargar los cuestionarios.'
          : 'Unable to load questionnaires.'
      );
    } finally {
      setLoadingQuestionnaires(false);
    }
  };

  const openQuestionnaireInPanel = (q: AiContentRow) => {
    const pdfUrl =
      (q.metadata && q.metadata.pdf_url) ||
      (q.metadata && q.metadata.pdfLink) ||
      (q.metadata && q.metadata.pdf);

    if (pdfUrl && typeof pdfUrl === 'string') {
      window.open(pdfUrl, '_blank');
      return;
    }

    const title = questionnaireDisplayTitle(q, language);

    setPanelTitle(title);
    setPanelContent('');
    setPanelIsQuestionnaire(true);
    setPanelQuestionnaireRow(q);
    setPanelQuestionnaireGeneratedText(q.generated_text || '');
    setPanelViewMode('analysis_focus');
    setPanelSaveError(null);
    const saved = q.metadata?.clinical_ai_evaluation?.trim();
    setPanelAiResult(
      canManageClinicalAnalysis && saved && saved.length > 0 ? saved : null
    );
    setPanelAiError(null);
    setPanelAiLoading(false);
    setPanelOpen(true);
  };

  const handleSaveClinicalAnalysis = async () => {
    if (!panelQuestionnaireRow || !panelAiResult?.trim() || !canManageClinicalAnalysis) return;
    setPanelSavingAnalysis(true);
    setPanelSaveError(null);
    try {
      const newMeta = {
        ...(panelQuestionnaireRow.metadata || {}),
        clinical_ai_evaluation: panelAiResult,
        clinical_ai_evaluation_updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('questionnaire_results')
        .update({ metadata: newMeta })
        .eq('id', panelQuestionnaireRow.id);

      if (error) throw error;

      const updated: AiContentRow = { ...panelQuestionnaireRow, metadata: newMeta };
      setPanelQuestionnaireRow(updated);
      setQuestionnaires((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setSelectedQuestionnaire((s) => (s?.id === updated.id ? updated : s));
    } catch (e) {
      console.error('Save clinical analysis:', e);
      setPanelSaveError(
        language === 'es'
          ? 'No se pudo guardar el análisis.'
          : 'Could not save the analysis.'
      );
    } finally {
      setPanelSavingAnalysis(false);
    }
  };

  const handlePanelAiAnalysis = async () => {
    if (!panelQuestionnaireRow) return;
    setPanelAiLoading(true);
    setPanelAiResult(null);
    setPanelAiError(null);
    const questionnaireName = questionnaireDisplayTitle(panelQuestionnaireRow, language);
    const text = panelQuestionnaireRow.generated_text || '';
    try {
      const { analysis } = await analyzeCompletedQuestionnaire(text, questionnaireName, language as 'en' | 'es');
      setPanelAiResult(analysis);
    } catch {
      setPanelAiError(
        language === 'es'
          ? 'Error al generar el análisis. Por favor, intente de nuevo.'
          : 'Error generating analysis. Please try again.'
      );
    } finally {
      setPanelAiLoading(false);
    }
  };

  const loadClientAllQuestionnaires = async (clientEmail: string) => {
    setLoadingClientQAll(true);
    setClientQAllError(null);
    setClientQAll([]);
    setClientAllAnalysis(null);
    setClientAllAnalysisError(null);
    setClientQExpanded(null);
    try {
      // Resolve the client's user_id from the users table by email
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .ilike('email', clientEmail)
        .maybeSingle();

      const userId: string | null = (userData as { id?: string } | null)?.id ?? null;

      // Build queries: prefer user_id when available, always also try by metadata email
      const byUserId = userId
        ? supabase
            .from('questionnaire_results')
            .select('*')
            .eq('user_id', userId)
            .in('content_type', ['questionnaire', 'standard_questionnaire'])
            .order('created_at', { ascending: false })
        : null;

      const byEmail = supabase
        .from('questionnaire_results')
        .select('*')
        .in('content_type', ['questionnaire', 'standard_questionnaire'])
        .filter('metadata->>client_email', 'ilike', clientEmail)
        .order('created_at', { ascending: false });

      const [userIdResult, emailResult] = await Promise.all([
        byUserId ?? Promise.resolve({ data: [] as AiContentRow[], error: null }),
        byEmail,
      ]);

      if (emailResult.error) throw emailResult.error;

      // Merge and de-duplicate by id
      const seen = new Set<string>();
      const combined: AiContentRow[] = [];
      for (const row of [...(userIdResult.data || []), ...(emailResult.data || [])]) {
        const r = row as AiContentRow;
        if (!seen.has(r.id)) { seen.add(r.id); combined.push(r); }
      }
      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setClientQAll(combined);

      // Fetch the client's presenting issue as context for AI analysis
      try {
        const { data: reqData } = await supabase
          .from('client_requests')
          .select('issue')
          .ilike('client_email', clientEmail)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setClientIssueForAnalysis((reqData as { issue?: string } | null)?.issue || '');
      } catch { /* ignore */ }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setClientQAllError(
        language === 'es' ? `Error al cargar cuestionarios: ${msg}` : `Error loading questionnaires: ${msg}`
      );
    } finally {
      setLoadingClientQAll(false);
    }
  };

  const handleOpenClientQPanel = async () => {
    if (!profClientFilter) return;
    setShowClientQPanel(true);
    await loadClientAllQuestionnaires(profClientFilter);
  };

  const handleClientAllAiAnalysis = async () => {
    if (clientQAll.length === 0) return;
    setClientAllAnalysisLoading(true);
    setClientAllAnalysis(null);
    setClientAllAnalysisError(null);
    try {
      const { analyzeAllClientQuestionnaires } = await import('../lib/mariService');
      const items = clientQAll
        .filter((q) => q.generated_text?.trim())
        .map((q) => ({ name: questionnaireDisplayTitle(q, language), text: q.generated_text || '' }));
      if (items.length === 0) {
        setClientAllAnalysisError(
          language === 'es'
            ? 'No hay contenido de cuestionarios para analizar.'
            : 'No questionnaire content to analyze.'
        );
        return;
      }
      const { analysis } = await analyzeAllClientQuestionnaires(items, clientIssueForAnalysis, language as 'en' | 'es');
      setClientAllAnalysis(analysis);
    } catch {
      setClientAllAnalysisError(
        language === 'es'
          ? 'Error al generar el análisis. Por favor, intente de nuevo.'
          : 'Error generating analysis. Please try again.'
      );
    } finally {
      setClientAllAnalysisLoading(false);
    }
  };

  const handleInlineAiAnalysis = async () => {
    if (questionnaires.length === 0) return;
    setInlineAnalysisLoading(true);
    setInlineAnalysis(null);
    setInlineAnalysisError(null);
    try {
      const { analyzeAllClientQuestionnaires } = await import('../lib/mariService');
      const items = questionnaires
        .filter((q) => q.generated_text?.trim())
        .map((q) => ({ name: questionnaireDisplayTitle(q, language), text: q.generated_text || '' }));
      if (items.length === 0) {
        setInlineAnalysisError(
          language === 'es'
            ? 'No hay contenido de cuestionarios para analizar.'
            : 'No questionnaire content to analyze.'
        );
        return;
      }
      const issue = clientRequest?.issue || selectedSession?.notes || '';
      const { analysis } = await analyzeAllClientQuestionnaires(items, issue, language as 'en' | 'es');
      setInlineAnalysis(analysis);
    } catch {
      setInlineAnalysisError(
        language === 'es'
          ? 'Error al generar el análisis. Por favor, intente de nuevo.'
          : 'Error generating analysis. Please try again.'
      );
    } finally {
      setInlineAnalysisLoading(false);
    }
  };

  const handleSaveInlineAnalysis = async () => {
    if (!inlineAnalysis) return;
    const clientEmail = selectedSession?.client_email || clientRequest?.client_email;
    if (!clientEmail) return;
    setSavingInlineAnalysis(true);
    setSavedInlineAnalysis(false);
    try {
      const sanitized = clientEmail.replace(/[^a-zA-Z0-9._-]/g, '_');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = `${sanitized}/comprehensive_analysis_${timestamp}.json`;
      const payload = {
        clientEmail,
        analysisDate: new Date().toISOString(),
        language,
        questionnairesAnalyzed: questionnaires.length,
        questionnaireNames: questionnaires.map((q) => questionnaireDisplayTitle(q, language)),
        clientIssue: clientRequest?.issue || selectedSession?.notes || '',
        comprehensiveAnalysis: inlineAnalysis,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const { error } = await supabase.storage
        .from('std_questionnaires')
        .upload(filePath, blob, { contentType: 'application/json', upsert: true });
      if (error) throw new Error(error.message);
      setSavedInlineAnalysis(true);
      setTimeout(() => setSavedInlineAnalysis(false), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(language === 'es' ? `Error al guardar: ${msg}` : `Error saving: ${msg}`);
    } finally {
      setSavingInlineAnalysis(false);
    }
  };

  const handleSaveClientAllAnalysis = async () => {
    if (!clientAllAnalysis || !profClientFilter) return;
    setSavingClientAllAnalysis(true);
    setSavedClientAllAnalysis(false);
    try {
      const sanitized = profClientFilter.replace(/[^a-zA-Z0-9._-]/g, '_');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = `${sanitized}/comprehensive_analysis_${timestamp}.json`;
      const payload = {
        clientEmail: profClientFilter,
        analysisDate: new Date().toISOString(),
        language,
        questionnairesAnalyzed: clientQAll.length,
        questionnaireNames: clientQAll.map((q) => questionnaireDisplayTitle(q, language)),
        clientIssue: clientIssueForAnalysis,
        comprehensiveAnalysis: clientAllAnalysis,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const { error } = await supabase.storage
        .from('std_questionnaires')
        .upload(filePath, blob, { contentType: 'application/json', upsert: true });
      if (error) throw new Error(error.message);
      setSavedClientAllAnalysis(true);
      setTimeout(() => setSavedClientAllAnalysis(false), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(language === 'es' ? `Error al guardar: ${msg}` : `Error saving: ${msg}`);
    } finally {
      setSavingClientAllAnalysis(false);
    }
  };

  if (!currentUser) {
    return (
      <section className="section">
        <h2>{language === 'es' ? 'Acceso Restringido' : 'Access Restricted'}</h2>
        <p style={{ marginBottom: '1rem', color: '#666', lineHeight: '1.6' }}>
          {language === 'es'
            ? 'Inicie sesión para ver sus citas y sesiones.'
            : 'Please sign in to view your appointments and sessions.'}
        </p>
      </section>
    );
  }

  if (!isClient && !isProfessional && !isAdmin) {
    return (
      <section className="section">
        <h2>{language === 'es' ? 'Acceso Restringido' : 'Access Restricted'}</h2>
        <p style={{ marginBottom: '1rem', color: '#666', lineHeight: '1.6' }}>
          {language === 'es'
            ? 'Su tipo de cuenta no puede acceder a esta sección.'
            : 'Your account type cannot access this section.'}
        </p>
      </section>
    );
  }

  return (
    <section className="section">
      <h2>
        {reviewMode
          ? (language === 'es' ? 'Revisar Datos de Sesión' : 'Review Session Data')
          : (language === 'es' ? 'Mis Citas' : 'My Appointments')}
      </h2>
      <p className="section-subtitle">
        {reviewMode
          ? (language === 'es'
              ? 'Vea todas sus sesiones reservadas y revise los cuestionarios completados por cada cliente.'
              : 'View all your booked sessions and review completed questionnaires for each client.')
          : isClient
            ? (language === 'es'
                ? 'Vea sus solicitudes pendientes y todas las citas pendientes o confirmadas vinculadas a su cuenta.'
                : 'View your pending requests and all pending or confirmed appointments linked to your account.')
            : isAdmin
              ? (language === 'es'
                  ? 'Elija un profesional y, si lo desea, un cliente para filtrar las citas reservadas.'
                  : 'Choose a professional and optionally a client to filter booked sessions.')
              : (language === 'es'
                  ? 'Vea sus citas pendientes y reservadas, revise la solicitud original y los cuestionarios completados del cliente.'
                  : "View your pending and booked appointments, review the original request, and see the client's completed questionnaires.")}
      </p>

      {isProfessional && (
        <>
          {loadingProfessional && (
            <p style={{ color: '#666' }}>
              {language === 'es'
                ? 'Cargando información del profesional...'
                : 'Loading professional information...'}
            </p>
          )}

          {!loadingProfessional && !professionalId && (
            <p style={{ color: '#b91c1c', marginBottom: '1rem' }}>
              {language === 'es'
                ? 'No se encontró un registro de profesional asociado a su cuenta. Verifique que su correo esté vinculado a un profesional.'
                : 'No professional record was found for your account. Please ensure your email is linked to a professional.'}
            </p>
          )}

        </>
      )}

      {isAdmin && (
        <div style={{ marginTop: '0.75rem', maxWidth: '420px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '0.35rem',
              fontSize: '0.9rem',
              fontWeight: 600,
              color: '#374151',
            }}
          >
            {language === 'es'
              ? 'Seleccione un profesional'
              : 'Select a professional'}
          </label>
          {adminPsychError && (
            <p style={{ color: '#b91c1c', marginBottom: '0.5rem' }}>{adminPsychError}</p>
          )}
          <select
            value={professionalId || ''}
            onChange={(e) => {
              const value = e.target.value || null;
              setProfessionalId(value);
              setAdminClientFilter('');
              setSelectedSession(null);
              setClientRequest(null);
              setActiveView(null);
              setProfClientFilter('');
              setShowClientQPanel(false);
              setClientQAll([]);
              setClientAllAnalysis(null);
            }}
            disabled={loadingAdminProfessionals}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.9rem',
              color: '#111827',
              backgroundColor: loadingAdminProfessionals ? '#f9fafb' : 'white',
            }}
          >
            <option value="">
              {loadingAdminProfessionals
                ? language === 'es'
                  ? 'Cargando profesionales...'
                  : 'Loading professionals...'
                : language === 'es'
                  ? 'Seleccione un profesional'
                  : 'Select a professional'}
            </option>
            {adminProfessionals.map((p) => (
              <option key={p.id} value={p.id}>
                {language === 'es' ? p.name_es || p.name_en : p.name_en || p.name_es}
              </option>
            ))}
          </select>
          {professionalId && (
            <div style={{ marginTop: '1rem' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.35rem',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  color: '#374151',
                }}
              >
                {language === 'es' ? 'Filtrar por cliente (opcional)' : 'Filter by client (optional)'}
              </label>
              <select
                value={adminClientFilter}
                onChange={(e) => {
                  setAdminClientFilter(e.target.value);
                  setSelectedSession(null);
                  setClientRequest(null);
                  setActiveView(null);
                  setProfClientFilter('');
                  setShowClientQPanel(false);
                  setClientQAll([]);
                  setClientAllAnalysis(null);
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.9rem',
                  color: '#111827',
                  backgroundColor: 'white',
                }}
              >
                <option value="">
                  {language === 'es' ? 'Todos los clientes' : 'All clients'}
                </option>
                {adminClientOptions.map((c) => (
                  <option key={c.email} value={c.email}>
                    {c.label} ({c.email})
                  </option>
                ))}
              </select>
            </div>
          )}
          {!loadingAdminProfessionals && adminProfessionals.length === 0 && (
            <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.85rem' }}>
              {language === 'es'
                ? 'No se encontraron profesionales.'
                : 'No professionals found.'}
            </p>
          )}
        </div>
      )}

      {!!professionalId && (
        <div style={{ marginTop: '1rem', maxWidth: '480px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '0.35rem',
              fontSize: '0.9rem',
              fontWeight: 600,
              color: '#374151',
            }}
          >
            {language === 'es' ? 'Seleccionar cliente' : 'Select client'}
          </label>
          <select
            value={profClientFilter}
            onChange={(e) => {
              setProfClientFilter(e.target.value);
              setClientAllAnalysis(null);
              setSavedClientAllAnalysis(false);
            }}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.9rem',
              color: '#111827',
              backgroundColor: 'white',
            }}
          >
            <option value="">
              {language === 'es' ? '— Seleccione un cliente —' : '— Select a client —'}
            </option>
            {profClientOptions.map((c) => (
              <option key={c.email} value={c.email}>
                {c.label} ({c.email})
              </option>
            ))}
          </select>
          {profClientOptions.length === 0 && (
            <p style={{ marginTop: '0.4rem', color: '#6b7280', fontSize: '0.8rem' }}>
              {language === 'es'
                ? 'Los clientes aparecerán aquí una vez cargadas las citas.'
                : 'Clients will appear here once appointments are loaded.'}
            </p>
          )}
          {profClientFilter && (
            <button
              type="button"
              onClick={() => void handleOpenClientQPanel()}
              style={{
                marginTop: '0.65rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 1.1rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#4f46e5',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 600,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              {language === 'es' ? 'Ver todos los cuestionarios del cliente' : 'View all client questionnaires'}
            </button>
          )}
        </div>
      )}

      {sessionsError && (
        <p style={{ color: '#b91c1c', marginBottom: '1rem' }}>{sessionsError}</p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: selectedSession || clientRequest ? '1.5fr 1.5fr' : '1fr',
          gap: '1.5rem',
          marginTop: '1.5rem',
          alignItems: 'flex-start',
        }}
      >
        <div>
          {isClient &&
            (loadingClientPending || clientPendingError || clientPendingRequests.length > 0) && (
            <>
              <h3 style={{ marginBottom: '0.5rem', color: '#2c3e50' }}>
                {language === 'es' ? 'Mis solicitudes pendientes' : 'My pending requests'}
              </h3>
              {loadingClientPending ? (
                <p>{t('loading')}</p>
              ) : clientPendingError ? (
                <p style={{ color: '#b91c1c' }}>{clientPendingError}</p>
              ) : (
                <div
                  style={{
                    marginBottom: '1.25rem',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 2fr 2fr',
                      padding: '0.6rem 0.9rem',
                      backgroundColor: '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      color: '#4b5563',
                    }}
                  >
                    <span>{language === 'es' ? 'Profesional' : 'Professional'}</span>
                    <span>{language === 'es' ? 'Fecha preferida' : 'Preferred date'}</span>
                    <span>{language === 'es' ? 'Estado' : 'Status'}</span>
                  </div>
                  {clientPendingRequests.map((req) => {
                    const prof = professionals.find((p) => p.id === req.professional_id);
                    const profName = prof
                      ? (language === 'es' ? prof.name_es || prof.name_en : prof.name_en || prof.name_es)
                      : '—';
                    return (
                      <button
                        key={req.id}
                        type="button"
                        onClick={() => handleSelectPendingRequest(req)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '2fr 2fr 2fr',
                          width: '100%',
                          textAlign: 'left',
                          padding: '0.6rem 0.9rem',
                          border: 'none',
                          borderBottom: '1px solid #e5e7eb',
                          backgroundColor:
                            clientRequest?.id === req.id && !selectedSession ? '#eef2ff' : 'white',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                        }}
                      >
                        <span>{profName}</span>
                        <span>
                          {req.preferred_date}
                          {req.preferred_time ? ` ${req.preferred_time}` : ''}
                        </span>
                        <span style={{ textTransform: 'capitalize' }}>{req.status || 'pending'}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {isProfessional &&
            !reviewMode &&
            (loadingPendingRequests || pendingError || pendingRequests.length > 0) && (
            <>
              <h3 style={{ marginBottom: '0.5rem', color: '#2c3e50' }}>
                {language === 'es' ? 'Solicitudes Pendientes' : 'Pending Requests'}
              </h3>
              {loadingPendingRequests ? (
                <p>{t('loading')}</p>
              ) : pendingError ? (
                <p style={{ color: '#b91c1c' }}>{pendingError}</p>
              ) : (
                <div
                  style={{
                    marginBottom: '1.25rem',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 2fr 2fr',
                      padding: '0.6rem 0.9rem',
                      backgroundColor: '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      color: '#4b5563',
                    }}
                  >
                    <span>{language === 'es' ? 'Cliente' : 'Client'}</span>
                    <span>{language === 'es' ? 'Correo' : 'Email'}</span>
                    <span>{language === 'es' ? 'Fecha preferida' : 'Preferred date'}</span>
                  </div>
                  {pendingRequests.map((req) => (
                    <button
                      key={req.id}
                      type="button"
                      onClick={() => handleSelectPendingRequest(req)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 2fr 2fr',
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.6rem 0.9rem',
                        border: 'none',
                        borderBottom: '1px solid #e5e7eb',
                        backgroundColor:
                          clientRequest?.id === req.id && !selectedSession
                            ? '#eef2ff'
                            : 'white',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                      }}
                    >
                      <span>{req.client_name || req.full_name || req.username}</span>
                      <span>{req.client_email}</span>
                      <span>
                        {req.preferred_date}
                        {req.preferred_time ? ` ${req.preferred_time}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <h3 style={{ marginBottom: '0.75rem', color: '#2c3e50' }}>
            {language === 'es'
              ? 'Citas (pendientes y confirmadas)'
              : 'Appointments (pending & confirmed)'}
          </h3>

          {/* Date range filter */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              alignItems: 'flex-end',
              marginBottom: '1rem',
              padding: '0.75rem 1rem',
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4b5563' }}>
                {language === 'es' ? 'Desde' : 'From'}
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{
                  padding: '0.4rem 0.6rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.9rem',
                  color: '#111827',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4b5563' }}>
                {language === 'es' ? 'Hasta' : 'To'}
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{
                  padding: '0.4rem 0.6rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.9rem',
                  color: '#111827',
                }}
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  color: '#6b7280',
                  alignSelf: 'flex-end',
                }}
              >
                {language === 'es' ? 'Limpiar filtro' : 'Clear filter'}
              </button>
            )}
          </div>

          {(() => {
            const filteredSessions = sessions.filter((s) => {
              const d = new Date(s.session_date);
              if (dateFrom && d < new Date(dateFrom)) return false;
              if (dateTo) {
                const toEnd = new Date(dateTo);
                toEnd.setHours(23, 59, 59, 999);
                if (d > toEnd) return false;
              }
              return true;
            });

            if (loadingSessions) return <p>{t('loading')}</p>;

            if (!loadingSessions && sessions.length === 0) {
              return (
                <p style={{ color: '#666' }}>
                  {language === 'es'
                    ? 'No se encontraron citas programadas.'
                    : 'No scheduled appointments found.'}
                </p>
              );
            }

            if (filteredSessions.length === 0) {
              return (
                <p style={{ color: '#666' }}>
                  {language === 'es'
                    ? 'No hay citas en el rango de fechas seleccionado.'
                    : 'No appointments found in the selected date range.'}
                </p>
              );
            }

            return (
              <div
                style={{
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  overflow: 'hidden',
                  backgroundColor: '#fff',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 2fr 1.5fr 1fr 1fr 1fr',
                    padding: '0.75rem 1rem',
                    backgroundColor: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    color: '#4b5563',
                  }}
                >
                  <span>{language === 'es' ? 'Cliente' : 'Client'}</span>
                  <span>{language === 'es' ? 'Correo' : 'Email'}</span>
                  <span>{language === 'es' ? 'Fecha programada' : 'Scheduled date'}</span>
                  <span>{language === 'es' ? 'Estado' : 'Status'}</span>
                  <span>{language === 'es' ? 'Pago' : 'Payment'}</span>
                  <span>{language === 'es' ? 'Monto' : 'Amount'}</span>
                </div>
                {filteredSessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => handleSelectSession(session)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 2fr 1.5fr 1fr 1fr 1fr',
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.75rem 1rem',
                      border: 'none',
                      borderBottom: '1px solid #e5e7eb',
                      backgroundColor:
                        selectedSession?.id === session.id ? '#eef2ff' : 'white',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    <span>{session.client_name || session.full_name || '-'}</span>
                    <span>{session.client_email}</span>
                    <span>{new Date(session.session_date).toLocaleString()}</span>
                    <span style={{ textTransform: 'capitalize' }}>{session.status}</span>
                    <span>
                      {(() => {
                        const ps = session.payment_status || '';
                        const label = ps || (language === 'es' ? 'Sin pago' : 'Unpaid');
                        const bg = ps.toLowerCase() === 'paid' ? '#dcfce7' : ps.toLowerCase() === 'pending' ? '#fef9c3' : '#fee2e2';
                        const fg = ps.toLowerCase() === 'paid' ? '#15803d' : ps.toLowerCase() === 'pending' ? '#92400e' : '#b91c1c';
                        return (
                          <span style={{ display: 'inline-block', padding: '0.15em 0.5em', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600, backgroundColor: bg, color: fg }}>
                            {label}
                          </span>
                        );
                      })()}
                    </span>
                    <span>
                      {`${session.amount || '0'}${session.currency ? ` ${session.currency}` : ''}`}
                    </span>
                  </button>
                ))}
              </div>
            );
          })()}
        </div>

        {(selectedSession || clientRequest) && (
          <div
            style={{
              padding: '1rem 1.25rem',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#f9fafb',
            }}
          >
            {selectedSession ? (
              <>
                <h3 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#1f2937' }}>
                  {language === 'es'
                    ? 'Detalles de la Cita Seleccionada'
                    : 'Selected Appointment'}
                </h3>

                <div style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#374151' }}>
                  <p>
                    <strong>{language === 'es' ? 'Cliente:' : 'Client:'}</strong>{' '}
                    {selectedSession.client_name || selectedSession.full_name || '-'}
                  </p>
                  <p>
                    <strong>{language === 'es' ? 'Correo:' : 'Email:'}</strong>{' '}
                    {selectedSession.client_email}
                  </p>
                  <p>
                    <strong>{language === 'es' ? 'Fecha programada:' : 'Scheduled date:'}</strong>{' '}
                    {new Date(selectedSession.session_date).toLocaleString()}
                  </p>
                  <p>
                    <strong>{language === 'es' ? 'Fecha de creación:' : 'Date created:'}</strong>{' '}
                    {new Date(selectedSession.created_at).toLocaleString()}
                  </p>
                  <p>
                    <strong>{language === 'es' ? 'Estado:' : 'Status:'}</strong>{' '}
                    {selectedSession.status}
                  </p>
                  <p>
                    <strong>{language === 'es' ? 'Estado de pago:' : 'Payment status:'}</strong>{' '}
                    {(() => {
                      const ps = selectedSession.payment_status || '';
                      const label = ps || (language === 'es' ? 'Sin pago' : 'Unpaid');
                      const bg = ps.toLowerCase() === 'paid' ? '#dcfce7' : ps.toLowerCase() === 'pending' ? '#fef9c3' : '#fee2e2';
                      const fg = ps.toLowerCase() === 'paid' ? '#15803d' : ps.toLowerCase() === 'pending' ? '#92400e' : '#b91c1c';
                      return (
                        <span style={{ display: 'inline-block', padding: '0.1em 0.55em', borderRadius: '999px', fontSize: '0.82rem', fontWeight: 600, backgroundColor: bg, color: fg }}>
                          {label}
                        </span>
                      );
                    })()}
                  </p>
                  <p>
                    <strong>{language === 'es' ? 'Monto pagado:' : 'Amount paid:'}</strong>{' '}
                    {`${selectedSession.amount || '0'}${selectedSession.currency ? ` ${selectedSession.currency}` : ''}`}
                  </p>
                  {(() => {
                    const prof = professionals.find((p) => p.id === selectedSession.professional_id);
                    const profName = prof
                      ? (language === 'es' ? prof.name_es || prof.name_en : prof.name_en || prof.name_es)
                      : selectedSession.professional_id || '—';
                    return (
                      <p style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                        <strong>{language === 'es' ? 'Profesional asignado:' : 'Assigned professional:'}</strong>{' '}
                        {profName}
                      </p>
                    );
                  })()}
                </div>

                {selectedSession.status !== 'cancelled' && selectedSession.status !== 'completed' && (
                  <div style={{ marginTop: '0.25rem', marginBottom: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
                    {isUnpaidPendingAppointment(selectedSession) ? (
                      renderDeleteUnpaidControls()
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleOpenCancel()}
                        style={{
                          padding: '0.55rem 1.4rem',
                          borderRadius: '8px',
                          border: '2px solid #dc2626',
                          backgroundColor: activeView === 'cancel' ? '#dc2626' : 'white',
                          color: activeView === 'cancel' ? 'white' : '#dc2626',
                          fontWeight: 700,
                          fontSize: '0.92rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                        }}
                      >
                        <span>✕</span>
                        <span>{language === 'es' ? 'Cancelar Sesión' : 'Cancel Session'}</span>
                      </button>
                    )}
                    {(onChangeSession || onNavigate) && (
                      <button
                        type="button"
                        onClick={() => void handleChangeSession()}
                        style={{
                          padding: '0.55rem 1.4rem',
                          borderRadius: '8px',
                          border: '2px solid #c2410c',
                          backgroundColor: 'white',
                          color: '#c2410c',
                          fontWeight: 700,
                          fontSize: '0.92rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                        }}
                      >
                        <span>✎</span>
                        <span>{language === 'es' ? 'Cambiar Sesión' : 'Change Session'}</span>
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <h3 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#1f2937' }}>
                  {language === 'es' ? 'Solicitud pendiente' : 'Pending request'}
                </h3>
                <div style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#374151' }}>
                  <p>
                    <strong>{language === 'es' ? 'Cliente:' : 'Client:'}</strong>{' '}
                    {clientRequest?.client_name || clientRequest?.full_name || clientRequest?.username || '—'}
                  </p>
                  <p>
                    <strong>{language === 'es' ? 'Correo:' : 'Email:'}</strong>{' '}
                    {clientRequest?.client_email || '—'}
                  </p>
                  <p>
                    <strong>{language === 'es' ? 'Fecha preferida:' : 'Preferred date:'}</strong>{' '}
                    {clientRequest?.preferred_date || '—'}
                    {clientRequest?.preferred_time ? ` ${clientRequest.preferred_time}` : ''}
                  </p>
                  <p>
                    <strong>{language === 'es' ? 'Estado:' : 'Status:'}</strong>{' '}
                    {clientRequest?.status || '—'}
                  </p>
                </div>
                {isUnpaidPendingRequest(clientRequest) && renderDeleteUnpaidControls()}
              </>
            )}

            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                marginBottom: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={handleViewRequest}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '999px',
                  border:
                    activeView === 'details'
                      ? '1px solid #4f46e5'
                      : '1px solid #e5e7eb',
                  backgroundColor:
                    activeView === 'details' ? '#eef2ff' : 'white',
                  color: '#111827',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <span>①</span>
                <span>
                  {language === 'es'
                    ? 'Ver solicitud / sesión'
                    : 'View request / session'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleViewQuestionnaires}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '999px',
                  border:
                    activeView === 'questionnaires'
                      ? '1px solid #4f46e5'
                      : '1px solid #e5e7eb',
                  backgroundColor:
                    activeView === 'questionnaires' ? '#eef2ff' : 'white',
                  color: '#111827',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <span>②</span>
                <span>
                  {language === 'es'
                    ? 'Ver cuestionarios llenados'
                    : 'View completed questionnaires'}
                </span>
              </button>

            </div>

            {activeView === 'details' && (
              <div
                style={{
                  padding: '0.75rem 0.85rem',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  maxHeight: '320px',
                  overflowY: 'auto',
                  fontSize: '0.9rem',
                }}
              >
                {loadingRequest && <p>{t('loading')}</p>}
                {requestError && (
                  <p style={{ color: '#b91c1c' }}>{requestError}</p>
                )}
                {!loadingRequest && !requestError && (
                  <>
                    {clientRequest ? (() => {
                      const labels = resolveRequestLabels(clientRequest);
                      return (
                        <>
                          <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                            {language === 'es'
                              ? 'Solicitud original del cliente'
                              : 'Original client request'}
                          </h4>
                          {labels.specialtyName && (
                            <p>
                              <strong>
                                {language === 'es' ? 'Especialidad:' : 'Specialty:'}
                              </strong>{' '}
                              {labels.specialtyName}
                            </p>
                          )}
                          {labels.counselingTypeName && (
                            <p>
                              <strong>
                                {language === 'es' ? 'Tipo de consejería:' : 'Counseling type:'}
                              </strong>{' '}
                              {labels.counselingTypeName}
                            </p>
                          )}
                          {labels.professionalName && (
                            <p>
                              <strong>
                                {language === 'es' ? 'Profesional:' : 'Professional:'}
                              </strong>{' '}
                              {labels.professionalName}
                            </p>
                          )}
                          <p>
                            <strong>
                              {language === 'es'
                                ? 'Fecha preferida:'
                                : 'Preferred date:'}
                            </strong>{' '}
                            {clientRequest.preferred_date}
                            {clientRequest.preferred_time
                              ? ` ${clientRequest.preferred_time}`
                              : ''}
                          </p>
                          {clientRequest.session_length != null && (
                            <p>
                              <strong>
                                {language === 'es' ? 'Duración (horas):' : 'Session length (hours):'}
                              </strong>{' '}
                              {clientRequest.session_length}
                            </p>
                          )}
                          {labels.sessionPriceLabel && (
                            <p>
                              <strong>
                                {language === 'es' ? 'Precio:' : 'Price:'}
                              </strong>{' '}
                              {labels.sessionPriceLabel}
                            </p>
                          )}
                          {clientRequest.num_sessions != null && (
                            <p>
                              <strong>
                                {language === 'es' ? 'Sesiones:' : 'Sessions:'}
                              </strong>{' '}
                              {clientRequest.num_sessions}
                            </p>
                          )}
                          <p>
                            <strong>
                              {language === 'es' ? 'Motivo de consulta:' : 'Issue:'}
                            </strong>{' '}
                            {clientRequest.issue}
                          </p>
                          {clientRequest.notes && (
                            <p>
                              <strong>
                                {language === 'es' ? 'Notas:' : 'Notes:'}
                              </strong>{' '}
                              {clientRequest.notes}
                            </p>
                          )}
                          {clientRequest.status && (
                            <p>
                              <strong>
                                {language === 'es' ? 'Estado:' : 'Status:'}
                              </strong>{' '}
                              {clientRequest.status}
                            </p>
                          )}
                        </>
                      );
                    })() : selectedSession ? (
                      <>
                        <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                          {language === 'es'
                            ? 'Detalles de la sesión'
                            : 'Session details'}
                        </h4>
                        <p>
                          <strong>
                            {language === 'es' ? 'Motivo:' : 'Reason:'}
                          </strong>{' '}
                          {selectedSession.notes || '-'}
                        </p>
                      </>
                    ) : null}
                  </>
                )}
              </div>
            )}

            {activeView === 'questionnaires' && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.3fr 1.7fr',
                  gap: '0.75rem',
                  maxHeight: '340px',
                }}
              >
                <div
                  style={{
                    padding: '0.75rem 0.85rem',
                    borderRadius: '6px',
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    overflowY: 'auto',
                  }}
                >
                  <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                    {language === 'es'
                      ? 'Cuestionarios guardados'
                      : 'Saved questionnaires'}
                  </h4>
                  {loadingQuestionnaires && <p>{t('loading')}</p>}
                  {questionnairesError && (
                    <p style={{ color: '#b91c1c' }}>{questionnairesError}</p>
                  )}
                  {!loadingQuestionnaires &&
                    !questionnairesError &&
                    questionnaires.length === 0 && (
                      <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                        {language === 'es'
                          ? 'No se encontraron cuestionarios para este cliente.'
                          : 'No questionnaires were found for this client.'}
                      </p>
                    )}
                  {!loadingQuestionnaires &&
                    !questionnairesError &&
                    questionnaires.map((q) => (
                      <button
                        key={q.id}
                        onClick={() => {
                          setSelectedQuestionnaire(q);
                          openQuestionnaireInPanel(q);
                        }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '0.5rem 0.6rem',
                          marginBottom: '0.35rem',
                          borderRadius: '5px',
                          border:
                            selectedQuestionnaire?.id === q.id
                              ? '1px solid #4f46e5'
                              : '1px solid #e5e7eb',
                          backgroundColor:
                            selectedQuestionnaire?.id === q.id
                              ? '#eef2ff'
                              : '#f9fafb',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 600,
                            marginBottom: '0.15rem',
                            color: '#111827',
                          }}
                        >
                          {questionnaireDisplayTitle(q, language)}
                        </div>
                        <div
                          style={{
                            fontSize: '0.8rem',
                            color: '#6b7280',
                          }}
                        >
                          {new Date(q.created_at).toLocaleString()} ·{' '}
                          {q.language?.toUpperCase() || 'N/A'}
                        </div>
                      </button>
                    ))}
                </div>

                <div
                  style={{
                    padding: '0.75rem 0.85rem',
                    borderRadius: '6px',
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    overflowY: 'auto',
                  }}
                >
                  <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                    {language === 'es'
                      ? 'Contenido del cuestionario'
                      : 'Questionnaire content'}
                  </h4>
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: '#6b7280' }}>
                    {language === 'es'
                      ? "La respuesta elegida por el cliente está resaltada en amarillo."
                      : "The client's chosen answer is highlighted in yellow."}
                  </p>
                  {selectedQuestionnaire ? (
                    <div
                      style={{
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        fontSize: '0.85rem',
                        lineHeight: 1.6,
                        margin: 0,
                      }}
                    >
                      {highlightClientAnswers(selectedQuestionnaire.generated_text || '')}
                    </div>
                  ) : (
                    <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                      {language === 'es'
                        ? 'Seleccione un cuestionario de la lista para ver sus respuestas.'
                        : 'Select a questionnaire from the list to view its responses.'}
                    </p>
                  )}
                </div>
              </div>
            )}

            {activeView === 'questionnaires' && !loadingQuestionnaires && !questionnairesError && questionnaires.length > 0 && (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '1.1rem 1.25rem',
                  borderRadius: '10px',
                  border: '2px solid #7c3aed',
                  backgroundColor: '#faf5ff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
                  </svg>
                  <h4 style={{ margin: 0, color: '#5b21b6', fontSize: '0.95rem' }}>
                    {language === 'es' ? 'Análisis Integral IA' : 'Comprehensive AI Analysis'}
                  </h4>
                </div>

                {!inlineAnalysis && !inlineAnalysisLoading && !inlineAnalysisError && (
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#6b7280' }}>
                    {language === 'es'
                      ? `Analiza los ${questionnaires.length} cuestionario(s) de forma integral para identificar patrones y áreas prioritarias de intervención.`
                      : `Analyze all ${questionnaires.length} questionnaire(s) comprehensively to identify patterns and priority intervention areas.`}
                  </p>
                )}

                {inlineAnalysisLoading && (
                  <div style={{ textAlign: 'center', padding: '1rem', color: '#7c3aed' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem', display: 'block' }}>
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                    <p style={{ margin: 0, fontWeight: 500, fontSize: '0.88rem' }}>
                      {language === 'es' ? 'Generando análisis integral...' : 'Generating comprehensive analysis...'}
                    </p>
                  </div>
                )}

                {inlineAnalysisError && (
                  <p style={{ color: '#dc2626', fontSize: '0.88rem', marginBottom: '0.6rem' }}>{inlineAnalysisError}</p>
                )}

                {inlineAnalysis && !inlineAnalysisLoading && (
                  <div style={{ lineHeight: '1.7', color: '#374151', whiteSpace: 'pre-wrap', fontSize: '0.88rem', marginBottom: '0.85rem' }}>
                    {inlineAnalysis}
                  </div>
                )}

                <div style={{ padding: '0.45rem 0.65rem', backgroundColor: '#ede9fe', borderRadius: '6px', fontSize: '0.76rem', color: '#5b21b6', marginBottom: '0.75rem' }}>
                  {language === 'es'
                    ? '⚠️ Análisis generado por IA como herramienta de apoyo clínico. No constituye un diagnóstico definitivo.'
                    : '⚠️ AI-generated analysis as a clinical support tool. Does not constitute a definitive diagnosis.'}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                  <button
                    type="button"
                    onClick={() => void handleInlineAiAnalysis()}
                    disabled={inlineAnalysisLoading}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                      padding: '0.45rem 1rem', borderRadius: '6px', border: 'none',
                      backgroundColor: inlineAnalysisLoading ? '#9ca3af' : '#7c3aed',
                      color: '#fff', cursor: inlineAnalysisLoading ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem', fontWeight: 600,
                    }}
                  >
                    {inlineAnalysisLoading ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                        {language === 'es' ? 'Analizando...' : 'Analyzing...'}
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
                        </svg>
                        {inlineAnalysis
                          ? (language === 'es' ? 'Regenerar análisis' : 'Regenerate analysis')
                          : (language === 'es' ? 'Análisis IA de todos los cuestionarios' : 'AI Analysis of all questionnaires')}
                      </>
                    )}
                  </button>

                  {inlineAnalysis && !inlineAnalysisLoading && (
                    <button
                      type="button"
                      onClick={() => void handleSaveInlineAnalysis()}
                      disabled={savingInlineAnalysis}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.45rem 1rem', borderRadius: '6px', border: 'none',
                        backgroundColor: savedInlineAnalysis ? '#059669' : savingInlineAnalysis ? '#9ca3af' : '#0f766e',
                        color: '#fff', cursor: savingInlineAnalysis ? 'not-allowed' : 'pointer',
                        fontSize: '0.85rem', fontWeight: 600,
                      }}
                    >
                      {savingInlineAnalysis ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                          </svg>
                          {language === 'es' ? 'Guardando...' : 'Saving...'}
                        </>
                      ) : savedInlineAnalysis ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          {language === 'es' ? '¡Guardado!' : 'Saved!'}
                        </>
                      ) : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                            <polyline points="17 21 17 13 7 13 7 21"/>
                            <polyline points="7 3 7 8 15 8"/>
                          </svg>
                          {language === 'es' ? 'Guardar análisis' : 'Save analysis'}
                        </>
                      )}
                    </button>
                  )}

                  {inlineAnalysis && !inlineAnalysisLoading && (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(inlineAnalysis);
                        setCopiedInlineAnalysis(true);
                        setTimeout(() => setCopiedInlineAnalysis(false), 2500);
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.45rem 1rem', borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        backgroundColor: copiedInlineAnalysis ? '#f0fdf4' : '#fff',
                        color: copiedInlineAnalysis ? '#15803d' : '#374151',
                        cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                      }}
                    >
                      {copiedInlineAnalysis ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          {language === 'es' ? '¡Copiado!' : 'Copied!'}
                        </>
                      ) : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                          {language === 'es' ? 'Copiar al portapapeles' : 'Copy to clipboard'}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeView === 'cancel' && selectedSession && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '1.25rem 1.4rem',
                  borderRadius: '10px',
                  border: '2px solid #fca5a5',
                  backgroundColor: '#fff5f5',
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#991b1b', fontSize: '1.05rem' }}>
                  {language === 'es' ? 'Cancelar Sesión' : 'Cancel Session'}
                </h3>

                {cancelLoading ? (
                  <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                    {language === 'es' ? 'Cargando detalles...' : 'Loading session details…'}
                  </p>
                ) : (() => {
                  const sessionDateMs = new Date(selectedSession.session_date).getTime();
                  const nowMs = Date.now();
                  const hoursUntil = (sessionDateMs - nowMs) / (1000 * 60 * 60);
                  const daysUntil = hoursUntil / 24;
                  const isPastSession = hoursUntil < 0;
                  const isOnTime = hoursUntil >= CANCEL_SESSION_NOTICE_HOURS;
                  const isPaid =
                    (selectedSession.payment_status || '').toLowerCase() === 'paid'
                    || (cancelRequest ? getClientRequestStatusValue(cancelRequest) === 1 : false);
                  const packageSize = Math.max(
                    1,
                    cancelRequest?.num_sessions ?? selectedSession.num_sessions ?? 1,
                  );
                  const refundEval = cancelRequest
                    ? evaluateRefundEligibility({
                        request: cancelRequest,
                        cancelAllRemaining: false,
                        onTime: isOnTime && !isPastSession,
                        sessionsToCancel: 1,
                        wasPaid: isPaid,
                        executedPackageSessions: packageSize > 1 ? cancelExecutedCount : 0,
                      })
                    : { eligible: false, eligibleAmount: 0, currency: 'USD', reason: '', reasonCode: 'unpaid' as const };

                  const timingColor = isPastSession ? '#7f1d1d' : isOnTime ? '#14532d' : '#78350f';
                  const timingBg = isPastSession ? '#fee2e2' : isOnTime ? '#dcfce7' : '#fef3c7';

                  let daysLabel = '';
                  if (isPastSession) {
                    const daysAgo = Math.abs(Math.ceil(daysUntil));
                    daysLabel = language === 'es'
                      ? `La sesión fue hace ${daysAgo} día(s).`
                      : `Session was ${daysAgo} day(s) ago.`;
                  } else if (daysUntil < 1) {
                    const hrs = Math.floor(hoursUntil);
                    daysLabel = language === 'es'
                      ? `La sesión es en menos de 24 horas (${hrs}h).`
                      : `Session is in less than 24 hours (${hrs}h).`;
                  } else {
                    const daysLeft = Math.floor(daysUntil);
                    daysLabel = language === 'es'
                      ? `La sesión es en ${daysLeft} día(s).`
                      : `Session is in ${daysLeft} day(s).`;
                  }

                  return (
                    <>
                      {/* Session summary */}
                      <dl
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'auto 1fr',
                          gap: '0.3rem 0.75rem',
                          fontSize: '0.9rem',
                          marginBottom: '1rem',
                          color: '#374151',
                        }}
                      >
                        <dt style={{ fontWeight: 600, color: '#6b7280' }}>{language === 'es' ? 'Fecha:' : 'Date:'}</dt>
                        <dd style={{ margin: 0 }}>{new Date(selectedSession.session_date).toLocaleString()}</dd>

                        <dt style={{ fontWeight: 600, color: '#6b7280' }}>{language === 'es' ? 'Profesional:' : 'Professional:'}</dt>
                        <dd style={{ margin: 0 }}>
                          {(() => {
                            const prof = professionals.find(p => p.id === selectedSession.professional_id);
                            return prof ? (language === 'es' ? prof.name_es || prof.name_en : prof.name_en || prof.name_es) : '—';
                          })()}
                        </dd>

                        <dt style={{ fontWeight: 600, color: '#6b7280' }}>{language === 'es' ? 'Duración:' : 'Duration:'}</dt>
                        <dd style={{ margin: 0 }}>
                          {selectedSession.session_length
                            ? `${selectedSession.session_length}h`
                            : selectedSession.duration_minutes
                              ? `${selectedSession.duration_minutes} min`
                              : '—'}
                        </dd>

                        <dt style={{ fontWeight: 600, color: '#6b7280' }}>{language === 'es' ? 'Monto:' : 'Amount:'}</dt>
                        <dd style={{ margin: 0 }}>
                          {`${selectedSession.amount || '0'}${selectedSession.currency ? ` ${selectedSession.currency}` : ''}`}
                        </dd>

                        <dt style={{ fontWeight: 600, color: '#6b7280' }}>{language === 'es' ? 'Pago:' : 'Payment:'}</dt>
                        <dd style={{ margin: 0 }}>
                          {(() => {
                            const ps = selectedSession.payment_status || '';
                            const lbl = ps || (language === 'es' ? 'Sin pago' : 'Unpaid');
                            const bg = ps.toLowerCase() === 'paid' ? '#dcfce7' : ps.toLowerCase() === 'pending' ? '#fef9c3' : '#fee2e2';
                            const fg = ps.toLowerCase() === 'paid' ? '#15803d' : ps.toLowerCase() === 'pending' ? '#92400e' : '#b91c1c';
                            return (
                              <span style={{ padding: '0.1em 0.55em', borderRadius: '999px', fontSize: '0.82rem', fontWeight: 600, backgroundColor: bg, color: fg }}>
                                {lbl}
                              </span>
                            );
                          })()}
                        </dd>
                      </dl>

                      {/* Timing badge */}
                      <div
                        style={{
                          padding: '0.5rem 0.85rem',
                          borderRadius: '8px',
                          backgroundColor: timingBg,
                          color: timingColor,
                          fontSize: '0.88rem',
                          fontWeight: 600,
                          marginBottom: '1.1rem',
                        }}
                      >
                        {daysLabel}{' '}
                        {!isPastSession && (
                          <span style={{ fontWeight: 400 }}>
                            {refundEval.eligible
                              ? `(${language === 'es' ? 'Cancelación a tiempo — califica para reembolso' : 'On-time cancellation — qualifies for refund'})`
                              : refundEval.reasonCode === 'package_executed'
                                ? `(${language === 'es' ? 'Paquete con sesión completada — no hay reembolso' : 'Package has a completed session — no refund'})`
                                : `(${language === 'es' ? `Cancelación tardía — menos de ${CANCEL_SESSION_NOTICE_HOURS}h de aviso; no hay reembolso` : `Late cancellation — less than ${CANCEL_SESSION_NOTICE_HOURS}h notice; no refund`})`}
                          </span>
                        )}
                      </div>

                      {cancelSuccess ? (
                        <div
                          style={{
                            padding: '0.75rem 1rem',
                            borderRadius: '8px',
                            backgroundColor: '#dcfce7',
                            color: '#15803d',
                            fontWeight: 600,
                            fontSize: '0.95rem',
                          }}
                        >
                          ✓ {cancelSuccess}
                        </div>
                      ) : cancelError ? (
                        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: '#fee2e2', color: '#991b1b', fontWeight: 600, fontSize: '0.9rem' }}>
                          {cancelError}
                        </div>
                      ) : (
                        <>
                          {!isPaid ? (
                            /* Not paid — simple cancel */
                            <div>
                              <p style={{ fontSize: '0.88rem', color: '#6b7280', marginTop: 0, marginBottom: '0.85rem' }}>
                                {language === 'es'
                                  ? 'Esta sesión no ha sido pagada. Puede cancelarla sin cargo.'
                                  : 'This session has not been paid. You may cancel it at no charge.'}
                              </p>
                              <button
                                type="button"
                                disabled={cancelSubmitting}
                                onClick={() => void handleConfirmCancel('credit')}
                                style={{
                                  padding: '0.6rem 1.4rem',
                                  borderRadius: '8px',
                                  border: 'none',
                                  backgroundColor: cancelSubmitting ? '#9ca3af' : '#dc2626',
                                  color: 'white',
                                  fontWeight: 700,
                                  fontSize: '0.95rem',
                                  cursor: cancelSubmitting ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {cancelSubmitting
                                  ? (language === 'es' ? 'Cancelando…' : 'Cancelling…')
                                  : (language === 'es' ? 'Confirmar Cancelación' : 'Confirm Cancellation')}
                              </button>
                            </div>
                          ) : refundEval.eligible ? (
                            /* Paid and refund-eligible — offer refund or credit */
                            <div>
                              <p style={{ fontSize: '0.88rem', color: '#6b7280', marginTop: 0, marginBottom: '1rem' }}>
                                {language === 'es'
                                  ? 'Esta sesión ya fue pagada. Elija cómo procesar la cancelación:'
                                  : 'This session has been paid. Choose how to process the cancellation:'}
                              </p>
                              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  disabled={cancelSubmitting}
                                  onClick={() => void handleConfirmCancel('refund')}
                                  style={{
                                    padding: '0.6rem 1.3rem',
                                    borderRadius: '8px',
                                    border: '2px solid #1d4ed8',
                                    backgroundColor: 'white',
                                    color: '#1d4ed8',
                                    fontWeight: 700,
                                    fontSize: '0.9rem',
                                    cursor: cancelSubmitting ? 'not-allowed' : 'pointer',
                                  }}
                                >
                                  {language === 'es' ? '💳 Solicitar Reembolso' : '💳 Request Refund'}
                                </button>
                                <button
                                  type="button"
                                  disabled={cancelSubmitting}
                                  onClick={() => void handleConfirmCancel('credit')}
                                  style={{
                                    padding: '0.6rem 1.3rem',
                                    borderRadius: '8px',
                                    border: '2px solid #059669',
                                    backgroundColor: 'white',
                                    color: '#059669',
                                    fontWeight: 700,
                                    fontSize: '0.9rem',
                                    cursor: cancelSubmitting ? 'not-allowed' : 'pointer',
                                  }}
                                >
                                  {language === 'es' ? '🏷️ Guardar como Crédito' : '🏷️ Store as Credit'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Paid but not refund-eligible — cancel calendar/Meet with no Zoho credit */
                            <div>
                              <p style={{ fontSize: '0.88rem', color: '#92400e', marginTop: 0, marginBottom: '0.85rem', fontWeight: 600 }}>
                                {refundEval.reasonCode === 'package_executed'
                                  ? (language === 'es'
                                    ? 'No hay reembolso de un paquete una vez que se haya completado alguna sesión. No se emitirá crédito Zoho.'
                                    : 'No refund is allowed for a package once any session has been completed. No Zoho credit will be issued.')
                                  : (language === 'es'
                                    ? `No hay reembolso con menos de ${CANCEL_SESSION_NOTICE_HOURS} horas de aviso. No se emitirá crédito Zoho.`
                                    : `No refund is allowed within ${CANCEL_SESSION_NOTICE_HOURS} hours of the session. No Zoho credit will be issued.`)}
                              </p>
                              <label
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '0.5rem',
                                  fontSize: '0.88rem',
                                  color: '#374151',
                                  marginBottom: '0.9rem',
                                  cursor: 'pointer',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={confirmCancelCalendar}
                                  onChange={e => setConfirmCancelCalendar(e.target.checked)}
                                  style={{ marginTop: '0.2rem' }}
                                />
                                <span>
                                  {language === 'es'
                                    ? 'Sí, cancelar el evento de calendario y Google Meet. Entiendo que no se emitirá reembolso ni crédito Zoho.'
                                    : 'Yes, cancel the calendar event and Google Meet. I understand no refund or Zoho credit will be issued.'}
                                </span>
                              </label>
                              <button
                                type="button"
                                disabled={cancelSubmitting || !confirmCancelCalendar}
                                onClick={() => void handleConfirmCancel('credit')}
                                style={{
                                  padding: '0.6rem 1.4rem',
                                  borderRadius: '8px',
                                  border: 'none',
                                  backgroundColor: cancelSubmitting || !confirmCancelCalendar ? '#9ca3af' : '#dc2626',
                                  color: 'white',
                                  fontWeight: 700,
                                  fontSize: '0.95rem',
                                  cursor: cancelSubmitting || !confirmCancelCalendar ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {cancelSubmitting
                                  ? (language === 'es' ? 'Cancelando…' : 'Cancelling…')
                                  : (language === 'es' ? 'Cancelar calendario y Google Meet' : 'Cancel calendar and Google Meet')}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {panelOpen && (
        <div
          role="dialog"
          aria-label={panelTitle}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.4)',
          }}
          onClick={closePanel}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
              maxWidth: '90vw',
              maxHeight: '85vh',
              width: '560px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '1rem 1.25rem',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#f9fafb',
                gap: '0.75rem',
                flexWrap: 'wrap',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#111827', flex: 1, minWidth: 0 }}>
                {panelTitle}
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                {panelIsQuestionnaire && canManageClinicalAnalysis && (
                  <button
                    type="button"
                    onClick={handlePanelAiAnalysis}
                    disabled={panelAiLoading}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.35rem 0.8rem',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: panelAiLoading ? '#9ca3af' : '#7c3aed',
                      color: '#fff',
                      cursor: panelAiLoading ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    {panelAiLoading ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                        {language === 'es' ? 'Analizando...' : 'Analyzing...'}
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <path d="M12 16v-4M12 8h.01"/>
                        </svg>
                        {language === 'es' ? 'Análisis IA' : 'AI Analysis'}
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={closePanel}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    backgroundColor: '#fff',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    color: '#374151',
                  }}
                >
                  {language === 'es' ? 'Cerrar' : 'Close'}
                </button>
              </div>
            </div>
            <div
              style={{
                padding: '1.25rem 1.5rem',
                overflowY: 'auto',
                flex: 1,
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                fontSize: '0.95rem',
                lineHeight: 1.6,
                color: '#374151',
              }}
            >
              {!panelIsQuestionnaire && (
                <span style={{ whiteSpace: 'pre-wrap' }}>{panelContent}</span>
              )}

              {panelIsQuestionnaire && panelQuestionnaireRow && (
                <>
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#6b7280' }}>
                    {language === 'es' ? 'Fecha completado' : 'Completed at'}:{' '}
                    {new Date(panelQuestionnaireRow.created_at).toLocaleString()}
                    {' · '}
                    {language === 'es' ? 'Idioma' : 'Language'}:{' '}
                    {panelQuestionnaireRow.language?.toUpperCase() || 'N/A'}
                  </p>

                  <div
                      style={{
                        marginBottom: panelViewMode === 'with_responses' ? '1.25rem' : 0,
                        padding: '1.25rem',
                        backgroundColor: '#faf5ff',
                        border: '2px solid #7c3aed',
                        borderRadius: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <path d="M12 16v-4M12 8h.01"/>
                        </svg>
                        <h4 style={{ margin: 0, color: '#5b21b6', fontSize: '1rem' }}>
                          {language === 'es' ? 'Evaluación Clínica IA' : 'AI Clinical Evaluation'}
                        </h4>
                      </div>
                      {panelSaveError && (
                        <p style={{ margin: '0 0 0.75rem 0', color: '#dc2626', fontSize: '0.9rem' }}>{panelSaveError}</p>
                      )}
                      {panelAiLoading ? (
                        <div style={{ textAlign: 'center', padding: '1rem', color: '#7c3aed' }}>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.75rem', display: 'block' }}>
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                          </svg>
                          <p style={{ margin: 0, fontWeight: 500, fontSize: '0.9rem' }}>
                            {language === 'es' ? 'Generando evaluación clínica...' : 'Generating clinical evaluation...'}
                          </p>
                        </div>
                      ) : panelAiError ? (
                        <p style={{ margin: 0, color: '#dc2626', fontSize: '0.9rem' }}>{panelAiError}</p>
                      ) : panelAiResult ? (
                        <div style={{ lineHeight: '1.7', color: '#374151', whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
                          {panelAiResult}
                        </div>
                      ) : (
                        <p style={{ margin: 0, fontSize: '0.9rem', color: '#6b7280' }}>
                          {canManageClinicalAnalysis
                            ? (language === 'es'
                                ? 'Use «Análisis IA» arriba para generar una evaluación, o abra las respuestas del cuestionario abajo.'
                                : 'Use “AI Analysis” in the header to generate an evaluation, or open questionnaire responses below.')
                            : (language === 'es'
                                ? 'La evaluación clínica con IA solo está disponible para el profesional de la sesión o un administrador.'
                                : 'AI clinical evaluation is only available to the session’s professional or an administrator.')}
                        </p>
                      )}
                      <div style={{ marginTop: '1rem', padding: '0.6rem 0.75rem', backgroundColor: '#ede9fe', borderRadius: '6px', fontSize: '0.78rem', color: '#5b21b6' }}>
                        {language === 'es'
                          ? '⚠️ Esta evaluación es generada por IA como herramienta de apoyo clínico. No constituye un diagnóstico definitivo. El juicio clínico del profesional prevalece.'
                          : '⚠️ This evaluation is AI-generated as a clinical support tool. It does not constitute a definitive diagnosis. The professional\'s clinical judgment prevails.'}
                      </div>

                      {canManageClinicalAnalysis && panelAiResult && !panelAiLoading && (
                        <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <button
                            type="button"
                            onClick={handleSaveClinicalAnalysis}
                            disabled={panelSavingAnalysis}
                            style={{
                              padding: '0.4rem 0.9rem',
                              borderRadius: '6px',
                              border: 'none',
                              backgroundColor: panelSavingAnalysis ? '#9ca3af' : '#059669',
                              color: '#fff',
                              cursor: panelSavingAnalysis ? 'not-allowed' : 'pointer',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                            }}
                          >
                            {panelSavingAnalysis
                              ? (language === 'es' ? 'Guardando...' : 'Saving...')
                              : (language === 'es' ? 'Guardar análisis' : 'Save analysis')}
                          </button>
                        </div>
                      )}
                    </div>

                  {canManageClinicalAnalysis && (
                    <div style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => setPanelViewMode('analysis_focus')}
                        style={{
                          padding: '0.4rem 0.85rem',
                          borderRadius: '6px',
                          border: panelViewMode === 'analysis_focus' ? '2px solid #4f46e5' : '1px solid #d1d5db',
                          backgroundColor: panelViewMode === 'analysis_focus' ? '#eef2ff' : '#fff',
                          cursor: 'pointer',
                          fontSize: '0.82rem',
                          fontWeight: panelViewMode === 'analysis_focus' ? 600 : 400,
                          color: '#374151',
                        }}
                      >
                        {language === 'es' ? 'Solo análisis' : 'Analysis only'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPanelViewMode('with_responses')}
                        style={{
                          padding: '0.4rem 0.85rem',
                          borderRadius: '6px',
                          border: panelViewMode === 'with_responses' ? '2px solid #4f46e5' : '1px solid #d1d5db',
                          backgroundColor: panelViewMode === 'with_responses' ? '#eef2ff' : '#fff',
                          cursor: 'pointer',
                          fontSize: '0.82rem',
                          fontWeight: panelViewMode === 'with_responses' ? 600 : 400,
                          color: '#374151',
                        }}
                      >
                        {language === 'es' ? 'Mostrar respuestas del cuestionario' : 'Show questionnaire responses'}
                      </button>
                    </div>
                  )}

                  {panelViewMode === 'with_responses' && (
                    <>
                      <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#6b7280' }}>
                        {language === 'es'
                          ? "La respuesta elegida por el cliente está resaltada en amarillo."
                          : "The client's chosen answer is highlighted in yellow."}
                      </p>
                      {highlightClientAnswers(panelQuestionnaireGeneratedText)}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showClientQPanel && (
        <div
          role="dialog"
          aria-label={language === 'es' ? 'Cuestionarios del cliente' : 'Client questionnaires'}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.45)',
          }}
          onClick={() => setShowClientQPanel(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              maxWidth: '92vw',
              maxHeight: '90vh',
              width: '720px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '1rem 1.25rem',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#f9fafb',
                gap: '0.75rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#111827' }}>
                  {language === 'es' ? 'Cuestionarios del cliente' : 'Client Questionnaires'}
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#6b7280' }}>
                  {profClientOptions.find((c) => c.email === profClientFilter)?.label || profClientFilter}
                  {' '}·{' '}
                  {profClientFilter}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowClientQPanel(false)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  color: '#374151',
                  flexShrink: 0,
                }}
              >
                {language === 'es' ? 'Cerrar' : 'Close'}
              </button>
            </div>

            {/* Body */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '1.25rem 1.5rem' }}>
              {loadingClientQAll && (
                <p style={{ color: '#6b7280', textAlign: 'center' }}>
                  {language === 'es' ? 'Cargando cuestionarios...' : 'Loading questionnaires...'}
                </p>
              )}
              {clientQAllError && (
                <p style={{ color: '#b91c1c' }}>{clientQAllError}</p>
              )}

              {!loadingClientQAll && !clientQAllError && clientQAll.length === 0 && (
                <p style={{ color: '#6b7280' }}>
                  {language === 'es'
                    ? 'No se encontraron cuestionarios para este cliente.'
                    : 'No questionnaires found for this client.'}
                </p>
              )}

              {!loadingClientQAll && !clientQAllError && clientQAll.length > 0 && (
                <>
                  <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#6b7280' }}>
                    {clientQAll.length}{' '}
                    {language === 'es' ? 'cuestionario(s) encontrado(s)' : 'questionnaire(s) found'}
                    {clientIssueForAnalysis && (
                      <span>
                        {' · '}
                        {language === 'es' ? 'Motivo: ' : 'Issue: '}
                        <em>{clientIssueForAnalysis}</em>
                      </span>
                    )}
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem' }}>
                    {clientQAll.map((q) => {
                      const isExpanded = clientQExpanded === q.id;
                      const isStandard = q.content_type === 'standard_questionnaire';
                      return (
                        <div
                          key={q.id}
                          style={{
                            borderRadius: '8px',
                            border: isExpanded ? '1px solid #4f46e5' : '1px solid #e5e7eb',
                            backgroundColor: isExpanded ? '#f5f3ff' : '#fff',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.65rem',
                              padding: '0.65rem 0.9rem',
                            }}
                          >
                            <span
                              style={{
                                flexShrink: 0,
                                padding: '0.2em 0.55em',
                                borderRadius: '999px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                backgroundColor: isStandard ? '#dbeafe' : '#fef9c3',
                                color: isStandard ? '#1d4ed8' : '#92400e',
                              }}
                            >
                              {isStandard
                                ? (language === 'es' ? 'Estándar' : 'Standard')
                                : (language === 'es' ? 'Específico' : 'Specific')}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111827' }}>
                                {questionnaireDisplayTitle(q, language)}
                              </div>
                              <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.1rem' }}>
                                {new Date(q.created_at).toLocaleString()}
                                {' · '}
                                {q.language?.toUpperCase() || 'N/A'}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setClientQExpanded(isExpanded ? null : q.id)}
                              style={{
                                flexShrink: 0,
                                padding: '0.35rem 0.75rem',
                                borderRadius: '6px',
                                border: '1px solid #d1d5db',
                                backgroundColor: isExpanded ? '#4f46e5' : '#fff',
                                color: isExpanded ? '#fff' : '#374151',
                                cursor: 'pointer',
                                fontSize: '0.82rem',
                                fontWeight: 600,
                              }}
                            >
                              {isExpanded
                                ? (language === 'es' ? 'Ocultar' : 'Hide')
                                : (language === 'es' ? 'Ver' : 'View')}
                            </button>
                          </div>

                          {isExpanded && (
                            <div
                              style={{
                                padding: '0.75rem 1rem 1rem',
                                borderTop: '1px solid #e5e7eb',
                                backgroundColor: '#fafafa',
                                maxHeight: '320px',
                                overflowY: 'auto',
                                fontSize: '0.85rem',
                                lineHeight: 1.65,
                              }}
                            >
                              {q.generated_text?.trim()
                                ? highlightClientAnswers(q.generated_text)
                                : (
                                  <span style={{ color: '#6b7280' }}>
                                    {language === 'es' ? '(Sin contenido)' : '(No content)'}
                                  </span>
                                )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* AI Analysis section */}
                  <div
                    style={{
                      padding: '1.25rem',
                      borderRadius: '10px',
                      border: '2px solid #7c3aed',
                      backgroundColor: '#faf5ff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 16v-4M12 8h.01"/>
                      </svg>
                      <h4 style={{ margin: 0, color: '#5b21b6', fontSize: '1rem' }}>
                        {language === 'es' ? 'Análisis Integral IA' : 'Comprehensive AI Analysis'}
                      </h4>
                    </div>

                    {!clientAllAnalysis && !clientAllAnalysisLoading && !clientAllAnalysisError && (
                      <p style={{ margin: '0 0 0.9rem', fontSize: '0.88rem', color: '#6b7280' }}>
                        {language === 'es'
                          ? `Analiza los ${clientQAll.length} cuestionario(s) del cliente de forma integral para identificar patrones, correlaciones y áreas prioritarias de intervención.`
                          : `Analyze all ${clientQAll.length} client questionnaire(s) comprehensively to identify patterns, correlations, and priority intervention areas.`}
                      </p>
                    )}

                    {clientAllAnalysisLoading && (
                      <div style={{ textAlign: 'center', padding: '1.25rem', color: '#7c3aed' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.75rem', display: 'block' }}>
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                        <p style={{ margin: 0, fontWeight: 500, fontSize: '0.9rem' }}>
                          {language === 'es'
                            ? 'Generando análisis integral...'
                            : 'Generating comprehensive analysis...'}
                        </p>
                      </div>
                    )}

                    {clientAllAnalysisError && (
                      <p style={{ color: '#dc2626', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                        {clientAllAnalysisError}
                      </p>
                    )}

                    {clientAllAnalysis && !clientAllAnalysisLoading && (
                      <div
                        style={{
                          lineHeight: '1.7',
                          color: '#374151',
                          whiteSpace: 'pre-wrap',
                          fontSize: '0.9rem',
                          marginBottom: '1rem',
                        }}
                      >
                        {clientAllAnalysis}
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: clientAllAnalysis ? '0' : '0.25rem',
                        padding: '0.55rem 0.75rem',
                        backgroundColor: '#ede9fe',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        color: '#5b21b6',
                        marginBottom: '0.9rem',
                      }}
                    >
                      {language === 'es'
                        ? '⚠️ Análisis generado por IA como herramienta de apoyo clínico. No constituye un diagnóstico definitivo. El juicio clínico del profesional prevalece.'
                        : '⚠️ AI-generated analysis as a clinical support tool. Does not constitute a definitive diagnosis. The professional\'s clinical judgment prevails.'}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
                      <button
                        type="button"
                        onClick={() => void handleClientAllAiAnalysis()}
                        disabled={clientAllAnalysisLoading}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.45rem 1rem',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: clientAllAnalysisLoading ? '#9ca3af' : '#7c3aed',
                          color: '#fff',
                          cursor: clientAllAnalysisLoading ? 'not-allowed' : 'pointer',
                          fontSize: '0.88rem',
                          fontWeight: 600,
                        }}
                      >
                        {clientAllAnalysisLoading ? (
                          <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                            </svg>
                            {language === 'es' ? 'Analizando...' : 'Analyzing...'}
                          </>
                        ) : (
                          <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/>
                              <path d="M12 16v-4M12 8h.01"/>
                            </svg>
                            {clientAllAnalysis
                              ? (language === 'es' ? 'Regenerar análisis' : 'Regenerate analysis')
                              : (language === 'es' ? 'Análisis IA de todos los cuestionarios' : 'AI Analysis of all questionnaires')}
                          </>
                        )}
                      </button>

                      {clientAllAnalysis && !clientAllAnalysisLoading && (
                        <button
                          type="button"
                          onClick={() => void handleSaveClientAllAnalysis()}
                          disabled={savingClientAllAnalysis}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.45rem 1rem',
                            borderRadius: '6px',
                            border: 'none',
                            backgroundColor: savedClientAllAnalysis
                              ? '#059669'
                              : savingClientAllAnalysis
                                ? '#9ca3af'
                                : '#0f766e',
                            color: '#fff',
                            cursor: savingClientAllAnalysis ? 'not-allowed' : 'pointer',
                            fontSize: '0.88rem',
                            fontWeight: 600,
                          }}
                        >
                          {savingClientAllAnalysis ? (
                            <>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                              </svg>
                              {language === 'es' ? 'Guardando...' : 'Saving...'}
                            </>
                          ) : savedClientAllAnalysis ? (
                            <>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                              {language === 'es' ? '¡Guardado!' : 'Saved!'}
                            </>
                          ) : (
                            <>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                <polyline points="17 21 17 13 7 13 7 21"/>
                                <polyline points="7 3 7 8 15 8"/>
                              </svg>
                              {language === 'es' ? 'Guardar análisis en Storage' : 'Save analysis to Storage'}
                            </>
                          )}
                        </button>
                      )}

                      {clientAllAnalysis && !clientAllAnalysisLoading && (
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(clientAllAnalysis);
                            setCopiedClientAllAnalysis(true);
                            setTimeout(() => setCopiedClientAllAnalysis(false), 2500);
                          }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.45rem 1rem', borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            backgroundColor: copiedClientAllAnalysis ? '#f0fdf4' : '#fff',
                            color: copiedClientAllAnalysis ? '#15803d' : '#374151',
                            cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600,
                          }}
                        >
                          {copiedClientAllAnalysis ? (
                            <>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                              {language === 'es' ? '¡Copiado!' : 'Copied!'}
                            </>
                          ) : (
                            <>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                              </svg>
                              {language === 'es' ? 'Copiar al portapapeles' : 'Copy to clipboard'}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

