import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import './App.css';
import { trackPageView, GA } from './lib/analytics';

import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { ProfessionProvider, useProfession } from './contexts/ProfessionContext';
import { LanguageToggle } from './components/LanguageToggle';
import { Navigation } from './components/Navigation';
import { ProfessionalList } from './components/ProfessionalList';
import { CalendarView } from './components/CalendarView';
import { ClientRequestForm } from './components/ClientRequestForm';
import { SignInForm } from './components/SignInForm';
import { AdminPanel } from './components/AdminPanel';
import { Modal } from './components/Modal';
import { AboutUs } from './components/AboutUs';
import { Home } from './components/Home';
import { Help } from './components/Help';
import { ResumeSubmissionForm } from './components/ResumeSubmissionForm';
import { PaymentForm } from './components/PaymentForm';
import { AuthStatus } from './components/AuthStatus';
import { StandardQuestionnaires } from './components/StandardQuestionnaires';
import { ProfessionalAppointments } from './components/ProfessionalAppointments';
import { GoogleTokenGenerator } from './components/GoogleTokenGenerator';
import { ZohoTokenGenerator } from './components/ZohoTokenGenerator';
import { UserProfileSetup } from './components/UserProfileSetup';
import { UserRoleManager } from './components/UserRoleModal';
import { ForgotPasswordForm } from './components/ForgotPasswordForm';
import { ResetPasswordForm } from './components/ResetPasswordForm';
import { ErrorBoundary } from './components/ErrorBoundary';
// import { QRCodeModal } from './components/QRCodeModal'; // reserved for payment panel
import { SessionFeedback } from './components/SessionFeedback';
import { ProfessionalManager } from './components/ProfessionalManager';
import { SessionCommentsViewer } from './components/SessionCommentsViewer';
import { CancelSessionPanel } from './components/CancelSessionPanel';
import { MentalmaAnalysisClient } from './components/MentalmaAnalysisClient';
import { SupportTicketPanel } from './components/SupportTicketPanel';
import { CANCEL_SESSION_PREFILL_KEY, CHANGE_SESSION_PREFILL_KEY } from './lib/cancelSessionPolicy';
import { fetchSpecialties, fetchProfessionals, fetchAvailableSlots, fetchCalendarItemsByDate, submitClientRequest, fetchTableRows, updateRow, deleteRow, insertRow, fetchResumes, fetchSessionPrices, createSessionPrice, updateSessionPrice, deleteSessionPrice, fetchUserById, fetchUserByEmail, completeUserProfile, fetchHomeStatCounts } from './lib/api';
import { expireUnpaidPendingRequests, UNPAID_HOLD_MINUTES } from './lib/expireUnpaidRequests';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type {
  AdminTableRow,
  Specialty,
  Professional,
  AvailableSlot,
  CalendarItem,
  ClientRequestFormData,
  User as AppUser,
  UserFormData,
  SessionPrice,
  Resume,
} from './types';

