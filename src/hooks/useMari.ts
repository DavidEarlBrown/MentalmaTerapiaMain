import { useState } from 'react';
import { findTherapist, getAIAssistanceForForm } from '../lib/mariService';
import type { Professional } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useProfession } from '../contexts/ProfessionContext';

export function useMari() {
  const { language } = useLanguage();
  const { activeProfession } = useProfession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);

  const askForProfessionalRecommendation = async (
    issue: string,
    professionals: Professional[] = []
  ) => {
    setLoading(true);
    setError(null);
    try {
      const result = await findTherapist(issue, professionals, language, activeProfession);
      const formattedResponse = `${result.recommendedTherapist}\n\n${result.reason}`;
      setResponse(formattedResponse);
      return formattedResponse;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get response from MarI';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const askForCategorySuggestion = async (
    issue: string,
    professionals: Professional[] = []
  ) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAIAssistanceForForm(issue, 'category', professionals, language, activeProfession);
      setResponse(result.suggestion);
      return result.suggestion;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get category suggestion';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const askForTherapistSuggestion = async (
    issue: string,
    professionals: Professional[] = []
  ) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAIAssistanceForForm(issue, 'therapist', professionals, language, activeProfession);
      const display =
        result.suggestions && result.suggestions.length > 1
          ? [result.suggestions.join(', '), result.reason].filter(Boolean).join('\n\n')
          : [result.suggestion, result.reason].filter(Boolean).join('\n\n');
      setResponse(display);
      return result.suggestions && result.suggestions.length > 1 ? result.suggestions.join(', ') : result.suggestion;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get therapist suggestion';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResponse(null);
    setError(null);
  };

  return {
    loading,
    error,
    response,
    askForProfessionalRecommendation,
    askForCategorySuggestion,
    askForTherapistSuggestion,
    reset,
  };
}
