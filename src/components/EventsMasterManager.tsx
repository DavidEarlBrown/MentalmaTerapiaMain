import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabaseClient';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EventRecord {
  id: string;
  event_name: string;
  event_date: string | null;
  team_one_name: string;
  team_two_name: string;
  team_one_result: number | null;
  team_two_result: number | null;
  /** 'team_one' | 'team_two' | null */
  penalty_winner: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  notes: string;
  created_at: string;
}

type EventFormData = Omit<EventRecord, 'id' | 'created_at'>;

const EMPTY_FORM: EventFormData = {
  event_name: '',
  event_date: '',
  team_one_name: '',
  team_two_name: '',
  team_one_result: null,
  team_two_result: null,
  penalty_winner: null,
  status: 'scheduled',
  notes: '',
};

const STATUS_OPTIONS = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true when both results are equal numbers (tie after full time) */
const isTie = (a: number | null, b: number | null) =>
  a !== null && b !== null && a === b;

/** Resolve the penalty_winner id to the actual team name */
const resolvePenaltyName = (event: EventRecord): string => {
  if (!event.penalty_winner) return '—';
  return event.penalty_winner === 'team_one'
    ? event.team_one_name || 'Team 1'
    : event.team_two_name || 'Team 2';
};

/** Determine the winning team for display purposes */
const getWinner = (event: EventRecord): 'team_one' | 'team_two' | 'draw' | null => {
  const { team_one_result: t1, team_two_result: t2, penalty_winner } = event;
  if (t1 === null || t2 === null) return null;
  if (penalty_winner) return penalty_winner as 'team_one' | 'team_two';
  if (t1 > t2) return 'team_one';
  if (t2 > t1) return 'team_two';
  return 'draw';
};

// ── Component ─────────────────────────────────────────────────────────────────

