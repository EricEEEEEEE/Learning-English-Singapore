import type { EntryLanguage } from './entry-copy';

// C16 (2026-10-24, zero cost): "make another version", version numbers in my scenes, the review beside another scene,
// and "a bit faster". Help-language text other than Chinese has not been reviewed by native speakers yet.
export const c16CopyReviewed = false;
type Copy = { remake: string; version: (n: number) => string; otherScene: string; otherNote: string; faster: string };
export const c16Copy: Record<EntryLanguage, Copy> = {
  'zh-Hans': { remake: '照这课再做一版', version: n => `第 ${n} 版`, otherScene: '上次在另一个场景（都是入门短课）', otherNote: '只是列出来，不比较高低。', faster: '快一点' },
  id: { remake: 'Buat versi lain dari pelajaran ini', version: n => `Versi ${n}`, otherScene: 'Terakhir di situasi lain (sama-sama pelajaran pendek tingkat awal)', otherNote: 'Hanya ditampilkan berdampingan, tidak dibandingkan mana yang lebih baik.', faster: 'Lebih cepat' },
  ja: { remake: 'この教材をもとに別の版を作る', version: n => `第${n}版`, otherScene: '前回の別の場面（どちらも入門の短い教材）', otherNote: '並べて見せるだけで、良し悪しは比べません。', faster: '少し速く' },
  ko: { remake: '이 수업으로 다른 버전 만들기', version: n => `${n}번째 버전`, otherScene: '지난번 다른 상황 (둘 다 입문 짧은 수업)', otherNote: '나란히 보여 줄 뿐, 잘하고 못함을 비교하지 않아요.', faster: '조금 빠르게' },
  hi: { remake: 'इस पाठ से एक और संस्करण बनाएँ', version: n => `संस्करण ${n}`, otherScene: 'पिछली बार किसी दूसरे दृश्य में (दोनों शुरुआती छोटे पाठ)', otherNote: 'सिर्फ़ साथ में दिखाया गया है, अच्छा-बुरा तुलना नहीं की जाती।', faster: 'थोड़ा तेज़' },
};
