import { useState } from 'react';
import { useMari } from '../hooks/useMari';
import { useLanguage } from '../contexts/LanguageContext';
import { GeminiAiIcon } from './GeminiAiIcon';
import type { Professional } from '../types';

interface MariAssistantProps {
  professionals?: Professional[];
}

export function MariAssistant({ professionals }: MariAssistantProps) {
  const { t } = useLanguage();
  const [question, setQuestion] = useState('');
  const { loading, error, response, askForProfessionalRecommendation, reset } = useMari();

  const handleAskProfessional = async () => {
    if (!question.trim()) return;
    await askForProfessionalRecommendation(question, professionals || []);
  };

  const handleReset = () => {
    setQuestion('');
    reset();
  };

  return (
    <div className="mari-assistant">
      <div className="mari-header">
        <h3>MarI AI Assistant</h3>
        <p>{t('mariDescription') || 'Ask MarI for help finding the right professional or specialty for your needs'}</p>
      </div>

      <div className="mari-input-section">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t('mariPlaceholder') || 'Describe what you need help with...'}
          rows={4}
          disabled={loading}
        />

        <div className="mari-actions">
          <button
            onClick={handleAskProfessional}
            disabled={loading || !question.trim()}
            className="mari-button"
          >
            <GeminiAiIcon />
            {loading ? t('loading') || 'Loading...' : t('askProfessional') || 'Recommend Professional'}
          </button>

          {(response || error) && (
            <button
              onClick={handleReset}
              disabled={loading}
              className="mari-button mari-button-secondary"
            >
              {t('reset') || 'Reset'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mari-error">
          <strong>{t('error') || 'Error'}:</strong> {error}
        </div>
      )}

      {response && (
        <div className="mari-response">
          <h4>{t('mariRecommendation') || 'MarI\'s Recommendation'}</h4>
          <p>{response}</p>
        </div>
      )}
    </div>
  );
}
