import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabaseClient';
import {
  getClientRequestStatusValue,
  getSessionStatusFilterLabel,
  getSessionStatusFilterOptions,
  normalizeSessionStatus,
  type SessionStatusCode,
} from '../lib/sessionStatus';
import { isCancellableSessionStatus } from '../lib/cancelSessionPolicy';
import type { ClientRequest } from '../types';

interface ExistingSessionsModalProps {
  onClose: () => void;
  onInfo: (request: ClientRequest) => void;
  onEdit: (request: ClientRequest) => void;
  onPaySession?: (request: ClientRequest) => void;
  onCancelSession?: (request: ClientRequest) => void;
  currentUserId?: string;
  clientEmail?: string;
  isAdmin?: boolean;
  onBookSession?: (request: ClientRequest) => void;
}

type SessionAction = 'view' | 'cancel' | 'pay' | 'change';

export function ExistingSessionsModal({
  onClose,
  onInfo,
  onEdit,
  onPaySession,
  onCancelSession,
  currentUserId,
  clientEmail,
  isAdmin = false,
  onBookSession,
}: ExistingSessionsModalProps) {
  const { language } = useLanguage();
  const label = (en: string, es: string) => (language === 'es' ? es : en);
  const statusFilterOptions = getSessionStatusFilterOptions(language);

  const [statusFilter, setStatusFilter] = useState<'all' | SessionStatusCode>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionsRequest, setActionsRequest] = useState<ClientRequest | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!currentUserId && !clientEmail?.trim()) {
      setRequests([]);
      setError(label('Sign in or enter your email to view sessions.', 'Inicie sesión o ingrese su correo para ver sesiones.'));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('client_requests')
        .select('*')
        .order('preferred_date', { ascending: false });

      if (currentUserId) {
        query = query.eq('user_id', currentUserId);
      } else if (clientEmail?.trim()) {
        query = query.eq('client_email', clientEmail.trim());
      }

      if (fromDate) {
        query = query.gte('preferred_date', fromDate);
      }
      if (toDate) {
        query = query.lte('preferred_date', toDate);
      }

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      let rows = (data ?? []) as ClientRequest[];
      if (statusFilter !== 'all') {
        rows = rows.filter(req => getClientRequestStatusValue(req) === statusFilter);
      }
      setRequests(rows);
    } catch (err) {
      console.error('Error loading existing sessions:', err);
      setError(label('Failed to load sessions.', 'Error al cargar sesiones.'));
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [clientEmail, currentUserId, fromDate, statusFilter, toDate]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const formatPreferredDate = (req: ClientRequest) => {
    if (!req.preferred_date) return '—';
    const raw = String(req.preferred_date);
    const datePart = raw.includes('T') ? raw.split('T')[0] : raw;
    const timePart = req.preferred_time ? ` ${req.preferred_time}` : '';
    return `${datePart}${timePart}`;
  };

  const canPay = (req: ClientRequest) => getClientRequestStatusValue(req) === 0;
  const canCancel = (req: ClientRequest) => isCancellableSessionStatus(getClientRequestStatusValue(req));
  const canChange = (req: ClientRequest) => isCancellableSessionStatus(getClientRequestStatusValue(req));

  const handleSessionAction = (action: SessionAction) => {
    if (!actionsRequest) return;
    const req = actionsRequest;

    if (action === 'view') {
      onInfo(req);
      setActionsRequest(null);
      return;
    }

    if (action === 'cancel') {
      if (!canCancel(req)) return;
      onCancelSession?.(req);
      setActionsRequest(null);
      return;
    }

    if (action === 'pay') {
      if (!canPay(req)) return;
      onPaySession?.(req);
      setActionsRequest(null);
      return;
    }

    if (action === 'change') {
      if (!canChange(req)) return;
      onEdit(req);
      setActionsRequest(null);
      onClose();
    }
  };

  return (
    <div className="pending-requests-overlay" onClick={onClose}>
      <div className="pending-requests-modal existing-sessions-modal" onClick={e => e.stopPropagation()}>
        <div className="pending-requests-header">
          <h3>{label('View My Sessions', 'Ver Mis Sesiones')}</h3>
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

        <div className="existing-sessions-filters">
          <div className="existing-sessions-filter">
            <label htmlFor="existing-sessions-status">{label('Session Status', 'Estado de Sesión')}</label>
            <select
              id="existing-sessions-status"
              value={statusFilter}
              onChange={e => {
                const value = e.target.value;
                setStatusFilter(value === 'all' ? 'all' : normalizeSessionStatus(parseInt(value, 10)));
              }}
            >
              <option value="all">{label('all statuses', 'todos los estados')}</option>
              {statusFilterOptions.map(opt => (
                <option key={opt.code} value={opt.code}>
                  {opt.code} — {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="existing-sessions-filter">
            <label htmlFor="existing-sessions-from">{label('From', 'Desde')}</label>
            <input
              id="existing-sessions-from"
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
            />
          </div>
          <div className="existing-sessions-filter">
            <label htmlFor="existing-sessions-to">{label('To', 'Hasta')}</label>
            <input
              id="existing-sessions-to"
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={e => setToDate(e.target.value)}
            />
          </div>
          <button type="button" className="existing-sessions-search-btn" onClick={fetchSessions} disabled={loading}>
            {loading ? label('Loading...', 'Cargando...') : label('Search', 'Buscar')}
          </button>
        </div>

        <div className="pending-requests-body">
          {error ? (
            <p className="pending-requests-empty">{error}</p>
          ) : loading ? (
            <div className="pending-requests-loading">
              <div className="spinner" />
              <p>{label('Loading...', 'Cargando...')}</p>
            </div>
          ) : requests.length === 0 ? (
            <p className="pending-requests-empty">
              {label('No sessions found for the selected filters.', 'No se encontraron sesiones con los filtros seleccionados.')}
            </p>
          ) : (
            <ul className="pending-requests-list">
              {requests.map(req => (
                <li key={req.id} className="pending-request-row">
                  <div className="pending-request-info">
                    <span className="pending-request-name">{req.client_name || req.username}</span>
                    <span className="pending-request-date">{formatPreferredDate(req)}</span>
                    <span className="existing-session-status-badge existing-session-status-badge--static">
                      {getSessionStatusFilterLabel(getClientRequestStatusValue(req), language)}
                    </span>
                    <span className="pending-request-issue">
                      {req.issue?.slice(0, 60)}{(req.issue?.length ?? 0) > 60 ? '…' : ''}
                    </span>
                  </div>
                  <div className="pending-request-actions">
                    <button
                      type="button"
                      className="pending-req-btn session-actions-btn"
                      onClick={() => setActionsRequest(req)}
                      title={label('Session actions', 'Acciones de sesión')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                      </svg>
                      {label('Actions', 'Acciones')}
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

        {actionsRequest && (
          <div className="session-status-action-overlay" onClick={() => setActionsRequest(null)}>
            <div className="session-status-action-menu" onClick={e => e.stopPropagation()}>
              <h4>{label('Actions', 'Acciones')}</h4>
              <p className="session-status-action-current">
                {label('Current status:', 'Estado actual:')}{' '}
                <strong>
                  {getSessionStatusFilterLabel(getClientRequestStatusValue(actionsRequest), language)}
                </strong>
              </p>
              <p className="session-status-action-hint">
                {label(
                  'Paid sessions canceled more than 24 hours ahead can choose a refund or credit for future sessions.',
                  'Las sesiones pagadas canceladas con más de 24 horas de anticipación pueden elegir reembolso o crédito para futuras sesiones.',
                )}
              </p>
              <div className="session-status-action-buttons">
                <button
                  type="button"
                  className="session-status-action-btn session-status-action-btn--view"
                  onClick={() => handleSessionAction('view')}
                >
                  {label('View Session', 'Ver Sesión')}
                </button>
                <button
                  type="button"
                  className="session-status-action-btn session-status-action-btn--cancel"
                  disabled={!canCancel(actionsRequest)}
                  onClick={() => handleSessionAction('cancel')}
                  title={
                    canCancel(actionsRequest)
                      ? undefined
                      : label('This session cannot be canceled.', 'Esta sesión no se puede cancelar.')
                  }
                >
                  {label('Cancel Session', 'Cancelar Sesión')}
                </button>
                <button
                  type="button"
                  className="session-status-action-btn session-status-action-btn--change"
                  disabled={!canChange(actionsRequest)}
                  onClick={() => handleSessionAction('change')}
                  title={
                    canChange(actionsRequest)
                      ? undefined
                      : label('This session cannot be changed.', 'Esta sesión no se puede cambiar.')
                  }
                >
                  {label('Change Session', 'Cambiar Sesión')}
                </button>
                <button
                  type="button"
                  className="session-status-action-btn session-status-action-btn--pay"
                  disabled={!canPay(actionsRequest)}
                  onClick={() => handleSessionAction('pay')}
                  title={
                    canPay(actionsRequest)
                      ? undefined
                      : label('Only pending unpaid sessions can be paid.', 'Solo se pueden pagar sesiones pendientes sin pago.')
                  }
                >
                  {label('Pay Session', 'Pagar Sesión')}
                </button>
              </div>
              <button
                type="button"
                className="session-status-action-dismiss"
                onClick={() => setActionsRequest(null)}
              >
                {label('Close', 'Cerrar')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
