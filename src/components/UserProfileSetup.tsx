import { useState, type FormEvent } from 'react';
import type React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { completeUserProfile } from '../lib/api';
import { supabase } from '../lib/supabaseClient';

interface UserProfileSetupProps {
  userEmail: string;
  userName?: string;
  userId: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function UserProfileSetup({ userEmail, userName, userId, onComplete, onCancel }: UserProfileSetupProps) {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    username: userName || '',
    email: userEmail,
    full_name: userName || '',
    phone: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCancel = () => {
    onCancel();
    supabase.auth.signOut();
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await completeUserProfile({
        ...formData,
        id: userId,
      });

      onComplete();
    } catch (err) {
      console.error('Profile creation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '8px',
        maxWidth: '500px',
        width: '90%',
        maxHeight: '90vh',
        overflow: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, color: '#333' }}>
            {t('Complete Your Profile')}
          </h2>
          <button
            type="button"
            onClick={handleCancel}
            style={{
              background: '#f0f0f0',
              border: '1px solid #ccc',
              borderRadius: '50%',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: '#333',
              lineHeight: 1,
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            title="Close"
          >
            &times;
          </button>
        </div>
        <p style={{ marginBottom: '1.5rem', color: '#666' }}>
          {t('Please complete your profile to continue using the application.')}
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#333' }}>
              {t('Username')} *
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem',
              }}
              placeholder={t('Enter a unique username')}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#333' }}>
              {t('Full Name')} *
            </label>
            <input
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem',
              }}
              placeholder={t('Enter your full name')}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#333' }}>
              {t('Email')} *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              disabled
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem',
                backgroundColor: '#f5f5f5',
                color: '#666',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#333' }}>
              {t('Phone')}
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem',
              }}
              placeholder={t('Enter your phone number (optional)')}
            />
          </div>

          {error && (
            <div style={{
              padding: '0.75rem',
              backgroundColor: '#fee',
              border: '1px solid #fcc',
              borderRadius: '4px',
              color: '#c00',
              marginBottom: '1rem',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: loading ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: '0.75rem',
            }}
          >
            {loading ? t('Creating Profile...') : t('Complete Profile')}
          </button>

          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                background: 'none',
                border: 'none',
                color: '#666',
                fontSize: '0.9rem',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '0.25rem',
              }}
            >
              {t('Cancel and sign out')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
