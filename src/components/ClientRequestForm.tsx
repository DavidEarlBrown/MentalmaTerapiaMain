import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useProfession } from '../contexts/ProfessionContext';
import { fetchSessionPrices, fetchCounselingTypes, fetchAvailableSlotsByDay, fetchProblems, filterPricesForProfessional } from '../lib/api';
import { getAIAssistanceForForm } from '../lib/mariService';
import { RightClickInfoModal } from './RightClickInfoModal';
import { ProfessionalResumeModal } from './ProfessionalResumeModal';
import { ExpandableProfessionalPhoto } from './ProfessionalPhotoLightbox';
import { InfoSelect } from './InfoSelect';
import { ProblemCheckboxItem } from './ProblemCheckboxItem';
import { RequestInfoModal } from './PendingRequestsModal';
import { ExistingSessionsModal } from './ExistingSessionsModal';
import { StandardQuestionnaires, type StandardQuestionnairesHandle } from './StandardQuestionnaires';
import { TimezoneSelector, detectUserTimezone } from './TimezoneSelector';
import { normalizeTimezone, convertTime as sharedConvertTime } from '../lib/timezone';
import emailjs from '@emailjs/browser';
import { supabase } from '../lib/supabaseClient';
import type { Specialty, Professional, ClientRequestFormData, SessionPrice, CounselingType, UserFormData, AvailableSlot, Problem, ClientRequest } from '../types';
import { LanguageFlag } from './CountryFlag';
import { getCountryCodeForLanguage } from '../lib/languageCountryCodes';
import {
  getSessionStatusLabel,
  getSessionStatusOptions,
  getClientRequestStatusValue,
  normalizeSessionStatus,
  type SessionStatusCode,
} from '../lib/sessionStatus';
import {
  buildReservedBlock,
  getMinimumBookableDateString,
  getProfessionalMinimumNoticeHours,
  isSlotBookable,
  normalizeTimeToHHMM,
  type ReservedSessionBlock,
} from '../lib/professionalScheduling';
import { resolveNewSessionPackageFields } from '../lib/sessionPackage';
import { CANCEL_SESSION_PREFILL_KEY, CHANGE_SESSION_PREFILL_KEY } from '../lib/cancelSessionPolicy';
import { expireUnpaidPendingRequests } from '../lib/expireUnpaidRequests';
import { applyClientRequestChanges } from '../lib/sessionChangeSync';
import { CompanyAiIcon } from './CompanyAiIcon';
import {
  definitionToStoredJson,
  findHardcodedDefinition,
  loadActiveCatalogSummaries,
  loadAllCatalogSummaries,
  loadStoredQuestionsForLanguage,
  recommendCatalogQuestionnaires,
} from '../lib/stdQuestionnaireCatalog';

interface ClientRequestFormProps {
  specialties: Specialty[];
  professionals: Professional[];
  onSubmit: (data: ClientRequestFormData) => Promise<ClientRequest | void>;
  loading: boolean;
  initialIssue?: string;
  currentUser?: UserFormData | null;
  initialData?: Partial<ClientRequestFormData>;
  onNavigate?: (section: string) => void;
  /** When set, load this client_request into the form for Change Session. */
  changeSessionRequestId?: string | null;
  onChangeSessionConsumed?: () => void;
}

const PAYMENT_PREFILL_KEY = 'payment_prefill_from_booking';

