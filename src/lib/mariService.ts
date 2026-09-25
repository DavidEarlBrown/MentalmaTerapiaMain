import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Professional, Profession } from '../types';
import { translations } from "../i18n/translations";
import { GEMINI_API_KEY } from "../constants";

function professionContext(profession: Profession | null | undefined, language: 'en' | 'es'): string {
  if (!profession) return '';
  const name = language === 'es' ? profession.name_es : profession.name_en;
  const desc = language === 'es' ? profession.description_es : profession.description_en;
  return language === 'en'
    ? `\nContext: This platform serves ${name} professionals only.${desc ? ` ${desc}` : ''} Tailor all recommendations specifically to ${name} practice.`
    : `\nContexto: Esta plataforma es exclusivamente para profesionales de ${name}.${desc ? ` ${desc}` : ''} Adapta todas las recomendaciones específicamente a la práctica de ${name}.`;
}

const getAiInstance = (): GoogleGenerativeAI => {
    const apiKey = GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("Gemini API features are unavailable. The API_KEY is missing.");
    }
    return new GoogleGenerativeAI(apiKey);
};

export const findTherapist = async (
  problemDescription: string,
  therapists: Professional[],
  language: 'en' | 'es',
  profession?: Profession | null,
): Promise<{ recommendedTherapist: string; reason: string }> => {
  const therapistList = therapists
    .map((t, index) => {
      const name = language === 'en' ? t.name_en : t.name_es;
      const specialties = language === 'en' ? t.specialties_en : t.specialties_es;
      return `${index + 1}. ID: ${t.id}\n   Name: ${name}\n   Specialties: ${specialties.join(', ')}`;
    })
    .join('\n\n');

  const promptTemplate = translations[language].geminiPrompt;
  const prompt = (promptTemplate
    .replace('{problemDescription}', problemDescription)
    .replace('{therapistList}', therapistList)) + professionContext(profession, language);

  try {
    const genAI = getAiInstance();
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        topK: 40,
      }
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return {
      recommendedTherapist: "",
      reason: text
    };
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw error;
  }
};

function buildTherapistListForPrompt(therapists: Professional[], language: 'en' | 'es'): string {
  return therapists
    .map((t, index) => {
      const name = language === 'en' ? t.name_en : t.name_es;
      const specialties = language === 'en' ? t.specialties_en : t.specialties_es;
      return `${index + 1}. ID: ${t.id}\n   Name: ${name}\n   Specialties: ${specialties.join(', ')}`;
    })
    .join('\n\n');
}

function normalizeTherapistIdSuggestions(
  parsed: Record<string, unknown>,
  therapists: Professional[],
): { suggestions: string[]; reason?: string } {
  const idSet = new Set(therapists.map((t) => t.id));
  const raw = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const suggestions = raw
    .map((x) => String(x).trim())
    .filter((id) => idSet.has(id))
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .slice(0, 3);
  const reason = typeof parsed.reason === 'string' ? parsed.reason : undefined;
  return { suggestions, reason };
}

