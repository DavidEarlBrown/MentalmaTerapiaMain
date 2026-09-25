import { useState, type FormEvent } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { updatePassword } from '../lib/auth';
import { PasswordInput } from './PasswordInput';

interface ResetPasswordFormProps {
  onComplete: () => void;
  onBackToSignIn: () => void;
}

export function ResetPasswordForm({ onComplete, onBackToSignIn }: ResetPasswordFormProps) {
  const { t } = useLanguage();
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPass.length < 8) {
      setError(t('passwordMinLength'));
      return;
    }

    if (newPass !== confirmPass) {
      setError(t('passwordMismatch'));
      return;
    }

    setLoading(true);

    try {
      await updatePassword(newPass);
      setSuccess(true);
      setTimeout(() => {
        onComplete();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="section">
      <h2 style={{ marginBottom: '0.5rem' }}>{t('setYourPassword')}</h2>
      <p className="section-subtitle" style={{ marginBottom: '1.5rem', color: '#4a5568' }}>
        {t('enterNewPassword')}
      </p>

      {success ? (
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
          <p style={{ color: '#276749', fontSize: '1rem', fontWeight: '500' }}>
            {t('passwordUpdated')}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label htmlFor="new-password">
              {t('newPassword')} <span className="required">*</span>
            </label>
            <PasswordInput
              id="new-password"
              value={newPass}
              onChange={setNewPass}
              placeholder={t('enterNewPassword')}
              required
              minLength={8}
            />
            <p style={{ fontSize: '0.8rem', color: '#718096', marginTop: '0.25rem' }}>
              {t('passwordMinLength')}
            </p>
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label htmlFor="confirm-password">
              {t('confirmPassword')} <span className="required">*</span>
            </label>
            <PasswordInput
              id="confirm-password"
              value={confirmPass}
              onChange={setConfirmPass}
              placeholder={t('confirmNewPassword')}
              required
              minLength={8}
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
            {loading ? t('loading') : t('resetPassword')}
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