function AppContent() {
  const { t, language } = useLanguage();
  const { activeProfession } = useProfession();
  const getInitialSection = () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reset-password') === 'true') {
      return 'reset-password';
    }
    const scope = urlParams.get('scope') || '';
    const isCalendarScope = scope.includes('calendar') || scope.includes('meetings.space');
    if (urlParams.get('code') && isCalendarScope) {
      return 'google-token';
    }
    const sectionParam = urlParams.get('section');
    if (sectionParam) {
      return sectionParam;
    }
    return 'home';
  };
  const [currentSection, setCurrentSection] = useState(getInitialSection);
  const [previousSection, setPreviousSection] = useState('home');
  const lastSectionRef = useRef(getInitialSection());

  // ── Google Analytics: fire page_view on every section change ─────────────
  useEffect(() => { trackPageView(currentSection); }, [currentSection]);

  // Track prior panel for Back (covers handleNavigation and direct setCurrentSection).
  useLayoutEffect(() => {
    if (lastSectionRef.current !== currentSection) {
      setPreviousSection(lastSectionRef.current);
      lastSectionRef.current = currentSection;
    }
  }, [currentSection]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selectedProfessional, setSelectedProfessional] = useState<string | null>(null);
  const [loadingProfessionals, setLoadingProfessionals] = useState(true);
  const [clientCount, setClientCount] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [averageClientRating, setAverageClientRating] = useState<number | null>(null);
  const [loadingHomeStats, setLoadingHomeStats] = useState(true);
  const [changeSessionRequestId, setChangeSessionRequestId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState({ title: '', message: '', isError: false });
  const [signInModalOpen, setSignInModalOpen] = useState(false);
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
  const [loadingCalendarItems, setLoadingCalendarItems] = useState(false);
  const [calendarSlots, setCalendarSlots] = useState<AvailableSlot[]>([]);
  const [loadingCalendarSlots, setLoadingCalendarSlots] = useState(false);
  const [tableRows, setTableRows] = useState<AdminTableRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [sessionPrices, setSessionPrices] = useState<SessionPrice[]>([]);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserFormData | null>(null);
  const [problemText, setProblemText] = useState('');
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [pendingAuthUser, setPendingAuthUser] = useState<SupabaseUser | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('reset-password') === 'true';
  });
  const [errorToast, setErrorToast] = useState<{ title: string; message: string } | null>(null);
  const [cancelSessionPrefillId, setCancelSessionPrefillId] = useState<string | null>(null);

  const isSignedInRef = useRef(false);
  const currentUserRef = useRef<UserFormData | null>(null);
  const currentSectionRef = useRef('home');
  const isResettingPasswordRef = useRef(false);
  const dismissedProfileSetupRef = useRef(false);
  const authProcessingRef = useRef(false);

  useEffect(() => {
    isSignedInRef.current = isSignedIn;
  }, [isSignedIn]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    currentSectionRef.current = currentSection;
  }, [currentSection]);

  // Inject page-specific background overrides directly into <head> so they
  // always beat the .app gradient and any other CSS regardless of specificity.
  // useLayoutEffect fires before the browser paints, eliminating any white flash.
  useLayoutEffect(() => {
    const id = 'page-bg-override';
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    let css = '';
    if (currentSection === 'client-info') {
      css = `
        body, .app, .main, .client-request-page {
          background-color: #BDD5AC !important;
          background-image: none !important;
        }
        .section, .section--client-request {
          background-color: #BDD5AC !important;
          background-image: none !important;
          box-shadow: none !important;
        }
      `;
    } else if (currentSection === 'payment') {
      css = `
        html, body, .app {
          background: #fff !important;
        }
        .main, .payment-form-container, .section, .section--payment {
          background: #fff !important;
          box-shadow: none !important;
        }
      `;
    } else if (currentSection === 'professionals') {
      css = `
        body, .app, .main {
          background-color: #E7DAC8 !important;
          background-image: none !important;
        }
        .section, .section--professionals, .professional-list-section {
          background-color: #E7DAC8 !important;
          background-image: none !important;
          box-shadow: none !important;
        }
      `;
    }

    if (css) {
      const el = document.createElement('style');
      el.id = id;
      el.textContent = css;
      document.head.appendChild(el);
    }

    return () => {
      document.getElementById(id)?.remove();
    };
  }, [currentSection]);

  useEffect(() => {
    if (currentSection !== 'cancel-session') {
      setCancelSessionPrefillId(null);
      return;
    }
    try {
      const id = sessionStorage.getItem(CANCEL_SESSION_PREFILL_KEY);
      setCancelSessionPrefillId(id);
      if (id) {
        sessionStorage.removeItem(CANCEL_SESSION_PREFILL_KEY);
      }
    } catch {
      setCancelSessionPrefillId(null);
    }
  }, [currentSection]);

  useEffect(() => {
    isResettingPasswordRef.current = isResettingPassword;
  }, [isResettingPassword]);

  const handleGlobalError = useCallback((event: PromiseRejectionEvent) => {
    event.preventDefault();
    const message = event.reason instanceof Error
      ? event.reason.message
      : String(event.reason || 'An unexpected error occurred');
    console.error('Unhandled promise rejection:', event.reason);
    setErrorToast({ title: 'Error', message });
  }, []);

  useEffect(() => {
    window.addEventListener('unhandledrejection', handleGlobalError);
    return () => window.removeEventListener('unhandledrejection', handleGlobalError);
  }, [handleGlobalError]);

  // Re-fetch profession-scoped data whenever the active profession changes
  useEffect(() => {
    loadSpecialties(activeProfession?.id);
    loadProfessionals(activeProfession?.id);
  }, [activeProfession?.id]); // loadSpecialties and loadProfessionals are stable inline functions

  useEffect(() => {
    void loadHomeStats();
  }, []);

  // Release unpaid pending session holds older than 15 minutes (and poll while app is open).
  useEffect(() => {
    void expireUnpaidPendingRequests();
    const id = window.setInterval(() => {
      void expireUnpaidPendingRequests();
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsResettingPassword(true);
        setCurrentSection('reset-password');
        return;
      }

      if (event === 'SIGNED_IN') {
        dismissedProfileSetupRef.current = false;
      }

      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        if (isSignedInRef.current && currentUserRef.current) {
          return;
        }
      }

      if (event === 'SIGNED_OUT') {
        authProcessingRef.current = false;
        if (isSignedInRef.current && currentUserRef.current) {
          (async () => {
            try {
              const { data: { session: refreshedSession } } = await supabase.auth.getSession();
              if (refreshedSession) {
                return;
              }
            } catch {
              // session refresh failed — proceed with sign-out
            }
            if (currentSectionRef.current === 'client-info') {
              return;
            }
            setIsSignedIn(false);
            setCurrentUser(null);
            setShowProfileSetup(false);
            setPendingAuthUser(null);
        const protectedSections = ['admin', 'admin-user-roles', 'google-token', 'zoho-token', 'client-info', 'manage-profile'];
          if (protectedSections.includes(currentSectionRef.current)) {
            setCurrentSection('home');
          }
        })();
        return;
      }
      setIsSignedIn(false);
      setCurrentUser(null);
      setShowProfileSetup(false);
      setPendingAuthUser(null);
      const protectedSections = ['admin', 'admin-user-roles', 'google-token', 'zoho-token', 'client-info', 'manage-profile'];
        if (protectedSections.includes(currentSectionRef.current)) {
          setCurrentSection('home');
        }
        return;
      }

      if (!session?.user) {
        return;
      }

      if (isResettingPasswordRef.current) {
        return;
      }

      (async () => {
        if (authProcessingRef.current) return;
        if (isSignedInRef.current && currentUserRef.current && event !== 'SIGNED_IN') return;
        authProcessingRef.current = true;
        try {
          const provider = session.user.app_metadata?.provider;
          const isGoogleUser = provider === 'google';

          const tryFetchUser = async (): Promise<AppUser | null> => {
            let user = await fetchUserById(session.user.id);
            if (!user && session.user.email) {
              user = await fetchUserByEmail(session.user.email);
            }
            if (!user) {
              const { data } = await supabase
                .from('users')
                .select('*')
                .eq('id', session.user.id)
                .maybeSingle();
              if (data) user = data as AppUser;
            }
            if (!user && session.user.email) {
              const { data } = await supabase
                .from('users')
                .select('*')
                .eq('email', session.user.email)
                .maybeSingle();
              if (data) user = data as AppUser;
            }
            return user;
          };

          const setSignedInUser = (user: AppUser | UserFormData) => {
            setIsSignedIn(true);
            GA.login('email');
            setShowProfileSetup(false);
            setPendingAuthUser(null);
            const userType = getUserType(user);
            setCurrentUser({
              id: user.id || session.user.id,
              username: user.username,
              email: user.email,
              full_name: user.full_name,
              phone: user.phone || '',
              user_type: userType,
            });
          };

          if (isGoogleUser) {
            const googleName = session.user.user_metadata?.full_name
              || session.user.user_metadata?.name
              || session.user.email?.split('@')[0] || '';
            const googleUsername = session.user.user_metadata?.preferred_username
              || session.user.email?.split('@')[0] || '';

            let googleUser = await tryFetchUser();
            if (!googleUser) {
              await new Promise(r => setTimeout(r, 1500));
              googleUser = await tryFetchUser();
            }

            if (googleUser) {
              // When Google OAuth creates a separate identity, the DB trigger may have created
              // a new user with user_type='Client'. If an existing user with the same email
              // has Administrator role, preserve it so the admin panel remains visible.
              let effectiveUser = googleUser;
              const resolvedType = getUserType(googleUser);
              if (resolvedType === 'client' && session.user.email) {
                const emailUser = await fetchUserByEmail(session.user.email);
                if (emailUser && getUserType(emailUser) === 'Administrator') {
                  effectiveUser = { ...googleUser, user_type: 'Administrator' };
                  try {
                    await supabase
                      .from('users')
                      .update({ user_type: 'Administrator' })
                      .eq('id', googleUser.id);
                  } catch {
                    // Non-critical: session will still show correct role
                  }
                }
              }
              setSignedInUser(effectiveUser);
              return;
            }

            try {
              const created = await completeUserProfile({
                id: session.user.id,
                username: googleUsername,
                email: session.user.email || '',
                full_name: googleName,
                phone: '',
                auth_provider: 'google',
              });
              if (created) {
                setSignedInUser(created);
                return;
              }
            } catch (profileError) {
              console.error('Auto-profile creation failed for Google user:', profileError);
            }

            const finalAttempt = await tryFetchUser();
            if (finalAttempt) {
              setSignedInUser(finalAttempt);
              return;
            }

            let fallbackUserType = 'client';
            if (session.user.email) {
              const emailUser = await fetchUserByEmail(session.user.email);
              if (emailUser) {
                fallbackUserType = getUserType(emailUser);
              }
            }

            try {
              const { data: directInsert } = await supabase
                .from('users')
                .upsert({
                  id: session.user.id,
                  username: googleUsername,
                  email: session.user.email || '',
                  full_name: googleName,
                  phone: '',
                  role: 'client',
                  user_type: fallbackUserType,
                  is_active: true,
                  auth_provider: 'google',
                  last_login: new Date().toISOString(),
                }, { onConflict: 'id' })
                .select()
                .maybeSingle();
              if (directInsert) {
                setSignedInUser(directInsert);
                return;
              }
            } catch (directErr) {
              console.error('Direct upsert failed for Google user:', directErr);
            }

            setIsSignedIn(true);
            setShowProfileSetup(false);
            setPendingAuthUser(null);
            setCurrentUser({
              id: session.user.id,
              username: googleUsername,
              email: session.user.email || '',
              full_name: googleName,
              phone: '',
              user_type: fallbackUserType,
            });
            return;
          }

          let user = await tryFetchUser();

          if (!user) {
            await new Promise(r => setTimeout(r, 1500));
            user = await tryFetchUser();
          }

          if (user) {
            setSignedInUser(user);
            return;
          }

          if (!isSignedInRef.current && !dismissedProfileSetupRef.current) {
            setPendingAuthUser(session.user);
            setShowProfileSetup(true);
          }
        } catch (error) {
          console.error('Error during auth state change user lookup:', error);
          if (isSignedInRef.current && currentUserRef.current) {
            authProcessingRef.current = false;
            return;
          }
        } finally {
          authProcessingRef.current = false;
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const getUserType = (user: { user_type?: string; role?: string }): string => {
    if (user.user_type) {
      if (user.user_type === 'Administrator') return 'Administrator';
      if (user.user_type === 'Professional') return 'Professional';
      return 'client';
    }
    if (user.role) {
      if (user.role.toLowerCase() === 'admin' || user.role.toLowerCase() === 'administrator') {
        return 'Administrator';
      }
      if (user.role.toLowerCase() === 'professional' || user.role.toLowerCase() === 'socio') {
        return 'Professional';
      }
    }
    return 'client';
  };

  const handleProfileSetupComplete = async () => {
    setShowProfileSetup(false);
    if (pendingAuthUser) {
      let user = await fetchUserById(pendingAuthUser.id);
      if (!user && pendingAuthUser.email) {
        user = await fetchUserByEmail(pendingAuthUser.email);
      }
      if (user) {
        setIsSignedIn(true);
        const userType = getUserType(user);
        setCurrentUser({
          id: user.id || pendingAuthUser.id,
          username: user.username,
          email: user.email,
          full_name: user.full_name,
          phone: user.phone || '',
          user_type: userType,
        });
        setPendingAuthUser(null);
        if (currentSection !== 'admin') {
          setCurrentSection('home');
        }
      }
    }
  };

  const loadSpecialties = async (professionId?: string) => {
    try {
      const data = await fetchSpecialties(professionId);
      setSpecialties(data);
    } catch (error) {
      console.error('Error loading specialties:', error);
    }
  };

  const loadProfessionals = async (professionId?: string) => {
    try {
      const data = await fetchProfessionals(professionId);
      setProfessionals(data);
    } catch (error) {
      console.error('Error loading professionals:', error);
    } finally {
      setLoadingProfessionals(false);
    }
  };

  const loadHomeStats = async () => {
    setLoadingHomeStats(true);
    try {
      const { clientCount: clients, sessionCount: sessions, averageClientRating: avgRating } =
        await fetchHomeStatCounts();
      setClientCount(clients);
      setSessionCount(sessions);
      setAverageClientRating(avgRating);
    } catch (error) {
      console.error('Error loading home stats:', error);
    } finally {
      setLoadingHomeStats(false);
    }
  };

  const loadCalendarItemsByDate = async (date: string) => {
    setLoadingCalendarItems(true);
    try {
      const data = await fetchCalendarItemsByDate(date);
      setCalendarItems(data);
    } catch (error) {
      console.error('Error loading calendar items:', error);
    } finally {
      setLoadingCalendarItems(false);
    }
  };

  const loadCalendarSlots = async (professionalId: string) => {
    if (!professionalId) {
      setCalendarSlots([]);
      return;
    }
    setLoadingCalendarSlots(true);
    try {
      const data = await fetchAvailableSlots(professionalId);
      setCalendarSlots(data);
    } catch (error) {
      console.error('Error loading calendar slots:', error);
      setCalendarSlots([]);
    } finally {
      setLoadingCalendarSlots(false);
    }
  };

  const handleCalendarProfessionalChange = (professionalId: string) => {
    loadCalendarSlots(professionalId);
  };

  const handleClientRequest = async (formData: ClientRequestFormData) => {
    setSubmitting(true);
    try {
      const created = await submitClientRequest(formData);

      // If a package was requested (num_sessions > 1), propagate to the sessions row
      // matched by TimeSlotId (if the session record already exists at booking time).
      const pkgSize = created?.num_sessions ?? formData.num_sessions ?? 1;
      if (created && pkgSize > 1 && created.TimeSlotId) {
        const { error: sessErr } = await supabase
          .from('sessions')
          .update({ num_sessions: pkgSize, session_no: created.session_no ?? 1 })
          .eq('TimeSlotId', created.TimeSlotId);
        if (sessErr) console.warn('Could not sync num_sessions to sessions table:', sessErr.message);
      }

      setModalMessage({
        title: t('requestSuccess'),
        message:
          (t('requestSuccessMessage') || '') +
          (language === 'es'
            ? ` Tiene ${UNPAID_HOLD_MINUTES} minutos para pagar; si no paga, la solicitud se cancela y el horario se libera.`
            : ` You have ${UNPAID_HOLD_MINUTES} minutes to pay; if unpaid, the request is cancelled and the slot is released.`),
        isError: false,
      });
      setModalOpen(true);
      return created;
    } finally {
      setSubmitting(false);
    }
  };

  const handleUserSubmit = async (formData: UserFormData) => {
    setSubmitting(true);
    try {
      setIsSignedIn(true);
      setCurrentUser(formData);
      setSignInModalOpen(false);

      setModalMessage({
        title: t('signInSuccess') || 'Welcome Back',
        message: t('signInSuccessMessage') || `Welcome back, ${formData.full_name}!`,
        isError: false,
      });
      setModalOpen(true);
    } catch (error) {
      setModalMessage({
        title: t('userError'),
        message: error instanceof Error ? error.message : t('userErrorMessage'),
        isError: true,
      });
      setModalOpen(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      GA.logout();
      await supabase.auth.signOut();
      setIsSignedIn(false);
      setCurrentUser(null);
      setCurrentSection('sign-in');
      setModalMessage({
        title: t('signedOut') || 'Signed Out',
        message: t('signedOutMessage') || 'You have been signed out successfully.',
        isError: false,
      });
      setModalOpen(true);
    } catch (error) {
      console.error('Error signing out:', error);
      setModalMessage({
        title: t('error') || 'Error',
        message: t('signOutError') || 'Failed to sign out. Please try again.',
        isError: true,
      });
      setModalOpen(true);
    }
  };


  const handleFetchRows = async (tableName: string, userFilter?: string) => {
    setLoadingRows(true);
    try {
      const data = await fetchTableRows(tableName, userFilter);
      setTableRows(data);
    } catch (error) {
      console.error('Error fetching rows:', error);
      setTableRows([]);
    } finally {
      setLoadingRows(false);
    }
  };

  const handleUpdateRow = async (tableName: string, rowId: string, data: Record<string, unknown>) => {
    try {
      await updateRow(tableName, rowId, data);

      setModalMessage({
        title: t('updateSuccess'),
        message: t('updateSuccessMessage'),
        isError: false,
      });
      setModalOpen(true);

      handleFetchRows(tableName);
      if (tableName === 'specialties') loadSpecialties(activeProfession?.id);
    } catch (error) {
      console.error('Error updating row:', error);
      setModalMessage({
        title: t('updateError'),
        message: error instanceof Error ? error.message : t('updateErrorMessage'),
        isError: true,
      });
      setModalOpen(true);
    }
  };

  const handleDeleteRow = async (tableName: string, rowId: string) => {
    try {
      await deleteRow(tableName, rowId);

      setModalMessage({
        title: t('rowDeleteSuccess'),
        message: t('rowDeleteSuccessMessage'),
        isError: false,
      });
      setModalOpen(true);

      handleFetchRows(tableName);
      if (tableName === 'specialties') loadSpecialties(activeProfession?.id);
    } catch (error) {
      console.error('Error deleting row:', error);
      setModalMessage({
        title: t('rowDeleteError'),
        message: error instanceof Error ? error.message : t('rowDeleteErrorMessage'),
        isError: true,
      });
      setModalOpen(true);
    }
  };

  const handleInsertRow = async (tableName: string, data: Record<string, unknown>) => {
    console.log('Inserting row into table:', tableName, 'with data:', data);
    try {
      const result = await insertRow(tableName, data);
      console.log('Insert successful:', result);

      setModalMessage({
        title: t('insertSuccess') || 'Record Added',
        message: t('insertSuccessMessage') || 'The record was added successfully.',
        isError: false,
      });
      setModalOpen(true);

      await handleFetchRows(tableName);
      if (tableName === 'specialties') loadSpecialties(activeProfession?.id);
    } catch (error) {
      console.error('Error inserting row:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to add record. Please check the data and try again.';

      setModalMessage({
        title: t('insertError') || 'Insert Failed',
        message: errorMessage,
        isError: true,
      });
      setModalOpen(true);
    }
  };

  const handleFetchResumes = async () => {
    setLoadingRows(true);
    try {
      const data = await fetchResumes();
      setResumes(data);
    } catch (error) {
      console.error('Error fetching resumes:', error);
      setResumes([]);
    } finally {
      setLoadingRows(false);
    }
  };

  const handleDeleteResume = async (id: number) => {
    try {
      await deleteRow('resumes', String(id));

      setModalMessage({
        title: t('success') || 'Success',
        message: t('resumeDeleted') || 'Resume deleted successfully',
        isError: false,
      });
      setModalOpen(true);

      handleFetchResumes();
    } catch (error) {
      console.error('Error deleting resume:', error);
      setModalMessage({
        title: t('error') || 'Error',
        message: error instanceof Error ? error.message : 'Failed to delete resume',
        isError: true,
      });
      setModalOpen(true);
    }
  };

  const handleCreateResume = async (resume: Record<string, unknown>) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/rest/v1/resumes`, {
        method: 'POST',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(resume)
      });

      if (!response.ok) {
        throw new Error('Failed to create resume');
      }

      setModalMessage({
        title: t('success') || 'Success',
        message: t('resumeCreated') || 'Resume created successfully',
        isError: false,
      });
      setModalOpen(true);

      handleFetchResumes();
    } catch (error) {
      console.error('Error creating resume:', error);
      setModalMessage({
        title: t('error') || 'Error',
        message: error instanceof Error ? error.message : 'Failed to create resume',
        isError: true,
      });
      setModalOpen(true);
    }
  };

  const handleUpdateResume = async (id: number, resume: Record<string, unknown>) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/rest/v1/resumes?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(resume)
      });

      if (!response.ok) {
        throw new Error('Failed to update resume');
      }

      setModalMessage({
        title: t('success') || 'Success',
        message: t('resumeUpdated') || 'Resume updated successfully',
        isError: false,
      });
      setModalOpen(true);

      handleFetchResumes();
    } catch (error) {
      console.error('Error updating resume:', error);
      setModalMessage({
        title: t('error') || 'Error',
        message: error instanceof Error ? error.message : 'Failed to update resume',
        isError: true,
      });
      setModalOpen(true);
    }
  };

  const handleFetchSessionPrices = async () => {
    setLoadingRows(true);
    try {
      const data = await fetchSessionPrices();
      setSessionPrices(data);
    } catch (error) {
      console.error('Error fetching session prices:', error);
      setSessionPrices([]);
    } finally {
      setLoadingRows(false);
    }
  };

  const handleCreateSessionPrice = async (price: Omit<SessionPrice, 'id' | 'created_at'>) => {
    try {
      await createSessionPrice(price);
      setModalMessage({
        title: t('success') || 'Success',
        message: t('priceCreated') || 'Session price created successfully',
        isError: false,
      });
      setModalOpen(true);
      handleFetchSessionPrices();
    } catch (error) {
      console.error('Error creating session price:', error);
      setModalMessage({
        title: t('error') || 'Error',
        message: error instanceof Error ? error.message : 'Failed to create session price',
        isError: true,
      });
      setModalOpen(true);
    }
  };

  const handleUpdateSessionPrice = async (id: number, price: Partial<SessionPrice>) => {
    try {
      await updateSessionPrice(id, price);
      setModalMessage({
        title: t('success') || 'Success',
        message: t('priceUpdated') || 'Session price updated successfully',
        isError: false,
      });
      setModalOpen(true);
      handleFetchSessionPrices();
    } catch (error) {
      console.error('Error updating session price:', error);
      setModalMessage({
        title: t('error') || 'Error',
        message: error instanceof Error ? error.message : 'Failed to update session price',
        isError: true,
      });
      setModalOpen(true);
    }
  };

  const handleDeleteSessionPrice = async (id: number) => {
    try {
      await deleteSessionPrice(id);
      setModalMessage({
        title: t('success') || 'Success',
        message: t('priceDeleted') || 'Session price deleted successfully',
        isError: false,
      });
      setModalOpen(true);
      handleFetchSessionPrices();
    } catch (error) {
      console.error('Error deleting session price:', error);
      setModalMessage({
        title: t('error') || 'Error',
        message: error instanceof Error ? error.message : 'Failed to delete session price',
        isError: true,
      });
      setModalOpen(true);
    }
  };

  const handleApproveResume = async (resume: Resume) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const professionalData = {
        name_en: resume.Name,
        name_es: resume.Name,
        bio_en: (resume.ReasonForInterest as string[] | undefined)?.join(', ') || '',
        bio_es: (resume.ReasonForInterest as string[] | undefined)?.join(', ') || '',
        specialties_en: resume['TypeThera;y'] || [],
        specialties_es: resume['TypeThera;y'] || [],
        Specialties: resume['TypeThera;y'] || [],
        photo_url: '',
        is_active: true
      };

      const professionalResponse = await fetch(`${supabaseUrl}/rest/v1/professionals`, {
        method: 'POST',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(professionalData)
      });

      if (!professionalResponse.ok) {
        throw new Error('Failed to create professional');
      }

      const updateResponse = await fetch(`${supabaseUrl}/rest/v1/resumes?id=eq.${resume.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ AppStatus: 'Accepted' })
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update resume status');
      }

      setModalMessage({
        title: t('success') || 'Success',
        message: t('resumeApproved') || `${resume.Name} has been approved and added to professionals list`,
        isError: false,
      });
      setModalOpen(true);

      handleFetchResumes();
      loadProfessionals(activeProfession?.id);
    } catch (error) {
      console.error('Error approving resume:', error);
      setModalMessage({
        title: t('error') || 'Error',
        message: error instanceof Error ? error.message : 'Failed to approve resume',
        isError: true,
      });
      setModalOpen(true);
    }
  };

  const handleNavigation = (section: string) => {
    const userRole = currentUser?.user_type || 'client';

    if ((section === 'admin' || section === 'admin-user-roles') && userRole !== 'Administrator') {
      setModalMessage({
        title: t('error') || 'Access Denied',
        message: 'You do not have permission to access the Admin Panel. Administrator access required.',
        isError: true,
      });
      setModalOpen(true);
      return;
    }


    if (
      (section === 'payment' || section === 'professional-appointments' || section === 'cancel-session') &&
      !currentUser
    ) {
      setSignInModalOpen(true);
      return;
    }

    if (section === 'payment' && userRole === 'Professional') {
      setModalMessage({
        title: t('error') || 'Access Denied',
        message:
          language === 'es'
            ? 'Los profesionales no tienen acceso a la sección de pagos.'
            : 'Professionals do not have access to the payment section.',
        isError: true,
      });
      setModalOpen(true);
      return;
    }

    if (section === 'questionnaires' && userRole === 'Professional') {
      setModalMessage({
        title: t('error') || 'Access Denied',
        message:
          language === 'es'
            ? 'Los cuestionarios estándar no están disponibles en el menú principal para cuentas de profesional.'
            : 'Standard questionnaires are not available from the main menu for professional accounts.',
        isError: true,
      });
      setModalOpen(true);
      return;
    }

    if (section === 'cancel-session' && userRole !== 'client' && userRole !== 'Administrator') {
      setModalMessage({
        title: t('error') || 'Access Denied',
        message:
          language === 'es'
            ? 'Solo clientes y administradores pueden cancelar sesiones desde este panel.'
            : 'Only clients and administrators can cancel sessions from this panel.',
        isError: true,
      });
      setModalOpen(true);
      return;
    }

    if (section === 'sign-in' && isSignedIn) {
      return;
    }

    if (section === currentSection) {
      return;
    }

    setCurrentSection(section);
  };

  const handleGoBack = () => {
    const target = previousSection && previousSection !== currentSection ? previousSection : 'home';
    if (target === currentSection) {
      return;
    }
    setCurrentSection(target);
  };

  const renderContent = () => {
    if (currentSection === 'home') {
      return (
        <Home
          onNavigate={setCurrentSection}
          onShowSignIn={() => setSignInModalOpen(true)}
          isSignedIn={!!currentUser}
          currentUser={currentUser}
          professionalCount={professionals.length}
          loadingProfessionals={loadingProfessionals}
          clientCount={clientCount}
          sessionCount={sessionCount}
          averageClientRating={averageClientRating}
          loadingHomeStats={loadingHomeStats}
        />
      );
    }

    if (currentSection === 'about') {
      return <AboutUs />;
    }

    if (currentSection === 'help') {
      return <Help />;
    }

    if (currentSection === 'forgot-password') {
      return (
        <ForgotPasswordForm
          onBackToSignIn={() => setCurrentSection('sign-in')}
        />
      );
    }

    if (currentSection === 'reset-password') {
      return (
        <ResetPasswordForm
          onComplete={() => {
            setIsResettingPassword(false);
            window.history.replaceState({}, '', window.location.pathname);
            setCurrentSection('home');
          }}
          onBackToSignIn={() => {
            setIsResettingPassword(false);
            window.history.replaceState({}, '', window.location.pathname);
            setCurrentSection('sign-in');
          }}
        />
      );
    }

    if (currentSection === 'sign-in') {
      if (!isSignedIn) {
        return (
          <SignInForm
            onSubmit={handleUserSubmit}
            loading={submitting}
            onCancel={handleGoBack}
            onNavigate={setCurrentSection}
            currentUser={currentUser}
            onForgotPassword={() => setCurrentSection('forgot-password')}
          />
        );
      } else {
        return (
          <Home
            onNavigate={setCurrentSection}
            onShowSignIn={() => setSignInModalOpen(true)}
            isSignedIn={!!currentUser}
            currentUser={currentUser}
          />
        );
      }
    }

    if (currentSection === 'payment') {
      if (!isSignedIn || !currentUser) {
        return (
          <section className="section section--payment">
            <h2>{t('payment')}</h2>
            <p style={{ color: '#555', lineHeight: 1.6, marginBottom: '1.25rem' }}>
              {language === 'es'
                ? 'Inicie sesión para ver y registrar pagos.'
                : 'Sign in to view and record payments.'}
            </p>
            <button
              type="button"
              className="submit-button"
              onClick={() => setSignInModalOpen(true)}
            >
              {t('signInRegister')}
            </button>
          </section>
        );
      }
      if (currentUser.user_type === 'Professional') {
        return (
          <section className="section section--payment">
            <h2>{t('error') || 'Access Denied'}</h2>
            <p style={{ color: '#555', lineHeight: 1.6, marginBottom: '1.25rem' }}>
              {language === 'es'
                ? 'Los profesionales no tienen acceso a la sección de pagos.'
                : 'Professionals do not have access to the payment section.'}
            </p>
            <button
              type="button"
              className="submit-button"
              onClick={() => setCurrentSection('home')}
            >
              {t('home')}
            </button>
          </section>
        );
      }
      return (
        <PaymentForm
          currentUser={currentUser}
          onSignIn={handleUserSubmit}
        />
      );
    }

    if (currentSection === 'admin') {
      if (!isSignedIn) {
        return (
          <SignInForm
            onSubmit={handleUserSubmit}
            loading={submitting}
            onCancel={handleGoBack}
            onNavigate={setCurrentSection}
            currentUser={currentUser}
            onForgotPassword={() => setCurrentSection('forgot-password')}
          />
        );
      }

      // Admin role check is done in handleNavigation before navigating here.
      // Once the admin panel is shown, no further role checking is performed.
      return (
        <AdminPanel
          onFetchRows={handleFetchRows}
          onUpdateRow={handleUpdateRow}
          onDeleteRow={handleDeleteRow}
          onInsertRow={handleInsertRow}
          rows={tableRows}
          loadingRows={loadingRows}
          resumes={resumes}
          onFetchResumes={handleFetchResumes}
          onDeleteResume={handleDeleteResume}
          onCreateResume={handleCreateResume}
          onUpdateResume={handleUpdateResume}
          onApproveResume={handleApproveResume}
          sessionPrices={sessionPrices}
          onFetchSessionPrices={handleFetchSessionPrices}
          onCreateSessionPrice={handleCreateSessionPrice}
          onUpdateSessionPrice={handleUpdateSessionPrice}
          onDeleteSessionPrice={handleDeleteSessionPrice}
          initialTab="data-browser"
          onProfessionalsSaved={() => loadProfessionals(activeProfession?.id)}
        />
      );
    }

    if (currentSection === 'admin-user-roles') {
      if (!isSignedIn) {
        return (
          <SignInForm
            onSubmit={handleUserSubmit}
            loading={submitting}
            onCancel={handleGoBack}
            onNavigate={setCurrentSection}
            currentUser={currentUser}
            onForgotPassword={() => setCurrentSection('forgot-password')}
          />
        );
      }

      const userRole = currentUser?.user_type || 'client';
      if (userRole !== 'Administrator') {
        return (
          <Home
            onNavigate={setCurrentSection}
            onShowSignIn={() => setSignInModalOpen(true)}
            isSignedIn={!!currentUser}
            currentUser={currentUser}
          />
        );
      }

      return (
        <section className="section">
          <UserRoleManager />
        </section>
      );
    }

    if (currentSection === 'google-token') {
      const gtUrlParams = new URLSearchParams(window.location.search);
      const gtScope = gtUrlParams.get('scope') || '';
      const hasOAuthCode = !!gtUrlParams.get('code') && (gtScope.includes('calendar') || gtScope.includes('meetings.space'));

      if (!isSignedIn && !hasOAuthCode) {
        return (
          <SignInForm
            onSubmit={handleUserSubmit}
            loading={submitting}
            onCancel={handleGoBack}
            onNavigate={setCurrentSection}
            currentUser={currentUser}
            onForgotPassword={() => setCurrentSection('forgot-password')}
          />
        );
      }

      const userRole = currentUser?.user_type || 'client';
      if (!hasOAuthCode && userRole !== 'Administrator') {
        return (
          <Home
            onNavigate={setCurrentSection}
            onShowSignIn={() => setSignInModalOpen(true)}
            isSignedIn={!!currentUser}
          />
        );
      }

      return <GoogleTokenGenerator onClose={() => setCurrentSection('admin')} />;
    }

    if (currentSection === 'zoho-token') {
      if (!isSignedIn) {
        return (
          <SignInForm
            onSubmit={handleUserSubmit}
            loading={submitting}
            onCancel={handleGoBack}
            onNavigate={setCurrentSection}
            currentUser={currentUser}
            onForgotPassword={() => setCurrentSection('forgot-password')}
          />
        );
      }

      const userRole = currentUser?.user_type || 'client';
      if (userRole !== 'Administrator') {
        return (
          <Home
            onNavigate={setCurrentSection}
            onShowSignIn={() => setSignInModalOpen(true)}
            isSignedIn={!!currentUser}
          />
        );
      }

      return <ZohoTokenGenerator onClose={() => setCurrentSection('admin')} />;
    }

    if (currentSection === 'client-info') {
      if (!isSignedIn) {
        return (
          <SignInForm
            onSubmit={handleUserSubmit}
            loading={submitting}
            onCancel={handleGoBack}
            onNavigate={setCurrentSection}
            currentUser={currentUser}
            onForgotPassword={() => setCurrentSection('forgot-password')}
          />
        );
      }

      return (
        <ClientRequestForm
          specialties={specialties}
          professionals={professionals}
          onSubmit={handleClientRequest}
          loading={submitting}
          initialIssue={problemText}
          currentUser={currentUser}
          onNavigate={setCurrentSection}
          changeSessionRequestId={changeSessionRequestId}
          onChangeSessionConsumed={() => setChangeSessionRequestId(null)}
        />
      );
    }

    if (currentSection === 'calendar') {
      return (
        <CalendarView
          items={calendarItems}
          professionals={professionals}
          availableSlots={calendarSlots}
          onDateChange={loadCalendarItemsByDate}
          onProfessionalChange={handleCalendarProfessionalChange}
          loading={loadingCalendarItems}
          loadingSlots={loadingCalendarSlots}
        />
      );
    }

    if (currentSection === 'submit-resume') {
      return (
        <ResumeSubmissionForm
          onSubmit={handleCreateResume}
          loading={submitting}
          currentUser={currentUser}
        />
      );
    }

    if (currentSection === 'questionnaires') {
      if (!currentUser) {
        return (
          <section className="section">
            <h2>{language === 'es' ? 'Acceso Restringido' : 'Access Restricted'}</h2>
            <p style={{ marginBottom: '1rem', color: '#666', lineHeight: '1.6' }}>
              {language === 'es'
                ? 'Debe iniciar sesión para acceder a los cuestionarios psicológicos estándar.'
                : 'You must sign in to access standard psychological questionnaires.'}
            </p>
            <button
              onClick={() => setCurrentSection('home')}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#6c63ff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              {language === 'es' ? 'Ir a Inicio' : 'Go to Home'}
            </button>
          </section>
        );
      }
      if (currentUser.user_type === 'Professional') {
        return (
          <section className="section">
            <h2>{language === 'es' ? 'Acceso Restringido' : 'Access Restricted'}</h2>
            <p style={{ marginBottom: '1rem', color: '#666', lineHeight: '1.6' }}>
              {language === 'es'
                ? 'Los cuestionarios estándar no están disponibles en el menú principal para cuentas de profesional.'
                : 'Standard questionnaires are not available from the main menu for professional accounts.'}
            </p>
            <button
              type="button"
              onClick={() => setCurrentSection('home')}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#6c63ff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              {language === 'es' ? 'Ir a Inicio' : 'Go to Home'}
            </button>
          </section>
        );
      }
      return (
        <StandardQuestionnaires
          currentUser={currentUser}
          appUserId={currentUser.id}
          clientEmail={currentUser.email}
          clientName={currentUser.full_name}
        />
      );
    }

    if (currentSection === 'professional-appointments') {
      if (!isSignedIn) {
        return (
          <SignInForm
            onSubmit={handleUserSubmit}
            loading={submitting}
            onCancel={handleGoBack}
            onNavigate={setCurrentSection}
            currentUser={currentUser}
            onForgotPassword={() => setCurrentSection('forgot-password')}
          />
        );
      }

      return (
        <ProfessionalAppointments
          currentUser={currentUser}
          onNavigate={setCurrentSection}
          onChangeSession={(requestId) => {
            setChangeSessionRequestId(requestId);
            try {
              sessionStorage.setItem(CHANGE_SESSION_PREFILL_KEY, requestId);
            } catch {
              // sessionStorage may be unavailable
            }
            setCurrentSection('client-info');
          }}
        />
      );
    }

    if (currentSection === 'review-session-data') {
      if (!isSignedIn) {
        return (
          <SignInForm
            onSubmit={handleUserSubmit}
            loading={submitting}
            onCancel={handleGoBack}
            onNavigate={setCurrentSection}
            currentUser={currentUser}
            onForgotPassword={() => setCurrentSection('forgot-password')}
          />
        );
      }

      return (
        <ProfessionalAppointments currentUser={currentUser} reviewMode />
      );
    }

    if (currentSection === 'manage-profile') {
      if (!isSignedIn) {
        return (
          <SignInForm
            onSubmit={handleUserSubmit}
            loading={submitting}
            onCancel={handleGoBack}
            onNavigate={setCurrentSection}
            currentUser={currentUser}
            onForgotPassword={() => setCurrentSection('forgot-password')}
          />
        );
      }
      const userRole = currentUser?.user_type || 'client';
      const isMgmtAdmin = userRole === 'Administrator';
      if (userRole !== 'Professional' && userRole !== 'Administrator') {
        return (
          <Home
            onNavigate={setCurrentSection}
            onShowSignIn={() => setSignInModalOpen(true)}
            isSignedIn={!!currentUser}
            currentUser={currentUser}
          />
        );
      }
      return (
        <section className="section">
          <ProfessionalManager
            currentUser={currentUser}
            isAdmin={isMgmtAdmin}
            onSuccess={() => loadProfessionals(activeProfession?.id)}
          />
        </section>
      );
    }

    if (currentSection === 'session-feedback') {
      if (!isSignedIn) {
        return (
          <SignInForm
            onSubmit={handleUserSubmit}
            loading={submitting}
            onCancel={handleGoBack}
            onNavigate={setCurrentSection}
            currentUser={currentUser}
            onForgotPassword={() => setCurrentSection('forgot-password')}
          />
        );
      }
      return <SessionFeedback currentUser={currentUser} onClose={() => setCurrentSection('home')} />;
    }

    if (currentSection === 'session-comments') {
      if (!isSignedIn) {
        return (
          <SignInForm
            onSubmit={handleUserSubmit}
            loading={submitting}
            onCancel={handleGoBack}
            onNavigate={setCurrentSection}
            currentUser={currentUser}
            onForgotPassword={() => setCurrentSection('forgot-password')}
          />
        );
      }
      return <SessionCommentsViewer currentUser={currentUser} onClose={() => setCurrentSection('home')} />;
    }

    if (currentSection === 'cancel-session') {
      if (!isSignedIn) {
        return (
          <SignInForm
            onSubmit={handleUserSubmit}
            loading={submitting}
            onCancel={handleGoBack}
            onNavigate={setCurrentSection}
            currentUser={currentUser}
            onForgotPassword={() => setCurrentSection('forgot-password')}
          />
        );
      }

      return (
        <CancelSessionPanel
          currentUser={currentUser}
          initialRequestId={cancelSessionPrefillId}
          onClose={() => setCurrentSection('home')}
        />
      );
    }

    if (currentSection.startsWith('issue-')) {
      const issueId = currentSection.replace('issue-', '');
      return (
        <section className="section">
          <h2>{t('yourIssues')}</h2>
          <p>Information about {issueId} coming soon.</p>
        </section>
      );
    }

    if (currentSection === 'mentalma-analysis') {
      return <MentalmaAnalysisClient currentUser={currentUser} />;
    }

    if (currentSection === 'support-tickets') {
      return <SupportTicketPanel currentUser={currentUser} />;
    }

    return (
      <section className="section section--professionals">
        <h2>{language === 'es' ? 'Lista de Profesionales' : 'Professionals List'}</h2>
        {loadingProfessionals ? (
          <div className="loading-container">{t('loading')}</div>
        ) : (
          <ProfessionalList
            professionals={professionals}
            selectedId={selectedProfessional}
            onSelect={setSelectedProfessional}
            problemText={problemText}
            onProblemTextChange={setProblemText}
            isAdmin={currentUser?.user_type === 'Administrator'}
            currentUser={currentUser}
            onNavigate={setCurrentSection}
          />
        )}
      </section>
    );
  };

  const isClientRequestPage = currentSection === 'client-info';
  const isPaymentPage = currentSection === 'payment';
  const isProfessionalsPage = currentSection === 'professionals';
  const pageStyle = isClientRequestPage
    ? { backgroundColor: '#BDD5AC', backgroundImage: 'none' }
    : isProfessionalsPage
      ? { backgroundColor: '#E7DAC8', backgroundImage: 'none' }
      : undefined;

  return (
    <div
      className={`app${isClientRequestPage ? ' client-info-page' : ''}${isPaymentPage ? ' payment-page' : ''}${isProfessionalsPage ? ' professionals-page' : ''}`}
      data-section={currentSection}
      style={pageStyle}
    >
      <header className="header">
        <div className="header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img
              src="/logo.png"
              alt="Logo"
              style={{ height: '52px', width: 'auto', objectFit: 'contain', flexShrink: 0 }}
            />
          </div>

          <div className="header-actions">
            <div className="header-actions-start">
              <LanguageToggle />
            </div>
            <div className="header-actions-end">
              <AuthStatus
                isSignedIn={isSignedIn}
                currentUser={currentUser}
                onSignOut={handleSignOut}
                onShowSignIn={() => setSignInModalOpen(true)}
                onUserUpdated={(user) => setCurrentUser(user)}
              />
              <button
                type="button"
                className="header-back-button"
                onClick={handleGoBack}
                disabled={previousSection === currentSection && currentSection === 'home'}
                aria-label={language === 'es' ? 'Volver al panel anterior' : 'Go back to previous panel'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                {language === 'es' ? 'Atrás' : 'Back'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <Navigation
        onNavigate={handleNavigation}
        currentSection={currentSection}
        currentUser={currentUser}
      />

      <main
        className={`main${currentSection === 'home' ? ' main--virtual-office' : ''}`}
        style={pageStyle}
      >
        <ErrorBoundary>
          {renderContent()}
        </ErrorBoundary>
      </main>

      <Modal isOpen={modalOpen} onClose={() => {
        setModalOpen(false);
      }}>
        <div className={`modal-message ${modalMessage.isError ? 'error' : 'success'}`}>
          <h2>{modalMessage.title}</h2>
          <p>{modalMessage.message}</p>
          <button onClick={() => {
            setModalOpen(false);
          }} className="modal-button">
            {t('close')}
          </button>
        </div>
      </Modal>

      <Modal isOpen={signInModalOpen} onClose={() => setSignInModalOpen(false)}>
        <div style={{ maxWidth: '500px' }}>
          <SignInForm
            onSubmit={async (formData) => {
              await handleUserSubmit(formData);
              setSignInModalOpen(false);
            }}
            loading={submitting}
            onCancel={() => setSignInModalOpen(false)}
            onNavigate={(section) => {
              setSignInModalOpen(false);
              setCurrentSection(section);
            }}
            onForgotPassword={() => {
              setSignInModalOpen(false);
              setCurrentSection('forgot-password');
            }}
          />
        </div>
      </Modal>

      {showProfileSetup && pendingAuthUser && pendingAuthUser.app_metadata?.provider !== 'google' && (
        <UserProfileSetup
          userId={pendingAuthUser.id}
          userEmail={pendingAuthUser.email || ''}
          userName={pendingAuthUser.user_metadata?.full_name || pendingAuthUser.user_metadata?.name || ''}
          onComplete={handleProfileSetupComplete}
          onCancel={() => {
            dismissedProfileSetupRef.current = true;
            setShowProfileSetup(false);
            setPendingAuthUser(null);
            setIsSignedIn(false);
            setCurrentUser(null);
          }}
        />
      )}

      {errorToast && (
        <div className="error-toast-overlay" onClick={() => setErrorToast(null)}>
          <div className="error-toast-popup" onClick={(e) => e.stopPropagation()}>
            <div className="error-toast-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 className="error-toast-title">{errorToast.title}</h3>
            <p className="error-toast-message">{errorToast.message}</p>
            <button className="error-toast-button" onClick={() => setErrorToast(null)}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  if (!isSupabaseConfigured) {
    return (
      <div
        style={{
          maxWidth: '40rem',
          margin: '4rem auto',
          padding: '0 1.5rem',
          fontFamily: 'system-ui, sans-serif',
          color: '#1f2937',
          lineHeight: 1.5,
        }}
      >
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>Mentalma cannot start</h1>
        <p>
          This deploy is missing the Supabase environment variables that Vite bakes in at build time.
          Local works because they are in <code>.env</code>; a renamed or new Netlify site does not copy them automatically.
        </p>
        <p>In Netlify go to <strong>Site configuration → Environment variables</strong> and add:</p>
        <ul>
          <li><code>VITE_SUPABASE_URL</code></li>
          <li><code>VITE_SUPABASE_ANON_KEY</code></li>
        </ul>
        <p>
          Then use <strong>Deploys → Trigger deploy → Clear cache and deploy site</strong>.
          Changing variables after a build is not enough; they must be present during <code>npm run build</code>.
        </p>
      </div>
    );
  }

  return (
    <LanguageProvider>
      <ProfessionProvider>
        <AppContent />
      </ProfessionProvider>
    </LanguageProvider>
  );
}

export default App;