export const getAIAssistanceForForm = async (
  problemDescription: string,
  requestType: 'category' | 'therapist',
  therapists: Professional[],
  language: 'en' | 'es',
  profession?: Profession | null,
  availableSpecialties?: Array<{ name_en: string; name_es: string }>,
): Promise<{ suggestion: string; suggestions?: string[]; reason?: string }> => {
  let prompt: string;

  if (requestType === 'category' && availableSpecialties && availableSpecialties.length > 0) {
    const specialtyNames = availableSpecialties
      .map(s => (language === 'en' ? s.name_en : s.name_es))
      .join('\n');

    prompt = (language === 'en'
      ? `You are MarI, an AI assistant. Select the most appropriate specialty for the user's problem from the list below.

User's problem: ${problemDescription}

Available specialties:
${specialtyNames}

INSTRUCTIONS:
1. Read through ALL available specialties
2. Identify which specialty is most relevant to the user's problem
3. Return ONLY the exact specialty name as it appears in the list above
4. If multiple specialties match, choose the most specific one

Return your response in the following JSON format:
{
  "suggestion": "Exact specialty name from the list"
}`
      : `Eres MarI, un asistente de IA. Selecciona la especialidad más apropiada para el problema del usuario de la lista de abajo.

Problema del usuario: ${problemDescription}

Especialidades disponibles:
${specialtyNames}

INSTRUCCIONES:
1. Lee TODAS las especialidades disponibles
2. Identifica qué especialidad es más relevante al problema del usuario
3. Devuelve SOLO el nombre exacto de la especialidad como aparece en la lista de arriba
4. Si múltiples especialidades coinciden, elige la más específica

Devuelve tu respuesta en el siguiente formato JSON:
{
  "suggestion": "Nombre exacto de especialidad de la lista"
}`) + professionContext(profession, language);
  } else {
    const therapistList = buildTherapistListForPrompt(therapists, language);
    const profCtx = professionContext(profession, language);

    if (requestType === 'therapist' && therapists.length > 5) {
      prompt =
        (language === 'en'
          ? `You are MarI, an AI assistant matching users with ${profession ? profession.name_en : 'mental health'} professionals.

User's problem description:
${problemDescription}

Professionals database:
${therapistList}

There are MORE THAN FIVE professionals in this list. Recommend EXACTLY THREE distinct professionals who are the best match for the user's needs (best match first). Use only UUIDs copied exactly from the "ID:" lines above.

Return JSON only:
{
  "suggestions": ["uuid-first-best", "uuid-second", "uuid-third"],
  "reason": "Brief paragraph explaining why these three are good matches, in order of fit."
}`
          : `Eres MarI, un asistente de IA que empareja usuarios con profesionales de ${profession ? profession.name_es : 'salud mental'}.

Descripción del problema del usuario:
${problemDescription}

Base de datos de profesionales:
${therapistList}

Hay MÁS DE CINCO profesionales en esta lista. Recomienda EXACTAMENTE TRES profesionales distintos que mejor encajen con las necesidades del usuario (el mejor primero). Usa solo UUID copiados exactamente de las líneas "ID:" de arriba.

Devuelve solo JSON:
{
  "suggestions": ["uuid-mejor", "uuid-segundo", "uuid-tercero"],
  "reason": "Párrafo breve explicando por qué estos tres son buenas opciones, en orden de adecuación."
}`) + profCtx;
    } else {
      const promptTemplate = requestType === 'category'
        ? translations[language].geminiCategoryPrompt
        : translations[language].geminiTherapistIdPrompt;

      prompt = (promptTemplate
        .replace('{problemDescription}', problemDescription)
        .replace('{therapistList}', therapistList)) + profCtx;
    }
  }

  try {
    const genAI = getAiInstance();
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        topK: 40,
        responseMimeType: "application/json",
      }
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      if (requestType === 'therapist' && therapists.length > 5) {
        const { suggestions, reason } = normalizeTherapistIdSuggestions(parsed, therapists);
        if (suggestions.length > 0) {
          return {
            suggestion: suggestions[0],
            suggestions,
            reason,
          };
        }
        // Fall back to single-ID prompt on same pool
        const fallbackList = buildTherapistListForPrompt(therapists, language);
        const singlePrompt =
          (translations[language].geminiTherapistIdPrompt
            .replace('{problemDescription}', problemDescription)
            .replace('{therapistList}', fallbackList)) + professionContext(profession, language);
        const fbResult = await model.generateContent(singlePrompt);
        const fbText = fbResult.response.text();
        const fbMatch = fbText.match(/\{[\s\S]*\}/);
        if (fbMatch) {
          const fbParsed = JSON.parse(fbMatch[0]) as { suggestion?: string };
          const sid = typeof fbParsed.suggestion === 'string' ? fbParsed.suggestion.trim() : '';
          if (sid && therapists.some((t) => t.id === sid)) {
            return { suggestion: sid };
          }
        }
        return { suggestion: fbText.trim() };
      }
      return parsed as { suggestion: string; suggestions?: string[]; reason?: string };
    }

    return {
      suggestion: text.trim()
    };
  } catch (error) {
    console.error(`Error calling Gemini API for ${requestType}:`, error);
    throw error;
  }
};

