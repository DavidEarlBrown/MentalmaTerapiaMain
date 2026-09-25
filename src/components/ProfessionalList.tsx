import { useState, useEffect, useMemo, useRef } from 'react';
import type { Professional, CounselingType } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useProfession } from '../contexts/ProfessionContext';
import {
  selectSpecialtyFromText,
  findProfessionalByProblemAndSpecialty,
  type Specialty
} from '../lib/mariService';
import { supabase } from '../lib/supabaseClient';
import { fetchCounselingTypes } from '../lib/api';
import { ProfessionalResumeModal } from './ProfessionalResumeModal';
import { ExpandableProfessionalPhoto } from './ProfessionalPhotoLightbox';
import { LanguageFlag, LanguageFlagGroup } from './CountryFlag';
import { getCountryCodeForLanguage } from '../lib/languageCountryCodes';
import { GeminiAiIcon } from './GeminiAiIcon';

const PROFESSIONAL_MEDIA_BUCKET = 'psychologist-resumes';

/** Specialties for display/filter — active UI language, with fallback to the other language. */
function getProfessionalSpecialties(
  professional: Professional,
  lang: string
): string[] {
  const primary = lang === 'es' ? professional.specialties_es : professional.specialties_en;
  const fallback = lang === 'es' ? professional.specialties_en : professional.specialties_es;
  const result = (primary ?? []).map(s => s.trim()).filter(Boolean);
  if (result.length > 0) return result;
  return (fallback ?? []).map(s => s.trim()).filter(Boolean);
}

interface ProfessionalListProps {
  professionals: Professional[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAskMari?: () => void;
  problemText?: string;
  onProblemTextChange?: (text: string) => void;
  isAdmin?: boolean;
  currentUser?: { id?: string; email?: string; user_type?: string } | null;
  onNavigate?: (section: string) => void;
}

export function ProfessionalList({
  professionals,
  selectedId,
  onSelect,
  problemText: externalProblemText = '',
  onProblemTextChange,
  isAdmin = false,
  currentUser = null,
  onNavigate,
}: ProfessionalListProps) {
  const { t, language } = useLanguage();
  const { professions, activeProfession, setActiveProfession } = useProfession();
  const activeProfessions = professions.filter(p => p.is_active !== false);

  // AI state
  const [problemText, setProblemText] = useState(externalProblemText);
  const [isImprovingText, setIsImprovingText] = useState(false);
  const [isSelectingSpecialty, setIsSelectingSpecialty] = useState(false);
  const [isFindingProfessional, setIsFindingProfessional] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<string>('');
  /** When >5 professionals, AI returns 3 IDs; used to highlight rows until the user picks one. */
  const [aiTopProfessionalIds, setAiTopProfessionalIds] = useState<string[]>([]);

  // Filter state
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState<string | null>(null);
  const [counselingTypes, setCounselingTypes] = useState<CounselingType[]>([]);
  const [selectedCounselingTypeId, setSelectedCounselingTypeId] = useState<string | null>(null);
  const [maxTzDiffHours, setMaxTzDiffHours] = useState<number | null>(null);

  // UI state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resumeModalProfessional, setResumeModalProfessional] = useState<Professional | null>(null);
  const [photoOverrides, setPhotoOverrides] = useState<Record<string, string>>({});
  const [photoUploadingId, setPhotoUploadingId] = useState<string | null>(null);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoUploadProfessionalRef = useRef<Professional | null>(null);


  useEffect(() => {
    fetchSpecialties(activeProfession?.id);
    setSelectedSpecialtyId(null);
  }, [activeProfession?.id]);

  useEffect(() => {
    setProblemText(externalProblemText);
  }, [externalProblemText]);

  useEffect(() => {
    loadCounselingTypes();
  }, []);

  const fetchSpecialties = async (professionId?: string) => {
    try {
      let query = supabase
        .from('specialties')
        .select('id, name_en, name_es, description_en, description_es')
        .eq('is_active', true)
        .order('name_en');
      if (professionId) query = query.eq('profession_id', professionId);
      const { data, error } = await query;
      if (error) throw error;
      setSpecialties(data || []);
    } catch (error) {
      console.error('Error fetching specialties:', error);
    }
  };

  const loadCounselingTypes = async () => {
    try {
      const types = await fetchCounselingTypes();
      setCounselingTypes(types.filter((ct: CounselingType) => ct.is_active !== false));
    } catch (error) {
      console.error('Error loading counseling types:', error);
    }
  };

  const getProfessionalMediaFolder = (professional: Professional): string => {
    return professional.user_id || professional.id;
  };

  const handlePhotoButtonClick = (professional: Professional) => {
    photoUploadProfessionalRef.current = professional;
    setPhotoUploadError(null);
    photoInputRef.current?.click();
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const professional = photoUploadProfessionalRef.current;
    event.target.value = '';

    if (!file || !professional) return;
    if (!file.type.startsWith('image/')) {
      setPhotoUploadError(lbl('Please choose an image file.', 'Por favor seleccione un archivo de imagen.'));
      return;
    }

    setPhotoUploadingId(professional.id);
    setPhotoUploadError(null);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${getProfessionalMediaFolder(professional)}/photo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(PROFESSIONAL_MEDIA_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(PROFESSIONAL_MEDIA_BUCKET)
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        throw signedUrlError || new Error('Unable to create photo URL');
      }

      const { error: updateError } = await supabase
        .from('professionals')
        .update({ photo_url: signedUrlData.signedUrl })
        .eq('id', professional.id);

      if (updateError) throw updateError;

      setPhotoOverrides((prev) => ({ ...prev, [professional.id]: signedUrlData.signedUrl }));
    } catch (error) {
      setPhotoUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setPhotoUploadingId(null);
      photoUploadProfessionalRef.current = null;
    }
  };

