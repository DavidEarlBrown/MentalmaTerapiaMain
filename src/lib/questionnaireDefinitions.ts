export interface Questionnaire {
  id: string;
  name_en: string;
  name_es: string;
  description_en: string;
  description_es: string;
  questions: Array<{
    question_en: string;
    question_es: string;
    options_en: string[];
    options_es: string[];
  }>;
}

export const standardQuestionnaires: Questionnaire[] = [
  {
    id: 'phq9',
    name_en: 'PHQ-9 (Depression Screening)',
    name_es: 'PHQ-9 (Evaluación de Depresión)',
    description_en: 'The Patient Health Questionnaire-9 (PHQ-9) is a widely used tool for screening and measuring the severity of depression.',
    description_es: 'El Cuestionario de Salud del Paciente-9 (PHQ-9) es una herramienta ampliamente utilizada para detectar y medir la gravedad de la depresión.',
    questions: [
      {
        question_en: 'Little interest or pleasure in doing things',
        question_es: 'Poco interés o placer en hacer cosas',
        options_en: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
        options_es: ['Para nada', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días']
      },
      {
        question_en: 'Feeling down, depressed, or hopeless',
        question_es: 'Sentirse decaído, deprimido o sin esperanzas',
        options_en: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
        options_es: ['Para nada', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días']
      },
      {
        question_en: 'Trouble falling or staying asleep, or sleeping too much',
        question_es: 'Problemas para dormir, mantenerse dormido o dormir demasiado',
        options_en: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
        options_es: ['Para nada', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días']
      },
      {
        question_en: 'Feeling tired or having little energy',
        question_es: 'Sentirse cansado o tener poca energía',
        options_en: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
        options_es: ['Para nada', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días']
      },
      {
        question_en: 'Poor appetite or overeating',
        question_es: 'Poco apetito o comer en exceso',
        options_en: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
        options_es: ['Para nada', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días']
      },
      {
        question_en: 'Feeling bad about yourself - or that you are a failure or have let yourself or your family down',
        question_es: 'Sentirse mal acerca de sí mismo, o que es un fracaso o que ha defraudado a sí mismo o a su familia',
        options_en: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
        options_es: ['Para nada', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días']
      },
      {
        question_en: 'Trouble concentrating on things, such as reading the newspaper or watching television',
        question_es: 'Problemas para concentrarse en cosas como leer el periódico o ver televisión',
        options_en: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
        options_es: ['Para nada', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días']
      },
      {
        question_en: 'Moving or speaking so slowly that other people could have noticed. Or the opposite - being so fidgety or restless that you have been moving around a lot more than usual',
        question_es: 'Moverse o hablar tan lento que otras personas podrían haberlo notado. O lo contrario - estar tan inquieto o intranquilo que se ha estado moviendo mucho más de lo usual',
        options_en: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
        options_es: ['Para nada', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días']
      },
      {
        question_en: 'Thoughts that you would be better off dead, or of hurting yourself',
        question_es: 'Pensamientos de que estaría mejor muerto o de lastimarse de alguna manera',
        options_en: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
        options_es: ['Para nada', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días']
      }
    ]
  },
  {
    id: 'gad7',
    name_en: 'GAD-7 (Anxiety Screening)',
    name_es: 'GAD-7 (Evaluación de Ansiedad)',
    description_en: 'The Generalized Anxiety Disorder-7 (GAD-7) is a screening tool for assessing anxiety symptoms and their severity.',
    description_es: 'El Trastorno de Ansiedad Generalizada-7 (GAD-7) es una herramienta de detección para evaluar los síntomas de ansiedad y su gravedad.',
    questions: [
      {
        question_en: 'Feeling nervous, anxious, or on edge',
        question_es: 'Sentirse nervioso, ansioso o con los nervios de punta',
        options_en: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
        options_es: ['Para nada', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días']
      },
      {
        question_en: 'Not being able to stop or control worrying',
        question_es: 'No poder dejar de preocuparse o no poder controlar la preocupación',
        options_en: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
        options_es: ['Para nada', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días']
      },
      {
        question_en: 'Worrying too much about different things',
        question_es: 'Preocuparse demasiado por diferentes cosas',
        options_en: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
        options_es: ['Para nada', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días']
      },
      {
        question_en: 'Trouble relaxing',
        question_es: 'Problemas para relajarse',
        options_en: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
        options_es: ['Para nada', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días']
      },
      {
        question_en: 'Being so restless that it is hard to sit still',
        question_es: 'Estar tan inquieto que es difícil permanecer sentado',
        options_en: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
        options_es: ['Para nada', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días']
      },
      {
        question_en: 'Becoming easily annoyed or irritable',
        question_es: 'Molestarse o irritarse fácilmente',
        options_en: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
        options_es: ['Para nada', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días']
      },
      {
        question_en: 'Feeling afraid, as if something awful might happen',
        question_es: 'Sentir miedo, como si algo terrible pudiera suceder',
        options_en: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
        options_es: ['Para nada', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días']
      }
    ]
  },
  {
    id: 'pcl5',
    name_en: 'PCL-5 (PTSD Screening)',
    name_es: 'PCL-5 (Evaluación de TEPT)',
    description_en: 'The PTSD Checklist for DSM-5 (PCL-5) is a self-report measure used to assess symptoms of Post-Traumatic Stress Disorder.',
    description_es: 'La Lista de Verificación de TEPT para DSM-5 (PCL-5) es una medida de autoinforme utilizada para evaluar los síntomas del Trastorno de Estrés Postraumático.',
    questions: [
      {
        question_en: 'Repeated, disturbing, and unwanted memories of the stressful experience',
        question_es: 'Recuerdos repetidos, perturbadores y no deseados de la experiencia estresante',
        options_en: ['Not at all', 'A little bit', 'Moderately', 'Quite a bit', 'Extremely'],
        options_es: ['Para nada', 'Un poco', 'Moderadamente', 'Bastante', 'Extremadamente']
      },
      {
        question_en: 'Repeated, disturbing dreams of the stressful experience',
        question_es: 'Sueños perturbadores repetidos de la experiencia estresante',
        options_en: ['Not at all', 'A little bit', 'Moderately', 'Quite a bit', 'Extremely'],
        options_es: ['Para nada', 'Un poco', 'Moderadamente', 'Bastante', 'Extremadamente']
      },
      {
        question_en: 'Suddenly feeling or acting as if the stressful experience were actually happening again',
        question_es: 'Sentir o actuar repentinamente como si la experiencia estresante estuviera sucediendo nuevamente',
        options_en: ['Not at all', 'A little bit', 'Moderately', 'Quite a bit', 'Extremely'],
        options_es: ['Para nada', 'Un poco', 'Moderadamente', 'Bastante', 'Extremadamente']
      },
      {
        question_en: 'Feeling very upset when something reminded you of the stressful experience',
        question_es: 'Sentirse muy molesto cuando algo le recordaba la experiencia estresante',
        options_en: ['Not at all', 'A little bit', 'Moderately', 'Quite a bit', 'Extremely'],
        options_es: ['Para nada', 'Un poco', 'Moderadamente', 'Bastante', 'Extremadamente']
      },
      {
        question_en: 'Having strong physical reactions when something reminded you of the stressful experience',
        question_es: 'Tener reacciones físicas fuertes cuando algo le recordaba la experiencia estresante',
        options_en: ['Not at all', 'A little bit', 'Moderately', 'Quite a bit', 'Extremely'],
        options_es: ['Para nada', 'Un poco', 'Moderadamente', 'Bastante', 'Extremadamente']
      }
    ]
  },
  {
    id: 'ybocs',
    name_en: 'Y-BOCS (OCD Screening)',
    name_es: 'Y-BOCS (Evaluación de TOC)',
    description_en: 'The Yale-Brown Obsessive Compulsive Scale (Y-BOCS) is used to assess the severity of obsessive-compulsive symptoms.',
    description_es: 'La Escala Yale-Brown de Trastorno Obsesivo Compulsivo (Y-BOCS) se utiliza para evaluar la gravedad de los síntomas obsesivo-compulsivos.',
    questions: [
      {
        question_en: 'How much time do you spend on obsessive thoughts?',
        question_es: '¿Cuánto tiempo pasa con pensamientos obsesivos?',
        options_en: ['None', 'Less than 1 hour', '1-3 hours', '3-8 hours', 'More than 8 hours'],
        options_es: ['Ninguno', 'Menos de 1 hora', '1-3 horas', '3-8 horas', 'Más de 8 horas']
      },
      {
        question_en: 'How much do these obsessive thoughts interfere with your daily activities?',
        question_es: '¿Cuánto interfieren estos pensamientos obsesivos con sus actividades diarias?',
        options_en: ['Not at all', 'Mild interference', 'Moderate interference', 'Severe interference', 'Extreme interference'],
        options_es: ['Para nada', 'Interferencia leve', 'Interferencia moderada', 'Interferencia severa', 'Interferencia extrema']
      },
      {
        question_en: 'How much distress do your obsessive thoughts cause you?',
        question_es: '¿Cuánta angustia le causan sus pensamientos obsesivos?',
        options_en: ['None', 'Mild distress', 'Moderate distress', 'Severe distress', 'Extreme distress'],
        options_es: ['Ninguna', 'Angustia leve', 'Angustia moderada', 'Angustia severa', 'Angustia extrema']
      },
      {
        question_en: 'How much time do you spend performing compulsive behaviors?',
        question_es: '¿Cuánto tiempo pasa realizando comportamientos compulsivos?',
        options_en: ['None', 'Less than 1 hour', '1-3 hours', '3-8 hours', 'More than 8 hours'],
        options_es: ['Ninguno', 'Menos de 1 hora', '1-3 horas', '3-8 horas', 'Más de 8 horas']
      },
      {
        question_en: 'How much do these compulsive behaviors interfere with your daily activities?',
        question_es: '¿Cuánto interfieren estos comportamientos compulsivos con sus actividades diarias?',
        options_en: ['Not at all', 'Mild interference', 'Moderate interference', 'Severe interference', 'Extreme interference'],
        options_es: ['Para nada', 'Interferencia leve', 'Interferencia moderada', 'Interferencia severa', 'Interferencia extrema']
      }
    ]
  },
  {
    id: 'enneagram',
    name_en: 'Enneagram Personality Test',
    name_es: 'Test de Eneagrama de Personalidad',
    description_en: 'The Enneagram is a personality framework that identifies 9 distinct personality types, each with unique motivations, fears, and patterns of behavior.',
    description_es: 'El Eneagrama es un marco de personalidad que identifica 9 tipos de personalidad distintos, cada uno con motivaciones, miedos y patrones de comportamiento únicos.',
    questions: [
      {
        question_en: 'I often feel the need to do things perfectly and get frustrated when things are not done correctly',
        question_es: 'A menudo siento la necesidad de hacer las cosas perfectamente y me frustro cuando las cosas no se hacen correctamente',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I feel most fulfilled when I am helping others and making them feel loved and appreciated',
        question_es: 'Me siento más realizado cuando estoy ayudando a otros y haciéndolos sentir amados y apreciados',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'Success and achievement are very important to me, and I work hard to reach my goals',
        question_es: 'El éxito y los logros son muy importantes para mí, y trabajo duro para alcanzar mis metas',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I often feel different from others and seek to express my unique identity and emotions',
        question_es: 'A menudo me siento diferente de los demás y busco expresar mi identidad única y emociones',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I prefer to observe and analyze situations before taking action, and value knowledge and understanding',
        question_es: 'Prefiero observar y analizar situaciones antes de actuar, y valoro el conocimiento y la comprensión',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I tend to be cautious and seek security, often preparing for worst-case scenarios',
        question_es: 'Tiendo a ser cauteloso y busco seguridad, a menudo preparándome para los peores escenarios',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I love new experiences and variety, and often seek adventure and fun activities',
        question_es: 'Me encantan las nuevas experiencias y la variedad, y a menudo busco aventuras y actividades divertidas',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I am assertive and direct, and feel comfortable taking charge in difficult situations',
        question_es: 'Soy asertivo y directo, y me siento cómodo tomando el control en situaciones difíciles',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I value peace and harmony, and often avoid conflict by going along with others',
        question_es: 'Valoro la paz y la armonía, y a menudo evito el conflicto siguiendo la corriente con los demás',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I have a strong inner critic and hold high standards for myself and others',
        question_es: 'Tengo un fuerte crítico interno y mantengo altos estándares para mí mismo y para los demás',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I sometimes neglect my own needs because I am so focused on taking care of others',
        question_es: 'A veces descuido mis propias necesidades porque estoy tan enfocado en cuidar a los demás',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I adapt my image to different situations and am skilled at presenting myself well',
        question_es: 'Adapto mi imagen a diferentes situaciones y soy hábil para presentarme bien',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I am drawn to beauty and meaning, and can be quite introspective about my feelings',
        question_es: 'Me atrae la belleza y el significado, y puedo ser bastante introspectivo acerca de mis sentimientos',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I need time alone to recharge and process information, and can be emotionally reserved',
        question_es: 'Necesito tiempo a solas para recargarme y procesar información, y puedo ser emocionalmente reservado',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I value loyalty and commitment, and can be skeptical of others until they prove trustworthy',
        question_es: 'Valoro la lealtad y el compromiso, y puedo ser escéptico de los demás hasta que demuestren ser confiables',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I find it hard to stay focused on one thing and prefer to keep my options open',
        question_es: 'Me resulta difícil mantenerme enfocado en una cosa y prefiero mantener mis opciones abiertas',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I am protective of those I care about and am not afraid to confront injustice',
        question_es: 'Soy protector con aquellos que me importan y no tengo miedo de confrontar la injusticia',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I tend to see multiple perspectives and can have difficulty making decisions',
        question_es: 'Tiendo a ver múltiples perspectivas y puedo tener dificultad para tomar decisiones',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      }
    ]
  },
  {
    id: 'attachment-style',
    name_en: 'Attachment Style Test',
    name_es: 'Test de Tipo de Apego',
    description_en: 'Based on Amir Levine\'s attachment theory, this test helps identify your attachment style in relationships: Secure, Anxious, or Avoidant.',
    description_es: 'Basado en la teoría del apego de Amir Levine, este test ayuda a identificar tu estilo de apego en las relaciones: Seguro, Ansioso o Evitativo.',
    questions: [
      {
        question_en: 'I find it relatively easy to get close to others and feel comfortable depending on them',
        question_es: 'Me resulta relativamente fácil acercarme a otros y me siento cómodo dependiendo de ellos',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I worry that my partner doesn\'t really love me or won\'t want to stay with me',
        question_es: 'Me preocupa que mi pareja realmente no me ame o no quiera quedarse conmigo',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I prefer not to show a partner how I feel deep down and value my independence highly',
        question_es: 'Prefiero no mostrar a mi pareja cómo me siento en el fondo y valoro mucho mi independencia',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I am comfortable expressing my needs and feelings to my partner',
        question_es: 'Me siento cómodo expresando mis necesidades y sentimientos a mi pareja',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I often worry about being abandoned or rejected by my partner',
        question_es: 'A menudo me preocupa ser abandonado o rechazado por mi pareja',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I feel uncomfortable when a relationship becomes too close or intimate',
        question_es: 'Me siento incómodo cuando una relación se vuelve demasiado cercana o íntima',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I trust that my partner cares about me and will be there when I need them',
        question_es: 'Confío en que mi pareja se preocupa por mí y estará ahí cuando lo necesite',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I need a lot of reassurance that I am loved and valued in my relationship',
        question_es: 'Necesito mucha seguridad de que soy amado y valorado en mi relación',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I am nervous when partners get too close and prefer to maintain emotional distance',
        question_es: 'Me pongo nervioso cuando las parejas se acercan demasiado y prefiero mantener distancia emocional',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I can depend on others and have others depend on me without feeling anxious',
        question_es: 'Puedo depender de otros y que otros dependan de mí sin sentirme ansioso',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      }
    ]
  },
  {
    id: 'partner-type',
    name_en: 'Partner Type Test',
    name_es: 'Test de Tipo de Pareja',
    description_en: 'Discover your relationship pattern: Fixer, Supporter, Pleaser, Avoider, Anchor, Stormer, or Withdrawer.',
    description_es: 'Descubre tu patrón de relación: Reparador, Apoyo, Complaciente, Evitador, Ancla, Tormentoso o Retraído.',
    questions: [
      {
        question_en: 'I often try to solve my partner\'s problems even when they haven\'t asked for help',
        question_es: 'A menudo intento resolver los problemas de mi pareja incluso cuando no han pedido ayuda',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I prioritize being there for my partner and encouraging their growth and dreams',
        question_es: 'Priorizo estar ahí para mi pareja y fomentar su crecimiento y sueños',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I frequently put my partner\'s needs and wants before my own, even at my own expense',
        question_es: 'Con frecuencia pongo las necesidades y deseos de mi pareja antes que los míos, incluso a mi propia costa',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'When conflicts arise, I tend to shut down or distance myself emotionally',
        question_es: 'Cuando surgen conflictos, tiendo a cerrarme o distanciarme emocionalmente',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I provide stability and grounding in my relationship, helping my partner feel secure',
        question_es: 'Proporciono estabilidad y arraigo en mi relación, ayudando a mi pareja a sentirse segura',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I tend to be intense and passionate, sometimes creating drama or conflict in relationships',
        question_es: 'Tiendo a ser intenso y apasionado, a veces creando drama o conflicto en las relaciones',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'When things get difficult, I prefer to retreat and process things alone',
        question_es: 'Cuando las cosas se ponen difíciles, prefiero retirarme y procesar las cosas solo',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I see my partner\'s flaws and feel compelled to help them improve or change',
        question_es: 'Veo los defectos de mi pareja y me siento obligado a ayudarles a mejorar o cambiar',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I celebrate my partner\'s successes and offer emotional support without trying to control',
        question_es: 'Celebro los éxitos de mi pareja y ofrezco apoyo emocional sin tratar de controlar',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I have difficulty saying no to my partner for fear of disappointing them',
        question_es: 'Tengo dificultad para decir que no a mi pareja por miedo a decepcionarlos',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I tend to suppress my emotions and avoid difficult conversations in my relationship',
        question_es: 'Tiendo a suprimir mis emociones y evitar conversaciones difíciles en mi relación',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I remain calm and balanced during relationship challenges, providing a steady presence',
        question_es: 'Me mantengo calmado y equilibrado durante los desafíos de la relación, proporcionando una presencia estable',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'My emotions can be volatile, and I may escalate conflicts rather than de-escalate them',
        question_es: 'Mis emociones pueden ser volátiles, y puedo escalar conflictos en lugar de desescalarlos',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I need significant alone time to recharge after emotional interactions',
        question_es: 'Necesito un tiempo significativo a solas para recargarme después de interacciones emocionales',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      }
    ]
  },
  {
    id: 'love-language',
    name_en: 'Love Languages Test',
    name_es: 'Test de Lenguajes del Amor',
    description_en: 'Based on Gary Chapman\'s theory, discover your primary love language: Words of Affirmation, Quality Time, Physical Touch, Acts of Service, or Receiving Gifts.',
    description_es: 'Basado en la teoría de Gary Chapman, descubre tu lenguaje de amor principal: Palabras de Afirmación, Tiempo de Calidad, Contacto Físico, Actos de Servicio o Recibir Regalos.',
    questions: [
      {
        question_en: 'I feel most loved when my partner tells me they appreciate and value me',
        question_es: 'Me siento más amado cuando mi pareja me dice que me aprecia y me valora',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'Spending uninterrupted, focused time with my partner makes me feel deeply connected',
        question_es: 'Pasar tiempo ininterrumpido y enfocado con mi pareja me hace sentir profundamente conectado',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'Physical affection like hugs, kisses, and holding hands is essential for me to feel loved',
        question_es: 'El afecto físico como abrazos, besos y tomarse de las manos es esencial para que me sienta amado',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'When my partner does helpful things for me without being asked, it makes me feel cherished',
        question_es: 'Cuando mi pareja hace cosas útiles por mí sin que se lo pida, me hace sentir valorado',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'Receiving thoughtful gifts from my partner, big or small, makes me feel special and loved',
        question_es: 'Recibir regalos reflexivos de mi pareja, grandes o pequeños, me hace sentir especial y amado',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'Compliments and encouraging words from my partner mean the world to me',
        question_es: 'Los cumplidos y las palabras de aliento de mi pareja significan el mundo para mí',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'Having my partner\'s full attention during conversations and activities is very important to me',
        question_es: 'Tener la atención completa de mi pareja durante conversaciones y actividades es muy importante para mí',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I feel disconnected from my partner when physical affection is lacking',
        question_es: 'Me siento desconectado de mi pareja cuando falta el afecto físico',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'Actions speak louder than words - I value when my partner shows love through helpful actions',
        question_es: 'Los hechos hablan más que las palabras - valoro cuando mi pareja muestra amor a través de acciones útiles',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'The symbolic thought and effort behind a gift matters more to me than its monetary value',
        question_es: 'El pensamiento simbólico y el esfuerzo detrás de un regalo importa más para mí que su valor monetario',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'Hearing "I love you" and other affirming words regularly is crucial for my emotional well-being',
        question_es: 'Escuchar "te amo" y otras palabras afirmativas regularmente es crucial para mi bienestar emocional',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I feel most valued when my partner actively plans quality time for just the two of us',
        question_es: 'Me siento más valorado cuando mi pareja planifica activamente tiempo de calidad solo para nosotros dos',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      }
    ]
  },
  {
    id: 'self-love',
    name_en: 'Self-Love and Emotional Well-being Test',
    name_es: 'Test de Amor Propio y Bienestar Emocional',
    description_en: 'Based on theories from Bowlby, Ainsworth, Rogers, Satir, Bowen, Minuchin, Porges, van der Kolk, Levine, Ogden, Neff, Johnson, Fisher, Maté, and Siegel, this test assesses your relationship with yourself.',
    description_es: 'Basado en teorías de Bowlby, Ainsworth, Rogers, Satir, Bowen, Minuchin, Porges, van der Kolk, Levine, Ogden, Neff, Johnson, Fisher, Maté y Siegel, este test evalúa tu relación contigo mismo.',
    questions: [
      {
        question_en: 'I treat myself with kindness and understanding when I make mistakes or fail',
        question_es: 'Me trato con amabilidad y comprensión cuando cometo errores o fallo',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I feel secure in my sense of self and don\'t need constant external validation',
        question_es: 'Me siento seguro en mi sentido de identidad y no necesito validación externa constante',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I am able to regulate my emotions and respond rather than react to stressful situations',
        question_es: 'Soy capaz de regular mis emociones y responder en lugar de reaccionar ante situaciones estresantes',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I recognize and honor my own needs as being just as important as others\' needs',
        question_es: 'Reconozco y honro mis propias necesidades como igual de importantes que las necesidades de los demás',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I have healthy boundaries and can say no without excessive guilt',
        question_es: 'Tengo límites saludables y puedo decir que no sin culpa excesiva',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I feel connected to my body and can sense when something is emotionally or physically wrong',
        question_es: 'Me siento conectado con mi cuerpo y puedo sentir cuando algo está mal emocional o físicamente',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I accept myself unconditionally, including my flaws and imperfections',
        question_es: 'Me acepto incondicionalmente, incluyendo mis defectos e imperfecciones',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I can self-soothe and comfort myself during difficult emotional moments',
        question_es: 'Puedo auto-consolarme y confortarme durante momentos emocionales difíciles',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I am aware of my emotional patterns and can understand how my past influences my present',
        question_es: 'Soy consciente de mis patrones emocionales y puedo entender cómo mi pasado influye en mi presente',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I prioritize self-care and make time for activities that nourish my well-being',
        question_es: 'Priorizo el autocuidado y dedico tiempo a actividades que nutren mi bienestar',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I can express my authentic self without fear of rejection or judgment',
        question_es: 'Puedo expresar mi yo auténtico sin miedo al rechazo o juicio',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I experience feelings of safety and calm in my nervous system most of the time',
        question_es: 'Experimento sentimientos de seguridad y calma en mi sistema nervioso la mayor parte del tiempo',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I can acknowledge my pain and suffering with self-compassion rather than self-criticism',
        question_es: 'Puedo reconocer mi dolor y sufrimiento con autocompasión en lugar de autocrítica',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I maintain a sense of self even in close relationships and don\'t lose my identity',
        question_es: 'Mantengo un sentido de identidad incluso en relaciones cercanas y no pierdo mi identidad',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      },
      {
        question_en: 'I am able to heal from emotional wounds and don\'t remain stuck in past trauma',
        question_es: 'Soy capaz de sanar de heridas emocionales y no me quedo atrapado en traumas pasados',
        options_en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        options_es: ['Nunca', 'Raramente', 'A veces', 'A menudo', 'Siempre']
      }
    ]
  },
  {
    id: 'energy-balance',
    name_en: 'Feminine and Masculine Energy Balance Test',
    name_es: 'Test de Balance entre Energía Femenina y Masculina',
    description_en: 'Based on theories from John Gray, Carl Jung, David Deida, Esther Perel, Tony Robbins, Harville Hendrix, and Mantak Chia, this test explores your energetic balance.',
    description_es: 'Basado en teorías de John Gray, Carl Jung, David Deida, Esther Perel, Tony Robbins, Harville Hendrix y Mantak Chia, este test explora tu balance energético.',
    questions: [
      {
        question_en: 'I am naturally action-oriented and feel fulfilled when achieving goals and solving problems',
        question_es: 'Soy naturalmente orientado a la acción y me siento realizado al lograr metas y resolver problemas',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I prioritize intuition, emotions, and connection when making decisions and relating to others',
        question_es: 'Priorizo la intuición, las emociones y la conexión al tomar decisiones y relacionarme con otros',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I value structure, logic, and directness in my approach to life and relationships',
        question_es: 'Valoro la estructura, la lógica y la franqueza en mi enfoque de la vida y las relaciones',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I am comfortable with flow, receptivity, and allowing things to unfold naturally',
        question_es: 'Me siento cómodo con el flujo, la receptividad y permitir que las cosas se desarrollen naturalmente',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I feel energized when I am leading, protecting, and providing for others',
        question_es: 'Me siento energizado cuando estoy liderando, protegiendo y proveyendo para otros',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I feel most alive when I am nurturing, creating, and expressing myself emotionally',
        question_es: 'Me siento más vivo cuando estoy nutriendo, creando y expresándome emocionalmente',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I prefer to analyze situations rationally and make decisions based on facts and outcomes',
        question_es: 'Prefiero analizar situaciones racionalmente y tomar decisiones basadas en hechos y resultados',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I value emotional depth, empathy, and understanding in my interactions with others',
        question_es: 'Valoro la profundidad emocional, la empatía y la comprensión en mis interacciones con otros',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I am driven by purpose, mission, and the desire to accomplish and build things',
        question_es: 'Me impulsa el propósito, la misión y el deseo de lograr y construir cosas',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I am drawn to beauty, sensuality, and the experience of being present in the moment',
        question_es: 'Me atrae la belleza, la sensualidad y la experiencia de estar presente en el momento',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I find fulfillment in independence, competition, and achieving personal success',
        question_es: 'Encuentro satisfacción en la independencia, la competencia y el logro del éxito personal',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I find fulfillment in collaboration, community, and deep relational connection',
        question_es: 'Encuentro satisfacción en la colaboración, la comunidad y la conexión relacional profunda',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I can easily access both my assertive/directive side and my receptive/nurturing side',
        question_es: 'Puedo acceder fácilmente tanto a mi lado asertivo/directivo como a mi lado receptivo/nutritivo',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      },
      {
        question_en: 'I feel balanced between doing and being, thinking and feeling, giving and receiving',
        question_es: 'Me siento equilibrado entre hacer y ser, pensar y sentir, dar y recibir',
        options_en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        options_es: ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']
      }
    ]
  }
];
