import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabaseClient';
import { fetchCounselingTypes, clearProfessionalSchedule, addAvailableSlot, fetchProfessions, fetchUserByEmail, fetchUserByUsername, fetchUserById, updateRow, fetchSpecialties } from '../lib/api';
import {
  buildMinimumNoticeSavePayload,
  queryProfessionalsWithNoticeColumn,
  type MinimumNoticeColumn,
} from '../lib/professionalQuery';
import { TimezoneSelector, detectUserTimezone } from './TimezoneSelector';
import { ProfessionalResumeModal } from './ProfessionalResumeModal';
import { ExpandableProfessionalPhoto } from './ProfessionalPhotoLightbox';
import { LanguageFlag } from './CountryFlag';
import { LANGUAGE_COUNTRY_CODES } from '../lib/languageCountryCodes';

/** All languages the system supports, derived from the shared mapping. */
const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_COUNTRY_CODES);
import type { Professional, CounselingType, AvailableSlot, Profession, Specialty } from '../types';

function resolveSelectedSpecialtyIds(
  professional: Pick<Professional, 'specialties_en' | 'specialties_es'>,
  catalog: Specialty[]
): string[] {
  const enNames = new Set(
    (professional.specialties_en ?? []).map(s => s.trim().toLowerCase()).filter(Boolean)
  );
  const esNames = new Set(
    (professional.specialties_es ?? []).map(s => s.trim().toLowerCase()).filter(Boolean)
  );
  return catalog
    .filter(
      s =>
        enNames.has(s.name_en.trim().toLowerCase()) ||
        esNames.has(s.name_es.trim().toLowerCase())
    )
    .map(s => s.id);
}

function buildSpecialtiesFromIds(selectedIds: string[], catalog: Specialty[]) {
  const selected = catalog.filter(s => selectedIds.includes(s.id));
  return {
    specialties_en: selected.map(s => s.name_en),
    specialties_es: selected.map(s => s.name_es),
  };
}
import { useProfession } from '../contexts/ProfessionContext';

