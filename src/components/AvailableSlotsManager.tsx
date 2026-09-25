import type React from 'react';
import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useProfession } from '../contexts/ProfessionContext';
import { supabase } from '../lib/supabaseClient';
import { clearProfessionalSchedule, addAvailableSlot, fetchProfessionals } from '../lib/api';
import type { AvailableSlot, Professional } from '../types';

type ScheduleView = 'list' | 'add' | 'clear';

interface NewSlotState {
  professional_id: string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
}

type WeekdayField = keyof Pick<
  NewSlotState,
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
>;

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

export function AvailableSlotsManager() {
  const { t, language } = useLanguage();
  const { activeProfession } = useProfession();

  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState('');
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loadingProfessionals, setLoadingProfessionals] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [view, setView] = useState<ScheduleView>('list');
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editingSlot, setEditingSlot] = useState<NewSlotState | null>(null);
  const [newSlot, setNewSlot] = useState<NewSlotState>({
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
    sunday: 'N',
  });

  useEffect(() => {
    const loadProfessionals = async () => {
      setLoadingProfessionals(true);
      try {
        // Load ALL professionals, regardless of active profession, so
        // existing schedules are always visible in this maintenance view.
        const data = await fetchProfessionals();
        setProfessionals(data);
      } catch (error) {
        console.error('Error loading professionals for slots manager:', error);
        alert(
          language === 'es'
            ? 'Error al cargar profesionales'
            : 'Failed to load professionals'
        );
      } finally {
        setLoadingProfessionals(false);
      }
    };

    loadProfessionals();
  }, [language]);

  useEffect(() => {
    if (selectedProfessionalId) {
      loadSlots(selectedProfessionalId);
      setNewSlot((prev) => ({
        ...prev,
        professional_id: selectedProfessionalId,
      }));
    } else {
      setSlots([]);
      setNewSlot((prev) => ({
        ...prev,
        professional_id: '',
      }));
    }
  }, [selectedProfessionalId]);

  const loadSlots = async (professionalId: string) => {
    setLoadingSlots(true);
    try {
      const { data, error } = await supabase
        .from('available_slots')
        .select('*')
        .eq('professional_id', professionalId)
        .order('start_time', { ascending: true });

      if (error) throw error;
      const loadedSlots = data || [];
      setSlots(loadedSlots);
      // Clear any in-progress editing when reloading
      setEditingSlotId(null);
      setEditingSlot(null);
    } catch (error: unknown) {
      console.error('Error loading available slots:', error);
      const message = formatUnknownError(error);
      alert(
        language === 'es'
          ? `Error al cargar los espacios disponibles: ${message}`
          : `Failed to load available slots: ${message}`
      );
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleNewSlotChange = (field: keyof NewSlotState, value: string | boolean) => {
    if (field === 'is_booked') {
      setNewSlot((prev) => ({ ...prev, is_booked: Boolean(value) }));
      return;
    }
    setNewSlot((prev) => ({ ...prev, [field]: value }));
  };

  const toggleDay = (day: keyof Pick<NewSlotState, 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'>) => {
    setNewSlot((prev) => ({
      ...prev,
      [day]: prev[day] === 'Y' ? 'N' : 'Y',
    }));
  };

  const handleAddSlot = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    console.log('Submitting new available slot', newSlot);

    if (!newSlot.professional_id || !newSlot.start_time || !newSlot.end_time) {
      alert(
        language === 'es'
          ? 'Por favor complete todos los campos requeridos'
          : 'Please fill in all required fields'
      );
      return;
    }

    if (!newSlot.start_time.includes(':') || !newSlot.end_time.includes(':')) {
      alert(
        language === 'es'
          ? 'Por favor seleccione hora y minutos válidos'
          : 'Please select valid hours and minutes'
      );
      return;
    }

    const [startHour, startMin] = newSlot.start_time.split(':');
    const [endHour, endMin] = newSlot.end_time.split(':');

    if (!startHour || !startMin || !endHour || !endMin) {
      alert(
        language === 'es'
          ? 'Por favor seleccione hora y minutos válidos'
          : 'Please select valid hours and minutes'
      );
      return;
    }

    const startMinutes = parseInt(startHour, 10) * 60 + parseInt(startMin, 10);
    const endMinutes = parseInt(endHour, 10) * 60 + parseInt(endMin, 10);

    if (endMinutes <= startMinutes) {
      alert(
        language === 'es'
          ? 'La hora de finalización debe ser posterior a la hora de inicio'
          : 'End time must be after start time'
      );
      return;
    }

    try {
      await addAvailableSlot(newSlot);

      const currentProfessionalId = newSlot.professional_id;

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
        sunday: 'N',
      });

      alert(
        language === 'es'
          ? 'Espacio agregado exitosamente'
          : 'Slot added successfully'
      );

      if (currentProfessionalId) {
        loadSlots(currentProfessionalId);
      }
    } catch (error: unknown) {
      console.error('Error adding available slot:', error);
      const message = formatUnknownError(error);
      alert(
        language === 'es'
          ? `Error al agregar el espacio: ${message}`
          : `Error adding slot: ${message}`
      );
    }
  };

  const handleClearSchedule = async () => {
    if (!selectedProfessionalId) {
      alert(
        language === 'es'
          ? 'Por favor seleccione un profesional'
          : 'Please select a professional'
      );
      return;
    }

    const professional = professionals.find((p) => p.id === selectedProfessionalId);
    const confirmMessage =
      language === 'es'
        ? `¿Está seguro de que desea borrar todos los espacios disponibles (no reservados) para ${professional?.name_es || professional?.name_en}?`
        : `Are you sure you want to clear all available (non-booked) slots for ${professional?.name_en}?`;

    if (!confirm(confirmMessage)) return;

    try {
      await clearProfessionalSchedule(selectedProfessionalId);
      alert(
        language === 'es'
          ? 'Horario borrado exitosamente'
          : 'Schedule cleared successfully'
      );
      loadSlots(selectedProfessionalId);
    } catch (error) {
      console.error('Error clearing schedule:', error);
      alert(
        language === 'es'
          ? 'Error al borrar el horario'
          : 'Error clearing schedule'
      );
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    if (
      !confirm(
        language === 'es'
          ? '¿Eliminar este espacio?'
          : 'Delete this slot?'
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from('available_slots')
        .delete()
        .eq('id', slotId);

      if (error) throw error;

      alert(language === 'es' ? 'Espacio eliminado' : 'Slot deleted');
      if (selectedProfessionalId) {
        loadSlots(selectedProfessionalId);
      }
    } catch (error) {
      console.error('Error deleting slot:', error);
      alert(
        language === 'es'
          ? 'Error al eliminar el espacio'
          : 'Error deleting slot'
      );
    }
  };

  const toTimeInput = (value: string) => {
    if (!value) return '';
    if (!value.includes('T')) return value;
    const d = new Date(value);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const startEditSlot = (slot: AvailableSlot) => {
    if (editingSlotId === slot.id) {
      setEditingSlotId(null);
      setEditingSlot(null);
      return;
    }

    setEditingSlotId(slot.id);
    setEditingSlot({
      professional_id: slot.professional_id || selectedProfessionalId,
      start_time: toTimeInput(slot.start_time || ''),
      end_time: toTimeInput(slot.end_time || ''),
      is_booked: Boolean(slot.is_booked),
      monday: slot.monday || 'N',
      tuesday: slot.tuesday || 'N',
      wednesday: slot.wednesday || 'N',
      thursday: slot.thursday || 'N',
      friday: slot.friday || 'N',
      saturday: slot.saturday || 'N',
      sunday: slot.sunday || 'N',
    });
  };

  const handleEditingSlotChange = (field: keyof NewSlotState, value: string | boolean) => {
    if (!editingSlot) return;
    if (field === 'is_booked') {
      setEditingSlot((prev) =>
        prev ? { ...prev, is_booked: Boolean(value) } : prev
      );
      return;
    }
    setEditingSlot((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const toggleEditDay = (
    day: keyof Pick<
      NewSlotState,
      | 'monday'
      | 'tuesday'
      | 'wednesday'
      | 'thursday'
      | 'friday'
      | 'saturday'
      | 'sunday'
    >
  ) => {
    if (!editingSlot) return;
    setEditingSlot((prev) =>
      prev
        ? {
            ...prev,
            [day]: prev[day] === 'Y' ? 'N' : 'Y',
          }
        : prev
    );
  };

  const handleSaveEditedSlot = async () => {
    if (!editingSlotId || !editingSlot) return;

    if (!editingSlot.start_time || !editingSlot.end_time) {
      alert(
        language === 'es'
          ? 'Por favor complete todos los campos requeridos'
          : 'Please fill in all required fields'
      );
      return;
    }

    if (!editingSlot.start_time.includes(':') || !editingSlot.end_time.includes(':')) {
      alert(
        language === 'es'
          ? 'Por favor seleccione hora y minutos válidos'
          : 'Please select valid hours and minutes'
      );
      return;
    }

    const [startHour, startMin] = editingSlot.start_time.split(':');
    const [endHour, endMin] = editingSlot.end_time.split(':');

    if (!startHour || !startMin || !endHour || !endMin) {
      alert(
        language === 'es'
          ? 'Por favor seleccione hora y minutos válidos'
          : 'Please select valid hours and minutes'
      );
      return;
    }

    const startMinutes = parseInt(startHour, 10) * 60 + parseInt(startMin, 10);
    const endMinutes = parseInt(endHour, 10) * 60 + parseInt(endMin, 10);

    if (endMinutes <= startMinutes) {
      alert(
        language === 'es'
          ? 'La hora de finalización debe ser posterior a la hora de inicio'
          : 'End time must be after start time'
      );
      return;
    }

    try {
      const updatePayload: Partial<NewSlotState> = {
        start_time: editingSlot.start_time,
        end_time: editingSlot.end_time,
        monday: editingSlot.monday,
        tuesday: editingSlot.tuesday,
        wednesday: editingSlot.wednesday,
        thursday: editingSlot.thursday,
        friday: editingSlot.friday,
        saturday: editingSlot.saturday,
        sunday: editingSlot.sunday,
      };

      const { error } = await supabase
        .from('available_slots')
        .update(updatePayload)
        .eq('id', editingSlotId);

      if (error) throw error;

      alert(
        language === 'es'
          ? 'Espacio actualizado exitosamente'
          : 'Slot updated successfully'
      );
      if (selectedProfessionalId) {
        await loadSlots(selectedProfessionalId);
      }
      setEditingSlotId(null);
      setEditingSlot(null);
    } catch (error: unknown) {
      console.error('Error updating available slot:', error);
      const message = formatUnknownError(error);
      alert(
        language === 'es'
          ? `Error al actualizar el espacio: ${message}`
          : `Error updating slot: ${message}`
      );
    }
  };

  const formatTimeRange = (slot: AvailableSlot) => {
    // In this admin view, start_time/end_time may be stored as plain "HH:MM" or full ISO.
    const parse = (value: string) => {
      if (!value) return '';
      if (value.includes('T')) {
        return new Date(value).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
      }
      return value;
    };

    return `${parse(slot.start_time)} - ${parse(slot.end_time)}`;
  };

  const dayLabels: { key: WeekdayField; labelEn: string; labelEs: string }[] = [
    { key: 'monday', labelEn: 'Mon', labelEs: 'Lun' },
    { key: 'tuesday', labelEn: 'Tue', labelEs: 'Mar' },
    { key: 'wednesday', labelEn: 'Wed', labelEs: 'Mié' },
    { key: 'thursday', labelEn: 'Thu', labelEs: 'Jue' },
    { key: 'friday', labelEn: 'Fri', labelEs: 'Vie' },
    { key: 'saturday', labelEn: 'Sat', labelEs: 'Sáb' },
    { key: 'sunday', labelEn: 'Sun', labelEs: 'Dom' },
  ];

  return (
    <section className="section">
      <h3>
        {language === 'es' ? 'Horarios Disponibles por Profesional' : 'Available Slots by Professional'}
      </h3>
      {activeProfession && (
        <p className="section-subtitle">
          {language === 'es'
            ? `Profesión activa: ${activeProfession.name_es}`
            : `Active profession: ${activeProfession.name_en}`}
        </p>
      )}

      <div className="browser-controls" style={{ marginBottom: '1rem' }}>
        <div className="control-group">
          <label htmlFor="slots-professional-select">
            {language === 'es' ? 'Seleccionar profesional' : 'Select professional'}
          </label>
          <select
            id="slots-professional-select"
            value={selectedProfessionalId}
            onChange={(e) => setSelectedProfessionalId(e.target.value)}
            className="filter-select"
            disabled={loadingProfessionals}
          >
            <option value="">
              {language === 'es' ? 'Elija un profesional' : 'Choose a professional'}
            </option>
            {professionals.map((prof) => (
              <option key={prof.id} value={prof.id}>
                {language === 'es' ? prof.name_es : prof.name_en}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group" style={{ alignSelf: 'flex-end' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`tab-button ${view === 'list' ? 'active' : ''}`}
              onClick={() => setView('list')}
              disabled={!selectedProfessionalId}
            >
              {language === 'es' ? 'Ver espacios' : 'View slots'}
            </button>
            <button
              type="button"
              className={`tab-button ${view === 'add' ? 'active' : ''}`}
              onClick={() => setView('add')}
              disabled={!selectedProfessionalId}
            >
              {language === 'es' ? 'Agregar espacio' : 'Add slot'}
            </button>
            <button
              type="button"
              className={`tab-button ${view === 'clear' ? 'active' : ''}`}
              onClick={() => setView('clear')}
              disabled={!selectedProfessionalId}
            >
              {language === 'es' ? 'Borrar horario' : 'Clear schedule'}
            </button>
          </div>
        </div>
      </div>

      {!selectedProfessionalId && (
        <p style={{ color: '#666', marginTop: '0.5rem' }}>
          {language === 'es'
            ? 'Seleccione un profesional para gestionar sus horarios disponibles.'
            : 'Select a professional to manage their available schedule.'}
        </p>
      )}

      {selectedProfessionalId && view === 'list' && (
        <div className="data-table-container">
          {loadingSlots ? (
            <div className="loading">
              {t('loading')}
            </div>
          ) : slots.length === 0 ? (
            <div className="no-data">
              <p>
                {language === 'es'
                  ? 'No hay espacios configurados para este profesional.'
                  : 'No slots configured for this professional.'}
              </p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{language === 'es' ? 'Editar' : 'Edit'}</th>
                  <th>{language === 'es' ? 'Acciones' : 'Actions'}</th>
                  <th>{language === 'es' ? 'Horario' : 'Time range'}</th>
                  <th>{language === 'es' ? 'Reservado' : 'Booked'}</th>
                  <th>{language === 'es' ? 'Días activos' : 'Active days'}</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => {
                  const isEditing = editingSlotId === slot.id;
                  const activeDays = dayLabels
                    .filter((d) => slot[d.key] === 'Y')
                    .map((d) => (language === 'es' ? d.labelEs : d.labelEn))
                    .join(', ');

                  return (
                    <tr key={slot.id}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isEditing}
                          onChange={() => startEditSlot(slot)}
                          aria-label={
                            language === 'es'
                              ? 'Editar este espacio'
                              : 'Edit this slot'
                          }
                        />
                      </td>
                      <td className="actions-cell">
                        {isEditing ? (
                          <div className="action-buttons">
                            <button
                              type="button"
                              className="save-btn"
                              onClick={handleSaveEditedSlot}
                              title={language === 'es' ? 'Guardar cambios' : 'Save changes'}
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              className="cancel-btn"
                              onClick={() => {
                                setEditingSlotId(null);
                                setEditingSlot(null);
                              }}
                              title={language === 'es' ? 'Cancelar' : 'Cancel'}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="delete-btn-small"
                            onClick={() => handleDeleteSlot(slot.id)}
                            title={language === 'es' ? 'Eliminar espacio' : 'Delete slot'}
                          >
                            🗑
                          </button>
                        )}
                      </td>
                      <td>
                        {isEditing && editingSlot ? (
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input
                              type="time"
                              value={editingSlot.start_time}
                              onChange={(e) =>
                                handleEditingSlotChange('start_time', e.target.value)
                              }
                            />
                            <span>–</span>
                            <input
                              type="time"
                              value={editingSlot.end_time}
                              onChange={(e) =>
                                handleEditingSlotChange('end_time', e.target.value)
                              }
                            />
                          </div>
                        ) : (
                          formatTimeRange(slot)
                        )}
                      </td>
                      <td>
                        {slot.is_booked
                          ? language === 'es'
                            ? 'Sí'
                            : 'Yes'
                          : language === 'es'
                            ? 'No'
                            : 'No'}
                      </td>
                      <td>
                        {isEditing && editingSlot ? (
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '0.5rem',
                            }}
                          >
                            {dayLabels.map((day) => (
                              <label
                                key={day.key}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  fontSize: '0.85rem',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={editingSlot[day.key] === 'Y'}
                                  onChange={() => toggleEditDay(day.key)}
                                />
                                <span>{language === 'es' ? day.labelEs : day.labelEn}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          activeDays || '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {selectedProfessionalId && view === 'add' && (
        <form onSubmit={handleAddSlot} className="slot-form">
          <div className="form-row">
            <div className="form-group">
              <label>
                {language === 'es' ? 'Hora de inicio' : 'Start time'} <span className="required">*</span>
              </label>
              <input
                type="time"
                value={newSlot.start_time}
                onChange={(e) => handleNewSlotChange('start_time', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>
                {language === 'es' ? 'Hora de finalización' : 'End time'} <span className="required">*</span>
              </label>
              <input
                type="time"
                value={newSlot.end_time}
                onChange={(e) => handleNewSlotChange('end_time', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>{language === 'es' ? 'Días de la semana' : 'Days of week'}</label>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.75rem',
                marginTop: '0.5rem',
              }}
            >
              {dayLabels.map((day) => (
                <label
                  key={day.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    minWidth: '70px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newSlot[day.key] === 'Y'}
                    onChange={() => toggleDay(day.key)}
                  />
                  <span>{language === 'es' ? day.labelEs : day.labelEn}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <button type="submit" className="submit-button">
              {language === 'es' ? 'Guardar espacio' : 'Save slot'}
            </button>
          </div>
        </form>
      )}

      {selectedProfessionalId && view === 'clear' && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ marginBottom: '1rem', color: '#b91c1c' }}>
            {language === 'es'
              ? 'Esto eliminará todos los espacios NO reservados para este profesional. Las citas ya reservadas no se verán afectadas.'
              : 'This will delete all NON-booked slots for this professional. Existing booked appointments will not be affected.'}
          </p>
          <button
            type="button"
            className="delete-btn"
            onClick={handleClearSchedule}
          >
            {language === 'es' ? 'Borrar todos los espacios no reservados' : 'Clear all non-booked slots'}
          </button>
        </div>
      )}
    </section>
  );
}