export function ClientRequestForm({
  specialties,
  professionals,
  onSubmit,
  loading,
  initialIssue = '',
  currentUser,
  initialData,
  onNavigate,
  changeSessionRequestId = null,
  onChangeSessionConsumed,
}: ClientRequestFormProps) {
  const { t, language } = useLanguage();
  const { activeProfession } = useProfession();
  const filteredSpecialties = activeProfession
    ? specialties.filter(s => s.profession_id === activeProfession.id)
    : specialties;
  const [formData, setFormData] = useState<ClientRequestFormData>({
    user_id: initialData?.user_id ?? undefined,
    username: initialData?.username ?? '',
    full_name: initialData?.full_name ?? '',
    client_name: initialData?.client_name ?? '',
    client_email: initialData?.client_email ?? '',
    client_phone: initialData?.client_phone ?? '',
    issue: initialData?.issue ?? initialIssue,
    preferred_date: initialData?.preferred_date ?? '',
    preferred_time: initialData?.preferred_time ?? '',
    time_zone: initialData?.time_zone ?? undefined,
    session_length: initialData?.session_length ?? 1,
    professional_id: initialData?.professional_id ?? '',
    specialty_id: initialData?.specialty_id ?? '',
    counseling_type_id: initialData?.counseling_type_id ?? '',
    session_price_id: initialData?.session_price_id ?? undefined,
    price_amount: initialData?.price_amount ?? '',
    price_currency: initialData?.price_currency ?? '',
    num_sessions: initialData?.num_sessions ?? 1,
    session_no: initialData?.session_no ?? 1,
    TimeSlotId: initialData?.TimeSlotId ?? undefined,
    statusvalue: initialData?.statusvalue ?? initialData?.session_status ?? 0,
  });

  const [sessionStatus, setSessionStatus] = useState<SessionStatusCode>(
    normalizeSessionStatus(initialData?.statusvalue ?? initialData?.session_status ?? 0),
  );

  const [allSessionPrices, setAllSessionPrices] = useState<SessionPrice[]>([]);
  const [sessionPrices, setSessionPrices] = useState<SessionPrice[]>([]);
  const [counselingTypes, setCounselingTypes] = useState<CounselingType[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [showExistingSessions, setShowExistingSessions] = useState(false);
  const [infoRequest, setInfoRequest] = useState<ClientRequest | null>(null);
  const [showTreatmentExplanation, setShowTreatmentExplanation] = useState(false);
  const [treatmentExplanation, setTreatmentExplanation] = useState('');
  const [loadingTreatmentExplanation, setLoadingTreatmentExplanation] = useState(false);
  const [savingTreatmentPlan, setSavingTreatmentPlan] = useState(false);
  const [treatmentPlanSaved, setTreatmentPlanSaved] = useState(false);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [questionnaire, setQuestionnaire] = useState<Array<{ question: string; options: string[] }>>([]);
  const [loadingQuestionnaire, setLoadingQuestionnaire] = useState(false);
  const [savingQuestionnaire, setSavingQuestionnaire] = useState(false);
  const [questionnaireSaved, setQuestionnaireSaved] = useState(false);
  const [questionnaireResponses, setQuestionnaireResponses] = useState<Record<number, number>>({});
  const [showStandardQuestionnaires, setShowStandardQuestionnaires] = useState(false);
  const [standardQuestionnaireContext, setStandardQuestionnaireContext] = useState('');
  const [loadingStandardContext, setLoadingStandardContext] = useState(false);
  const [recommendedStdIds, setRecommendedStdIds] = useState<string[]>([]);
  const [questionnaireSourceName, setQuestionnaireSourceName] = useState('');
  const standardQuestionnairesRef = useRef<StandardQuestionnairesHandle>(null);
  const [, setSqState] = useState(0);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [selectedProblems, setSelectedProblems] = useState<number[]>([]);
  const [aiSuggestingProblems, setAiSuggestingProblems] = useState(false);
  const [problemsExpanded, setProblemsExpanded] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [timezone, setTimezone] = useState(detectUserTimezone());
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [reservedSessionBlocks, setReservedSessionBlocks] = useState<ReservedSessionBlock[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [autoDateOpen, setAutoDateOpen] = useState(false);
  const [autoDateDays, setAutoDateDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [searchingDate, setSearchingDate] = useState(false);
  const [autoDateError, setAutoDateError] = useState('');
  const [profDropdownOpen, setProfDropdownOpen] = useState(false);
  const [profPopup, setProfPopup] = useState<Professional | null>(null);
  const [showResumeForPopup, setShowResumeForPopup] = useState(false);
  const profDropdownRef = useRef<HTMLDivElement>(null);
  const [maxTzDiffHours, setMaxTzDiffHours] = useState<number | null>(null);
  /** When the AI returns 3 picks (>5 professionals in pool), these IDs are highlighted; user still picks one. */
  const [aiSuggestedProfessionalIds, setAiSuggestedProfessionalIds] = useState<string[]>([]);
  /** Expanded "Details" panel for a MarI-suggested professional (comparison list). */
  const [expandedAiSuggestedProfId, setExpandedAiSuggestedProfId] = useState<string | null>(null);
  const [rightClickModal, setRightClickModal] = useState<{ title: string; content: string; loading: boolean; itemType: 'specialty' | 'problem' | 'counselingType' | 'professional'; itemId: string; isAiGenerated: boolean } | null>(null);
  const [specialtyDescOverrides, setSpecialtyDescOverrides] = useState<Record<string, { en: string; es: string }>>({});
  const [professionalBioOverrides, setProfessionalBioOverrides] = useState<Record<string, { en: string; es: string }>>({});
  const [aiFilling, setAiFilling] = useState(false);
  const [aiFillingStep, setAiFillingStep] = useState('');
  const [prefilledFromHistory, setPrefilledFromHistory] = useState(false);
  const [latestRequestLoaded, setLatestRequestLoaded] = useState(false);
  const [isEditingExistingRequest, setIsEditingExistingRequest] = useState(false);
  const [editingRequestId, setEditingRequestId] = useState<string | undefined>();
  const [editingOriginalRequest, setEditingOriginalRequest] = useState<ClientRequest | null>(null);
  const [savingChanges, setSavingChanges] = useState(false);
  const [changeSaveMessage, setChangeSaveMessage] = useState<string | null>(null);
  const [loadingChangeSession, setLoadingChangeSession] = useState(false);
  const [preserveStoredTime, setPreserveStoredTime] = useState(false);
  /** Captured once so Change Session wins over loadLatestRequest. */
  const pendingChangeRequestIdRef = useRef<string | null>(
    (() => {
      if (changeSessionRequestId) return changeSessionRequestId;
      try {
        return sessionStorage.getItem(CHANGE_SESSION_PREFILL_KEY);
      } catch {
        return null;
      }
    })(),
  );
  const [storedTimeSlot, setStoredTimeSlot] = useState<{
    professionalTime: string;
    clientTime: string;
    profTz: string;
    clientTz: string;
  } | null>(null);

  const normalizeTimeForSlot = (timeValue: string | undefined): string => {
    if (!timeValue) return '';
    const trimmed = timeValue.trim();
    if (!trimmed) return '';

    // Handle values like "14:30", "14:30:00", "14:30:00+00", "14:30:00.000Z"
    const hhmmMatch = trimmed.match(/^(\d{1,2}):(\d{2})/);
    if (hhmmMatch) {
      return `${hhmmMatch[1].padStart(2, '0')}:${hhmmMatch[2]}`;
    }

    // Handle values like "2:30 PM" / "2:30PM"
    const amPmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (amPmMatch) {
      const rawHour = parseInt(amPmMatch[1], 10);
      const minutes = amPmMatch[2];
      const period = amPmMatch[3].toUpperCase();
      const hour24 = period === 'PM' ? (rawHour % 12) + 12 : (rawHour % 12);
      return `${String(hour24).padStart(2, '0')}:${minutes}`;
    }

    return trimmed;
  };

  useEffect(() => {
    loadPrices();
  }, []);

  // Keep the request payload timezone in sync with what the client selected.
  // Used for time-difference calculations when editing/booking existing requests.
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      time_zone: normalizeTimezone(timezone),
    }));
  }, [timezone]);

  // Re-fetch profession-scoped data when the active profession changes
  useEffect(() => {
    loadCounselingTypes(activeProfession?.id);
    loadProblems(activeProfession?.id);
    // Clear any previously selected items that may not belong to the new profession
    setFormData(prev => ({ ...prev, counseling_type_id: '', specialty_id: '' }));
    setSelectedProblems([]);
  }, [activeProfession?.id]); // loadCounselingTypes and loadProblems are stable inline functions

  useEffect(() => {
    if (initialIssue) {
      setFormData(prev => ({ ...prev, issue: initialIssue }));
    }
  }, [initialIssue]);

  useEffect(() => {
    if (initialData?.preferred_date) {
      console.log('Setting selectedDate from initialData:', initialData.preferred_date);
      setSelectedDate(initialData.preferred_date);
    }
  }, [initialData?.preferred_date]);

  useEffect(() => {
    if (expandedAiSuggestedProfId && !aiSuggestedProfessionalIds.includes(expandedAiSuggestedProfId)) {
      setExpandedAiSuggestedProfId(null);
    }
  }, [aiSuggestedProfessionalIds, expandedAiSuggestedProfId]);

  const loadLatestRequest = async (userId: string, email: string) => {
    try {
      let query = supabase
        .from('client_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

      if (userId) {
        query = query.eq('user_id', userId);
      } else if (email) {
        query = query.eq('client_email', email);
      } else {
        return;
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        const latest = data[0] as ClientRequest;
        const reqAny = latest as unknown as { professional_id?: string | null; psychologist_id?: string | null };
        const professionalId = reqAny.professional_id ?? reqAny.psychologist_id;

        setFormData(prev => ({
          ...prev,
          issue: latest.issue || prev.issue,
          specialty_id: latest.specialty_id || prev.specialty_id,
          counseling_type_id: latest.counseling_type_id || prev.counseling_type_id,
          professional_id: professionalId || prev.professional_id,
          session_length: latest.session_length ?? prev.session_length,
          session_price_id: latest.session_price_id ?? prev.session_price_id,
          price_amount: latest.price_amount || prev.price_amount,
          price_currency: latest.price_currency || prev.price_currency,
          num_sessions: latest.num_sessions ?? prev.num_sessions,
          session_no: latest.session_no ?? prev.session_no,
          time_zone: latest.time_zone || prev.time_zone,
          client_phone: latest.client_phone || prev.client_phone,
        }));

        setSessionStatus(getClientRequestStatusValue(latest));
        if (latest.time_zone) setTimezone(normalizeTimezone(latest.time_zone));
        setPrefilledFromHistory(true);
      }
    } catch (err) {
      console.error('Error loading latest request:', err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      console.log('ClientRequestForm - currentUser received:', currentUser);
      setFormData(prev => ({
        ...prev,
        user_id: currentUser.id,
        username: currentUser.username || '',
        full_name: currentUser.full_name || '',
        client_name: currentUser.full_name || '',
        client_email: currentUser.email || '',
        client_phone: currentUser.phone || prev.client_phone,
      }));
      // Do not overwrite a Change Session prefill with the latest unrelated request.
      if (!latestRequestLoaded && !pendingChangeRequestIdRef.current && !isEditingExistingRequest) {
        setLatestRequestLoaded(true);
        loadLatestRequest(currentUser.id, currentUser.email || '');
      }
    } else {
      console.log('ClientRequestForm - No currentUser provided');
    }
  }, [currentUser]);

  const selectedProfessional = useMemo(
    () => professionals.find(p => p.id === formData.professional_id) ?? null,
    [professionals, formData.professional_id],
  );

  const minimumNoticeHours = useMemo(
    () => getProfessionalMinimumNoticeHours(selectedProfessional),
    [selectedProfessional],
  );

  const minimumBookableDate = useMemo(
    () => getMinimumBookableDateString(
      minimumNoticeHours,
      normalizeTimezone(selectedProfessional?.time_zone ?? timezone),
    ),
    [minimumNoticeHours, selectedProfessional?.time_zone, timezone],
  );

  useEffect(() => {
    // Keep existing session date/time when editing (Change Session).
    if (isEditingExistingRequest || pendingChangeRequestIdRef.current) return;
    if (selectedDate && selectedDate < minimumBookableDate) {
      setSelectedDate('');
      setFormData(prev => ({
        ...prev,
        preferred_date: '',
        preferred_time: '',
        TimeSlotId: undefined,
      }));
    }
  }, [minimumBookableDate, selectedDate, isEditingExistingRequest]);

  useEffect(() => {
    if (formData.professional_id && selectedDate) {
      loadAvailableSlots();
    } else {
      setAvailableSlots([]);
      setReservedSessionBlocks([]);
    }
  }, [formData.professional_id, selectedDate, minimumNoticeHours]);

  useEffect(() => {
    if (allSessionPrices.length > 0) {
      const filtered = filterPricesForProfessional(
        allSessionPrices,
        formData.professional_id || null,
      );
      setSessionPrices(filtered);
      setFormData(prev => ({
        ...prev,
        session_price_id: undefined,
        price_amount: '',
        price_currency: '',
        num_sessions: 1,
        session_no: 1,
      }));
    }
  }, [formData.professional_id]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profDropdownRef.current && !profDropdownRef.current.contains(e.target as Node)) {
        setProfDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchReservedSessionBlocks = async (professionalId: string, date: string): Promise<ReservedSessionBlock[]> => {
    // Free any unpaid holds that have expired before computing availability.
    await expireUnpaidPendingRequests();

    const prof = professionals.find(p => p.id === professionalId);
    const profTz = normalizeTimezone(prof?.time_zone);
    const blocks: ReservedSessionBlock[] = [];
    const excludedRequestStatuses = new Set(['declined', 'cancelled', 'canceled']);
    const excludedSessionStatuses = new Set(['cancelled', 'canceled']);
    // Also exclude numeric lifecycle statuses that free the slot (2/3/4/5).
    const excludedLifecycle = new Set([2, 3, 4, 5]);

    const { data: requests } = await supabase
      .from('client_requests')
      .select('preferred_date, preferred_time, scheduled_datetime, session_length, status, statusvalue, session_status')
      .eq('professional_id', professionalId)
      .eq('preferred_date', date);

    for (const req of requests ?? []) {
      if (req.status && excludedRequestStatuses.has(String(req.status).toLowerCase())) continue;
      const lifecycle = getClientRequestStatusValue(req);
      if (excludedLifecycle.has(lifecycle)) continue;

      let time = normalizeTimeToHHMM(req.preferred_time);
      if (!time && req.scheduled_datetime) {
        const scheduled = new Date(req.scheduled_datetime);
        if (!Number.isNaN(scheduled.getTime())) {
          const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: profTz,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).formatToParts(scheduled);
          let hour = parts.find(p => p.type === 'hour')?.value || '00';
          const minute = parts.find(p => p.type === 'minute')?.value || '00';
          if (hour === '24') hour = '00';
          time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
        }
      }

      const block = buildReservedBlock(date, time, profTz, req.session_length ?? 1);
      if (block) blocks.push(block);
    }

    const { data: sessions } = await supabase
      .from('sessions')
      .select('session_date, duration_minutes, session_length, status')
      .eq('professional_id', professionalId)
      .gte('session_date', `${date}T00:00:00`)
      .lte('session_date', `${date}T23:59:59.999`);

    for (const session of sessions ?? []) {
      if (session.status && excludedSessionStatuses.has(String(session.status).toLowerCase())) continue;
      if (!session.session_date) continue;

      const scheduled = new Date(session.session_date);
      if (Number.isNaN(scheduled.getTime())) continue;

      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: profTz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(scheduled);
      let hour = parts.find(p => p.type === 'hour')?.value || '00';
      const minute = parts.find(p => p.type === 'minute')?.value || '00';
      if (hour === '24') hour = '00';
      const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;

      const durationHours = session.session_length
        ?? (session.duration_minutes ? session.duration_minutes / 60 : 1);
      const block = buildReservedBlock(date, time, profTz, durationHours);
      if (block) blocks.push(block);
    }

    return blocks;
  };

  const loadReservedSessionsForDate = async (professionalId: string, date: string) => {
    const blocks = await fetchReservedSessionBlocks(professionalId, date);
    setReservedSessionBlocks(blocks);
  };

  const loadAvailableSlots = async () => {
    if (!formData.professional_id || !selectedDate) return;

    setLoadingSlots(true);
    try {
      const date = new Date(selectedDate);
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayOfWeek = dayNames[date.getDay()];

      const [slots] = await Promise.all([
        fetchAvailableSlotsByDay(formData.professional_id, dayOfWeek),
        loadReservedSessionsForDate(formData.professional_id, selectedDate),
      ]);
      setAvailableSlots(slots);
    } catch (error) {
      console.error('Error loading available slots:', error);
      setAvailableSlots([]);
      setReservedSessionBlocks([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const findNextAvailableDate = async () => {
    if (!formData.professional_id) return;

    setSearchingDate(true);
    setAutoDateError('');

    try {
      const { data: slots, error } = await supabase
        .from('available_slots')
        .select('*')
        .eq('professional_id', formData.professional_id)
        .eq('is_booked', false);

      if (error) throw new Error(error.message);
      if (!slots || slots.length === 0) {
        setAutoDateError(language === 'es' ? 'No hay horarios disponibles para este profesional' : 'No available slots for this professional');
        return;
      }

      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
      const availableDays = new Set<number>();
      for (const slot of slots) {
        dayNames.forEach((day, index) => {
          if (slot[day] === 'Y') {
            availableDays.add(index);
          }
        });
      }

      if (availableDays.size === 0) {
        setAutoDateError(language === 'es' ? 'No hay días disponibles configurados' : 'No available days configured');
        return;
      }

      if (autoDateDays.length === 0) {
        setAutoDateError(language === 'es' ? 'Seleccione al menos un día de la semana.' : 'Please select at least one day of the week.');
        return;
      }

      const today = new Date();
      const startDate = new Date(`${minimumBookableDate}T12:00:00`);
      if (Number.isNaN(startDate.getTime()) || startDate < today) {
        startDate.setTime(today.getTime());
        startDate.setDate(startDate.getDate() + 1);
      }
      const maxDate = new Date(today);
      maxDate.setDate(today.getDate() + 90);

      const current = new Date(startDate);
      const prof = professionals.find(p => p.id === formData.professional_id);
      const profTz = normalizeTimezone(prof?.time_zone);
      const sessionLengthHours = formData.session_length || 1;

      while (current <= maxDate) {
        if (availableDays.has(current.getDay()) && autoDateDays.includes(current.getDay())) {
          const dateStr = new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(current);

          if (dateStr >= minimumBookableDate) {
            const dayOfWeek = dayNames[current.getDay()];
            const daySlots = await fetchAvailableSlotsByDay(formData.professional_id, dayOfWeek);
            const reserved = await fetchReservedSessionBlocks(formData.professional_id, dateStr);
            const candidateTimes = buildCandidateTimeValues(daySlots);
            const hasBookableSlot = candidateTimes.some(time =>
              isSlotBookable(
                dateStr,
                time,
                profTz,
                minimumNoticeHours,
                sessionLengthHours,
                reserved,
              ),
            );

            if (hasBookableSlot) {
              handleDateChange(dateStr);
              setAutoDateOpen(false);
              return;
            }
          }
        }
        current.setDate(current.getDate() + 1);
      }

      setAutoDateError(
        language === 'es'
          ? 'No se encontraron fechas disponibles en los próximos 90 días para los días seleccionados.'
          : 'No available dates found in the next 90 days for the selected days.'
      );
    } catch (err) {
      console.error('Error finding next available date:', err);
      setAutoDateError(err instanceof Error ? err.message : 'Failed to find available date');
    } finally {
      setSearchingDate(false);
    }
  };

  const loadPrices = async (professionalId?: string) => {
    setLoadingPrices(true);
    try {
      const prices = await fetchSessionPrices();
      setAllSessionPrices(prices);
      if (professionalId) {
        setSessionPrices(filterPricesForProfessional(prices, professionalId));
      } else {
        setSessionPrices(filterPricesForProfessional(prices, null));
      }
    } catch (error) {
      console.error('Error loading session prices:', error);
    } finally {
      setLoadingPrices(false);
    }
  };

  const loadCounselingTypes = async (professionId?: string) => {
    try {
      const types = await fetchCounselingTypes(professionId);
      setCounselingTypes(types);
    } catch (error) {
      console.error('Error loading counseling types:', error);
    }
  };

  const loadProblems = async (professionId?: string) => {
    try {
      const data = await fetchProblems(professionId);
      setProblems(data);
    } catch (error) {
      console.error('Error loading problems:', error);
    }
  };

  const toggleProblem = (problemId: number) => {
    setSelectedProblems(prev =>
      prev.includes(problemId)
        ? prev.filter(id => id !== problemId)
        : [...prev, problemId]
    );
  };

  const handleAISuggestProblems = async () => {
    if (!formData.issue || formData.issue.trim() === '') {
      setAiError(t('pleaseDescribeIssue') || 'Please describe your issue first');
      return;
    }

    if (problems.length === 0) return;

    setAiSuggestingProblems(true);
    setAiError(null);

    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

      if (!apiKey) throw new Error('Gemini API key not configured');

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: { temperature: 0.3, topP: 0.9, topK: 40 },
      });

      const problemsList = problems.map(p => {
        const name = language === 'en' ? p.problem_abrev : (p.problem_abrev_es || p.problem_abrev);
        const desc = language === 'en' ? p.problem_desc : (p.problem_desc_es || p.problem_desc);
        return `ID:${p.id} - ${name}: ${desc}`;
      }).join('\n');

      const professionName = activeProfession
        ? (language === 'en' ? activeProfession.name_en : activeProfession.name_es)
        : null;

      const selectedSpecialty = formData.specialty_id
        ? filteredSpecialties.find(s => s.id === formData.specialty_id)
        : null;
      const specialtyName = selectedSpecialty
        ? (language === 'en' ? selectedSpecialty.name_en : selectedSpecialty.name_es)
        : null;

      const professionLine = professionName
        ? (language === 'es'
          ? `Contexto: Esta consulta es para un profesional de ${professionName}.`
          : `Context: This consultation is for a ${professionName} professional.`)
        : '';

      const specialtyLine = specialtyName
        ? (language === 'es'
          ? `Especialidad seleccionada: ${specialtyName}. Prioriza los problemas relacionados con esta especialidad.`
          : `Selected specialty: ${specialtyName}. Prioritize problems related to this specialty.`)
        : '';

      const prompt = language === 'es'
        ? `Eres MarI, un asistente de IA empático. ${professionLine} ${specialtyLine}
Basándote en la descripción del problema del cliente, selecciona los problemas más relevantes de la siguiente lista.

Descripción del cliente:
"${formData.issue}"

Lista de problemas disponibles:
${problemsList}

Devuelve SOLO los IDs numéricos de los problemas relevantes, separados por comas. No incluyas explicaciones. Ejemplo: 1,3,5`
        : `You are MarI, an empathetic AI assistant. ${professionLine} ${specialtyLine}
Based on the client's issue description, select the most relevant problems from the following list.

Client's description:
"${formData.issue}"

Available problems:
${problemsList}

Return ONLY the numeric IDs of the relevant problems, separated by commas. No explanations. Example: 1,3,5`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim();

      const suggestedIds = text.split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(id => !isNaN(id) && problems.some(p => p.id === id));

      if (suggestedIds.length > 0) {
        setSelectedProblems(suggestedIds);
      } else {
        setAiError(language === 'es' ? 'No se encontraron problemas coincidentes' : 'No matching problems found');
      }
    } catch (error) {
      console.error('AI error:', error);
      setAiError(t('aiError') || 'Failed to get AI suggestion. Please try again.');
    } finally {
      setAiSuggestingProblems(false);
    }
  };

  const handleDateChange = (date: string) => {
    console.log('📆 handleDateChange called with date:', date);
    setSelectedDate(date);
    setPreserveStoredTime(false);
    setStoredTimeSlot(null);
    setFormData({ ...formData, preferred_date: date, preferred_time: '', session_length: 1, TimeSlotId: undefined });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(false);

    if (!formData.user_id) {
      setSubmitError('User session not found. Please sign in and try again.');
      return;
    }

    try {
      // ── Change Session: update existing request + sync Zoho / Calendar / Meet ──
      if (isEditingExistingRequest && editingRequestId && editingOriginalRequest) {
        setSavingChanges(true);
        const selectedProfessional =
          professionals.find(p => p.id === formData.professional_id) ?? null;
        const { sync } = await applyClientRequestChanges({
          requestId: editingRequestId,
          formData: {
            ...formData,
            statusvalue: sessionStatus,
            session_status: sessionStatus,
            time_zone: normalizeTimezone(formData.time_zone || timezone),
          },
          original: editingOriginalRequest,
          professional: selectedProfessional,
          language,
        });

        const syncNotes: string[] = [];
        if (sync.calendarUpdated) {
          syncNotes.push(
            language === 'es'
              ? 'Invitación de calendario y Google Meet actualizadas.'
              : 'Calendar invite and Google Meet updated.',
          );
        }
        if (sync.zohoUpdated) {
          syncNotes.push(
            language === 'es'
              ? 'Contabilidad de Zoho Books corregida.'
              : 'Zoho Books accounting corrected.',
          );
        }
        if (sync.warnings.length > 0) {
          syncNotes.push(...sync.warnings);
        }

        setEditingRequestId(undefined);
        setEditingOriginalRequest(null);
        setIsEditingExistingRequest(false);
        setChangeSaveMessage(
          [
            language === 'es'
              ? 'Cambios de sesión guardados.'
              : 'Session changes saved.',
            ...syncNotes,
          ].join(' '),
        );
        setSubmitSuccess(true);
        setTimeout(() => {
          setSubmitSuccess(false);
          setChangeSaveMessage(null);
        }, 10000);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const packageFields = resolveNewSessionPackageFields(formData.num_sessions);
      const paymentPrefill = {
        client_email: formData.client_email,
        client_name: formData.client_name,
        client_phone: formData.client_phone || undefined,
      };
      const submitted = await onSubmit({
        ...formData,
        ...packageFields,
        statusvalue: sessionStatus,
        session_status: sessionStatus,
        // If for any reason timezone is missing/null, fall back to Colombia.
        time_zone: normalizeTimezone(formData.time_zone || timezone),
      });

      try {
        await sendEmail();
      } catch {
      }

      if (onNavigate) {
        try {
          sessionStorage.setItem(
            PAYMENT_PREFILL_KEY,
            JSON.stringify({
              ...paymentPrefill,
              client_request_id: submitted?.id,
            }),
          );
        } catch {
          // sessionStorage may be unavailable
        }
        onNavigate('payment');
        return;
      }

      setFormData({
        user_id: currentUser?.id,
        username: currentUser?.username || '',
        full_name: currentUser?.full_name || '',
        client_name: currentUser?.full_name || '',
        client_email: currentUser?.email || '',
        client_phone: currentUser?.phone || '',
        issue: '',
        preferred_date: '',
        preferred_time: '',
        time_zone: normalizeTimezone(timezone),
        session_length: 1,
        professional_id: '',
        specialty_id: '',
        counseling_type_id: '',
        session_price_id: undefined,
        price_amount: '',
        price_currency: '',
        num_sessions: 1,
        session_no: 1,
        TimeSlotId: undefined,
        statusvalue: 0,
        session_status: 0,
      });
      setSelectedDate('');
      setSessionStatus(0);
      setSelectedProblems([]);
      setAiSuggestedProfessionalIds([]);
      setPrefilledFromHistory(false);
      setLatestRequestLoaded(false);
      setEditingRequestId(undefined);
      setEditingOriginalRequest(null);
      setIsEditingExistingRequest(false);
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 6000);
    } catch (error) {
      console.error('Error submitting request:', error);
      setSubmitError(
        error instanceof Error
          ? error.message
          : (language === 'es'
            ? 'Error al guardar los cambios. Intente de nuevo.'
            : 'Failed to save changes. Please try again.'),
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSavingChanges(false);
    }
  };

  const handlePaySessionFromExisting = (req: ClientRequest) => {
    if (!onNavigate) return;

    try {
      sessionStorage.setItem(
        PAYMENT_PREFILL_KEY,
        JSON.stringify({
          client_email: req.client_email || formData.client_email,
          client_name: req.client_name || req.username || formData.client_name,
          client_phone: req.client_phone || formData.client_phone || undefined,
          client_request_id: req.id,
        }),
      );
    } catch {
      // sessionStorage may be unavailable
    }

    setShowExistingSessions(false);
    onNavigate('payment');
  };

  const handleCancelSessionFromExisting = (req: ClientRequest) => {
    if (!onNavigate || !req.id) return;

    try {
      sessionStorage.setItem(CANCEL_SESSION_PREFILL_KEY, req.id);
    } catch {
      // sessionStorage may be unavailable
    }

    setShowExistingSessions(false);
    onNavigate('cancel-session');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name === 'session_price_id' && value) {
      const selectedPrice = sessionPrices.find(p => p.id === parseInt(value));
      if (selectedPrice) {
        setFormData({
          ...formData,
          session_price_id: selectedPrice.id,
          price_amount: selectedPrice.Price,
          price_currency: selectedPrice.Currency,
          ...resolveNewSessionPackageFields(selectedPrice.NumSessions),
        });
        return;
      }
    }

    if (name === 'preferred_date' && value.includes('T')) {
      const parts = value.split('|');
      const [date, time] = parts[0].split('T');
      const slotId = parts[1];

      setFormData({
        ...formData,
        preferred_date: date,
        preferred_time: time,
        TimeSlotId: slotId,
      });
      return;
    }

    if (name === 'session_length') {
      setFormData({
        ...formData,
        session_length: parseInt(value, 10),
      });
      return;
    }

    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const buildCandidateTimeValues = (slots: AvailableSlot[]): string[] => {
    if (slots.length === 0) {
      const times: string[] = [];
      for (let hour = 8; hour < 18; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          times.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
        }
      }
      return times;
    }

    const times: string[] = [];
    const addedTimes = new Set<string>();

    slots.forEach(slot => {
      const startParts = slot.start_time.split(':');
      const endParts = slot.end_time.split(':');

      let startHour = parseInt(startParts[0], 10);
      const startMinute = parseInt(startParts[1], 10);
      let endHour = parseInt(endParts[0], 10);
      const endMinute = parseInt(endParts[1], 10);

      let currentHour = startHour;
      let currentMinute = startMinute < 30 ? 0 : 30;
      if (startMinute > 30) {
        currentHour++;
        currentMinute = 0;
      } else if (startMinute > 0 && startMinute <= 30) {
        currentMinute = 30;
      }

      while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
        const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
        if (!addedTimes.has(timeStr)) {
          addedTimes.add(timeStr);
          times.push(timeStr);
        }

        currentMinute += 30;
        if (currentMinute >= 60) {
          currentMinute = 0;
          currentHour++;
        }
      }
    });

    return times.sort((a, b) => a.localeCompare(b));
  };

  const convertTime = (timeStr: string, fromTz: string, toTz: string): string => {
    return sharedConvertTime(timeStr, fromTz, toTz, formData.preferred_date || undefined);
  };

  const getTimezoneAbbr = (tz: string): string => {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'short'
      });
      const parts = formatter.formatToParts(new Date());
      const tzPart = parts.find(p => p.type === 'timeZoneName');
      return tzPart?.value || tz;
    } catch {
      return tz;
    }
  };

  interface TimeSlotOption {
    value: string;
    professionalTime: string;
    clientTime: string;
    professionalTz: string;
    clientTz: string;
  }

  const generate30MinuteIncrements = (): TimeSlotOption[] => {
    if (!selectedDate) return [];

    const selectedProfessionalForSlots = professionals.find(p => p.id === formData.professional_id);
    const professionalTz = normalizeTimezone(selectedProfessionalForSlots?.time_zone);
    const clientTz = normalizeTimezone(timezone);
    const sessionLengthHours = formData.session_length || 1;

    const times: TimeSlotOption[] = buildCandidateTimeValues(availableSlots).map(timeStr => ({
      value: timeStr,
      professionalTime: timeStr,
      clientTime: convertTime(timeStr, professionalTz, clientTz),
      professionalTz: getTimezoneAbbr(professionalTz),
      clientTz: getTimezoneAbbr(clientTz),
    }));

    return times.filter(slot =>
      isSlotBookable(
        selectedDate,
        slot.value,
        professionalTz,
        minimumNoticeHours,
        sessionLengthHours,
        reservedSessionBlocks,
      ),
    );
  };

  const bookableTimeSlots = useMemo(
    () => generate30MinuteIncrements(),
    [
      selectedDate,
      availableSlots,
      reservedSessionBlocks,
      formData.professional_id,
      formData.session_length,
      minimumNoticeHours,
      timezone,
      professionals,
    ],
  );

  useEffect(() => {
    if (preserveStoredTime) return;
    if (!formData.preferred_time || bookableTimeSlots.length === 0) return;
    const normalized = normalizeTimeForSlot(formData.preferred_time);
    const stillValid = bookableTimeSlots.some(
      slot => normalizeTimeForSlot(slot.value) === normalized,
    );
    if (!stillValid) {
      setFormData(prev => ({ ...prev, preferred_time: '', TimeSlotId: undefined }));
    }
  }, [bookableTimeSlots, formData.preferred_time, preserveStoredTime]);

  const sendEmail = async () => {
    const publicKey = 'N3N2A13C5ZdJ3n5DT';
    const serviceId = 'service_fonfcc9';
    const templateId = 'template_q5en6x8';

    if (!serviceId || !templateId || !publicKey) {
      throw new Error('EmailJS is not configured');
    }

    const selectedProfessional = professionals.find(p => p.id === formData.professional_id);
    const selectedSpecialty = specialties.find(s => s.id === formData.specialty_id);

    const preferredDateTime = formData.preferred_time
      ? `${formData.preferred_date} at ${formData.preferred_time}`
      : formData.preferred_date;

    const templateParams = {
      client_name: formData.client_name,
      client_email: formData.client_email,
      client_phone: formData.client_phone || 'Not provided',
      professional_name: selectedProfessional
        ? (language === 'en' ? selectedProfessional.name_en : selectedProfessional.name_es)
        : 'Not selected',
      specialty: selectedSpecialty
        ? (language === 'en' ? selectedSpecialty.name_en : selectedSpecialty.name_es)
        : 'Not specified',
      preferred_date: preferredDateTime,
      issue: formData.issue,
      to_email: import.meta.env.VITE_CONTACT_EMAIL || 'davidebrown@iahatchery.com',
    };

    try {
      console.log('Sending email with params:', templateParams);
      await emailjs.send(serviceId, templateId, templateParams, publicKey);
      console.log('Email sent successfully');
    } catch (error) {
      console.error('Failed to send email:', error);
      throw error;
    }
  };


  const handleAIFillAllFields = async () => {
    if (!formData.issue || formData.issue.trim() === '') return;

    setAiFilling(true);
    setAiError(null);

    // Track local IDs so we can pass context to the professional step without
    // needing to read async React state updates.
    let suggestedSpecialtyId = formData.specialty_id || '';
    let suggestedCTId = formData.counseling_type_id || '';

    // Step 1: Suggest specialty
    setAiFillingStep(language === 'es' ? 'Sugiriendo especialidad…' : 'Suggesting specialty…');
    try {
      const result = await getAIAssistanceForForm(formData.issue, 'category', professionals, language, activeProfession, filteredSpecialties);
      const matchingSpecialty = filteredSpecialties.find(s => {
        const nameEn = s.name_en.toLowerCase();
        const nameEs = s.name_es.toLowerCase();
        const suggestion = result.suggestion.toLowerCase();
        return nameEn.includes(suggestion) || suggestion.includes(nameEn) ||
               nameEs.includes(suggestion) || suggestion.includes(nameEs);
      });
      if (matchingSpecialty) {
        suggestedSpecialtyId = matchingSpecialty.id;
        setFormData(prev => ({ ...prev, specialty_id: matchingSpecialty.id }));
      }
    } catch {
      // continue to next step
    }

    // Step 2: Suggest counseling type
    setAiFillingStep(language === 'es' ? 'Sugiriendo tipo de consejería…' : 'Suggesting counseling type…');
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (apiKey && counselingTypes.length > 0) {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { temperature: 0.2, topP: 0.8, topK: 40, responseMimeType: 'application/json' },
        });
        const typesList = counselingTypes
          .map(ct => language === 'en' ? ct.name_en : ct.name_es)
          .join('\n');
        const prompt = language === 'en'
          ? `You are MarI, an empathetic AI assistant. Based on the client's issue, select the most appropriate counseling type from the list.\n\nClient issue: "${formData.issue}"\n\nAvailable counseling types:\n${typesList}\n\nReturn JSON: {"suggestion": "exact name from list"}`
          : `Eres MarI, un asistente de IA empático. Basándote en el problema del cliente, selecciona el tipo de consejería más apropiado de la lista.\n\nProblema del cliente: "${formData.issue}"\n\nTipos disponibles:\n${typesList}\n\nDevuelve JSON: {"suggestion": "nombre exacto de la lista"}`;
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const { suggestion } = JSON.parse(jsonMatch[0]);
          const matchingCT = counselingTypes.find(ct => {
            const name = (language === 'en' ? ct.name_en : ct.name_es).toLowerCase();
            const s = suggestion.toLowerCase();
            return name.includes(s) || s.includes(name);
          });
          if (matchingCT) {
            suggestedCTId = matchingCT.id;
            setFormData(prev => ({ ...prev, counseling_type_id: matchingCT.id }));
          }
        }
      }
    } catch {
      // continue to next step
    }

    // Step 3: Suggest professional — use locally tracked IDs for context (>5 pros → 3 AI picks; ≤5 → 1)
    setAiFillingStep(language === 'es' ? 'Eligiendo profesional…' : 'Selecting professional…');
    try {
      const pool = filteredProfessionals.length > 0
        ? filteredProfessionals
        : professionals.filter(p => p.is_active !== false);

      const selectedSpecialty = filteredSpecialties.find(s => s.id === suggestedSpecialtyId);
      const selectedCounselingType = counselingTypes.find(ct => ct.id === suggestedCTId);
      const contextParts: string[] = [formData.issue];
      if (selectedSpecialty) contextParts.push(`Specialty: ${language === 'en' ? selectedSpecialty.name_en : selectedSpecialty.name_es}`);
      if (selectedCounselingType) contextParts.push(`Counseling type: ${language === 'en' ? selectedCounselingType.name_en : selectedCounselingType.name_es}`);
      const enrichedIssue = contextParts.join('\n');

      const result = await getAIAssistanceForForm(enrichedIssue, 'therapist', pool, language, activeProfession);
      if (result.suggestions && result.suggestions.length > 0) {
        const ordered = result.suggestions
          .map(id => pool.find(p => p.id === id || p.id.toString() === id))
          .filter((p): p is Professional => Boolean(p));
        if (ordered.length > 0) {
          setAiSuggestedProfessionalIds(ordered.map(p => p.id));
          setFormData(prev => ({ ...prev, professional_id: ordered[0].id }));
        }
      } else {
        const matchingProfessional = pool.find(p =>
          p.id === result.suggestion ||
          p.id.toString() === result.suggestion ||
          (language === 'en' ? p.name_en : p.name_es).toLowerCase().includes(result.suggestion.toLowerCase())
        );
        if (matchingProfessional) {
          setAiSuggestedProfessionalIds([matchingProfessional.id]);
          setFormData(prev => ({ ...prev, professional_id: matchingProfessional.id }));
        }
      }
    } catch {
      // done
    }

    setAiFillingStep('');
    setAiFilling(false);
  };

  const handleAISpecialtySuggestion = async () => {
    if (!formData.issue || formData.issue.trim() === '') {
      setAiError(t('pleaseDescribeIssue') || 'Please describe your issue first');
      return;
    }

    setAiProcessing(true);
    setAiError(null);
    try {
      const result = await getAIAssistanceForForm(formData.issue, 'category', professionals, language, activeProfession, filteredSpecialties);

      const matchingSpecialty = filteredSpecialties.find(s => {
        const nameEn = s.name_en.toLowerCase();
        const nameEs = s.name_es.toLowerCase();
        const suggestion = result.suggestion.toLowerCase();
        return nameEn.includes(suggestion) || suggestion.includes(nameEn) ||
               nameEs.includes(suggestion) || suggestion.includes(nameEs);
      });

      if (matchingSpecialty) {
        setFormData(prev => ({ ...prev, specialty_id: matchingSpecialty.id }));
      } else {
        setAiError(t('noMatchingSpecialty') || `AI suggested: ${result.suggestion}. Please select manually.`);
      }
    } catch (error) {
      console.error('AI error:', error);
      setAiError(t('aiError') || 'Failed to get AI suggestion. Please try again.');
    } finally {
      setAiProcessing(false);
    }
  };

  const getTzOffsetMin = (tzName: string): number => {
    const now = new Date();
    const utcMs = now.getTime();
    const localMs = new Date(now.toLocaleString('en-US', { timeZone: tzName })).getTime();
    return Math.round((localMs - utcMs) / 60000);
  };

  const userTzOffsetMin = getTzOffsetMin(normalizeTimezone(timezone));

  const getTzDiffHours = (tzName: string | undefined): number | null => {
    if (!tzName) return null;
    try {
      const profTzOffsetMin = getTzOffsetMin(tzName);
      const diffMin = Math.abs(profTzOffsetMin - userTzOffsetMin);
      return Math.round(diffMin / 60);
    } catch {
      return null;
    }
  };

  const getAllLanguagesForProfessional = (p: Professional): string[] => {
    const langs: string[] = [];
    if (p.PrimaryLanguage) langs.push(p.PrimaryLanguage.trim());
    if (p.SecondaryLanguages) {
      p.SecondaryLanguages.forEach(l => {
        if (l && !langs.includes(l.trim())) langs.push(l.trim());
      });
    }
    return langs;
  };

  const getCounselingTypeLabel = (typeId: string) => {
    const ct = counselingTypes.find(c => c.id === typeId);
    if (!ct) return typeId;
    return language === 'en' ? ct.name_en : ct.name_es;
  };

  const lbl = (en: string, es: string) => (language === 'es' ? es : en);

  const filteredProfessionals = professionals
    .filter(p => p.is_active !== false)
    .filter(p => {
      if (maxTzDiffHours === null) return true;
      const diff = getTzDiffHours(p.time_zone);
      if (diff === null) return true;
      return diff <= maxTzDiffHours;
    });

  /** Full active roster for the dropdown; filters apply to AI matching and the TZ count, not to manual list browsing. */
  const professionalsForDropdown = useMemo(() => {
    return professionals
      .filter(p => p.is_active !== false)
      .sort((a, b) => {
        const nameA = (language === 'en' ? a.name_en : a.name_es).toLowerCase();
        const nameB = (language === 'en' ? b.name_en : b.name_es).toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [professionals, language]);

  const handleAIProfessionalSuggestion = async () => {
    if (!formData.issue || formData.issue.trim() === '') {
      setAiError(t('pleaseDescribeIssue') || 'Please describe your issue first');
      return;
    }

    setAiProcessing(true);
    setAiError(null);
    setAiSuggestedProfessionalIds([]);
    try {
      const pool = filteredProfessionals.length > 0 ? filteredProfessionals : professionals.filter(p => p.is_active !== false);

      const selectedSpecialty = specialties.find(s => s.id === formData.specialty_id);
      const selectedCounselingType = counselingTypes.find(ct => ct.id === formData.counseling_type_id);
      const selectedProblemNames = selectedProblems.map(id => {
        const p = problems.find(pr => pr.id === id);
        return p ? (language === 'en' ? p.problem_abrev : (p.problem_abrev_es || p.problem_abrev)) : null;
      }).filter(Boolean);

      const contextParts: string[] = [formData.issue];
      if (selectedSpecialty) contextParts.push(`Specialty: ${language === 'en' ? selectedSpecialty.name_en : selectedSpecialty.name_es}`);
      if (selectedCounselingType) contextParts.push(`Counseling type: ${language === 'en' ? selectedCounselingType.name_en : selectedCounselingType.name_es}`);
      if (selectedProblemNames.length > 0) contextParts.push(`Problem categories: ${selectedProblemNames.join(', ')}`);
      if (maxTzDiffHours !== null) contextParts.push(`Only consider professionals within ${maxTzDiffHours}h timezone difference from the client.`);

      const enrichedIssue = contextParts.join('\n');

      const result = await getAIAssistanceForForm(enrichedIssue, 'therapist', pool, language, activeProfession);

      if (result.suggestions && result.suggestions.length > 0) {
        const ordered = result.suggestions
          .map(id => pool.find(p => p.id === id || p.id.toString() === id))
          .filter((p): p is Professional => Boolean(p));
        if (ordered.length > 0) {
          setAiSuggestedProfessionalIds(ordered.map(p => p.id));
          setFormData(prev => ({ ...prev, professional_id: ordered[0].id }));
        } else {
          setAiError(t('noMatchingProfessional') || 'Could not match AI suggestions to professionals. Please select manually.');
        }
      } else {
        const matchingProfessional = pool.find(p =>
          p.id === result.suggestion ||
          p.id.toString() === result.suggestion ||
          (language === 'en' ? p.name_en : p.name_es).toLowerCase().includes(result.suggestion.toLowerCase())
        );

        if (matchingProfessional) {
          setAiSuggestedProfessionalIds([matchingProfessional.id]);
          setFormData(prev => ({ ...prev, professional_id: matchingProfessional.id }));
        } else {
          setAiError(t('noMatchingProfessional') || `AI suggested: ${result.suggestion}. Please select manually.`);
        }
      }
    } catch (error) {
      console.error('AI error:', error);
      setAiError(t('aiError') || 'Failed to get AI suggestion. Please try again.');
    } finally {
      setAiProcessing(false);
    }
  };

  const handleExplainSpecialty = async () => {
    if (!formData.specialty_id) {
      setAiError(t('pleaseSelectSpecialty') || 'Please select a specialty first');
      return;
    }

    const selectedSpecialty = specialties.find(s => s.id === formData.specialty_id);
    if (!selectedSpecialty) return;

    const specialtyName = language === 'en' ? selectedSpecialty.name_en : selectedSpecialty.name_es;
    setShowExplanation(true);
    setLoadingExplanation(true);
    setExplanation('');

    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

      if (!apiKey) {
        throw new Error('Gemini API key not configured');
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
        }
      });

      const prompt = language === 'es'
        ? `Explica en detalle qué es la consejería o terapia de "${specialtyName}". Incluye: 1) Qué problemas o situaciones trata, 2) Qué técnicas o enfoques se utilizan, 3) Quién se beneficia más de este tipo de terapia, 4) Qué esperar en las sesiones. Hazlo informativo y fácil de entender.`
        : `Explain in detail what "${specialtyName}" counseling or therapy is. Include: 1) What problems or situations it addresses, 2) What techniques or approaches are used, 3) Who benefits most from this type of therapy, 4) What to expect in sessions. Make it informative and easy to understand.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      setExplanation(text);
    } catch (error) {
      console.error('Error getting specialty explanation:', error);
      setExplanation(language === 'es'
        ? 'Lo siento, no pude obtener una explicación en este momento.'
        : 'Sorry, I could not get an explanation at this time.');
    } finally {
      setLoadingExplanation(false);
    }
  };

  const loadRequestForEdit = async (req: ClientRequest) => {
    // Prefer a fresh row so calendar/Zoho fields are present for change sync.
    let source = req;
    if (req.id) {
      try {
        const { data: fresh } = await supabase
          .from('client_requests')
          .select('*')
          .eq('id', req.id)
          .maybeSingle();
        if (fresh) source = fresh as ClientRequest;
      } catch (err) {
        console.warn('Could not refresh request for edit:', err);
      }
    }

    // Ensure the client timezone selector + payload match the stored request timezone.
    const reqAny = source as unknown as { professional_id?: string | null; psychologist_id?: string | null };
    const preferredDateRaw: unknown = source.preferred_date as unknown;
    const preferredDate =
      typeof preferredDateRaw === 'string'
        ? (preferredDateRaw.includes('T') ? preferredDateRaw.split('T')[0] : preferredDateRaw)
        : preferredDateRaw instanceof Date
          ? preferredDateRaw.toISOString().split('T')[0]
          : (preferredDateRaw ? String(preferredDateRaw) : '');
    let preferredTime = normalizeTimeForSlot(source.preferred_time);
    const professionalId = reqAny.professional_id ?? reqAny.psychologist_id;

    if (!preferredTime && source.TimeSlotId) {
      try {
        const { data: slot } = await supabase
          .from('available_slots')
          .select('start_time, end_time')
          .eq('id', source.TimeSlotId)
          .maybeSingle();
        if (slot?.start_time) {
          preferredTime = normalizeTimeForSlot(slot.start_time);
        }
      } catch (err) {
        console.error('Error loading stored time slot:', err);
      }
    }

    const selectedProf = professionals.find(p => p.id === professionalId);
    const profTz = normalizeTimezone(selectedProf?.time_zone);
    const clientTz = normalizeTimezone(source.time_zone);

    if (preferredTime) {
      setStoredTimeSlot({
        professionalTime: preferredTime,
        clientTime: sharedConvertTime(preferredTime, profTz, clientTz, preferredDate || undefined),
        profTz: getTimezoneAbbr(profTz),
        clientTz: getTimezoneAbbr(clientTz),
      });
      setPreserveStoredTime(true);
    } else {
      setStoredTimeSlot(null);
      setPreserveStoredTime(false);
    }

    // `selectedDate` drives the date input + the time-slot picker UI.
    setSelectedDate(preferredDate);
    setTimezone(clientTz);
    setFormData(prev => ({
      ...prev,
      user_id: source.user_id ?? prev.user_id,
      username: source.username || prev.username,
      full_name: source.full_name || prev.full_name,
      client_name: source.client_name || prev.client_name,
      client_email: source.client_email || prev.client_email,
      client_phone: source.client_phone || prev.client_phone,
      issue: source.issue || prev.issue,
      preferred_date: preferredDate || prev.preferred_date,
      preferred_time: preferredTime || prev.preferred_time,
      time_zone: source.time_zone ?? prev.time_zone,
      session_length: source.session_length ?? prev.session_length,
      professional_id: professionalId || prev.professional_id,
      specialty_id: source.specialty_id || prev.specialty_id,
      counseling_type_id: source.counseling_type_id || prev.counseling_type_id,
      session_price_id: source.session_price_id ?? prev.session_price_id,
      price_amount: source.price_amount || prev.price_amount,
      price_currency: source.price_currency || prev.price_currency,
      num_sessions: source.num_sessions ?? prev.num_sessions,
      session_no: source.session_no ?? prev.session_no,
      TimeSlotId: source.TimeSlotId || prev.TimeSlotId,
      statusvalue: source.statusvalue ?? source.session_status ?? prev.statusvalue,
      session_status: source.statusvalue ?? source.session_status ?? prev.session_status,
    }));
    setSessionStatus(getClientRequestStatusValue(source));
    setIsEditingExistingRequest(true);
    setEditingRequestId(source.id);
    setEditingOriginalRequest(source);
    setChangeSaveMessage(null);
    setSubmitSuccess(false);
    setSubmitError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Prefill from Display My Appointments / View My Sessions → Change Session
  useEffect(() => {
    const requestId = changeSessionRequestId || pendingChangeRequestIdRef.current;
    if (!requestId) return;

    let cancelled = false;
    const run = async () => {
      setLoadingChangeSession(true);
      try {
        try {
          sessionStorage.removeItem(CHANGE_SESSION_PREFILL_KEY);
        } catch {
          // ignore
        }
        pendingChangeRequestIdRef.current = requestId;

        const { data, error } = await supabase
          .from('client_requests')
          .select('*')
          .eq('id', requestId)
          .maybeSingle();
        if (error || !data || cancelled) {
          if (!cancelled) {
            setSubmitError(
              language === 'es'
                ? 'No se pudo cargar la sesión para editar.'
                : 'Could not load the session to edit.',
            );
          }
          return;
        }
        await loadRequestForEdit(data as ClientRequest);
        setLatestRequestLoaded(true);
        pendingChangeRequestIdRef.current = null;
        onChangeSessionConsumed?.();
      } catch (err) {
        console.error('Error loading change-session prefill:', err);
        if (!cancelled) {
          setSubmitError(
            language === 'es'
              ? 'Error al cargar la sesión para editar.'
              : 'Error loading the session to edit.',
          );
        }
      } finally {
        if (!cancelled) setLoadingChangeSession(false);
      }
    };
    void run();
    return () => { cancelled = true; };
    // Re-run when App passes a new changeSessionRequestId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeSessionRequestId]);

  const generateDescriptionPrompt = (
    itemType: 'specialty' | 'problem' | 'counselingType' | 'professional',
    name: string,
    lang: 'en' | 'es',
    extra?: string,
  ): string => {
    if (itemType === 'specialty') {
      return lang === 'es'
        ? `Eres MarI, un asistente de IA empático. Explica en detalle qué es la especialidad de terapia o consejería "${name}". Incluye: 1) Qué problemas o situaciones aborda, 2) Qué técnicas o enfoques se utilizan, 3) Quién se beneficia más, 4) Qué esperar en las sesiones. Hazlo informativo y fácil de entender para alguien que busca ayuda.`
        : `You are MarI, an empathetic AI assistant. Explain in detail what the "${name}" therapy or counseling specialty is. Include: 1) What problems or situations it addresses, 2) What techniques or approaches are used, 3) Who benefits most, 4) What to expect in sessions. Make it informative and easy to understand for someone seeking help.`;
    } else if (itemType === 'problem') {
      return lang === 'es'
        ? `Eres MarI, un asistente de IA empático. Explica en detalle qué es "${name}" como categoría de problema en salud mental. Incluye: 1) Qué es y cómo se manifiesta, 2) Factores comunes que lo causan o contribuyen, 3) Cómo la terapia puede ayudar, 4) Señales de que se puede necesitar apoyo profesional. Hazlo comprensivo y sin estigma.`
        : `You are MarI, an empathetic AI assistant. Explain in detail what "${name}" is as a mental health problem category. Include: 1) What it is and how it manifests, 2) Common causes or contributing factors, 3) How therapy can help, 4) Signs that professional support may be needed. Make it informative and stigma-free.`;
    } else if (itemType === 'professional') {
      const existingBio = extra || '';
      return lang === 'es'
        ? `Eres MarI, un asistente de IA empático. Escribe una biografía profesional detallada y cálida para el profesional/terapeuta "${name}".${existingBio ? ` Información existente: ${existingBio}` : ''} Incluye: 1) Enfoque terapéutico y especialidades, 2) Filosofía de trabajo y valores, 3) Cómo ayuda a sus clientes, 4) Por qué elegirle. Hazlo auténtico, empático y profesional (3-4 párrafos).`
        : `You are MarI, an empathetic AI assistant. Write a detailed, warm professional biography for therapist/professional "${name}".${existingBio ? ` Existing information: ${existingBio}` : ''} Include: 1) Therapeutic approach and specialties, 2) Working philosophy and values, 3) How they help clients, 4) Why choose them. Make it authentic, empathetic and professional (3-4 paragraphs).`;
    } else {
      return lang === 'es'
        ? `Eres MarI, un asistente de IA empático. Explica en detalle qué es el "${name}" como tipo de consejería o terapia. Incluye: 1) En qué consiste este formato de terapia, 2) Para quién es adecuado, 3) Qué esperar en las sesiones, 4) Beneficios de este tipo de consejería. Hazlo claro y accesible.`
        : `You are MarI, an empathetic AI assistant. Explain in detail what "${name}" is as a counseling or therapy type. Include: 1) What this therapy format involves, 2) Who it is suitable for, 3) What to expect in sessions, 4) Benefits of this counseling type. Make it clear and accessible.`;
    }
  };

  const saveDescriptionToDb = async (
    itemType: 'specialty' | 'problem' | 'counselingType' | 'professional',
    itemId: string,
    textEn: string,
    textEs: string,
  ) => {
    if (itemType === 'specialty') {
      const { error } = await supabase.from('specialties').update({ description_en: textEn, description_es: textEs }).eq('id', itemId);
      if (error) throw error;
    } else if (itemType === 'problem') {
      const { error } = await supabase.from('problems').update({ problem_desc: textEn, problem_desc_es: textEs }).eq('id', Number(itemId));
      if (error) throw error;
    } else if (itemType === 'counselingType') {
      const { error } = await supabase.from('counseling_types').update({ description_en: textEn, description_es: textEs }).eq('id', itemId);
      if (error) throw error;
    } else if (itemType === 'professional') {
      const { error } = await supabase.from('professionals').update({ bio_en: textEn, bio_es: textEs }).eq('id', itemId);
      if (error) throw error;
    }
  };

  const generateBothDescriptions = async (
    itemType: 'specialty' | 'problem' | 'counselingType' | 'professional',
    name: string,
    itemId: string,
    extra?: string,
  ) => {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error('Gemini API key not configured');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.7, topP: 0.95, topK: 40 },
    });

    const promptEn = generateDescriptionPrompt(itemType, name, 'en', extra);
    const promptEs = generateDescriptionPrompt(itemType, name, 'es', extra);

    const [resultEn, resultEs] = await Promise.all([
      model.generateContent(promptEn),
      model.generateContent(promptEs),
    ]);

    const textEn = resultEn.response.text();
    const textEs = resultEs.response.text();

    await saveDescriptionToDb(itemType, itemId, textEn, textEs);

    return { textEn, textEs };
  };

  const handleRightClickInfo = async (
    itemType: 'specialty' | 'problem' | 'counselingType' | 'professional',
    name: string,
    description: string,
    itemId: string = '',
  ) => {
    const title = name;

    if (description && description.trim().length > 0) {
      setRightClickModal({ title, content: description.trim(), loading: false, itemType, itemId, isAiGenerated: false });
      return;
    }

    setRightClickModal({ title, content: '', loading: true, itemType, itemId, isAiGenerated: false });

    try {
      const { textEn, textEs } = await generateBothDescriptions(itemType, name, itemId);
      const displayText = language === 'en' ? textEn : textEs;
      setRightClickModal({ title, content: displayText, loading: false, itemType, itemId, isAiGenerated: true });

      if (itemType === 'specialty') {
        setSpecialtyDescOverrides(prev => ({ ...prev, [itemId]: { en: textEn, es: textEs } }));
      } else if (itemType === 'problem') {
        setProblems(prev => prev.map(p => p.id === Number(itemId) ? { ...p, problem_desc: textEn, problem_desc_es: textEs } : p));
      } else if (itemType === 'counselingType') {
        setCounselingTypes(prev => prev.map(ct => ct.id === itemId ? { ...ct, description_en: textEn, description_es: textEs } : ct));
      } else if (itemType === 'professional') {
        setProfessionalBioOverrides(prev => ({ ...prev, [itemId]: { en: textEn, es: textEs } }));
      }
    } catch {
      const errorMsg = language === 'es'
        ? 'Lo siento, no pude obtener información en este momento.'
        : 'Sorry, could not retrieve information at this time.';
      setRightClickModal({ title, content: errorMsg, loading: false, itemType, itemId, isAiGenerated: false });
    }
  };

  const handleRefreshAndGenerate = async () => {
    if (!rightClickModal || !rightClickModal.itemId) return;
    const { itemType, itemId, title } = rightClickModal;

    setRightClickModal(prev => prev ? { ...prev, loading: true } : prev);

    try {
      const professional = itemType === 'professional' ? professionals.find(p => p.id === itemId) : null;
      const existingBio = professional ? (language === 'en' ? professional.bio_en : professional.bio_es) || '' : undefined;
      const { textEn, textEs } = await generateBothDescriptions(itemType, title, itemId, existingBio);

      const displayText = language === 'en' ? textEn : textEs;

      if (itemType === 'specialty') {
        setSpecialtyDescOverrides(prev => ({ ...prev, [itemId]: { en: textEn, es: textEs } }));
      } else if (itemType === 'problem') {
        setProblems(prev => prev.map(p => p.id === Number(itemId) ? { ...p, problem_desc: textEn, problem_desc_es: textEs } : p));
      } else if (itemType === 'counselingType') {
        setCounselingTypes(prev => prev.map(ct => ct.id === itemId ? { ...ct, description_en: textEn, description_es: textEs } : ct));
      } else if (itemType === 'professional') {
        setProfessionalBioOverrides(prev => ({ ...prev, [itemId]: { en: textEn, es: textEs } }));
      }

      setRightClickModal({
        title,
        content: displayText.trim() || (language === 'es' ? 'No hay descripción disponible' : 'No description available'),
        loading: false,
        itemType,
        itemId,
        isAiGenerated: true,
      });
    } catch (error) {
      console.error('Error refreshing descriptions:', error);
      const errorMsg = language === 'es'
        ? 'Error al generar las descripciones'
        : 'Error generating descriptions';
      setRightClickModal(prev => prev ? { ...prev, content: errorMsg, loading: false } : prev);
    }
  };

  const handleAIImproveDescription = async () => {
    if (!formData.issue || formData.issue.trim() === '') {
      setAiError(t('pleaseDescribeIssue') || 'Please describe your issue first');
      return;
    }

    setAiProcessing(true);
    setAiError(null);
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

      if (!apiKey) {
        throw new Error('Gemini API key is not configured');
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
        }
      });

      const professionName = activeProfession
        ? (language === 'en' ? activeProfession.name_en : activeProfession.name_es)
        : (language === 'en' ? 'mental health' : 'salud mental');
      const professionDescription = activeProfession
        ? (language === 'en' ? activeProfession.description_en : activeProfession.description_es)
        : '';

      const prompt = language === 'en'
        ? `You are a helpful assistant that improves client issue descriptions to make them clearer and more professional for matching with ${professionName} professionals.${professionDescription ? `\n\nProfession context: ${professionDescription}` : ''}

