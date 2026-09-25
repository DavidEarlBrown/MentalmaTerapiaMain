import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

const ZOHO_REGIONS = [
  { label: 'US (zoho.com)', accountsDomain: 'accounts.zoho.com', booksDomain: 'books.zoho.com' },
  { label: 'EU (zoho.eu)', accountsDomain: 'accounts.zoho.eu', booksDomain: 'books.zoho.eu' },
  { label: 'India (zoho.in)', accountsDomain: 'accounts.zoho.in', booksDomain: 'books.zoho.in' },
  { label: 'Australia (zoho.com.au)', accountsDomain: 'accounts.zoho.com.au', booksDomain: 'books.zoho.com.au' },
  { label: 'Japan (zoho.jp)', accountsDomain: 'accounts.zoho.jp', booksDomain: 'books.zoho.jp' },
] as const;

const ZOHO_SCOPES = [
  // Zoho Books
  'ZohoBooks.contacts.CREATE',
  'ZohoBooks.contacts.READ',
  'ZohoBooks.invoices.CREATE',
  'ZohoBooks.invoices.READ',
  // Zoho Desk (valid scope names only)
  'Desk.tickets.ALL',
  'Desk.contacts.READ',
  'Desk.departments.READ',
  'Desk.search.READ',
].join(',');

interface ZohoTokenGeneratorProps {
  onClose: () => void;
}

interface ConnectionStatus {
  connected: boolean;
  has_refresh_token?: boolean;
  has_access_token?: boolean;
  is_expired?: boolean;
  organization_id?: string;
  updated_at?: string;
  error?: string;
}

