import { useLanguage } from '../contexts/LanguageContext';

export function Help() {
  const { t } = useLanguage();

  return (
    <section className="section help-section">
      <h2>{t('help')}</h2>

      <div className="help-content">
        <div className="help-category">
          <h3>{t('gettingStarted')}</h3>
          <div className="faq-item">
            <h4>{t('helpUsersAndRolesTitle')}</h4>
            <ol>
              <li>
                <strong>{t('helpRoleNoUserLabel')}:</strong>{' '}
                {t('helpRoleNoUserText')}
              </li>
              <li>
                <strong>{t('helpRoleClientsLabel')}:</strong>{' '}
                {t('helpRoleClientsText')}
              </li>
              <li>
                <strong>{t('helpRoleProfessionalsLabel')}:</strong>{' '}
                {t('helpRoleProfessionalsText')}
              </li>
              <li>
                <strong>{t('helpRoleAdministratorsLabel')}:</strong>{' '}
                {t('helpRoleAdministratorsText')}
              </li>
            </ol>
          </div>
          <div className="faq-item">
            <h4>{t('howToBookQuestion')}</h4>
            <p>{t('howToBookAnswer')}</p>
          </div>
          <div className="faq-item">
            <h4>{t('firstSessionQuestion')}</h4>
            <p>{t('firstSessionAnswer')}</p>
          </div>
        </div>

        <div className="help-category">
          <h3>{t('appointments')}</h3>
          <div className="faq-item">
            <h4>{t('cancelAppointmentQuestion')}</h4>
            <p>{t('cancelAppointmentAnswer')}</p>
          </div>
          <div className="faq-item">
            <h4>{t('rescheduleQuestion')}</h4>
            <p>{t('rescheduleAnswer')}</p>
          </div>
          <div className="faq-item">
            <h4>{t('sessionLengthQuestion')}</h4>
            <p>{t('sessionLengthAnswer')}</p>
          </div>
        </div>

        <div className="help-category">
          <h3>{t('payments')}</h3>
          <div className="faq-item">
            <h4>{t('paymentMethodsQuestion')}</h4>
            <p>{t('paymentMethodsAnswer')}</p>
          </div>
          <div className="faq-item">
            <h4>{t('insuranceQuestion')}</h4>
            <p>{t('insuranceAnswer')}</p>
          </div>
        </div>

        <div className="help-category">
          <h3>{t('privacy')}</h3>
          <div className="faq-item">
            <h4>{t('confidentialityQuestion')}</h4>
            <p>{t('confidentialityAnswer')}</p>
          </div>
          <div className="faq-item">
            <h4>{t('dataSecurityQuestion')}</h4>
            <p>{t('dataSecurityAnswer')}</p>
          </div>
        </div>

        <div className="help-category contact-support">
          <h3>{t('needMoreHelp')}</h3>
          <p>{t('contactSupport')}</p>
          <div className="contact-info">
            <p><strong>{t('email')}:</strong> support@psyhelp.com</p>
            <p><strong>{t('supportPhone')}:</strong> +1 (555) 123-4567</p>
            <p><strong>{t('supportHours')}:</strong> {t('supportHoursValue')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
