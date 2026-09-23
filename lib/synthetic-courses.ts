import { createFixedLessonSession } from './fixed-lesson-practice';
import type { SyntheticLesson } from './lesson-contract';

export type CourseLanguage = 'zh-Hans' | 'id' | 'ja' | 'ko' | 'hi';
type Sample = { id: string; title: string; lesson: SyntheticLesson };
const translations: Record<CourseLanguage, { titles: string[]; help: string[] }> = {
  'zh-Hans': { titles: ['场边认识另一位家长', '点餐时提出简单请求'], help: ['first time：第一次', 'less spicy：少辣一点'] },
  id: { titles: ['Berkenalan dengan orang tua di tepi lapangan', 'Permintaan sederhana saat memesan makanan'], help: ['first time: pertama kali', 'less spicy: tidak terlalu pedas'] },
  ja: { titles: ['試合会場で保護者にあいさつ', '食事の注文で簡単なお願い'], help: ['first time：初めて', 'less spicy：辛さ控えめ'] },
  ko: { titles: ['경기장에서 다른 보호자에게 인사하기', '음식을 주문하며 간단히 부탁하기'], help: ['first time: 처음', 'less spicy: 덜 맵게'] },
  hi: { titles: ['मैदान के पास दूसरे अभिभावक से मिलना', 'खाना मँगाते समय सरल अनुरोध'], help: ['first time: पहली बार', 'less spicy: कम तीखा'] },
};
const scripts = [
  { id: 'sideline', goal: 'Greet another parent beside the sports field.', roles: ['Another parent', 'You'],
    lines: ['Hello. Is this your first time?', 'Yes. My child is playing today.', 'Would you like to sit here?', 'Thank you. That would be nice.'], wordLine: 0 },
  { id: 'food-order', goal: 'Ask for a simple change when ordering food.', roles: ['Food seller', 'You'],
    lines: ['Hello. What would you like?', 'Could I have this, less spicy?', 'Let me check for you.', 'Thank you. I can wait.'], wordLine: 1 },
];

export function listSyntheticCourses(language: CourseLanguage): Sample[] {
  if (!Object.hasOwn(translations, language)) throw new Error('Unsupported course language');
  const copy = translations[language];
  return scripts.map((script, index) => ({
    id: script.id, title: copy.titles[index],
    lesson: {
      schema: 1, source: 'simulation', eligible_for_assessment: false,
      lesson_revision: `${script.id}/${language}/v1`, scenario_version_id: `${script.id}/${language}`,
      goal_revision: 1, user_goal: script.goal, content_band: 'L0', auxiliary_language: language,
      roles: [{ id: 'partner', label: script.roles[0] }, { id: 'learner', label: script.roles[1] }],
      sentences: script.lines.map((text, line) => ({
        id: `${script.id}-${line + 1}`, role_id: line % 2 === 0 ? 'partner' : 'learner', language: 'en', text,
        action: line % 2 === 0 ? 'speaks to the learner' : 'responds', grounding: 'generic',
        source_refs: [`template:${script.id}`],
        ...(line === script.wordLine ? { support: { language, text: copy.help[index] } } : {}),
      })),
      unknown_facts: ['Actual arrangements and availability are unknown.'],
    },
  }));
}

export function createSyntheticCoursePreview(id: string, language: CourseLanguage) {
  const sample = listSyntheticCourses(language).find(course => course.id === id);
  if (!sample) throw new Error('Unknown synthetic course');
  return createFixedLessonSession(sample.lesson, 'learner');
}