export const improveText = async (
  text: string,
  language: 'en' | 'es',
  profession?: Profession | null,
): Promise<{ improvedText: string }> => {
  const profCtx = professionContext(profession, language);
  const prompt = language === 'en'
    ? `You are MarI, an empathetic AI assistant helping users articulate their concerns clearly for a ${profession ? (profession.name_en) : 'mental health'} consultation.${profCtx}

User's original text: "${text}"

TASK: Improve this text to be:
1. More clear and articulate
2. Professional but warm in tone
3. Better structured if needed
4. More specific where appropriate
5. Grammatically correct

Keep the same meaning and intent. Don't add concerns the user didn't express. Keep it concise.

Return ONLY the improved text in the following JSON format:
{
  "improvedText": "the improved version here"
}`
    : `Eres MarI, un asistente de IA empático que ayuda a los usuarios a articular sus preocupaciones claramente para una consulta de ${profession ? profession.name_es : 'salud mental'}.${profCtx}

Texto original del usuario: "${text}"

TAREA: Mejora este texto para que sea:
1. Más claro y articulado
2. Profesional pero cálido en tono
3. Mejor estructurado si es necesario
4. Más específico donde sea apropiado
5. Gramaticalmente correcto

Mantén el mismo significado e intención. No agregues preocupaciones que el usuario no expresó. Mantenlo conciso.

Devuelve SOLO el texto mejorado en el siguiente formato JSON:
{
  "improvedText": "la versión mejorada aquí"
}`;

  try {
    const genAI = getAiInstance();
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.5,
        topP: 0.9,
        topK: 40,
        responseMimeType: "application/json",
      }
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return {
      improvedText: responseText.trim()
    };
  } catch (error) {
    console.error('Error calling Gemini API for text improvement:', error);
    throw error;
  }
};

export interface Specialty {
  id: string;
  name_en: string;
  name_es: string;
  description_en: string;
  description_es: string;
}

export const selectSpecialtyFromText = async (
  problemText: string,
  specialties: Specialty[],
  language: 'en' | 'es',
  profession?: Profession | null,
): Promise<{ selectedSpecialtyId: string; reason: string }> => {
  const specialtyList = specialties
    .map((s, index) => {
      const name = language === 'en' ? s.name_en : s.name_es;
      const description = language === 'en' ? s.description_en : s.description_es;
      return `${index + 1}. ID: ${s.id}\n   Name: ${name}${description ? `\n   Description: ${description}` : ''}`;
    })
    .join('\n\n');

  const profCtx = professionContext(profession, language);
  const prompt = language === 'en'
    ? `You are MarI, an empathetic AI assistant helping users find the right specialty for their ${profession ? profession.name_en : 'mental health'} needs.${profCtx}

User's concern: "${problemText}"

Available specialties:
${specialtyList}

TASK: Based on the user's concern, select the ONE most appropriate specialty from the list above.
Return the specialty ID and a brief reason for your choice.

Return your response in the following JSON format:
{
  "selectedSpecialtyId": "the specialty ID here",
  "reason": "brief explanation of why this specialty is most appropriate"
}`
    : `Eres MarI, un asistente de IA empático que ayuda a los usuarios a encontrar la especialidad adecuada para sus necesidades de ${profession ? profession.name_es : 'salud mental'}.${profCtx}

Preocupación del usuario: "${problemText}"

Especialidades disponibles:
${specialtyList}

TAREA: Basado en la preocupación del usuario, selecciona UNA especialidad más apropiada de la lista anterior.
Devuelve el ID de la especialidad y una breve razón de tu elección.

Devuelve tu respuesta en el siguiente formato JSON:
{
  "selectedSpecialtyId": "el ID de la especialidad aquí",
  "reason": "breve explicación de por qué esta especialidad es más apropiada"
}`;

  try {
    const genAI = getAiInstance();
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        topK: 40,
        responseMimeType: "application/json",
      }
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return {
      selectedSpecialtyId: '',
      reason: responseText.trim()
    };
  } catch (error) {
    console.error('Error calling Gemini API for specialty selection:', error);
    throw error;
  }
};

