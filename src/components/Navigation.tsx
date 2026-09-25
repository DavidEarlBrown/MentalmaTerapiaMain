import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useProfession } from '../contexts/ProfessionContext';

import type { UserFormData } from '../types';

interface NavigationProps {
  onNavigate: (section: string) => void;
  currentSection: string;
  currentUser: UserFormData | null;
}

export function Navigation({ onNavigate, currentSection, currentUser }: NavigationProps) {
  const { t, language } = useLanguage();
  const { professions, activeProfession, setActiveProfession } = useProfession();
  const [isOpen, setIsOpen] = useState(false);
  const isGuest = !currentUser;
  const userRole = currentUser?.user_type || 'client';

  const activeProfessions = professions.filter(p => p.is_active !== false);

  const handleNavigate = (section: string) => {
    onNavigate(section);
    setIsOpen(false);
  };

  return (
    <nav className="navigation">
      <button
        className="hamburger-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle menu"
      >
        <div className="hamburger-icon">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </button>

      <div className={`nav-menu ${isOpen ? 'open' : ''}`}>

        <button
          type="button"
          onClick={() => handleNavigate('home')}
          className={`nav-item ${currentSection === 'home' ? 'active' : ''}`}
          style={{ flexShrink: 0 }}
        >
          {language === 'es' ? 'Inicio' : 'Home'}
        </button>

        <button
          type="button"
          onClick={() => handleNavigate('client-info')}
          className={`nav-item ${currentSection === 'client-info' ? 'active' : ''}`}
        >
          {language === 'es' ? 'Solicitar Sesión' : 'Client Request Session'}
          {activeProfession && activeProfessions.length > 1 && (
            <span style={{ fontSize: '0.75rem', color: activeProfession ? '#a5b4fc' : '#94a3b8', marginLeft: '0.35rem' }}>
              ({language === 'en' ? activeProfession.name_en : activeProfession.name_es})
            </span>
          )}
        </button>

        {currentUser && userRole !== 'Professional' && (
          <button
            type="button"
            onClick={() => handleNavigate('payment')}
            className={`nav-item ${currentSection === 'payment' ? 'active' : ''}`}
          >
            {t('payment') || (language === 'es' ? 'Pago' : 'Payment')}
          </button>
        )}

        {currentUser && (userRole === 'client' || userRole === 'Administrator') && (
          <button
            onClick={() => handleNavigate('cancel-session')}
            className={`nav-item ${currentSection === 'cancel-session' ? 'active' : ''}`}
          >
            {language === 'es' ? 'Cancelar Sesión' : 'Cancel Session'}
          </button>
        )}

        <button
          onClick={() => handleNavigate('professionals')}
          className={`nav-item ${currentSection === 'professionals' ? 'active' : ''}`}
        >
          {t('professionalList')}
        </button>

        {(userRole === 'client' || userRole === 'Administrator') && activeProfessions.length > 1 && (
          <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.4rem' }}>
              {language === 'es' ? 'Área de práctica' : 'Practice Area'}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {activeProfessions.map(p => (
                <button
                  key={p.id}
                  onClick={() => setActiveProfession(p)}
                  style={{
                    padding: '0.25rem 0.65rem',
                    borderRadius: '12px',
                    border: '1px solid',
                    borderColor: activeProfession?.id === p.id ? '#6c63ff' : '#cbd5e1',
                    backgroundColor: activeProfession?.id === p.id ? '#6c63ff' : 'white',
                    color: activeProfession?.id === p.id ? 'white' : '#475569',
                    fontSize: '0.8rem',
                    fontWeight: activeProfession?.id === p.id ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {language === 'en' ? p.name_en : p.name_es}
                </button>
              ))}
            </div>
          </div>
        )}

        {currentUser &&
          (userRole === 'client' || userRole === 'Professional' || userRole === 'Administrator') && (
          <button
            onClick={() => handleNavigate('professional-appointments')}
            className={`nav-item ${currentSection === 'professional-appointments' ? 'active' : ''}`}
          >
            {language === 'es' ? 'Mostrar Mis Citas' : 'Display My Appointments'}
          </button>
        )}

        {(userRole === 'Professional' || userRole === 'Administrator') && (
          <button
            onClick={() => handleNavigate('manage-profile')}
            className={`nav-item ${currentSection === 'manage-profile' ? 'active' : ''}`}
          >
            {userRole === 'Administrator'
              ? (language === 'es' ? 'Gestionar Profesionales' : 'Manage Professionals')
              : (language === 'es' ? 'Mi Perfil Profesional' : 'My Professional Profile')}
          </button>
        )}

        {(userRole === 'Professional' || userRole === 'Administrator') && (
          <button
            onClick={() => handleNavigate('session-feedback')}
            className={`nav-item ${currentSection === 'session-feedback' ? 'active' : ''}`}
          >
            {language === 'es' ? 'Retroalimentación de Sesión' : 'Session Feedback'}
          </button>
        )}

        {(userRole === 'Professional' || userRole === 'Administrator') && (
          <button
            onClick={() => handleNavigate('session-comments')}
            className={`nav-item ${currentSection === 'session-comments' ? 'active' : ''}`}
          >
            {language === 'es' ? 'Ver Comentarios de Sesión' : 'View Session Comments'}
          </button>
        )}

        {userRole === 'Administrator' && (
          <button
            onClick={() => handleNavigate('submit-resume')}
            className={`nav-item ${currentSection === 'submit-resume' ? 'active' : ''}`}
          >
            {t('submitResume')}
          </button>
        )}

        {currentUser && userRole !== 'Professional' && (
          <button
            onClick={() => handleNavigate('questionnaires')}
            className={`nav-item ${currentSection === 'questionnaires' ? 'active' : ''}`}
          >
            {t('standardQuestionnaires') || (t('language') === 'es' ? 'Cuestionarios Estándar' : 'Standard Questionnaires')}
          </button>
        )}

        {userRole === 'Administrator' && (
          <>
            <button
              onClick={() => handleNavigate('admin')}
              className={`nav-item ${currentSection === 'admin' ? 'active' : ''}`}
            >
              {t('adminPanel')}
            </button>
            <button
              onClick={() => handleNavigate('admin-user-roles')}
              className={`nav-item ${currentSection === 'admin-user-roles' ? 'active' : ''}`}
            >
              {language === 'es' ? 'Gestionar Roles de Usuario' : 'Manage User Roles'}
            </button>
            <button
              onClick={() => handleNavigate('google-token')}
              className={`nav-item ${currentSection === 'google-token' ? 'active' : ''}`}
            >
              {language === 'es' ? 'Generar Google Token' : 'Generate Google Token'}
            </button>
            <button
              onClick={() => handleNavigate('zoho-token')}
              className={`nav-item ${currentSection === 'zoho-token' ? 'active' : ''}`}
            >
              {language === 'es' ? 'Generar Zoho Token' : 'Generate Zoho Token'}
            </button>
          </>
        )}

        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0' }}>
          <button
            onClick={() => handleNavigate('about')}
            className={`nav-item ${currentSection === 'about' ? 'active' : ''}`}
          >
            {t('aboutUs')}
          </button>

          <button
            onClick={() => handleNavigate('help')}
            className={`nav-item ${currentSection === 'help' ? 'active' : ''}`}
          >
            {t('help')}
          </button>

          {/* Mentalma Support / tickets — signed-in users only */}
          {!isGuest && (
            <button
              type="button"
              onClick={() => handleNavigate('support-tickets')}
              className={`nav-item ${currentSection === 'support-tickets' ? 'active' : ''}`}
            >
              {language === 'es' ? 'Soporte Mentalma' : 'Mentalma Support'}
            </button>
          )}
        </div>

        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '2px solid #e0e7ff' }}>
          {/* Analysis & Analytics — signed-in users only */}
          {!isGuest && (
            <>
              <button
                type="button"
                onClick={() => handleNavigate('mentalma-analysis')}
                className={`nav-item ${currentSection === 'mentalma-analysis' ? 'active' : ''}`}
                style={{ color: '#6c63ff', fontWeight: 600 }}
              >
                Mentalma Analysis
              </button>
              <button
                type="button"
                onClick={() => {
                  window.open('https://analytics.google.com/', '_blank', 'noopener,noreferrer');
                  setIsOpen(false);
                }}
                className="nav-item"
                style={{ color: '#e8710a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>
                  <path d="M22 12A10 10 0 0 0 12 2v10z"/>
                </svg>
                Google Analytics
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              window.open('https://books.zoho.com/app/912892585', '_blank', 'noopener,noreferrer');
              setIsOpen(false);
            }}
            className="nav-item"
            style={{ color: '#1a6b4a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2z"/>
              <path d="M15 19V9a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2z"/>
              <path d="M21 19V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2z"/>
            </svg>
            Mentalma Zoho Accounting
          </button>
          <button
            type="button"
            onClick={() => {
              window.open('https://www.youtube.com/@MentalmaTerapia', '_blank', 'noopener,noreferrer');
              setIsOpen(false);
            }}
            className="nav-item"
            style={{ color: '#ff0000', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            Mentalma Terapias Tutorials
          </button>
        </div>

      </div>

      {isOpen && (
        <div
          className="nav-overlay"
          onClick={() => setIsOpen(false)}
        ></div>
      )}
    </nav>
  );
}
