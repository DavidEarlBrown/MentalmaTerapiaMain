import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import type { CalendarItem, Professional, AvailableSlot } from '../types';

interface CalendarViewProps {
  items: CalendarItem[];
  professionals: Professional[];
  availableSlots: AvailableSlot[];
  onDateChange: (date: string) => void;
  onProfessionalChange?: (professionalId: string) => void;
  loading: boolean;
  loadingSlots?: boolean;
}

export function CalendarView({
  items,
  professionals,
  availableSlots,
  onDateChange,
  onProfessionalChange,
  loading,
  loadingSlots,
}: CalendarViewProps) {
  const { t, language } = useLanguage();
  const [selectedDate, setSelectedDate] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterProblem, setFilterProblem] = useState('');
  const [selectedProfessional, setSelectedProfessional] = useState('');

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);
    onDateChange(today);
  }, []);

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    onDateChange(date);
  };

  const handleProfessionalChange = (professionalId: string) => {
    setSelectedProfessional(professionalId);
    if (onProfessionalChange) {
      onProfessionalChange(professionalId);
    }
  };

  const getProfessionalName = (professionalId: string) => {
    const professional = professionals.find(p => p.id === professionalId);
    if (!professional) return 'Unknown';
    return language === 'en' ? professional.name_en : professional.name_es;
  };

  const filteredItems = items.filter(item => {
    if (selectedProfessional && item.professional_id !== selectedProfessional) {
      return false;
    }
    const matchesClient = !filterClient ||
      item.client_name.toLowerCase().includes(filterClient.toLowerCase()) ||
      item.client_email.toLowerCase().includes(filterClient.toLowerCase());
    const matchesProblem = !filterProblem ||
      item.subject.toLowerCase().includes(filterProblem.toLowerCase());
    return matchesClient && matchesProblem;
  });

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'confirmed':
      case 'booked':
      case 'held':
        return 'status-confirmed';
      case 'pending':
        return 'status-pending';
      case 'cancelled':
      case 'canceled':
        return 'status-cancelled';
      case 'completed':
        return 'status-completed';
      default:
        return '';
    }
  };

  const getStatusLabel = (status: string) => {
    const key = status.toLowerCase();
    const labels: Record<string, { en: string; es: string }> = {
      pending: { en: 'Pending', es: 'Pendiente' },
      confirmed: { en: 'Confirmed', es: 'Confirmada' },
      booked: { en: 'Booked', es: 'Reservada' },
      held: { en: 'Held', es: 'Realizada' },
      cancelled: { en: 'Cancelled', es: 'Cancelada' },
      canceled: { en: 'Cancelled', es: 'Cancelada' },
      completed: { en: 'Completed', es: 'Completada' },
    };
    return labels[key]?.[language] || status;
  };

  const getSourceLabel = (source: CalendarItem['source']) => {
    if (source === 'session') {
      return language === 'es' ? 'Sesión' : 'Session';
    }
    return language === 'es' ? 'Solicitud' : 'Request';
  };

  const formatTime = (dateString: string) => {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatSlotTime = (slot: AvailableSlot) => {
    const start = new Date(slot.start_time);
    const end = new Date(slot.end_time);
    return `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const getDateSlots = () => {
    if (!selectedDate || !selectedProfessional) return [];

    const selectedDay = new Date(selectedDate).toDateString();
    return availableSlots.filter(slot => {
      const slotDay = new Date(slot.start_time).toDateString();
      return slotDay === selectedDay && slot.professional_id === selectedProfessional;
    });
  };

  const availableCount = getDateSlots().filter(s => !s.is_booked).length;
  const bookedCount = getDateSlots().filter(s => s.is_booked).length;

  return (
    <section className="section calendar-view">
      <h2>{t('appointmentCalendar')}</h2>

      <div className="calendar-filters">
        <div className="filter-group">
          <label htmlFor="professional-select">{t('selectProfessional')}</label>
          <select
            id="professional-select"
            value={selectedProfessional}
            onChange={(e) => handleProfessionalChange(e.target.value)}
            className="filter-select"
          >
            <option value="">{t('chooseProfessional')}</option>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {language === 'en' ? professional.name_en : professional.name_es}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="date-picker">{t('selectDate')}</label>
          <input
            type="date"
            id="date-picker"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="date-picker-input"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="filter-client">{t('filterByClient')}</label>
          <input
            type="text"
            id="filter-client"
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
            placeholder={t('clientName')}
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="filter-problem">{t('filterByProblem')}</label>
          <input
            type="text"
            id="filter-problem"
            value={filterProblem}
            onChange={(e) => setFilterProblem(e.target.value)}
            placeholder={t('problemKeyword')}
            className="filter-input"
          />
        </div>
      </div>

      {selectedProfessional && selectedDate && (
        <div className="availability-section">
          <h3>{t('availability')}</h3>
          {loadingSlots ? (
            <div className="loading">{t('loading')}</div>
          ) : (
            <>
              <div className="availability-summary">
                <div className="availability-stat available">
                  <span className="stat-label">{t('availableSlots')}:</span>
                  <span className="stat-value">{availableCount}</span>
                </div>
                <div className="availability-stat booked">
                  <span className="stat-label">{t('bookedSlots')}:</span>
                  <span className="stat-value">{bookedCount}</span>
                </div>
              </div>
              <div className="slots-grid">
                {getDateSlots().length === 0 ? (
                  <p className="no-slots">{t('noSlotsAvailable')}</p>
                ) : (
                  getDateSlots().map((slot) => (
                    <div
                      key={slot.id}
                      className={`time-slot ${slot.is_booked ? 'booked' : 'available'}`}
                    >
                      <span className="slot-time">{formatSlotTime(slot)}</span>
                      <span className="slot-status">
                        {slot.is_booked ? t('booked') : t('available')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="loading">{t('loading')}</div>
      ) : filteredItems.length === 0 ? (
        <div className="no-appointments">
          <p>{t('noAppointments')}</p>
        </div>
      ) : (
        <div className="appointments-list">
          {filteredItems.map((item) => (
            <div key={`${item.source}-${item.id}`} className="appointment-card">
              <div className="appointment-header">
                <div className="appointment-time">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                  <span>{formatTime(item.scheduled_at)}</span>
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.85em', opacity: 0.75 }}>
                    ({getSourceLabel(item.source)})
                  </span>
                </div>
                <span className={`appointment-status ${getStatusColor(item.status)}`}>
                  {getStatusLabel(item.status)}
                </span>
              </div>

              <div className="appointment-body">
                <div className="appointment-info">
                  <div className="info-row">
                    <strong>{t('professional')}:</strong>
                    <span>{getProfessionalName(item.professional_id)}</span>
                  </div>
                  <div className="info-row">
                    <strong>{t('client')}:</strong>
                    <span>{item.client_name}</span>
                  </div>
                  <div className="info-row">
                    <strong>{t('email')}:</strong>
                    <span>{item.client_email}</span>
                  </div>
                  {item.client_phone && (
                    <div className="info-row">
                      <strong>{t('phone')}:</strong>
                      <span>{item.client_phone}</span>
                    </div>
                  )}
                  {item.price_amount && (
                    <div className="info-row">
                      <strong>{t('price') || 'Price'}:</strong>
                      <span className="appointment-price">
                        {item.price_amount} {item.price_currency}
                        {item.num_sessions && ` (${item.num_sessions} ${item.num_sessions === 1 ? 'session' : 'sessions'})`}
                      </span>
                    </div>
                  )}
                </div>

                {item.subject && (
                  <div className="appointment-subject">
                    <strong>{t('problemToDiscuss')}:</strong>
                    <p>{item.subject}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
