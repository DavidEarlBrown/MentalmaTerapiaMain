/**
 * MentalmaAnalysisClient
 *
 * Calls the real MentalmaAnalysisServerPython (FastAPI) endpoints:
 *   GET /api/clients/stats      → client breakdown JSON
 *   GET /api/visits/stats       → visit breakdown JSON
 *   GET /api/specialties/stats  → specialty breakdown JSON
 *   GET /api/professionals/stats → professional breakdown JSON
 *   GET /api/<domain>/chart?view=<view>&chart_type=<type>&format=json
 *                               → { image: "base64png", title, ... }
 *
 * Server URL: VITE_MENTALMA_ANALYSIS_URL (default http://localhost:8000)
 * Deploy server to Render: github.com/DavidEarlBrown/MentalmaAnalysisServerPython
 */

import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import type { UserFormData } from '../types';

// ── Config ────────────────────────────────────────────────────────────────────

const SERVER =
  (import.meta.env.VITE_MENTALMA_ANALYSIS_URL as string | undefined) ??
  'http://localhost:8000';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CountBreakdown { label: string; count: number; }
interface TimeSeriesPoint { period: string; count: number; }

interface ClientStats {
  total: number;
  by_status: CountBreakdown[];
  by_gender: CountBreakdown[];
  by_specialty: CountBreakdown[];
  by_professional: CountBreakdown[];
  new_per_month: TimeSeriesPoint[];
  summary: string;
}

interface VisitStats {
  total: number;
  by_status: CountBreakdown[];
  by_type: CountBreakdown[];
  by_professional: CountBreakdown[];
  by_specialty: CountBreakdown[];
  visits_per_month: TimeSeriesPoint[];
  avg_duration_minutes: number | null;
  summary: string;
}

interface SpecialtyStats {
  total: number;
  summary: string;
  [key: string]: unknown;
}

interface ProfessionalStats {
  total: number;
  summary: string;
  [key: string]: unknown;
}

interface ChartResponse {
  image: string;       // base64 PNG
  title: string;
  chart_type: string;
  view: string;
  raw_data: unknown;
}

type Domain = 'clients' | 'visits' | 'specialties' | 'professionals';
type ServerMode = 'checking' | 'live' | 'offline';

interface Props { currentUser?: UserFormData | null; }

// ── View config per domain ────────────────────────────────────────────────────

const DOMAIN_CONFIG: Record<Domain, {
  icon: string;
  label: string;
  labelEs: string;
  views: { id: string; label: string; chartType: string }[];
}> = {
  clients: {
    icon: '👤', label: 'Clients', labelEs: 'Clientes',
    views: [
      { id: 'by_status',       label: 'By Status',       chartType: 'pie'  },
      { id: 'by_gender',       label: 'By Gender',       chartType: 'pie'  },
      { id: 'by_specialty',    label: 'By Specialty',    chartType: 'hbar' },
      { id: 'by_professional', label: 'By Professional', chartType: 'hbar' },
      { id: 'trend',           label: 'Monthly Trend',   chartType: 'line' },
    ],
  },
  visits: {
    icon: '📅', label: 'Visits', labelEs: 'Visitas',
    views: [
      { id: 'trend',           label: 'Monthly Trend',   chartType: 'line' },
      { id: 'by_status',       label: 'By Status',       chartType: 'pie'  },
      { id: 'by_type',         label: 'By Type',         chartType: 'pie'  },
      { id: 'by_professional', label: 'By Professional', chartType: 'hbar' },
      { id: 'by_specialty',    label: 'By Specialty',    chartType: 'hbar' },
      { id: 'by_dow',          label: 'By Day of Week',  chartType: 'bar'  },
    ],
  },
  specialties: {
    icon: '🔬', label: 'Specialties', labelEs: 'Especialidades',
    views: [
      { id: 'by_clients',      label: 'By Clients',      chartType: 'hbar' },
      { id: 'by_professionals',label: 'By Professionals',chartType: 'hbar' },
    ],
  },
  professionals: {
    icon: '🩺', label: 'Professionals', labelEs: 'Profesionales',
    views: [
      { id: 'by_specialty',    label: 'By Specialty',    chartType: 'hbar' },
      { id: 'by_clients',      label: 'By Clients',      chartType: 'hbar' },
    ],
  },
};

