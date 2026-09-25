import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useProfession } from '../contexts/ProfessionContext';
import { DateTimePicker } from './DateTimePicker';
import { fetchProfessionals } from '../lib/api';
import type { Session, Professional } from '../types';

interface SessionManagementProps {
  clientEmail?: string;
  professionalId?: string;
  onClose: () => void;
  readOnly?: boolean;
}

export function SessionManagement({ clientEmail, professionalId, onClose, readOnly = false }: SessionManagementProps) {
  const { t, language } = useLanguage();
  const { activeProfession } = useProfession();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [action, setAction] = useState<'cancel' | 'reschedule' | null>(null);
  const [reason, setReason] = useState('');
  const [newDateTime, setNewDateTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchProfessionals(activeProfession?.id)
      .then(data => setProfessionals(data))
      .catch(() => setProfessionals([]));
  }, [activeProfession?.id]);

  useEffect(() => {
    loadSessions();
  }, [clientEmail, professionalId]);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const { fetchSessions } = await import('../lib/api');
      const data = await fetchSessions(clientEmail, professionalId);
      setSessions(data);
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleActionSubmit = async () => {
    if (!selectedSession || !action || !reason.trim()) {
      alert(t('language') === 'es'
        ? 'Por favor complete todos los campos requeridos'
        : 'Please fill in all required fields');
      return;
    }

    if (action === 'reschedule' && !newDateTime) {
      alert(t('language') === 'es'
        ? 'Por favor seleccione la nueva fecha y hora'
        : 'Please select new date and time');
      return;
    }

    setSubmitting(true);
    try {
      const { updateSession, logSessionChange } = await import('../lib/api');

      if (action === 'cancel') {
        await updateSession(selectedSession.id, { status: 'cancelled' });
      } else if (action === 'reschedule') {
        await updateSession(selectedSession.id, { session_date: newDateTime });
      }

      await logSessionChange({
        session_id: selectedSession.id,
        action_type: action,
        reason,
        old_session_date: selectedSession.session_date,
        new_session_date: action === 'reschedule' ? newDateTime : undefined,
        performed_by: clientEmail || professionalId || 'unknown',
      });

      alert(t('language') === 'es'
        ? 'Sesión actualizada exitosamente'
        : 'Session updated successfully');

      setSelectedSession(null);
      setAction(null);
      setReason('');
      setNewDateTime('');
      loadSessions();
    } catch (error) {
      console.error('Error updating session:', error);
      alert(t('language') === 'es'
        ? 'Error al actualizar la sesión'
        : 'Error updating session');
    } finally {
      setSubmitting(false);
    }
  };

  const getMinDateTime = () => {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    return now.toISOString().slice(0, 16);    
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content session-management-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {readOnly
              ? (t('language') === 'es' ? 'Sesiones Reservadas' : 'Booked Sessions')
              : (t('language') === 'es' ? 'Gestionar Sesiones' : 'Manage Sessions')}
          </h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {loading ? (
            <p>{t('loading')}</p>
          ) : (() => {
            const activeProfessionalIds = new Set(professionals.map(p => p.id));
            const visibleSessions = sessions.filter(s =>
              s.status !== 'cancelled' &&
              (
                // If the backend query already scoped to a specific professional_id,
                // avoid hiding results just because the professionals lookup is incomplete.
                professionalId
                  ? !!s.professional_id && s.professional_id === professionalId
                  : (!s.professional_id || activeProfessionalIds.size === 0 || activeProfessionalIds.has(s.professional_id))
              )
            );
            return visibleSessions.length === 0 ? (
              <p>{language === 'es' ? 'No hay sesiones programadas' : 'No scheduled sessions found'}</p>
            ) : (
            <>
              <div className="sessions-list">
                <h4>{language === 'es' ? 'Sesiones Programadas' : 'Scheduled Sessions'}</h4>
                {visibleSessions.map((session) => {
                  const professional = professionals.find(p => p.id === session.professional_id);
                  return (
                  <div
                    key={session.id}
                    className={`session-card ${!readOnly && selectedSession?.id === session.id ? 'selected' : ''}`}
                    onClick={() => {
                      if (readOnly) return;
                      setSelectedSession(session);
                      setAction(null);
                      setReason('');
                      setNewDateTime('');
                    }}
                    style={readOnly ? { cursor: 'default' } : undefined}
                  >
                    <div className="session-info">
                      <p><strong>{language === 'es' ? 'Cliente' : 'Client'}:</strong> {session.client_name}</p>
                      {professional && (
                        <p>
                          <strong>{language === 'es' ? 'Profesional' : 'Professional'}:</strong>{' '}
                          {language === 'en' ? professional.name_en : professional.name_es}
                          {(professional.Título || professional.Clasificación) && (
                            <span style={{ display: 'block', fontSize: '0.82rem', color: '#546e7a', marginTop: '0.1rem' }}>
                              {[professional.Título, professional.Clasificación].filter(Boolean).join(' - ')}
                            </span>
                          )}
                        </p>
                      )}
                      <p><strong>{language === 'es' ? 'Fecha' : 'Date'}:</strong> {new Date(session.session_date).toLocaleString()}</p>
                      <p><strong>{language === 'es' ? 'Estado' : 'Status'}:</strong> {session.status}</p>
                      {session.amount && (
                        <p><strong>{language === 'es' ? 'Precio' : 'Price'}:</strong> {session.amount} {session.currency}</p>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>

              {!readOnly && selectedSession && (
                <div className="session-actions">
                  <h4>{t('language') === 'es' ? 'Seleccionar Acción' : 'Select Action'}</h4>
                  <div className="action-buttons">
                    <button
                      className={`action-button ${action === 'cancel' ? 'active' : ''}`}
                      onClick={() => setAction('cancel')}
                    >
                      {t('language') === 'es' ? 'Cancelar Sesión' : 'Cancel Session'}
                    </button>
                    <button
                      className={`action-button ${action === 'reschedule' ? 'active' : ''}`}
                      onClick={() => setAction('reschedule')}
                    >
                      {t('language') === 'es' ? 'Reprogramar' : 'Reschedule'}
                    </button>
                  </div>

                  {action && (
                    <div className="action-form">
                      {action === 'reschedule' && (
                        <div className="form-group">
                          <label>
                            {t('language') === 'es' ? 'Nueva Fecha y Hora' : 'New Date & Time'} <span className="required">*</span>
                          </label>
                          <DateTimePicker
                            value={newDateTime}
                            onChange={setNewDateTime}
                            minDate={getMinDateTime()}
                            required
                          />
                        </div>
                      )}

                      <div className="form-group">
                        <label>
                          {t('language') === 'es' ? 'Razón' : 'Reason'} <span className="required">*</span>
                        </label>
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          rows={4}
                          placeholder={t('language') === 'es'
                            ? 'Explique la razón de esta acción...'
                            : 'Explain the reason for this action...'}
                          required
                        />
                      </div>

                      <div className="form-actions">
                        <button
                          className="cancel-button"
                          onClick={() => {
                            setAction(null);
                            setReason('');
                            setNewDateTime('');
                          }}
                        >
                          {t('cancel')}
                        </button>
                        <button
                          className="submit-button"
                          onClick={handleActionSubmit}
                          disabled={submitting}
                        >
                          {submitting ? t('loading') : (t('language') === 'es' ? 'Confirmar' : 'Confirm')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
