import { useState, type FormEvent } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { fetchUserByUsername, fetchUserByEmail } from '../lib/api';
import { signInWithEmail, signUpWithEmail } from '../lib/auth';
import { supabase } from '../lib/supabaseClient';
import { PasswordInput } from './PasswordInput';
import type { User, UserFormData } from '../types';

interface SignInFormProps {
  onSubmit: (data: UserFormData) => void;
  loading: boolean;
  onCancel?: () => void;
  onNavigate?: (section: string) => void;
  currentUser?: UserFormData | null;
  onForgotPassword?: () => void;
}

type FormStep = 'choice' | 'email' | 'password' | 'register';

export function SignInForm({ onSubmit, loading, onCancel, onNavigate, currentUser, onForgotPassword }: SignInFormProps) {
  const { t, language } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [step, setStep] = useState<FormStep>('choice');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [error, setError] = useState('');
  const [foundUser, setFoundUser] = useState<User | null>(null);
  const isGoogleSignInTemporarilyDisabled = true;

  const [registerData, setRegisterData] = useState({
    username: '',
    email: '',
    full_name: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = emailInput.trim();
    if (!trimmed || trimmed.length < 3) return;

    const lookupKey = trimmed.includes('@') ? trimmed.toLowerCase() : trimmed;

    setIsLookingUp(true);
    setError('');

    try {
      // Always use API-backed lookup (username or email). Direct table reads are blocked by RLS pre-auth.
      let user = await fetchUserByUsername(lookupKey);
      if (!user && trimmed.includes('@')) {
        user = await fetchUserByEmail(lookupKey);
      }

      if (user) {
        setFoundUser(user);
        setStep('password');
      } else {
        setError(language === 'es'
          ? 'No se encontró ninguna cuenta con ese usuario o correo. ¿Deseas crear una cuenta nueva?'
          : 'No account found with that username or email. Would you like to register a new user?');
        setRegisterData(prev => ({
          ...prev,
          email: trimmed.includes('@') ? trimmed.toLowerCase() : '',
          username: trimmed.includes('@') ? prev.username : trimmed,
        }));
      }
    } catch {
      setError(language === 'es' ? 'Error al buscar la cuenta.' : 'Error looking up account. Please try again.');
    } finally {
      setIsLookingUp(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!passwordInput) return;

    setIsLookingUp(true);
    setError('');

    try {
      const rawLogin = foundUser?.email || emailInput.trim();
      const loginEmail = rawLogin.includes('@') ? rawLogin.toLowerCase() : rawLogin;
      await signInWithEmail(loginEmail, passwordInput);

      const userData: UserFormData = {
        id: foundUser?.id || '',
        username: foundUser?.username || '',
        email: foundUser?.email || loginEmail,
        full_name: foundUser?.full_name || '',
        phone: foundUser?.phone || '',
        user_type: foundUser?.user_type || foundUser?.role || 'client',
      };
      onSubmit(userData);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('Invalid login credentials')) {
        setError(t('invalidCredentials'));
      } else {
        setError(message || t('invalidCredentials'));
      }
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleRegisterSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!registerData.email || !registerData.full_name || !registerData.password) {
      setError('Please fill in all required fields');
      return;
    }

    if (registerData.password.length < 8) {
      setError(t('passwordMinLength'));
      return;
    }

    if (registerData.password !== registerData.confirmPassword) {
      setError(t('passwordMismatch'));
      return;
    }

    setIsLookingUp(true);

    try {
      const emailNorm = registerData.email.trim().toLowerCase();
      const existing = await fetchUserByEmail(emailNorm);
      if (existing) {
        setError(t('emailAlreadyRegistered'));
        setIsLookingUp(false);
        return;
      }

      const authData = await signUpWithEmail(
        emailNorm,
        registerData.password,
        { full_name: registerData.full_name }
      );

      if (authData.user) {
        const { error: profileError } = await supabase
          .from('users')
          .upsert([{
            id: authData.user.id,
            username: registerData.username || emailNorm.split('@')[0],
            email: emailNorm,
            full_name: registerData.full_name,
            phone: registerData.phone || '',
            role: 'client',
            user_type: 'client',
            is_active: true,
            auth_provider: 'email',
            last_login: new Date().toISOString(),
          }], { onConflict: 'id' });

        if (profileError) {
          console.error('Profile creation error:', profileError);
        }

        const userData: UserFormData = {
          id: authData.user.id,
          username: registerData.username || emailNorm.split('@')[0],
          email: emailNorm,
          full_name: registerData.full_name,
          phone: registerData.phone || '',
          user_type: 'client',
        };
        onSubmit(userData);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleStepBack = () => {
    setError('');
    if (step === 'password') {
      setStep('email');
      setPasswordInput('');
      setFoundUser(null);
    } else if (step === 'email') {
      setStep('choice');
      setEmailInput('');
    } else if (step === 'register') {
      setStep('choice');
      setRegisterData({
        username: '',
        email: '',
        full_name: '',
        phone: '',
        password: '',
        confirmPassword: '',
      });
    }
  };

  const userRole = currentUser?.user_type || 'client';

  const handleMenuNavigate = (section: string) => {
    setMenuOpen(false);
    if (onNavigate) {
      onNavigate(section);
    }
  };

  return (
    <section className="section">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        {onNavigate && (
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="hamburger-button"
            aria-label="Toggle menu"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: '28px', height: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <span style={{ width: '100%', height: '3px', background: '#2c5282', borderRadius: '2px' }}></span>
              <span style={{ width: '100%', height: '3px', background: '#2c5282', borderRadius: '2px' }}></span>
              <span style={{ width: '100%', height: '3px', background: '#2c5282', borderRadius: '2px' }}></span>
            </div>
          </button>
        )}

        {(onCancel || step !== 'choice') && (
          <button
            type="button"
            onClick={step === 'choice' ? () => onCancel?.() : handleStepBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: '#e2e8f0',
              color: '#2d3748',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#cbd5e0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#e2e8f0'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            {t('back') || 'Back'}
          </button>
        )}
      </div>

      {menuOpen && onNavigate && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 999,
            }}
            onClick={() => setMenuOpen(false)}
          ></div>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '280px',
              height: '100vh',
              background: 'white',
              boxShadow: '2px 0 10px rgba(0, 0, 0, 0.1)',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              padding: '4rem 0 1rem 0',
              overflowY: 'auto',
            }}
          >
            {(userRole === 'client' || userRole === 'Administrator') && (
              <button onClick={() => handleMenuNavigate('client-info')} className="nav-item">{t('clientInfo')}</button>
            )}
            <button onClick={() => handleMenuNavigate('home')} className="nav-item">{t('home')}</button>
            <button onClick={() => handleMenuNavigate('about')} className="nav-item">{t('aboutUs')}</button>
            <button onClick={() => handleMenuNavigate('help')} className="nav-item">{t('help')}</button>
            <button onClick={() => handleMenuNavigate('professionals')} className="nav-item">{t('professionalList')}</button>
            <button onClick={() => handleMenuNavigate('calendar')} className="nav-item">{t('appointmentCalendar')}</button>
            <button onClick={() => handleMenuNavigate('submit-resume')} className="nav-item">{t('submitResume')}</button>
            {userRole === 'Administrator' && (
              <>
                <button onClick={() => handleMenuNavigate('admin')} className="nav-item">{t('adminPanel')}</button>
                <button onClick={() => handleMenuNavigate('google-token')} className="nav-item">
                  {language === 'es' ? 'Generar Google Token' : 'Generate Google Token'}
                </button>
              </>
            )}
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>{t('signIn')}</h2>
      </div>
      <p className="section-subtitle">
        {step === 'choice' ? t('chooseSignInOrRegister') : t('signInDescription')}
      </p>

      {step === 'choice' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
          <button
            type="button"
            className="submit-button"
            onClick={() => {
              setError('');
              setRegisterData({
                username: '',
                email: '',
                full_name: '',
                phone: '',
                password: '',
                confirmPassword: '',
              });
              setStep('register');
            }}
            style={{ width: '100%', padding: '1rem', fontSize: '1.05rem' }}
          >
            {t('newRegistration')}
          </button>
          <button
            type="button"
            onClick={() => { setError(''); setStep('email'); }}
            style={{
              width: '100%',
              padding: '1rem',
              fontSize: '1.05rem',
              fontWeight: 600,
              background: 'white',
              color: '#2c5282',
              border: '2px solid #2c5282',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            {t('signInOption')}
          </button>
        </div>
      )}

      {step === 'email' && (
      <>
      <button
        type="button"
        disabled={isGoogleSignInTemporarilyDisabled || loading}
        className="google-sign-in-button"
        style={{
          marginBottom: '1.5rem',
          width: '100%',
          padding: '0.75rem',
          backgroundColor: '#ffffff',
          color: '#757575',
          border: '1px solid #dadce0',
          borderRadius: '4px',
          fontSize: '14px',
          fontWeight: '500',
          cursor: isGoogleSignInTemporarilyDisabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          transition: 'background-color 0.2s, box-shadow 0.2s',
          opacity: isGoogleSignInTemporarilyDisabled ? 0.55 : 1,
        }}
        title={language === 'es' ? 'Temporalmente deshabilitado' : 'Temporarily disabled'}
      >
        <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          <path fill="none" d="M0 0h48v48H0z"/>
        </svg>
        {language === 'es' ? 'Ingresar con Google (temporalmente deshabilitado)' : 'Sign in with Google (temporarily disabled)'}
      </button>

      <div style={{ textAlign: 'center', margin: '1rem 0', color: '#757575', fontSize: '14px' }}>
        {t('or') || 'or'}
      </div>
      </>
      )}

      {step !== 'choice' && error && (
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
          {step === 'email' && (
            <div style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => { setError(''); setStep('register'); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#c53030',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                {language === 'es' ? 'Registrar nuevo usuario' : 'Register a New User'}
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'email' && (
        <form onSubmit={handleEmailSubmit} className="sign-in-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="username">
                {t('username')} / {t('email')} <span className="required">*</span>
              </label>
              <input
                type="text"
                id="username"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="Enter username or email"
                required
                minLength={3}
              />
            </div>
          </div>

          <button type="submit" className="submit-button" disabled={loading || isLookingUp} style={{ width: '100%', marginBottom: '0.75rem' }}>
            {isLookingUp ? t('loading') : t('continue') || 'Continue'}
          </button>

          <button
            type="button"
            onClick={() => {
              onCancel?.();
              onNavigate?.('home');
            }}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: '#e53e3e',
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              fontSize: '1rem',
              cursor: 'pointer',
              fontWeight: '600',
            }}
          >
            {language === 'es' ? 'Cancelar' : 'Cancel'}
          </button>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={handlePasswordSubmit} className="sign-in-form">
          <div style={{
            padding: '0.75rem',
            backgroundColor: '#ebf8ff',
            border: '1px solid #90cdf4',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.875rem',
            color: '#2c5282',
          }}>
            {language === 'es' ? 'Iniciando sesion como' : 'Signing in as'}: <strong>{foundUser?.full_name || foundUser?.email || emailInput}</strong>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="password">
                {t('password')} <span className="required">*</span>
              </label>
              <PasswordInput
                id="password"
                value={passwordInput}
                onChange={setPasswordInput}
                placeholder={t('enterPassword')}
                required
                autoFocus
              />
            </div>
          </div>

          <button type="submit" className="submit-button" disabled={loading || isLookingUp} style={{ width: '100%', marginBottom: '0.75rem' }}>
            {isLookingUp ? t('loading') : t('signIn')}
          </button>

          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => {
                if (onForgotPassword) {
                  onForgotPassword();
                }
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#2c5282',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: '500',
                textDecoration: 'underline',
                padding: '0.5rem',
              }}
            >
              {t('forgotPassword')}
            </button>
          </div>
        </form>
      )}

      {step === 'register' && (
        <form onSubmit={handleRegisterSubmit} className="sign-in-form">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ margin: 0 }}>{t('createAccount') || 'Register a New User'}</h3>
            <button
              type="button"
              onClick={handleStepBack}
              style={{
                padding: '0.5rem 1.25rem',
                background: '#e53e3e',
                border: 'none',
                borderRadius: '6px',
                color: 'white',
                fontSize: '0.9rem',
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              {language === 'es' ? 'Cancelar' : 'Cancel'}
            </button>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="reg-username">
                {t('username')} <span className="required">*</span>
              </label>
              <input
                type="text"
                id="reg-username"
                value={registerData.username}
                onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                placeholder="Choose a username"
                required
                minLength={3}
              />
            </div>
            <div className="form-group">
              <label htmlFor="reg-email">
                {t('email')} <span className="required">*</span>
              </label>
              <input
                type="email"
                id="reg-email"
                value={registerData.email}
                onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                placeholder="Enter your email"
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="reg-full_name">
                {t('fullName')} <span className="required">*</span>
              </label>
              <input
                type="text"
                id="reg-full_name"
                value={registerData.full_name}
                onChange={(e) => setRegisterData({ ...registerData, full_name: e.target.value })}
                placeholder="Enter your full name"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="reg-phone">
                {t('phone')}
              </label>
              <input
                type="tel"
                id="reg-phone"
                value={registerData.phone}
                onChange={(e) => setRegisterData({ ...registerData, phone: e.target.value })}
                placeholder="Enter your phone number"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="reg-password">
                {t('password')} <span className="required">*</span>
              </label>
              <PasswordInput
                id="reg-password"
                value={registerData.password}
                onChange={(val) => setRegisterData({ ...registerData, password: val })}
                placeholder={t('enterPassword')}
                required
                minLength={8}
              />
              <p style={{ fontSize: '0.8rem', color: '#718096', marginTop: '0.25rem' }}>
                {t('passwordMinLength')}
              </p>
            </div>
            <div className="form-group">
              <label htmlFor="reg-confirm-password">
                {t('confirmPassword')} <span className="required">*</span>
              </label>
              <PasswordInput
                id="reg-confirm-password"
                value={registerData.confirmPassword}
                onChange={(val) => setRegisterData({ ...registerData, confirmPassword: val })}
                placeholder={t('confirmNewPassword')}
                required
                minLength={8}
              />
            </div>
          </div>

          <button type="submit" className="submit-button" disabled={loading || isLookingUp} style={{ width: '100%', marginBottom: '0.75rem' }}>
            {isLookingUp ? t('loading') : t('createAccount') || 'Register a New User'}
          </button>

          <button
            type="button"
            onClick={handleStepBack}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: '#e53e3e',
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              fontSize: '1rem',
              cursor: 'pointer',
              fontWeight: '600',
            }}
          >
            {language === 'es' ? 'Cancelar' : 'Cancel'}
          </button>
        </form>
      )}
    </section>
  );
}
