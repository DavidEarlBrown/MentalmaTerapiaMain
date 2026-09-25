import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabaseClient';
import { GeminiAiIcon } from './GeminiAiIcon';
import {
  fetchStdQuestionnaireRows,
  generateMissingCatalogContent,
  searchAndAddStandardQuestionnaires,
  syncStorageToTable,
  type StdQuestionnaireRow,
  type SyncResult,
} from '../lib/stdQuestionnaireCatalog';

export function StdQuestionnairesManager() {
  const { language } = useLanguage();
  const es = language === 'es';
  const label = (enText: string, esText: string) => (es ? esText : enText);

  const [rows, setRows] = useState<StdQuestionnaireRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [results, setResults] = useState<SyncResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchStdQuestionnaireRows());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const runAction = async (action: () => Promise<SyncResult[]>) => {
    setBusy(true);
    setResults([]);
    setError(null);
    setProgress(label('Starting…', 'Iniciando…'));
    try {
      const next = await action();
      setResults(next);
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const toggleFlag = async (id: string, field: 'active' | 'client_avail', value: boolean) => {
    const { error: updateError } = await supabase
      .from('std_questionnaires')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setRows(prev => prev.map(row => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const startEdit = (row: StdQuestionnaireRow) => {
    setEditingId(row.id);
    setEditName(row.name || '');
    setEditDescription(row.description || '');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error: updateError } = await supabase
      .from('std_questionnaires')
      .update({
        name: editName.trim(),
        description: editDescription.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setEditingId(null);
    await loadRows();
  };

  const storageLabel = (row: StdQuestionnaireRow) => {
    const loc = row.storage_location;
    const parts = [loc?.en ? 'EN' : null, loc?.es ? 'ES' : null].filter(Boolean);
    return parts.length > 0 ? parts.join(' + ') : label('Missing', 'Falta');
  };

  return (
    <section className="section std-questionnaires-manager">
      <h2 style={{ margin: '0 0 0.35rem' }}>
        {label('Maintain Standard Questionnaires', 'Mantener cuestionarios estándar')}
      </h2>
      <p className="section-subtitle" style={{ marginTop: 0 }}>
        {label(
          'Keep the std_questionnaires table in sync with storage. Add instruments found by AI search so Request a Session can reuse them instead of creating questionnaires from scratch.',
          'Mantenga la tabla std_questionnaires sincronizada con storage. Agregue instrumentos encontrados con IA para que Solicitar sesión los reutilice en lugar de crearlos desde cero.',
        )}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', margin: '1rem 0 0.75rem' }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runAction(() => syncStorageToTable(setProgress))}
          style={actionButton('#0f766e', busy)}
        >
          {label('Sync storage → table', 'Sincronizar storage → tabla')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runAction(() => searchAndAddStandardQuestionnaires(setProgress))}
          style={actionButton('#7c3aed', busy)}
        >
          <GeminiAiIcon />
          {label('AI search & add new', 'Buscar con IA y agregar')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runAction(() => generateMissingCatalogContent(setProgress))}
          style={actionButton('#2563eb', busy)}
        >
          <GeminiAiIcon />
          {label('Generate missing content', 'Generar contenido faltante')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadRows()}
          style={actionButton('#475569', busy)}
        >
          {label('Refresh list', 'Actualizar lista')}
        </button>
      </div>

      {progress && (
        <p style={{ fontSize: '0.88rem', color: '#334155', margin: '0 0 0.75rem' }}>
          {label('Progress', 'Progreso')}: {progress}
        </p>
      )}
      {error && (
        <p style={{ fontSize: '0.88rem', color: '#b91c1c', margin: '0 0 0.75rem' }}>{error}</p>
      )}
      {results.length > 0 && (
        <div style={{
          marginBottom: '1rem',
          maxHeight: '180px',
          overflowY: 'auto',
          padding: '0.65rem 0.8rem',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
        }}>
          {results.map(result => (
            <div
              key={`${result.id}-${result.message || result.status}`}
              style={{
                fontSize: '0.82rem',
                color: result.status === 'ok' ? '#15803d' : result.status === 'skipped' ? '#92400e' : '#dc2626',
              }}
            >
              {result.status === 'ok' ? '✓' : result.status === 'skipped' ? '–' : '✗'} {result.id}
              {result.message ? ` — ${result.message}` : ''}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p>{label('Loading catalog…', 'Cargando catálogo…')}</p>
      ) : rows.length === 0 ? (
        <p style={{ color: '#64748b' }}>
          {label(
            'No questionnaires in the table yet. Sync storage or run AI search to add them.',
            'Aún no hay cuestionarios en la tabla. Sincronice storage o ejecute la búsqueda IA para agregarlos.',
          )}
        </p>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>{label('ID', 'ID')}</th>
                <th>{label('Name', 'Nombre')}</th>
                <th>{label('Description', 'Descripción')}</th>
                <th>{label('Storage', 'Storage')}</th>
                <th>{label('Active', 'Activo')}</th>
                <th>{label('Client can view results', 'Cliente ve resultados')}</th>
                <th>{label('Actions', 'Acciones')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td><code>{row.id}</code></td>
                  <td>
                    {editingId === row.id ? (
                      <input
                        className="edit-input"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                      />
                    ) : (
                      row.name || '—'
                    )}
                  </td>
                  <td style={{ maxWidth: '280px' }}>
                    {editingId === row.id ? (
                      <input
                        className="edit-input edit-input-wide"
                        value={editDescription}
                        onChange={e => setEditDescription(e.target.value)}
                      />
                    ) : (
                      <span style={{ color: '#475569', fontSize: '0.85rem' }}>{row.description || '—'}</span>
                    )}
                  </td>
                  <td>
                    <span style={{
                      fontWeight: 600,
                      color: row.storage_location?.en || row.storage_location?.es ? '#15803d' : '#b45309',
                    }}>
                      {storageLabel(row)}
                    </span>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.active === true}
                      disabled={busy}
                      onChange={e => void toggleFlag(row.id, 'active', e.target.checked)}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.client_avail === true}
                      disabled={busy}
                      onChange={e => void toggleFlag(row.id, 'client_avail', e.target.checked)}
                    />
                  </td>
                  <td>
                    {editingId === row.id ? (
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button type="button" className="save-btn" onClick={() => void saveEdit()}>
                          {label('Save', 'Guardar')}
                        </button>
                        <button type="button" className="cancel-btn" onClick={() => setEditingId(null)}>
                          {label('Cancel', 'Cancelar')}
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="edit-btn" onClick={() => startEdit(row)}>
                        {label('Edit', 'Editar')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function actionButton(background: string, busy: boolean): CSSProperties {
  return {
    padding: '0.5rem 1.1rem',
    background: busy ? '#9ca3af' : background,
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: busy ? 'not-allowed' : 'pointer',
    fontWeight: 600,
    fontSize: '0.875rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
  };
}
