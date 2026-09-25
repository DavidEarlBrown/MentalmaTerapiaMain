import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface GoogleTokenGeneratorProps {
  onClose: () => void;
}

export function GoogleTokenGenerator({ onClose }: GoogleTokenGeneratorProps) {
  const { language } = useLanguage();
  const [refreshToken, setRefreshToken] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [storageError, setStorageError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [storedInDb, setStoredInDb] = useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || import.meta.env.GOOGLE_CLIENT_ID;
  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || import.meta.env.GOOGLE_CLIENT_SECRET;

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const scope = urlParams.get('scope') || '';
    const isCalendarCode = scope.includes('calendar') || scope.includes('meetings.space');

    if (code && isCalendarCode && !refreshToken && !error) {
      exchangeCodeForToken(code);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const redirectUri = `${window.location.origin}${window.location.pathname}`;

  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/meetings.space.created'
  ].join(' ');

  const startOAuthFlow = () => {
    if (!clientId) {
      setError(language === 'es'
        ? 'GOOGLE_CLIENT_ID no está configurado en las variables de entorno'
        : 'GOOGLE_CLIENT_ID is not configured in environment variables');
      return;
    }

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', scopes);
    authUrl.searchParams.append('access_type', 'offline');
    authUrl.searchParams.append('prompt', 'consent');

    window.location.href = authUrl.toString();
  };

  const storeTokenViaEdgeFunction = async (newRefreshToken: string, accessToken?: string, expiresIn?: number): Promise<boolean> => {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/google-meet`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'store-token',
          refresh_token: newRefreshToken,
          access_token: accessToken || '',
          expires_in: expiresIn,
          client_id: clientId || '',
          client_secret: clientSecret || '',
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return result.success === true;
      }
      console.error('Edge function store-token failed:', response.status);
      return false;
    } catch (err) {
      console.error('Edge function store-token error:', err);
      return false;
    }
  };

  const storeTokenDirectly = async (newRefreshToken: string, accessToken?: string, expiresIn?: number): Promise<boolean> => {
    try {
      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;

      const { data: existing } = await supabase
        .from('google_tokens')
        .select('id')
        .limit(1)
        .maybeSingle();

      const tokenData: Record<string, unknown> = {
        refresh_token: newRefreshToken,
        access_token: accessToken || '',
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
        client_id: clientId || '',
        client_secret: clientSecret || '',
      };

      let result;
      if (existing?.id) {
        result = await supabase.from('google_tokens').update(tokenData).eq('id', existing.id);
      } else {
        result = await supabase.from('google_tokens').insert(tokenData);
      }

      return !result.error;
    } catch (err) {
      console.error('Direct DB store failed:', err);
      return false;
    }
  };

  const storeTokenInDb = async (newRefreshToken: string, accessToken?: string, expiresIn?: number) => {
    setStorageError('');

    const edgeSuccess = await storeTokenViaEdgeFunction(newRefreshToken, accessToken, expiresIn);
    if (edgeSuccess) {
      setStoredInDb(true);
      return;
    }

    const directSuccess = await storeTokenDirectly(newRefreshToken, accessToken, expiresIn);
    if (directSuccess) {
      setStoredInDb(true);
      return;
    }

    setStorageError(language === 'es'
      ? 'No se pudo guardar el token en la base de datos. Asegúrate de iniciar sesión como administrador e intenta de nuevo.'
      : 'Failed to save token to database. Make sure you are signed in as admin and try again.');
  };

  const exchangeCodeForToken = async (code: string) => {
    if (!clientId || !clientSecret) {
      setError(language === 'es'
        ? 'Credenciales de Google no configuradas'
        : 'Google credentials not configured');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error_description || 'Failed to exchange code for token');
      }

      const data = await response.json();

      if (data.refresh_token) {
        setRefreshToken(data.refresh_token);
        await storeTokenInDb(data.refresh_token, data.access_token, data.expires_in);
      } else {
        setError(language === 'es'
          ? 'No se recibió refresh token. Esto puede ocurrir si ya has autorizado esta aplicación antes. Intenta revocar el acceso en tu cuenta de Google y vuelve a intentarlo.'
          : 'No refresh token received. This can happen if you have already authorized this application before. Try revoking access in your Google account and try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (refreshToken) {
      navigator.clipboard.writeText(refreshToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyEnvLine = () => {
    const envLine = `GOOGLE_REFRESH_TOKEN=${refreshToken}`;
    navigator.clipboard.writeText(envLine);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2>
            {language === 'es' ? 'Generar Google Refresh Token' : 'Generate Google Refresh Token'}
          </h2>
          <button className="close-button" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {!refreshToken && !isLoading && (
            <>
              <div style={{
                backgroundColor: '#f0f7ff',
                padding: '1.5rem',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                borderLeft: '4px solid #2196F3'
              }}>
                <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#1976D2' }}>
                  {language === 'es' ? '¿Qué es esto?' : 'What is this?'}
                </h3>
                <p style={{ marginBottom: '0.75rem', lineHeight: '1.6' }}>
                  {language === 'es'
                    ? 'Esta herramienta te ayudará a generar un Google Refresh Token necesario para que la aplicación pueda crear eventos de Google Calendar y reuniones de Google Meet automáticamente.'
                    : 'This tool will help you generate a Google Refresh Token needed for the application to automatically create Google Calendar events and Google Meet meetings.'}
                </p>
                <p style={{ marginBottom: 0, lineHeight: '1.6' }}>
                  {language === 'es'
                    ? 'Al hacer clic en "Iniciar", serás redirigido a Google para autorizar el acceso. Después de autorizar, recibirás un token que deberás copiar y agregar a tu archivo .env'
                    : 'By clicking "Start", you will be redirected to Google to authorize access. After authorizing, you will receive a token that you must copy and add to your .env file'}
                </p>
              </div>

              <div style={{
                backgroundColor: '#fff3e0',
                padding: '1rem',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                borderLeft: '4px solid #ff9800'
              }}>
                <h4 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#e65100' }}>
                  {language === 'es' ? 'Permisos Requeridos:' : 'Required Permissions:'}
                </h4>
                <ul style={{ marginBottom: 0, paddingLeft: '1.5rem' }}>
                  <li>{language === 'es' ? 'Gestionar eventos de Google Calendar' : 'Manage Google Calendar events'}</li>
                  <li>{language === 'es' ? 'Crear reuniones de Google Meet' : 'Create Google Meet meetings'}</li>
                </ul>
              </div>

              {error && (
                <div style={{
                  backgroundColor: '#ffebee',
                  color: '#c62828',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  borderLeft: '4px solid #c62828'
                }}>
                  <strong>{language === 'es' ? 'Error:' : 'Error:'}</strong> {error}
                </div>
              )}

              <button
                onClick={startOAuthFlow}
                disabled={!clientId || !clientSecret}
                style={{
                  width: '100%',
                  padding: '1rem',
                  backgroundColor: clientId && clientSecret ? '#2196F3' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: clientId && clientSecret ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  transition: 'background-color 0.2s'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>{language === 'es' ? 'Iniciar Autorización de Google' : 'Start Google Authorization'}</span>
              </button>
            </>
          )}

          {isLoading && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
              <p>{language === 'es' ? 'Intercambiando código por token...' : 'Exchanging code for token...'}</p>
            </div>
          )}

          {refreshToken && (
            <div>
              <div style={{
                backgroundColor: '#e8f5e9',
                padding: '1.5rem',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                borderLeft: '4px solid #4caf50'
              }}>
                <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#2e7d32', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                  {language === 'es' ? '¡Token Generado Exitosamente!' : 'Token Generated Successfully!'}
                </h3>
                <p style={{ marginBottom: 0 }}>
                  {storedInDb
                    ? (language === 'es'
                      ? 'El token se ha guardado automáticamente en la base de datos. La aplicación lo usará para crear eventos de calendario automáticamente.'
                      : 'The token has been automatically saved to the database. The application will use it to create calendar events automatically.')
                    : (language === 'es'
                      ? 'Copia el token a continuación y agrégalo a tu archivo .env como GOOGLE_REFRESH_TOKEN'
                      : 'Copy the token below and add it to your .env file as GOOGLE_REFRESH_TOKEN')}
                </p>
              </div>

              {storageError && (
                <div style={{
                  backgroundColor: '#ffebee',
                  color: '#c62828',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  borderLeft: '4px solid #c62828'
                }}>
                  <strong>{language === 'es' ? 'Advertencia:' : 'Warning:'}</strong> {storageError}
                </div>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Refresh Token:
                </label>
                <div style={{ position: 'relative' }}>
                  <textarea
                    readOnly
                    value={refreshToken}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      backgroundColor: '#f5f5f5',
                      resize: 'vertical',
                      minHeight: '80px'
                    }}
                  />
                  <button
                    onClick={copyToClipboard}
                    style={{
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
                      padding: '0.5rem',
                      backgroundColor: copied ? '#4caf50' : '#2196F3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.875rem'
                    }}
                  >
                    {copied ? (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                        <span>{language === 'es' ? '¡Copiado!' : 'Copied!'}</span>
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                        </svg>
                        <span>{language === 'es' ? 'Copiar' : 'Copy'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <button
                onClick={copyEnvLine}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#6c63ff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                </svg>
                <span>{language === 'es' ? 'Copiar Línea .env Completa' : 'Copy Complete .env Line'}</span>
              </button>

              <div style={{
                marginTop: '1.5rem',
                padding: '1rem',
                backgroundColor: '#f5f5f5',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }}>
                <strong>{language === 'es' ? 'Próximos pasos:' : 'Next steps:'}</strong>
                <ol style={{ marginTop: '0.5rem', marginBottom: 0, paddingLeft: '1.5rem' }}>
                  <li>
                    {language === 'es'
                      ? 'Abre tu archivo .env en el proyecto'
                      : 'Open your .env file in the project'}
                  </li>
                  <li>
                    {language === 'es'
                      ? 'Pega la línea copiada (o actualiza GOOGLE_REFRESH_TOKEN con el token)'
                      : 'Paste the copied line (or update GOOGLE_REFRESH_TOKEN with the token)'}
                  </li>
                  <li>
                    {language === 'es'
                      ? 'Reinicia tu servidor de desarrollo'
                      : 'Restart your development server'}
                  </li>
                </ol>
              </div>
            </div>
          )}

          {error && refreshToken === '' && !isLoading && (
            <div style={{ marginTop: '1rem' }}>
              <button
                onClick={() => {
                  setError('');
                  window.location.href = 'https://myaccount.google.com/permissions';
                }}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                {language === 'es' ? 'Revocar Acceso en Google' : 'Revoke Access in Google'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