export const analyzeCompletedQuestionnaire = async (
  questionnaireText: string,
  questionnaireName: string,
  language: 'en' | 'es',
): Promise<{ analysis: string }> => {
  const prompt = language === 'es'
    ? `Eres MarI, un asistente clínico de IA con amplia experiencia en la evaluación de cuestionarios psicológicos y de salud mental. Se te presentan las respuestas de un cliente al cuestionario "${questionnaireName}".

Respuestas del cliente:
${questionnaireText}

Por favor, proporciona una evaluación clínica profesional que incluya:

1. **Resumen de hallazgos principales**: Los patrones más relevantes observados en las respuestas.
2. **Interpretación clínica**: Lo que estas respuestas sugieren desde una perspectiva clínica.
3. **Áreas de atención**: Los aspectos que merecen mayor exploración en la sesión.
4. **Recomendaciones preliminares**: Sugerencias clínicas basadas en los resultados.
5. **Consideraciones adicionales**: Cualquier observación relevante para el tratamiento.

Proporciona una evaluación detallada, empática y profesional. Esta evaluación es una herramienta de apoyo para el profesional, no un diagnóstico definitivo.`
    : `You are MarI, a clinical AI assistant with extensive experience evaluating psychological and mental health questionnaires. You are presented with a client's responses to the "${questionnaireName}" questionnaire.

Client responses:
${questionnaireText}

Please provide a professional clinical evaluation that includes:

1. **Summary of Key Findings**: The most relevant patterns observed in the responses.
2. **Clinical Interpretation**: What these responses suggest from a clinical perspective.
3. **Areas of Focus**: Aspects that warrant further exploration in the session.
4. **Preliminary Recommendations**: Clinical suggestions based on the results.
5. **Additional Considerations**: Any observations relevant to the treatment approach.

Provide a detailed, empathetic and professional evaluation. This assessment is a support tool for the professional, not a definitive diagnosis.`;

  try {
    const genAI = getAiInstance();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.4, topP: 0.9, topK: 40 },
    });
    const result = await model.generateContent(prompt);
    return { analysis: result.response.text() };
  } catch (error) {
    console.error('Error calling Gemini API for questionnaire analysis:', error);
    throw error;
  }
};

