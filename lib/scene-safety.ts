import type { SceneKeywords } from './scene-requirement-content';

// C8-6 (spec F12.4): scenes about a clinic or an official procedure get a note that this is communication
// practice, not a medical or official conclusion. The rule is deliberately simple and visible: a scene counts when
// its own description or keywords contain one of the words below, in any of the five help languages or English.
// Words that also appear in everyday scenes (for example "办理" in hotel check-in, or Korean "약" inside "예약")
// are left out on purpose; a missed scene only loses an extra note, it never changes the lesson.
const medical = [
  '诊所', '医生', '医院', '病人', '看病', '看诊', '牙医', '药房', '体检', '护士',
  'klinik', 'dokter', 'pasien', 'rumah sakit', 'apotek', 'perawat',
  'クリニック', '患者', '病院', '医者', '診察', '薬局', '歯医者', '看護師',
  '병원', '환자', '의사', '진료', '약국', '치과', '간호사',
  'क्लिनिक', 'डॉक्टर', 'मरीज़', 'अस्पताल', 'दवा', 'नर्स',
  'clinic', 'doctor', 'hospital', 'patient', 'nurse', 'pharmacy', 'dentist', 'polyclinic',
];
const official = [
  '政府', '签证', '准证', '移民局', '公民', '证件',
  'pemerintah', 'visa', 'imigrasi', 'izin kerja',
  '役所', 'ビザ', '在留', '入国管理',
  '관공서', '비자', '출입국', '정부', '구청',
  'सरकारी', 'वीज़ा', 'इमिग्रेशन', 'वर्क परमिट',
  'government', 'work pass', 'permit', 'immigration', 'ministry',
];

export type SceneSafetyKind = 'medical' | 'official';

export function sceneSafetyKind(content: { description: string; keywords: SceneKeywords | Record<string, string> }): SceneSafetyKind | null {
  const text = [content.description, ...Object.values(content.keywords ?? {})].join(' ').toLowerCase();
  if (medical.some(word => text.includes(word))) return 'medical';
  if (official.some(word => text.includes(word))) return 'official';
  return null;
}
