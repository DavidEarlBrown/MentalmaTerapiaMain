import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useProfession } from '../contexts/ProfessionContext';
import {
  fetchProfessions,
  createProfession,
  updateProfession,
  deleteProfession,
} from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import type { Profession, Specialty, CounselingType, Problem } from '../types';

type SubTab = 'specialties' | 'counseling_types' | 'problems';

const emptyForm = {
  name_en: '',
  name_es: '',
  description_en: '',
  description_es: '',
  is_active: true,
};

export function ProfessionManager() {
  const { t, language } = useLanguage();
  const { setActiveProfession } = useProfession();

  const [professions, setProfessions] = useState<Profession[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Sub-tab state for the selected profession's items
  const [selectedProfessionId, setSelectedProfessionId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>('specialties');
  const [subItems, setSubItems] = useState<(Specialty | CounselingType | Problem)[]>([]);
  const [loadingSubItems, setLoadingSubItems] = useState(false);
  const [addingItem, setAddingItem] = useState(false);

  // Linked-item form (for specialties and counseling_types)
  const [itemForm, setItemForm] = useState<Record<string, string | boolean | null>>({});
  const [editingItemId, setEditingItemId] = useState<string | number | null>(null);

  // Specialty picker — shows all specialties for bulk assign/unassign
  const [showSpecialtyPicker, setShowSpecialtyPicker] = useState(false);
  const [allSpecialties, setAllSpecialties] = useState<Specialty[]>([]);
  const [loadingAllSpecialties, setLoadingAllSpecialties] = useState(false);
  const [pickedSpecialtyIds, setPickedSpecialtyIds] = useState<Set<string>>(new Set());
  const [specialtySearch, setSpecialtySearch] = useState('');

  // Counseling types picker
  const [showCounselingPicker, setShowCounselingPicker] = useState(false);
  const [allCounselingTypes, setAllCounselingTypes] = useState<CounselingType[]>([]);
  const [loadingAllCounseling, setLoadingAllCounseling] = useState(false);
  const [pickedCounselingIds, setPickedCounselingIds] = useState<Set<string>>(new Set());
  const [counselingSearch, setCounselingSearch] = useState('');

  // Problems picker
  const [showProblemPicker, setShowProblemPicker] = useState(false);
  const [allProblems, setAllProblems] = useState<Problem[]>([]);
  const [loadingAllProblems, setLoadingAllProblems] = useState(false);
  const [pickedProblemIds, setPickedProblemIds] = useState<Set<string>>(new Set());
  const [problemSearch, setProblemSearch] = useState('');

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (selectedProfessionId) loadSubItems();
  }, [selectedProfessionId, subTab]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchProfessions();
      setProfessions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load professions');
    } finally {
      setLoading(false);
    }
  };

  const loadSubItems = async () => {
    if (!selectedProfessionId) return;
    setLoadingSubItems(true);
    try {
      if (subTab === 'specialties') {
        const { data } = await supabase
          .from('specialties')
          .select('*')
          .eq('profession_id', selectedProfessionId)
          .order('name_en');
        setSubItems(data || []);
      } else if (subTab === 'counseling_types') {
        const { data } = await supabase
          .from('counseling_types')
          .select('*')
          .eq('profession_id', selectedProfessionId)
          .order('name_en');
        setSubItems(data || []);
      } else {
        const { data } = await supabase
          .from('problems')
          .select('*')
          .eq('profession_id', selectedProfessionId)
          .order('problem_abrev');
        setSubItems(data || []);
      }
    } catch {
      setSubItems([]);
    } finally {
      setLoadingSubItems(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await updateProfession(editingId, formData);
      } else {
        await createProfession(formData);
      }
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save profession');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (p: Profession) => {
    setFormData({
      name_en: p.name_en,
      name_es: p.name_es,
      description_en: p.description_en,
      description_es: p.description_es,
      is_active: p.is_active,
    });
    setEditingId(p.id);
    setIsCreating(true);
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    setError('');
    try {
      await deleteProfession(id);
      setDeleteConfirm(null);
      if (selectedProfessionId === id) setSelectedProfessionId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete profession');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (p: Profession) => {
    setSaving(true);
    setError('');
    try {
      const activating = !p.is_active;

      if (activating) {
        // Deactivate all other active professions first (one active at a time)
        await Promise.all(
          professions
            .filter(other => other.id !== p.id && other.is_active)
            .map(other => updateProfession(other.id, { is_active: false }))
        );
      }

      await updateProfession(p.id, { is_active: activating });
      await load();

      if (activating) {
        // Make this the global active category for the whole app
        setActiveProfession({ ...p, is_active: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update profession');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setIsCreating(false);
  };

  const handleUnassignItem = async (itemId: string | number) => {
    if (!selectedProfessionId) return;
    setSaving(true);
    try {
      await supabase
        .from(subTab)
        .update({ profession_id: null })
        .eq('id', itemId);
      await loadSubItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unassign item');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveItemForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfessionId) return;
    setSaving(true);
    setError('');
    try {
      const payload = { ...itemForm, profession_id: selectedProfessionId };
      if (editingItemId !== null) {
        await supabase.from(subTab).update(payload).eq('id', editingItemId);
      } else {
        await supabase.from(subTab).insert(payload);
      }
      setAddingItem(false);
      setEditingItemId(null);
      setItemForm({});
      await loadSubItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  const handleEditItem = (item: Specialty | CounselingType | Problem) => {
    setEditingItemId(item.id);
    setItemForm({ ...item } as Record<string, string | boolean | null>);
    setAddingItem(true);
  };

  const startAddItem = () => {
    setEditingItemId(null);
    if (subTab === 'specialties') {
      openSpecialtyPicker();
    } else if (subTab === 'counseling_types') {
      openCounselingPicker();
    } else {
      openProblemPicker();
    }
  };

  const openSpecialtyPicker = async () => {
    setShowSpecialtyPicker(true);
    setSpecialtySearch('');
    setLoadingAllSpecialties(true);
    try {
      const { data } = await supabase
        .from('specialties')
        .select('*')
        .order('name_en');
      const all = (data || []) as Specialty[];
      setAllSpecialties(all);
      // Pre-check the ones already linked to this profession
      const linkedIds = new Set(
        (subItems as Specialty[]).map(s => String(s.id))
      );
      setPickedSpecialtyIds(linkedIds);
    } catch {
      setAllSpecialties([]);
    } finally {
      setLoadingAllSpecialties(false);
    }
  };

  const handleSaveSpecialtyPicker = async () => {
    if (!selectedProfessionId) return;
    setSaving(true);
    setError('');
    try {
      const linkedIds = new Set((subItems as Specialty[]).map(s => String(s.id)));

      // Assign newly checked specialties to this profession
      const toAssign = [...pickedSpecialtyIds].filter(id => !linkedIds.has(id));
      // Unlink specialties that were unchecked
      const toUnlink = [...linkedIds].filter(id => !pickedSpecialtyIds.has(id));

      await Promise.all([
        ...toAssign.map(id =>
          supabase.from('specialties').update({ profession_id: selectedProfessionId }).eq('id', id)
        ),
        ...toUnlink.map(id =>
          supabase.from('specialties').update({ profession_id: null }).eq('id', id)
        ),
      ]);

      setShowSpecialtyPicker(false);
      await loadSubItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update specialty assignments');
    } finally {
      setSaving(false);
    }
  };

  const startCreateNewSpecialty = () => {
    setShowSpecialtyPicker(false);
    setEditingItemId(null);
    setItemForm({ name_en: '', name_es: '', description_en: '', description_es: '', icon: '', is_active: true });
    setAddingItem(true);
  };

  // ── Counseling types picker ──────────────────────────────────────────────

  const openCounselingPicker = async () => {
    setShowCounselingPicker(true);
    setCounselingSearch('');
    setLoadingAllCounseling(true);
    try {
      const { data } = await supabase
        .from('counseling_types')
        .select('*')
        .order('name_en');
      const all = (data || []) as CounselingType[];
      setAllCounselingTypes(all);
      const linkedIds = new Set((subItems as CounselingType[]).map(c => String(c.id)));
      setPickedCounselingIds(linkedIds);
    } catch {
      setAllCounselingTypes([]);
    } finally {
      setLoadingAllCounseling(false);
    }
  };

  const handleSaveCounselingPicker = async () => {
    if (!selectedProfessionId) return;
    setSaving(true);
    setError('');
    try {
      const linkedIds = new Set((subItems as CounselingType[]).map(c => String(c.id)));
      const toAssign = [...pickedCounselingIds].filter(id => !linkedIds.has(id));
      const toUnlink = [...linkedIds].filter(id => !pickedCounselingIds.has(id));
      await Promise.all([
        ...toAssign.map(id =>
          supabase.from('counseling_types').update({ profession_id: selectedProfessionId }).eq('id', id)
        ),
        ...toUnlink.map(id =>
          supabase.from('counseling_types').update({ profession_id: null }).eq('id', id)
        ),
      ]);
      setShowCounselingPicker(false);
      await loadSubItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update therapy type assignments');
    } finally {
      setSaving(false);
    }
  };

  const startCreateNewCounselingType = () => {
    setShowCounselingPicker(false);
    setEditingItemId(null);
    setItemForm({ name_en: '', name_es: '', description_en: '', description_es: '', is_active: true });
    setAddingItem(true);
  };

  // ── Problems picker ──────────────────────────────────────────────────────

  const openProblemPicker = async () => {
    setShowProblemPicker(true);
    setProblemSearch('');
    setLoadingAllProblems(true);
    try {
      const { data } = await supabase
        .from('problems')
        .select('*')
        .order('problem_abrev');
      const all = (data || []) as Problem[];
      setAllProblems(all);
      const linkedIds = new Set((subItems as Problem[]).map(pr => String(pr.id)));
      setPickedProblemIds(linkedIds);
    } catch {
      setAllProblems([]);
    } finally {
      setLoadingAllProblems(false);
    }
  };

  const handleSaveProblemPicker = async () => {
    if (!selectedProfessionId) return;
    setSaving(true);
    setError('');
    try {
      const linkedIds = new Set((subItems as Problem[]).map(pr => String(pr.id)));
      const toAssign = [...pickedProblemIds].filter(id => !linkedIds.has(id));
      const toUnlink = [...linkedIds].filter(id => !pickedProblemIds.has(id));
      await Promise.all([
        ...toAssign.map(id =>
          supabase.from('problems').update({ profession_id: selectedProfessionId }).eq('id', id)
        ),
        ...toUnlink.map(id =>
          supabase.from('problems').update({ profession_id: null }).eq('id', id)
        ),
      ]);
      setShowProblemPicker(false);
      await loadSubItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update problem assignments');
    } finally {
      setSaving(false);
    }
  };

  const startCreateNewProblem = () => {
    setShowProblemPicker(false);
    setEditingItemId(null);
    setItemForm({ problem_abrev: '', problem_desc: '', problem_abrev_es: '', problem_desc_es: '', status: 'Active' });
    setAddingItem(true);
  };

  const subTabLabel = (tab: SubTab) => {
    if (tab === 'specialties') return t('specialties') || 'Specialties';
    if (tab === 'counseling_types') return t('counselingTypes') || 'Therapy Types';
    return t('problems') || 'Problems';
  };

  const renderSubItemName = (item: Specialty | CounselingType | Problem) => {
    if (subTab === 'problems') {
      const p = item as Problem;
      return language === 'es'
        ? (p.problem_desc_es || p.problem_abrev_es || p.problem_abrev)
        : (p.problem_desc || p.problem_abrev);
    }
    const named = item as Specialty | CounselingType;
    return language === 'es' ? named.name_es : named.name_en;
  };

  const renderItemForm = () => {
    if (subTab === 'specialties') {
      return (
        <>
          <div className="form-row">
            <div className="form-group">
              <label>Name (EN)</label>
              <input value={(itemForm.name_en as string) || ''} onChange={e => setItemForm(f => ({ ...f, name_en: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Nombre (ES)</label>
              <input value={(itemForm.name_es as string) || ''} onChange={e => setItemForm(f => ({ ...f, name_es: e.target.value }))} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Description (EN)</label>
              <textarea value={(itemForm.description_en as string) || ''} onChange={e => setItemForm(f => ({ ...f, description_en: e.target.value }))} rows={2} />
            </div>
            <div className="form-group">
              <label>Descripción (ES)</label>
              <textarea value={(itemForm.description_es as string) || ''} onChange={e => setItemForm(f => ({ ...f, description_es: e.target.value }))} rows={2} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Icon</label>
              <input value={(itemForm.icon as string) || ''} onChange={e => setItemForm(f => ({ ...f, icon: e.target.value }))} placeholder="e.g. 🧠" />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
              <input type="checkbox" id="spec-active" checked={itemForm.is_active as boolean} onChange={e => setItemForm(f => ({ ...f, is_active: e.target.checked }))} />
              <label htmlFor="spec-active">{t('active') || 'Active'}</label>
            </div>
          </div>
        </>
      );
    }
    if (subTab === 'counseling_types') {
      return (
        <>
          <div className="form-row">
            <div className="form-group">
              <label>Name (EN)</label>
              <input value={(itemForm.name_en as string) || ''} onChange={e => setItemForm(f => ({ ...f, name_en: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Nombre (ES)</label>
              <input value={(itemForm.name_es as string) || ''} onChange={e => setItemForm(f => ({ ...f, name_es: e.target.value }))} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Description (EN)</label>
              <textarea value={(itemForm.description_en as string) || ''} onChange={e => setItemForm(f => ({ ...f, description_en: e.target.value }))} rows={2} />
            </div>
            <div className="form-group">
              <label>Descripción (ES)</label>
              <textarea value={(itemForm.description_es as string) || ''} onChange={e => setItemForm(f => ({ ...f, description_es: e.target.value }))} rows={2} />
            </div>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" id="ct-active" checked={itemForm.is_active as boolean} onChange={e => setItemForm(f => ({ ...f, is_active: e.target.checked }))} />
            <label htmlFor="ct-active">{t('active') || 'Active'}</label>
          </div>
        </>
      );
    }
    // problems
    return (
      <>
        <div className="form-row">
          <div className="form-group">
            <label>Abbreviation (EN)</label>
            <input value={(itemForm.problem_abrev as string) || ''} onChange={e => setItemForm(f => ({ ...f, problem_abrev: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Abreviación (ES)</label>
            <input value={(itemForm.problem_abrev_es as string) || ''} onChange={e => setItemForm(f => ({ ...f, problem_abrev_es: e.target.value }))} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Description (EN)</label>
            <textarea value={(itemForm.problem_desc as string) || ''} onChange={e => setItemForm(f => ({ ...f, problem_desc: e.target.value }))} rows={2} />
          </div>
          <div className="form-group">
            <label>Descripción (ES)</label>
            <textarea value={(itemForm.problem_desc_es as string) || ''} onChange={e => setItemForm(f => ({ ...f, problem_desc_es: e.target.value }))} rows={2} />
          </div>
        </div>
        <div className="form-group">
          <label>Status</label>
          <select value={(itemForm.status as string) || 'Active'} onChange={e => setItemForm(f => ({ ...f, status: e.target.value }))}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </>
    );
  };

  return (
    <div className="profession-manager">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ margin: 0 }}>{t('manageProfessions') || 'Manage Professions'}</h3>
        {!isCreating && (
          <button className="btn btn-primary btn-sm" onClick={() => { resetForm(); setIsCreating(true); }}>
            + {t('addProfession') || 'Add Profession'}
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>
      )}

      {isCreating && (
        <form onSubmit={handleSubmit} className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h4 style={{ marginTop: 0 }}>{editingId ? (t('editProfession') || 'Edit Profession') : (t('addProfession') || 'Add Profession')}</h4>
          <div className="form-row">
            <div className="form-group">
              <label>Name (EN) *</label>
              <input
                value={formData.name_en}
                onChange={e => setFormData(f => ({ ...f, name_en: e.target.value }))}
                placeholder="e.g. Psychology"
                required
              />
            </div>
            <div className="form-group">
              <label>Nombre (ES) *</label>
              <input
                value={formData.name_es}
                onChange={e => setFormData(f => ({ ...f, name_es: e.target.value }))}
                placeholder="ej. Psicología"
                required
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Description (EN)</label>
              <textarea
                value={formData.description_en}
                onChange={e => setFormData(f => ({ ...f, description_en: e.target.value }))}
                rows={3}
                placeholder="Short description in English"
              />
            </div>
            <div className="form-group">
              <label>Descripción (ES)</label>
              <textarea
                value={formData.description_es}
                onChange={e => setFormData(f => ({ ...f, description_es: e.target.value }))}
                rows={3}
                placeholder="Descripción corta en español"
              />
            </div>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="prof-active"
              checked={formData.is_active}
              onChange={e => setFormData(f => ({ ...f, is_active: e.target.checked }))}
            />
            <label htmlFor="prof-active">{t('active') || 'Active'}</label>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? (t('saving') || 'Saving...') : (t('save') || 'Save')}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={resetForm}>
              {t('cancel') || 'Cancel'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="loading-spinner">{t('loading') || 'Loading...'}</div>
      ) : professions.length === 0 ? (
        <p className="empty-state">{t('noProfessions') || 'No professions found'}</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {professions.map(p => (
            <div key={p.id} className="card" style={{ padding: '1rem', border: selectedProfessionId === p.id ? '2px solid var(--color-primary)' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '1.05rem' }}>
                      {language === 'es' ? p.name_es : p.name_en}
                    </strong>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.1rem 0.5rem',
                        borderRadius: '999px',
                        background: p.is_active ? 'var(--color-success-bg, #d1fae5)' : 'var(--color-muted-bg, #f3f4f6)',
                        color: p.is_active ? 'var(--color-success, #065f46)' : 'var(--color-muted, #6b7280)',
                        fontWeight: 600,
                      }}
                    >
                      {p.is_active ? (t('active') || 'Active') : (t('inactive') || 'Inactive')}
                    </span>
                  </div>
                  {(language === 'es' ? p.description_es : p.description_en) && (
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-muted, #6b7280)' }}>
                      {language === 'es' ? p.description_es : p.description_en}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setSelectedProfessionId(selectedProfessionId === p.id ? null : p.id); setShowSpecialtyPicker(false); setShowCounselingPicker(false); setShowProblemPicker(false); setAddingItem(false); }}
                  >
                    {selectedProfessionId === p.id ? '▲ Hide' : '▼ Manage Items'}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleToggleActive(p)}
                    disabled={saving}
                  >
                    {p.is_active ? (t('deactivate') || 'Deactivate') : (t('activate') || 'Activate')}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleEdit(p)}
                  >
                    {t('edit') || 'Edit'}
                  </button>
                  {deleteConfirm === p.id ? (
                    <>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(p.id)}
                        disabled={saving}
                      >
                        {t('confirmDelete') || 'Confirm'}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setDeleteConfirm(null)}
                      >
                        {t('cancel') || 'Cancel'}
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setDeleteConfirm(p.id)}
                    >
                      {t('delete') || 'Delete'}
                    </button>
                  )}
                </div>
              </div>

              {selectedProfessionId === p.id && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--color-border, #e5e7eb)', paddingTop: '1rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    {(['specialties', 'counseling_types', 'problems'] as SubTab[]).map(tab => (
                      <button
                        key={tab}
                        className={`tab-button ${subTab === tab ? 'active' : ''}`}
                        style={{ fontSize: '0.85rem', padding: '0.3rem 0.75rem' }}
                        onClick={() => { setSubTab(tab); setAddingItem(false); setEditingItemId(null); setShowSpecialtyPicker(false); setShowCounselingPicker(false); setShowProblemPicker(false); }}
                      >
                        {subTabLabel(tab)}
                      </button>
                    ))}
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ marginLeft: 'auto' }}
                      onClick={startAddItem}
                    >
                      + {t('add') || 'Add'} {subTabLabel(subTab)}
                    </button>
                  </div>

                  {showSpecialtyPicker && (
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem', background: 'var(--color-bg-subtle, #f9fafb)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <h5 style={{ margin: 0 }}>
                          {language === 'es' ? 'Seleccionar especialidades' : 'Select Specialties'}
                        </h5>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.75rem' }}
                          onClick={startCreateNewSpecialty}
                        >
                          + {language === 'es' ? 'Crear nueva' : 'Create New'}
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder={language === 'es' ? 'Buscar especialidades...' : 'Search specialties...'}
                        value={specialtySearch}
                        onChange={e => setSpecialtySearch(e.target.value)}
                        style={{ width: '100%', marginBottom: '0.75rem', padding: '0.4rem 0.6rem', borderRadius: '0.375rem', border: '1px solid var(--color-border, #d1d5db)', fontSize: '0.875rem', boxSizing: 'border-box' }}
                      />
                      {loadingAllSpecialties ? (
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>{t('loading') || 'Loading...'}</p>
                      ) : (
                        <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'grid', gap: '0.35rem', marginBottom: '0.75rem' }}>
                          {allSpecialties
                            .filter(s => {
                              const q = specialtySearch.toLowerCase();
                              return !q || s.name_en.toLowerCase().includes(q) || s.name_es.toLowerCase().includes(q);
                            })
                            .map(s => {
                              const id = String(s.id);
                              const checked = pickedSpecialtyIds.has(id);
                              return (
                                <label
                                  key={id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.6rem',
                                    padding: '0.4rem 0.6rem',
                                    borderRadius: '0.375rem',
                                    background: checked ? 'var(--color-primary-light, #ede9fe)' : 'white',
                                    border: `1px solid ${checked ? 'var(--color-primary, #6c63ff)' : 'var(--color-border, #e5e7eb)'}`,
                                    cursor: 'pointer',
                                    fontSize: '0.875rem',
                                    userSelect: 'none',
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setPickedSpecialtyIds(prev => {
                                        const next = new Set(prev);
                                        if (next.has(id)) next.delete(id);
                                        else next.add(id);
                                        return next;
                                      });
                                    }}
                                    style={{ accentColor: 'var(--color-primary, #6c63ff)' }}
                                  />
                                  <span style={{ flex: 1 }}>
                                    {language === 'es' ? s.name_es : s.name_en}
                                    {s.icon && <span style={{ marginLeft: '0.4rem' }}>{s.icon}</span>}
                                  </span>
                                  {!s.is_active && (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--color-muted, #9ca3af)' }}>
                                      {t('inactive') || 'Inactive'}
                                    </span>
                                  )}
                                  {s.profession_id && s.profession_id !== selectedProfessionId && (
                                    <span style={{ fontSize: '0.7rem', color: '#f59e0b' }} title="Linked to another profession">
                                      ⚠ other
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          {allSpecialties.filter(s => {
                            const q = specialtySearch.toLowerCase();
                            return !q || s.name_en.toLowerCase().includes(q) || s.name_es.toLowerCase().includes(q);
                          }).length === 0 && (
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
                              {language === 'es' ? 'No se encontraron especialidades.' : 'No specialties found.'}
                            </p>
                          )}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={handleSaveSpecialtyPicker}
                          disabled={saving || loadingAllSpecialties}
                        >
                          {saving ? (t('saving') || 'Saving...') : (t('save') || 'Save')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => { setShowSpecialtyPicker(false); setSpecialtySearch(''); }}
                        >
                          {t('cancel') || 'Cancel'}
                        </button>
                      </div>
                    </div>
                  )}

                  {showCounselingPicker && (
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem', background: 'var(--color-bg-subtle, #f9fafb)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <h5 style={{ margin: 0 }}>
                          {language === 'es' ? 'Seleccionar tipos de terapia' : 'Select Therapy Types'}
                        </h5>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.75rem' }}
                          onClick={startCreateNewCounselingType}
                        >
                          + {language === 'es' ? 'Crear nuevo' : 'Create New'}
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder={language === 'es' ? 'Buscar tipos de terapia...' : 'Search therapy types...'}
                        value={counselingSearch}
                        onChange={e => setCounselingSearch(e.target.value)}
                        style={{ width: '100%', marginBottom: '0.75rem', padding: '0.4rem 0.6rem', borderRadius: '0.375rem', border: '1px solid var(--color-border, #d1d5db)', fontSize: '0.875rem', boxSizing: 'border-box' }}
                      />
                      {loadingAllCounseling ? (
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>{t('loading') || 'Loading...'}</p>
                      ) : (
                        <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'grid', gap: '0.35rem', marginBottom: '0.75rem' }}>
                          {allCounselingTypes
                            .filter(c => {
                              const q = counselingSearch.toLowerCase();
                              return !q || c.name_en.toLowerCase().includes(q) || c.name_es.toLowerCase().includes(q);
                            })
                            .map(c => {
                              const id = String(c.id);
                              const checked = pickedCounselingIds.has(id);
                              return (
                                <label
                                  key={id}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                                    padding: '0.4rem 0.6rem', borderRadius: '0.375rem',
                                    background: checked ? 'var(--color-primary-light, #ede9fe)' : 'white',
                                    border: `1px solid ${checked ? 'var(--color-primary, #6c63ff)' : 'var(--color-border, #e5e7eb)'}`,
                                    cursor: 'pointer', fontSize: '0.875rem', userSelect: 'none',
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setPickedCounselingIds(prev => {
                                        const next = new Set(prev);
                                        if (next.has(id)) next.delete(id); else next.add(id);
                                        return next;
                                      });
                                    }}
                                    style={{ accentColor: 'var(--color-primary, #6c63ff)' }}
                                  />
                                  <span style={{ flex: 1 }}>{language === 'es' ? c.name_es : c.name_en}</span>
                                  {!c.is_active && (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--color-muted, #9ca3af)' }}>
                                      {t('inactive') || 'Inactive'}
                                    </span>
                                  )}
                                  {c.profession_id && c.profession_id !== selectedProfessionId && (
                                    <span style={{ fontSize: '0.7rem', color: '#f59e0b' }} title="Linked to another profession">
                                      ⚠ other
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          {allCounselingTypes.filter(c => {
                            const q = counselingSearch.toLowerCase();
                            return !q || c.name_en.toLowerCase().includes(q) || c.name_es.toLowerCase().includes(q);
                          }).length === 0 && (
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
                              {language === 'es' ? 'No se encontraron tipos de terapia.' : 'No therapy types found.'}
                            </p>
                          )}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveCounselingPicker} disabled={saving || loadingAllCounseling}>
                          {saving ? (t('saving') || 'Saving...') : (t('save') || 'Save')}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowCounselingPicker(false); setCounselingSearch(''); }}>
                          {t('cancel') || 'Cancel'}
                        </button>
                      </div>
                    </div>
                  )}

                  {showProblemPicker && (
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem', background: 'var(--color-bg-subtle, #f9fafb)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <h5 style={{ margin: 0 }}>
                          {language === 'es' ? 'Seleccionar problemas' : 'Select Problems'}
                        </h5>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.75rem' }}
                          onClick={startCreateNewProblem}
                        >
                          + {language === 'es' ? 'Crear nuevo' : 'Create New'}
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder={language === 'es' ? 'Buscar problemas...' : 'Search problems...'}
                        value={problemSearch}
                        onChange={e => setProblemSearch(e.target.value)}
                        style={{ width: '100%', marginBottom: '0.75rem', padding: '0.4rem 0.6rem', borderRadius: '0.375rem', border: '1px solid var(--color-border, #d1d5db)', fontSize: '0.875rem', boxSizing: 'border-box' }}
                      />
                      {loadingAllProblems ? (
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>{t('loading') || 'Loading...'}</p>
                      ) : (
                        <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'grid', gap: '0.35rem', marginBottom: '0.75rem' }}>
                          {allProblems
                            .filter(pr => {
                              const q = problemSearch.toLowerCase();
                              return !q ||
                                (pr.problem_abrev || '').toLowerCase().includes(q) ||
                                (pr.problem_desc || '').toLowerCase().includes(q) ||
                                (pr.problem_abrev_es || '').toLowerCase().includes(q) ||
                                (pr.problem_desc_es || '').toLowerCase().includes(q);
                            })
                            .map(pr => {
                              const id = String(pr.id);
                              const checked = pickedProblemIds.has(id);
                              const label = language === 'es'
                                ? (pr.problem_desc_es || pr.problem_abrev_es || pr.problem_abrev)
                                : (pr.problem_desc || pr.problem_abrev);
                              const abbrev = language === 'es' ? (pr.problem_abrev_es || pr.problem_abrev) : pr.problem_abrev;
                              return (
                                <label
                                  key={id}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                                    padding: '0.4rem 0.6rem', borderRadius: '0.375rem',
                                    background: checked ? 'var(--color-primary-light, #ede9fe)' : 'white',
                                    border: `1px solid ${checked ? 'var(--color-primary, #6c63ff)' : 'var(--color-border, #e5e7eb)'}`,
                                    cursor: 'pointer', fontSize: '0.875rem', userSelect: 'none',
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setPickedProblemIds(prev => {
                                        const next = new Set(prev);
                                        if (next.has(id)) next.delete(id); else next.add(id);
                                        return next;
                                      });
                                    }}
                                    style={{ accentColor: 'var(--color-primary, #6c63ff)' }}
                                  />
                                  <span style={{ flex: 1 }}>
                                    {label}
                                    {abbrev && label !== abbrev && (
                                      <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', color: 'var(--color-muted, #9ca3af)' }}>
                                        ({abbrev})
                                      </span>
                                    )}
                                  </span>
                                  {pr.status && pr.status !== 'Active' && (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--color-muted, #9ca3af)' }}>
                                      {pr.status}
                                    </span>
                                  )}
                                  {pr.profession_id && pr.profession_id !== selectedProfessionId && (
                                    <span style={{ fontSize: '0.7rem', color: '#f59e0b' }} title="Linked to another profession">
                                      ⚠ other
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          {allProblems.filter(pr => {
                            const q = problemSearch.toLowerCase();
                            return !q ||
                              (pr.problem_abrev || '').toLowerCase().includes(q) ||
                              (pr.problem_desc || '').toLowerCase().includes(q) ||
                              (pr.problem_abrev_es || '').toLowerCase().includes(q) ||
                              (pr.problem_desc_es || '').toLowerCase().includes(q);
                          }).length === 0 && (
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
                              {language === 'es' ? 'No se encontraron problemas.' : 'No problems found.'}
                            </p>
                          )}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveProblemPicker} disabled={saving || loadingAllProblems}>
                          {saving ? (t('saving') || 'Saving...') : (t('save') || 'Save')}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowProblemPicker(false); setProblemSearch(''); }}>
                          {t('cancel') || 'Cancel'}
                        </button>
                      </div>
                    </div>
                  )}

                  {addingItem && (
                    <form onSubmit={handleSaveItemForm} className="card" style={{ padding: '1rem', marginBottom: '1rem', background: 'var(--color-bg-subtle, #f9fafb)' }}>
                      <h5 style={{ marginTop: 0 }}>
                        {editingItemId ? 'Edit' : 'Add'} {subTabLabel(subTab)}
                      </h5>
                      {renderItemForm()}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                          {saving ? (t('saving') || 'Saving...') : (t('save') || 'Save')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => { setAddingItem(false); setEditingItemId(null); setItemForm({}); }}
                        >
                          {t('cancel') || 'Cancel'}
                        </button>
                      </div>
                    </form>
                  )}

                  {loadingSubItems ? (
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>{t('loading') || 'Loading...'}</p>
                  ) : subItems.length === 0 ? (
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-muted, #6b7280)' }}>
                      No {subTabLabel(subTab).toLowerCase()} linked to this profession yet.
                    </p>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {subItems.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.5rem 0.75rem',
                            background: 'var(--color-bg-subtle, #f9fafb)',
                            borderRadius: '0.375rem',
                            flexWrap: 'wrap',
                            gap: '0.5rem',
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{renderSubItemName(item)}</span>
                            {'is_active' in item && item.is_active !== undefined && (
                              <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: item.is_active ? 'var(--color-success, #065f46)' : 'var(--color-muted, #6b7280)' }}>
                                {item.is_active ? '● Active' : '○ Inactive'}
                              </span>
                            )}
                            {'status' in item && (item as Problem).status && (
                              <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: (item as Problem).status === 'Active' ? 'var(--color-success, #065f46)' : 'var(--color-muted, #6b7280)' }}>
                                ● {(item as Problem).status}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem' }} onClick={() => handleEditItem(item)}>
                              {t('edit') || 'Edit'}
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.75rem' }}
                              onClick={() => handleUnassignItem(item.id)}
                              title="Remove profession link"
                            >
                              Unlink
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
