import { useState, type FormEvent } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { sendPasswordReset } from '../lib/auth';

interface ForgotPasswordFormProps {
  onBackToSignIn: () => void;
}

export function ForgotPasswordForm({ onBackToSignIn }: ForgotPasswordFormProps) {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('resetPassword'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="section">
      <h2 style={{ marginBottom: '0.5rem' }}>{t('resetPassword')}</h2>
      <p className="section-subtitle" style={{ marginBottom: '1.5rem', color: '#4a5568' }}>
        {t('checkYourEmail')}
      </p>

      {sent ? (
        <div style={{
          padding: '1.5rem',
          backgroundColor: '#f0fff4',
          border: '1px solid #9ae6b4',
          borderRadius: '8px',
          textAlign: 'center',
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#38a169" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem' }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <p style={{ color: '#276749', fontSize: '1rem', fontWeight: '500', marginBottom: '1rem' }}>
            {t('resetEmailSent')}
          </p>
          <p style={{ color: '#4a5568', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            {email}
          </p>
          <button
            type="button"
            onClick={onBackToSignIn}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#2c5282',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.95rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1a365d'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2c5282'; }}
          >
            {t('backToSignIn')}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label htmlFor="reset-email">
              {t('email')} <span className="required">*</span>
            </label>
            <input
              type="email"
              id="reset-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #cbd5e0',
                borderRadius: '6px',
                fontSize: '1rem',
                transition: 'border-color 0.2s',
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '0.75rem',
              backgroundColor: '#fed7d7',
              border: '1px solid #feb2b2',
              borderRadius: '6px',
              color: '#c53030',
              marginBottom: '1rem',
              fontSize: '0.875rem',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="submit-button"
            style={{ width: '100%', marginBottom: '1rem' }}
          >
            {loading ? t('loading') : t('sendResetLink')}
          </button>

          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              onClick={onBackToSignIn}
              style={{
                background: 'none',
                border: 'none',
                color: '#2c5282',
                cursor: 'pointer',
                fontSize: '0.95rem',
                fontWeight: '500',
                textDecoration: 'underline',
              }}
            >
              {t('backToSignIn')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