export function EventsMasterManager() {
  const { language } = useLanguage();
  const es = language === 'es';

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Currently active edit: either the id of an existing row, or 'new'
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventFormData>(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('EventsMaster')
      .select('*')
      .order('event_date', { ascending: true });

    if (err) {
      setError(err.message);
    } else {
      setEvents((data as EventRecord[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Dismiss success banner automatically
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 3500);
    return () => clearTimeout(t);
  }, [success]);

  // ── Form helpers ───────────────────────────────────────────────────────────

  const setField = <K extends keyof EventFormData>(key: K, value: EventFormData[K]) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      // When both results become equal, keep penalty_winner; otherwise clear it
      if (key === 'team_one_result' || key === 'team_two_result') {
        const r1 = key === 'team_one_result' ? (value as number | null) : prev.team_one_result;
        const r2 = key === 'team_two_result' ? (value as number | null) : prev.team_two_result;
        if (!isTie(r1, r2)) {
          next.penalty_winner = null;
        }
      }
      return next;
    });
  };

  const startCreate = () => {
    setEditingId('new');
    setForm(EMPTY_FORM);
    setDeleteConfirm(null);
    setError(null);
  };

  const startEdit = (ev: EventRecord) => {
    setEditingId(ev.id);
    setForm({
      event_name: ev.event_name,
      event_date: ev.event_date ?? '',
      team_one_name: ev.team_one_name,
      team_two_name: ev.team_two_name,
      team_one_result: ev.team_one_result,
      team_two_result: ev.team_two_result,
      penalty_winner: ev.penalty_winner,
      status: ev.status,
      notes: ev.notes,
    });
    setDeleteConfirm(null);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  };

  // ── Keyboard shortcut: Esc cancels edit ───────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editingId !== null) {
        e.preventDefault();
        cancelEdit();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editingId]);

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.event_name.trim()) {
      setError(es ? 'El nombre del evento es obligatorio.' : 'Event name is required.');
      return;
    }
    if (!form.team_one_name.trim() || !form.team_two_name.trim()) {
      setError(es ? 'Ambos nombres de equipo son obligatorios.' : 'Both team names are required.');
      return;
    }
    if (isTie(form.team_one_result, form.team_two_result) && !form.penalty_winner) {
      setError(
        es
          ? 'El marcador está empatado — seleccione el ganador por penales.'
          : 'Score is tied — please select the penalty shootout winner.'
      );
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      event_name: form.event_name.trim(),
      event_date: form.event_date || null,
      team_one_name: form.team_one_name.trim(),
      team_two_name: form.team_two_name.trim(),
      team_one_result: form.team_one_result,
      team_two_result: form.team_two_result,
      penalty_winner: isTie(form.team_one_result, form.team_two_result)
        ? form.penalty_winner
        : null,
      status: form.status,
      notes: form.notes,
    };

    if (editingId === 'new') {
      const { error: err } = await supabase.from('EventsMaster').insert(payload);
      if (err) {
        setError(err.message);
      } else {
        setSuccess(es ? 'Evento creado.' : 'Event created.');
        setEditingId(null);
        setForm(EMPTY_FORM);
        await fetchEvents();
      }
    } else {
      const { error: err } = await supabase
        .from('EventsMaster')
        .update(payload)
        .eq('id', editingId);
      if (err) {
        setError(err.message);
      } else {
        setSuccess(es ? 'Resultado guardado.' : 'Result saved.');
        setEditingId(null);
        setForm(EMPTY_FORM);
        await fetchEvents();
      }
    }
    setSaving(false);
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    setSaving(true);
    const { error: err } = await supabase.from('EventsMaster').delete().eq('id', id);
    if (err) {
      setError(err.message);
    } else {
      setSuccess(es ? 'Evento eliminado.' : 'Event deleted.');
      if (editingId === id) cancelEdit();
      setDeleteConfirm(null);
      await fetchEvents();
    }
    setSaving(false);
  };

  // ── Quick result entry (inline) ────────────────────────────────────────────
  // Allows saving just the result fields without opening full edit form

  const handleQuickResultSave = async (
    ev: EventRecord,
    r1: number | null,
    r2: number | null,
    penaltyWinner: string | null
  ) => {
    setSaving(true);
    const { error: err } = await supabase
      .from('EventsMaster')
      .update({
        team_one_result: r1,
        team_two_result: r2,
        penalty_winner: isTie(r1, r2) ? penaltyWinner : null,
        status: r1 !== null && r2 !== null ? 'completed' : ev.status,
      })
      .eq('id', ev.id);

    if (err) {
      setError(err.message);
    } else {
      setSuccess(es ? 'Resultado guardado.' : 'Result saved.');
      await fetchEvents();
    }
    setSaving(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const statusLabel = (s: string) => {
    const map: Record<string, [string, string]> = {
      scheduled: ['Programado', 'Scheduled'],
      in_progress: ['En curso', 'In Progress'],
      completed: ['Completado', 'Completed'],
      cancelled: ['Cancelado', 'Cancelled'],
    };
    return es ? map[s]?.[0] ?? s : map[s]?.[1] ?? s;
  };

  const statusColor: Record<string, string> = {
    scheduled: '#6366f1',
    in_progress: '#f59e0b',
    completed: '#10b981',
    cancelled: '#6b7280',
  };

  return (
    <section className="section events-master-manager">
      <style>{`
        .events-master-manager { font-family: inherit; }
        .em-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1.25rem;
          flex-wrap: wrap;
        }
        .em-btn {
          padding: 0.5rem 1.1rem;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 600;
          transition: background 0.15s;
        }
        .em-btn-primary { background: #6366f1; color: #fff; }
        .em-btn-primary:hover:not(:disabled) { background: #4f46e5; }
        .em-btn-save    { background: #10b981; color: #fff; }
        .em-btn-save:hover:not(:disabled) { background: #059669; }
        .em-btn-cancel  { background: #e5e7eb; color: #374151; }
        .em-btn-cancel:hover:not(:disabled) { background: #d1d5db; }
        .em-btn-danger  { background: #ef4444; color: #fff; }
        .em-btn-danger:hover:not(:disabled) { background: #dc2626; }
        .em-btn-sm      { padding: 0.3rem 0.7rem; font-size: 0.8rem; }
        .em-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        .em-form-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 1.25rem 1.5rem;
          margin-bottom: 1.5rem;
        }
        .em-form-title {
          font-size: 1rem;
          font-weight: 700;
          color: #1e293b;
          margin: 0 0 1rem 0;
        }
        .em-form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 0.85rem 1.25rem;
        }
        .em-field label {
          display: block;
          font-size: 0.78rem;
          font-weight: 600;
          color: #64748b;
          margin-bottom: 0.3rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .em-field input,
        .em-field select,
        .em-field textarea {
          width: 100%;
          padding: 0.45rem 0.65rem;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 0.9rem;
          background: #fff;
          color: #1e293b;
          box-sizing: border-box;
          transition: border-color 0.15s;
        }
        .em-field input:focus,
        .em-field select:focus,
        .em-field textarea:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 2px rgba(99,102,241,0.15);
        }
        .em-field--score input {
          font-size: 1.4rem;
          font-weight: 700;
          text-align: center;
          width: 90px;
        }
        .em-score-row {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          flex-wrap: wrap;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          padding: 0.9rem 1.25rem;
          margin-top: 0.25rem;
        }
        .em-score-team { text-align: center; }
        .em-score-team-name {
          font-size: 0.8rem;
          font-weight: 700;
          color: #1e40af;
          margin-bottom: 0.4rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .em-vs-label {
          font-size: 1.2rem;
          font-weight: 800;
          color: #475569;
          flex-shrink: 0;
        }
        .em-penalty-row {
          background: #fef3c7;
          border: 1px solid #fbbf24;
          border-radius: 8px;
          padding: 0.75rem 1rem;
          margin-top: 0.5rem;
        }
        .em-penalty-row label {
          font-weight: 700;
          font-size: 0.85rem;
          color: #92400e;
          display: block;
          margin-bottom: 0.35rem;
        }
        .em-form-actions {
          display: flex;
          gap: 0.65rem;
          margin-top: 1.1rem;
          flex-wrap: wrap;
        }

        /* Event list */
        .em-table-wrap {
          overflow-x: auto;
        }
        .em-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }
        .em-table th {
          background: #f1f5f9;
          color: #475569;
          font-weight: 700;
          text-align: left;
          padding: 0.6rem 0.75rem;
          white-space: nowrap;
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .em-table td {
          padding: 0.55rem 0.75rem;
          border-bottom: 1px solid #e2e8f0;
          vertical-align: middle;
        }
        .em-table tr:last-child td { border-bottom: none; }
        .em-table tr:hover td { background: #f8fafc; }

        .em-score-display {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 1.05rem;
          font-weight: 700;
        }
        .em-score-val { min-width: 1.5rem; text-align: center; }
        .em-score-sep { color: #94a3b8; font-weight: 400; }
        .em-winner-tag {
          display: inline-block;
          background: #d1fae5;
          color: #065f46;
          border-radius: 4px;
          padding: 0.1rem 0.45rem;
          font-size: 0.75rem;
          font-weight: 700;
          margin-left: 0.35rem;
        }
        .em-penalty-tag {
          display: inline-block;
          background: #fef3c7;
          color: #92400e;
          border-radius: 4px;
          padding: 0.1rem 0.45rem;
          font-size: 0.75rem;
          font-weight: 600;
          margin-left: 0.25rem;
        }
        .em-status-badge {
          display: inline-block;
          padding: 0.15rem 0.55rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 700;
          color: #fff;
        }
        .em-action-btns { display: flex; gap: 0.4rem; }

        /* Quick result inline editor */
        .em-inline-result {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .em-inline-result input[type="number"] {
          width: 60px;
          padding: 0.3rem 0.4rem;
          border: 1px solid #93c5fd;
          border-radius: 5px;
          font-size: 1rem;
          font-weight: 700;
          text-align: center;
        }
        .em-inline-result select {
          padding: 0.3rem 0.5rem;
          border: 1px solid #fbbf24;
          border-radius: 5px;
          background: #fef3c7;
          font-size: 0.8rem;
        }

        .em-alert {
          border-radius: 6px;
          padding: 0.65rem 1rem;
          font-size: 0.875rem;
          margin-bottom: 0.75rem;
        }
        .em-alert-error   { background: #fee2e2; color: #991b1b; }
        .em-alert-success { background: #d1fae5; color: #065f46; }
      `}</style>

      <h2 style={{ margin: '0 0 0.25rem 0' }}>
        {es ? 'Administración de Eventos' : 'Events Master — Match Results'}
      </h2>
      <p style={{ color: '#64748b', margin: '0 0 1.25rem 0', fontSize: '0.9rem' }}>
        {es
          ? 'Gestione partidos, resultados y ganadores por penales.'
          : 'Manage match fixtures, results and penalty shootout winners.'}
      </p>

      {/* ── Feedback banners ─────────────────────────────────────────────── */}
      {error && <div className="em-alert em-alert-error">{error}</div>}
      {success && <div className="em-alert em-alert-success">{success}</div>}

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="em-toolbar">
        <button
          className="em-btn em-btn-primary"
          onClick={startCreate}
          disabled={editingId === 'new' || saving}
        >
          {es ? '+ Nuevo Evento' : '+ New Event'}
        </button>
        <button className="em-btn em-btn-cancel" onClick={fetchEvents} disabled={loading || saving}>
          {es ? 'Actualizar lista' : 'Refresh'}
        </button>
      </div>

      {/* ── Create / Edit form ────────────────────────────────────────────── */}
      {editingId !== null && (
        <div className="em-form-card">
          <p className="em-form-title">
            {editingId === 'new'
              ? (es ? 'Nuevo Evento' : 'New Event')
              : (es ? 'Editar Evento' : 'Edit Event')}
          </p>

          {/* Basic info */}
          <div className="em-form-grid">
            <div className="em-field" style={{ gridColumn: 'span 2' }}>
              <label>{es ? 'Nombre del Evento' : 'Event Name'}</label>
              <input
                type="text"
                value={form.event_name}
                onChange={e => setField('event_name', e.target.value)}
                placeholder={es ? 'Ej: Final Copa Mundo 2026' : 'e.g. World Cup Final 2026'}
              />
            </div>
            <div className="em-field">
              <label>{es ? 'Fecha / Hora' : 'Date / Time'}</label>
              <input
                type="datetime-local"
                value={form.event_date ? form.event_date.substring(0, 16) : ''}
                onChange={e => setField('event_date', e.target.value ? new Date(e.target.value).toISOString() : null)}
              />
            </div>
            <div className="em-field">
              <label>{es ? 'Estado' : 'Status'}</label>
              <select value={form.status} onChange={e => setField('status', e.target.value as EventFormData['status'])}>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{statusLabel(s)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Team names */}
          <div className="em-form-grid" style={{ marginTop: '0.85rem' }}>
            <div className="em-field">
              <label>{es ? 'Equipo 1 — Nombre' : 'Team 1 — Name'}</label>
              <input
                type="text"
                value={form.team_one_name}
                onChange={e => setField('team_one_name', e.target.value)}
                placeholder={es ? 'Ej: Colombia' : 'e.g. Colombia'}
              />
            </div>
            <div className="em-field">
              <label>{es ? 'Equipo 2 — Nombre' : 'Team 2 — Name'}</label>
              <input
                type="text"
                value={form.team_two_name}
                onChange={e => setField('team_two_name', e.target.value)}
                placeholder={es ? 'Ej: Argentina' : 'e.g. Argentina'}
              />
            </div>
          </div>

          {/* Score entry */}
          <div className="em-score-row" style={{ marginTop: '0.85rem' }}>
            <div className="em-score-team">
              <div className="em-score-team-name">{form.team_one_name || (es ? 'Equipo 1' : 'Team 1')}</div>
              <div className="em-field em-field--score">
                <input
                  type="number"
                  min={0}
                  value={form.team_one_result ?? ''}
                  onChange={e => setField('team_one_result', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="—"
                />
              </div>
            </div>

            <span className="em-vs-label">VS</span>

            <div className="em-score-team">
              <div className="em-score-team-name">{form.team_two_name || (es ? 'Equipo 2' : 'Team 2')}</div>
              <div className="em-field em-field--score">
                <input
                  type="number"
                  min={0}
                  value={form.team_two_result ?? ''}
                  onChange={e => setField('team_two_result', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="—"
                />
              </div>
            </div>
          </div>

          {/* Penalty winner — only visible when scores are tied */}
          {isTie(form.team_one_result, form.team_two_result) && (
            <div className="em-penalty-row">
              <label>
                ⚽ {es
                  ? `Empate ${form.team_one_result} – ${form.team_two_result} — Ganador por penales:`
                  : `Draw ${form.team_one_result} – ${form.team_two_result} — Penalty shootout winner:`}
              </label>
              <select
                value={form.penalty_winner ?? ''}
                onChange={e => setField('penalty_winner', e.target.value || null)}
                style={{ minWidth: '220px', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid #fbbf24', fontSize: '0.9rem', background: '#fff' }}
              >
                <option value="">{es ? '— Seleccione ganador —' : '— Select winner —'}</option>
                <option value="team_one">{form.team_one_name || (es ? 'Equipo 1' : 'Team 1')}</option>
                <option value="team_two">{form.team_two_name || (es ? 'Equipo 2' : 'Team 2')}</option>
              </select>
            </div>
          )}

          {/* Notes */}
          <div className="em-field" style={{ marginTop: '0.85rem' }}>
            <label>{es ? 'Notas' : 'Notes'}</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              placeholder={es ? 'Observaciones opcionales…' : 'Optional notes…'}
            />
          </div>

          <div className="em-form-actions">
            <button className="em-btn em-btn-save" onClick={handleSave} disabled={saving}>
              {saving ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Guardar' : 'Save')}
            </button>
            <button className="em-btn em-btn-cancel" onClick={cancelEdit} disabled={saving}>
              {es ? 'Cancelar' : 'Cancel'} (Esc)
            </button>
          </div>
        </div>
      )}

      {/* ── Events table ─────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
          {es ? 'Cargando eventos…' : 'Loading events…'}
        </div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
          {es ? 'No hay eventos registrados.' : 'No events yet. Click "+ New Event" to add one.'}
        </div>
      ) : (
        <EventsTable
          events={events}
          editingId={editingId}
          deleteConfirm={deleteConfirm}
          saving={saving}
          language={language}
          statusLabel={statusLabel}
          statusColor={statusColor}
          onEdit={startEdit}
          onDeleteConfirm={setDeleteConfirm}
          onDelete={handleDelete}
          onQuickSave={handleQuickResultSave}
        />
      )}
    </section>
  );
}

// ── Sub-component: table of events ────────────────────────────────────────────

interface EventsTableProps {
  events: EventRecord[];
  editingId: string | null;
  deleteConfirm: string | null;
  saving: boolean;
  language: string;
  statusLabel: (s: string) => string;
  statusColor: Record<string, string>;
  onEdit: (ev: EventRecord) => void;
  onDeleteConfirm: (id: string | null) => void;
  onDelete: (id: string) => void;
  onQuickSave: (ev: EventRecord, r1: number | null, r2: number | null, pw: string | null) => void;
}

function EventsTable({
  events, editingId, deleteConfirm, saving, language,
  statusLabel, statusColor, onEdit, onDeleteConfirm, onDelete, onQuickSave,
}: EventsTableProps) {
  const es = language === 'es';

  // Local state for inline result entry (per row)
  const [inlineEdits, setInlineEdits] = useState<Record<string, {
    r1: string; r2: string; pw: string; open: boolean;
  }>>({});

  const openInline = (ev: EventRecord) => {
    setInlineEdits(prev => ({
      ...prev,
      [ev.id]: {
        r1: ev.team_one_result !== null ? String(ev.team_one_result) : '',
        r2: ev.team_two_result !== null ? String(ev.team_two_result) : '',
        pw: ev.penalty_winner ?? '',
        open: true,
      },
    }));
  };

  const closeInline = (id: string) => {
    setInlineEdits(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const setInlineField = (id: string, field: 'r1' | 'r2' | 'pw', value: string) => {
    setInlineEdits(prev => {
      const current = prev[id] ?? { r1: '', r2: '', pw: '', open: true };
      const next = { ...current, [field]: value };
      // When scores are no longer tied, clear penalty winner
      const r1 = field === 'r1' ? value : current.r1;
      const r2 = field === 'r2' ? value : current.r2;
      if (r1 !== '' && r2 !== '' && r1 !== r2) {
        next.pw = '';
      }
      return { ...prev, [id]: next };
    });
  };

  const commitInline = (ev: EventRecord) => {
    const ie = inlineEdits[ev.id];
    if (!ie) return;
    const r1 = ie.r1 !== '' ? Number(ie.r1) : null;
    const r2 = ie.r2 !== '' ? Number(ie.r2) : null;
    const tied = isTie(r1, r2);
    if (tied && !ie.pw) {
      alert(es ? 'Empate — seleccione el ganador por penales.' : 'Draw — select the penalty winner first.');
      return;
    }
    onQuickSave(ev, r1, r2, tied ? ie.pw || null : null);
    closeInline(ev.id);
  };

  return (
    <div className="em-table-wrap">
      <table className="em-table">
        <thead>
          <tr>
            <th>{es ? 'Evento' : 'Event'}</th>
            <th>{es ? 'Fecha' : 'Date'}</th>
            <th>{es ? 'Equipos' : 'Teams'}</th>
            <th>{es ? 'Resultado' : 'Result'}</th>
            <th>{es ? 'Estado' : 'Status'}</th>
            <th>{es ? 'Acciones' : 'Actions'}</th>
          </tr>
        </thead>
        <tbody>
          {events.map(ev => {
            const winner = getWinner(ev);
            const ie = inlineEdits[ev.id];
            const inlineTied = ie && ie.r1 !== '' && ie.r2 !== '' && ie.r1 === ie.r2;

            return (
              <tr key={ev.id}>
                {/* Event name */}
                <td style={{ fontWeight: 600, color: '#1e293b', maxWidth: '200px' }}>
                  {ev.event_name}
                  {ev.notes && (
                    <div style={{ fontWeight: 400, fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                      {ev.notes}
                    </div>
                  )}
                </td>

                {/* Date */}
                <td style={{ whiteSpace: 'nowrap', color: '#64748b', fontSize: '0.82rem' }}>
                  {ev.event_date
                    ? new Date(ev.event_date).toLocaleString(es ? 'es-CO' : 'en-US', {
                        dateStyle: 'short', timeStyle: 'short',
                      })
                    : '—'}
                </td>

                {/* Teams */}
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span
                      style={{
                        fontWeight: winner === 'team_one' ? 700 : 400,
                        color: winner === 'team_one' ? '#065f46' : '#1e293b',
                      }}
                    >
                      {ev.team_one_name}
                      {winner === 'team_one' && (
                        <span className="em-winner-tag">
                          {ev.penalty_winner === 'team_one'
                            ? (es ? 'Pen.' : 'Pen.')
                            : (es ? 'Ganador' : 'Winner')}
                        </span>
                      )}
                    </span>
                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>vs</span>
                    <span
                      style={{
                        fontWeight: winner === 'team_two' ? 700 : 400,
                        color: winner === 'team_two' ? '#065f46' : '#1e293b',
                      }}
                    >
                      {ev.team_two_name}
                      {winner === 'team_two' && (
                        <span className="em-winner-tag">
                          {ev.penalty_winner === 'team_two'
                            ? (es ? 'Pen.' : 'Pen.')
                            : (es ? 'Ganador' : 'Winner')}
                        </span>
                      )}
                    </span>
                  </div>
                </td>

                {/* Result — shows inline editor or current result */}
                <td>
                  {ie?.open ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <div className="em-inline-result">
                        <input
                          type="number"
                          min={0}
                          value={ie.r1}
                          onChange={e => setInlineField(ev.id, 'r1', e.target.value)}
                          placeholder="—"
                          title={ev.team_one_name}
                        />
                        <span style={{ fontWeight: 700, color: '#64748b' }}>–</span>
                        <input
                          type="number"
                          min={0}
                          value={ie.r2}
                          onChange={e => setInlineField(ev.id, 'r2', e.target.value)}
                          placeholder="—"
                          title={ev.team_two_name}
                        />
                      </div>
                      {inlineTied && (
                        <select
                          value={ie.pw}
                          onChange={e => setInlineField(ev.id, 'pw', e.target.value)}
                          title={es ? 'Ganador por penales' : 'Penalty winner'}
                        >
                          <option value="">{es ? '— Penales —' : '— Penalties —'}</option>
                          <option value="team_one">{ev.team_one_name}</option>
                          <option value="team_two">{ev.team_two_name}</option>
                        </select>
                      )}
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button
                          className="em-btn em-btn-save em-btn-sm"
                          onClick={() => commitInline(ev)}
                          disabled={saving}
                        >
                          ✓
                        </button>
                        <button
                          className="em-btn em-btn-cancel em-btn-sm"
                          onClick={() => closeInline(ev.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {ev.team_one_result !== null && ev.team_two_result !== null ? (
                        <div className="em-score-display">
                          <span className="em-score-val">{ev.team_one_result}</span>
                          <span className="em-score-sep"> – </span>
                          <span className="em-score-val">{ev.team_two_result}</span>
                          {ev.penalty_winner && (
                            <span className="em-penalty-tag" title={es ? 'Ganador por penales' : 'Penalty winner'}>
                              {es ? 'pen.' : 'pen.'} {resolvePenaltyName(ev)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                          {es ? 'Sin resultado' : 'No result'}
                        </span>
                      )}
                      {/* Quick result entry button */}
                      {editingId === null && deleteConfirm !== ev.id && (
                        <button
                          className="em-btn em-btn-primary em-btn-sm"
                          style={{ marginTop: '0.3rem', display: 'block' }}
                          onClick={() => openInline(ev)}
                          disabled={saving}
                        >
                          ⚽ {es ? 'Resultado' : 'Enter Result'}
                        </button>
                      )}
                    </div>
                  )}
                </td>

                {/* Status */}
                <td>
                  <span
                    className="em-status-badge"
                    style={{ background: statusColor[ev.status] ?? '#6b7280' }}
                  >
                    {statusLabel(ev.status)}
                  </span>
                </td>

                {/* Actions */}
                <td>
                  {deleteConfirm === ev.id ? (
                    <div className="em-action-btns">
                      <button
                        className="em-btn em-btn-danger em-btn-sm"
                        onClick={() => onDelete(ev.id)}
                        disabled={saving}
                      >
                        {es ? 'Confirmar' : 'Confirm'}
                      </button>
                      <button
                        className="em-btn em-btn-cancel em-btn-sm"
                        onClick={() => onDeleteConfirm(null)}
                      >
                        {es ? 'No' : 'No'}
                      </button>
                    </div>
                  ) : (
                    <div className="em-action-btns">
                      <button
                        className="em-btn em-btn-cancel em-btn-sm"
                        title={es ? 'Editar evento' : 'Edit event'}
                        onClick={() => onEdit(ev)}
                        disabled={saving || ie?.open}
                      >
                        ✎
                      </button>
                      <button
                        className="em-btn em-btn-danger em-btn-sm"
                        title={es ? 'Eliminar' : 'Delete'}
                        onClick={() => onDeleteConfirm(ev.id)}
                        disabled={saving || ie?.open}
                      >
                        🗑
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