  // ── Timezone helpers ──────────────────────────────────────
  const getTzOffsetMin = (tzName: string): number => {
    const now = new Date();
    const utcMs = now.getTime();
    const localMs = new Date(now.toLocaleString('en-US', { timeZone: tzName })).getTime();
    return Math.round((localMs - utcMs) / 60000);
  };

  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const userTzOffsetMin = getTzOffsetMin(userTz);

  const getTzDiffHours = (tzName: string | undefined): number | null => {
    if (!tzName) return null;
    try {
      const diff = Math.abs(getTzOffsetMin(tzName) - userTzOffsetMin);
      return Math.round(diff / 60);
    } catch {
      return null;
    }
  };

  // ── Derived filter values ─────────────────────────────────
  const selectedSpecialty = selectedSpecialtyId
    ? specialties.find(s => s.id === selectedSpecialtyId)
    : null;
  const selectedSpecialtyName = selectedSpecialty
    ? (language === 'en' ? selectedSpecialty.name_en : selectedSpecialty.name_es)?.toLowerCase()
    : null;

  const filteredProfessionals = professionals
    .filter(p => p.is_active !== false)
    .filter(p => {
      if (!selectedSpecialtyName) return true;
      const specs = getProfessionalSpecialties(p, language);
      return specs.some(
        s =>
          s.toLowerCase().includes(selectedSpecialtyName) ||
          selectedSpecialtyName.includes(s.toLowerCase())
      );
    })
    .filter(p => {
      if (!selectedCounselingTypeId) return true;
      return p.counseling_types?.includes(selectedCounselingTypeId) ?? false;
    })
    .filter(p => {
      const q = problemText.trim().toLowerCase();
      if (!q) return true;
      const bio = (language === 'en' ? p.bio_en : p.bio_es).toLowerCase();
      const specs = getProfessionalSpecialties(p, language).join(' ').toLowerCase();
      const name = (language === 'en' ? p.name_en : p.name_es).toLowerCase();
      return bio.includes(q) || specs.includes(q) || name.includes(q);
    })
    .filter(p => {
      if (maxTzDiffHours === null) return true;
      const diff = getTzDiffHours(p.time_zone);
      if (diff === null) return true;
      return diff <= maxTzDiffHours;
    })
    .sort((a, b) => {
      const nameA = (language === 'en' ? a.name_en : a.name_es).toLowerCase();
      const nameB = (language === 'en' ? b.name_en : b.name_es).toLowerCase();
      return nameA.localeCompare(nameB);
    });