const API_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api`;
const API_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const apiHeaders = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

interface ProfessionalManagerProps {
  onSuccess?: () => void;
  currentUser?: { id?: string; email?: string; user_type?: string } | null;
  isAdmin?: boolean;
}

export function ProfessionalManager({ onSuccess, currentUser, isAdmin = true }: ProfessionalManagerProps) {
  const { t, language } = useLanguage();
  const { activeProfession } = useProfession();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [counselingTypes, setCounselingTypes] = useState<CounselingType[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name_en: '',
    name_es: '',
    bio_en: '',
    bio_es: '',
    selectedSpecialtyIds: [] as string[],
    photo_url: '',
    counseling_types: [] as string[],
    is_active: true,
    time_zone: detectUserTimezone(),
    titulo: '',
    clasificacion: '',
    email: '',
    profession: '',
    profession_id: '' as string,
    minimum_notice: '',
    primaryLanguage: '',
    secondaryLanguages: [] as string[],
  });

  const [resumeModalProf, setResumeModalProf] = useState<Professional | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [createUserStatus, setCreateUserStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [globalBanner, setGlobalBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [userBanner, setUserBanner] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [minimumNoticeColumn, setMinimumNoticeColumn] = useState<MinimumNoticeColumn | null>(null);

  const [scheduleView, setScheduleView] = useState<'add' | 'list' | 'clear'>('list');
  const [selectedProfForSchedule, setSelectedProfForSchedule] = useState('');
  const [schedules, setSchedules] = useState<AvailableSlot[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [newSlot, setNewSlot] = useState({
    professional_id: '',
    start_time: '',
    end_time: '',
    is_booked: false,
    monday: 'N',
    tuesday: 'N',
    wednesday: 'N',
    thursday: 'N',
    friday: 'N',
    saturday: 'N',
    sunday: 'N'
  });

  // When not admin, only show the professional record linked to the current user
  const visibleProfessionals = isAdmin
    ? professionals
    : professionals.filter(p =>
        (currentUser?.id && p.user_id === currentUser.id) ||
        (currentUser?.email && p.email === currentUser.email)
      );

  useEffect(() => {
    loadProfessionals();
    loadCounselingTypes();
    fetchProfessions().then(setProfessions).catch(console.error);
  }, []);

  // When not admin, auto-open and auto-select own professional record
  useEffect(() => {
    if (!isAdmin && professionals.length > 0 && currentUser) {
      const own = professionals.find(
        p => (currentUser.id && p.user_id === currentUser.id) ||
             (currentUser.email && p.email === currentUser.email)
      );
      if (own) {
        setSelectedProfForSchedule(own.id);
      }
    }
  }, [isAdmin, professionals, currentUser]);

  const loadProfessionals = async () => {
    setLoading(true);
    try {
      const { data, minimumNoticeColumn: noticeColumn } = await queryProfessionalsWithNoticeColumn(supabase, {
        baseSelect: 'id, name_en, name_es, bio_en, bio_es, specialties_en, specialties_es, photo_url, is_active, created_at, counseling_types, time_zone, email, "PrimaryLanguage", "SecondaryLanguages", "Título", "Clasificación", profession, profession_id, user_id',
        includeInactive: true,
      });
      setMinimumNoticeColumn(noticeColumn);
      setProfessionals(data);
    } catch (error) {
      console.error('Error loading professionals:', error);
      alert('Failed to load professionals');
    } finally {
      setLoading(false);
    }
  };

  const loadCounselingTypes = async () => {
    try {
      const types = await fetchCounselingTypes();
      setCounselingTypes(types);
    } catch (error) {
      console.error('Error loading counseling types:', error);
    }
  };

  const resolveProfessionalEmail = async (professional: Professional): Promise<string> => {
    if (professional.email?.trim()) return professional.email.trim();
    if (professional.user_id) {
      const linked = await fetchUserById(professional.user_id);
      if (linked?.email?.trim()) return linked.email.trim();
    }
    return '';
  };

  const loadSpecialtiesForProfession = async (professionId?: string) => {
    if (!professionId) {
      setSpecialties([]);
      return [];
    }
    const list = await fetchSpecialties(professionId);
    const active = list.filter(s => s.is_active !== false);
    setSpecialties(active);
    return active;
  };

  const handleProfessionIdChange = (professionId: string) => {
    loadSpecialtiesForProfession(professionId || undefined).then(active => {
      setFormData(prev => ({
        ...prev,
        profession_id: professionId,
        selectedSpecialtyIds: prev.selectedSpecialtyIds.filter(id => active.some(s => s.id === id)),
      }));
    });
  };

  const toggleSpecialty = (specialtyId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      selectedSpecialtyIds: checked
        ? [...prev.selectedSpecialtyIds, specialtyId]
        : prev.selectedSpecialtyIds.filter(id => id !== specialtyId),
    }));
  };

  const handleEdit = async (professional: Professional) => {
    setEditingId(professional.id);
    const email = await resolveProfessionalEmail(professional);
    const professionId = professional.profession_id || activeProfession?.id || '';
    const catalog = await loadSpecialtiesForProfession(professionId || undefined);
    const selectedSpecialtyIds = resolveSelectedSpecialtyIds(professional, catalog);
    setFormData({
      name_en: professional.name_en,
      name_es: professional.name_es,
      bio_en: professional.bio_en,
      bio_es: professional.bio_es,
      selectedSpecialtyIds,
      photo_url: professional.photo_url || '',
      counseling_types: professional.counseling_types || [],
      is_active: professional.is_active,
      time_zone: professional.time_zone || detectUserTimezone(),
      titulo: professional.Título || '',
      clasificacion: professional.Clasificación || '',
      email,
      profession: professional.profession || '',
      profession_id: professionId,
      minimum_notice:
        professional.minimum_notice != null && professional.minimum_notice >= 0
          ? String(professional.minimum_notice)
          : professional['Minimum Notice'] != null && professional['Minimum Notice'] >= 0
            ? String(professional['Minimum Notice'])
            : '',
      primaryLanguage: professional.PrimaryLanguage || '',
      secondaryLanguages: professional.SecondaryLanguages || [],
    });
    setCreateUserStatus(null);
    setEditModalOpen(true);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditModalOpen(false);
    setCreateUserStatus(null);
    setUserBanner(null);
    setFormData({
      name_en: '',
      name_es: '',
      bio_en: '',
      bio_es: '',
      selectedSpecialtyIds: [],
      photo_url: '',
      counseling_types: [],
      is_active: true,
      time_zone: detectUserTimezone(),
      titulo: '',
      clasificacion: '',
      email: '',
      profession: '',
      profession_id: '',
      minimum_notice: '',
      primaryLanguage: '',
      secondaryLanguages: [],
    });
    setSpecialties([]);
  };

  const persistProfessionalRecord = async (
    professionalId: string,
    data: Record<string, unknown>
  ) => {
    if (isAdmin) {
      await updateRow('professionals', professionalId, data);
      return;
    }
    const { data: updated, error } = await supabase
      .from('professionals')
      .update(data)
      .eq('id', professionalId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      throw new Error(
        language === 'es'
          ? 'No se pudo guardar el profesional. Verifique sus permisos.'
          : 'Could not save professional. Check your permissions.'
      );
    }
  };

  const linkProfessionalToUser = async (professionalId: string, userId: string, email?: string) => {
    const payload: Record<string, unknown> = { user_id: userId };
    if (email?.trim()) payload.email = email.trim().toLowerCase();
    await persistProfessionalRecord(professionalId, payload);
    await loadProfessionals();
  };

  const resolveUserByEmailOrUsername = async (lookup: string) => {
    const trimmed = lookup.trim();
    return (await fetchUserByEmail(trimmed)) ?? (await fetchUserByUsername(trimmed));
  };

  const handleCreateUser = async () => {
    const emailNorm = formData.email.trim().toLowerCase();
    if (!emailNorm) {
      setCreateUserStatus({ type: 'error', message: language === 'es' ? 'Agregue un email antes de vincular el usuario.' : 'Please add an email address before linking a user.' });
      return;
    }

    if (!editingId) {
      setCreateUserStatus({ type: 'error', message: language === 'es' ? 'Guarde el profesional antes de vincular un usuario.' : 'Save the professional before linking a user account.' });
      return;
    }

    setCreateUserLoading(true);
    setCreateUserStatus(null);

    try {
      const existing = await resolveUserByEmailOrUsername(emailNorm);
      if (existing?.id) {
        await linkProfessionalToUser(editingId, existing.id, emailNorm);
        setCreateUserStatus({
          type: 'success',
          message: language === 'es'
            ? `✓ Usuario existente vinculado al profesional (${existing.email || existing.username}).`
            : `✓ Existing user linked to professional (${existing.email || existing.username}).`,
        });
        return;
      }

      const response = await fetch(`${API_BASE_URL}/admin/create-professional-user`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({
          email: emailNorm,
          full_name: formData.name_en,
          professional_id: editingId,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        if (response.status === 409 && err.id && editingId) {
          await linkProfessionalToUser(editingId, err.id, emailNorm);
          setCreateUserStatus({
            type: 'success',
            message: language === 'es'
              ? `✓ Usuario existente vinculado al profesional.`
              : `✓ Existing user linked to professional.`,
          });
        } else if (response.status === 409) {
          setCreateUserStatus({ type: 'info', message: language === 'es' ? `Ya existe un usuario con este email.` : `A user with this email already exists.` });
        } else {
          throw new Error(err.error || 'Failed to create user');
        }
        return;
      }

      const result = await response.json();

      if (result.id) {
        await linkProfessionalToUser(editingId, result.id, emailNorm);
      }

      setCreateUserStatus({
        type: 'success',
        message: language === 'es'
          ? `✓ Usuario "${emailNorm}" creado y vinculado al profesional.`
          : `✓ User "${emailNorm}" was created and linked to the professional.`,
      });
    } catch (error) {
      setCreateUserStatus({ type: 'error', message: (error as Error).message });
    } finally {
      setCreateUserLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Non-admins may only update their own linked professional record
    if (!isAdmin && editingId) {
      const ownRecord = professionals.find(
        p => (currentUser?.id && p.user_id === currentUser.id) ||
             (currentUser?.email && p.email === currentUser.email)
      );
      if (!ownRecord || ownRecord.id !== editingId) {
        setGlobalBanner({ type: 'error', message: language === 'es' ? 'Solo puede editar su propio perfil.' : 'You can only edit your own profile.' });
        return;
      }
    }

    // Non-admins cannot create new professional records
    if (!isAdmin && !editingId) {
      setGlobalBanner({ type: 'error', message: language === 'es' ? 'No tiene permiso para agregar profesionales.' : 'You do not have permission to add professionals.' });
      return;
    }

    setLoading(true);

    try {
      const { specialties_en, specialties_es } = buildSpecialtiesFromIds(
        formData.selectedSpecialtyIds,
        specialties
      );
      const parsedMinimumNotice = formData.minimum_notice.trim() === ''
        ? null
        : parseInt(formData.minimum_notice, 10);
      if (formData.minimum_notice.trim() !== '' && (Number.isNaN(parsedMinimumNotice!) || parsedMinimumNotice! < 0)) {
        setGlobalBanner({
          type: 'error',
          message: language === 'es'
            ? 'El aviso mínimo debe ser un número entero mayor o igual a 0.'
            : 'Minimum notice must be a whole number greater than or equal to 0.',
        });
        setLoading(false);
        return;
      }

      const baseData = {
        name_en: formData.name_en,
        name_es: formData.name_es,
        bio_en: formData.bio_en,
        bio_es: formData.bio_es,
        specialties_en,
        specialties_es,
        photo_url: formData.photo_url,
        counseling_types: formData.counseling_types,
        is_active: formData.is_active,
        time_zone: formData.time_zone,
        'Título': formData.titulo,
        'Clasificación': formData.clasificacion,
        profession: formData.profession || null,
        'PrimaryLanguage': formData.primaryLanguage || null,
        'SecondaryLanguages': formData.secondaryLanguages.length > 0
          ? formData.secondaryLanguages
          : null,
        ...buildMinimumNoticeSavePayload(minimumNoticeColumn, parsedMinimumNotice),
      };

      if (editingId) {
        // On update, send profession_id: null to allow clearing the profession
        const updateData: Record<string, unknown> = {
          ...baseData,
          profession_id: formData.profession_id || null,
          email: formData.email.trim() ? formData.email.trim().toLowerCase() : null,
        };
        await persistProfessionalRecord(editingId, updateData);
        setGlobalBanner({ type: 'success', message: language === 'es' ? 'Profesional actualizado exitosamente.' : 'Professional updated successfully.' });
      } else {
        // On insert, only include profession_id when a value is selected —
        // omitting it avoids a PostgREST error if the column doesn't exist yet.
        const insertData: Record<string, unknown> = { ...baseData };
        if (formData.email.trim()) {
          insertData.email = formData.email.trim().toLowerCase();
        }
        if (formData.profession_id) {
          insertData.profession_id = formData.profession_id;
        }
        const { data: newProf, error } = await supabase
          .from('professionals')
          .insert([insertData])
          .select()
          .single();

        if (error) throw error;

        // Always show "professional added" first
        setGlobalBanner({
          type: 'success',
          message: language === 'es'
            ? `✓ Profesional "${formData.name_en}" agregado exitosamente.`
            : `✓ Professional "${formData.name_en}" was added successfully.`,
        });
        setUserBanner(null);

        // Auto-create user account if email is provided
        if (formData.email.trim() && newProf?.id) {
          try {
            const userResp = await fetch(`${API_BASE_URL}/admin/create-professional-user`, {
              method: 'POST',
              headers: apiHeaders,
              body: JSON.stringify({
                email: formData.email.trim(),
                full_name: formData.name_en,
                professional_id: newProf.id,
              }),
            });

            if (userResp.ok) {
              const userData = await userResp.json();
              if (userData?.id) {
                await linkProfessionalToUser(newProf.id, userData.id, formData.email.trim());
              }
              setUserBanner({
                type: 'success',
                message: language === 'es'
                  ? `✓ Usuario "${formData.email.trim()}" creado y vinculado al profesional.`
                  : `✓ User "${formData.email.trim()}" was created and linked to the professional.`,
              });
            } else {
              const err = await userResp.json();
              if (userResp.status === 409 && err.id) {
                await linkProfessionalToUser(newProf.id, err.id, formData.email.trim());
                setUserBanner({
                  type: 'success',
                  message: language === 'es'
                    ? `✓ Usuario existente vinculado al profesional.`
                    : `✓ Existing user linked to professional.`,
                });
              } else if (userResp.status === 409) {
                setUserBanner({
                  type: 'info',
                  message: language === 'es'
                    ? `ℹ Ya existe un usuario con el email "${formData.email.trim()}".`
                    : `ℹ A user with email "${formData.email.trim()}" already exists.`,
                });
              } else {
                setUserBanner({
                  type: 'error',
                  message: language === 'es'
                    ? `✕ No se pudo crear el usuario: ${err.error || 'Error desconocido'}`
                    : `✕ User account creation failed: ${err.error || 'Unknown error'}`,
                });
              }
            }
          } catch {
            setUserBanner({
              type: 'error',
              message: language === 'es'
                ? '✕ Ocurrió un error al crear la cuenta de usuario.'
                : '✕ An error occurred while creating the user account.',
            });
          }
        }
      }

      setShowAddPanel(false);
      handleCancel();
      loadProfessionals();
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Error saving professional:', error);
      setGlobalBanner({ type: 'error', message: 'Failed to save professional: ' + (error as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    setConfirmDeleteId(null);
    try {
      const { error } = await supabase
        .from('professionals')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setGlobalBanner({ type: 'success', message: language === 'es' ? 'Profesional eliminado exitosamente.' : 'Professional deleted successfully.' });
      loadProfessionals();
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Error deleting professional:', error);
      setGlobalBanner({ type: 'error', message: 'Failed to delete professional: ' + (error as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const loadSchedules = async (professionalId: string) => {
    if (!professionalId) return;

    setLoadingSchedules(true);
    try {
      const { data, error } = await supabase
        .from('available_slots')
        .select('*')
        .eq('professional_id', professionalId)
        .order('start_time', { ascending: true });

      if (error) throw error;
      setSchedules(data || []);
    } catch (error) {
      console.error('Error loading schedules:', error);
      alert('Failed to load schedules');
    } finally {
      setLoadingSchedules(false);
    }
  };

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all fields are filled
    if (!newSlot.professional_id || !newSlot.start_time || !newSlot.end_time) {
      alert(language === 'es' ? 'Por favor complete todos los campos' : 'Please fill in all fields');
      return;
    }

    // Validate time format
    if (!newSlot.start_time.includes(':') || !newSlot.end_time.includes(':')) {
      alert(language === 'es' ? 'Por favor seleccione hora y minutos válidos' : 'Please select valid hours and minutes');
      return;
    }

    const [startHour, startMin] = newSlot.start_time.split(':');
    const [endHour, endMin] = newSlot.end_time.split(':');

    if (!startHour || !startMin || !endHour || !endMin) {
      alert(language === 'es' ? 'Por favor seleccione hora y minutos válidos' : 'Please select valid hours and minutes');
      return;
    }

    const startMinutes = parseInt(startHour) * 60 + parseInt(startMin);
    const endMinutes = parseInt(endHour) * 60 + parseInt(endMin);

    if (endMinutes <= startMinutes) {
      alert(language === 'es' ? 'La hora de finalización debe ser posterior a la hora de inicio' : 'End time must be after start time');
      return;
    }

    try {
      await addAvailableSlot(newSlot);
      const currentProfessionalId = newSlot.professional_id;

      // Reset form but keep professional selected and stay in add view
      setNewSlot({
        professional_id: currentProfessionalId,
        start_time: '',
        end_time: '',
        is_booked: false,
        monday: 'N',
        tuesday: 'N',
        wednesday: 'N',
        thursday: 'N',
        friday: 'N',
        saturday: 'N',
        sunday: 'N'
      });

      alert(language === 'es' ? 'Espacio agregado exitosamente' : 'Slot added successfully');

      // Refresh schedules if viewing a professional's schedule
      if (selectedProfForSchedule) {
        loadSchedules(selectedProfForSchedule);
      }
    } catch (error) {
      console.error('Error adding slot:', error);
      alert(language === 'es' ? 'Error al agregar el espacio' : 'Error adding slot');
    }
  };

  const handleClearSchedule = async () => {
    if (!selectedProfForSchedule) {
      alert(language === 'es' ? 'Por favor seleccione un profesional' : 'Please select a professional');
      return;
    }

    const professional = professionals.find(p => p.id === selectedProfForSchedule);
    const confirmMessage = language === 'es'
      ? `¿Está seguro de que desea borrar todos los espacios disponibles (no reservados) para ${professional?.name_es || professional?.name_en}?`
      : `Are you sure you want to clear all available (non-booked) slots for ${professional?.name_en}?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      await clearProfessionalSchedule(selectedProfForSchedule);
      alert(language === 'es' ? 'Horario borrado exitosamente' : 'Schedule cleared successfully');
      loadSchedules(selectedProfForSchedule);
    } catch (error) {
      alert(language === 'es' ? 'Error al borrar el horario' : 'Error clearing schedule');
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm(language === 'es' ? '¿Eliminar este espacio?' : 'Delete this slot?')) return;

    try {
      const { error } = await supabase
        .from('available_slots')
        .delete()
        .eq('id', slotId);

      if (error) throw error;
      alert(language === 'es' ? 'Espacio eliminado' : 'Slot deleted');
      if (selectedProfForSchedule) {
        loadSchedules(selectedProfForSchedule);
      }
    } catch (error) {
      alert(language === 'es' ? 'Error al eliminar' : 'Error deleting slot');
    }
  };

  useEffect(() => {
    if (selectedProfForSchedule && scheduleView === 'list') {
      loadSchedules(selectedProfForSchedule);
    }
  }, [selectedProfForSchedule, scheduleView]);

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.9rem', border: '1px solid #cbd5e1', borderRadius: '7px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };

  const blankForm = () => ({
    name_en: '',
    name_es: '',
    bio_en: '',
    bio_es: '',
    selectedSpecialtyIds: [] as string[],
    photo_url: '',
    counseling_types: [] as string[],
    is_active: true,
    time_zone: detectUserTimezone(),
    titulo: '',
    clasificacion: '',
    email: '',
    profession: '',
    profession_id: '' as string,
    minimum_notice: '',
    primaryLanguage: '',
    secondaryLanguages: [] as string[],
  });

  const openAddPanel = () => {
    const opening = !showAddPanel;
    setShowAddPanel(opening);
    setEditingId(null);
    setCreateUserStatus(null);
    setGlobalBanner(null);
    setUserBanner(null);
    if (opening) {
      const defaultProfessionId = activeProfession?.id || '';
      setFormData({ ...blankForm(), profession_id: defaultProfessionId });
      if (defaultProfessionId) {
        loadSpecialtiesForProfession(defaultProfessionId);
      } else {
        setSpecialties([]);
      }
    } else {
      setFormData(blankForm());
      setSpecialties([]);
    }
  };

  const editingProfessional = editingId ? professionals.find(p => p.id === editingId) : null;
  const isUserLinked = !!editingProfessional?.user_id;
  const effectiveProfessionId = formData.profession_id || activeProfession?.id || '';
  const linkedProfession = professions.find(p => p.id === effectiveProfessionId);
  const selectedSpecialtyNames = buildSpecialtiesFromIds(formData.selectedSpecialtyIds, specialties);

  const specialtyCheckboxSection = (
    <div style={{ marginBottom: '1rem' }}>
      <label style={labelStyle}>
        {language === 'es' ? 'Especialidades' : 'Specialties'}
        {linkedProfession && (
          <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: '0.35rem' }}>
            ({language === 'es' ? linkedProfession.name_es : linkedProfession.name_en})
          </span>
        )}
      </label>
      {!effectiveProfessionId ? (
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
          {language === 'es'
            ? 'Seleccione una profesión vinculada para ver las especialidades disponibles.'
            : 'Select a linked profession to see available specialties.'}
        </p>
      ) : specialties.length === 0 ? (
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
          {language === 'es'
            ? 'No hay especialidades activas para esta profesión.'
            : 'No active specialties for this profession.'}
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
            {specialties.map(s => (
              <label
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  padding: '0.3rem 0.6rem',
                  background: formData.selectedSpecialtyIds.includes(s.id) ? '#ede9fe' : '#f5f5f5',
                  borderRadius: '6px',
                  border: `1px solid ${formData.selectedSpecialtyIds.includes(s.id) ? '#c4b5fd' : '#e2e8f0'}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={formData.selectedSpecialtyIds.includes(s.id)}
                  onChange={e => toggleSpecialty(s.id, e.target.checked)}
                />
                {language === 'es' ? s.name_es : s.name_en}
              </label>
            ))}
          </div>
          {formData.selectedSpecialtyIds.length > 0 && (
            <div style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
              <div>
                <strong>Specialties (EN):</strong> {selectedSpecialtyNames.specialties_en.join(', ')}
              </div>
              <div>
                <strong>Especialidades (ES):</strong> {selectedSpecialtyNames.specialties_es.join(', ')}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  // Shared form fields JSX — used by both Add panel and Edit modal
  const formFields = (
    <>
      {/* Row: Name EN / Name ES */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label style={labelStyle}>Name (English) <span style={{ color: '#e53e3e' }}>*</span></label>
          <input style={inputStyle} type="text" value={formData.name_en}
            onChange={e => setFormData(prev => ({ ...prev, name_en: e.target.value }))} required />
        </div>
        <div>
          <label style={labelStyle}>Name (Spanish) <span style={{ color: '#e53e3e' }}>*</span></label>
          <input style={inputStyle} type="text" value={formData.name_es}
            onChange={e => setFormData(prev => ({ ...prev, name_es: e.target.value }))} required />
        </div>
      </div>

      {/* ── Email field ── */}
      <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>
            {language === 'es' ? 'EMAIL DEL PROFESIONAL' : 'PROFESSIONAL EMAIL'}
          </label>
          {isUserLinked && (
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#16a34a' }}>
              {language === 'es' ? '· Cuenta vinculada' : '· Account linked'}
            </span>
          )}
        </div>
        <input
          style={{ ...inputStyle, fontSize: '1rem' }}
          type="text"
          inputMode="email"
          autoComplete="email"
          placeholder={language === 'es' ? 'correo@ejemplo.com (requerido para vincular)' : 'email@example.com (required to link user)'}
          value={formData.email}
          onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
        />
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: formData.email ? '#16a34a' : '#94a3b8' }}>
          {editingId
            ? (formData.email
                ? (language === 'es'
                    ? 'Use Crear/Vincular Usuario para vincular una cuenta existente o crear una nueva con rol Professional.'
                    : 'Use Create/Link User to link an existing account or create a new one with the Professional role.')
                : (language === 'es'
                    ? 'Ingrese el email del profesional y use Crear/Vincular Usuario.'
                    : "Enter the professional's email, then use Create/Link User."))
            : (formData.email
                ? (language === 'es'
                    ? `✓ Se creará un usuario con nombre: ${formData.name_en.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9_]/g, '') || '(complete el nombre primero)'}`
                    : `✓ A user account will be created with username: ${formData.name_en.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9_]/g, '') || '(fill in name first)'}`)
                : (language === 'es'
                    ? 'Opcional — si se completa, se crea una cuenta de usuario vinculada'
                    : 'Optional — if filled, a linked user account is created in the users table'))}
        </p>
      </div>

      {/* Row: Bio EN / Bio ES */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label style={labelStyle}>Bio (English) <span style={{ color: '#e53e3e' }}>*</span></label>
          <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={3} value={formData.bio_en}
            onChange={e => setFormData(prev => ({ ...prev, bio_en: e.target.value }))} required />
        </div>
        <div>
          <label style={labelStyle}>Bio (Spanish) <span style={{ color: '#e53e3e' }}>*</span></label>
          <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={3} value={formData.bio_es}
            onChange={e => setFormData(prev => ({ ...prev, bio_es: e.target.value }))} required />
        </div>
      </div>

      {/* Row: Counseling Types / Photo URL */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label style={labelStyle}>Counseling Types</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
            {counselingTypes.map(ct => (
              <label key={ct.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', cursor: 'pointer', padding: '0.3rem 0.6rem', background: formData.counseling_types.includes(ct.id) ? '#ede9fe' : '#f5f5f5', borderRadius: '6px', border: `1px solid ${formData.counseling_types.includes(ct.id) ? '#c4b5fd' : '#e2e8f0'}` }}>
                <input type="checkbox" value={ct.id} checked={formData.counseling_types.includes(ct.id)}
                  onChange={e => {
                    const id = e.target.value;
                    setFormData(prev => ({ ...prev, counseling_types: e.target.checked ? [...prev.counseling_types, id] : prev.counseling_types.filter(x => x !== id) }));
                  }} />
                {language === 'en' ? ct.name_en : ct.name_es}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Photo URL</label>
          <input style={inputStyle} type="url" placeholder="https://..." value={formData.photo_url}
            onChange={e => setFormData(prev => ({ ...prev, photo_url: e.target.value }))} />
        </div>
      </div>

      {/* ── Languages spoken ────────────────────────────────────────── */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={labelStyle}>{language === 'es' ? 'Idiomas Hablados' : 'Languages Spoken'}</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {/* Primary language */}
          <div>
            <label style={{ ...labelStyle, textTransform: 'none', fontSize: '0.75rem' }}>
              {language === 'es' ? 'Idioma Principal' : 'Primary Language'}
            </label>
            <select
              style={inputStyle}
              value={formData.primaryLanguage}
              onChange={e => {
                const newPrimary = e.target.value;
                setFormData(prev => ({
                  ...prev,
                  primaryLanguage: newPrimary,
                  // Drop from secondary if it was already there
                  secondaryLanguages: prev.secondaryLanguages.filter(l => l !== newPrimary),
                }));
              }}
            >
              <option value="">{language === 'es' ? '— Ninguno —' : '— None —'}</option>
              {SUPPORTED_LANGUAGES.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>
          {/* Secondary languages — checkboxes */}
          <div>
            <label style={{ ...labelStyle, textTransform: 'none', fontSize: '0.75rem' }}>
              {language === 'es' ? 'Idiomas Secundarios' : 'Secondary Languages'}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.15rem' }}>
              {SUPPORTED_LANGUAGES
                .filter(lang => lang !== formData.primaryLanguage)
                .map(lang => {
                  const checked = formData.secondaryLanguages.includes(lang);
                  return (
                    <label
                      key={lang}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                        padding: '0.25rem 0.55rem', borderRadius: '6px', cursor: 'pointer',
                        fontSize: '0.82rem',
                        background: checked ? '#ede9fe' : '#f5f5f5',
                        border: `1px solid ${checked ? '#c4b5fd' : '#e2e8f0'}`,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e =>
                          setFormData(prev => ({
                            ...prev,
                            secondaryLanguages: e.target.checked
                              ? [...prev.secondaryLanguages, lang]
                              : prev.secondaryLanguages.filter(l => l !== lang),
                          }))
                        }
                      />
                      {lang}
                    </label>
                  );
                })}
            </div>
          </div>
        </div>
        {/* Flag preview */}
        {(formData.primaryLanguage || formData.secondaryLanguages.length > 0) && (
          <div style={{ marginTop: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b', marginRight: '0.15rem' }}>
              {language === 'es' ? 'Vista previa:' : 'Preview:'}
            </span>
            {[formData.primaryLanguage, ...formData.secondaryLanguages]
              .filter(Boolean)
              .map((lang, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <LanguageFlag languageName={lang} size={22} />
                  <span style={{ fontSize: '0.78rem', color: '#475569' }}>{lang}</span>
                </span>
              ))}
          </div>
        )}
      </div>

      {/* Row: Timezone / Minimum Notice */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label style={labelStyle}>{language === 'es' ? 'Zona Horaria' : 'Time Zone'}</label>
          <TimezoneSelector value={formData.time_zone} onChange={tz => setFormData(prev => ({ ...prev, time_zone: tz }))} />
        </div>
        <div>
          <label style={labelStyle}>
            {language === 'es' ? 'Aviso Mínimo (horas)' : 'Minimum Notice (hours)'}
          </label>
          <select
            style={inputStyle}
            value={formData.minimum_notice}
            onChange={e => setFormData(prev => ({ ...prev, minimum_notice: e.target.value }))}
          >
            <option value="">{language === 'es' ? '-- Predeterminado (24h) --' : '-- Default (24h) --'}</option>
            {[4, 8, 12, 16, 20, 24, 48].map(h => (
              <option key={h} value={String(h)}>{h} {language === 'es' ? 'horas' : 'hours'}</option>
            ))}
          </select>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
            {language === 'es'
              ? 'Horas de anticipación requeridas para reservar. Deje vacío para usar 24 horas.'
              : 'Hours of advance notice required to book. Leave empty to use the default of 24 hours.'}
          </p>
        </div>
      </div>

      {/* Row: Title / Classification */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label style={labelStyle}>Title (Título)</label>
          <input style={inputStyle} type="text" placeholder="Dr., Psicólog(a)" value={formData.titulo}
            onChange={e => setFormData(prev => ({ ...prev, titulo: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>Classification (Clasificación)</label>
          <input style={inputStyle} type="text" placeholder="Clinical, Educational" value={formData.clasificacion}
            onChange={e => setFormData(prev => ({ ...prev, clasificacion: e.target.value }))} />
        </div>
      </div>

      {/* Row: Profession text / Profession linked */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label style={labelStyle}>Profession (text)</label>
          <input style={inputStyle} type="text" placeholder="Psychology, Psychiatry" value={formData.profession}
            onChange={e => setFormData(prev => ({ ...prev, profession: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>{t('profession') || 'Profession'} (linked)</label>
          <select style={inputStyle} value={formData.profession_id}
            onChange={e => handleProfessionIdChange(e.target.value)}>
            <option value="">{t('selectProfession') || '— Select Profession —'}</option>
            {professions.filter(p => p.is_active).map(p => (
              <option key={p.id} value={p.id}>{language === 'es' ? p.name_es : p.name_en}</option>
            ))}
          </select>
        </div>
      </div>

      {specialtyCheckboxSection}

      {/* Active */}
      <div style={{ marginBottom: '1.25rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
          <input type="checkbox" checked={formData.is_active}
            onChange={e => setFormData(prev => ({ ...prev, is_active: e.target.checked }))} />
          <span style={{ fontWeight: 500 }}>Active</span>
        </label>
      </div>

      {/* Note about user creation */}
      <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>
        {language === 'es'
          ? 'Si el email está completo, se creará una cuenta de usuario vinculada a este profesional.'
          : 'If email is filled in, a user account will be created and linked to this professional.'}
      </p>
    </>
  );

  const lbl: React.CSSProperties = { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' };
  const inp: React.CSSProperties = { width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.9rem', border: '1px solid #cbd5e1', borderRadius: '7px', boxSizing: 'border-box', fontFamily: 'inherit' };

  return (
    <div className="professional-manager">
      <h3>{t('manageProfessionals')}</h3>

      {/* Professional added banner */}
      {globalBanner && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.85rem 1.1rem', borderRadius: '8px',
          marginBottom: userBanner ? '0.5rem' : '1.25rem',
          backgroundColor: globalBanner.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${globalBanner.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          color: globalBanner.type === 'success' ? '#15803d' : '#dc2626',
          fontWeight: 500, fontSize: '0.9rem',
        }}>
          <span>{globalBanner.message}</span>
          <button onClick={() => setGlobalBanner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'inherit', lineHeight: 1, padding: '0 0.25rem' }}>×</button>
        </div>
      )}

      {/* User added / user status banner */}
      {userBanner && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.85rem 1.1rem', borderRadius: '8px', marginBottom: '1.25rem',
          backgroundColor: userBanner.type === 'success' ? '#eff6ff' : userBanner.type === 'info' ? '#fefce8' : '#fef2f2',
          border: `1px solid ${userBanner.type === 'success' ? '#bfdbfe' : userBanner.type === 'info' ? '#fde68a' : '#fecaca'}`,
          color: userBanner.type === 'success' ? '#1d4ed8' : userBanner.type === 'info' ? '#92400e' : '#dc2626',
          fontWeight: 500, fontSize: '0.9rem',
        }}>
          <span>{userBanner.message}</span>
          <button onClick={() => setUserBanner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'inherit', lineHeight: 1, padding: '0 0.25rem' }}>×</button>
        </div>
      )}

      {/* Add Professional button — admins only */}
      {isAdmin && (
      <div style={{ marginBottom: '1.25rem' }}>
        <button
          type="button"
          onClick={openAddPanel}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.65rem 1.4rem', backgroundColor: showAddPanel ? '#5a52e0' : '#6c63ff',
            color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer',
            fontSize: '0.9rem', fontWeight: 600,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {showAddPanel
              ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
              : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}
          </svg>
          {showAddPanel
            ? (language === 'es' ? 'Cancelar' : 'Cancel')
            : (language === 'es' ? 'Agregar Profesional' : 'Add Professional')}
        </button>
      </div>
      )}

      {/* ── Inline Add Panel ── */}
      {showAddPanel && !editingId && (
        <div style={{
          background: '#fff', border: '1px solid #c4b5fd', borderRadius: '12px',
          marginBottom: '2rem', overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(108,99,255,0.10)',
        }}>
          <div style={{ background: 'linear-gradient(135deg,#6c63ff 0%,#5a54d4 100%)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <h4 style={{ margin: 0, color: '#fff', fontSize: '1.05rem', fontWeight: 700 }}>
              {language === 'es' ? 'Agregar Nuevo Profesional' : 'Add New Professional'}
            </h4>
          </div>
          <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>

            {/* Name */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={lbl}>Name (English) *</label>
                <input style={inp} type="text" required value={formData.name_en}
                  onChange={e => setFormData(prev => ({ ...prev, name_en: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Name (Spanish) *</label>
                <input style={inp} type="text" required value={formData.name_es}
                  onChange={e => setFormData(prev => ({ ...prev, name_es: e.target.value }))} />
              </div>
            </div>

            {/* Email — stored in users table */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={lbl}>Email</label>
              <input style={inp} type="text" inputMode="email" autoComplete="email" placeholder="professional@example.com"
                value={formData.email} onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))} />
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                {language === 'es'
                  ? 'Si se completa, se creará una cuenta de usuario en la tabla de usuarios.'
                  : 'If filled, a user account will be created in the users table.'}
              </p>
            </div>

            {/* Bio */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={lbl}>Bio (English) *</label>
                <textarea style={{ ...inp, resize: 'vertical' }} rows={3} required value={formData.bio_en}
                  onChange={e => setFormData(prev => ({ ...prev, bio_en: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Bio (Spanish) *</label>
                <textarea style={{ ...inp, resize: 'vertical' }} rows={3} required value={formData.bio_es}
                  onChange={e => setFormData(prev => ({ ...prev, bio_es: e.target.value }))} />
              </div>
            </div>

            {/* Counseling Types + Photo */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={lbl}>Counseling Types</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem' }}>
                  {counselingTypes.map(ct => (
                    <label key={ct.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer', padding: '0.25rem 0.55rem', background: formData.counseling_types.includes(ct.id) ? '#ede9fe' : '#f5f5f5', borderRadius: '6px', border: `1px solid ${formData.counseling_types.includes(ct.id) ? '#c4b5fd' : '#e2e8f0'}` }}>
                      <input type="checkbox" value={ct.id} checked={formData.counseling_types.includes(ct.id)}
                        onChange={e => { const id = e.target.value; setFormData(prev => ({ ...prev, counseling_types: e.target.checked ? [...prev.counseling_types, id] : prev.counseling_types.filter(x => x !== id) })); }} />
                      {language === 'en' ? ct.name_en : ct.name_es}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={lbl}>Photo URL</label>
                <input style={inp} type="url" placeholder="https://..." value={formData.photo_url}
                  onChange={e => setFormData(prev => ({ ...prev, photo_url: e.target.value }))} />
              </div>
            </div>

            {/* Languages Spoken */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={lbl}>{language === 'es' ? 'Idiomas Hablados' : 'Languages Spoken'}</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ ...lbl, fontWeight: 500, textTransform: 'none', fontSize: '0.78rem' }}>
                    {language === 'es' ? 'Idioma Principal' : 'Primary Language'}
                  </label>
                  <select
                    style={inp}
                    value={formData.primaryLanguage}
                    onChange={e => {
                      const newPrimary = e.target.value;
                      setFormData(prev => ({
                        ...prev,
                        primaryLanguage: newPrimary,
                        secondaryLanguages: prev.secondaryLanguages.filter(l => l !== newPrimary),
                      }));
                    }}
                  >
                    <option value="">{language === 'es' ? '— Ninguno —' : '— None —'}</option>
                    {SUPPORTED_LANGUAGES.map(lang => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ ...lbl, fontWeight: 500, textTransform: 'none', fontSize: '0.78rem' }}>
                    {language === 'es' ? 'Idiomas Secundarios' : 'Secondary Languages'}
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.15rem' }}>
                    {SUPPORTED_LANGUAGES
                      .filter(lang => lang !== formData.primaryLanguage)
                      .map(lang => {
                        const checked = formData.secondaryLanguages.includes(lang);
                        return (
                          <label
                            key={lang}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                              padding: '0.25rem 0.55rem', borderRadius: '6px', cursor: 'pointer',
                              fontSize: '0.82rem',
                              background: checked ? '#ede9fe' : '#f5f5f5',
                              border: `1px solid ${checked ? '#c4b5fd' : '#e2e8f0'}`,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e =>
                                setFormData(prev => ({
                                  ...prev,
                                  secondaryLanguages: e.target.checked
                                    ? [...prev.secondaryLanguages, lang]
                                    : prev.secondaryLanguages.filter(l => l !== lang),
                                }))
                              }
                            />
                            {lang}
                          </label>
                        );
                      })}
                  </div>
                </div>
              </div>
              {/* Flag preview */}
              {(formData.primaryLanguage || formData.secondaryLanguages.length > 0) && (
                <div style={{ marginTop: '0.55rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.78rem', color: '#64748b', marginRight: '0.1rem' }}>
                    {language === 'es' ? 'Vista previa:' : 'Preview:'}
                  </span>
                  {[formData.primaryLanguage, ...formData.secondaryLanguages]
                    .filter(Boolean)
                    .map((lang, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <LanguageFlag languageName={lang} size={22} />
                        <span style={{ fontSize: '0.78rem', color: '#475569' }}>{lang}</span>
                      </span>
                    ))}
                </div>
              )}
            </div>

            {/* Timezone / Minimum Notice */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={lbl}>Time Zone</label>
                <TimezoneSelector value={formData.time_zone} onChange={tz => setFormData(prev => ({ ...prev, time_zone: tz }))} />
              </div>
              <div>
                <label style={lbl}>Minimum Notice (hours)</label>
                <select
                  style={inp}
                  value={formData.minimum_notice}
                  onChange={e => setFormData(prev => ({ ...prev, minimum_notice: e.target.value }))}
                >
                  <option value="">{language === 'es' ? '-- Predeterminado (24h) --' : '-- Default (24h) --'}</option>
                  {[4, 8, 12, 16, 20, 24, 48].map(h => (
                    <option key={h} value={String(h)}>{h} {language === 'es' ? 'horas' : 'hours'}</option>
                  ))}
                </select>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                  {language === 'es'
                    ? 'Deje vacío para usar 24 horas.'
                    : 'Leave empty to use the default of 24 hours.'}
                </p>
              </div>
            </div>

            {/* Title / Classification */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={lbl}>Title (Título)</label>
                <input style={inp} type="text" placeholder="Dr., Psicólog(a)" value={formData.titulo}
                  onChange={e => setFormData(prev => ({ ...prev, titulo: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Classification (Clasificación)</label>
                <input style={inp} type="text" placeholder="Clinical, Educational" value={formData.clasificacion}
                  onChange={e => setFormData(prev => ({ ...prev, clasificacion: e.target.value }))} />
              </div>
            </div>

            {/* Profession */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={lbl}>Profession (text)</label>
                <input style={inp} type="text" placeholder="Psychology, Psychiatry" value={formData.profession}
                  onChange={e => setFormData(prev => ({ ...prev, profession: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Profession (linked)</label>
                <select style={inp} value={formData.profession_id}
                  onChange={e => handleProfessionIdChange(e.target.value)}>
                  <option value="">— Select —</option>
                  {professions.filter(p => p.is_active).map(p => (
                    <option key={p.id} value={p.id}>{language === 'es' ? p.name_es : p.name_en}</option>
                  ))}
                </select>
              </div>
            </div>

            {specialtyCheckboxSection}

            {/* Active */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                <input type="checkbox" checked={formData.is_active}
                  onChange={e => setFormData(prev => ({ ...prev, is_active: e.target.checked }))} />
                <span>Active</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
              <button type="button" onClick={openAddPanel}
                style={{ padding: '0.6rem 1.4rem', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: '#374151' }}>
                {language === 'es' ? 'Cancelar' : 'Cancel'}
              </button>
              <button type="submit" disabled={loading}
                style={{ padding: '0.6rem 1.6rem', background: loading ? '#a5b4fc' : '#6c63ff', color: 'white', border: 'none', borderRadius: '7px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
                {loading ? 'Saving...' : (language === 'es' ? 'Agregar Profesional' : 'Add Professional')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Professionals List (table) ── */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h4 style={{ margin: 0 }}>
            {isAdmin
              ? (language === 'es' ? 'Profesionales' : 'Professionals')
              : (language === 'es' ? 'Mi Perfil' : 'My Profile')}
            {isAdmin && activeProfession && (
              <span style={{ marginLeft: '0.6rem', fontSize: '0.82rem', fontWeight: 400, color: '#64748b' }}>
                — {language === 'es' ? activeProfession.name_es : activeProfession.name_en}
              </span>
            )}
          </h4>
          {isAdmin && (
          <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
            {visibleProfessionals.length}{' '}
            {language === 'es' ? 'profesionales' : 'professionals'}
          </span>
          )}
        </div>

        {loading && !visibleProfessionals.length ? (
          <p style={{ color: '#64748b' }}>{language === 'es' ? 'Cargando...' : 'Loading...'}</p>
        ) : visibleProfessionals.length === 0 ? (
          <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>
            {isAdmin
              ? (language === 'es' ? 'No se encontraron profesionales.' : 'No professionals found.')
              : (language === 'es' ? 'No se encontró un perfil vinculado a su cuenta.' : 'No professional profile is linked to your account yet.')}
          </p>
        ) : (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '2.5fr 2fr 1fr 1fr auto' : '2.5fr 2fr 1fr 1fr auto', gap: 0, background: '#f8fafc', borderBottom: '2px solid #e2e8f0', padding: '0.6rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <div>{language === 'es' ? 'Nombre' : 'Name'}</div>
              <div>Email</div>
              <div>{language === 'es' ? 'Estado' : 'Status'}</div>
              <div>{language === 'es' ? 'Usuario' : 'User'}</div>
              <div style={{ textAlign: 'right' }}>{language === 'es' ? 'Acciones' : 'Actions'}</div>
            </div>

            {visibleProfessionals
              .map((professional, idx, arr) => (
                <div key={professional.id}>
                  {/* Main row */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '2.5fr 2fr 1fr 1fr auto', gap: 0,
                    padding: '0.85rem 1rem', alignItems: 'center',
                    background: idx % 2 === 0 ? 'white' : '#fafafa',
                    borderBottom: idx < arr.length - 1 ? '1px solid #f1f5f9' : 'none',
                  }}>
                    {/* Name + subtitle */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        {professional.photo_url && (
                          <ExpandableProfessionalPhoto
                            src={professional.photo_url}
                            alt={professional.name_en}
                            style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '1px solid #e2e8f0' }}
                          />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {professional.name_en}
                          </div>
                          {professional.name_es !== professional.name_en && (
                            <div style={{ fontSize: '0.78rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{professional.name_es}</div>
                          )}
                          {(professional.Título || professional.Clasificación) && (
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              {[professional.Título, professional.Clasificación].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Email */}
                    <div style={{ fontSize: '0.85rem', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {professional.email || <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>—</span>}
                    </div>

                    {/* Status */}
                    <div>
                      <span style={{
                        display: 'inline-block', padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600,
                        background: professional.is_active ? '#dcfce7' : '#fee2e2',
                        color: professional.is_active ? '#16a34a' : '#dc2626',
                      }}>
                        {professional.is_active ? (language === 'es' ? 'Activo' : 'Active') : (language === 'es' ? 'Inactivo' : 'Inactive')}
                      </span>
                    </div>

                    {/* User Account */}
                    <div>
                      {professional.user_id ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: '#16a34a', fontWeight: 600 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                          {language === 'es' ? 'Vinculado' : 'Linked'}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>—</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexShrink: 0 }}>
                      <button type="button" onClick={() => setResumeModalProf(professional)}
                        title={language === 'es' ? 'Currículum' : 'Resume'}
                        style={{ padding: '0.4rem 0.6rem', background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: '6px', cursor: 'pointer', color: '#3730a3', display: 'flex', alignItems: 'center' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                        </svg>
                      </button>
                      <button type="button" onClick={() => { setGlobalBanner(null); handleEdit(professional); }}
                        style={{ padding: '0.4rem 0.85rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', cursor: 'pointer', color: '#1d4ed8', fontWeight: 600, fontSize: '0.82rem' }}>
                        {language === 'es' ? 'Editar' : 'Edit'}
                      </button>
                      {isAdmin && (
                      <button type="button" onClick={() => { setConfirmDeleteId(professional.id); setGlobalBanner(null); }}
                        style={{ padding: '0.4rem 0.85rem', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '6px', cursor: 'pointer', color: '#e11d48', fontWeight: 600, fontSize: '0.82rem' }}>
                        {language === 'es' ? 'Eliminar' : 'Delete'}
                      </button>
                      )}
                    </div>
                  </div>

                  {/* Inline delete confirmation */}
                  {confirmDeleteId === professional.id && (
                    <div style={{
                      background: '#fff5f5', borderTop: '1px solid #fecdd3', borderBottom: idx < arr.length - 1 ? '1px solid #f1f5f9' : 'none',
                      padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                    }}>
                      <span style={{ fontSize: '0.875rem', color: '#be123c', fontWeight: 500 }}>
                        {language === 'es'
                          ? `¿Eliminar a ${professional.name_en}? Esta acción no se puede deshacer.`
                          : `Delete ${professional.name_en}? This cannot be undone.`}
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                        <button type="button" onClick={() => setConfirmDeleteId(null)}
                          style={{ padding: '0.4rem 1rem', background: 'white', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                          {language === 'es' ? 'Cancelar' : 'Cancel'}
                        </button>
                        <button type="button" onClick={() => handleDelete(professional.id)} disabled={loading}
                          style={{ padding: '0.4rem 1rem', background: '#e11d48', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                          {language === 'es' ? 'Sí, eliminar' : 'Yes, Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="schedule-management" style={{ marginTop: '3rem', borderTop: '2px solid #e0e0e0', paddingTop: '2rem' }}>
        <h3>{language === 'es' ? 'Gestión de Horarios' : 'Schedule Management'}</h3>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', marginTop: '1.5rem' }}>
          <button
            onClick={() => setScheduleView('list')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: scheduleView === 'list' ? '#6c63ff' : '#f0f0f0',
              color: scheduleView === 'list' ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            {language === 'es' ? 'Ver Horarios' : 'View Schedules'}
          </button>
          <button
            onClick={() => setScheduleView('add')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: scheduleView === 'add' ? '#6c63ff' : '#f0f0f0',
              color: scheduleView === 'add' ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            {language === 'es' ? 'Agregar Espacio' : 'Add Slot'}
          </button>
          <button
            onClick={() => setScheduleView('clear')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: scheduleView === 'clear' ? '#6c63ff' : '#f0f0f0',
              color: scheduleView === 'clear' ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            {language === 'es' ? 'Borrar Horario' : 'Clear Schedule'}
          </button>
        </div>

        {scheduleView === 'list' && (
          <div style={{ padding: '2rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <h4 style={{ marginBottom: '1.5rem' }}>
              {language === 'es' ? 'Ver Horarios del Profesional' : 'View Professional Schedules'}
            </h4>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                {language === 'es' ? 'Seleccionar Profesional' : 'Select Professional'}
              </label>
              <select
                value={selectedProfForSchedule}
                onChange={(e) => setSelectedProfForSchedule(e.target.value)}
                style={{
                  width: '100%',
                  maxWidth: '400px',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '1rem'
                }}
              >
                <option value="">
                  {language === 'es' ? 'Seleccionar profesional' : 'Select professional'}
                </option>
                {visibleProfessionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {language === 'es' ? p.name_es : p.name_en}
                  </option>
                ))}
              </select>
            </div>

            {loadingSchedules ? (
              <p>{language === 'es' ? 'Cargando...' : 'Loading...'}</p>
            ) : schedules.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic' }}>
                {selectedProfForSchedule
                  ? (language === 'es' ? 'No se encontraron horarios' : 'No schedules found')
                  : (language === 'es' ? 'Seleccione un profesional para ver sus horarios' : 'Select a professional to view schedules')}
              </p>
            ) : (
              <div style={{ marginTop: '1.5rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#e8e8e8' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                        {language === 'es' ? 'Días' : 'Days'}
                      </th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                        {language === 'es' ? 'Hora de Inicio' : 'Start Time'}
                      </th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                        {language === 'es' ? 'Hora de Fin' : 'End Time'}
                      </th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                        {language === 'es' ? 'Estado' : 'Status'}
                      </th>
                      <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid #ddd' }}>
                        {language === 'es' ? 'Acciones' : 'Actions'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((slot) => {
                      const activeDays = [];
                      const dayLabels = {
                        monday: language === 'es' ? 'Lun' : 'Mon',
                        tuesday: language === 'es' ? 'Mar' : 'Tue',
                        wednesday: language === 'es' ? 'Mié' : 'Wed',
                        thursday: language === 'es' ? 'Jue' : 'Thu',
                        friday: language === 'es' ? 'Vie' : 'Fri',
                        saturday: language === 'es' ? 'Sáb' : 'Sat',
                        sunday: language === 'es' ? 'Dom' : 'Sun'
                      };

                      if (slot.monday === 'Y') activeDays.push(dayLabels.monday);
                      if (slot.tuesday === 'Y') activeDays.push(dayLabels.tuesday);
                      if (slot.wednesday === 'Y') activeDays.push(dayLabels.wednesday);
                      if (slot.thursday === 'Y') activeDays.push(dayLabels.thursday);
                      if (slot.friday === 'Y') activeDays.push(dayLabels.friday);
                      if (slot.saturday === 'Y') activeDays.push(dayLabels.saturday);
                      if (slot.sunday === 'Y') activeDays.push(dayLabels.sunday);

                      return (
                        <tr key={slot.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                          <td style={{ padding: '0.75rem' }}>
                            {activeDays.length > 0 ? activeDays.join(', ') : '-'}
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            {slot.start_time || '-'}
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            {slot.end_time || '-'}
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <span style={{
                              padding: '0.25rem 0.75rem',
                              borderRadius: '12px',
                              fontSize: '0.85rem',
                              fontWeight: '600',
                              backgroundColor: slot.is_booked ? '#ffebee' : '#e8f5e9',
                              color: slot.is_booked ? '#c62828' : '#2e7d32'
                            }}>
                              {slot.is_booked
                                ? (language === 'es' ? 'Reservado' : 'Booked')
                                : (language === 'es' ? 'Disponible' : 'Available')}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <button
                              onClick={() => handleDeleteSlot(slot.id)}
                              style={{
                                padding: '0.5rem 1rem',
                                backgroundColor: '#e53e3e',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.9rem'
                              }}
                            >
                              {language === 'es' ? 'Eliminar' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {scheduleView === 'add' && (
          <div style={{ padding: '2rem', backgroundColor: '#f8f9fa', borderRadius: '8px', maxWidth: '600px' }}>
            <h4 style={{ marginBottom: '1.5rem' }}>
              {language === 'es' ? 'Agregar Espacio Disponible' : 'Add Available Slot'}
            </h4>
            <form onSubmit={handleAddSlot}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  {language === 'es' ? 'Profesional' : 'Professional'}
                </label>
                <select
                  value={newSlot.professional_id}
                  onChange={(e) => setNewSlot({ ...newSlot, professional_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '1rem'
                  }}
                  required
                >
                  <option value="">
                    {language === 'es' ? 'Seleccionar profesional' : 'Select professional'}
                  </option>
                  {visibleProfessionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {language === 'es' ? p.name_es : p.name_en}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  {language === 'es' ? 'Días de la Semana' : 'Days of Week'}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
                  {[
                    { key: 'monday', label: language === 'es' ? 'Lunes' : 'Monday' },
                    { key: 'tuesday', label: language === 'es' ? 'Martes' : 'Tuesday' },
                    { key: 'wednesday', label: language === 'es' ? 'Miércoles' : 'Wednesday' },
                    { key: 'thursday', label: language === 'es' ? 'Jueves' : 'Thursday' },
                    { key: 'friday', label: language === 'es' ? 'Viernes' : 'Friday' },
                    { key: 'saturday', label: language === 'es' ? 'Sábado' : 'Saturday' },
                    { key: 'sunday', label: language === 'es' ? 'Domingo' : 'Sunday' }
                  ].map((day) => (
                    <label key={day.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                      <input
                        type="checkbox"
                        checked={newSlot[day.key as keyof typeof newSlot] === 'Y'}
                        onChange={(e) => setNewSlot({ ...newSlot, [day.key]: e.target.checked ? 'Y' : 'N' })}
                        style={{ width: '18px', height: '18px' }}
                      />
                      <span style={{ fontSize: '0.9rem' }}>{day.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  {language === 'es' ? 'Hora de Inicio' : 'Start Time'}
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <select
                    value={newSlot.start_time.split(':')[0] || ''}
                    onChange={(e) => {
                      const minutes = newSlot.start_time.split(':')[1] || '00';
                      setNewSlot({ ...newSlot, start_time: `${e.target.value}:${minutes}` });
                    }}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem'
                    }}
                    required
                  >
                    <option value="">{language === 'es' ? 'Hora' : 'Hour'}</option>
                    {Array.from({ length: 24 }, (_, i) => {
                      const hour = i.toString().padStart(2, '0');
                      return <option key={hour} value={hour}>{hour}</option>;
                    })}
                  </select>
                  <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>:</span>
                  <select
                    value={newSlot.start_time.split(':')[1] || ''}
                    onChange={(e) => {
                      const hour = newSlot.start_time.split(':')[0] || '00';
                      setNewSlot({ ...newSlot, start_time: `${hour}:${e.target.value}` });
                    }}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem'
                    }}
                    required
                  >
                    <option value="">{language === 'es' ? 'Min' : 'Min'}</option>
                    <option value="00">00</option>
                    <option value="30">30</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  {language === 'es' ? 'Hora de Finalización' : 'End Time'}
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <select
                    value={newSlot.end_time.split(':')[0] || ''}
                    onChange={(e) => {
                      const minutes = newSlot.end_time.split(':')[1] || '00';
                      setNewSlot({ ...newSlot, end_time: `${e.target.value}:${minutes}` });
                    }}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem'
                    }}
                    required
                  >
                    <option value="">{language === 'es' ? 'Hora' : 'Hour'}</option>
                    {Array.from({ length: 24 }, (_, i) => {
                      const hour = i.toString().padStart(2, '0');
                      return <option key={hour} value={hour}>{hour}</option>;
                    })}
                  </select>
                  <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>:</span>
                  <select
                    value={newSlot.end_time.split(':')[1] || ''}
                    onChange={(e) => {
                      const hour = newSlot.end_time.split(':')[0] || '00';
                      setNewSlot({ ...newSlot, end_time: `${hour}:${e.target.value}` });
                    }}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem'
                    }}
                    required
                  >
                    <option value="">{language === 'es' ? 'Min' : 'Min'}</option>
                    <option value="00">00</option>
                    <option value="30">30</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newSlot.is_booked}
                    onChange={(e) => setNewSlot({ ...newSlot, is_booked: e.target.checked })}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ fontWeight: '600' }}>
                    {language === 'es' ? 'Marcar como reservado' : 'Mark as booked'}
                  </span>
                </label>
              </div>

              <button
                type="submit"
                style={{
                  padding: '0.75rem 2rem',
                  backgroundColor: '#6c63ff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: '600'
                }}
              >
                {language === 'es' ? 'Agregar Espacio' : 'Add Slot'}
              </button>
            </form>
          </div>
        )}

        {scheduleView === 'clear' && (
          <div style={{
            padding: '2rem',
            backgroundColor: '#fff5f5',
            borderRadius: '8px',
            maxWidth: '600px',
            border: '1px solid #ffcccc'
          }}>
            <h4 style={{ marginBottom: '1rem', color: '#c53030' }}>
              {language === 'es' ? 'Borrar Horario del Profesional' : 'Clear Professional Schedule'}
            </h4>
            <p style={{ marginBottom: '1.5rem', color: '#666', lineHeight: '1.6' }}>
              {language === 'es'
                ? 'Esta acción eliminará todos los espacios disponibles (no reservados) para el profesional seleccionado. Esta acción no se puede deshacer.'
                : 'This action will remove all available (non-booked) slots for the selected professional. This action cannot be undone.'}
            </p>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                {language === 'es' ? 'Seleccionar Profesional' : 'Select Professional'}
              </label>
              <select
                value={selectedProfForSchedule}
                onChange={(e) => setSelectedProfForSchedule(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '1rem'
                }}
              >
                <option value="">
                  {language === 'es' ? 'Seleccionar profesional' : 'Select professional'}
                </option>
                {visibleProfessionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {language === 'es' ? p.name_es : p.name_en}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleClearSchedule}
              disabled={!selectedProfForSchedule}
              style={{
                padding: '0.75rem 2rem',
                backgroundColor: !selectedProfForSchedule ? '#ccc' : '#e53e3e',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: !selectedProfForSchedule ? 'not-allowed' : 'pointer',
                fontSize: '1rem',
                fontWeight: '600'
              }}
            >
              {language === 'es' ? 'Borrar Horario' : 'Clear Schedule'}
            </button>
          </div>
        )}
      </div>

      {resumeModalProf && (
        <ProfessionalResumeModal
          professional={resumeModalProf}
          isAdmin={isAdmin}
          onClose={() => setResumeModalProf(null)}
        />
      )}

      {editModalOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            zIndex: 9999, overflowY: 'auto', padding: '2rem 1rem',
          }}
        >
          <div style={{
            background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '780px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
          }}>
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1.25rem 1.75rem', borderBottom: '1px solid #e5e7eb',
              background: 'linear-gradient(135deg, #6c63ff 0%, #5a54d4 100%)',
            }}>
              <h4 style={{ margin: 0, color: '#fff', fontSize: '1.15rem', fontWeight: 600 }}>
                {editingId
                  ? (language === 'es' ? 'Editar Profesional' : 'Edit Professional')
                  : (language === 'es' ? 'Agregar Profesional' : 'Add Professional')}
              </h4>
              <button
                onClick={handleCancel}
                style={{
                  background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%',
                  width: '34px', height: '34px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '1.25rem',
                }}
              >
                &times;
              </button>
            </div>

            {/* Modal body — edit form */}
            <div style={{ padding: '1.75rem', overflowY: 'auto', maxHeight: 'calc(90vh - 80px)' }}>
              <form onSubmit={handleSubmit}>
                {formFields}

                {/* Create/Link User — only shown to admins in edit mode */}
                {editingId && isAdmin && (
                  <div style={{ background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '1rem 1.25rem', marginBottom: '1rem' }}>
                    <p style={{ fontSize: '0.8rem', color: '#374151', margin: '0 0 0.75rem', fontWeight: 500 }}>
                      {language === 'es'
                        ? 'Vincule una cuenta existente por email o cree una nueva con rol Professional:'
                        : 'Link an existing account by email, or create a new user with the Professional role:'}
                    </p>
                    <button type="button" onClick={handleCreateUser} disabled={createUserLoading}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.5rem 1.1rem', backgroundColor: createUserLoading ? '#d1d5db' : '#0369a1', color: createUserLoading ? '#9ca3af' : '#fff', border: 'none', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: createUserLoading ? 'not-allowed' : 'pointer' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                      </svg>
                      {createUserLoading ? (language === 'es' ? 'Creando/Vinculando...' : 'Creating/Linking...') : (language === 'es' ? 'Crear/Vincular Usuario' : 'Create/Link User')}
                    </button>
                    {createUserStatus && (
                      <div style={{ marginTop: '0.6rem', padding: '0.6rem 0.85rem', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 500,
                        backgroundColor: createUserStatus.type === 'success' ? '#f0fdf4' : createUserStatus.type === 'info' ? '#eff6ff' : '#fef2f2',
                        border: `1px solid ${createUserStatus.type === 'success' ? '#bbf7d0' : createUserStatus.type === 'info' ? '#bfdbfe' : '#fecaca'}`,
                        color: createUserStatus.type === 'success' ? '#15803d' : createUserStatus.type === 'info' ? '#1d4ed8' : '#dc2626' }}>
                        {createUserStatus.message}
                      </div>
                    )}
                  </div>
                )}

                {/* Modal footer */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem', paddingTop: '1.1rem', borderTop: '1px solid #e5e7eb' }}>
                  <button type="button" onClick={handleCancel}
                    style={{ padding: '0.6rem 1.4rem', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: '#374151' }}>
                    {language === 'es' ? 'Cancelar' : 'Cancel'}
                  </button>
                  <button type="submit" disabled={loading}
                    style={{ padding: '0.6rem 1.6rem', background: loading ? '#a5b4fc' : '#6c63ff', color: 'white', border: 'none', borderRadius: '7px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
                    {loading ? (language === 'es' ? 'Guardando...' : 'Saving...') : (language === 'es' ? 'Guardar Cambios' : 'Save Changes')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .checkbox-group {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          margin-top: 0.5rem;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          padding: 0.5rem 0.75rem;
          background: #f5f5f5;
          border-radius: 4px;
          transition: background 0.2s ease;
        }

        .checkbox-label:hover {
          background: #e8e8e8;
        }

        .checkbox-label input[type="checkbox"] {
          cursor: pointer;
          width: 18px;
          height: 18px;
        }

        .checkbox-label span {
          font-size: 0.95rem;
          color: #333;
        }

        .help-text {
          font-size: 0.85rem;
          color: #666;
          margin-top: 0.5rem;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
