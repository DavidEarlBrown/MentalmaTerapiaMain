import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { DataBrowser } from './DataBrowser';
import { ApplicationManager } from './ApplicationManager';
import { SessionPriceManager } from './SessionPriceManager';
import { ProfessionalManager } from './ProfessionalManager';
import { AvailableSlotsManager } from './AvailableSlotsManager';
import { ProfessionManager } from './ProfessionManager';
import { UserRoleManager } from './UserRoleModal';
import { StdQuestionnairesManager } from './StdQuestionnairesManager';
import type { AdminTableRow, Resume, SessionPrice } from '../types';

interface AdminPanelProps {
  onFetchRows: (tableName: string, userFilter?: string) => void;
  onUpdateRow: (tableName: string, rowId: string, data: Record<string, unknown>) => void;
  onDeleteRow: (tableName: string, rowId: string) => void;
  onInsertRow: (tableName: string, data: Record<string, unknown>) => void;
  initialTab?: 'data-browser' | 'resumes' | 'prices' | 'professionals' | 'available-slots' | 'professions' | 'user-roles' | 'std-questionnaires';
  rows: AdminTableRow[];
  loadingRows: boolean;
  resumes?: Resume[];
  onFetchResumes?: () => void;
  onDeleteResume?: (id: number) => void;
  onCreateResume?: (resume: Record<string, unknown>) => void;
  onUpdateResume?: (id: number, resume: Record<string, unknown>) => void;
  onApproveResume?: (resume: Resume) => void;
  sessionPrices: SessionPrice[];
  onFetchSessionPrices: () => void;
  onCreateSessionPrice: (price: Omit<SessionPrice, 'id' | 'created_at'>) => void;
  onUpdateSessionPrice: (id: number, price: Partial<SessionPrice>) => void;
  onDeleteSessionPrice: (id: number) => void;
  onProfessionalsSaved?: () => void;
}

export function AdminPanel({
  onFetchRows,
  onUpdateRow,
  onDeleteRow,
  onInsertRow,
  rows,
  loadingRows,
  sessionPrices,
  onFetchSessionPrices,
  onCreateSessionPrice,
  onUpdateSessionPrice,
  onDeleteSessionPrice,
  initialTab,
  onProfessionalsSaved,
}: AdminPanelProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<
    'data-browser' | 'resumes' | 'prices' | 'professionals' | 'available-slots' | 'professions' | 'user-roles' | 'std-questionnaires'
  >(initialTab ?? 'data-browser');

  return (
    <section className="section admin-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>{t('adminPanel')}</h2>
      </div>
      <p className="section-subtitle">{t('adminPanelDescription')}</p>

      <div className="admin-tabs">
        <button
          className={`tab-button ${activeTab === 'data-browser' ? 'active' : ''}`}
          onClick={() => setActiveTab('data-browser')}
        >
          {t('dataBrowser')}
        </button>
        <button
          className={`tab-button ${activeTab === 'resumes' ? 'active' : ''}`}
          onClick={() => setActiveTab('resumes')}
        >
          {t('language') === 'es' ? 'Revisar Solicitudes' : 'Review Applications'}
        </button>
        <button
          className={`tab-button ${activeTab === 'prices' ? 'active' : ''}`}
          onClick={() => setActiveTab('prices')}
        >
          {t('sessionPrices') || 'Session Prices'}
        </button>
        <button
          className={`tab-button ${activeTab === 'professionals' ? 'active' : ''}`}
          onClick={() => setActiveTab('professionals')}
        >
          {t('professionals') || 'Professionals'}
        </button>
        <button
          className={`tab-button ${activeTab === 'available-slots' ? 'active' : ''}`}
          onClick={() => setActiveTab('available-slots')}
        >
          {t('availableSlotsTable') || 'Available Slots'}
        </button>
        <button
          className={`tab-button ${activeTab === 'professions' ? 'active' : ''}`}
          onClick={() => setActiveTab('professions')}
        >
          Profession Categories
        </button>
        <button
          className={`tab-button ${activeTab === 'user-roles' ? 'active' : ''}`}
          onClick={() => setActiveTab('user-roles')}
        >
          Manage User Roles
        </button>
        <button
          className={`tab-button ${activeTab === 'std-questionnaires' ? 'active' : ''}`}
          onClick={() => setActiveTab('std-questionnaires')}
        >
          {t('language') === 'es' ? 'Cuestionarios estándar' : 'Std Questionnaires'}
        </button>
      </div>

      {activeTab === 'data-browser' && (
        <DataBrowser
          onFetchRows={onFetchRows}
          onUpdateRow={onUpdateRow}
          onDeleteRow={onDeleteRow}
          onInsertRow={onInsertRow}
          rows={rows}
          loading={loadingRows}
        />
      )}

      {activeTab === 'resumes' && (
        <ApplicationManager />
      )}

      {activeTab === 'prices' && (
        <SessionPriceManager
          onFetchPrices={onFetchSessionPrices}
          onCreatePrice={onCreateSessionPrice}
          onUpdatePrice={onUpdateSessionPrice}
          onDeletePrice={onDeleteSessionPrice}
          prices={sessionPrices}
          loading={loadingRows}
        />
      )}

      {activeTab === 'professionals' && (
        <ProfessionalManager isAdmin={true} onSuccess={onProfessionalsSaved} />
      )}

      {activeTab === 'available-slots' && (
        <AvailableSlotsManager />
      )}

      {activeTab === 'professions' && (
        <ProfessionManager />
      )}

      {activeTab === 'user-roles' && (
        <UserRoleManager />
      )}

      {activeTab === 'std-questionnaires' && (
        <StdQuestionnairesManager />
      )}
    </section>
  );
}
