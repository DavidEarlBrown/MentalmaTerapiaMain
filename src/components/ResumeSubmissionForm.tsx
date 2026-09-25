import { useState, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useProfession } from '../contexts/ProfessionContext';
import { supabase } from '../lib/supabaseClient';
import type { UserFormData } from '../types';

const RESUME_BUCKET = 'psychologist-resumes';

interface ResumeSubmissionFormProps {
  onSubmit?: (application: Record<string, unknown>) => void;
  loading?: boolean;
  currentUser?: UserFormData | null;
}

export function ResumeSubmissionForm({ onSubmit, currentUser }: ResumeSubmissionFormProps) {
  const { language } = useLanguage();
  const { professions, activeProfession } = useProfession();
  const activeProfessions = professions.filter(p => p.is_active !== false);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: currentUser?.full_name || '',
    email: currentUser?.email || '',
    country: '',
    language: '',
    therapyTypes: '',
    reason: '',
    profesion_id: activeProfession?.id || '',
  });

  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeWarning, setResumeWarning] = useState<string | null>(null);

  const t = (_key: string, en: string, es: string) => language === 'es' ? es : en;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setResumeFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // Upload resume to psychologist-resumes bucket (non-fatal if it fails)
      if (resumeFile && currentUser?.id) {
        const ext = resumeFile.name.split('.').pop();
        const fileName = `${currentUser.id}/resume.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from(RESUME_BUCKET)
          .upload(fileName, resumeFile, { upsert: true });

        if (uploadError) {
          console.error('Resume upload error:', uploadError);
          setResumeWarning(
            language === 'es'
              ? `Solicitud enviada, pero el curriculum no se pudo subir: ${uploadError.message}`
              : `Application submitted, but resume could not be uploaded: ${uploadError.message}`
          );
        }
      }

      // Save to the applications table
      const { data, error: insertError } = await supabase
        .from('applications')
        .insert({
          name: formData.name.trim(),
          email: formData.email.trim(),
          country: formData.country.trim(),
          language: formData.language.trim(),
          type_therapy: formData.therapyTypes.trim(),
          reason_for_interest: formData.reason.trim(),
          app_status: 'Pending',
          profession_id: formData.profesion_id || null,
          user_id: currentUser?.id ?? null,
        })
        .select()
        .single();

      if (insertError) throw new Error(insertError.message);

      setSubmitted(true);
      onSubmit?.(data as Record<string, unknown>);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : language === 'es'
            ? 'Error al enviar la solicitud.'
            : 'Failed to submit application.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentUser) {
    return (
      <section className="section">
        <h2>{t('', 'Work With Us', 'Trabaje Con Nosotros')}</h2>
        <div style={{
          padding: '2rem',
          backgroundColor: '#fffbeb',
          border: '1px solid #fcd34d',
          borderRadius: '10px',
          textAlign: 'center',
          marginTop: '2rem',
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" style={{ marginBottom: '1rem' }}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <h3 style={{ color: '#92400e', marginBottom: '0.5rem' }}>
            {t('', 'Sign In Required', 'Inicio de Sesión Requerido')}
          </h3>
          <p style={{ color: '#78350f' }}>
            {t('', 'Please sign in or create an account to submit your professional application.', 'Por favor inicie sesión o cree una cuenta para enviar su solicitud profesional.')}
          </p>
        </div>
      </section>
    );
  }

  if (submitted) {
    return (
      <section className="section">
        <div style={{
          textAlign: 'center',
          padding: '3rem 2rem',
          backgroundColor: '#f0fdf4',
          borderRadius: '12px',
          border: '1px solid #bbf7d0',
        }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" style={{ marginBottom: '1rem' }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <h2 style={{ color: '#15803d', marginBottom: '0.75rem' }}>
            {t('', 'Application Submitted!', '¡Solicitud Enviada!')}
          </h2>
          <p style={{ color: '#166534', maxWidth: '500px', margin: '0 auto' }}>
            {t('', 'Thank you for your interest in joining our team. We will review your application and contact you if your profile matches our needs.', 'Gracias por su interés en unirse a nuestro equipo. Revisaremos su solicitud y nos pondremos en contacto si su perfil se ajusta a nuestras necesidades.')}
          </p>
          {resumeWarning && (
            <div style={{
              marginTop: '1.5rem',
              padding: '0.75rem 1rem',
              backgroundColor: '#fffbeb',
              border: '1px solid #fcd34d',
              borderRadius: '8px',
              color: '#92400e',
              fontSize: '0.85rem',
              maxWidth: '500px',
              margin: '1.5rem auto 0',
            }}>
              ⚠️ {resumeWarning}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="section resume-submission">
      <h2>{t('', 'Work With Us', 'Trabaje Con Nosotros')}</h2>
      <p className="section-subtitle">
        {t('', 'Join our team of mental health professionals. Fill in the form below and attach your resume.', 'Únase a nuestro equipo de profesionales de salud mental. Complete el formulario a continuación y adjunte su curriculum.')}
      </p>

      <form onSubmit={handleSubmit} className="resume-form">

        <div className="form-group">
          <label htmlFor="app-name">
            {t('', 'Full Name', 'Nombre Completo')} <span className="required">*</span>
          </label>
          <input
            id="app-name"
            type="text"
            value={formData.name}
            onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
            placeholder={t('', 'Enter your full name', 'Ingrese su nombre completo')}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="app-email">
            {t('', 'Email', 'Correo Electrónico')} <span className="required">*</span>
          </label>
          <input
            id="app-email"
            type="email"
            value={formData.email}
            onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
            placeholder={t('', 'Enter your email address', 'Ingrese su correo electrónico')}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="app-country">
            {t('', 'Country', 'País')} <span className="required">*</span>
          </label>
          <input
            id="app-country"
            type="text"
            value={formData.country}
            onChange={e => setFormData(p => ({ ...p, country: e.target.value }))}
            placeholder={t('', 'Country of residence', 'País de residencia')}
            required
          />
        </div>

        {activeProfessions.length > 1 && (
          <div className="form-group">
            <label htmlFor="app-profession">
              {t('', 'Practice Area', 'Área de Práctica')} <span className="required">*</span>
            </label>
            <select
              id="app-profession"
              value={formData.profesion_id}
              onChange={e => setFormData(p => ({ ...p, profesion_id: e.target.value }))}
              style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }}
              required
            >
              <option value="">{t('', 'Select a practice area…', 'Seleccione un área de práctica…')}</option>
              {activeProfessions.map(p => (
                <option key={p.id} value={p.id}>
                  {language === 'es' ? p.name_es : p.name_en}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="app-languages">
            {t('', 'Languages', 'Idiomas')} <span className="required">*</span>
          </label>
          <input
            id="app-languages"
            type="text"
            value={formData.language}
            onChange={e => setFormData(p => ({ ...p, language: e.target.value }))}
            placeholder={t('', 'e.g. English, Spanish, French', 'ej. Inglés, Español, Francés')}
            required
          />
          <small>{t('', 'Separate multiple languages with commas', 'Separe varios idiomas con comas')}</small>
        </div>

        <div className="form-group">
          <label htmlFor="app-therapy">
            {t('', 'Therapy Types / Specializations', 'Tipos de Terapia / Especializaciones')} <span className="required">*</span>
          </label>
          <input
            id="app-therapy"
            type="text"
            value={formData.therapyTypes}
            onChange={e => setFormData(p => ({ ...p, therapyTypes: e.target.value }))}
            placeholder={t('', 'e.g. Cognitive Behavioral, Family Therapy, Psychoanalysis', 'ej. Cognitivo-Conductual, Terapia Familiar, Psicoanálisis')}
            required
          />
          <small>{t('', 'Separate multiple types with commas', 'Separe varios tipos con comas')}</small>
        </div>

        <div className="form-group">
          <label htmlFor="app-reason">
            {t('', 'Reason for Interest', 'Razón de Interés')} <span className="required">*</span>
          </label>
          <input
            id="app-reason"
            type="text"
            value={formData.reason}
            onChange={e => setFormData(p => ({ ...p, reason: e.target.value }))}
            placeholder={t('', 'e.g. Professional growth, Flexible schedule, Help more clients', 'ej. Crecimiento profesional, Horario flexible, Ayudar más clientes')}
            required
          />
          <small>{t('', 'Separate multiple reasons with commas', 'Separe varias razones con comas')}</small>
        </div>

        {/* Resume upload */}
        <div className="form-group">
          <label>
            {t('', 'Resume / CV', 'Curriculum / CV')}
            <span style={{ color: '#718096', fontWeight: 400, marginLeft: '0.5rem', fontSize: '0.85rem' }}>
              {t('', '(optional)', '(opcional)')}
            </span>
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
            <button
              type="button"
              onClick={() => resumeInputRef.current?.click()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 1.25rem',
                backgroundColor: '#0f766e',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.9rem',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              {t('', 'Choose File', 'Seleccionar Archivo')}
            </button>

            <span style={{ fontSize: '0.85rem', color: resumeFile ? '#15803d' : '#94a3b8' }}>
              {resumeFile
                ? resumeFile.name
                : t('', 'No file chosen — PDF, Word, JPG, PNG (max 10 MB)', 'Ningún archivo — PDF, Word, JPG, PNG (máx 10 MB)')}
            </span>
          </div>

          <input
            ref={resumeInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        {error && (
          <div style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#dc2626',
            fontSize: '0.9rem',
            marginBottom: '0.5rem',
          }}>
            {error}
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting
              ? t('', 'Submitting…', 'Enviando…')
              : t('', 'Submit Application', 'Enviar Solicitud')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={submitting}
            onClick={() => {
              setFormData({ name: currentUser?.full_name || '', email: currentUser?.email || '', country: '', language: '', therapyTypes: '', reason: '', profesion_id: activeProfession?.id || '' });
              setResumeFile(null);
              setError(null);
              if (resumeInputRef.current) resumeInputRef.current.value = '';
            }}
          >
            {t('', 'Reset Form', 'Limpiar Formulario')}
          </button>
        </div>
      </form>

      <div className="submission-info">
        <h3>{t('', 'What Happens Next?', '¿Qué Pasa Después?')}</h3>
        <ol>
          <li>{t('', 'Your application will be reviewed by our team', 'Nuestro equipo revisará su solicitud')}</li>
          <li>{t('', 'We will contact you if your profile matches our needs', 'Nos pondremos en contacto si su perfil se ajusta a nuestras necesidades')}</li>
          <li>{t('', 'Qualified candidates will be invited for an interview', 'Los candidatos calificados serán invitados a una entrevista')}</li>
          <li>{t('', 'Successful applicants will be onboarded to our platform', 'Los solicitantes seleccionados serán incorporados a nuestra plataforma')}</li>
        </ol>
      </div>
    </section>
  );
}