const DOMAINS = Object.keys(DOMAIN_CONFIG) as Domain[];

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${SERVER}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MentalmaAnalysisClient({ currentUser: _u }: Props) {
  const { language } = useLanguage();
  const lbl = (en: string, es: string) => language === 'es' ? es : en;

  // ── Server state ──────────────────────────────────────────────────────────
  const [serverMode, setServerMode] = useState<ServerMode>('checking');

  // ── Domain selection ──────────────────────────────────────────────────────
  const [domain, setDomain]   = useState<Domain>('clients');
  const [view, setView]       = useState(DOMAIN_CONFIG.clients.views[0].id);
  const [chartType, setChartType] = useState(DOMAIN_CONFIG.clients.views[0].chartType);

  // ── Date filter ───────────────────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  // ── Stats data ────────────────────────────────────────────────────────────
  const [clientStats, setClientStats]         = useState<ClientStats | null>(null);
  const [visitStats, setVisitStats]           = useState<VisitStats | null>(null);
  const [specialtyStats, setSpecialtyStats]   = useState<SpecialtyStats | null>(null);
  const [professionalStats, setProfStats]     = useState<ProfessionalStats | null>(null);

  // ── Chart ─────────────────────────────────────────────────────────────────
  const [chart, setChart]         = useState<ChartResponse | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError]     = useState<string | null>(null);

  // ── Health check ──────────────────────────────────────────────────────────
  const checkHealth = useCallback(async () => {
    setServerMode('checking');
    try {
      await apiGet<unknown>('/health');
      setServerMode('live');
    } catch {
      setServerMode('offline');
    }
  }, []);

  useEffect(() => { checkHealth(); }, [checkHealth]);

  // ── Load all stats when server is live ───────────────────────────────────
  useEffect(() => {
    if (serverMode !== 'live') return;
    const qs = [dateFrom && `start_date=${dateFrom}`, dateTo && `end_date=${dateTo}`].filter(Boolean).join('&');
    const q = qs ? `?${qs}` : '';

    apiGet<ClientStats>(`/api/clients/stats${q}`).then(setClientStats).catch(() => setClientStats(null));
    apiGet<VisitStats>(`/api/visits/stats${q}`).then(setVisitStats).catch(() => setVisitStats(null));
    apiGet<SpecialtyStats>(`/api/specialties/stats${q}`).then(setSpecialtyStats).catch(() => setSpecialtyStats(null));
    apiGet<ProfessionalStats>(`/api/professionals/stats${q}`).then(setProfStats).catch(() => setProfStats(null));
  }, [serverMode, dateFrom, dateTo]);

  // ── Load chart when domain / view / chartType changes ───────────────────
  useEffect(() => {
    if (serverMode !== 'live') return;
    setChart(null);
    setChartError(null);
    setChartLoading(true);
    const qs = new URLSearchParams({ view, chart_type: chartType, format: 'json' });
    if (dateFrom) qs.set('start_date', dateFrom);
    if (dateTo)   qs.set('end_date',   dateTo);
    apiGet<ChartResponse>(`/api/${domain}/chart?${qs}`)
      .then(setChart)
      .catch(e => setChartError(e instanceof Error ? e.message : String(e)))
      .finally(() => setChartLoading(false));
  }, [serverMode, domain, view, chartType, dateFrom, dateTo]);

  // ── Switch domain → reset view ────────────────────────────────────────────
  const switchDomain = (d: Domain) => {
    setDomain(d);
    const first = DOMAIN_CONFIG[d].views[0];
    setView(first.id);
    setChartType(first.chartType);
  };

  const switchView = (v: string) => {
    setView(v);
    const cfg = DOMAIN_CONFIG[domain].views.find(x => x.id === v);
    if (cfg) setChartType(cfg.chartType);
  };

  // ── Totals for stat cards ─────────────────────────────────────────────────
  const totals = {
    clients:       clientStats?.total       ?? '—',
    visits:        visitStats?.total        ?? '—',
    specialties:   specialtyStats?.total    ?? '—',
    professionals: professionalStats?.total ?? '—',
  };

  // ── Badge ─────────────────────────────────────────────────────────────────
  const badge = {
    checking: { bg:'#f1f5f9', color:'#64748b', dot:'#94a3b8', text: lbl('Checking server…','Verificando…') },
    live:     { bg:'#f0fdf4', color:'#15803d', dot:'#22c55e', text: lbl('Server Live','Servidor en vivo') },
    offline:  { bg:'#fef2f2', color:'#dc2626', dot:'#f87171', text: `${lbl('Server offline —','Servidor sin conexión —')} ${SERVER}` },
  }[serverMode];

  const inp: React.CSSProperties = {
    padding: '0.45rem 0.65rem', fontSize: '0.85rem',
    border: '1px solid #cbd5e1', borderRadius: '6px',
    fontFamily: 'inherit', background: 'white',
  };

  return (
    <section className="section">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:'0.75rem', marginBottom:'1.1rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', flexWrap:'wrap' }}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#6c63ff" strokeWidth="2">
            <path d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2z"/>
            <path d="M15 19V9a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2z"/>
            <path d="M21 19V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2z"/>
          </svg>
          <h2 style={{ margin:0, color:'#1e3a8a', fontSize:'1.2rem' }}>Mentalma Analysis</h2>
          <span style={{ padding:'0.2rem 0.65rem', borderRadius:'20px', fontSize:'0.73rem', fontWeight:600, background:badge.bg, color:badge.color, display:'flex', alignItems:'center', gap:'0.35rem' }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:badge.dot, display:'inline-block' }}/>
            {badge.text}
          </span>
        </div>
        <button type="button" onClick={checkHealth} style={{ fontSize:'0.75rem', padding:'0.3rem 0.7rem', background:'none', border:'1px solid #cbd5e1', borderRadius:'6px', cursor:'pointer', color:'#475569' }}>
          ↻ {lbl('Retry','Reintentar')}
        </button>
      </div>

      {/* ── Offline message ───────────────────────────────────────────── */}
      {serverMode === 'offline' && (
        <div style={{ padding:'1rem 1.2rem', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'10px', marginBottom:'1.25rem' }}>
          <p style={{ margin:'0 0 0.5rem', fontWeight:700, color:'#dc2626' }}>{lbl('Analysis server is offline','El servidor de análisis no está disponible')}</p>
          <p style={{ margin:'0 0 0.5rem', fontSize:'0.85rem', color:'#7f1d1d' }}>
            {lbl('Start it locally:','Inícielo localmente:')}
          </p>
          <code style={{ fontSize:'0.78rem', background:'#1e293b', color:'#a5f3fc', padding:'0.4rem 0.8rem', borderRadius:'6px', display:'inline-block' }}>
            cd /Users/davidebrown/PythonAnalysisServer/MentalmaAnalysisServerPython && ./start.sh
          </code>
          <p style={{ margin:'0.5rem 0 0', fontSize:'0.78rem', color:'#7f1d1d' }}>
            {lbl('Or deploy to Render → set VITE_MENTALMA_ANALYSIS_URL in Netlify env vars.',
                 'O despliegue en Render → configure VITE_MENTALMA_ANALYSIS_URL en las variables de Netlify.')}
          </p>
        </div>
      )}

      {/* ── Date filter ───────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:'0.65rem', alignItems:'center', flexWrap:'wrap', marginBottom:'1.1rem' }}>
        <span style={{ fontSize:'0.78rem', color:'#475569', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>{lbl('Date range','Rango de fechas')}:</span>
        <input style={inp} type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span style={{ color:'#94a3b8' }}>→</span>
        <input style={inp} type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        {(dateFrom || dateTo) && (
          <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ ...inp, cursor:'pointer', color:'#dc2626', border:'1px solid #fecaca' }}>✕</button>
        )}
      </div>

      {/* ── Stat cards ────────────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:'0.65rem', marginBottom:'1.25rem' }}>
        {DOMAINS.map(d => {
          const cfg = DOMAIN_CONFIG[d];
          return (
            <button key={d} type="button" onClick={() => switchDomain(d)}
              style={{ background: domain===d ? '#ede9fe' : 'white', border: domain===d ? '2px solid #6c63ff' : '1px solid #e2e8f0', borderRadius:'10px', padding:'0.85rem 0.65rem', textAlign:'center', cursor:'pointer', transition:'all .15s' }}>
              <div style={{ fontSize:'1.5rem' }}>{cfg.icon}</div>
              <div style={{ fontSize:'1.4rem', fontWeight:800, color:'#1e3a8a', lineHeight:1, margin:'0.2rem 0' }}>
                {serverMode === 'live' ? (totals[d] ?? <span style={{ fontSize:'0.9rem', color:'#94a3b8' }}>…</span>) : '—'}
              </div>
              <div style={{ fontSize:'0.72rem', color:'#64748b' }}>{language === 'es' ? cfg.labelEs : cfg.label}</div>
            </button>
          );
        })}
      </div>

      {/* ── View selector ─────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', marginBottom:'0.85rem', alignItems:'center' }}>
        <span style={{ fontSize:'0.75rem', color:'#64748b', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', marginRight:'0.25rem' }}>
          {lbl('View','Vista')}:
        </span>
        {DOMAIN_CONFIG[domain].views.map(v => (
          <button key={v.id} type="button" onClick={() => switchView(v.id)}
            style={{ padding:'0.3rem 0.75rem', borderRadius:'20px', border: view===v.id ? '2px solid #6c63ff' : '1px solid #e2e8f0', background: view===v.id ? '#6c63ff' : 'white', color: view===v.id ? 'white' : '#475569', fontSize:'0.78rem', fontWeight: view===v.id ? 700 : 400, cursor:'pointer' }}>
            {v.label}
          </button>
        ))}
        <span style={{ fontSize:'0.75rem', color:'#64748b', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', marginLeft:'0.5rem' }}>
          {lbl('Chart','Gráfico')}:
        </span>
        {(['bar','hbar','pie','line'] as const).map(ct => (
          <button key={ct} type="button" onClick={() => setChartType(ct)}
            style={{ padding:'0.3rem 0.65rem', borderRadius:'20px', border: chartType===ct ? '2px solid #0284c7' : '1px solid #e2e8f0', background: chartType===ct ? '#0284c7' : 'white', color: chartType===ct ? 'white' : '#475569', fontSize:'0.78rem', fontWeight: chartType===ct ? 700 : 400, cursor:'pointer' }}>
            {ct}
          </button>
        ))}
      </div>

      {/* ── Chart area ───────────────────────────────────────────────── */}
      <div style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:'12px', padding:'1rem', marginBottom:'1.25rem', minHeight:'320px', display:'flex', alignItems:'center', justifyContent:'center' }}>
        {serverMode === 'checking' && (
          <p style={{ color:'#94a3b8' }}>{lbl('Connecting to server…','Conectando al servidor…')}</p>
        )}
        {serverMode === 'offline' && (
          <p style={{ color:'#94a3b8', textAlign:'center' }}>
            {lbl('Charts unavailable — server offline.','Gráficos no disponibles — servidor sin conexión.')}
          </p>
        )}
        {serverMode === 'live' && chartLoading && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.65rem', color:'#94a3b8' }}>
            <div style={{ width:28, height:28, border:'3px solid #e2e8f0', borderTopColor:'#6c63ff', borderRadius:'50%', animation:'spin .8s linear infinite' }}/>
            {lbl('Loading chart…','Cargando gráfico…')}
          </div>
        )}
        {serverMode === 'live' && !chartLoading && chartError && (
          <p style={{ color:'#dc2626', fontSize:'0.85rem', textAlign:'center' }}>
            ⚠ {lbl('Chart error:','Error de gráfico:')} {chartError}
          </p>
        )}
        {serverMode === 'live' && !chartLoading && chart?.image && (
          <div style={{ width:'100%', textAlign:'center' }}>
            <p style={{ margin:'0 0 0.5rem', fontWeight:700, color:'#1e293b', fontSize:'0.9rem' }}>{chart.title}</p>
            <img
              src={`data:image/png;base64,${chart.image}`}
              alt={chart.title}
              style={{ maxWidth:'100%', height:'auto', borderRadius:'6px' }}
            />
          </div>
        )}
      </div>

      {/* ── Summary text ─────────────────────────────────────────────── */}
      {serverMode === 'live' && (() => {
        const stats =
          domain === 'clients'       ? clientStats :
          domain === 'visits'        ? visitStats :
          domain === 'specialties'   ? specialtyStats :
          professionalStats;
        return stats?.summary ? (
          <div style={{ padding:'0.75rem 1rem', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'0.85rem', color:'#334155' }}>
            {stats.summary}
          </div>
        ) : null;
      })()}

      {/* ── Breakdown table ───────────────────────────────────────────── */}
      {serverMode === 'live' && domain === 'clients' && clientStats && (
        <BreakdownSection title={lbl('Client Breakdown','Desglose de Clientes')} stats={clientStats} view={view} lbl={lbl} />
      )}
      {serverMode === 'live' && domain === 'visits' && visitStats && (
        <BreakdownSection title={lbl('Visit Breakdown','Desglose de Visitas')} stats={visitStats} view={view} lbl={lbl} />
      )}

      <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
    </section>
  );
}

