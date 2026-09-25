import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import type { Resume } from '../types';

interface ResumeManagerProps {
  onFetchResumes: () => void;
  resumes: Resume[];
  loading: boolean;
  onDeleteResume: (id: number) => void;
  onCreateResume: (resume: Partial<Resume>) => void;
  onUpdateResume: (id: number, resume: Partial<Resume>) => void;
  onApproveResume: (resume: Resume) => void;
}

export function ResumeManager({
  onFetchResumes,
  resumes,
  loading,
  onDeleteResume,
  onCreateResume,
  onUpdateResume,
  onApproveResume
}: ResumeManagerProps) {
  const { t } = useLanguage();
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [formData, setFormData] = useState<Partial<Resume>>({
    Name: '',
    Country: '',
    Language: [],
    'TypeThera;y': [],
    ReasonForInterest: [],
    AppStatus: 'Pending'
  });

  useEffect(() => {
    onFetchResumes();
  }, []);

  useEffect(() => {
    if (selectedResume) {
      setFormData({
        Name: selectedResume.Name || '',
        Country: selectedResume.Country || '',
        Language: selectedResume.Language || [],
        'TypeThera;y': selectedResume['TypeThera;y'] || [],
        ReasonForInterest: selectedResume.ReasonForInterest || [],
        AppStatus: selectedResume.AppStatus || 'Pending'
      });
      setIsCreatingNew(false);
    }
  }, [selectedResume]);

  const handleAddNew = () => {
    setSelectedResume(null);
    setIsCreatingNew(true);
    setFormData({
      Name: '',
      Country: '',
      Language: [],
      'TypeThera;y': [],
      ReasonForInterest: [],
      AppStatus: 'Pending'
    });
  };

  const handleApprove = (resume: Resume) => {
    if (confirm(`Approve ${resume.Name} and add to professionals list?`)) {
      onApproveResume(resume);
      setSelectedResume(null);
      setIsCreatingNew(false);
    }
  };

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Delete resume for ${name}?`)) {
      onDeleteResume(id);
      if (selectedResume?.id === id) {
        setSelectedResume(null);
        setIsCreatingNew(false);
      }
    }
  };

  const handleSave = () => {
    if (isCreatingNew) {
      onCreateResume(formData);
      setIsCreatingNew(false);
      setFormData({
        Name: '',
        Country: '',
        Language: [],
        'TypeThera;y': [],
        ReasonForInterest: [],
        AppStatus: 'Pending'
      });
    } else if (selectedResume) {
      onUpdateResume(selectedResume.id, formData);
    }
  };

  const handleArrayChange = (field: 'Language' | 'TypeThera;y' | 'ReasonForInterest', value: string) => {
    const items = value.split(',').map(item => item.trim()).filter(item => item !== '');
    setFormData(prev => ({ ...prev, [field]: items }));
  };

  return (
    <div className="resume-manager">
      <div className="resume-manager-header">
        <div>
          <h3>{t('resumeManagement') || 'Resume Management'}</h3>
          <p className="section-subtitle">
            {t('resumeManagementDescription') || 'View and manage submitted resumes'}
          </p>
        </div>
        <button className="btn-add-new" onClick={handleAddNew}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
          {t('addNewResume') || 'Add New Resume'}
        </button>
      </div>

      <div className="resume-layout">
        <div className="resume-list-panel">
          <h4>{t('allResumes') || 'All Resumes'} ({resumes.length})</h4>

          {loading ? (
            <p>{t('loading')}</p>
          ) : resumes.length === 0 ? (
            <p>{t('noResumes') || 'No resumes submitted yet'}</p>
          ) : (
            <div className="resume-table">
              <table>
                <thead>
                  <tr>
                    <th>{t('name') || 'Name'}</th>
                    <th>{t('country') || 'Country'}</th>
                    <th>{t('status') || 'Status'}</th>
                    <th>{t('date') || 'Date'}</th>
                    <th>{t('actions') || 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {resumes.map((resume) => (
                    <tr
                      key={resume.id}
                      className={selectedResume?.id === resume.id ? 'selected' : ''}
                      onClick={() => setSelectedResume(resume)}
                    >
                      <td><strong>{resume.Name}</strong></td>
                      <td>{resume.Country}</td>
                      <td>
                        <span className={`status-badge ${resume.AppStatus?.toLowerCase()}`}>
                          {resume.AppStatus || 'Pending'}
                        </span>
                      </td>
                      <td>{new Date(resume.created_at).toLocaleDateString()}</td>
                      <td className="actions-cell">
                        <button
                          className="btn-icon btn-approve"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApprove(resume);
                          }}
                          title={t('approve') || 'Approve'}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                          </svg>
                        </button>
                        <button
                          className="btn-icon btn-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(resume.id, resume.Name);
                          }}
                          title={t('delete') || 'Delete'}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {(selectedResume || isCreatingNew) && (
          <div className="resume-detail-frame">
            <div className="frame-header">
              <h4>
                {isCreatingNew
                  ? (t('createNewResume') || 'Create New Resume')
                  : (t('editResume') || 'Edit Resume')}
              </h4>
              <button
                className="btn-close"
                onClick={() => {
                  setSelectedResume(null);
                  setIsCreatingNew(false);
                }}
              >
                ×
              </button>
            </div>

            <div className="frame-content">
              <div className="form-group">
                <label htmlFor="name">{t('name') || 'Name'}</label>
                <input
                  id="name"
                  type="text"
                  value={formData.Name}
                  onChange={(e) => setFormData(prev => ({ ...prev, Name: e.target.value }))}
                  placeholder="Enter full name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="country">{t('country') || 'Country'}</label>
                <input
                  id="country"
                  type="text"
                  value={formData.Country}
                  onChange={(e) => setFormData(prev => ({ ...prev, Country: e.target.value }))}
                  placeholder="Enter country"
                />
              </div>

              <div className="form-group">
                <label htmlFor="language">{t('languages') || 'Languages'}</label>
                <input
                  id="language"
                  type="text"
                  value={formData.Language?.join(', ')}
                  onChange={(e) => handleArrayChange('Language', e.target.value)}
                  placeholder="Enter languages separated by commas"
                />
                <small>Separate multiple values with commas</small>
              </div>

              <div className="form-group">
                <label htmlFor="therapy">{t('therapyTypes') || 'Therapy Types'}</label>
                <input
                  id="therapy"
                  type="text"
                  value={formData['TypeThera;y']?.join(', ')}
                  onChange={(e) => handleArrayChange('TypeThera;y', e.target.value)}
                  placeholder="Enter therapy types separated by commas"
                />
                <small>Separate multiple values with commas</small>
              </div>

              <div className="form-group">
                <label htmlFor="reason">{t('reasonForInterest') || 'Reason for Interest'}</label>
                <input
                  id="reason"
                  type="text"
                  value={formData.ReasonForInterest?.join(', ')}
                  onChange={(e) => handleArrayChange('ReasonForInterest', e.target.value)}
                  placeholder="Enter reasons separated by commas"
                />
                <small>Separate multiple values with commas</small>
              </div>

              <div className="form-group">
                <label htmlFor="status">{t('status') || 'Application Status'}</label>
                <select
                  id="status"
                  value={formData.AppStatus}
                  onChange={(e) => setFormData(prev => ({ ...prev, AppStatus: e.target.value }))}
                >
                  <option value="Pending">Pending</option>
                  <option value="Reviewed">Reviewed</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>

              {!isCreatingNew && selectedResume && (
                <div className="form-group">
                  <label>{t('submittedOn') || 'Submitted On'}</label>
                  <input
                    type="text"
                    value={new Date(selectedResume.created_at).toLocaleString()}
                    disabled
                  />
                </div>
              )}
            </div>

            <div className="frame-actions">
              <button className="btn-save" onClick={handleSave}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                {isCreatingNew ? (t('create') || 'Create') : (t('save') || 'Save')}
              </button>
              <button
                className="btn-cancel"
                onClick={() => {
                  setSelectedResume(null);
                  setIsCreatingNew(false);
                }}
              >
                {t('cancel') || 'Cancel'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
