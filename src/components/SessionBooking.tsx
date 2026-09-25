import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useProfession } from '../contexts/ProfessionContext';
import { SessionManagement } from './SessionManagement';
import { TimezoneSelector, detectUserTimezone } from './TimezoneSelector';
import { fetchAvailableSlotsByDay, fetchProfessionals } from '../lib/api';
import { normalizeTimezone, convertTime as sharedConvertTime } from '../lib/timezone';
import { supabase } from '../lib/supabaseClient';
import type { ClientRequest, Professional, AvailableSlot, PaymentTransaction, UserFormData } from '../types';

interface TimeSlotOption {
  value: string;
  slotId: string;
  professionalTime: string;
  clientTime: string;
}

interface SessionBookingProps {
  currentUser: UserFormData | null;
  clientRequests: ClientRequest[];
  onFetchClientRequests: () => void;
  loading: boolean;
  onBookSession: (data: {
    client_email: string;
    meeting_date: string;
    client_request_id: string;
    use_google_meet: boolean;
    client_name?: string;
    full_name?: string;
    username?: string;
    user_id?: string;
    meeting_platform?: 'google' | 'zoom';
    TimeSlotId?: string;
  }) => Promise<void> | void;
  bookingInProgress: boolean;
}

export function SessionBooking({
  currentUser,
  clientRequests,
  onFetchClientRequests,
  loading,
  onBookSession,
  bookingInProgress,
}: SessionBookingProps) {

  const { t, language } = useLanguage();
  const { activeProfession } = useProfession();
  const userRole = currentUser?.user_type || 'client';
  const isProfessionalUser = userRole === 'Professional';
  const [selectedRequest, setSelectedRequest] = useState<ClientRequest | null>(null);
  const [meetingDate, setMeetingDate] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [meetingPlatform, setMeetingPlatform] = useState<'google' | 'zoom'>('google');
  const [scheduleMeeting, setScheduleMeeting] = useState(true);
  const [showSessionManagement, setShowSessionManagement] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null);
  const [timezone, setTimezone] = useState(detectUserTimezone());
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<string>('');
  const [shouldAutoSelectTime, setShouldAutoSelectTime] = useState(false);
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransaction[]>([]);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [myProfessionalId, setMyProfessionalId] = useState<string | null>(null);
  const [loadingMyProfessionalId, setLoadingMyProfessionalId] = useState(false);

  useEffect(() => {
    if (!isProfessionalUser) return;
    if (!currentUser?.id && !currentUser?.email) return;

    const loadProfessionalId = async () => {
      setLoadingMyProfessionalId(true);
      try {
        // Match ProfessionalAppointments: user_id first (stable if email changes),
        // then case-insensitive email — RLS may hide inactive rows unless own-row policy applies.
        if (currentUser.id) {
          const { data: byUid, error: uidErr } = await supabase
            .from('professionals')
            .select('id')
            .eq('user_id', currentUser.id)
            .maybeSingle();

          if (uidErr) {
            console.error('Error fetching professional by user_id:', uidErr);
          } else if (byUid?.id) {
            setMyProfessionalId(byUid.id);
            return;
          }
        }

        const email = currentUser.email?.trim();
        if (email) {
          const { data: byEmail, error: emailErr } = await supabase
            .from('professionals')
            .select('id')
            .ilike('email', email)
            .maybeSingle();

          if (emailErr) {
            console.error('Error fetching professional by email:', emailErr);
            setMyProfessionalId(null);
            return;
          }

          setMyProfessionalId(byEmail?.id || null);
          return;
        }

        setMyProfessionalId(null);
      } catch (err) {
        console.error('Unexpected error fetching professional:', err);
        setMyProfessionalId(null);
      } finally {
        setLoadingMyProfessionalId(false);
      }
    };

    loadProfessionalId();
  }, [currentUser?.id, currentUser?.email, isProfessionalUser]);

  const convertTime = (timeStr: string, fromTz: string, toTz: string): string => {
    const refDate = selectedDate || new Date().toISOString().split('T')[0];
    return sharedConvertTime(timeStr, fromTz, toTz, refDate);
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

  const generateTimeSlotOptions = (): TimeSlotOption[] => {
    try {
      const professionalTz = normalizeTimezone(selectedProfessional?.time_zone);
      const clientTz = timezone;

      if (availableSlots.length === 0) {
        return [];
      }

      const times: TimeSlotOption[] = [];
      const addedTimes = new Set<string>();

      availableSlots.forEach(slot => {
        if (!slot.id || !slot.start_time || !slot.end_time) {
          return;
        }

        // Normalize stored times so we support:
        // - "HH:MM"
        // - "HH:MM-05"
        // - full ISO strings like "2025-03-15T09:00:00-05:00"
        const baseStart = slot.start_time.includes('T')
          ? (slot.start_time.split('T')[1] || slot.start_time)
          : slot.start_time;
        const baseEnd = slot.end_time.includes('T')
          ? (slot.end_time.split('T')[1] || slot.end_time)
          : slot.end_time;

        const cleanStartTime = baseStart.replace(/[+-]\d{2}$/, '');
        const cleanEndTime = baseEnd.replace(/[+-]\d{2}$/, '');

        const startParts = cleanStartTime.split(':');
        const endParts = cleanEndTime.split(':');

        let startHour = parseInt(startParts[0], 10);
        const startMinute = parseInt(startParts[1], 10);
        const endHour = parseInt(endParts[0], 10);
        const endMinute = parseInt(endParts[1], 10);

        if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute)) {
          return;
        }

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
            const clientTime = convertTime(timeStr, professionalTz, clientTz);
            times.push({
              value: `${selectedDate}T${timeStr}`,
              slotId: slot.id,
              professionalTime: timeStr,
              clientTime,
            });
          }

          currentMinute += 30;
          if (currentMinute >= 60) {
            currentMinute = 0;
            currentHour++;
          }
        }
      });

      times.sort((a, b) => a.professionalTime.localeCompare(b.professionalTime));
      return times;
    } catch {
      return [];
    }
  };

  const activeProfessionalIds = new Set(professionals.map(p => p.id));

  const pendingRequests = clientRequests
    .filter(req => req.status === 'pending' && req.professional_id)
    .filter(req => {
      if (isProfessionalUser) {
        if (loadingMyProfessionalId) return false;
        return myProfessionalId ? req.professional_id === myProfessionalId : false;
      }

      return activeProfessionalIds.has(req.professional_id);
    })
    .sort((a, b) => {
      const dateTimeA = new Date(`${a.preferred_date}T${a.preferred_time || '00:00:00'}`).getTime();
      const dateTimeB = new Date(`${b.preferred_date}T${b.preferred_time || '00:00:00'}`).getTime();
      return dateTimeA - dateTimeB;
    });

  useEffect(() => {
    onFetchClientRequests();
    loadProfessionals(activeProfession?.id);
  }, [activeProfession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedRequest && selectedDate) {
      loadAvailableSlots();
    } else {
      setAvailableSlots([]);
    }
  }, [selectedRequest, selectedDate]);

  useEffect(() => {
    if (selectedRequest) {
      fetchPaymentForRequest(selectedRequest);
    } else {
      setPaymentTransactions([]);
    }
  }, [selectedRequest?.id]);

  useEffect(() => {
    if (!shouldAutoSelectTime || availableSlots.length === 0 || !selectedRequest?.preferred_time || !selectedDate || !selectedProfessional) {
      return;
    }

    try {
      // Reuse the same slot generation logic used by the rendered list
      // so auto-selection matches what the user sees.
      const times = generateTimeSlotOptions();

      if (times.length === 0) {
        setShouldAutoSelectTime(false);
        return;
      }

      const preferredTimeStr = normalizeTimeForSlot(selectedRequest.preferred_time);
      if (!preferredTimeStr) {
        setShouldAutoSelectTime(false);
        return;
      }

      const [prefHours, prefMinutes] = preferredTimeStr.split(':').map(Number);
      if (isNaN(prefHours) || isNaN(prefMinutes)) {
        setShouldAutoSelectTime(false);
        return;
      }

      const exactMatch = times.find(slot => normalizeTimeForSlot(slot.professionalTime) === preferredTimeStr);

      if (exactMatch) {
        setMeetingDate(exactMatch.value);
        setSelectedTimeSlotId(exactMatch.slotId);
        setShouldAutoSelectTime(false);
      } else {
        const preferredMinutes = prefHours * 60 + prefMinutes;
        let closestSlot = times[0];
        let closestDiff = Infinity;

        for (const slot of times) {
          const [slotHours, slotMinutes] = slot.professionalTime.split(':').map(Number);
          const slotTotalMinutes = slotHours * 60 + slotMinutes;
          const diff = Math.abs(slotTotalMinutes - preferredMinutes);

          if (diff < closestDiff) {
            closestDiff = diff;
            closestSlot = slot;
          }
        }

        setMeetingDate(closestSlot.value);
        setSelectedTimeSlotId(closestSlot.slotId);
        setShouldAutoSelectTime(false);
      }
    } catch {
      setShouldAutoSelectTime(false);
    }
  }, [shouldAutoSelectTime, availableSlots, selectedRequest?.preferred_time, selectedDate, selectedProfessional, timezone]);

  const loadProfessionals = async (professionId?: string) => {
    try {
      const data = await fetchProfessionals(professionId);
      setProfessionals(data);
    } catch (error) {
      console.error('Error loading professionals:', error);
    }
  };

  const fetchPaymentForRequest = async (request: ClientRequest) => {
    if (!request.id) {
      setPaymentTransactions([]);
      return;
    }
    setCheckingPayment(true);
    try {
      const { data, error } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('client_request_id', request.id)
        .order('payment_date', { ascending: false });

      if (error) throw error;
      setPaymentTransactions(data || []);
    } catch (err) {
      console.error('Error fetching payment for request:', err);
      setPaymentTransactions([]);
    } finally {
      setCheckingPayment(false);
    }
  };

  const getPaymentStatus = (): { isFullyPaid: boolean; completedAmount: number; requiredAmount: number; hasCompleted: boolean } => {
    const requiredAmount = selectedRequest?.price_amount ? parseFloat(selectedRequest.price_amount) : 0;
    const completedTransactions = paymentTransactions.filter(t => t.payment_status === 'Completed');
    const completedAmount = completedTransactions.reduce((sum, t) => sum + (t.payment_amount || 0), 0);
    const isFullyPaid = requiredAmount > 0 ? completedAmount >= requiredAmount : completedTransactions.length > 0;
    return { isFullyPaid, completedAmount, requiredAmount, hasCompleted: completedTransactions.length > 0 };
  };

  const loadAvailableSlots = async () => {
    // Mirror ClientRequestForm behaviour: use the currently selected professional
    // (falling back to the professional assigned on the request).
    const professionalId = selectedProfessional?.id || selectedRequest?.professional_id;
    if (!professionalId || !selectedDate) {
      return;
    }

    setLoadingSlots(true);
    try {
      const date = new Date(selectedDate);
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayOfWeek = dayNames[date.getDay()];

      const slots = await fetchAvailableSlotsByDay(professionalId, dayOfWeek);
      setAvailableSlots(slots);

      if (selectedRequest?.preferred_time && slots.length > 0) {
        setShouldAutoSelectTime(true);
      }
    } catch (error) {
      alert(`Error loading time slots: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleSelectRequest = (request: ClientRequest) => {
    try {
      setPaymentTransactions([]);
      setSelectedRequest(request);
      const professional = professionals.find(p => p.id === request.professional_id);
      setSelectedProfessional(professional || null);
      // Use the client's stored timezone on the request (fallback handled by normalizeTimezone).
      setTimezone(normalizeTimezone(request.time_zone));

      if (request.scheduled_datetime) {
        const dt = new Date(request.scheduled_datetime);
        const profTz = normalizeTimezone(professional?.time_zone);

        const formatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: profTz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        const parts = formatter.formatToParts(dt);
        const year = parts.find(p => p.type === 'year')?.value || '';
        const month = parts.find(p => p.type === 'month')?.value || '';
        const day = parts.find(p => p.type === 'day')?.value || '';
        const hour = parts.find(p => p.type === 'hour')?.value || '';
        const minute = parts.find(p => p.type === 'minute')?.value || '';

        const localDate = `${year}-${month}-${day}`;
        const localTime = `${hour}:${minute}`;
        const formattedDateTime = `${localDate}T${localTime}`;

        setSelectedDate(localDate);
        setMeetingDate(formattedDateTime);

        if (request.TimeSlotId) {
          setSelectedTimeSlotId(request.TimeSlotId);
        }
      } else if (request.preferred_date) {
        const dateOnly = request.preferred_date.split('T')[0];
        setSelectedDate(dateOnly);
        setMeetingDate('');
        setSelectedTimeSlotId('');

        if (request.preferred_time) {
          setShouldAutoSelectTime(true);
        }
      } else {
        setSelectedDate('');
        setMeetingDate('');
      }
    } catch (error) {
      alert(`Error loading request details: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setMeetingDate('');
    setSelectedTimeSlotId('');
    if (selectedRequest?.preferred_time) {
      setShouldAutoSelectTime(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRequest) {
      alert('Please select a client request');
      return;
    }

    if (!selectedRequest.id) {
      alert('Error: Client request ID is missing. Please refresh and try again.');
      return;
    }

    if (!meetingDate) {
      alert('Please select a meeting date and time');
      return;
    }

    const { isFullyPaid, completedAmount } = getPaymentStatus();
    if (selectedRequest.price_amount && !isFullyPaid) {
      const msg = language === 'es'
        ? `Advertencia de pago:\n\nEste es solo un aviso por ahora.\n\nMonto requerido: ${selectedRequest.price_amount} ${selectedRequest.price_currency}\nMonto pagado: ${completedAmount.toFixed(2)} ${selectedRequest.price_currency}\n\nEsto será requerido cuando los pagos estén disponibles.`
        : `Payment warning:\n\nThis is a warning only for now.\n\nRequired amount: ${selectedRequest.price_amount} ${selectedRequest.price_currency}\nAmount paid: ${completedAmount.toFixed(2)} ${selectedRequest.price_currency}\n\nThis will be required when payments are available.`;
      alert(msg);
    }

    try {
      await onBookSession({
        client_email: selectedRequest.client_email,
        meeting_date: meetingDate,
        client_request_id: selectedRequest.id,
        use_google_meet: scheduleMeeting,
        client_name: selectedRequest.full_name || selectedRequest.username,
        full_name: selectedRequest.full_name,
        username: selectedRequest.username,
        user_id: selectedRequest.user_id,
        meeting_platform: meetingPlatform,
        TimeSlotId: selectedTimeSlotId,
      });
    } catch {
      // Error is handled in the parent via modal
    }
    setMeetingDate('');
    setSelectedDate('');
    setMeetingPlatform('google');
    setScheduleMeeting(true);
    setSelectedTimeSlotId('');
  };

  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  return (
    <div className="session-booking">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3>{t('bookMeetSession') || 'Book Session with Google Calendar'}</h3>
        <button
          className="manage-sessions-button"
          disabled={isProfessionalUser && (loadingMyProfessionalId || !myProfessionalId)}
          onClick={() => {
            if (isProfessionalUser) {
              if (loadingMyProfessionalId) return;
              if (!myProfessionalId) {
                alert(
                  language === 'es'
                    ? 'No se encontró un registro de profesional asociado a su cuenta.'
                    : 'No professional record was found for your account.'
                );
                return;
              }
            }
            setShowSessionManagement(true);
          }}
        >
          {t('language') === 'es' ? 'Gestionar Sesiones' : 'Manage Sessions'}
        </button>
      </div>

      <div className="booking-container">
        <div className="requests-list">
          <h4>{t('pendingRequests') || 'Pending Client Requests'}</h4>
          {loading || (isProfessionalUser && loadingMyProfessionalId) ? (
            <p>{t('loading')}</p>
          ) : pendingRequests.length === 0 ? (
            <p>
              {isProfessionalUser && !loadingMyProfessionalId && !myProfessionalId
                ? (language === 'es'
                    ? 'No se encontró un registro de profesional asociado a su cuenta.'
                    : 'No professional record was found for your account.')
                : (t('noPendingRequests') || 'No pending client requests found')}
            </p>
          ) : (
            <div className="requests-grid">
              {pendingRequests.map((request) => {
                const professional = professionals.find(p => p.id === request.professional_id);
                return (
                  <div
                    key={request.id}
                    className={`request-card ${selectedRequest?.id === request.id ? 'selected' : ''}`}
                    onClick={() => handleSelectRequest(request)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="request-header">
                      <strong>{request.full_name || request.username}</strong>
                      <span className={`status-badge ${request.status || 'pending'}`}>
                        {request.status || 'pending'}
                      </span>
                    </div>
                    <p className="request-email">{request.client_email}</p>
                    {professional && (
                      <p className="request-professional">
                        <strong>{t('professional') || 'Professional'}:</strong>{' '}
                        {language === 'en' ? professional.name_en : professional.name_es}
                        {(professional.Título || professional.Clasificación) && (
                          <span style={{ display: 'block', fontSize: '0.85rem', color: '#546e7a', marginTop: '0.15rem' }}>
                            {[professional.Título, professional.Clasificación].filter(Boolean).join(' - ')}
                          </span>
                        )}
                      </p>
                    )}
                    <p className="request-date">
                      <strong>{t('preferredDate') || 'Preferred Date'}:</strong>{' '}
                      {new Date(request.preferred_date).toLocaleDateString()}
                      {request.preferred_time && ` at ${request.preferred_time}`}
                    </p>
                    {request.session_length && (
                      <p className="request-duration">
                        <strong>{language === 'es' ? 'Duración' : 'Duration'}:</strong>{' '}
                        {request.session_length} {request.session_length === 1 ? (language === 'es' ? 'hora' : 'hour') : (language === 'es' ? 'horas' : 'hours')}
                      </p>
                    )}
                    {request.price_amount && (
                      <p className="request-price">
                        <strong>{t('price') || 'Price'}:</strong> {request.price_amount} {request.price_currency}
                        {request.num_sessions && ` (${request.num_sessions} ${request.num_sessions === 1 ? 'session' : 'sessions'})`}
                      </p>
                    )}
                    <p className="request-issue">
                      {request.issue.length > 100
                        ? request.issue.substring(0, 100) + '...'
                        : request.issue}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selectedRequest && (
          <div className="booking-panel">
            <h4>{t('scheduleSession') || 'Schedule Session'}</h4>
            <form onSubmit={handleSubmit} className="booking-form">
              <div className="form-group">
                <label>{t('clientName') || 'Client Name'}</label>
                <input
                  type="text"
                  value={selectedRequest.full_name || selectedRequest.username}
                  disabled
                  className="readonly-input"
                />
              </div>

              <div className="form-group">
                <label>{t('clientEmail') || 'Client Email'}</label>
                <input
                  type="email"
                  value={selectedRequest.client_email}
                  disabled
                  className="readonly-input"
                />
              </div>

              {selectedProfessional && (
                <div className="form-group">
                  <label>{t('professional') || 'Professional'}</label>
                  <input
                    type="text"
                    value={(() => {
                      const pName = language === 'en' ? selectedProfessional.name_en : selectedProfessional.name_es;
                      const suffix = [selectedProfessional.Título, selectedProfessional.Clasificación].filter(Boolean).join(' - ');
                      return suffix ? `${pName} (${suffix})` : pName;
                    })()}
                    disabled
                    className="readonly-input"
                  />
                </div>
              )}

              {selectedRequest.price_amount && (
                <div className="form-group">
                  <label>{t('selectedPrice') || 'Selected Price'}</label>
                  <div className="price-display">
                    <span className="price-amount">
                      {selectedRequest.price_amount} {selectedRequest.price_currency}
                    </span>
                    {selectedRequest.num_sessions && (
                      <span className="price-sessions">
                        {selectedRequest.num_sessions} {selectedRequest.num_sessions === 1 ? 'session' : 'sessions'}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Payment Status Section */}
              {selectedRequest.price_amount && (() => {
                const { isFullyPaid, completedAmount, requiredAmount, hasCompleted } = getPaymentStatus();
                return (
                  <div style={{
                    padding: '1rem 1.25rem',
                    marginBottom: '1rem',
                    borderRadius: '8px',
                    border: `1px solid ${isFullyPaid ? '#4caf50' : '#ff9800'}`,
                    backgroundColor: isFullyPaid ? '#e8f5e9' : '#fff8e1',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {checkingPayment ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="#ff9800" style={{ flexShrink: 0 }}>
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                          </svg>
                        ) : isFullyPaid ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="#4caf50" style={{ flexShrink: 0 }}>
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                          </svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="#f57c00" style={{ flexShrink: 0 }}>
                            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                          </svg>
                        )}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: isFullyPaid ? '#2e7d32' : '#e65100' }}>
                            {checkingPayment
                              ? (language === 'es' ? 'Verificando pago...' : 'Checking payment...')
                              : isFullyPaid
                                ? (language === 'es' ? 'Pago confirmado' : 'Payment confirmed')
                                : hasCompleted
                                  ? (language === 'es' ? 'Advertencia: pago parcial — esto será requerido cuando los pagos estén disponibles' : 'Warning: partial payment — this will be required when payments are available')
                                  : (language === 'es' ? 'Advertencia: pago pendiente — esto será requerido cuando los pagos estén disponibles' : 'Warning: payment pending — this will be required when payments are available')}
                          </div>
                          {!checkingPayment && (
                            <div style={{ fontSize: '0.8rem', color: '#555', marginTop: '0.15rem' }}>
                              {language === 'es'
                                ? `Pagado: ${completedAmount.toFixed(2)} / ${requiredAmount.toFixed(2)} ${selectedRequest.price_currency}`
                                : `Paid: ${completedAmount.toFixed(2)} / ${requiredAmount.toFixed(2)} ${selectedRequest.price_currency}`}
                            </div>
                          )}
                        </div>
                      </div>

                      {isFullyPaid && (
                        <button
                          type="button"
                          onClick={() => fetchPaymentForRequest(selectedRequest)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.35rem 0.75rem',
                            backgroundColor: 'transparent',
                            color: '#2e7d32',
                            border: '1px solid #4caf50',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f8e9'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                          </svg>
                          {language === 'es' ? 'Actualizar' : 'Refresh'}
                        </button>
                      )}
                    </div>

                    {!isFullyPaid && paymentTransactions.length > 0 && (
                      <div style={{ marginTop: '0.75rem', borderTop: '1px solid #ffcc80', paddingTop: '0.75rem' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#bf360c', marginBottom: '0.4rem' }}>
                          {language === 'es' ? 'Transacciones registradas:' : 'Recorded transactions:'}
                        </div>
                        {paymentTransactions.map((t, i) => (
                          <div key={t.id || i} style={{ fontSize: '0.78rem', color: '#555', display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0' }}>
                            <span>{t.payment_method} — <span style={{ color: t.payment_status === 'Completed' ? '#2e7d32' : '#e65100', fontWeight: 600 }}>{t.payment_status}</span></span>
                            <span>{t.payment_amount} {t.payment_currency}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="form-group">
                <label htmlFor="selected_date">
                  {t('meetingDate') || 'Meeting Date'} <span className="required">*</span>
                </label>
                <input
                  type="date"
                  id="selected_date"
                  name="selected_date"
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  min={getTomorrowDate()}
                  required
                  className="datetime-date-input"
                />

                {selectedProfessional && (
                  <div style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    backgroundColor: '#e3f2fd',
                    border: '1px solid #2196F3',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: '#1565c0' }}>
                      {language === 'es' ? 'Zona Horaria del Profesional:' : 'Professional\'s Time Zone:'}
                    </div>
                    <div style={{ color: '#1976d2' }}>
                      🕐 {selectedProfessional.time_zone || 'America/Bogota'}
                    </div>
                  </div>
                )}

                <div style={{
                  marginTop: '0.75rem',
                  padding: '0.5rem',
                  backgroundColor: '#fff3cd',
                  border: '1px solid #ffc107',
                  borderRadius: '4px',
                  fontSize: '0.8rem'
                }}>
                  <strong>{language === 'es' ? 'Ver horarios en tu zona horaria:' : 'View times in your time zone:'}</strong>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#856404' }}>
                    {language === 'es'
                      ? 'Los horarios se muestran en ambas zonas. Cambiar tu zona solo afecta cómo ves los horarios.'
                      : 'Times are shown in both zones. Changing your zone only affects how you view times.'}
                  </p>
                </div>
                <TimezoneSelector value={timezone} onChange={setTimezone} />
              </div>

              {selectedDate && (
                <div className="form-group">
                  <label htmlFor="meeting_date">
                    {language === 'es' ? 'Horario Disponible' : 'Available Time Slot'} <span className="required">*</span>
                  </label>
                  {loadingSlots ? (
                    <p>{t('loading') || 'Loading available times...'}</p>
                  ) : (
                    <>
                      {(() => {
                        const timeSlots = generateTimeSlotOptions();
                        const profTz = normalizeTimezone(selectedProfessional?.time_zone);
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
                                {language === 'es' ? 'Hora del Cliente' : 'Client Time'}
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
                                  const isSelected = selectedTimeSlotId === slot.slotId && meetingDate === slot.value;
                                  return (
                                    <div
                                      key={slot.value}
                                      onClick={() => {
                                        setMeetingDate(slot.value);
                                        setSelectedTimeSlotId(slot.slotId);
                                      }}
                                      style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: '0.5rem',
                                        padding: '0.75rem',
                                        cursor: 'pointer',
                                        backgroundColor: isSelected ? '#2196F3' : 'white',
                                        color: isSelected ? 'white' : 'inherit',
                                        borderBottom: '1px solid #eee',
                                        transition: 'background-color 0.2s'
                                      }}
                                      onMouseEnter={(e) => {
                                        if (!isSelected) {
                                          e.currentTarget.style.backgroundColor = '#f0f7ff';
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        if (!isSelected) {
                                          e.currentTarget.style.backgroundColor = 'white';
                                        }
                                      }}
                                    >
                                      <span style={{ textAlign: 'center', fontWeight: 500 }}>
                                        {slot.professionalTime}
                                      </span>
                                      <span style={{ textAlign: 'center', fontWeight: 500 }}>
                                        {slot.clientTime}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <input
                              type="hidden"
                              id="meeting_date"
                              name="meeting_date"
                              value={meetingDate || ''}
                              required
                            />
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
              )}

              <div className="form-group">
                <label>{t('meetingPlatform') || 'Meeting Platform'}</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={scheduleMeeting}
                    onChange={(e) => setScheduleMeeting(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                    {language === 'es' ? 'Programar reunión en línea' : 'Schedule online meeting'}
                  </span>
                </label>
                <div className="platform-options" style={{ opacity: scheduleMeeting ? 1 : 0.45 }}>
                  <label className="radio-option" style={{ cursor: 'not-allowed' }}>
                    <input
                      type="radio"
                      name="meeting_platform"
                      value="google"
                      checked={meetingPlatform === 'google'}
                      onChange={() => {}}
                      disabled
                    />
                    <span className="radio-label" style={{ color: '#555' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '8px' }}>
                        <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
                      </svg>
                      Google Meet
                    </span>
                  </label>
                  <label className="radio-option" style={{ cursor: 'not-allowed' }}>
                    <input
                      type="radio"
                      name="meeting_platform"
                      value="zoom"
                      checked={false}
                      onChange={() => {}}
                      disabled
                    />
                    <span className="radio-label" style={{ color: '#aaa' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '8px' }}>
                        <path d="M3.5 21h17c.85 0 1.5-.64 1.5-1.5v-15c0-.86-.65-1.5-1.5-1.5h-17C2.65 3 2 3.64 2 4.5v15c0 .86.65 1.5 1.5 1.5zM4 5h16v14H4V5zm8 3c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5zm4 0l3 2.25v5.5L16 13.5V8z"/>
                      </svg>
                      Zoom
                      <span style={{ marginLeft: '6px', fontSize: '0.75rem', color: '#999', fontStyle: 'italic' }}>
                        ({language === 'es' ? 'no disponible' : 'unavailable'})
                      </span>
                    </span>
                  </label>
                </div>
                {scheduleMeeting && (
                  <p className="help-text" style={{ marginTop: '0.5rem' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                    {t('calendarInviteInfo') || 'A Google Calendar event will be created with a Google Meet link and sent to both client and professional.'}
                  </p>
                )}
              </div>

              <div className="form-group">
                <label>{t('issue') || 'Issue'}</label>
                <textarea
                  value={selectedRequest.issue}
                  disabled
                  className="readonly-input"
                  rows={4}
                />
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => setSelectedRequest(null)}
                >
                  {t('cancel') || 'Cancel'}
                </button>
                {(() => {
                  return (
                    <button
                      type="submit"
                      className="submit-button"
                      disabled={bookingInProgress || !meetingDate || !selectedDate || availableSlots.length === 0 || checkingPayment}
                    >
                      {bookingInProgress
                        ? t('loading')
                        : (t('bookSession') || 'Book Session')}
                    </button>
                  );
                })()}
              </div>
            </form>
          </div>
        )}
      </div>

      {showSessionManagement && (
        <SessionManagement
          onClose={() => setShowSessionManagement(false)}
          professionalId={isProfessionalUser ? myProfessionalId ?? undefined : undefined}
        />
      )}

    </div>
  );
}
