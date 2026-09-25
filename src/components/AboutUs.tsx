import { useLanguage } from '../contexts/LanguageContext';

export function AboutUs() {
  const { t } = useLanguage();

  return (
    <section className="section about-us">
      <h2>{t('aboutUs')}</h2>

      <div className="about-content">
        <div className="about-section">
          <h3>{t('ourMission')}</h3>
          <p>{t('ourMissionText')}</p>
        </div>

        <div className="about-section">
          <h3>{t('ourVision')}</h3>
          <p>{t('ourVisionText')}</p>
          <p>{t('ourVisionText2')}</p>
          <p>{t('ourVisionText3')}</p>
        </div>

        <div className="about-section">
          <h3>{t('ourValues')}</h3>
          <ul className="values-list">
            <li>
              <strong>{t('professionalismTitle')}</strong>
              <p>{t('professionalismText')}</p>
            </li>
            <li>
              <strong>{t('compassionTitle')}</strong>
              <p>{t('compassionText')}</p>
            </li>
            <li>
              <strong>{t('confidentialityTitle')}</strong>
              <p>{t('confidentialityText')}</p>
            </li>
            <li>
              <strong>{t('artificialIntelligenceTitle')}</strong>
              <p>{t('artificialIntelligenceText')}</p>
            </li>
            <li>
              <strong>{t('excellenceTitle')}</strong>
              <p>{t('excellenceText')}</p>
            </li>
            <li>
              <strong>{t('autonomyTitle')}</strong>
              <p>{t('autonomyText')}</p>
            </li>
          </ul>
        </div>

        <div className="about-section">
          <h3>{t('ourTeam')}</h3>
          <p>{t('ourTeamText')}</p>
          <p>{t('ourTeamText2')}</p>
        </div>
      </div>
    </section>
  );
}