  /** Full active roster for browsing; filters still define the pool for AI (1 vs 3 picks by count). */
  const allProfessionalsForList = useMemo(() => {
    return professionals
      .filter(p => p.is_active !== false)
      .sort((a, b) => {
        const nameA = (language === 'en' ? a.name_en : a.name_es).toLowerCase();
        const nameB = (language === 'en' ? b.name_en : b.name_es).toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [professionals, language]);

  // ── AI handlers ───────────────────────────────────────────
  const handleImproveText = async () => {
    if (!problemText.trim()) {
      alert(t('pleaseDescribeIssue') || 'Please describe your issue first');
      return;
    }
    setIsImprovingText(true);
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        alert(t('aiError') || 'Gemini API key not configured.');
        return;
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.7, topP: 0.9, topK: 40 },
      });
      const profName = activeProfession
        ? (language === 'en' ? activeProfession.name_en : activeProfession.name_es)
        : (language === 'en' ? 'mental health' : 'salud mental');
      const profCtxLine = activeProfession
        ? (language === 'en'
            ? `\nContext: This platform is for ${activeProfession.name_en} professionals only.`
            : `\nContexto: Esta plataforma es para profesionales de ${activeProfession.name_es}.`)
        : '';
      const prompt =
        language === 'en'
          ? `You are a helpful assistant that improves ${profName} issue descriptions to make them clearer and more professional.${profCtxLine}\n\nOriginal: "${problemText}"\n\nRewrite to be clear, concise, professional but empathetic, 2-4 sentences. Return ONLY the improved text.`
          : `Eres un asistente que mejora descripciones de problemas de ${profName}.${profCtxLine}\n\nOriginal: "${problemText}"\n\nReescribe: clara, concisa, profesional, 2-4 oraciones. Devuelve SOLO el texto mejorado.`;
      const result = await model.generateContent(prompt);
      const improved = result.response.text().trim();
      if (improved) {
        setProblemText(improved);
        if (onProblemTextChange) onProblemTextChange(improved);
      }
    } catch (error) {
      console.error('Error improving text:', error);
      alert(t('aiError') || 'Failed to improve text. Please try again.');
    } finally {
      setIsImprovingText(false);
    }
  };

  const handleAutoSelectSpecialty = async () => {
    if (!problemText.trim()) {
      alert(language === 'en' ? 'Please describe your problems first.' : 'Por favor, describa sus problemas primero.');
      return;
    }
    setIsSelectingSpecialty(true);
    setAiRecommendation('');
    try {
      const result = await selectSpecialtyFromText(problemText, specialties, language, activeProfession);
      setSelectedSpecialtyId(result.selectedSpecialtyId);
      setAiRecommendation(result.reason);
    } catch (error) {
      console.error('Error selecting specialty:', error);
      alert(t('aiError') || 'Failed to select specialty. Please try again.');
    } finally {
      setIsSelectingSpecialty(false);
    }
  };

  const handleFindProfessional = async () => {
    if (!problemText.trim()) {
      alert(language === 'en' ? 'Please describe your problems first.' : 'Por favor, describa sus problemas primero.');
      return;
    }
    setIsFindingProfessional(true);
    setAiRecommendation('');
    setAiTopProfessionalIds([]);
    try {
      const specialtyName = selectedSpecialty
        ? (language === 'en' ? selectedSpecialty.name_en : selectedSpecialty.name_es)
        : null;
      const aiPool =
        filteredProfessionals.length > 0 ? filteredProfessionals : allProfessionalsForList;
      const result = await findProfessionalByProblemAndSpecialty(
        problemText,
        specialtyName,
        aiPool,
        language,
        activeProfession
      );
      if (result.recommendedProfessionalId) {
        onSelect(result.recommendedProfessionalId);
        setAiRecommendation(result.reason);
        setExpandedId(result.recommendedProfessionalId);
        if (result.recommendedProfessionalIds && result.recommendedProfessionalIds.length > 1) {
          setAiTopProfessionalIds(result.recommendedProfessionalIds);
        }
        const el = document.getElementById(`prof-${result.recommendedProfessionalId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (error) {
      console.error('Error finding professional:', error);
      alert(t('aiError') || 'Failed to find professional. Please try again.');
    } finally {
      setIsFindingProfessional(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────
  const getCounselingTypeName = (typeId: string) => {
    const ct = counselingTypes.find(c => c.id === typeId);
    if (!ct) return typeId;
    return language === 'en' ? ct.name_en : ct.name_es;
  };

  const getAllLanguages = (p: Professional): string[] => {
    const langs: string[] = [];
    if (p.PrimaryLanguage) langs.push(p.PrimaryLanguage.trim());
    if (p.SecondaryLanguages) {
      p.SecondaryLanguages.forEach(l => {
        if (l && !langs.includes(l.trim())) langs.push(l.trim());
      });
    }
    return langs;
  };

  const lbl = (en: string, es: string) => (language === 'es' ? es : en);

  const renderSpecialtyTags = (specs: string[], compact = false) => {
    if (specs.length === 0) return null;
    return (
      <div className={`specialty-tags professional-list-specialties${compact ? ' professional-list-specialties--compact' : ''}`}>
        {specs.map((s, i) => (
          <span key={`${s}-${i}`} className="specialty-tag specialty-tag--highlight">
            {s}
          </span>
        ))}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <section className="section professional-list-section">

      {/* Practice area pills */}
      {activeProfessions.length > 1 && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f0f4ff', borderRadius: '8px', border: '1px solid #c3d1f7' }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#2c3e50' }}>
            {lbl('Change Active Profession', 'Cambiar Profesión Activa')}
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {activeProfessions.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveProfession(p)}
                style={{
                  padding: '0.4rem 1rem',
                  borderRadius: '20px',
                  border: '2px solid',
                  borderColor: activeProfession?.id === p.id ? '#6c63ff' : '#c3d1f7',
                  backgroundColor: activeProfession?.id === p.id ? '#6c63ff' : 'white',
                  color: activeProfession?.id === p.id ? 'white' : '#4a5568',
                  fontWeight: activeProfession?.id === p.id ? 600 : 400,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  transition: 'all 0.15s ease',
                }}
              >
                {language === 'es' ? p.name_es : p.name_en}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Filter bar ─────────────────────────────────────── */}
      <div style={{
        backgroundColor: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '1.25rem 1.5rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {lbl('Filter Professionals', 'Filtrar Profesionales')}
          </span>
        </div>

        {/* Row 1: Specialty + Therapy Type */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {lbl('Specialty', 'Especialidad')}
            </label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <select
                value={selectedSpecialtyId || ''}
                onChange={e => { setSelectedSpecialtyId(e.target.value || null); setAiRecommendation(''); }}
                style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px', backgroundColor: 'white', color: '#1e293b' }}
              >
                <option value="">{lbl('All Specialties', 'Todas las Especialidades')}</option>
                {specialties.map(s => (
                  <option key={s.id} value={s.id}>
                    {language === 'en' ? s.name_en : s.name_es}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAutoSelectSpecialty}
                disabled={isSelectingSpecialty || !problemText.trim()}
                title={lbl('AI: suggest specialty from problem description', 'IA: sugerir especialidad desde descripción')}
                style={{
                  padding: '0.5rem 0.6rem',
                  backgroundColor: isSelectingSpecialty ? '#e2e8f0' : '#ede9fe',
                  color: '#6c63ff',
                  border: '1px solid #c4b5fd',
                  borderRadius: '8px',
                  cursor: isSelectingSpecialty || !problemText.trim() ? 'not-allowed' : 'pointer',
                  opacity: !problemText.trim() ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <GeminiAiIcon size={14} />
                {isSelectingSpecialty ? '…' : lbl('AI', 'IA')}
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {lbl('Therapy Type', 'Tipo de Terapia')}
            </label>
            <select
              value={selectedCounselingTypeId || ''}
              onChange={e => setSelectedCounselingTypeId(e.target.value || null)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px', backgroundColor: 'white', color: '#1e293b' }}
            >
              <option value="">{lbl('All Therapy Types', 'Todos los Tipos de Terapia')}</option>
              {counselingTypes.map(ct => (
                <option key={ct.id} value={ct.id}>
                  {language === 'en' ? ct.name_en : ct.name_es}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Problem/Issue + Timezone */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {lbl('Problem / Issue', 'Problema / Consulta')}
            </label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <textarea
                value={problemText}
                onChange={e => {
                  const v = e.target.value;
                  setProblemText(v);
                  setAiRecommendation('');
                  if (onProblemTextChange) onProblemTextChange(v);
                }}
                placeholder={lbl('Describe what you\'d like to discuss…', 'Describa lo que le gustaría tratar…')}
                rows={2}
                style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px', resize: 'vertical', lineHeight: 1.4, fontFamily: 'inherit' }}
              />
              <button
                type="button"
                onClick={handleImproveText}
                disabled={isImprovingText || !problemText.trim()}
                title={lbl('AI: improve description', 'IA: mejorar descripción')}
                style={{
                  padding: '0.5rem 0.6rem',
                  backgroundColor: isImprovingText ? '#e2e8f0' : '#ede9fe',
                  color: '#6c63ff',
                  border: '1px solid #c4b5fd',
                  borderRadius: '8px',
                  cursor: isImprovingText || !problemText.trim() ? 'not-allowed' : 'pointer',
                  opacity: !problemText.trim() ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  alignSelf: 'flex-start',
                  marginTop: '0',
                }}
              >
                <GeminiAiIcon size={15} />
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {lbl('Max. Timezone Difference', 'Máx. Diferencia de Zona Horaria')}
            </label>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
              {([null, 3, 6, 9, 12] as (number | null)[]).map(val => (
                <button
                  key={val ?? 'all'}
                  type="button"
                  onClick={() => setMaxTzDiffHours(val)}
                  style={{
                    padding: '0.35rem 0.7rem',
                    borderRadius: '16px',
                    border: '1px solid',
                    borderColor: maxTzDiffHours === val ? '#1976d2' : '#cbd5e1',
                    backgroundColor: maxTzDiffHours === val ? '#1976d2' : 'white',
                    color: maxTzDiffHours === val ? 'white' : '#475569',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: maxTzDiffHours === val ? 600 : 400,
                    transition: 'all 0.15s',
                  }}
                >
                  {val === null ? lbl('All', 'Todos') : `≤ ${val}h`}
                </button>
              ))}
            </div>
            {maxTzDiffHours !== null && (
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.3rem' }}>
                {lbl('Your timezone', 'Tu zona horaria')}: {userTz}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Results header + AI find ────────────────────────── */}
      <div className="section-header-with-ai" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>{t('findProfessional')}</h2>
          <p className="section-subtitle" style={{ marginTop: '0.25rem' }}>
            {allProfessionalsForList.length === 0
              ? lbl('No professionals available at this time', 'No hay profesionales disponibles en este momento')
              : filteredProfessionals.length === allProfessionalsForList.length
                ? `${allProfessionalsForList.length} ${lbl(
                    allProfessionalsForList.length === 1 ? 'professional' : 'professionals',
                    allProfessionalsForList.length === 1 ? 'profesional' : 'profesionales'
                  )}`
                : `${allProfessionalsForList.length} ${lbl('professionals listed', 'profesionales en la lista')} · ${filteredProfessionals.length} ${lbl(
                    'match your filters (AI uses this set)',
                    'coinciden con los filtros (la IA usa este conjunto)'
                  )}`}
          </p>
        </div>
        <button
          type="button"
          className="ai-assist-button"
          onClick={handleFindProfessional}
          disabled={isFindingProfessional || !problemText.trim()}
          aria-label={t('findProfessionalAI')}
        >
          <GeminiAiIcon className="ai-icon" />
          <span>{isFindingProfessional ? t('processing') || '…' : t('aiHelp')}</span>
        </button>
      </div>

      {aiRecommendation && (
        <div style={{ marginBottom: '1.25rem', padding: '0.9rem 1rem', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.3rem', color: '#1e40af', fontSize: '0.9rem' }}>
            {t('aiRecommendation')}:
          </p>
          <p style={{ color: '#1e40af', margin: 0, fontSize: '0.9rem' }}>{aiRecommendation}</p>
        </div>
      )}

      {/* ── Professionals list ──────────────────────────────── */}
      {allProfessionalsForList.length === 0 ? (
        <p className="no-results">{t('noProfessionals') || 'No professionals available at this time.'}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {allProfessionalsForList.map((p, idx) => {
            const name = language === 'en' ? p.name_en : p.name_es;
            const bio = language === 'en' ? p.bio_en : p.bio_es;
            const specs = getProfessionalSpecialties(p, language);
            const langs = getAllLanguages(p);
            const tzDiff = getTzDiffHours(p.time_zone);
            const isExpanded = expandedId === p.id;
            const isSelected = selectedId === p.id;
            const isAiTopPick = aiTopProfessionalIds.length > 1 && aiTopProfessionalIds.includes(p.id);
            const photoUrl = photoOverrides[p.id] || p.photo_url;

            return (
              <div
                key={p.id}
                id={`prof-${p.id}`}
                style={{
                  borderTop: idx === 0 ? '1px solid #e2e8f0' : 'none',
                  borderBottom: '1px solid #e2e8f0',
                  borderLeft: isSelected ? '4px solid #6c63ff' : isAiTopPick ? '4px solid #7c3aed' : '4px solid transparent',
                  transition: 'border-color 0.15s',
                }}
              >
                {/* Row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '72px 1fr auto',
                    gap: '1rem',
                    padding: '1rem 1rem 1rem 0.75rem',
                    backgroundColor: isSelected ? '#faf9ff' : isAiTopPick ? '#faf5ff' : 'white',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s',
                  }}
                  onClick={() => {
                    setAiTopProfessionalIds([]);
                    onSelect(p.id);
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLDivElement).style.backgroundColor = isAiTopPick ? '#f3e8ff' : '#f8fafc';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLDivElement).style.backgroundColor = isAiTopPick ? '#faf5ff' : 'white';
                    }
                  }}
                >
                  {/* Photo */}
                  {photoUrl ? (
                    <ExpandableProfessionalPhoto
                      src={photoUrl}
                      alt={name}
                      style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: '50%',
                        background: '#e2e8f0',
                        border: '2px solid #e2e8f0',
                        flexShrink: 0,
                      }}
                    />
                  )}

                  {/* Info */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{name}</h3>
                      {isAiTopPick && !isSelected && (
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {lbl('MarI pick', 'MarI')}
                        </span>
                      )}
                      {(p.Título || p.Clasificación) && (
                        <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 500 }}>
                          {[p.Título, p.Clasificación].filter(Boolean).join(' — ')}
                        </span>
                      )}
                    </div>

                    {/* Bio snippet */}
                    <p style={{ margin: '0.2rem 0 0.5rem', fontSize: '0.875rem', color: '#475569', lineHeight: 1.4,
                      overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {bio}
                    </p>

                    {/* Tags row */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                      {renderSpecialtyTags(specs, true)}
                      {langs.length > 0 && (
                        <span style={{ marginLeft: '0.25rem' }}>
                          <LanguageFlagGroup languages={langs} size={16} gap="0.15rem" />
                        </span>
                      )}
                      {p.time_zone && (
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.6 }}>
                            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/>
                          </svg>
                          {p.time_zone}
                          {tzDiff !== null && (
                            <span style={{ color: tzDiff <= 3 ? '#16a34a' : tzDiff <= 6 ? '#ca8a04' : '#dc2626' }}>
                              {' '}({tzDiff === 0 ? lbl('same TZ', 'misma TZ') : `Δ${tzDiff}h`})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end', flexShrink: 0 }}
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.45rem 0.9rem',
                        backgroundColor: isExpanded ? '#6c63ff' : 'white',
                        color: isExpanded ? 'white' : '#6c63ff',
                        border: '1.5px solid #6c63ff',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        transition: 'all 0.15s',
                      }}
                    >
                      {lbl('Details', 'Detalles')}
                      <svg
                        width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                      >
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* ── Expanded detail panel ─────────────────── */}
                {isExpanded && (
                  <div style={{
                    padding: '1.25rem 1.5rem 1.5rem',
                    backgroundColor: '#faf9ff',
                    borderTop: '1px solid #ede9fe',
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

                      {/* Left: full bio + specialties */}
                      <div>
                        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {lbl('About', 'Acerca de')}
                        </h4>
                        <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: '#374151', lineHeight: 1.6 }}>{bio}</p>

                        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {t('specialties')}
                        </h4>
                        <div style={{ marginBottom: '1rem' }}>
                          {renderSpecialtyTags(specs) ?? (
                            <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
                              {lbl('No specialties listed', 'Sin especialidades registradas')}
                            </span>
                          )}
                        </div>

                        {p.counseling_types && p.counseling_types.length > 0 && (
                          <>
                            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              {t('counselingTypes')}
                            </h4>
                            <div className="counseling-type-tags" style={{ marginBottom: '1rem' }}>
                              {p.counseling_types.map((typeId, i) => (
                                <span key={i} className="counseling-type-tag">{getCounselingTypeName(typeId)}</span>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Right: meta + actions */}
                      <div>
                        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {lbl('Details', 'Detalles')}
                        </h4>

                        {langs.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', fontSize: '0.9rem', color: '#374151' }}>
                            <span style={{ fontWeight: 500 }}>{t('languages')}:</span>
                            {langs.map((l, i) =>
                              getCountryCodeForLanguage(l) ? (
                                <LanguageFlag key={i} languageName={l} size={20} />
                              ) : (
                                <span key={i}>{l}</span>
                              )
                            )}
                            <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{langs.join(', ')}</span>
                          </div>
                        )}

                        {p.time_zone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', fontSize: '0.9rem', color: '#374151' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#64748b', flexShrink: 0 }}>
                              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/>
                            </svg>
                            <span><span style={{ fontWeight: 500 }}>{t('timeZone')}:</span> {p.time_zone}</span>
                            {tzDiff !== null && (
                              <span style={{
                                fontSize: '0.8rem',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '10px',
                                backgroundColor: tzDiff <= 3 ? '#dcfce7' : tzDiff <= 6 ? '#fef9c3' : '#fee2e2',
                                color: tzDiff <= 3 ? '#16a34a' : tzDiff <= 6 ? '#854d0e' : '#dc2626',
                                fontWeight: 600,
                              }}>
                                {tzDiff === 0
                                  ? lbl('Same timezone', 'Misma zona horaria')
                                  : `${lbl('Δ', 'Δ')}${tzDiff}h ${lbl('difference', 'diferencia')}`}
                              </span>
                            )}
                          </div>
                        )}

                        {p.email && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', fontSize: '0.9rem', color: '#374151' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                              <polyline points="22,6 12,13 2,6"/>
                            </svg>
                            <a href={`mailto:${p.email}`} style={{ color: '#6c63ff', textDecoration: 'none', fontWeight: 500 }}>{p.email}</a>
                          </div>
                        )}

                        {/* Buttons */}
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => { onSelect(p.id); }}
                            style={{
                              padding: '0.55rem 1.25rem',
                              backgroundColor: isSelected ? '#5b53e8' : '#6c63ff',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              fontWeight: 600,
                            }}
                          >
                            {isSelected
                              ? lbl('✓ Selected', '✓ Seleccionado')
                              : lbl('Select Professional', 'Seleccionar Profesional')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setResumeModalProfessional(p)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              padding: '0.55rem 1.1rem',
                              backgroundColor: '#f1f5f9',
                              color: '#334155',
                              border: '1px solid #cbd5e1',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              fontWeight: 500,
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                              <line x1="16" y1="13" x2="8" y2="13"/>
                              <line x1="16" y1="17" x2="8" y2="17"/>
                              <polyline points="10 9 9 9 8 9"/>
                            </svg>
                            {lbl('Resume / CV', 'Currículum / CV')}
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handlePhotoButtonClick(p)}
                              disabled={photoUploadingId === p.id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                padding: '0.55rem 1.1rem',
                                backgroundColor: photoUploadingId === p.id ? '#e2e8f0' : '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                                borderRadius: '8px',
                                cursor: photoUploadingId === p.id ? 'not-allowed' : 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 500,
                                opacity: photoUploadingId === p.id ? 0.7 : 1,
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <polyline points="21 15 16 10 5 21"/>
                              </svg>
                              {photoUploadingId === p.id
                                ? lbl('Uploading...', 'Subiendo...')
                                : lbl('Upload Photo', 'Subir foto')}
                            </button>
                          )}
                          {(isAdmin || (
                            currentUser?.user_type === 'Professional' && (
                              (currentUser?.id && p.user_id === currentUser.id) ||
                              (currentUser?.email && p.email === currentUser.email)
                            )
                          )) && (
                            <button
                              type="button"
                              onClick={() => onNavigate?.('manage-profile')}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                padding: '0.55rem 1.1rem',
                                backgroundColor: '#f0fdf4',
                                color: '#15803d',
                                border: '1px solid #bbf7d0',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 500,
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                              {language === 'es' ? 'Mantener Profesional' : 'Maintain Professional'}
                            </button>
                          )}
                          {photoUploadError && photoUploadingId === null && (
                            <p style={{ flexBasis: '100%', margin: '0.1rem 0 0', color: '#b91c1c', fontSize: '0.8rem' }}>
                              {photoUploadError}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <input
        ref={photoInputRef}
        type="file"
        accept="image/png,image/jpeg"
        onChange={handlePhotoUpload}
        style={{ display: 'none' }}
      />

      {/* Resume modal */}
      {resumeModalProfessional && (
        <ProfessionalResumeModal
          professional={resumeModalProfessional}
          isAdmin={isAdmin}
          onClose={() => setResumeModalProfessional(null)}
        />
      )}

    </section>
  );
}