Original description: "${formData.issue}"

Please rewrite this description to be:
1. Clear and concise
2. Professional but empathetic in tone
3. Focused on the core issues relevant to the ${professionName} domain
4. Easy for ${professionName} professionals to understand
5. Keep it between 2-4 sentences

Return ONLY the improved description text, nothing else. Do not include quotes or JSON formatting.`
        : `Eres un asistente útil que mejora las descripciones de problemas de clientes para hacerlas más claras y profesionales para la búsqueda de profesionales de ${professionName}.${professionDescription ? `\n\nContexto de la profesión: ${professionDescription}` : ''}

Descripción original: "${formData.issue}"

Por favor reescribe esta descripción para que sea:
1. Clara y concisa
2. Profesional pero con tono empático
3. Enfocada en los problemas principales relevantes al dominio de ${professionName}
4. Fácil de entender para profesionales de ${professionName}
5. Mantenerla entre 2-4 oraciones

Devuelve SOLO el texto de la descripción mejorada, nada más. No incluyas comillas ni formato JSON.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const improvedText = response.text().trim();

      if (improvedText) {
        setFormData(prev => ({ ...prev, issue: improvedText }));
      }
    } catch (error) {
      console.error('AI error:', error);
      setAiError(t('aiError') || 'Failed to improve description. Please try again.');
    } finally {
      setAiProcessing(false);
    }
  };

  const handleGenerateQuestionnaire = async () => {
    if (!formData.issue || formData.issue.trim() === '') {
      setAiError(t('pleaseDescribeIssue') || 'Please describe your issue first');
      return;
    }

    setShowQuestionnaire(true);
    setLoadingQuestionnaire(true);
    setQuestionnaire([]);
    setQuestionnaireResponses({});
    setQuestionnaireSourceName('');
    setAiError('');

    try {
      const catalog = await loadActiveCatalogSummaries();
      if (catalog.length === 0) {
        setShowQuestionnaire(false);
        setAiError(
          language === 'es'
            ? 'No hay cuestionarios estándar en el catálogo. Un administrador debe sincronizar storage o agregar cuestionarios con la búsqueda IA.'
            : 'No standard questionnaires are in the catalog. An administrator should sync storage or add questionnaires with AI search.',
        );
        return;
      }

      const lang = language === 'es' ? 'es' : 'en';
      const { recommendedIds } = await recommendCatalogQuestionnaires(formData.issue, catalog, language);
      setRecommendedStdIds(recommendedIds);

      const candidates = [...recommendedIds, ...catalog.map(item => item.id)]
        .filter((id, index, all) => all.indexOf(id) === index);

      for (const id of candidates) {
        const { data: row } = await supabase
          .from('std_questionnaires')
          .select('id, name, storage_location')
          .eq('id', id)
          .maybeSingle();
        const stored = await loadStoredQuestionsForLanguage(
          id,
          lang,
          (row?.storage_location as { en?: string; es?: string } | null) ?? null,
        );
        const fromDefinition = findHardcodedDefinition(id, row?.name ?? undefined);
        const fallback = fromDefinition ? definitionToStoredJson(fromDefinition, lang) : null;
        const source = stored?.questions?.length ? stored : fallback;
        const questions = (source?.questions ?? [])
          .filter((q): q is { question: string; options: string[] } =>
            typeof q.question === 'string' && Array.isArray(q.options) && q.options.length > 0);
        if (questions.length === 0) continue;

        setQuestionnaireSourceName(stored?.name || row?.name || id);
        setQuestionnaire(questions);
        return;
      }

      setShowQuestionnaire(false);
      setAiError(
        language === 'es'
          ? 'Se encontraron cuestionarios en el catálogo, pero aún no tienen preguntas en storage. Sincronícelos o genérelos desde el panel de administración.'
          : 'Catalog questionnaires were found, but they do not have questions in storage yet. Sync or generate them from the admin panel.',
      );
    } catch (error) {
      console.error('Error loading stored questionnaire:', error);
      setQuestionnaire([{
        question: language === 'es'
          ? 'No se pudo cargar un cuestionario estándar almacenado. Intente de nuevo o use la lista de cuestionarios estándar.'
          : 'Could not load a stored standard questionnaire. Try again or use the standard questionnaire list.',
        options: [],
      }]);
    } finally {
      setLoadingQuestionnaire(false);
    }
  };

  const handleShowStandardQuestionnaires = async () => {
    if (!formData.issue || formData.issue.trim() === '') {
      setAiError(t('pleaseDescribeIssue') || 'Please describe your issue first');
      return;
    }

    setShowStandardQuestionnaires(true);
    setLoadingStandardContext(true);
    setStandardQuestionnaireContext('');
    setAiError('');

    try {
      const catalog = await loadAllCatalogSummaries();
      if (catalog.length === 0) {
        setRecommendedStdIds([]);
        setStandardQuestionnaireContext(
          language === 'es'
            ? 'Aún no hay cuestionarios estándar en el catálogo. Un administrador puede sincronizar el storage o agregar instrumentos con la búsqueda IA para que aparezcan aquí la próxima vez.'
            : 'There are no standard questionnaires in the catalog yet. An administrator can sync storage or add instruments with AI search so they appear here next time.',
        );
        return;
      }

      const { recommendedIds, context } = await recommendCatalogQuestionnaires(formData.issue, catalog, language);
      setRecommendedStdIds(recommendedIds);
      setStandardQuestionnaireContext(
        context
        || (language === 'es'
          ? 'Estos cuestionarios estándar almacenados pueden ayudar a su profesional a comprender mejor su situación.'
          : 'These stored standard questionnaires can help your professional better understand your situation.'),
      );
    } catch (error) {
      console.error('Error generating standard questionnaire context:', error);
      setStandardQuestionnaireContext(
        language === 'es'
          ? 'Los cuestionarios estándar almacenados en el catálogo pueden ayudar a su terapeuta a comprender mejor su situación.'
          : 'The stored standard questionnaires in the catalog can help your therapist better understand your situation.',
      );
    } finally {
      setLoadingStandardContext(false);
    }
  };

  const handleExplainTreatment = async () => {
    if (!formData.professional_id) {
      setAiError(t('pleaseSelectProfessional') || 'Please select a professional first');
      return;
    }

    if (!formData.issue || formData.issue.trim() === '') {
      setAiError(t('pleaseDescribeIssue') || 'Please describe your issue first');
      return;
    }

    if (!formData.specialty_id) {
      setAiError(t('pleaseSelectSpecialty') || 'Please select a specialty first');
      return;
    }

    const selectedProfessional = professionals.find(p => p.id === formData.professional_id);
    const selectedSpecialty = specialties.find(s => s.id === formData.specialty_id);

    if (!selectedProfessional || !selectedSpecialty) return;

    const professionalName = language === 'en' ? selectedProfessional.name_en : selectedProfessional.name_es;
    const specialtyName = language === 'en' ? selectedSpecialty.name_en : selectedSpecialty.name_es;
    const professionalBio = language === 'en' ? selectedProfessional.bio_en : selectedProfessional.bio_es;

    setShowTreatmentExplanation(true);
    setLoadingTreatmentExplanation(true);
    setTreatmentExplanation('');

    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

      if (!apiKey) {
        throw new Error('Gemini API key not configured');
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
        }
      });

      const prompt = language === 'es'
        ? `Eres un asistente experto en salud mental. Un cliente ha descrito su problema y ha seleccionado un profesional. Explica de manera detallada y empática cómo este profesional tratará el problema del cliente.

Información del Profesional:
- Nombre: ${professionalName}
- Especialidad: ${specialtyName}
- Biografía: ${professionalBio}

Problema del Cliente:
"${formData.issue}"

Por favor, proporciona una explicación detallada (4-6 párrafos) que incluya:

1. Una introducción empática reconociendo la valentía del cliente al buscar ayuda
2. Cómo la especialidad de "${specialtyName}" es específicamente relevante para el problema descrito
3. El enfoque y las técnicas terapéuticas que ${professionalName} probablemente utilizará basándose en su especialidad y experiencia
4. Qué puede esperar el cliente durante las primeras sesiones y a lo largo del tratamiento
5. Los posibles resultados positivos y beneficios del tratamiento con este enfoque
6. Un mensaje de ánimo sobre el proceso terapéutico

Hazlo informativo, profesional, empático y fácil de entender. Usa un tono cálido y esperanzador.`
        : `You are an expert mental health assistant. A client has described their issue and selected a professional. Explain in detail and with empathy how this professional will treat the client's problem.

Professional Information:
- Name: ${professionalName}
- Specialty: ${specialtyName}
- Biography: ${professionalBio}

Client's Issue:
"${formData.issue}"

Please provide a detailed explanation (4-6 paragraphs) that includes:

1. An empathetic introduction acknowledging the client's courage in seeking help
2. How the specialty of "${specialtyName}" is specifically relevant to the described problem
3. The therapeutic approach and techniques that ${professionalName} will likely use based on their specialty and experience
4. What the client can expect during the first sessions and throughout treatment
5. Possible positive outcomes and benefits of treatment with this approach
6. An encouraging message about the therapeutic process

Make it informative, professional, empathetic, and easy to understand. Use a warm and hopeful tone.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      setTreatmentExplanation(text);
    } catch (error) {
      console.error('Error getting treatment explanation:', error);
      setTreatmentExplanation(language === 'es'
        ? 'Lo siento, no pude obtener una explicación en este momento.'
        : 'Sorry, I could not get an explanation at this time.');
    } finally {
      setLoadingTreatmentExplanation(false);
    }
  };

  const handleSaveTreatmentPlan = async () => {
    if (!treatmentExplanation || treatmentPlanSaved) return;

    setSavingTreatmentPlan(true);
    try {
      const selectedProfessional = professionals.find(p => p.id === formData.professional_id);
      const selectedSpecialty = specialties.find(s => s.id === formData.specialty_id);

      const { data: { user: authUser } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('questionnaire_results')
        .insert({
          user_id: authUser?.id || null,
          professional_id: formData.professional_id || null,
          content_type: 'treatment_plan',
          original_text: formData.issue,
          generated_text: treatmentExplanation,
          language: language,
          metadata: {
            professional_name: selectedProfessional ? (language === 'en' ? selectedProfessional.name_en : selectedProfessional.name_es) : null,
            specialty_id: formData.specialty_id,
            specialty_name: selectedSpecialty ? (language === 'en' ? selectedSpecialty.name_en : selectedSpecialty.name_es) : null,
            client_email: formData.client_email,
            client_name: formData.client_name,
            app_user_id: currentUser?.id || null,
          }
        });

      if (error) {
        console.error('Error saving treatment plan:', error);
        setAiError(language === 'es' ? 'Error al guardar el plan de tratamiento' : 'Error saving treatment plan');
      } else {
        setTreatmentPlanSaved(true);
      }
    } catch (error) {
      console.error('Error saving treatment plan:', error);
      setAiError(language === 'es' ? 'Error al guardar el plan de tratamiento' : 'Error saving treatment plan');
    } finally {
      setSavingTreatmentPlan(false);
    }
  };

  const handleSaveQuestionnaire = async () => {
    if (questionnaire.length === 0 || questionnaireSaved) return;

    const allQuestionsAnswered = questionnaire.every((_, index) => questionnaireResponses[index] !== undefined);

    if (!allQuestionsAnswered) {
      alert(language === 'es'
        ? 'Por favor responda todas las preguntas antes de guardar el cuestionario.'
        : 'Please answer all questions before saving the questionnaire.');
      return;
    }

    setSavingQuestionnaire(true);
    try {
      const selectedProfessional = professionals.find(p => p.id === formData.professional_id);
      const selectedSpecialty = specialties.find(s => s.id === formData.specialty_id);

      const { data: { user: authUser } } = await supabase.auth.getUser();

      const questionnaireText = questionnaire.map((item, index) => {
        const optionsText = item.options.map((opt, optIdx) =>
          `${String.fromCharCode(65 + optIdx)}) ${opt}${questionnaireResponses[index] === optIdx ? ' [SELECTED]' : ''}`
        ).join('\n');
        const selectedOption = questionnaireResponses[index] !== undefined ? item.options[questionnaireResponses[index]] : 'N/A';
        return `${index + 1}. ${item.question}\n${optionsText}\n${language === 'es' ? 'Respuesta' : 'Answer'}: ${selectedOption}`;
      }).join('\n\n');

      const { error } = await supabase
        .from('questionnaire_results')
        .insert({
          user_id: authUser?.id || null,
          professional_id: formData.professional_id || null,
          content_type: 'questionnaire',
          original_text: formData.issue,
          generated_text: questionnaireText,
          language: language,
          metadata: {
            professional_name: selectedProfessional ? (language === 'en' ? selectedProfessional.name_en : selectedProfessional.name_es) : null,
            specialty_id: formData.specialty_id,
            specialty_name: selectedSpecialty ? (language === 'en' ? selectedSpecialty.name_en : selectedSpecialty.name_es) : null,
            client_email: formData.client_email,
            client_name: formData.client_name,
            app_user_id: currentUser?.id || null,
            question_count: questionnaire.length,
            responses: questionnaire.reduce((acc, item, index) => {
              const selectedOptionIndex = questionnaireResponses[index];
              if (selectedOptionIndex !== undefined) {
                acc[index] = {
                  option_index: selectedOptionIndex,
                  selected_option: item.options[selectedOptionIndex] ?? null,
                  question: item.question,
                };
              }
              return acc;
            }, {} as Record<number, { option_index: number; selected_option: string | null; question: string }>),
          }
        });

      if (error) {
        console.error('Error saving questionnaire:', error);
        setAiError(language === 'es' ? 'Error al guardar el cuestionario' : 'Error saving questionnaire');
      } else {
        setQuestionnaireSaved(true);
      }
    } catch (error) {
      console.error('Error saving questionnaire:', error);
      setAiError(language === 'es' ? 'Error al guardar el cuestionario' : 'Error saving questionnaire');
    } finally {
      setSavingQuestionnaire(false);
    }
  };

  return (
    <div className="client-request-page">
    <section
      className="section section--client-request"
      style={{ background: '#BDD5AC', boxShadow: 'none' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h2>
            {(() => {
              const full =
                (currentUser?.full_name || formData.client_name || formData.full_name || '').trim();
              const firstName = full.split(/\s+/)[0] || '';
              return firstName
                ? `${t('welcomeUser') || (language === 'es' ? 'Bienvenido/a' : 'Welcome')}, ${firstName}`
                : (t('welcomeUser') || (language === 'es' ? 'Bienvenido/a' : 'Welcome'));
            })()}
          </h2>
          <p className="section-subtitle">{t('clientInfoDescription')}</p>
        </div>
        <div className="manage-sessions-buttons">
          <button
            type="button"
            className="manage-sessions-button"
            onClick={() => setShowExistingSessions(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
            </svg>
            {language === 'es' ? 'Ver Mis Sesiones' : 'View My Sessions'}
          </button>
        </div>
      </div>


      {loadingChangeSession && (
        <div className="submit-feedback" style={{ background: '#eef2ff', border: '1px solid #c7d2fe', color: '#3730a3' }}>
          <span>{language === 'es' ? 'Cargando sesión para editar…' : 'Loading session to edit…'}</span>
        </div>
      )}

      {isEditingExistingRequest && editingOriginalRequest && (
        <div className="submit-feedback" style={{ background: '#e8eaf6', border: '1px solid #9fa8da', color: '#1a237e', flexDirection: 'column', alignItems: 'flex-start', gap: '0.35rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
            <span>{language === 'es' ? 'Cambiando esta sesión' : 'Changing this session'}</span>
          </div>
          <div style={{ fontSize: '0.9rem', lineHeight: 1.45 }}>
            <div>
              <strong>{language === 'es' ? 'Fecha:' : 'Date:'}</strong>{' '}
              {formData.preferred_date || '—'}
              {formData.preferred_time ? ` · ${formData.preferred_time}` : ''}
            </div>
            <div>
              <strong>{language === 'es' ? 'Profesional:' : 'Professional:'}</strong>{' '}
              {(() => {
                const p = professionals.find(x => x.id === formData.professional_id);
                return p
                  ? (language === 'es' ? (p.name_es || p.name_en) : (p.name_en || p.name_es))
                  : (formData.professional_id || '—');
              })()}
            </div>
            <div>
              <strong>{language === 'es' ? 'Cliente:' : 'Client:'}</strong>{' '}
              {formData.client_name || formData.full_name || '—'}
              {formData.client_email ? ` · ${formData.client_email}` : ''}
            </div>
          </div>
          <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>
            {language === 'es'
              ? 'Los campos del formulario abajo muestran esta sesión. Modifique lo que necesite y pulse Guardar Cambios.'
              : 'The form fields below show this session. Change what you need and press Save Changes.'}
          </span>
        </div>
      )}

      {submitSuccess && (
        <div className="submit-feedback submit-feedback--success">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          <span>
            {changeSaveMessage
              || (language === 'es'
                ? 'Solicitud enviada correctamente. Puede enviar otra o cerrar este formulario.'
                : 'Request submitted successfully. You may submit another or close this form.')}
          </span>
        </div>
      )}

      {submitError && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            padding: '2rem',
            maxWidth: '480px',
            width: '90%',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="#c0392b" style={{ flexShrink: 0 }}>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              <h3 style={{ margin: 0, color: '#c0392b', fontSize: '1.2rem' }}>
                {language === 'es' ? 'Error al Enviar Solicitud' : 'Submission Error'}
              </h3>
            </div>
            <p style={{ margin: '0 0 1.5rem 0', color: '#444', lineHeight: '1.6', wordBreak: 'break-word' }}>
              {submitError}
            </p>
            <p style={{ margin: '0 0 1.5rem 0', color: '#666', fontSize: '0.9rem' }}>
              {language === 'es'
                ? 'Sus datos se han conservado. Corrija el problema y vuelva a intentarlo.'
                : 'Your data has been preserved. Please correct the issue and try again.'}
            </p>
            <button
              type="button"
              onClick={() => setSubmitError(null)}
              style={{
                display: 'block',
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#c0392b',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {language === 'es' ? 'Cerrar y Corregir' : 'Close & Correct'}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="client-request-form">
        {(currentUser || formData.user_id) && (
          <div style={{
            backgroundColor: '#e8f5e9',
            border: '2px solid #4caf50',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="#4caf50" style={{ marginRight: '0.5rem' }}>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              <strong style={{ fontSize: '1.1rem', color: '#2e7d32' }}>
                {language === 'es' ? 'Usuario Autenticado' : 'Signed In User'}
              </strong>
            </div>
            <div style={{ marginLeft: '2rem' }}>
              <p style={{ margin: '0.25rem 0', color: '#1b5e20' }}>
                <strong>{language === 'es' ? 'ID de Usuario:' : 'User ID:'}</strong>{' '}
                {formData.user_id || currentUser?.id}
              </p>
              <p style={{ margin: '0.25rem 0', color: '#1b5e20' }}>
                <strong>{language === 'es' ? 'Nombre Completo:' : 'Full Name:'}</strong>{' '}
                {formData.client_name || currentUser?.full_name}
              </p>
              <p style={{ margin: '0.25rem 0', color: '#1b5e20' }}>
                <strong>{language === 'es' ? 'Correo Electrónico:' : 'Email:'}</strong>{' '}
                {formData.client_email || currentUser?.email}
              </p>
              <p style={{ margin: '0.25rem 0', color: '#1b5e20' }}>
                <strong>{language === 'es' ? 'Teléfono:' : 'Phone:'}</strong>{' '}
                {formData.client_phone || currentUser?.phone || '—'}
              </p>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#558b2f', marginTop: '0.75rem', marginBottom: 0, fontStyle: 'italic' }}>
              {language === 'es'
                ? 'Esta información se guardará automáticamente con su solicitud y sesión.'
                : 'This information will be automatically saved with your request and session.'}
            </p>
          </div>
        )}

        {!currentUser && (
          <div style={{
            backgroundColor: '#fff3e0',
            border: '2px solid #ff9800',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ color: '#ff9800', marginRight: '0.5rem', fontSize: '1.2rem' }}>&#9888;</span>
              <span style={{ color: '#e65100', fontWeight: '500' }}>
                {language === 'es' ? 'No autenticado - por favor inicie sesión primero' : 'Not authenticated - please sign in first'}
              </span>
            </div>
          </div>
        )}

        {/* ── History pre-fill notice ── */}
        {prefilledFromHistory && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#e8f4fd',
            border: '1px solid #90caf9',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            gap: '0.75rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#1565c0">
                <path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
              </svg>
              <span style={{ fontSize: '0.875rem', color: '#1565c0', fontWeight: 500 }}>
                {language === 'es'
                  ? 'Formulario pre-completado con su última solicitud. Revise o modifique los campos según necesite.'
                  : 'Form pre-filled from your last request. Review or update the fields as needed.'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setPrefilledFromHistory(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1565c0', padding: '0.25rem', flexShrink: 0, fontSize: '1.1rem', lineHeight: 1 }}
              aria-label="Dismiss"
            >&#10005;</button>
          </div>
        )}

        {/* Session status reference + current value */}
        <div className="session-status-panel">
          <div className="session-status-panel__header">
            {language === 'es' ? 'Estado de la Sesión' : 'Session Status'}
          </div>
          <div className="session-status-panel__current">
            <span className="session-status-panel__current-code">{sessionStatus}</span>
            <span className="session-status-panel__current-label">
              {getSessionStatusLabel(sessionStatus, language)}
            </span>
          </div>
          <ul className="session-status-panel__legend" aria-label={language === 'es' ? 'Valores de estado' : 'Status values'}>
            {getSessionStatusOptions(language).map(({ code, label }) => (
              <li
                key={code}
                className={`session-status-panel__item${code === sessionStatus ? ' session-status-panel__item--active' : ''}`}
              >
                <span className="session-status-panel__item-code">{code}</span>
                <span className="session-status-panel__item-label">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── MarI AI Fill-All button ── */}
        <div style={{
          backgroundColor: formData.issue.trim() ? 'linear-gradient(135deg,#1a237e,#283593)' : undefined,
          background: formData.issue.trim()
            ? 'linear-gradient(135deg, #1a237e 0%, #283593 100%)'
            : '#f5f5f5',
          border: `2px solid ${formData.issue.trim() ? '#3f51b5' : '#e0e0e0'}`,
          borderRadius: '12px',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          transition: 'all 0.25s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                backgroundColor: formData.issue.trim() ? 'rgba(255,255,255,0.15)' : '#e0e0e0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span style={{ color: formData.issue.trim() ? '#fff' : '#9e9e9e', display: 'inline-flex' }}>
                  <CompanyAiIcon size={28} />
                </span>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: formData.issue.trim() ? '#fff' : '#9e9e9e' }}>
                  {t('aiFillAllTitle') || (language === 'es' ? 'La IA dice: Déjame ayudarte' : 'AI says: Let me help you')}
                </div>
                <div style={{ fontSize: '0.8rem', color: formData.issue.trim() ? 'rgba(255,255,255,0.75)' : '#bdbdbd', marginTop: '0.1rem' }}>
                  {aiFilling
                    ? aiFillingStep
                    : formData.issue.trim()
                      ? (t('aiFillAllReady') || (language === 'es'
                          ? 'Listo. Haz clic y te sugeriré especialidad, tipo de consejería y profesional.'
                          : 'Ready. Click and I will suggest specialty, counseling type, and professional.'))
                      : (t('aiFillAllNeedIssue') || (language === 'es'
                          ? 'Primero describe qué quieres tratar abajo, y luego podré ayudarte.'
                          : 'First describe what you want to discuss below, then I can help.'))}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleAIFillAllFields}
              disabled={!formData.issue.trim() || aiFilling}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.65rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: formData.issue.trim() && !aiFilling ? '#fff' : '#e0e0e0',
                color: formData.issue.trim() && !aiFilling ? '#1a237e' : '#9e9e9e',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: formData.issue.trim() && !aiFilling ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                boxShadow: formData.issue.trim() && !aiFilling ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
              }}
            >
              {aiFilling ? (
                <>
                  <CompanyAiIcon size={20} />
                  <span>{language === 'es' ? 'Procesando…' : 'Processing…'}</span>
                </>
              ) : (
                <>
                  <CompanyAiIcon size={20} />
                  <span>{t('aiFillAllButton') || (language === 'es' ? 'Déjame ayudarte a completar este formulario' : 'Let me help you fill this form')}</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="client_name">
              {t('fullName')} <span className="required">*</span>
            </label>
            <input
              type="text"
              id="client_name"
              name="client_name"
              value={formData.client_name}
              onChange={handleChange}
              required
              readOnly={!!formData.user_id}
              style={formData.user_id ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
              title={formData.user_id ? (language === 'es' ? 'Este campo se completa automáticamente desde su perfil' : 'This field is auto-filled from your profile') : ''}
            />
          </div>

          <div className="form-group">
            <label htmlFor="client_email">
              {t('email')} <span className="required">*</span>
            </label>
            <input
              type="email"
              id="client_email"
              name="client_email"
              value={formData.client_email}
              onChange={handleChange}
              required
              readOnly={!!formData.user_id}
              style={formData.user_id ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
              title={formData.user_id ? (language === 'es' ? 'Este campo se completa automáticamente desde su perfil' : 'This field is auto-filled from your profile') : ''}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="client_phone">{t('phone')}</label>
            <input
              type="tel"
              id="client_phone"
              name="client_phone"
              value={formData.client_phone}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-group">
          <div className="label-with-ai-inline">
            <label htmlFor="issue">
              {t('issueToDiscuss')} <span className="required">*</span>
            </label>
            <button
              type="button"
              className="ai-assist-button-inline"
              onClick={handleAIImproveDescription}
              disabled={aiProcessing || !formData.issue}
              aria-label={t('improveWithAI') || 'Let me help you explain'}
              title={t('improveDescriptionTooltip') || 'AI says: Let me help you rewrite your description more clearly'}
            >
              <CompanyAiIcon size={20} />
              <span>{aiProcessing ? t('processing') || '...' : (t('improveText') || 'Let me help you explain')}</span>
            </button>
          </div>
          <textarea
            id="issue"
            name="issue"
            value={formData.issue}
            onChange={handleChange}
            rows={5}
            placeholder={t('issueDescription')}
            required
          />
        </div>

        <div className="form-group">
          <div className="label-with-ai-inline">
            <label htmlFor="specialty_id">
              {t('selectSpecialty')}
            </label>
            <button
              type="button"
              className="ai-assist-button-inline"
              onClick={handleAISpecialtySuggestion}
              disabled={aiProcessing || !formData.issue}
              aria-label={t('aiHelpSpecialty') || t('askMariForSpecialty')}
              title={t('aiHelpSpecialty') || 'Let me help you choose a specialty'}
            >
              <CompanyAiIcon size={20} />
              <span>{aiProcessing ? t('processing') || '...' : (t('aiHelpSpecialty') || 'Let me help you choose a specialty')}</span>
            </button>
          </div>
          <InfoSelect
            id="specialty_id"
            name="specialty_id"
            value={formData.specialty_id || ''}
            placeholder={t('chooseSpecialty')}
            options={filteredSpecialties.map(s => {
              const override = specialtyDescOverrides[s.id];
              return {
                value: s.id,
                label: language === 'en' ? s.name_en : s.name_es,
                description: override
                  ? (language === 'en' ? override.en : override.es)
                  : (language === 'en' ? s.description_en : s.description_es) || '',
              };
            })}
            onChange={(val) => setFormData(prev => ({ ...prev, specialty_id: val }))}
            onInfo={(name, desc) => {
              const specialty = filteredSpecialties.find(s => (language === 'en' ? s.name_en : s.name_es) === name);
              if (specialty) {
                const override = specialtyDescOverrides[specialty.id];
                const effectiveDesc = override
                  ? (language === 'en' ? override.en : override.es)
                  : desc;
                handleRightClickInfo('specialty', name, effectiveDesc, specialty.id);
              } else {
                handleRightClickInfo('specialty', name, desc, '');
              }
            }}
            infoButtonTitle={t('rightClickSpecialtyHint')}
          />
          {formData.specialty_id && (() => {
            const selectedSpecialty = specialties.find(s => s.id === formData.specialty_id);
            const specialtyName = selectedSpecialty ? (language === 'en' ? selectedSpecialty.name_en : selectedSpecialty.name_es) : '';
            return (
              <button
                type="button"
                className="explain-selected-button"
                onClick={handleExplainSpecialty}
                disabled={loadingExplanation}
              >
                <CompanyAiIcon size={20} />
                <span>{loadingExplanation ? (t('loading') || 'Loading...') : `${t('explainSpecialty') || 'Explain'} "${specialtyName}"`}</span>
              </button>
            );
          })()}
        </div>

        {problems.length > 0 && (
          <div className="form-group">
            <div
              className="problems-header-collapsible"
              onClick={() => setProblemsExpanded(!problemsExpanded)}
            >
              <div className="problems-header-left">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  style={{
                    transition: 'transform 0.25s ease',
                    transform: problemsExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  }}
                >
                  <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
                </svg>
                <label style={{ cursor: 'pointer', margin: 0 }}>
                  {t('problemCategories')}
                </label>
                {selectedProblems.length > 0 && (
                  <span className="problems-badge">
                    {selectedProblems.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="ai-assist-button-inline"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAISuggestProblems();
                }}
                disabled={aiSuggestingProblems || !formData.issue}
                aria-label={t('aiHelpProblems') || t('suggestProblems')}
                title={t('aiHelpProblems') || (language === 'es' ? 'Déjame ayudarte a seleccionar problemas' : 'Let me help you select problems')}
              >
                <CompanyAiIcon size={20} />
                <span>{aiSuggestingProblems ? (t('processing') || '...') : (t('aiHelpProblems') || 'Let me help you select problems')}</span>
              </button>
            </div>
            {!problemsExpanded && selectedProblems.length > 0 && (
              <div className="problems-selected-summary">
                {selectedProblems.map(id => {
                  const p = problems.find(pr => pr.id === id);
                  if (!p) return null;
                  const name = language === 'en' ? p.problem_abrev : (p.problem_abrev_es || p.problem_abrev);
                  const desc = language === 'en' ? p.problem_desc : (p.problem_desc_es || p.problem_desc);
                  return (
                    <span
                      key={id}
                      className="problems-selected-tag"
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRightClickInfo('problem', name || '', desc || '', String(id));
                      }}
                      title={t('rightClickProblemHint')}
                      style={{ cursor: 'context-menu' }}
                    >
                      {name}
                    </span>
                  );
                })}
              </div>
            )}
            {problemsExpanded && (
              <>
                {selectedProblems.length > 0 && (
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', color: '#2e7d32' }}>
                    {selectedProblems.length} {t('selected')}
                    <button
                      type="button"
                      onClick={() => setSelectedProblems([])}
                      style={{
                        marginLeft: '0.75rem',
                        background: 'none',
                        border: 'none',
                        color: '#d32f2f',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        textDecoration: 'underline',
                        padding: 0,
                      }}
                    >
                      {t('clear')}
                    </button>
                  </div>
                )}
                <div className="problems-checklist">
                  {problems.map(problem => {
                    const name = language === 'en' ? problem.problem_abrev : (problem.problem_abrev_es || problem.problem_abrev);
                    const desc = language === 'en' ? problem.problem_desc : (problem.problem_desc_es || problem.problem_desc);
                    const isSelected = selectedProblems.includes(problem.id);
                    return (
                      <ProblemCheckboxItem
                        key={problem.id}
                        problem={problem}
                        name={name || ''}
                        desc={desc || ''}
                        isSelected={isSelected}
                        onToggle={() => toggleProblem(problem.id)}
                        onInfo={(n, d) => handleRightClickInfo('problem', n, d, String(problem.id))}
                        hintTitle={t('rightClickProblemHint')}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="counseling_type_id">
            {t('selectCounselingType') || 'Counseling Type'} <span className="required">*</span>
          </label>
          <InfoSelect
            id="counseling_type_id"
            name="counseling_type_id"
            value={formData.counseling_type_id || ''}
            placeholder={t('chooseCounselingType') || 'Choose counseling type...'}
            required
            options={counselingTypes.map(ct => ({
              value: ct.id,
              label: language === 'en' ? ct.name_en : ct.name_es,
              description: (language === 'en' ? ct.description_en : ct.description_es) || '',
            }))}
            onChange={(val) => setFormData(prev => ({ ...prev, counseling_type_id: val }))}
            onInfo={(name, desc) => {
              const ct = counselingTypes.find(c => (language === 'en' ? c.name_en : c.name_es) === name);
              handleRightClickInfo('counselingType', name, desc, ct?.id || '');
            }}
            infoButtonTitle={t('rightClickCounselingHint')}
          />
        </div>

        <div className="form-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 600, whiteSpace: 'nowrap', margin: 0, fontSize: '0.9rem' }}>
              {language === 'es' ? 'Max. Diferencia de Zona Horaria:' : 'Max. Time Zone Difference:'}
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {([null, 3, 6, 9, 12] as (number | null)[]).map(val => (
                <button
                  key={val ?? 'all'}
                  type="button"
                  onClick={() => setMaxTzDiffHours(val)}
                  style={{
                    padding: '0.25rem 0.65rem',
                    borderRadius: '14px',
                    border: '1px solid',
                    borderColor: maxTzDiffHours === val ? '#1976d2' : '#ccc',
                    backgroundColor: maxTzDiffHours === val ? '#1976d2' : 'white',
                    color: maxTzDiffHours === val ? 'white' : '#555',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: maxTzDiffHours === val ? 600 : 400,
                    transition: 'all 0.15s',
                  }}
                >
                  {val === null
                    ? (language === 'es' ? 'Todos' : 'All')
                    : `≤ ${val}h`}
                </button>
              ))}
            </div>
            {maxTzDiffHours !== null && (
              <span style={{ fontSize: '0.8rem', color: '#666' }}>
                {filteredProfessionals.length} {language === 'es' ? 'disponibles' : 'available'}
              </span>
            )}
          </div>
        </div>

        <div className="form-group">
          <div className="label-with-ai-inline">
            <label htmlFor="professional_id">
              {t('selectProfessional')} <span className="required">*</span>
            </label>
            <button
              type="button"
              className="ai-assist-button-inline"
              onClick={handleAIProfessionalSuggestion}
              disabled={aiProcessing || !formData.issue}
              aria-label={t('aiHelpProfessional') || t('askMariForProfessional')}
              title={t('aiHelpProfessional') || 'Let me help you find a professional'}
            >
              <CompanyAiIcon size={20} />
              <span>{aiProcessing ? t('processing') || '...' : (t('aiHelpProfessional') || 'Let me help you find a professional')}</span>
            </button>
          </div>
          {aiSuggestedProfessionalIds.length > 1 && (
            <div
              style={{
                marginBottom: '0.65rem',
                padding: '0.55rem 0.75rem',
                backgroundColor: '#f0f4ff',
                border: '1px solid #c7d2fe',
                borderRadius: '8px',
                fontSize: '0.85rem',
                color: '#3730a3',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>
                {language === 'es' ? 'MarI sugiere comparar estos profesionales (el primero es el mejor encaje):' : 'MarI suggests comparing these professionals (first is the best match):'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {aiSuggestedProfessionalIds.map((pid) => {
                  const p = professionals.find(x => x.id === pid);
                  if (!p) return null;
                  const pName = language === 'en' ? p.name_en : p.name_es;
                  const isActive = formData.professional_id === pid;
                  const isExpanded = expandedAiSuggestedProfId === pid;
                  const bioOverride = professionalBioOverrides[p.id];
                  const bio = bioOverride
                    ? (language === 'en' ? bioOverride.en : bioOverride.es)
                    : (language === 'en' ? p.bio_en : p.bio_es);
                  const specs = language === 'en' ? p.specialties_en : p.specialties_es;
                  const langs = getAllLanguagesForProfessional(p);
                  const tzDiff = getTzDiffHours(p.time_zone);
                  return (
                    <div
                      key={pid}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '0.5rem 0.65rem',
                        backgroundColor: 'white',
                      }}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, professional_id: pid }));
                          }}
                          style={{
                            padding: '0.25rem 0.55rem',
                            borderRadius: '999px',
                            border: `1px solid ${isActive ? '#4338ca' : '#a5b4fc'}`,
                            backgroundColor: isActive ? '#4338ca' : 'white',
                            color: isActive ? 'white' : '#4338ca',
                            cursor: 'pointer',
                            fontSize: '0.82rem',
                            fontWeight: isActive ? 600 : 500,
                          }}
                        >
                          {pName}
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedAiSuggestedProfId(isExpanded ? null : pid)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.45rem 0.9rem',
                            backgroundColor: isExpanded ? '#6c63ff' : 'white',
                            color: isExpanded ? 'white' : '#6c63ff',
                            border: '1.5px solid #6c63ff',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s',
                          }}
                        >
                          {lbl('Details', 'Detalles')}
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      </div>
                      {isExpanded && (
                        <div
                          style={{
                            marginTop: '0.75rem',
                            padding: '1rem 0.75rem 0.75rem',
                            backgroundColor: '#faf9ff',
                            borderRadius: '8px',
                            border: '1px solid #ede9fe',
                          }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                            <div>
                              <h4
                                style={{
                                  margin: '0 0 0.5rem',
                                  fontSize: '0.85rem',
                                  fontWeight: 700,
                                  color: '#64748b',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                {lbl('About', 'Acerca de')}
                              </h4>
                              <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: '#374151', lineHeight: 1.6 }}>{bio}</p>

                              <h4
                                style={{
                                  margin: '0 0 0.5rem',
                                  fontSize: '0.85rem',
                                  fontWeight: 700,
                                  color: '#64748b',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                {t('specialties')}
                              </h4>
                              <div className="specialty-tags" style={{ marginBottom: '1rem' }}>
                                {specs.map((s, i) => (
                                  <span key={i} className="specialty-tag specialty-tag--highlight">
                                    {s}
                                  </span>
                                ))}
                              </div>

                              {p.counseling_types && p.counseling_types.length > 0 && (
                                <>
                                  <h4
                                    style={{
                                      margin: '0 0 0.5rem',
                                      fontSize: '0.85rem',
                                      fontWeight: 700,
                                      color: '#64748b',
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.04em',
                                    }}
                                  >
                                    {t('counselingTypes')}
                                  </h4>
                                  <div className="counseling-type-tags" style={{ marginBottom: '1rem' }}>
                                    {p.counseling_types.map((typeId, i) => (
                                      <span key={i} className="counseling-type-tag">
                                        {getCounselingTypeLabel(typeId)}
                                      </span>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>

                            <div>
                              <h4
                                style={{
                                  margin: '0 0 0.5rem',
                                  fontSize: '0.85rem',
                                  fontWeight: 700,
                                  color: '#64748b',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                {lbl('Details', 'Detalles')}
                              </h4>

                              {langs.length > 0 && (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    marginBottom: '0.6rem',
                                    fontSize: '0.9rem',
                                    color: '#374151',
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <span style={{ fontWeight: 500 }}>{t('languages')}:</span>
                                  {langs.map((l, i) =>
                                    getCountryCodeForLanguage(l) ? (
                                      <LanguageFlag key={i} languageName={l} size={20} />
                                    ) : (
                                      <span key={i}>{l}</span>
                                    )
                                  )}
                                  <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{langs.join(', ')}</span>
                                </div>
                              )}

                              {p.time_zone && (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    marginBottom: '0.6rem',
                                    fontSize: '0.9rem',
                                    color: '#374151',
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#64748b', flexShrink: 0 }}>
                                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z" />
                                  </svg>
                                  <span>
                                    <span style={{ fontWeight: 500 }}>{t('timeZone')}:</span> {p.time_zone}
                                  </span>
                                  {tzDiff !== null && (
                                    <span
                                      style={{
                                        fontSize: '0.8rem',
                                        padding: '0.1rem 0.4rem',
                                        borderRadius: '10px',
                                        backgroundColor: tzDiff <= 3 ? '#dcfce7' : tzDiff <= 6 ? '#fef9c3' : '#fee2e2',
                                        color: tzDiff <= 3 ? '#16a34a' : tzDiff <= 6 ? '#854d0e' : '#dc2626',
                                        fontWeight: 600,
                                      }}
                                    >
                                      {tzDiff === 0
                                        ? lbl('Same timezone', 'Misma zona horaria')
                                        : `${lbl('Δ', 'Δ')}${tzDiff}h ${lbl('difference', 'diferencia')}`}
                                    </span>
                                  )}
                                </div>
                              )}

                              {p.email && (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    marginBottom: '0.6rem',
                                    fontSize: '0.9rem',
                                    color: '#374151',
                                  }}
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                    <polyline points="22,6 12,13 2,6" />
                                  </svg>
                                  <a href={`mailto:${p.email}`} style={{ color: '#6c63ff', textDecoration: 'none', fontWeight: 500 }}>
                                    {p.email}
                                  </a>
                                </div>
                              )}

                              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  onClick={() => setFormData(prev => ({ ...prev, professional_id: pid }))}
                                  style={{
                                    padding: '0.55rem 1.25rem',
                                    backgroundColor: isActive ? '#5b53e8' : '#6c63ff',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: 600,
                                  }}
                                >
                                  {isActive
                                    ? lbl('✓ Selected', '✓ Seleccionado')
                                    : lbl('Select Professional', 'Seleccionar Profesional')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setProfPopup(p);
                                    setShowResumeForPopup(true);
                                  }}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    padding: '0.55rem 1.1rem',
                                    backgroundColor: '#f1f5f9',
                                    color: '#334155',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: 500,
                                  }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="16" y1="13" x2="8" y2="13" />
                                    <line x1="16" y1="17" x2="8" y2="17" />
                                    <polyline points="10 9 9 9 8 9" />
                                  </svg>
                                  {lbl('Resume / CV', 'Currículum / CV')}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div ref={profDropdownRef} style={{ position: 'relative' }}>
            <div
              onClick={() => setProfDropdownOpen(o => !o)}
              onContextMenu={(e) => {
                const p = professionals.find(x => x.id === formData.professional_id);
                if (p) {
                  e.preventDefault();
                  const pName = language === 'en' ? p.name_en : p.name_es;
                  const bioOverride = professionalBioOverrides[p.id];
                  const bio = bioOverride
                    ? (language === 'en' ? bioOverride.en : bioOverride.es)
                    : (language === 'en' ? p.bio_en : p.bio_es) || '';
                  handleRightClickInfo('professional', pName, bio, p.id);
                }
              }}
              title={formData.professional_id ? (language === 'es' ? 'Clic derecho para ver perfil' : 'Right-click to view profile') : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0.75rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer',
                minHeight: '38px',
                fontSize: '0.95rem',
                userSelect: 'none',
              }}
            >
              <span style={{ color: formData.professional_id ? 'inherit' : '#999' }}>
                {formData.professional_id
                  ? (() => {
                      const p = professionals.find(x => x.id === formData.professional_id);
                      if (!p) return t('chooseProfessional');
                      const pName = language === 'en' ? p.name_en : p.name_es;
                      const suffix = [p.Título, p.Clasificación].filter(Boolean).join(' - ');
                      return suffix ? `${pName} (${suffix})` : pName;
                    })()
                  : t('chooseProfessional')}
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, opacity: 0.5, transform: profDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                <path d="M7 10l5 5 5-5z"/>
              </svg>
            </div>
            {profDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 1000,
                backgroundColor: 'white',
                border: '1px solid #ccc',
                borderRadius: '4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                maxHeight: '240px',
                overflowY: 'auto',
              }}>
                <div
                  onClick={() => {
                    setFormData(prev => ({ ...prev, professional_id: '' }));
                    setAiSuggestedProfessionalIds([]);
                    setProfDropdownOpen(false);
                  }}
                  style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', color: '#999', fontSize: '0.9rem' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}
                >
                  {t('chooseProfessional')}
                </div>
                {professionalsForDropdown.map((professional) => {
                    const pName = language === 'en' ? professional.name_en : professional.name_es;
                    const suffix = [professional.Título, professional.Clasificación].filter(Boolean).join(' - ');
                    const isSelected = formData.professional_id === professional.id;
                    const isAiPick = aiSuggestedProfessionalIds.length > 1 && aiSuggestedProfessionalIds.includes(professional.id);
                    return (
                      <div
                        key={professional.id}
                        onClick={() => {
                          setFormData(prev => ({ ...prev, professional_id: professional.id }));
                          setAiSuggestedProfessionalIds([]);
                          setProfDropdownOpen(false);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const bioOverride = professionalBioOverrides[professional.id];
                          const bio = bioOverride
                            ? (language === 'en' ? bioOverride.en : bioOverride.es)
                            : (language === 'en' ? professional.bio_en : professional.bio_es) || '';
                          handleRightClickInfo('professional', pName, bio, professional.id);
                        }}
                        title={language === 'es' ? 'Clic derecho para ver perfil' : 'Right-click to view profile'}
                        style={{
                          padding: '0.5rem 0.75rem',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? '#e3f2fd' : isAiPick ? '#f5f3ff' : 'white',
                          fontWeight: isSelected ? 600 : 400,
                          fontSize: '0.9rem',
                          borderLeft: isSelected ? '3px solid #2196F3' : isAiPick ? '3px solid #7c3aed' : '3px solid transparent',
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#f5f5f5'; }}
                        onMouseLeave={e => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = isAiPick ? '#f5f3ff' : 'white';
                          }
                        }}
                      >
                        {suffix ? `${pName} (${suffix})` : pName}
                        {isAiPick && !isSelected && (
                          <span style={{ marginLeft: '0.35rem', fontSize: '0.72rem', color: '#6d28d9', fontWeight: 600 }}>
                            {language === 'es' ? '· MarI' : '· MarI'}
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
            <input type="hidden" name="professional_id" value={formData.professional_id} required />
          </div>
          {formData.professional_id && (() => {
            const selectedProf = professionals.find(p => p.id === formData.professional_id);
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                {selectedProf?.time_zone && (
                  <div style={{
                    padding: '0.5rem 0.75rem',
                    backgroundColor: '#e3f2fd',
                    border: '1px solid #90caf9',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    color: '#1565c0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    flex: '1 1 auto',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7, flexShrink: 0 }}>
                      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/>
                    </svg>
                    <span>
                      <strong>{language === 'es' ? 'Zona Horaria:' : 'Time Zone:'}</strong> {selectedProf.time_zone}
                    </span>
                  </div>
                )}
                {selectedProf && (
                  <button
                    type="button"
                    onClick={() => {
                      setProfPopup(selectedProf);
                      setShowResumeForPopup(true);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.5rem 0.9rem',
                      backgroundColor: '#f0f4ff',
                      border: '1px solid #c7d2fe',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      color: '#3730a3',
                      cursor: 'pointer',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/>
                      <polyline points="10 9 9 9 8 9"/>
                    </svg>
                    {language === 'es' ? 'Ver Currículum' : 'View Resume'}
                  </button>
                )}
              </div>
            );
          })()}
          {formData.professional_id && formData.issue && formData.specialty_id && (() => {
            const selectedProfessional = professionals.find(p => p.id === formData.professional_id);
            const professionalName = selectedProfessional ? (language === 'en' ? selectedProfessional.name_en : selectedProfessional.name_es) : '';
            return (
              <button
                type="button"
                className="explain-selected-button"
                onClick={handleExplainTreatment}
                disabled={loadingTreatmentExplanation}
                style={{ marginTop: '0.5rem' }}
              >
                <CompanyAiIcon size={20} />
                <span>{loadingTreatmentExplanation ? (t('loading') || 'Loading...') : (language === 'es' ? `Explicar cómo ${professionalName} tratará su problema` : `Explain how ${professionalName} will treat your issue`)}</span>
              </button>
            );
          })()}
        </div>

        <div className="form-group">
          <label htmlFor="selected_date">
            {t('preferredDate')} <span className="required">*</span>
            {formData.professional_id && (
              <span style={{ fontWeight: 400, fontSize: '0.875rem', color: '#666', marginLeft: '0.5rem' }}>
                ({language === 'es' ? 'Aviso mínimo' : 'Minimum Notice'}: {minimumNoticeHours}{' '}
                {language === 'es' ? 'horas' : 'hours'})
              </span>
            )}
          </label>
          <input
            type="date"
            id="selected_date"
            name="selected_date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            min={minimumBookableDate}
            required
            disabled={!formData.professional_id}
          />
          <TimezoneSelector value={timezone} onChange={setTimezone} />
          {!formData.professional_id && (
            <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
              {language === 'es' ? 'Primero seleccione un profesional' : 'Please select a professional first'}
            </p>
          )}
          {formData.professional_id && (
            <div className="auto-date-section">
              <button
                type="button"
                className="auto-date-toggle"
                onClick={() => { setAutoDateOpen(!autoDateOpen); setAutoDateError(''); }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
                </svg>
                <span>
                  {language === 'es' ? 'Buscar próxima fecha disponible' : 'Find next available date'}
                </span>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: autoDateOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {autoDateOpen && (
                <div className="auto-date-panel">
                  <p style={{ margin: '0 0 0.6rem', fontSize: '0.85rem', color: '#4b5563', fontWeight: 600 }}>
                    {language === 'es' ? 'Días preferidos:' : 'Preferred days:'}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.4rem', marginBottom: '0.9rem' }}>
                    {([
                      { index: 1, en: 'Monday',    es: 'Lunes'     },
                      { index: 2, en: 'Tuesday',   es: 'Martes'    },
                      { index: 3, en: 'Wednesday', es: 'Miércoles' },
                      { index: 4, en: 'Thursday',  es: 'Jueves'    },
                      { index: 5, en: 'Friday',    es: 'Viernes'   },
                      { index: 6, en: 'Saturday',  es: 'Sábado'    },
                      { index: 0, en: 'Sunday',    es: 'Domingo'   },
                    ] as const).map((day) => {
                      const checked = autoDateDays.includes(day.index);
                      return (
                        <label
                          key={day.index}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.4rem 0.6rem', borderRadius: '6px', cursor: 'pointer',
                            border: checked ? '1px solid #6366f1' : '1px solid #d1d5db',
                            backgroundColor: checked ? '#eef2ff' : '#f9fafb',
                            fontSize: '0.85rem', fontWeight: checked ? 600 : 400,
                            color: checked ? '#3730a3' : '#4b5563',
                            userSelect: 'none',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setAutoDateDays(prev =>
                                checked
                                  ? prev.filter(d => d !== day.index)
                                  : [...prev, day.index].sort()
                              );
                            }}
                            style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                          />
                          {language === 'es' ? day.es : day.en}
                        </label>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="auto-date-search-btn"
                    onClick={findNextAvailableDate}
                    disabled={searchingDate || autoDateDays.length === 0}
                  >
                    {searchingDate ? (
                      <>
                        <span className="auto-date-spinner" />
                        {language === 'es' ? 'Buscando...' : 'Searching...'}
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        {language === 'es' ? 'Buscar fecha' : 'Find date'}
                      </>
                    )}
                  </button>
                  {autoDateError && (
                    <p className="auto-date-error">{autoDateError}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {formData.professional_id && (
          <>
            <div className="form-group">
              <label htmlFor="preferred_time">
                {language === 'es' ? 'Hora de Inicio Preferida' : 'Preferred Start Time'} <span className="required">*</span>
              </label>
              {!selectedDate ? (
                <p style={{ fontSize: '0.875rem', color: '#666', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                  {language === 'es' ? 'Por favor seleccione una fecha primero para ver los horarios disponibles' : 'Please select a date first to see available times'}
                </p>
              ) : loadingSlots ? (
                <p style={{ fontSize: '0.875rem', color: '#666' }}>
                  {language === 'es' ? 'Cargando horarios disponibles...' : 'Loading available times...'}
                </p>
              ) : (
                <>
                  {storedTimeSlot && preserveStoredTime && (
                    <div className="stored-time-slot-display">
                      <p className="stored-time-slot-title">
                        {language === 'es'
                          ? 'Horario seleccionado guardado en la base de datos'
                          : 'Selected time slot saved in database'}
                      </p>
                      <div className="stored-time-slot-grid">
                        <span>
                          {language === 'es' ? 'Hora profesional' : 'Professional time'} ({storedTimeSlot.profTz})
                          <strong>{storedTimeSlot.professionalTime}</strong>
                        </span>
                        <span>
                          {language === 'es' ? 'Tu hora local' : 'Your local time'} ({storedTimeSlot.clientTz})
                          <strong>{storedTimeSlot.clientTime}</strong>
                        </span>
                      </div>
                      <p className="stored-time-slot-note">
                        {language === 'es'
                          ? 'No es necesario volver a seleccionar el horario a menos que desee cambiarlo.'
                          : 'No need to re-select the time unless you want to change it.'}
                      </p>
                    </div>
                  )}
                  {(() => {
                    const timeSlots = bookableTimeSlots;
                    const selectedProf = professionals.find(p => p.id === formData.professional_id);
                    const profTz = selectedProf?.time_zone || 'America/Bogota';
                    console.log('🕐 Time slots rendering - Current preferred_time:', formData.preferred_time);
                    console.log('🕐 Available time slots:', timeSlots.map(s => s.value));
                    return (
                      <>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '0.5rem',
                          marginBottom: '0.5rem',
                          padding: '0.5rem',
                          backgroundColor: '#f5f5f5',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}>
                          <span style={{ textAlign: 'center' }}>
                            {language === 'es' ? 'Hora Profesional' : 'Professional Time'}
                            <br />
                            <span style={{ fontWeight: 400, color: '#666' }}>({getTimezoneAbbr(profTz)})</span>
                          </span>
                          <span style={{ textAlign: 'center' }}>
                            {language === 'es' ? 'Tu Hora Local' : 'Your Local Time'}
                            <br />
                            <span style={{ fontWeight: 400, color: '#666' }}>({getTimezoneAbbr(timezone)})</span>
                          </span>
                        </div>
                        {timeSlots.length === 0 ? (
                          <p style={{ fontSize: '0.875rem', color: '#666', textAlign: 'center', padding: '1rem' }}>
                            {language === 'es'
                              ? 'No hay horarios disponibles para este día'
                              : 'No available times for this day'}
                          </p>
                        ) : (
                          <div style={{
                            maxHeight: '300px',
                            overflowY: 'auto',
                            border: '1px solid #ddd',
                            borderRadius: '4px'
                          }}>
                            {timeSlots.map((slot) => {
                              const isSelected = normalizeTimeForSlot(formData.preferred_time) === normalizeTimeForSlot(slot.value);
                              if (isSelected) {
                                console.log('✅ Selected slot:', slot.value, 'matches formData.preferred_time:', formData.preferred_time);
                              }
                              return (
                                <div
                                  key={slot.value}
                                  onClick={() => {
                                    console.log('Time slot clicked:', slot.value);
                                    setPreserveStoredTime(false);
                                    setStoredTimeSlot(null);
                                    setFormData({ ...formData, preferred_time: slot.value });
                                  }}
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: '0.5rem',
                                    padding: '0.75rem',
                                    cursor: 'pointer',
                                    backgroundColor: isSelected ? '#2196F3' : '#ffffff',
                                    color: isSelected ? '#ffffff' : '#333333',
                                    borderBottom: '1px solid #eee',
                                    border: isSelected ? '2px solid #1976D2' : '1px solid transparent',
                                    borderRadius: '4px',
                                    margin: '2px',
                                    transition: 'all 0.2s',
                                    fontWeight: isSelected ? 600 : 400
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isSelected) {
                                      e.currentTarget.style.backgroundColor = '#e3f2fd';
                                      e.currentTarget.style.border = '1px solid #2196F3';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!isSelected) {
                                      e.currentTarget.style.backgroundColor = '#ffffff';
                                      e.currentTarget.style.border = '1px solid transparent';
                                    }
                                  }}
                                >
                                  <span style={{ textAlign: 'center' }}>
                                    {slot.professionalTime}
                                  </span>
                                  <span style={{ textAlign: 'center' }}>
                                    {slot.clientTime}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <input
                          type="hidden"
                          id="preferred_time"
                          name="preferred_time"
                          value={formData.preferred_time || ''}
                          required
                        />
                      </>
                    );
                  })()}
                </>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="session_length">
                {language === 'es' ? 'Duración de la Sesión (horas)' : 'Session Length (hours)'} <span className="required">*</span>
              </label>
              <select
                id="session_length"
                name="session_length"
                value={formData.session_length || 1}
                onChange={handleChange}
                required
              >
                <option value={1}>{language === 'es' ? '1 hora' : '1 hour'}</option>
                <option value={2}>{language === 'es' ? '2 horas' : '2 hours'}</option>
                <option value={3}>{language === 'es' ? '3 horas' : '3 hours'}</option>
              </select>
            </div>
          </>
        )}

        <div className="form-group">
          <label htmlFor="session_price_id">
            {t('selectPrice') || 'Select Session Price'} <span className="required">*</span>
          </label>
          {formData.professional_id && sessionPrices.length > 0 && (
            <small style={{ display: 'block', marginBottom: '0.4rem', color: '#0369a1' }}>
              {sessionPrices[0].professional_id
                ? (language === 'es' ? 'Precios específicos del profesional' : 'Professional-specific prices')
                : (language === 'es' ? 'Lista de precios general' : 'General price list')}
            </small>
          )}
          {loadingPrices ? (
            <p>{t('loading') || 'Loading prices...'}</p>
          ) : (
            <select
              id="session_price_id"
              name="session_price_id"
              value={formData.session_price_id || ''}
              onChange={handleChange}
              required
            >
              <option value="">{t('choosePrice') || 'Choose a price...'}</option>
              {sessionPrices.map((price) => (
                <option key={price.id} value={price.id}>
                  {price.Name} - {price.Price} {price.Currency} ({price.NumSessions} {price.NumSessions === 1 ? 'session' : 'sessions'})
                </option>
              ))}
            </select>
          )}

          {/* Package size indicator — shown when a price with more than 1 session is selected */}
          {(formData.num_sessions ?? 1) > 0 && formData.session_price_id && (
            <div
              style={{
                marginTop: '0.6rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.6rem 0.9rem',
                borderRadius: '8px',
                backgroundColor: (formData.num_sessions ?? 1) > 1 ? '#eff6ff' : '#f0fdf4',
                border: `1px solid ${(formData.num_sessions ?? 1) > 1 ? '#bfdbfe' : '#bbf7d0'}`,
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>{(formData.num_sessions ?? 1) > 1 ? '📦' : '🗓️'}</span>
              <div>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: (formData.num_sessions ?? 1) > 1 ? '#1d4ed8' : '#15803d' }}>
                  {language === 'es'
                    ? `Sesiones reservadas: ${formData.num_sessions ?? 1}`
                    : `Sessions reserved: ${formData.num_sessions ?? 1}`}
                </span>
                {(formData.num_sessions ?? 1) > 1 && (
                  <p style={{ margin: '0.1rem 0 0', fontSize: '0.8rem', color: '#3b82f6' }}>
                    {language === 'es'
                      ? `Paquete de ${formData.num_sessions} sesiones — se agendarán individualmente`
                      : `Package of ${formData.num_sessions} sessions — each will be scheduled individually`}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {aiError && (
          <div style={{
            padding: '1rem',
            marginBottom: '1rem',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '4px',
            color: '#856404'
          }}>
            {aiError}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <button
            type="button"
            className="questionnaire-button"
            onClick={handleGenerateQuestionnaire}
            disabled={!formData.issue || formData.issue.trim() === '' || loadingQuestionnaire}
            style={{
              flex: 1,
              padding: '0.75rem',
              backgroundColor: formData.issue && formData.issue.trim() !== '' ? '#6c63ff' : '#cccccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.95rem',
              cursor: formData.issue && formData.issue.trim() !== '' ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => {
              if (formData.issue && formData.issue.trim() !== '') {
                e.currentTarget.style.backgroundColor = '#5852d6';
              }
            }}
            onMouseLeave={(e) => {
              if (formData.issue && formData.issue.trim() !== '') {
                e.currentTarget.style.backgroundColor = '#6c63ff';
              }
            }}
          >
            <CompanyAiIcon size={22} />
            <span>
              {loadingQuestionnaire
                ? (language === 'es' ? 'Buscando en el catálogo...' : 'Finding a stored questionnaire...')
                : (language === 'es'
                  ? 'Déjame elegir un cuestionario estándar para ti'
                  : 'Let me pick a standard questionnaire for you')}
            </span>
          </button>

          <button
            type="button"
            className="questionnaire-button"
            onClick={handleShowStandardQuestionnaires}
            disabled={!formData.issue || formData.issue.trim() === '' || loadingStandardContext}
            style={{
              flex: 1,
              padding: '0.75rem',
              backgroundColor: formData.issue && formData.issue.trim() !== '' ? '#28a745' : '#cccccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.95rem',
              cursor: formData.issue && formData.issue.trim() !== '' ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => {
              if (formData.issue && formData.issue.trim() !== '') {
                e.currentTarget.style.backgroundColor = '#218838';
              }
            }}
            onMouseLeave={(e) => {
              if (formData.issue && formData.issue.trim() !== '') {
                e.currentTarget.style.backgroundColor = '#28a745';
              }
            }}
          >
            <CompanyAiIcon size={22} />
            <span>
              {loadingStandardContext
                ? (language === 'es' ? 'Cargando...' : 'Loading...')
                : (language === 'es'
                  ? 'Te muestro una lista de cuestionarios estándar que puedes completar'
                  : 'Let me show you a list of standard questionnaires you can fill out')}
            </span>
          </button>
        </div>

        <div className="client-request-form-actions">
          <button type="submit" className="submit-button" disabled={loading || savingChanges}>
            {loading || savingChanges
              ? t('loading')
              : isEditingExistingRequest
                ? (language === 'es' ? 'Guardar Cambios' : 'Save Changes')
                : t('submitRequest')}
          </button>
          {onNavigate && (
            <button
              type="button"
              onClick={() => {
                if (editingRequestId) {
                  try {
                    sessionStorage.setItem(CANCEL_SESSION_PREFILL_KEY, editingRequestId);
                  } catch {
                    // sessionStorage may be unavailable
                  }
                }
                onNavigate('cancel-session');
              }}
              style={{
                padding: '0.6rem 1.4rem',
                borderRadius: '8px',
                border: '2px solid #dc2626',
                backgroundColor: 'white',
                color: '#dc2626',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
              }}
            >
              {language === 'es' ? '✕ Cancelar Sesión' : '✕ Cancel Session'}
            </button>
          )}
        </div>
      </form>

      {showExplanation && (
        <div className="specialty-explanation-modal" onClick={() => setShowExplanation(false)}>
          <div className="specialty-explanation-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="specialty-explanation-modal-header">
              <h3>
                {(() => {
                  const selectedSpecialty = specialties.find(s => s.id === formData.specialty_id);
                  return selectedSpecialty ? (language === 'en' ? selectedSpecialty.name_en : selectedSpecialty.name_es) : t('fieldExplanation');
                })()}
              </h3>
              <button
                type="button"
                className="specialty-modal-close-button"
                onClick={() => setShowExplanation(false)}
                aria-label="Close"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
            <div className="specialty-explanation-modal-body">
              {loadingExplanation ? (
                <div className="specialty-loading-spinner">
                  <div className="spinner"></div>
                  <p>{t('loading') || 'Loading...'}</p>
                </div>
              ) : (
                <div className="specialty-explanation-text">
                  {explanation.split('\n').map((paragraph, index) => (
                    paragraph.trim() && <p key={index}>{paragraph}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="specialty-explanation-modal-footer">
              <button
                type="button"
                className="specialty-modal-ok-button"
                onClick={() => setShowExplanation(false)}
              >
                {t('close') || 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTreatmentExplanation && (
        <div className="specialty-explanation-modal" onClick={() => setShowTreatmentExplanation(false)}>
          <div className="specialty-explanation-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="specialty-explanation-modal-header">
              <h3>
                {language === 'es' ? 'Plan de Tratamiento Personalizado' : 'Personalized Treatment Plan'}
              </h3>
              <button
                type="button"
                className="specialty-modal-close-button"
                onClick={() => setShowTreatmentExplanation(false)}
                aria-label="Close"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
            <div className="specialty-explanation-modal-body">
              {loadingTreatmentExplanation ? (
                <div className="specialty-loading-spinner">
                  <div className="spinner"></div>
                  <p>{t('loading') || 'Loading...'}</p>
                </div>
              ) : (
                <div className="specialty-explanation-text">
                  {treatmentExplanation.split('\n').map((paragraph, index) => (
                    paragraph.trim() && <p key={index}>{paragraph}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="specialty-explanation-modal-footer" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleSaveTreatmentPlan}
                disabled={savingTreatmentPlan || treatmentPlanSaved || loadingTreatmentExplanation || !treatmentExplanation}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: treatmentPlanSaved ? '#28a745' : '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: treatmentPlanSaved || savingTreatmentPlan ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  opacity: savingTreatmentPlan ? 0.7 : 1,
                }}
              >
                {savingTreatmentPlan ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ animation: 'spin 1s linear infinite' }}>
                      <path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z"/>
                    </svg>
                    {language === 'es' ? 'Guardando...' : 'Saving...'}
                  </>
                ) : treatmentPlanSaved ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                    {language === 'es' ? 'Guardado' : 'Saved'}
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                    </svg>
                    {language === 'es' ? 'Guardar Plan' : 'Save Plan'}
                  </>
                )}
              </button>
              <button
                type="button"
                className="specialty-modal-ok-button"
                onClick={() => {
                  setShowTreatmentExplanation(false);
                  setTreatmentPlanSaved(false);
                }}
              >
                {t('close') || 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showExistingSessions && (
        <ExistingSessionsModal
          onClose={() => setShowExistingSessions(false)}
          onInfo={(req) => setInfoRequest(req)}
          onEdit={(req) => loadRequestForEdit(req)}
          onPaySession={handlePaySessionFromExisting}
          onCancelSession={handleCancelSessionFromExisting}
          currentUserId={currentUser?.id}
          clientEmail={formData.client_email}
          isAdmin={currentUser?.user_type === 'Administrator'}
          onBookSession={() => { setShowExistingSessions(false); onNavigate?.('admin'); }}
        />
      )}

      {infoRequest && (
        <RequestInfoModal
          request={infoRequest}
          onClose={() => setInfoRequest(null)}
          specialties={specialties}
          counselingTypes={counselingTypes}
          professionals={professionals}
          sessionPrices={allSessionPrices}
        />
      )}

      {showQuestionnaire && (
        <div className="specialty-explanation-modal">
          <div className="specialty-explanation-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
            <div className="specialty-explanation-modal-header">
              <h3>
                {questionnaireSourceName
                  ? questionnaireSourceName
                  : (language === 'es' ? 'Cuestionario estándar del catálogo' : 'Stored standard questionnaire')}
              </h3>
              <button
                type="button"
                className="specialty-modal-close-button"
                onClick={() => {
                  if (!questionnaireSaved && questionnaire.length > 0 && !loadingQuestionnaire) {
                    const allQuestionsAnswered = questionnaire.every((_, index) => questionnaireResponses[index] !== undefined);

                    if (allQuestionsAnswered) {
                      const shouldSave = window.confirm(
                        language === 'es'
                          ? '¿Desea guardar el cuestionario antes de cerrar?'
                          : 'Do you want to save the questionnaire before closing?'
                      );
                      if (shouldSave) {
                        handleSaveQuestionnaire().then(() => {
                          setShowQuestionnaire(false);
                          setQuestionnaireResponses({});
                        });
                        return;
                      }
                    } else if (Object.keys(questionnaireResponses).length > 0) {
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
                  setShowQuestionnaire(false);
                  setQuestionnaireResponses({});
                }}
                aria-label="Close"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
            <div className="specialty-explanation-modal-body">
              {loadingQuestionnaire ? (
                <div className="specialty-loading-spinner">
                  <div className="spinner"></div>
                  <p>{t('loading') || 'Loading...'}</p>
                </div>
              ) : (
                <div className="specialty-explanation-text">
                  <p style={{ marginBottom: '1.5rem', color: '#666', fontStyle: 'italic' }}>
                    {language === 'es'
                      ? 'Este cuestionario de opción múltiple ayudará a su terapeuta a comprender mejor su situación y crear un plan de tratamiento personalizado. Puede usar estas preguntas para reflexionar sobre su problema antes de su sesión.'
                      : 'This multiple-choice questionnaire will help your therapist better understand your situation and create a personalized treatment plan. You can use these questions to reflect on your problem before your session.'}
                  </p>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.5rem',
                    textAlign: 'left'
                  }}>
                    {questionnaire.map((item, index) => (
                      <div key={index} style={{
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
                          {index + 1}. {item.question}
                        </p>
                        {item.options.length > 0 && (
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            marginLeft: '1rem'
                          }}>
                            {item.options.map((option, optIndex) => (
                              <label
                                key={optIndex}
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '0.5rem',
                                  cursor: 'pointer',
                                  padding: '0.5rem',
                                  borderRadius: '4px',
                                  backgroundColor: 'white',
                                  transition: 'background-color 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#e8f4f8';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'white';
                                }}
                              >
                                <input
                                  type="radio"
                                  name={`question-${index}`}
                                  value={String.fromCharCode(65 + optIndex)}
                                  checked={questionnaireResponses[index] === optIndex}
                                  onChange={() => setQuestionnaireResponses(prev => ({ ...prev, [index]: optIndex }))}
                                  style={{ marginTop: '0.25rem' }}
                                />
                                <span style={{ lineHeight: '1.4' }}>
                                  <strong>{String.fromCharCode(65 + optIndex)})</strong> {option}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="specialty-explanation-modal-footer" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleSaveQuestionnaire}
                disabled={savingQuestionnaire || questionnaireSaved || loadingQuestionnaire || questionnaire.length === 0}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: questionnaireSaved ? '#28a745' : '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: questionnaireSaved || savingQuestionnaire ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  opacity: savingQuestionnaire ? 0.7 : 1,
                }}
              >
                {savingQuestionnaire ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ animation: 'spin 1s linear infinite' }}>
                      <path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z"/>
                    </svg>
                    {language === 'es' ? 'Guardando...' : 'Saving...'}
                  </>
                ) : questionnaireSaved ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                    {language === 'es' ? 'Guardado' : 'Saved'}
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                    </svg>
                    {language === 'es' ? 'Guardar Cuestionario' : 'Save Questionnaire'}
                  </>
                )}
              </button>
              <button
                type="button"
                className="specialty-modal-ok-button"
                onClick={() => {
                  if (!questionnaireSaved && questionnaire.length > 0 && !loadingQuestionnaire) {
                    const allQuestionsAnswered = questionnaire.every((_, index) => questionnaireResponses[index] !== undefined);

                    if (allQuestionsAnswered) {
                      const shouldSave = window.confirm(
                        language === 'es'
                          ? '¿Desea guardar el cuestionario antes de cerrar?'
                          : 'Do you want to save the questionnaire before closing?'
                      );
                      if (shouldSave) {
                        handleSaveQuestionnaire().then(() => {
                          setShowQuestionnaire(false);
                          setQuestionnaireSaved(false);
                          setQuestionnaireResponses({});
                        });
                        return;
                      }
                    } else if (Object.keys(questionnaireResponses).length > 0) {
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
                  setShowQuestionnaire(false);
                  setQuestionnaireSaved(false);
                  setQuestionnaireResponses({});
                }}
              >
                {t('close') || 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showStandardQuestionnaires && (
        <div className="specialty-explanation-modal">
          <div className="specialty-explanation-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px' }}>
            <div className="specialty-explanation-modal-header">
              <h3>
                {language === 'es' ? 'Cuestionarios Estandarizados Clínicos' : 'Standardized Clinical Questionnaires'}
              </h3>
              <button
                type="button"
                className="specialty-modal-close-button"
                onClick={() => setShowStandardQuestionnaires(false)}
                aria-label="Close"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
            <div className="specialty-explanation-modal-body">
              {loadingStandardContext ? (
                <div className="specialty-loading-spinner">
                  <div className="spinner"></div>
                  <p>{t('loading') || 'Loading...'}</p>
                </div>
              ) : (
                <>
                  <div className="specialty-explanation-text" style={{
                    backgroundColor: '#f0f7ff',
                    padding: '1.5rem',
                    borderRadius: '8px',
                    marginBottom: '2rem',
                    borderLeft: '4px solid #28a745'
                  }}>
                    <h4 style={{ marginTop: 0, marginBottom: '1rem', color: '#2c3e50' }}>
                      {language === 'es' ? 'Recomendación Personalizada' : 'Personalized Recommendation'}
                    </h4>
                    {standardQuestionnaireContext.split('\n').map((paragraph, index) => (
                      paragraph.trim() && <p key={index} style={{ marginBottom: '0.75rem' }}>{paragraph}</p>
                    ))}
                  </div>
                  <StandardQuestionnaires
                    ref={standardQuestionnairesRef}
                    clientEmail={formData.client_email}
                    clientName={formData.client_name}
                    issue={formData.issue}
                    professionalId={formData.professional_id}
                    appUserId={currentUser?.id}
                    currentUser={currentUser || undefined}
                    recommendedIds={recommendedStdIds}
                    onStateChange={() => setSqState(n => n + 1)}
                  />
                </>
              )}
            </div>
            <div className="specialty-explanation-modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="specialty-modal-ok-button"
                onClick={() => setShowStandardQuestionnaires(false)}
              >
                {t('close') || 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {profPopup && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setProfPopup(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
              maxWidth: '520px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              padding: '0',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '1rem',
              padding: '1.5rem',
              borderBottom: '1px solid #eee',
              backgroundColor: '#f8f9fa',
              borderRadius: '12px 12px 0 0',
            }}>
              {profPopup.photo_url && (
                <ExpandableProfessionalPhoto
                  src={profPopup.photo_url}
                  alt={language === 'en' ? profPopup.name_en : profPopup.name_es}
                  style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #e0e0e0' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.2rem', color: '#1a2d4e' }}>
                  {language === 'en' ? profPopup.name_en : profPopup.name_es}
                </h3>
                {(profPopup.Título || profPopup.Clasificación) && (
                  <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.9rem', color: '#546e7a' }}>
                    {[profPopup.Título, profPopup.Clasificación].filter(Boolean).join(' · ')}
                  </p>
                )}
                {profPopup.PrimaryLanguage && (
                  <p style={{ margin: '0', fontSize: '0.85rem', color: '#78909c' }}>
                    <strong>{language === 'es' ? 'Idioma:' : 'Language:'}</strong> {profPopup.PrimaryLanguage}
                    {profPopup.SecondaryLanguages && profPopup.SecondaryLanguages.length > 0 && (
                      <span> · {profPopup.SecondaryLanguages.join(', ')}</span>
                    )}
                  </p>
                )}
              </div>
              <button
                onClick={() => setProfPopup(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: '#666', flexShrink: 0 }}
                aria-label="Close"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {(language === 'en' ? profPopup.bio_en : profPopup.bio_es) && (
                <div>
                  <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#78909c' }}>
                    {language === 'es' ? 'Biografía' : 'Bio'}
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6, color: '#333' }}>
                    {language === 'en' ? profPopup.bio_en : profPopup.bio_es}
                  </p>
                </div>
              )}

              {((language === 'en' ? profPopup.specialties_en : profPopup.specialties_es) || []).length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#78909c' }}>
                    {language === 'es' ? 'Especialidades' : 'Specialties'}
                  </h4>
                  <div className="specialty-tags professional-list-specialties professional-list-specialties--compact">
                    {(language === 'en' ? profPopup.specialties_en : profPopup.specialties_es).map((s, i) => (
                      <span key={i} className="specialty-tag specialty-tag--highlight">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {profPopup.time_zone && (
                  <div style={{ backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#78909c', marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {language === 'es' ? 'Zona Horaria' : 'Time Zone'}
                    </div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{profPopup.time_zone}</div>
                  </div>
                )}
                {profPopup.email && (
                  <div style={{ backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#78909c', marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {language === 'es' ? 'Correo' : 'Email'}
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, wordBreak: 'break-all' }}>{profPopup.email}</div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setShowResumeForPopup(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                {language === 'es' ? 'Currículum' : 'Resume'}
              </button>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setFormData(prev => ({ ...prev, professional_id: profPopup.id }));
                    setAiSuggestedProfessionalIds([]);
                    setProfPopup(null);
                  }}
                  style={{
                    padding: '0.5rem 1.25rem',
                    backgroundColor: '#1976d2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 500,
                  }}
                >
                  {language === 'es' ? 'Seleccionar' : 'Select'}
                </button>
                <button
                  type="button"
                  onClick={() => setProfPopup(null)}
                  style={{
                    padding: '0.5rem 1.25rem',
                    backgroundColor: 'white',
                    color: '#555',
                    border: '1px solid #ccc',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                  }}
                >
                  {t('close') || 'Close'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showResumeForPopup && profPopup && (
        <ProfessionalResumeModal
          professional={profPopup}
          isAdmin={currentUser?.user_type === 'Administrator'}
          onClose={() => {
            setShowResumeForPopup(false);
          }}
        />
      )}

      {rightClickModal && (
        <RightClickInfoModal
          title={rightClickModal.title}
          content={rightClickModal.content}
          loading={rightClickModal.loading}
          onClose={() => setRightClickModal(null)}
          isAdmin={currentUser?.user_type === 'Administrator'}
          onRefreshAndGenerate={handleRefreshAndGenerate}
        />
      )}
    </section>
    </div>
  );
}