export const analyzeAllClientQuestionnaires = async (
  questionnaires: Array<{ name: string; text: string }>,
  clientIssue: string,
  language: 'en' | 'es',
): Promise<{ analysis: string }> => {
  const qSections = questionnaires
    .map((q, i) =>
      language === 'es'
        ? `--- Cuestionario ${i + 1}: ${q.name} ---\n${q.text}`
        : `--- Questionnaire ${i + 1}: ${q.name} ---\n${q.text}`
    )
    .join('\n\n');

  const prompt =
    language === 'es'
      ? `Eres MarI, un asistente clínico de IA especializado en evaluaciones psicológicas integrales. Se te presentan los resultados de ${questionnaires.length} cuestionario(s) completados por un cliente.

Problema/motivo de consulta del cliente: "${clientIssue || 'No especificado'}"

${qSections}

Por favor, realiza un análisis clínico integral que incluya:

1. **Resumen Ejecutivo**: Visión general de los hallazgos más significativos en todos los cuestionarios.
2. **Patrones y Correlaciones**: Conexiones entre los diferentes cuestionarios y cómo se relacionan con el motivo de consulta.
3. **Evaluación de Severidad**: Nivel general de afectación y áreas críticas identificadas.
4. **Áreas Prioritarias de Intervención**: Los aspectos más urgentes a abordar en el tratamiento.
5. **Plan de Tratamiento Sugerido**: Recomendaciones terapéuticas basadas en el análisis integral.
6. **Seguimiento Recomendado**: Aspectos a monitorear en sesiones futuras.

Este análisis es una herramienta de apoyo clínico profesional. El juicio clínico del profesional prevalece sobre cualquier sugerencia de la IA.`
      : `You are MarI, a clinical AI assistant specialized in comprehensive psychological evaluations. You are presented with results from ${questionnaires.length} questionnaire(s) completed by a client.

Client's presenting issue: "${clientIssue || 'Not specified'}"

${qSections}

Please provide a comprehensive clinical analysis including:

1. **Executive Summary**: Overview of the most significant findings across all questionnaires.
2. **Patterns and Correlations**: Connections between the different questionnaires and how they relate to the presenting issue.
3. **Severity Assessment**: Overall level of impairment and critical areas identified.
4. **Priority Intervention Areas**: The most urgent aspects to address in treatment.
5. **Suggested Treatment Plan**: Therapeutic recommendations based on the comprehensive analysis.
6. **Recommended Follow-up**: Aspects to monitor in future sessions.

This analysis is a professional clinical support tool. The professional's clinical judgment prevails over any AI suggestions.`;

  try {
    const genAI = getAiInstance();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.4, topP: 0.9, topK: 40 },
    });
    const result = await model.generateContent(prompt);
    return { analysis: result.response.text() };
  } catch (error) {
    console.error('Error calling Gemini API for comprehensive analysis:', error);
    throw error;
  }
};

