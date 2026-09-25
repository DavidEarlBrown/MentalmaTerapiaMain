import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { fetchProfessions } from '../lib/api';
import { useProfession } from '../contexts/ProfessionContext';
import type { AdminTableRow, Profession } from '../types';

interface DataBrowserProps {
  onFetchRows: (tableName: string, userFilter?: string) => void;
  onUpdateRow: (tableName: string, rowId: string, data: Record<string, unknown>) => void;
  onDeleteRow: (tableName: string, rowId: string) => void;
  onInsertRow: (tableName: string, data: Record<string, unknown>) => void;
  rows: AdminTableRow[];
  loading: boolean;
  defaultTable?: string;
}

interface TableConfig {
  name: string;
  labelKey: string;
  supportsUserFilter: boolean;
}

export function DataBrowser({ onFetchRows, onUpdateRow, onDeleteRow, onInsertRow, rows, loading, defaultTable = 'users' }: DataBrowserProps) {
  const { t, language } = useLanguage();
  const { activeProfession } = useProfession();
  const [selectedTable, setSelectedTable] = useState(defaultTable);
  const [userFilter, setUserFilter] = useState('');
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isInserting, setIsInserting] = useState(false);
  const [insertData, setInsertData] = useState<Record<string, unknown>>({});
  const [professions, setProfessions] = useState<Profession[]>([]);

  useEffect(() => {
    fetchProfessions().then(setProfessions).catch(() => setProfessions([]));
  }, []);

  const handleCancel = useCallback(() => {
    setEditingRow(null);
    setEditData({});
  }, []);

  const handleCancelInsert = useCallback(() => {
    setIsInserting(false);
    setInsertData({});
  }, []);

  useEffect(() => {
    if (editingRow === null && !isInserting && deleteConfirm === null) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editingRow !== null) {
        e.preventDefault();
        handleCancel();
      } else if (isInserting) {
        e.preventDefault();
        handleCancelInsert();
      } else if (deleteConfirm !== null) {
        e.preventDefault();
        setDeleteConfirm(null);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [editingRow, isInserting, deleteConfirm, handleCancel, handleCancelInsert]);

  const tableSchemas: Record<string, string[]> = {
    questionnaire_results: ['user_id', 'content_type', 'content', 'language'],
    available_slots: ['professional_id', 'start_time', 'end_time', 'is_booked'],
    client_requests: ['user_id', 'username', 'full_name', 'client_name', 'client_email', 'client_phone', 'issue', 'preferred_date', 'preferred_time', 'time_zone', 'session_length', 'professional_id', 'specialty_id', 'counseling_type_id', 'status', 'notes', 'session_price_id', 'price_amount', 'price_currency', 'num_sessions', 'session_no', 'meeting_uri', 'meeting_code', 'meeting_platform', 'calendar_event_id', 'TimeSlotId'],
    ConsultLog: ['session_id', 'action_type', 'reason', 'old_session_date', 'new_session_date', 'performed_by', 'additional_notes', 'UserId'],
    counseling_types: ['name_en', 'name_es', 'description_en', 'description_es', 'is_active', 'profession_id'],
    payment_transactions: ['client_name', 'client_email', 'client_phone', 'session_price_id', 'num_sessions', 'payment_amount', 'payment_currency', 'payment_method', 'payment_status', 'transaction_reference', 'notes', 'professional_id', 'client_request_id', 'payment_date', 'pse_type', 'user_type', 'user_legal_id_type', 'user_legal_id', 'financial_institution_code', 'payment_description', 'wompi_type', 'wompi_token', 'installments'],
    problems: ['problem_abrev', 'problem_desc', 'status', 'profession', 'problem_abrev_es', 'problem_desc_es', 'profession_id'],
    professions: ['name_en', 'name_es', 'description_en', 'description_es', 'is_active'],
    professionals: ['name_en', 'name_es', 'bio_en', 'bio_es', 'photo_url', 'is_active', 'time_zone', 'PrimaryLanguage', 'SecondaryLanguages', 'Título', 'Clasificación', 'email', 'profession', 'profession_id'],
    resumes: ['user_id', 'professional_name', 'email', 'phone', 'specialties', 'experience', 'education', 'status'],
    sessionPrices: ['Price', 'Name', 'NumSessions', 'Descriptions', 'Currency', 'professional_id'],
    std_questionnaires: ['id', 'name', 'description', 'questionnaire_data_en', 'questionnaire_data_es', 'storage_location', 'active', 'client_avail'],
    sessions: ['user_id', 'username', 'full_name', 'client_name', 'client_email', 'professional_id', 'session_date', 'duration_minutes', 'session_length', 'amount', 'currency', 'payment_status', 'status', 'notes', 'TimeSlotId', 'PriceCharged', 'TotalAmtCharged', 'online_platform'],
    specialties: ['name_en', 'name_es', 'description_en', 'description_es', 'icon', 'is_active', 'profession_id'],
    users: ['username', 'email', 'full_name', 'phone', 'role', 'user_type', 'is_active'],
  };

  const getFieldsForTable = () => {
    if (rows.length > 0) return getEditableFields(rows[0]);
    return tableSchemas[selectedTable] || [];
  };

  const tables: TableConfig[] = [
    { name: 'questionnaire_results', labelKey: 'questionnaireResultsTable', supportsUserFilter: false },
    { name: 'available_slots', labelKey: 'availableSlotsTable', supportsUserFilter: false },
    { name: 'client_requests', labelKey: 'clientRequestsTable', supportsUserFilter: true },
    { name: 'ConsultLog', labelKey: 'consultLogTable', supportsUserFilter: false },
    { name: 'counseling_types', labelKey: 'counselingTypesTable', supportsUserFilter: false },
    { name: 'payment_transactions', labelKey: 'paymentTransactionsTable', supportsUserFilter: true },
    { name: 'problems', labelKey: 'problemsTable', supportsUserFilter: false },
    { name: 'professions', labelKey: 'professionsTable', supportsUserFilter: false },
    { name: 'professionals', labelKey: 'professionalsTable', supportsUserFilter: false },
    { name: 'resumes', labelKey: 'resumesTable', supportsUserFilter: true },
    { name: 'sessionPrices', labelKey: 'sessionPricesTable', supportsUserFilter: false },
    { name: 'std_questionnaires', labelKey: 'standardQuestionnairesTable', supportsUserFilter: false },
    { name: 'sessions', labelKey: 'sessionsTable', supportsUserFilter: true },
    { name: 'specialties', labelKey: 'specialtiesTable', supportsUserFilter: false },
    { name: 'users', labelKey: 'usersTable', supportsUserFilter: true },
  ];

  useEffect(() => {
    handleFetch();
  }, [selectedTable]);

  const handleFetch = () => {
    const filter = userFilter.trim() || undefined;
    onFetchRows(selectedTable, filter);
  };

  const handleTableChange = (tableName: string) => {
    setSelectedTable(tableName);
    setUserFilter('');
    setEditingRow(null);
    setDeleteConfirm(null);
    setIsInserting(false);
    setInsertData({});
  };

  const handleEdit = (row: AdminTableRow) => {
    setEditingRow(String(row.id));
    setEditData({ ...row });
  };

  const handleSave = (rowId: string) => {
    onUpdateRow(selectedTable, rowId, editData);
    setEditingRow(null);
    setEditData({});
  };

  const handleDelete = (rowId: string) => {
    onDeleteRow(selectedTable, rowId);
    setDeleteConfirm(null);
  };

  const tablesWithProfession = ['professionals', 'specialties', 'counseling_types', 'problems'];

  const handleFieldChange = (field: string, value: unknown) => {
    setEditData({ ...editData, [field]: value });
  };

  const handleStartInsert = () => {
    setIsInserting(true);
    setEditingRow(null);
    setDeleteConfirm(null);
    const fields = getFieldsForTable();
    const initialData: Record<string, unknown> = {};
    fields.forEach(field => {
      initialData[field] = '';
    });
    if (
      tablesWithProfession.includes(selectedTable) &&
      activeProfession?.id
    ) {
      initialData.profession_id = activeProfession.id;
    }
    setInsertData(initialData);
  };

  const handleInsertFieldChange = (field: string, value: unknown) => {
    setInsertData({ ...insertData, [field]: value });
  };

  const handleInsert = async () => {
    try {
      const cleanData = { ...insertData };
      Object.keys(cleanData).forEach(key => {
        if (cleanData[key] === '') {
          delete cleanData[key];
        }
      });
      console.log('DataBrowser: Submitting insert for table:', selectedTable, 'data:', cleanData);
      await onInsertRow(selectedTable, cleanData);
      setIsInserting(false);
      setInsertData({});
    } catch (error) {
      console.error('DataBrowser: Error during insert:', error);
      setIsInserting(false);
    }
  };

  const isProfessionField = (field: string) =>
    field === 'profession_id' && tablesWithProfession.includes(selectedTable);

  const getProfessionName = (id: string | null | undefined) => {
    if (!id) return '—';
    const prof = professions.find(p => p.id === id);
    if (!prof) return id;
    return language === 'es' ? prof.name_es : prof.name_en;
  };

  const isWideField = (field: string) => {
    const f = field.toLowerCase();
    return f.includes('email') || f.includes('url') || f.includes('link') || f.includes('questionnaire_data');
  };

  const getFieldValue = (row: Record<string, unknown>, field: string) => {
    const value = row[field];
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const getEditableFields = (row: Record<string, unknown>) => {
    const excluded = ['id', 'created_at', 'updated_at'];
    return Object.keys(row).filter(key => !excluded.includes(key));
  };

  const formatFieldName = (field: string) => {
    return field
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const currentTable = tables.find(t => t.name === selectedTable);

  const sortedRows = [...rows].sort((a, b) => {
    if (rows.length === 0) return 0;

    const firstField = getEditableFields(rows[0])[0];
    if (!firstField) return 0;

    const aValue = String(a[firstField] || '').toLowerCase();
    const bValue = String(b[firstField] || '').toLowerCase();

    return aValue.localeCompare(bValue);
  });

  const displayRows = (tablesWithProfession.includes(selectedTable) && activeProfession)
    ? sortedRows.filter(row => row.profession_id === activeProfession.id)
    : sortedRows;

  return (
    <section className="section data-browser">
      <h2>{t('dataBrowser')}</h2>
      <p className="section-subtitle">{t('dataBrowserDescription')}</p>

      <div className="browser-controls">
        <div className="control-group">
          <label htmlFor="table-select">{t('selectTable')}</label>
          <select
            id="table-select"
            value={selectedTable}
            onChange={(e) => handleTableChange(e.target.value)}
            className="filter-select"
          >
            {tables.map((table) => (
              <option key={table.name} value={table.name}>
                {t(table.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {currentTable?.supportsUserFilter && (
          <div className="control-group">
            <label htmlFor="user-filter">{t('filterByUser')}</label>
            <div className="filter-input-group">
              <input
                type="text"
                id="user-filter"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                placeholder={t('userFilterPlaceholder')}
                className="filter-input"
                onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
              />
              <button onClick={handleFetch} className="filter-button">
                {t('search')}
              </button>
            </div>
          </div>
        )}

        <div className="control-group">
          <button
            onClick={handleStartInsert}
            className="filter-button"
            disabled={isInserting || getFieldsForTable().length === 0}
            style={{ marginTop: currentTable?.supportsUserFilter ? '0' : '1.5rem' }}
          >
            {t('addRecord') || '+ Add Record'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">{t('loading')}</div>
      ) : displayRows.length === 0 && !isInserting ? (
        <div className="no-data">
          <p>{t('noDataFound')}</p>
        </div>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('actions')}</th>
                {getFieldsForTable().map((field) => (
                  <th key={field}>{formatFieldName(field)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isInserting && (
                <tr style={{ backgroundColor: '#f0f8ff' }}>
                  <td className="actions-cell">
                    <div className="action-buttons" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.35rem' }}>
                      <button
                        type="button"
                        onClick={handleInsert}
                        className="save-btn"
                        title={t('save')}
                      >
                        ✓ {t('save')}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelInsert}
                        className="cancel-btn"
                        title={`${t('discardChanges')} (Esc)`}
                      >
                        {t('discardChanges')}
                      </button>
                    </div>
                  </td>
                  {getFieldsForTable().map((field) => (
                    <td key={field} style={isWideField(field) ? { minWidth: '280px' } : undefined}>
                      {isProfessionField(field) ? (
                        <select
                          value={String(insertData[field] ?? '')}
                          onChange={(e) => handleInsertFieldChange(field, e.target.value)}
                          className="edit-input"
                        >
                          <option value="">— None —</option>
                          {professions.filter(p => p.is_active).map(p => (
                            <option key={p.id} value={p.id}>
                              {language === 'es' ? p.name_es : p.name_en}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={String(insertData[field] ?? '')}
                          onChange={(e) => handleInsertFieldChange(field, e.target.value)}
                          className={`edit-input${isWideField(field) ? ' edit-input-wide' : ''}`}
                          placeholder={formatFieldName(field)}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              )}
              {displayRows.map((row) => (
                               <tr key={String(row.id)}>
                  <td className="actions-cell">
                    {editingRow === String(row.id) ? (
                      <div className="action-buttons" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.35rem' }}>
                        <button
                          type="button"
                          onClick={() => handleSave(String(row.id))}
                          className="save-btn"
                          title={t('save')}
                        >
                          ✓ {t('save')}
                        </button>
                        <button
                          type="button"
                          onClick={handleCancel}
                          className="cancel-btn"
                          title={`${t('discardChanges')} (Esc)`}
                        >
                          {t('discardChanges')}
                        </button>
                      </div>
                    ) : deleteConfirm === String(row.id) ? (
                      <div className="action-buttons">
                        <button
                          type="button"
                          onClick={() => handleDelete(String(row.id))}
                          className="confirm-delete-btn"
                          title={t('confirmDeleteAction')}
                        >
                          {t('confirmShort')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(null)}
                          className="cancel-btn"
                          title={`${t('cancel')} (Esc)`}
                        >
                          {t('cancel')}
                        </button>
                      </div>
                    ) : (
                      <div className="action-buttons">
                        <button
                          type="button"
                          onClick={() => handleEdit(row)}
                          className="edit-btn"
                          title={t('edit')}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(String(row.id))}
                          className="delete-btn-small"
                          title={t('delete')}
                        >
                          🗑
                        </button>
                      </div>
                    )}
                  </td>
                  {getEditableFields(row).map((field) => (
                    <td key={field} style={isWideField(field) ? { minWidth: '280px' } : undefined}>
                      {editingRow === String(row.id) ? (
                        isProfessionField(field) ? (
                          <select
                            value={getFieldValue(editData, field)}
                            onChange={(e) => handleFieldChange(field, e.target.value || null)}
                            className="edit-input"
                          >
                            <option value="">— None —</option>
                            {professions.filter(p => p.is_active).map(p => (
                              <option key={p.id} value={p.id}>
                                {language === 'es' ? p.name_es : p.name_en}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={getFieldValue(editData, field)}
                            onChange={(e) => handleFieldChange(field, e.target.value)}
                            className={`edit-input${isWideField(field) ? ' edit-input-wide' : ''}`}
                          />
                        )
                      ) : (
                        isProfessionField(field) ? (
                          <span className="cell-content" title={getFieldValue(row, field) || undefined}>
                            {getProfessionName(row[field] as string | null | undefined)}
                          </span>
                        ) : (
                          <span className={`cell-content${isWideField(field) ? ' cell-content-wide' : ''}`}>{getFieldValue(row, field)}</span>
                        )
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
