import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabaseClient';

const RESUME_BUCKET = 'psychologist-resumes';

interface Application {
  id: string;
  created_at: string;
  name: string;
  email: string | null;
  country: string;
  language: string;
  type_therapy: string;
  reason_for_interest: string;
  app_status: string;
  profession_id: string | null;
  user_id: string | null;
}

type StatusFilter = 'all' | 'Pending' | 'Accepted' | 'Rejected';

const defaultProfessionalPasswordHint = import.meta.env.VITE_DEFAULT_PROFESSIONAL_PASSWORD?.trim();

export function ApplicationManager() {
  const { language } = useLanguage();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Pending');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resumeUrls, setResumeUrls] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const t = (en: string, es: string) => language === 'es' ? es : en;

  useEffect(() => { fetchApplications(); }, [statusFilter]);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('app_status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setApplications(data || []);
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const getResumeUrl = async (userId: string, appId: string) => {
    if (resumeUrls[appId]) {
      window.open(resumeUrls[appId], '_blank');
      return;
    }
    try {
      const { data: files } = await supabase.storage
        .from(RESUME_BUCKET)
        .list(userId, { limit: 5 });

      if (!files || files.length === 0) {
        showToast('error', t('No resume file found in storage.', 'No se encontró archivo de curriculum en el almacenamiento.'));
        return;
      }

      const latest = files.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0];
      const path = `${userId}/${latest.name}`;

      const { data: urlData } = await supabase.storage
        .from(RESUME_BUCKET)
        .createSignedUrl(path, 3600);

      if (urlData?.signedUrl) {
        setResumeUrls(prev => ({ ...prev, [appId]: urlData.signedUrl }));
        window.open(urlData.signedUrl, '_blank');
      }
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : String(err));
    }
  };

  const updateStatus = async (app: Application, newStatus: string) => {
    const { error } = await supabase
      .from('applications')
      .update({ app_status: newStatus })
      .eq('id', app.id);
    if (error) throw error;
  };

  const handleAccept = async (app: Application) => {
    if (!confirm(t(
      `Accept ${app.name} and promote to Professional role?`,
      `¿Aceptar a ${app.name} y promover al rol de Profesional?`
    ))) return;

    setActionLoading(app.id + '-accept');
    try {
      // 1. Update application status
      await updateStatus(app, 'Accepted');

      // 2. Upgrade the user record to Professional (they already have an account)
      if (app.user_id) {
        const { error: userError } = await supabase
          .from('users')
          .update({
            user_type: 'Professional',
            role: 'professional',
          })
          .eq('id', app.user_id);
        if (userError) throw userError;
      }

      showToast('success', t(
        `${app.name} accepted. Their account has been upgraded to Professional.`,
        `${app.name} aceptado. Su cuenta ha sido promovida a Profesional.`
      ));
      fetchApplications();
      setExpanded(null);
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (app: Application) => {
    if (!confirm(t(
      `Reject application from ${app.name}?`,
      `¿Rechazar la solicitud de ${app.name}?`
    ))) return;

    setActionLoading(app.id + '-reject');
    try {
      await updateStatus(app, 'Rejected');
      showToast('success', t('Application rejected.', 'Solicitud rechazada.'));
      fetchApplications();
      setExpanded(null);
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleIgnore = async (app: Application) => {
    setActionLoading(app.id + '-ignore');
    try {
      await updateStatus(app, 'Ignored');
      showToast('success', t('Application marked as ignored.', 'Solicitud marcada como ignorada.'));
      fetchApplications();
      setExpanded(null);
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(null);
    }
  };

  const statusColor: Record<string, string> = {
    Pending:  '#d97706',
    Accepted: '#16a34a',
    Rejected: '#dc2626',
    Ignored:  '#6b7280',
  };

  const filterOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all',      label: t('All', 'Todas') },
    { value: 'Pending',  label: t('Pending', 'Pendiente') },
    { value: 'Accepted', label: t('Accepted', 'Aceptada') },
    { value: 'Rejected', label: t('Rejected', 'Rechazada') },
  ];

  return (
    <div style={{ position: 'relative' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 9999,
          padding: '0.75rem 1.25rem',
          backgroundColor: toast.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${toast.type === 'success' ? '#86efac' : '#fca5a5'}`,
          borderRadius: '8px',
          color: toast.type === 'success' ? '#15803d' : '#dc2626',
          fontWeight: 600, fontSize: '0.9rem', maxWidth: '400px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.2rem' }}>
            {t('Review Applications', 'Revisar Solicitudes')}
          </h3>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
            {t('Manage professional applications submitted through Work With Us.', 'Gestione las solicitudes profesionales enviadas a través de Trabaje Con Nosotros.')}
          </p>
        </div>
        <button
          onClick={fetchApplications}
          style={{
            padding: '0.4rem 1rem', border: '1px solid #cbd5e0', borderRadius: '6px',
            background: 'white', cursor: 'pointer', fontSize: '0.85rem', color: '#475569',
          }}
        >
          ↻ {t('Refresh', 'Actualizar')}
        </button>
      </div>

      {/* Status Filter */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {filterOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            style={{
              padding: '0.4rem 1rem', borderRadius: '20px', border: '2px solid',
              borderColor: statusFilter === opt.value ? '#6c63ff' : '#e2e8f0',
              backgroundColor: statusFilter === opt.value ? '#6c63ff' : 'white',
              color: statusFilter === opt.value ? 'white' : '#4a5568',
              fontWeight: statusFilter === opt.value ? 600 : 400,
              cursor: 'pointer', fontSize: '0.85rem',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Application List */}
      {loading ? (
        <p style={{ color: '#64748b' }}>{t('Loading applications…', 'Cargando solicitudes…')}</p>
      ) : applications.length === 0 ? (
        <p style={{ color: '#64748b' }}>{t('No applications found.', 'No se encontraron solicitudes.')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {applications.map(app => {
            const isExpanded = expanded === app.id;
            const isActing = actionLoading?.startsWith(app.id);
            const status = app.app_status || 'Pending';

            return (
              <div key={app.id} style={{
                border: '1px solid #e2e8f0', borderRadius: '10px',
                overflow: 'hidden', backgroundColor: 'white',
                boxShadow: isExpanded ? '0 4px 12px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.05)',
              }}>
                {/* Row summary */}
                <div
                  onClick={() => setExpanded(isExpanded ? null : app.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    padding: '0.85rem 1.25rem', cursor: 'pointer',
                    flexWrap: 'wrap',
                    backgroundColor: isExpanded ? '#f8faff' : 'white',
                  }}
                >
                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <strong style={{ fontSize: '1rem', color: '#1e293b' }}>{app.name}</strong>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{app.email || '—'}</div>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#475569', minWidth: '80px' }}>{app.country}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', minWidth: '120px' }}>
                    {new Date(app.created_at).toLocaleDateString()}
                  </div>
                  <span style={{
                    padding: '0.25rem 0.75rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600,
                    backgroundColor: `${statusColor[status]}20`,
                    color: statusColor[status] || '#6b7280',
                    border: `1px solid ${statusColor[status] || '#6b7280'}40`,
                  }}>
                    {status}
                  </span>
                  <span style={{ color: '#94a3b8', fontSize: '1.1rem' }}>{isExpanded ? '▲' : '▼'}</span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: '1.25rem', borderTop: '1px solid #e2e8f0', backgroundColor: '#fafbff' }}>
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                      gap: '1rem', marginBottom: '1.25rem',
                    }}>
                      {[
                        { label: t('Languages', 'Idiomas'), value: app.language },
                        { label: t('Therapy Types', 'Tipos de Terapia'), value: app.type_therapy },
                        { label: t('Reason for Interest', 'Razón de Interés'), value: app.reason_for_interest },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                            {label}
                          </div>
                          <div style={{ fontSize: '0.9rem', color: '#1e293b' }}>{value || '—'}</div>
                        </div>
                      ))}
                    </div>

                    {/* View Resume button */}
                    {app.user_id && (
                      <button
                        onClick={() => getResumeUrl(app.user_id!, app.id)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                          padding: '0.5rem 1rem', borderRadius: '6px',
                          backgroundColor: '#0f766e', color: 'white', border: 'none',
                          cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                          marginBottom: '1.25rem',
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        {t('View Resume', 'Ver Curriculum')}
                      </button>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                      <button
                        onClick={() => handleAccept(app)}
                        disabled={!!isActing || status === 'Accepted'}
                        style={{
                          padding: '0.6rem 1.5rem', borderRadius: '6px', border: 'none',
                          backgroundColor: status === 'Accepted' ? '#d1fae5' : '#16a34a',
                          color: status === 'Accepted' ? '#15803d' : 'white',
                          fontWeight: 700, fontSize: '0.9rem',
                          cursor: status === 'Accepted' || isActing ? 'not-allowed' : 'pointer',
                          opacity: isActing ? 0.7 : 1,
                        }}
                      >
                        {actionLoading === app.id + '-accept'
                          ? t('Accepting…', 'Aceptando…')
                          : status === 'Accepted'
                            ? t('✓ Accepted', '✓ Aceptado')
                            : t('Accept', 'Aceptar')}
                      </button>

                      <button
                        onClick={() => handleReject(app)}
                        disabled={!!isActing || status === 'Rejected'}
                        style={{
                          padding: '0.6rem 1.5rem', borderRadius: '6px', border: 'none',
                          backgroundColor: status === 'Rejected' ? '#fee2e2' : '#dc2626',
                          color: status === 'Rejected' ? '#dc2626' : 'white',
                          fontWeight: 700, fontSize: '0.9rem',
                          cursor: status === 'Rejected' || isActing ? 'not-allowed' : 'pointer',
                          opacity: isActing ? 0.7 : 1,
                        }}
                      >
                        {actionLoading === app.id + '-reject'
                          ? t('Rejecting…', 'Rechazando…')
                          : status === 'Rejected'
                            ? t('✗ Rejected', '✗ Rechazado')
                            : t('Reject', 'Rechazar')}
                      </button>

                      <button
                        onClick={() => handleIgnore(app)}
                        disabled={!!isActing}
                        style={{
                          padding: '0.6rem 1.5rem', borderRadius: '6px',
                          border: '1px solid #cbd5e0', backgroundColor: 'white',
                          color: '#64748b', fontWeight: 600, fontSize: '0.9rem',
                          cursor: isActing ? 'not-allowed' : 'pointer',
                          opacity: isActing ? 0.7 : 1,
                        }}
                      >
                        {actionLoading === app.id + '-ignore'
                          ? t('Ignoring…', 'Ignorando…')
                          : t('Ignore', 'Ignorar')}
                      </button>
                    </div>

                    {status === 'Accepted' && (
                      <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#16a34a' }}>
                        {t(
                          '✓ This applicant\'s account has been upgraded to Professional role.',
                          '✓ La cuenta de este solicitante ha sido promovida al rol de Profesional.'
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {defaultProfessionalPasswordHint ? (
        <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#94a3b8' }}>
          {t(
            `Default password for new professionals: ${defaultProfessionalPasswordHint}`,
            `Contraseña predeterminada para nuevos profesionales: ${defaultProfessionalPasswordHint}`
          )}
        </p>
      ) : null}
    </div>
  );
}