// ── BreakdownSection ──────────────────────────────────────────────────────────

interface BreakdownSectionProps {
  title: string;
  stats: ClientStats | VisitStats;
  view: string;
  lbl: (en: string, es: string) => string;
}

function BreakdownSection({ title, stats, view, lbl }: BreakdownSectionProps) {
  // Pick the right breakdown array based on current view
  const rows: CountBreakdown[] | TimeSeriesPoint[] | null = (() => {
    if ('by_status' in stats && view === 'by_status') return stats.by_status;
    if ('by_gender' in stats && view === 'by_gender') return (stats as ClientStats).by_gender;
    if ('by_specialty' in stats && view === 'by_specialty') return stats.by_specialty;
    if ('by_professional' in stats && view === 'by_professional') return stats.by_professional;
    if ('by_type' in stats && view === 'by_type') return (stats as VisitStats).by_type;
    if ('new_per_month' in stats && view === 'trend') return (stats as ClientStats).new_per_month;
    if ('visits_per_month' in stats && view === 'trend') return (stats as VisitStats).visits_per_month;
    return null;
  })();

  if (!rows || rows.length === 0) return null;

  const isTimeSeries = 'period' in rows[0];
  const cols = isTimeSeries
    ? [lbl('Period','Período'), lbl('Count','Cantidad')]
    : [lbl('Label','Etiqueta'), lbl('Count','Cantidad')];

  const max = Math.max(...rows.map(r => r.count));

  return (
    <div style={{ marginTop:'1rem', background:'white', border:'1px solid #e2e8f0', borderRadius:'10px', overflow:'hidden' }}>
      <div style={{ padding:'0.65rem 1rem', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', fontWeight:700, fontSize:'0.85rem', color:'#1e293b' }}>
        {title}
      </div>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.83rem' }}>
        <thead>
          <tr style={{ background:'#f1f5f9' }}>
            {cols.map(c => <th key={c} style={{ padding:'0.45rem 0.85rem', textAlign:'left', fontWeight:700, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>{c}</th>)}
            <th style={{ padding:'0.45rem 0.85rem', borderBottom:'1px solid #e2e8f0' }}/>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const label = isTimeSeries ? (row as TimeSeriesPoint).period : (row as CountBreakdown).label;
            const count = row.count;
            return (
              <tr key={i} style={{ background: i%2===0?'white':'#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                <td style={{ padding:'0.45rem 0.85rem', color:'#334155' }}>{label}</td>
                <td style={{ padding:'0.45rem 0.85rem', color:'#1e293b', fontWeight:600 }}>{count}</td>
                <td style={{ padding:'0.45rem 0.85rem 0.45rem 0', minWidth:'80px' }}>
                  <div style={{ height:8, borderRadius:4, background:'#e0e7ff', overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:4, background:'#6c63ff', width:`${Math.round((count/max)*100)}%` }}/>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
