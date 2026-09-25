import { useLanguage } from '../contexts/LanguageContext';
import {
  getSessionStatusLabel,
  getClientRequestStatusValue,
} from '../lib/sessionStatus';
import type { ClientRequest, Specialty, CounselingType, Professional, SessionPrice } from '../types';

interface PendingRequestsModalProps {
  requests: ClientRequest[];
  loading: boolean;
  onClose: () => void;
  onInfo: (request: ClientRequest) => void;
  onEdit: (request: ClientRequest) => void;
  isAdmin?: boolean;
  onBookSession?: (request: ClientRequest) => void;
}

export function PendingRequestsModal({ requests, loading, onClose, onInfo, onEdit, isAdmin = false, onBookSession }: PendingRequestsModalProps) {
  const { language } = useLanguage();
  const label = (en: string, es: string) => language === 'es' ? es : en;

  return (
    <div className="pending-requests-overlay" onClick={onClose}>
      <div className="pending-requests-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pending-requests-header">
          <h3>{label('Pending Requests', 'Solicitudes Pendientes')}</h3>
          <button
            type="button"
            className="pending-requests-close"
            onClick={onClose}
            aria-label={label('Close', 'Cerrar')}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="pending-requests-body">
          {loading ? (
            <div className="pending-requests-loading">
              <div className="spinner" />
              <p>{label('Loading...', 'Cargando...')}</p>
            </div>
          ) : requests.length === 0 ? (
            <p className="pending-requests-empty">
              {label('No pending requests found.', 'No se encontraron solicitudes pendientes.')}
            </p>
          ) : (
            <ul className="pending-requests-list">
              {requests.map((req) => (
                <li key={req.id} className="pending-request-row">
                  <div className="pending-request-info">
                    <span className="pending-request-name">{req.client_name || req.username}</span>
                    <span className="pending-request-date">
                      {req.preferred_date ? new Date(req.preferred_date).toLocaleDateString() : '—'}
                    </span>
                    <span className="pending-request-issue">{req.issue?.slice(0, 60)}{(req.issue?.length ?? 0) > 60 ? '…' : ''}</span>
                  </div>
                  <div className="pending-request-actions">
                    <button
                      type="button"
                      className="pending-req-btn info-btn"
                      onClick={() => onInfo(req)}
                      title={label('View full request', 'Ver solicitud completa')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                      </svg>
                      {label('Info', 'Info')}
                    </button>
                    <button
                      type="button"
                      className="pending-req-btn edit-btn"
                      onClick={() => { onEdit(req); onClose(); }}
                      title={label('Edit this request', 'Editar esta solicitud')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                      </svg>
                      {label('Change', 'Cambiar')}
                    </button>
                    {isAdmin && onBookSession && (
                      <button
                        type="button"
                        className="pending-req-btn book-btn"
                        onClick={() => { onBookSession(req); onClose(); }}
                        title={label('Book session', 'Reservar sesión')}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
                        </svg>
                        {label('Book Session', 'Reservar Sesión')}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}


interface RequestInfoModalProps {
  request: ClientRequest;
  onClose: () => void;
  specialties?: Specialty[];
  counselingTypes?: CounselingType[];
  professionals?: Professional[];
  sessionPrices?: SessionPrice[];
}

export function RequestInfoModal({ request, onClose, specialties = [], counselingTypes = [], professionals = [], sessionPrices = [] }: RequestInfoModalProps) {
  const { language } = useLanguage();
  const label = (en: string, es: string) => language === 'es' ? es : en;

  const field = (labelEn: string, labelEs: string, value: string | number | undefined | null) => {
    if (!value && value !== 0) return null;
    return (
      <div className="req-info-field">
        <span className="req-info-label">{label(labelEn, labelEs)}</span>
        <span className="req-info-value">{String(value)}</span>
      </div>
    );
  };

  const specialty = request.specialty_id ? specialties.find((s) => s.id === request.specialty_id) : null;
  const counselingType = request.counseling_type_id ? counselingTypes.find((c) => c.id === request.counseling_type_id) : null;
  const professional = request.professional_id ? professionals.find((p) => p.id === request.professional_id) : null;
  const sessionPrice = request.session_price_id != null ? sessionPrices.find((s) => s.id === request.session_price_id) : null;
  const specialtyName = specialty ? (language === 'es' ? specialty.name_es : specialty.name_en) : null;
  const counselingTypeName = counselingType ? (language === 'es' ? counselingType.name_es : counselingType.name_en) : null;
  const professionalName = professional ? (language === 'es' ? professional.name_es : professional.name_en) : null;
  const sessionPriceLabel = sessionPrice
    ? `${sessionPrice.Name} - ${sessionPrice.Price} ${sessionPrice.Currency} (${sessionPrice.NumSessions} ${sessionPrice.NumSessions === 1 ? (language === 'es' ? 'sesión' : 'session') : (language === 'es' ? 'sesiones' : 'sessions')})`
    : (request.price_amount ? `${request.price_amount} ${request.price_currency || ''}` : null);

  return (
    <div className="pending-requests-overlay" onClick={onClose}>
      <div className="pending-requests-modal req-info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pending-requests-header">
          <h3>{label('Request Details', 'Detalles de Solicitud')}</h3>
          <button type="button" className="pending-requests-close" onClick={onClose} aria-label={label('Close', 'Cerrar')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div className="pending-requests-body req-info-body">
          {field('Client Name', 'Nombre del Cliente', request.client_name || request.username)}
          {field('Email', 'Correo', request.client_email)}
          {field('Phone', 'Teléfono', request.client_phone)}
          {field('Specialty', 'Especialidad', specialtyName ?? undefined)}
          {field('Counseling Type', 'Tipo de consejería', counselingTypeName ?? undefined)}
          {field('Professional', 'Profesional', professionalName ?? undefined)}
          {field('Preferred Date', 'Fecha Preferida', request.preferred_date ? new Date(request.preferred_date).toLocaleDateString() : undefined)}
          {field('Preferred Time', 'Hora Preferida', request.preferred_time)}
          {field('Session Length (hrs)', 'Duración (hrs)', request.session_length)}
          {field('Session Status', 'Estado de Sesión', getSessionStatusLabel(getClientRequestStatusValue(request), language))}
          {field('Status', 'Estado', request.status)}
          {field('Price', 'Precio', sessionPriceLabel ?? (request.price_amount ? `${request.price_amount} ${request.price_currency || ''}` : undefined))}
          {field('Sessions', 'Sesiones', request.num_sessions)}
          <div className="req-info-field req-info-issue">
            <span className="req-info-label">{label('Issue Description', 'Descripción del Problema')}</span>
            <span className="req-info-value req-info-issue-text">{request.issue}</span>
          </div>
          {request.notes && field('Notes', 'Notas', request.notes)}
          {field('Created', 'Creado', request.created_at ? new Date(request.created_at).toLocaleString() : undefined)}
        </div>
        <div className="pending-requests-footer">
          <button type="button" className="pending-modal-ok-btn" onClick={onClose}>
            {label('Close', 'Cerrar')}
          </button>
        </div>
      </div>
    </div>
  );
}