export const findProfessionalByProblemAndSpecialty = async (
  problemText: string,
  selectedSpecialtyName: string | null,
  professionals: Professional[],
  language: 'en' | 'es',
  profession?: Profession | null,
): Promise<{ recommendedProfessionalId: string; recommendedProfessionalIds?: string[]; reason: string }> => {
  const professionalList = buildTherapistListForPrompt(professionals, language);

  const specialtyContext = selectedSpecialtyName
    ? (language === 'en'
      ? `\n\nThe user has selected the specialty: "${selectedSpecialtyName}". Prioritize professionals with this specialty.`
      : `\n\nEl usuario ha seleccionado la especialidad: "${selectedSpecialtyName}". Prioriza profesionales con esta especialidad.`)
    : '';

  const profCtx = professionContext(profession, language);

  const promptSingle = language === 'en'
    ? `You are MarI, an empathetic AI assistant helping users find the right ${profession ? profession.name_en : 'mental health'} professional for their needs.${profCtx}

User's concern: "${problemText}"${specialtyContext}

Available professionals:
${professionalList}

TASK: Based on the user's concern${selectedSpecialtyName ? ' and selected specialty' : ''}, recommend the ONE most appropriate professional from the list above.
Return the professional's ID and a brief reason for your recommendation.

Return your response in the following JSON format:
{
  "recommendedProfessionalId": "the professional ID here",
  "reason": "brief explanation of why this professional is most appropriate"
}`
    : `Eres MarI, un asistente de IA empático que ayuda a los usuarios a encontrar el profesional de ${profession ? profession.name_es : 'salud mental'} adecuado para sus necesidades.${profCtx}

Preocupación del usuario: "${problemText}"${specialtyContext}

Profesionales disponibles:
${professionalList}

TAREA: Basado en la preocupación del usuario${selectedSpecialtyName ? ' y la especialidad seleccionada' : ''}, recomienda el profesional MÁS apropiado de la lista anterior.
Devuelve el ID del profesional y una breve razón de tu recomendación.

Devuelve tu respuesta en el siguiente formato JSON:
{
  "recommendedProfessionalId": "el ID del profesional aquí",
  "reason": "breve explicación de por qué este profesional es más apropiado"
}`;

  const promptMulti = language === 'en'
    ? `You are MarI, an empathetic AI assistant helping users find the right ${profession ? profession.name_en : 'mental health'} professionals for their needs.${profCtx}

User's concern: "${problemText}"${specialtyContext}

Available professionals:
${professionalList}

There are MORE THAN FIVE professionals. Recommend EXACTLY THREE distinct professionals who are the best match (best first). Use only UUIDs from the "ID:" lines above.

Return JSON only:
{
  "suggestions": ["uuid-best", "uuid-second", "uuid-third"],
  "reason": "Brief explanation for these three matches, in order."
}`
    : `Eres MarI, un asistente de IA empático que ayuda a los usuarios a encontrar profesionales de ${profession ? profession.name_es : 'salud mental'} adecuados.${profCtx}

Preocupación del usuario: "${problemText}"${specialtyContext}

Profesionales disponibles:
${professionalList}

Hay MÁS DE CINCO profesionales. Recomienda EXACTAMENTE TRES profesionales distintos que mejor encajen (mejor primero). Usa solo UUID de las líneas "ID:" de arriba.

Devuelve solo JSON:
{
  "suggestions": ["uuid-mejor", "uuid-segundo", "uuid-tercero"],
  "reason": "Breve explicación de estos tres encajes, en orden."
}`;

  try {
    const genAI = getAiInstance();
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        topK: 40,
        responseMimeType: "application/json",
      }
    });

    const useMulti = professionals.length > 5;
    const result = await model.generateContent(useMulti ? promptMulti : promptSingle);
    const responseText = result.response.text();

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      if (useMulti) {
        const { suggestions, reason } = normalizeTherapistIdSuggestions(parsed, professionals);
        if (suggestions.length > 0) {
          return {
            recommendedProfessionalId: suggestions[0],
            recommendedProfessionalIds: suggestions,
            reason: reason || '',
          };
        }
        const fb = await model.generateContent(promptSingle);
        const fbText = fb.response.text();
        const fbMatch = fbText.match(/\{[\s\S]*\}/);
        if (fbMatch) {
          const one = JSON.parse(fbMatch[0]) as { recommendedProfessionalId?: string; reason?: string };
          const id = typeof one.recommendedProfessionalId === 'string' ? one.recommendedProfessionalId.trim() : '';
          if (id && professionals.some((p) => p.id === id)) {
            return { recommendedProfessionalId: id, reason: typeof one.reason === 'string' ? one.reason : '' };
          }
        }
        return { recommendedProfessionalId: '', reason: fbText.trim() };
      }
      const one = parsed as { recommendedProfessionalId?: string; reason?: string };
      return {
        recommendedProfessionalId: typeof one.recommendedProfessionalId === 'string' ? one.recommendedProfessionalId : '',
        reason: typeof one.reason === 'string' ? one.reason : '',
      };
    }

    return {
      recommendedProfessionalId: '',
      reason: responseText.trim()
    };
  } catch (error) {
    console.error('Error calling Gemini API for professional recommendation:', error);
    throw error;
  }
};

/** Translate short catalog labels (English → Spanish) for std_questionnaires display. */
export async function translateQuestionnaireLabels(
  name: string,
  description: string
): Promise<{ name: string; description: string }> {
  const trimmedName = name.trim();
  const trimmedDesc = description.trim();
  if (!trimmedName && !trimmedDesc) {
    return { name, description };
  }
  try {
    const genAI = getAiInstance();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.2, topP: 0.9, topK: 40 },
    });
    const prompt = `Translate these questionnaire catalog strings from English to Spanish. Keep clinical tone. Return ONLY valid JSON, no markdown:
{"name":"...","description":"..."}

name: ${JSON.stringify(trimmedName)}
description: ${JSON.stringify(trimmedDesc)}`;
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { name, description };
    const parsed = JSON.parse(jsonMatch[0]) as { name?: string; description?: string };
    return {
      name: typeof parsed.name === 'string' ? parsed.name : name,
      description: typeof parsed.description === 'string' ? parsed.description : description,
    };
  } catch (error) {
    console.error('translateQuestionnaireLabels:', error);
    return { name, description };
  }
}
