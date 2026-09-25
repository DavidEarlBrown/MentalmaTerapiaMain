import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { updateUserProfile } from '../lib/api';
import type { UserFormData } from '../types';

interface AuthStatusProps {
  isSignedIn: boolean;
  currentUser: UserFormData | null;
  onSignOut: () => void | Promise<void>;
  onShowSignIn?: () => void;
  onUserUpdated?: (user: UserFormData) => void;
}

function userToFormData(user: UserFormData): UserFormData {
  return {
    id: user.id,
    username: user.username || '',
    email: user.email || '',
    full_name: user.full_name || '',
    phone: user.phone || '',
    user_type: user.user_type,
  };
}

export function AuthStatus({ isSignedIn, currentUser, onSignOut, onShowSignIn, onUserUpdated }: AuthStatusProps) {
  const { t, language } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [editForm, setEditForm] = useState<UserFormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        setMenuOpen(false);
        handleAboutCancel();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [saving]);

  useEffect(() => {
    if (aboutOpen && currentUser) {
      setEditForm(userToFormData(currentUser));
      setSaveError(null);
    }
  }, [aboutOpen, currentUser]);

  const handleSignOff = () => {
    setMenuOpen(false);
    setAboutOpen(false);
    void onSignOut();
  };

  const handleAboutCancel = () => {
    setAboutOpen(false);
    setSaveError(null);
    if (currentUser) {
      setEditForm(userToFormData(currentUser));
    }
  };

  const handleAboutSave = async () => {
    if (!currentUser || !editForm) return;

    if (!editForm.full_name.trim() || !editForm.username.trim() || !editForm.email.trim()) {
      setSaveError(
        language === 'es'
          ? 'Nombre, usuario y correo son obligatorios.'
          : 'Full name, username, and email are required.'
      );
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const updated = await updateUserProfile(currentUser.id, {
        username: editForm.username,
        email: editForm.email,
        full_name: editForm.full_name,
        phone: editForm.phone,
      });

      const nextUser: UserFormData = {
        id: currentUser.id,
        username: updated.username,
        email: updated.email,
        full_name: updated.full_name,
        phone: updated.phone || '',
        user_type: currentUser.user_type,
      };

      onUserUpdated?.(nextUser);
      setAboutOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (!isSignedIn || !currentUser) {
    return (
      <div className="header-auth">
        {onShowSignIn ? (
          <button type="button" className="header-auth-button" onClick={onShowSignIn}>
            {t('signInRegister')}
          </button>
        ) : (
          <span className="header-auth-muted">{t('notSignedIn') || 'Not signed in'}</span>
        )}
      </div>
    );
  }

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '0.55rem 0.75rem',
    fontSize: '0.9rem',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#475569',
    marginBottom: '0.35rem',
  };

  return (
    <div className="header-auth header-auth-signed-row">
      <div className="header-auth-identity" title={currentUser.email || undefined}>
        <span className="header-auth-name">{currentUser.full_name}</span>
        <span className="header-auth-role">
          ({currentUser.user_type || t('client')})
        </span>
      </div>

      <div className="header-auth-menu-wrap" ref={wrapRef}>
        <button
          type="button"
          className="header-auth-button header-auth-account-button"
          aria-expanded={menuOpen}
          aria-haspopup="true"
          onClick={() => setMenuOpen((o) => !o)}
        >
          {t('accountMenu')}
          <span className="header-auth-chevron" aria-hidden="true">{menuOpen ? '▲' : '▼'}</span>
        </button>

        {menuOpen && (
          <div className="account-dropdown" role="menu">
            <div className="account-dropdown-section account-dropdown-signed">
              <div className="account-dropdown-label">{t('signedOn')}</div>
              <div className="account-dropdown-name">{currentUser.full_name}</div>
              <div className="account-dropdown-email">{currentUser.email || '—'}</div>
            </div>
            <button
              type="button"
              role="menuitem"
              className="account-dropdown-item"
              onClick={() => {
                setAboutOpen(true);
                setMenuOpen(false);
              }}
            >
              {t('aboutAccount')}
            </button>
            <button type="button" role="menuitem" className="account-dropdown-item account-dropdown-signoff" onClick={handleSignOff}>
              {t('signOff')}
            </button>
          </div>
        )}
      </div>

      {aboutOpen && editForm && (
        <div
          className="account-about-overlay"
          role="presentation"
          onClick={() => !saving && handleAboutCancel()}
        >
          <div
            className="account-about-dialog"
            role="dialog"
            aria-labelledby="account-about-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="account-about-title">{t('aboutAccount')}</h3>

            <form
              className="account-about-form"
              onSubmit={(e) => {
                e.preventDefault();
                void handleAboutSave();
              }}
            >
              <div className="account-about-field">
                <label style={labelStyle} htmlFor="account-full-name">{t('fullName')}</label>
                <input
                  id="account-full-name"
                  type="text"
                  style={inputStyle}
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  required
                />
              </div>

              <div className="account-about-field">
                <label style={labelStyle} htmlFor="account-username">{t('username')}</label>
                <input
                  id="account-username"
                  type="text"
                  style={inputStyle}
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  required
                />
              </div>

              <div className="account-about-field">
                <label style={labelStyle} htmlFor="account-email">{t('email')}</label>
                <input
                  id="account-email"
                  type="email"
                  style={inputStyle}
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  required
                />
              </div>

              <div className="account-about-field">
                <label style={labelStyle} htmlFor="account-phone">{t('phone')}</label>
                <input
                  id="account-phone"
                  type="tel"
                  style={inputStyle}
                  value={editForm.phone || ''}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>

              <div className="account-about-field account-about-readonly">
                <label style={labelStyle}>{t('accountUserType')}</label>
                <div className="account-about-readonly-value">{currentUser.user_type || '—'}</div>
              </div>

              {saveError && (
                <p className="account-about-error" role="alert">{saveError}</p>
              )}

              <div className="account-about-actions">
                <button
                  type="button"
                  className="account-about-btn account-about-btn-cancel"
                  onClick={handleAboutCancel}
                  disabled={saving}
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="account-about-btn account-about-btn-save"
                  disabled={saving}
                >
                  {saving
                    ? (language === 'es' ? 'Guardando...' : 'Saving...')
                    : (language === 'es' ? 'Guardar cambios' : 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .account-dropdown {
          position: absolute;
          right: 0;
          top: calc(100% + 6px);
          min-width: 260px;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          z-index: 2000;
          overflow: hidden;
        }

        .account-dropdown-section {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #edf2f7;
        }

        .account-dropdown-label {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #718096;
          margin-bottom: 0.35rem;
        }

        .account-dropdown-name {
          font-weight: 600;
          color: #1a202c;
          font-size: 0.95rem;
        }

        .account-dropdown-email {
          font-size: 0.85rem;
          color: #4a5568;
          word-break: break-all;
          margin-top: 0.25rem;
        }

        .account-dropdown-item {
          display: block;
          width: 100%;
          text-align: left;
          padding: 0.75rem 1rem;
          border: none;
          background: white;
          font-size: 0.9rem;
          color: #2d3748;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .account-dropdown-item:hover {
          background: #f7fafc;
        }

        .account-dropdown-signoff {
          color: #c53030;
          font-weight: 600;
          border-top: 1px solid #edf2f7;
        }

        .account-about-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.45);
          z-index: 3000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }

        .account-about-dialog {
          background: white;
          border-radius: 10px;
          padding: 1.5rem;
          max-width: 440px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 50px rgba(0,0,0,0.2);
        }

        .account-about-dialog h3 {
          margin: 0 0 1.25rem 0;
          font-size: 1.15rem;
          color: #1a202c;
        }

        .account-about-field {
          margin-bottom: 1rem;
        }

        .account-about-readonly-value {
          padding: 0.55rem 0.75rem;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 0.9rem;
          color: #475569;
        }

        .account-about-error {
          margin: 0 0 0.75rem 0;
          padding: 0.6rem 0.75rem;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 6px;
          color: #b91c1c;
          font-size: 0.85rem;
        }

        .account-about-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
          margin-top: 1.25rem;
          padding-top: 1rem;
          border-top: 1px solid #edf2f7;
        }

        .account-about-btn {
          padding: 0.6rem 1.25rem;
          border-radius: 6px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          border: none;
        }

        .account-about-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .account-about-btn-cancel {
          background: #f1f5f9;
          color: #334155;
          border: 1px solid #cbd5e1;
        }

        .account-about-btn-cancel:hover:not(:disabled) {
          background: #e2e8f0;
        }

        .account-about-btn-save {
          background: #2c5282;
          color: white;
        }

        .account-about-btn-save:hover:not(:disabled) {
          background: #2b6cb0;
        }

        @media (max-width: 768px) {
          .account-dropdown {
            min-width: 220px;
            right: -0.5rem;
          }

          .account-about-actions {
            flex-direction: column-reverse;
          }

          .account-about-btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
