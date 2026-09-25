import { useLanguage } from '../contexts/LanguageContext';
import type { UserFormData } from '../types';
import './OfficeHome.css';

const OFFICE_BACKGROUND_SRC = '/office-home.jpg';

interface HomeProps {
  onNavigate: (section: string) => void;
  onShowSignIn: () => void;
  isSignedIn: boolean;
  currentUser?: UserFormData | null;
  /** Total number of professionals in the database (passed from App). */
  professionalCount?: number;
  loadingProfessionals?: boolean;
  clientCount?: number;
  sessionCount?: number;
  averageClientRating?: number | null;
  loadingHomeStats?: boolean;
}

export function Home({
  onNavigate,
  onShowSignIn,
  isSignedIn,
  professionalCount,
  loadingProfessionals,
  clientCount,
  sessionCount,
  averageClientRating,
  loadingHomeStats,
}: HomeProps) {
  const { language } = useLanguage();

  const handleRequestSession = () => {
    if (!isSignedIn) {
      onShowSignIn();
    } else {
      onNavigate('client-info');
    }
  };

  return (
    <section
      className="section office-home"
      aria-label={language === 'es' ? 'Oficina virtual' : 'Virtual office'}
    >
      <div className="office-home__virtual-room">
        <img
          className="office-home__photo"
          src={OFFICE_BACKGROUND_SRC}
          alt=""
          role="presentation"
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
        <div className="office-home__scrim" aria-hidden="true" />

        {/* Two action buttons centred over the image */}
        <div className="office-home__content office-home__content--center">
          <div className="office-home__btn-row">

            {/* Find a Therapist */}
            <button
              type="button"
              className="office-home__professionals-btn"
              onClick={() => onNavigate('professionals')}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span className="office-home__professionals-btn__text">
                <span className="office-home__professionals-btn__title">
                  {language === 'es' ? 'Encuentra un Terapeuta' : 'Find a Therapist'}
                </span>
                <span className="office-home__professionals-btn__subtitle">
                  {language === 'es' ? 'Terapeutas Disponibles' : 'Therapists Available'}
                  {' '}
                  <strong className="office-home__professionals-btn__count">
                    {loadingProfessionals ? '…' : (professionalCount ?? 0)}
                  </strong>
                </span>
              </span>
            </button>

            {/* Request a Session */}
            <button
              type="button"
              className="office-home__request-btn"
              onClick={handleRequestSession}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8"  y1="2" x2="8"  y2="6"/>
                <line x1="3"  y1="10" x2="21" y2="10"/>
                <line x1="12" y1="15" x2="12" y2="19"/>
                <line x1="10" y1="17" x2="14" y2="17"/>
              </svg>
              <span>{language === 'es' ? 'Solicitar Sesión' : 'Request a Session'}</span>
            </button>

          </div>

          {/* Bottom info labels */}
          <div className="office-home__stat-labels" aria-label={language === 'es' ? 'Estadísticas' : 'Statistics'}>
            <div className="office-home__stat-label">
              <span className="office-home__stat-label__count">
                {loadingProfessionals ? '…' : (professionalCount ?? 0)}
              </span>
              <span className="office-home__stat-label__text">
                {language === 'es' ? 'Profesionales Licenciados' : 'Licensed Professionals'}
              </span>
            </div>
            <div className="office-home__stat-label">
              <span className="office-home__stat-label__count">
                {loadingHomeStats ? '…' : (clientCount ?? 0)}
              </span>
              <span className="office-home__stat-label__text">
                {language === 'es' ? 'Clientes Ayudados' : 'Clients Helped'}
              </span>
            </div>
            <div className="office-home__stat-label">
              <span className="office-home__stat-label__count">
                {loadingHomeStats ? '…' : (sessionCount ?? 0)}
              </span>
              <span className="office-home__stat-label__text">
                {language === 'es' ? 'Sesiones Completadas' : 'Sessions Completed'}
              </span>
            </div>
            <div className="office-home__stat-label">
              <span className="office-home__stat-label__count">
                {loadingHomeStats
                  ? '…'
                  : averageClientRating != null
                    ? averageClientRating.toFixed(1)
                    : '—'}
              </span>
              <span className="office-home__stat-label__text">
                {language === 'es' ? 'Calificación Promedio' : 'Average Rating'}
              </span>
            </div>
            <button
              type="button"
              className="office-home__stat-nav-btn"
              onClick={() => onNavigate('about')}
            >
              {language === 'es' ? 'Acerca de Nosotros' : 'About Us'}
            </button>
            <button
              type="button"
              className="office-home__stat-nav-btn"
              onClick={() => onNavigate('help')}
            >
              {language === 'es' ? 'Ayuda' : 'Help'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
