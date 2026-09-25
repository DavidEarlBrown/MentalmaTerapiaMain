/**
 * SupportTicketPanel — full Zoho Desk ticket management.
 *
 * Views:
 *  • Ticket list  — all tickets, filterable by status, with search
 *  • Ticket detail — view/edit a ticket (status, priority, subject, description)
 *                    + comment thread + add comment
 *  • New ticket    — create a new ticket
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  listDeskTickets,
  listDeskTicketsByEmail,
  createDeskTicket,
  updateDeskTicket,
  getDeskTicket,
  getDeskTicketComments,
  addDeskTicketComment,
  statusColor,
  isDeskTokenError,
  type ZohoDeskTicket,
  type ZohoDeskComment,
  type TicketStatusFilter,
} from '../lib/zohoDeskClient';
import { refreshZohoAccessToken } from '../lib/zohoBooksClient';
import type { UserFormData } from '../types';

interface Props { currentUser?: UserFormData | null; }

type View = 'list' | 'new' | 'detail';
type SupportRole = 'guest' | 'client' | 'professional' | 'admin';

const STATUS_FILTERS: TicketStatusFilter[] = ['All', 'Open', 'In Progress', 'On Hold', 'Closed', 'Resolved'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;
const STATUSES   = ['Open', 'In Progress', 'On Hold', 'Closed', 'Resolved'] as const;

function resolveSupportRole(user?: UserFormData | null): SupportRole {
  if (!user) return 'guest';
  const role = (user.user_type || 'client').toLowerCase();
  if (role === 'administrator' || role === 'admin') return 'admin';
  if (role === 'professional') return 'professional';
  return 'client';
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', padding: '0.55rem 0.8rem', fontSize: '0.9rem',
  border: '1px solid #cbd5e1', borderRadius: '7px',
  boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none',
  background: 'white',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: '0.72rem', fontWeight: 700,
  color: '#475569', marginBottom: '0.28rem',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};
const fieldWrap: React.CSSProperties = { marginBottom: '1rem' };
const btn = (color: string, disabled = false): React.CSSProperties => ({
  padding: '0.55rem 1.2rem', background: disabled ? '#e2e8f0' : color,
  color: disabled ? '#94a3b8' : 'white', border: 'none', borderRadius: '7px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontWeight: 600, fontSize: '0.88rem',
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
});

// ── Helper: priority badge colour ─────────────────────────────────────────────
function priorityColor(p: string) {
  if (p === 'Urgent') return '#dc2626';
  if (p === 'High')   return '#ea580c';
  if (p === 'Medium') return '#d97706';
  return '#64748b';
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const c = statusColor(status);
  return (
    <span style={{
      padding: '0.18rem 0.6rem', borderRadius: '10px',
      fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em',
      background: `${c}18`, color: c, border: `1px solid ${c}44`,
      textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>
      {status || '—'}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function SupportTicketPanel({ currentUser }: Props) {
  const { language } = useLanguage();
  const t = (en: string, es: string) => language === 'es' ? es : en;
  const role = resolveSupportRole(currentUser);
  const isAdmin = role === 'admin';
  const isSignedIn = role !== 'guest';

  const [view, setView]                 = useState<View>('list');
  const [statusFilter, setStatusFilter] = useState<TicketStatusFilter>('All');
  const [search, setSearch]             = useState('');
  const [tickets, setTickets]           = useState<ZohoDeskTicket[]>([]);
  const [loading, setLoading]           = useState(false);
  const [listError, setListError]       = useState<string | null>(null);
  const [selectedId, setSelectedId]     = useState<string | null>(null);

  const isScopeError = (msg: string | null) =>
    !!msg && /scope|permission|does not contain/i.test(msg);

  // ── Token-refresh wrapper ─────────────────────────────────────────────────
  const withToken = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    try { return await fn(); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isDeskTokenError(msg)) {
        const tok = await refreshZohoAccessToken();
        if (!tok) throw new Error(t(
          'Zoho token expired — regenerate via Generate Zoho Token.',
          'Token Zoho expirado — regenere vía Generar Zoho Token.',
        ));
        localStorage.setItem('zoho_access_token', tok);
        return await fn();
      }
      throw err;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load ticket list ──────────────────────────────────────────────────────
  const loadTickets = useCallback(async (sf = statusFilter) => {
    if (!isSignedIn) {
      setTickets([]);
      setLoading(false);
      setListError(null);
      return;
    }

    setLoading(true);
    setListError(null);
    try {
      let data: ZohoDeskTicket[];
      if (isAdmin) {
        data = await withToken(() => listDeskTickets(sf));
      } else {
        const email = currentUser?.email?.trim();
        if (!email) {
          setTickets([]);
          setListError(t(
            'Your account has no email — cannot load your tickets.',
            'Su cuenta no tiene correo — no se pueden cargar sus tickets.',
          ));
          return;
        }
        data = await withToken(() => listDeskTicketsByEmail(email, sf));
        // Extra client-side filter by email in case API returns broader results
        const emailLc = email.toLowerCase();
        data = data.filter(tk =>
          (tk.email || '').toLowerCase() === emailLc ||
          (tk.contact?.email || '').toLowerCase() === emailLc,
        );
      }
      setTickets(data);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, withToken, isSignedIn, isAdmin, currentUser?.email, language]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view === 'list' && isSignedIn) loadTickets();
  }, [view, statusFilter, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtered ticket list ──────────────────────────────────────────────────
  const visible = tickets.filter(tk => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      tk.subject?.toLowerCase().includes(q) ||
      tk.ticketNumber?.toLowerCase().includes(q) ||
      tk.email?.toLowerCase().includes(q) ||
      tk.contact?.name?.toLowerCase().includes(q)
    );
  });

  // ── Navigation helpers ────────────────────────────────────────────────────
  const openDetail = (id: string) => { setSelectedId(id); setView('detail'); };
  const goList     = () => { setView('list'); setSelectedId(null); };

  // ── Guest: no tickets / problems shown ────────────────────────────────────
  if (!isSignedIn) {
    return (
      <section className="section">
        <h2 style={{ margin: '0 0 0.75rem', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6c63ff" strokeWidth="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.65 3.37 2 2 0 0 1 3.64 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 5.55 5.55l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          {t('Mentalma Support', 'Soporte Mentalma')}
        </h2>
        <div style={{
          padding: '1.25rem 1.4rem', background: '#fff7ed', border: '1px solid #fdba74',
          borderRadius: '10px', color: '#9a3412', maxWidth: '520px',
        }}>
          <strong style={{ display: 'block', marginBottom: '0.35rem' }}>
            {t('Sign in required', 'Inicio de sesión requerido')}
          </strong>
          <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>
            {t(
              'Please sign in to view or create support tickets. Ticket details are only shown for signed-in users.',
              'Inicie sesión para ver o crear tickets de soporte. Los detalles solo se muestran a usuarios autenticados.',
            )}
          </p>
        </div>
      </section>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VIEW: LIST
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'list') return (
    <section className="section">
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ margin: '0 0 0.25rem', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6c63ff" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.65 3.37 2 2 0 0 1 3.64 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 5.55 5.55l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            {t('Mentalma Support', 'Soporte Mentalma')}
          </h2>
          <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b' }}>
            {isAdmin
              ? t('Manage all support tickets', 'Gestione todos los tickets de soporte')
              : t('View and manage your support tickets', 'Vea y gestione sus tickets de soporte')}
          </p>
        </div>
        <button style={btn('#6c63ff')} onClick={() => setView('new')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t('New Ticket', 'Nuevo Ticket')}
        </button>
      </div>

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '1rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0' }}>
        {STATUS_FILTERS.map(sf => (
          <button key={sf} type="button"
            onClick={() => { setStatusFilter(sf); loadTickets(sf); }}
            style={{
              padding: '0.5rem 1rem', background: 'none', border: 'none',
              borderBottom: statusFilter === sf ? '2px solid #6c63ff' : '2px solid transparent',
              marginBottom: '-2px',
              fontWeight: statusFilter === sf ? 700 : 500,
              color: statusFilter === sf ? '#6c63ff' : '#64748b',
              fontSize: '0.86rem', cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'color 0.15s',
            }}
          >
            {sf === 'All' ? t('All', 'Todos') :
             sf === 'Open' ? t('Open', 'Abierto') :
             sf === 'In Progress' ? t('In Progress', 'En Progreso') :
             sf === 'On Hold' ? t('On Hold', 'En Espera') :
             sf === 'Closed' ? t('Closed', 'Cerrado') :
             t('Resolved', 'Resuelto')}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '1rem', position: 'relative' }}>
        <svg style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          style={{ ...inp, paddingLeft: '2.2rem', maxWidth: '400px' }}
          placeholder={t('Search by subject, ticket #, email…', 'Buscar por asunto, ticket #, email…')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Error */}
      {listError && isScopeError(listError) && (
        <div style={{ padding: '1.1rem 1.3rem', background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: '10px', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, color: '#92400e', marginBottom: '0.4rem', fontSize: '0.95rem' }}>
            🔑 {t('Zoho token is missing Desk permissions', 'El token de Zoho no tiene permisos de Desk')}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#78350f', marginBottom: '0.75rem' }}>
            {t(
              'Your Zoho token was issued without Desk scopes. You need to re-authorize and include Desk permissions.',
              'Su token de Zoho fue emitido sin permisos de Desk. Debe re-autorizar e incluir los permisos de Desk.',
            )}
          </div>
          <div style={{ fontSize: '0.82rem', color: '#78350f', background: '#fef3c7', borderRadius: '6px', padding: '0.6rem 0.8rem', marginBottom: '0.75rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {t('Required scopes to paste in Zoho API Console → Self Client → Generate Code:', 'Scopes requeridos — pegar en Consola API Zoho → Self Client → Generate Code:')}<br/>
            ZohoBooks.contacts.CREATE,ZohoBooks.contacts.READ,ZohoBooks.invoices.CREATE,ZohoBooks.invoices.READ,Desk.tickets.ALL,Desk.contacts.READ,Desk.departments.READ,Desk.search.READ
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <a
              href="https://api-console.zoho.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...btn('#e65100'), textDecoration: 'none' }}
            >
              {t('Open Zoho API Console', 'Abrir Consola API Zoho')} ↗
            </a>
            <button onClick={() => loadTickets()} style={btn('#64748b')}>
              {t('Retry', 'Reintentar')}
            </button>
          </div>
        </div>
      )}
      {listError && !isScopeError(listError) && (
        <div style={{ padding: '0.85rem 1.1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '0.88rem', marginBottom: '1rem' }}>
          ✗ {listError}
          <button onClick={() => loadTickets()} style={{ marginLeft: '1rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.88rem', textDecoration: 'underline' }}>
            {t('Retry', 'Reintentar')}
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 0.75rem' }} />
          {t('Loading tickets…', 'Cargando tickets…')}
        </div>
      )}

      {/* Ticket table */}
      {!loading && !listError && (
        visible.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', padding: '2rem 0', textAlign: 'center' }}>
            {t('No tickets found.', 'No se encontraron tickets.')}
          </p>
        ) : (
          <div style={{ borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr 180px 120px 100px 140px 48px',
              background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
              padding: '0.55rem 1rem', gap: '0.5rem',
            }}>
              {['#', t('Subject','Asunto'), t('Contact','Contacto'), t('Status','Estado'), t('Priority','Prioridad'), t('Modified','Modificado'), ''].map((h,i) => (
                <span key={i} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
              ))}
            </div>

            {/* Rows */}
            {visible.map(tk => (
              <div key={tk.id}
                onClick={() => openDetail(tk.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 1fr 180px 120px 100px 140px 48px',
                  padding: '0.75rem 1rem', gap: '0.5rem',
                  borderBottom: '1px solid #f1f5f9',
                  alignItems: 'center', cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                  #{tk.ticketNumber || tk.id.slice(0, 6)}
                </span>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tk.subject}
                </span>
                <span style={{ fontSize: '0.82rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tk.contact?.name || tk.email || '—'}
                </span>
                <span><StatusBadge status={tk.status} /></span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: priorityColor(tk.priority) }}>
                  {tk.priority || '—'}
                </span>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  {tk.modifiedTime ? new Date(tk.modifiedTime).toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            ))}
          </div>
        )
      )}

      <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
    </section>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // VIEW: NEW TICKET
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'new') return (
    <NewTicketForm
      currentUser={currentUser}
      isAdmin={isAdmin}
      withToken={withToken}
      language={language}
      onCreated={() => { setStatusFilter('Open'); setView('list'); }}
      onCancel={goList}
    />
  );

  // ─────────────────────────────────────────────────────────────────────────
  // VIEW: DETAIL
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'detail' && selectedId) return (
    <TicketDetail
      ticketId={selectedId}
      isAdmin={isAdmin}
      withToken={withToken}
      language={language}
      onBack={goList}
      onUpdated={() => loadTickets()}
    />
  );

  return null;
}

// ── NewTicketForm ─────────────────────────────────────────────────────────────
interface NewTicketFormProps {
  currentUser?: UserFormData | null;
  isAdmin: boolean;
  withToken: <T>(fn: () => Promise<T>) => Promise<T>;
  language: string;
  onCreated: () => void;
  onCancel: () => void;
}

function NewTicketForm({ currentUser, isAdmin, withToken, language, onCreated, onCancel }: NewTicketFormProps) {
  const t = (en: string, es: string) => language === 'es' ? es : en;

  const [subject,      setSubject]      = useState('');
  const [description,  setDescription]  = useState('');
  const [priority,     setPriority]     = useState<'Low' | 'Medium' | 'High' | 'Urgent'>('Medium');
  const [contactEmail, setContactEmail] = useState(currentUser?.email ?? '');
  const [contactName,  setContactName]  = useState(currentUser?.full_name ?? '');
  const [ticketRef,    setTicketRef]    = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Non-admins may only create tickets under their own email
    const email = isAdmin
      ? contactEmail.trim()
      : (currentUser?.email ?? '').trim();
    if (!subject.trim() || !description.trim() || !email) return;
    setSubmitting(true); setError(null);
    try {
      await withToken(() => createDeskTicket({
        subject: subject.trim(),
        description: description.trim(),
        contactEmail: email,
        contactName: (isAdmin ? contactName : currentUser?.full_name ?? contactName).trim() || undefined,
        priority,
        ticketNumber: ticketRef.trim() || undefined,
      }));
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="section">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button type="button" onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6c63ff', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.88rem', fontWeight: 600 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          {t('Back', 'Volver')}
        </button>
        <h2 style={{ margin: 0, color: '#1e3a8a', fontSize: '1.1rem' }}>
          {t('New Support Ticket', 'Nuevo Ticket de Soporte')}
        </h2>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: '660px' }}>
        {error && (
          <div style={{ padding: '0.8rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '0.88rem', marginBottom: '1rem' }}>
            ✗ {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={fieldWrap}>
            <label style={lbl}>{t('Contact Name', 'Nombre del Contacto')}</label>
            <input
              style={{ ...inp, background: isAdmin ? 'white' : '#f8fafc' }}
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              placeholder={t('Full name', 'Nombre completo')}
              readOnly={!isAdmin}
            />
          </div>
          <div style={fieldWrap}>
            <label style={lbl}>{t('Contact Email', 'Email del Contacto')} *</label>
            <input
              style={{ ...inp, background: isAdmin ? 'white' : '#f8fafc' }}
              type="email"
              required
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              placeholder="email@example.com"
              readOnly={!isAdmin}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={fieldWrap}>
            <label style={lbl}>{t('Reference / Ticket No.', 'Referencia / No. Ticket')} <span style={{ fontWeight: 400, textTransform: 'none', color: '#94a3b8' }}>({t('optional','opcional')})</span></label>
            <input style={inp} value={ticketRef} onChange={e => setTicketRef(e.target.value)} placeholder="TKT-2026-001" />
          </div>
          <div style={fieldWrap}>
            <label style={lbl}>{t('Priority', 'Prioridad')}</label>
            <select style={inp} value={priority} onChange={e => setPriority(e.target.value as typeof priority)}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p === 'Low' ? t('Low','Baja') : p === 'Medium' ? t('Medium','Media') : p === 'High' ? t('High','Alta') : t('Urgent','Urgente')}</option>)}
            </select>
          </div>
        </div>

        <div style={fieldWrap}>
          <label style={lbl}>{t('Subject', 'Asunto')} *</label>
          <input style={inp} required value={subject} onChange={e => setSubject(e.target.value)} placeholder={t('Brief summary of the issue', 'Resumen breve del problema')} />
        </div>

        <div style={fieldWrap}>
          <label style={lbl}>{t('Description', 'Descripción')} *</label>
          <textarea style={{ ...inp, resize: 'vertical', lineHeight: '1.55' }} rows={6} required value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('Steps to reproduce, error messages, etc.', 'Pasos para reproducir, mensajes de error, etc.')} />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="submit" disabled={submitting} style={btn('#6c63ff', submitting)}>
            {submitting
              ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />{t('Submitting…','Enviando…')}</>
              : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>{t('Submit Ticket','Enviar Ticket')}</>
            }
          </button>
          <button type="button" onClick={onCancel} style={{ ...btn('#f1f5f9'), color: '#475569' }}>{t('Cancel','Cancelar')}</button>
        </div>
      </form>
      <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
    </section>
  );
}

// ── TicketDetail ──────────────────────────────────────────────────────────────
interface TicketDetailProps {
  ticketId: string;
  isAdmin: boolean;
  withToken: <T>(fn: () => Promise<T>) => Promise<T>;
  language: string;
  onBack: () => void;
  onUpdated: () => void;
}

function TicketDetail({ ticketId, isAdmin, withToken, language, onBack, onUpdated }: TicketDetailProps) {
  const t = (en: string, es: string) => language === 'es' ? es : en;

  const [ticket,    setTicket]    = useState<ZohoDeskTicket | null>(null);
  const [comments,  setComments]  = useState<ZohoDeskComment[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [saveMsg,   setSaveMsg]   = useState<{ ok: boolean; text: string } | null>(null);

  // editable fields
  const [status,   setStatus]   = useState('');
  const [priority, setPriority] = useState('');
  const [subject,  setSubject]  = useState('');

  // comment
  const [comment,       setComment]       = useState('');
  const [commentPublic, setCommentPublic] = useState(true);
  const [addingComment, setAddingComment] = useState(false);

  const commentsEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [tk, cmts] = await Promise.all([
        withToken(() => getDeskTicket(ticketId)),
        withToken(() => getDeskTicketComments(ticketId)),
      ]);
      setTicket(tk);
      setStatus(tk.status);
      setPriority(tk.priority);
      setSubject(tk.subject);
      setComments(cmts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ticketId, withToken]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [comments]);

  const handleSave = async () => {
    if (!ticket) return;
    setSaving(true); setSaveMsg(null);
    try {
      await withToken(() => updateDeskTicket(ticketId, { status, priority, subject }));
      setSaveMsg({ ok: true, text: t('Ticket updated.', 'Ticket actualizado.') });
      onUpdated();
      await load();
    } catch (e) {
      setSaveMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    setAddingComment(true);
    try {
      await withToken(() => addDeskTicketComment(ticketId, comment.trim(), commentPublic));
      setComment('');
      const cmts = await withToken(() => getDeskTicketComments(ticketId));
      setComments(cmts);
    } catch (e) {
      setSaveMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setAddingComment(false);
    }
  };

  if (loading) return (
    <section className="section">
      <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 0.75rem' }} />
        {t('Loading ticket…', 'Cargando ticket…')}
      </div>
      <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
    </section>
  );

  if (error) return (
    <section className="section">
      <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6c63ff', fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '1rem' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        {t('Back', 'Volver')}
      </button>
      <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626' }}>{error}</div>
    </section>
  );

  if (!ticket) return null;

  const isDirty = status !== ticket.status || priority !== ticket.priority || subject !== ticket.subject;

  return (
    <section className="section">
      {/* Back + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6c63ff', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.88rem', fontWeight: 600 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          {t('All Tickets', 'Todos los Tickets')}
        </button>
        <span style={{ color: '#cbd5e1' }}>›</span>
        <span style={{ fontSize: '0.88rem', color: '#64748b', fontFamily: 'monospace' }}>#{ticket.ticketNumber || ticket.id.slice(0,8)}</span>
        {isAdmin && ticket.webUrl && (
          <a href={ticket.webUrl} target="_blank" rel="noopener noreferrer"
            style={{ marginLeft: 'auto', fontSize: '0.82rem', color: '#6c63ff', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {t('Open in Zoho Desk ↗', 'Abrir en Zoho Desk ↗')}
          </a>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.5rem', alignItems: 'start' }}>

        {/* ── Left: Ticket info + comments ── */}
        <div>
          {/* Subject */}
          <div style={fieldWrap}>
            <label style={lbl}>{t('Subject', 'Asunto')}</label>
            <input style={inp} value={subject} onChange={e => setSubject(e.target.value)} />
          </div>

          {/* Meta */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem', fontSize: '0.82rem', color: '#64748b' }}>
            <span><strong>{t('Contact','Contacto')}:</strong> {ticket.contact?.name || ticket.email || '—'}</span>
            <span><strong>{t('Created','Creado')}:</strong> {ticket.createdTime ? new Date(ticket.createdTime).toLocaleString(language === 'es' ? 'es-CO' : 'en-US') : '—'}</span>
            <span><strong>{t('Modified','Modificado')}:</strong> {ticket.modifiedTime ? new Date(ticket.modifiedTime).toLocaleString(language === 'es' ? 'es-CO' : 'en-US') : '—'}</span>
          </div>

          {/* Description */}
          <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#334155', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
              {ticket.description || <em style={{ color: '#94a3b8' }}>{t('No description.', 'Sin descripción.')}</em>}
            </p>
          </div>

          {/* Comments */}
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', color: '#1e3a8a' }}>
            {t('Comments', 'Comentarios')} ({comments.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1rem', maxHeight: '340px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {comments.length === 0
              ? <p style={{ color: '#94a3b8', fontSize: '0.88rem' }}>{t('No comments yet.', 'Sin comentarios aún.')}</p>
              : comments.map(c => (
                <div key={c.id} style={{
                  padding: '0.75rem 1rem', borderRadius: '8px',
                  background: c.isPublic ? '#eff6ff' : '#fafaf5',
                  border: `1px solid ${c.isPublic ? '#bfdbfe' : '#e9e9d3'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.75rem', color: '#64748b' }}>
                    <strong style={{ color: '#1e293b' }}>{c.author?.name || t('Agent','Agente')}</strong>
                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {!c.isPublic && <span style={{ background: '#fef9c3', color: '#854d0e', padding: '0 0.4rem', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700 }}>{t('INTERNAL','INTERNO')}</span>}
                      {c.createdTime ? new Date(c.createdTime).toLocaleString(language === 'es' ? 'es-CO' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: '#334155', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{c.content}</p>
                </div>
              ))
            }
            <div ref={commentsEndRef} />
          </div>

          {/* Add comment */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem' }}>
            <label style={lbl}>{t('Add Comment', 'Agregar Comentario')}</label>
            <textarea
              style={{ ...inp, resize: 'vertical', lineHeight: '1.55', marginBottom: '0.65rem' }}
              rows={3} value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={t('Write a comment…', 'Escriba un comentario…')}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: '#475569', cursor: 'pointer' }}>
                <input type="checkbox" checked={commentPublic} onChange={e => setCommentPublic(e.target.checked)} />
                {t('Public (visible to customer)', 'Público (visible al cliente)')}
              </label>
              <button type="button" onClick={handleAddComment} disabled={addingComment || !comment.trim()} style={btn('#6c63ff', addingComment || !comment.trim())}>
                {addingComment
                  ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />{t('Posting…','Enviando…')}</>
                  : t('Post Comment', 'Publicar Comentario')
                }
              </button>
            </div>
          </div>
        </div>

        {/* ── Right: Status / Priority editor ── */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', position: 'sticky', top: '1rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: '#1e3a8a' }}>{t('Ticket Details', 'Detalles del Ticket')}</h3>

          <div style={fieldWrap}>
            <label style={lbl}>{t('Status', 'Estado')}</label>
            <select style={inp} value={status} onChange={e => setStatus(e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s === 'Open' ? t('Open','Abierto') : s === 'In Progress' ? t('In Progress','En Progreso') : s === 'On Hold' ? t('On Hold','En Espera') : s === 'Closed' ? t('Closed','Cerrado') : t('Resolved','Resuelto')}</option>)}
            </select>
          </div>

          <div style={fieldWrap}>
            <label style={lbl}>{t('Priority', 'Prioridad')}</label>
            <select style={inp} value={priority} onChange={e => setPriority(e.target.value)}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p === 'Low' ? t('Low','Baja') : p === 'Medium' ? t('Medium','Media') : p === 'High' ? t('High','Alta') : t('Urgent','Urgente')}</option>)}
            </select>
          </div>

          {saveMsg && (
            <div style={{ padding: '0.6rem 0.85rem', borderRadius: '7px', marginBottom: '0.75rem', fontSize: '0.83rem', fontWeight: 500,
              background: saveMsg.ok ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${saveMsg.ok ? '#bbf7d0' : '#fecaca'}`,
              color: saveMsg.ok ? '#15803d' : '#dc2626' }}>
              {saveMsg.ok ? '✓ ' : '✗ '}{saveMsg.text}
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            style={{ ...btn('#6c63ff', saving || !isDirty), width: '100%', justifyContent: 'center' }}
          >
            {saving
              ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />{t('Saving…','Guardando…')}</>
              : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>{t('Save Changes','Guardar Cambios')}</>
            }
          </button>
        </div>
      </div>

      <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
    </section>
  );
}