export function ZohoTokenGenerator({ onClose }: ZohoTokenGeneratorProps) {
  const { language } = useLanguage();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState('');
  const [grantToken, setGrantToken] = useState('');
  const [isExchanging, setIsExchanging] = useState(false);
  const [manualRefreshToken, setManualRefreshToken] = useState('');
  const [isStoringManual, setIsStoringManual] = useState(false);

  const clientId = import.meta.env.VITE_ZOHO_API_CLIENT_ID || '';
  const organizationId = import.meta.env.VITE_ZOHO_ORGANIZATION_ID || '';
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const configuredAccountsDomain = import.meta.env.VITE_ZOHO_ACCOUNTS_DOMAIN || '';

  const detectedRegionIndex = useMemo(() => {
    if (configuredAccountsDomain) {
      const idx = ZOHO_REGIONS.findIndex(r => r.accountsDomain === configuredAccountsDomain);
      if (idx >= 0) return idx;
    }
    return 0;
  }, [configuredAccountsDomain]);

  const [selectedRegion, setSelectedRegion] = useState(detectedRegionIndex);

  useEffect(() => {
    checkConnection();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'zoho-oauth-callback') {
        console.log('ZohoTokenGenerator: received OAuth callback message:', event.data);
        if (event.data.success) {
          checkConnection();
        } else {
          setError(event.data.message || 'OAuth authorization failed');
        }
      }
    };

    window.addEventListener('message', handleMessage);

    const params = new URLSearchParams(window.location.search);
    if (params.get('zoho_connected') === 'true') {
      checkConnection();
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    } else if (params.get('zoho_connected') === 'false') {
      setError(params.get('zoho_message') || 'Connection failed');
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkConnection = async () => {
    setIsChecking(true);
    setError('');
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/zoho-token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ grant_type: 'check_connection' }),
      });
      const data: ConnectionStatus = await response.json();
      console.log('ZohoTokenGenerator: connection status:', data);
      setConnectionStatus(data);
    } catch (err) {
      console.log('ZohoTokenGenerator: error checking connection:', err);
      setConnectionStatus({ connected: false });
    } finally {
      setIsChecking(false);
    }
  };

  const handleConnectZoho = () => {
    const region = ZOHO_REGIONS[selectedRegion];
    const callbackUrl = `${supabaseUrl}/functions/v1/zoho-callback`;

    const stateData = btoa(JSON.stringify({
      client_id: clientId,
      client_secret: import.meta.env.VITE_ZOHO_API_CLIENT_SECRET || '',
      organization_id: organizationId,
      redirect_uri: callbackUrl,
      app_url: window.location.origin + window.location.pathname,
    }));

    const authUrl = `https://${region.accountsDomain}/oauth/v2/auth` +
      `?scope=${encodeURIComponent(ZOHO_SCOPES)}` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=${encodeURIComponent(stateData)}`;

    console.log('ZohoTokenGenerator: opening OAuth URL:', authUrl);
    window.open(authUrl, '_blank', 'width=600,height=700');
  };

  const handleRefreshNow = async () => {
    setIsChecking(true);
    setError('');
    try {
      const refreshToken = import.meta.env.VITE_ZOHO_REFRESH_TOKEN || '';
      const clientSecret = import.meta.env.VITE_ZOHO_API_CLIENT_SECRET || '';
      const region = ZOHO_REGIONS[selectedRegion];

      let response;
      if (refreshToken && clientId && clientSecret) {
        response = await fetch(`${supabaseUrl}/functions/v1/zoho-token`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            accounts_domain: region.accountsDomain,
            organization_id: organizationId,
          }),
        });
      } else {
        response = await fetch(`${supabaseUrl}/functions/v1/zoho-token`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ grant_type: 'refresh_from_db' }),
        });
      }

      const data = await response.json();
      console.log('ZohoTokenGenerator: refresh response:', data);

      if (data.access_token) {
        await checkConnection();
      } else if (data.error) {
        setError(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsChecking(false);
    }
  };

  const handleExchangeGrantToken = async () => {
    if (!grantToken.trim()) return;
    setIsExchanging(true);
    setError('');
    try {
      const clientSecret = import.meta.env.VITE_ZOHO_API_CLIENT_SECRET || '';
      const region = ZOHO_REGIONS[selectedRegion];

      const response = await fetch(`${supabaseUrl}/functions/v1/zoho-token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code: grantToken.trim(),
          accounts_domain: region.accountsDomain,
          organization_id: organizationId,
        }),
      });

      const data = await response.json();

      if (data.access_token) {
        setGrantToken('');
        await checkConnection();
      } else if (data.error) {
        setError(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsExchanging(false);
    }
  };

  // Store a refresh_token that was obtained externally (e.g. via curl)
  const handleStoreRefreshToken = async () => {
    if (!manualRefreshToken.trim()) return;
    setIsStoringManual(true);
    setError('');
    try {
      const clientSecret = import.meta.env.VITE_ZOHO_API_CLIENT_SECRET || '';
      const region = ZOHO_REGIONS[selectedRegion];
      const response = await fetch(`${supabaseUrl}/functions/v1/zoho-token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: manualRefreshToken.trim(),
          accounts_domain: region.accountsDomain,
          organization_id: organizationId,
        }),
      });
      const data = await response.json();
      if (data.access_token) {
        setManualRefreshToken('');
        await checkConnection();
      } else {
        setError(typeof data.error === 'string' ? data.error : JSON.stringify(data.error || data));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsStoringManual(false);
    }
  };

  const infoBoxStyle: React.CSSProperties = {
    padding: '1.5rem',
    borderRadius: '8px',
    marginBottom: '1.5rem',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
        <div className="modal-header">
          <h2>
            {language === 'es' ? 'Conexion Zoho Books' : 'Zoho Books Connection'}
          </h2>
          <button className="close-button" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {isChecking && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
              <p style={{ fontWeight: '600' }}>
                {language === 'es' ? 'Verificando conexion...' : 'Checking connection...'}
              </p>
            </div>
          )}

          {!isChecking && connectionStatus?.connected && (
            <div style={{
              ...infoBoxStyle,
              backgroundColor: '#e8f5e9',
              borderLeft: '4px solid #4caf50',
            }}>
              <h3 style={{
                marginTop: 0,
                marginBottom: '0.75rem',
                color: '#2e7d32',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                {language === 'es' ? 'Zoho Books Conectado' : 'Zoho Books Connected'}
              </h3>
              <div style={{ fontSize: '0.875rem', lineHeight: '1.8', color: '#333' }}>
                {connectionStatus.organization_id && (
                  <div>
                    <strong>{language === 'es' ? 'Organizacion:' : 'Organization:'}</strong>{' '}
                    {connectionStatus.organization_id}
                  </div>
                )}
                <div>
                  <strong>{language === 'es' ? 'Token de Acceso:' : 'Access Token:'}</strong>{' '}
                  <span style={{ color: connectionStatus.is_expired ? '#c62828' : '#2e7d32' }}>
                    {connectionStatus.is_expired
                      ? (language === 'es' ? 'Expirado (se refrescara automaticamente)' : 'Expired (will auto-refresh)')
                      : (language === 'es' ? 'Activo' : 'Active')}
                  </span>
                </div>
                <div>
                  <strong>{language === 'es' ? 'Refresh Token:' : 'Refresh Token:'}</strong>{' '}
                  <span style={{ color: '#2e7d32' }}>
                    {language === 'es' ? 'Almacenado' : 'Stored'}
                  </span>
                </div>
                {connectionStatus.updated_at && (
                  <div>
                    <strong>{language === 'es' ? 'Ultima actualizacion:' : 'Last updated:'}</strong>{' '}
                    {new Date(connectionStatus.updated_at).toLocaleString()}
                  </div>
                )}
              </div>

              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={handleRefreshNow}
                  style={{
                    padding: '0.6rem 1.25rem',
                    backgroundColor: '#1976D2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                  }}
                >
                  {language === 'es' ? 'Refrescar Token Ahora' : 'Refresh Token Now'}
                </button>
                <button
                  onClick={handleConnectZoho}
                  style={{
                    padding: '0.6rem 1.25rem',
                    backgroundColor: '#f5f5f5',
                    color: '#333',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                  }}
                >
                  {language === 'es' ? 'Reconectar' : 'Reconnect'}
                </button>
              </div>
            </div>
          )}

          {/* ── Update token with new scopes (always visible when connected) ── */}
          {!isChecking && connectionStatus?.connected && (
            <div style={{
              ...infoBoxStyle,
              backgroundColor: '#fff8e1',
              borderLeft: '4px solid #f9a825',
              marginTop: '1rem',
            }}>
              <h4 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#f57f17' }}>
                {language === 'es'
                  ? '⚠ Actualizar Token (agregar permisos Zoho Desk)'
                  : '⚠ Update Token (add Zoho Desk permissions)'}
              </h4>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#555' }}>
                {language === 'es'
                  ? 'Si necesitas acceso a Zoho Desk, genera un nuevo codigo con los scopes indicados y pegalo aqui.'
                  : 'If you need Zoho Desk access, generate a new code with the scopes below and paste it here.'}
              </p>
              <div style={{
                backgroundColor: '#e3f2fd',
                padding: '0.5rem 0.75rem',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '0.7rem',
                wordBreak: 'break-all',
                marginBottom: '0.75rem',
              }}>
                {ZOHO_SCOPES}
              </div>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: '#777' }}>
                {language === 'es'
                  ? '1. Ve a api-console.zoho.com → Self Client → Generate Code → pega los scopes de arriba → Create'
                  : '1. Go to api-console.zoho.com → Self Client → Generate Code → paste scopes above → Create'}
              </p>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: '#777' }}>
                {language === 'es'
                  ? '2. Copia el codigo generado y pegalo aqui:'
                  : '2. Copy the generated code and paste it here:'}
              </p>
              <input
                type="text"
                value={grantToken}
                onChange={(e) => setGrantToken(e.target.value)}
                placeholder={language === 'es' ? 'Pega el codigo aqui...' : 'Paste the grant code here...'}
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  fontSize: '0.875rem',
                  border: '2px solid #f9a825',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                  marginBottom: '0.5rem',
                }}
              />
              <button
                onClick={handleExchangeGrantToken}
                disabled={!grantToken.trim() || isExchanging}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: grantToken.trim() && !isExchanging ? '#e65100' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  cursor: grantToken.trim() && !isExchanging ? 'pointer' : 'not-allowed',
                }}
              >
                {isExchanging
                  ? (language === 'es' ? 'Actualizando...' : 'Updating...')
                  : (language === 'es' ? 'Actualizar Token' : 'Update Token')}
              </button>
            </div>
          )}

          {/* ── CURL fallback — paste refresh_token obtained via terminal ── */}
          {!isChecking && connectionStatus?.connected && (
            <div style={{
              ...infoBoxStyle,
              backgroundColor: '#f0fdf4',
              borderLeft: '4px solid #16a34a',
              marginTop: '0.75rem',
            }}>
              <h4 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#15803d' }}>
                {language === 'es'
                  ? '🖥 Alternativa: obtener token via Terminal (curl)'
                  : '🖥 Alternative: get token via Terminal (curl)'}
              </h4>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: '#166534' }}>
                {language === 'es'
                  ? '1. Genera un código nuevo en api-console.zoho.com → Self Client → Generate Code (con los scopes del recuadro amarillo)'
                  : '1. Generate a fresh code at api-console.zoho.com → Self Client → Generate Code (with scopes from the yellow box above)'}
              </p>
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.82rem', color: '#166534' }}>
                {language === 'es'
                  ? '2. Copia y ejecuta este comando en macOS Terminal (reemplaza YOUR_CODE):'
                  : '2. Copy and run this command in macOS Terminal (replace YOUR_CODE):'}
              </p>
              <div style={{
                background: '#1e293b', color: '#86efac', padding: '0.75rem 1rem',
                borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.72rem',
                wordBreak: 'break-all', marginBottom: '0.75rem', lineHeight: 1.6,
                userSelect: 'all',
              }}>
                {`curl -s -X POST "https://accounts.zoho.com/oauth/v2/token" \\
  -d "grant_type=authorization_code" \\
  -d "client_id=${clientId}" \\
  -d "client_secret=${import.meta.env.VITE_ZOHO_API_CLIENT_SECRET || 'YOUR_CLIENT_SECRET'}" \\
  -d "code=YOUR_CODE"`}
              </div>
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.82rem', color: '#166534' }}>
                {language === 'es'
                  ? '3. Del JSON devuelto, copia el valor de "refresh_token" y pégalo aquí:'
                  : '3. From the returned JSON, copy the "refresh_token" value and paste it here:'}
              </p>
              <input
                type="text"
                value={manualRefreshToken}
                onChange={e => setManualRefreshToken(e.target.value)}
                placeholder={language === 'es' ? 'Pega el refresh_token aquí...' : 'Paste the refresh_token here...'}
                style={{
                  width: '100%', padding: '0.65rem', fontSize: '0.875rem',
                  border: '2px solid #16a34a', borderRadius: '6px',
                  fontFamily: 'monospace', boxSizing: 'border-box', marginBottom: '0.5rem',
                }}
              />
              <button
                onClick={handleStoreRefreshToken}
                disabled={!manualRefreshToken.trim() || isStoringManual}
                style={{
                  width: '100%', padding: '0.75rem',
                  backgroundColor: manualRefreshToken.trim() && !isStoringManual ? '#16a34a' : '#ccc',
                  color: 'white', border: 'none', borderRadius: '6px',
                  fontSize: '0.9rem', fontWeight: 600,
                  cursor: manualRefreshToken.trim() && !isStoringManual ? 'pointer' : 'not-allowed',
                }}
              >
                {isStoringManual
                  ? (language === 'es' ? 'Guardando...' : 'Saving...')
                  : (language === 'es' ? 'Guardar Refresh Token' : 'Save Refresh Token')}
              </button>
            </div>
          )}

          {!isChecking && !connectionStatus?.connected && (
            <>
              <div style={{
                ...infoBoxStyle,
                backgroundColor: '#f0f7ff',
                borderLeft: '4px solid #2196F3',
              }}>
                <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#1976D2' }}>
                  {language === 'es' ? 'Conectar Zoho Books (Self Client)' : 'Connect Zoho Books (Self Client)'}
                </h3>
                <div style={{ fontSize: '0.875rem', lineHeight: '1.7', color: '#333' }}>
                  <p style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                    {language === 'es' ? 'Sigue estos pasos:' : 'Follow these steps:'}
                  </p>
                  <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
                    <li style={{ marginBottom: '0.4rem' }}>
                      {language === 'es'
                        ? 'Ve a api-console.zoho.com y abre tu Self Client'
                        : 'Go to api-console.zoho.com and open your Self Client'}
                    </li>
                    <li style={{ marginBottom: '0.4rem' }}>
                      {language === 'es'
                        ? 'En la pestana "Generate Code", ingresa estos scopes:'
                        : 'In the "Generate Code" tab, enter these scopes:'}
                      <div style={{
                        backgroundColor: '#e3f2fd',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        marginTop: '0.35rem',
                        wordBreak: 'break-all',
                      }}>
                        {ZOHO_SCOPES}
                      </div>
                    </li>
                    <li style={{ marginBottom: '0.4rem' }}>
                      {language === 'es'
                        ? 'Elige la duracion maxima y haz clic en "Create"'
                        : 'Choose the max time duration and click "Create"'}
                    </li>
                    <li>
                      {language === 'es'
                        ? 'Copia el codigo generado y pegalo abajo'
                        : 'Copy the generated code and paste it below'}
                    </li>
                  </ol>
                </div>
              </div>

              <div style={{
                ...infoBoxStyle,
                backgroundColor: '#fff8e1',
                borderLeft: '4px solid #f9a825',
              }}>
                <h4 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#f57f17' }}>
                  {language === 'es' ? 'Region de Zoho' : 'Zoho Region'}
                </h4>
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    fontSize: '0.9rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    backgroundColor: '#fff',
                  }}
                >
                  {ZOHO_REGIONS.map((r, i) => (
                    <option key={r.accountsDomain} value={i}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div style={{
                ...infoBoxStyle,
                backgroundColor: '#f5f5f5',
                borderLeft: '4px solid #999',
              }}>
                <h4 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#333' }}>
                  {language === 'es' ? 'Configuracion Detectada' : 'Detected Configuration'}
                </h4>
                <div style={{ fontSize: '0.875rem', lineHeight: '1.8' }}>
                  <div>
                    <strong>Client ID:</strong>{' '}
                    <span style={{ color: clientId ? '#2e7d32' : '#c62828' }}>
                      {clientId ? `${clientId.substring(0, 12)}...` : (language === 'es' ? 'No configurado' : 'Not set')}
                    </span>
                  </div>
                  <div>
                    <strong>Organization ID:</strong>{' '}
                    <span style={{ color: organizationId ? '#2e7d32' : '#c62828' }}>
                      {organizationId || (language === 'es' ? 'No configurado' : 'Not set')}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  {language === 'es' ? 'Grant Token (codigo generado)' : 'Grant Token (generated code)'}
                </label>
                <input
                  type="text"
                  value={grantToken}
                  onChange={(e) => setGrantToken(e.target.value)}
                  placeholder={language === 'es' ? 'Pega el codigo aqui...' : 'Paste the code here...'}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    fontSize: '0.9rem',
                    border: '2px solid #ddd',
                    borderRadius: '6px',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#1976D2'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#ddd'; }}
                />
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: '#888' }}>
                  {language === 'es'
                    ? 'Este codigo expira en minutos. Pegalo y haz clic en "Conectar" rapidamente.'
                    : 'This code expires in minutes. Paste it and click "Connect" quickly.'}
                </p>
              </div>
            </>
          )}

          {error && (
            <div style={{
              ...infoBoxStyle,
              backgroundColor: '#ffebee',
              borderLeft: '4px solid #c62828',
              color: '#c62828',
            }}>
              <strong>{language === 'es' ? 'Error:' : 'Error:'}</strong> {error}
            </div>
          )}

          {!isChecking && !connectionStatus?.connected && (
            <button
              onClick={handleExchangeGrantToken}
              disabled={!clientId || !grantToken.trim() || isExchanging}
              style={{
                width: '100%',
                padding: '1rem',
                backgroundColor: (clientId && grantToken.trim() && !isExchanging) ? '#e65100' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: (clientId && grantToken.trim() && !isExchanging) ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                transition: 'background-color 0.2s',
              }}
            >
              {isExchanging ? (
                <>
                  <div className="spinner" style={{ width: '18px', height: '18px' }}></div>
                  {language === 'es' ? 'Conectando...' : 'Connecting...'}
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                  </svg>
                  {language === 'es' ? 'Conectar con Zoho Books' : 'Connect to Zoho Books'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
