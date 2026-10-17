import type { EntryLanguage } from './entry-copy';
import type { SceneSeedCategory } from '../lib/scene-seeds';

// C7 T30A: labels for browsing the local example scenes on the scene input page.
// Help-language text other than Chinese has not been reviewed by native speakers yet.
type Copy = { open: string; categoriesLabel: string; listLabel: string; note: string; picked: string; categories: Record<SceneSeedCategory, string> };

export const sceneSeedCopy: Record<EntryLanguage, Copy> = {
  'zh-Hans': {
    open: '浏览更多本地场景', categoriesLabel: '场景类别', listLabel: '示例场景',
    note: '示例场景是合成内容，尚未经本地审核，可以随意修改。', picked: '已填入示例，可以修改后再继续。',
    categories: { school: '家校', work: '工作', clinic: '诊所预约', transport: '交通', home: '居家邻里', food: '饮食' },
  },
  id: {
    open: 'Lihat situasi lokal lainnya', categoriesLabel: 'Kategori situasi', listLabel: 'Contoh situasi lokal',
    note: 'Contoh situasi ini buatan dan belum ditinjau secara lokal. Silakan ubah sesuka Anda.', picked: 'Contoh sudah diisi. Anda bisa mengubahnya sebelum lanjut.',
    categories: { school: 'Sekolah', work: 'Pekerjaan', clinic: 'Janji klinik', transport: 'Transportasi', home: 'Rumah dan tetangga', food: 'Makanan dan minuman' },
  },
  ja: {
    open: 'ほかの地元の場面を見る', categoriesLabel: '場面の種類', listLabel: '地元の場面の例',
    note: 'これらの例は作成したもので、地元の人による確認はまだです。自由に書き換えてください。', picked: '例を入力しました。書き換えてから次へ進めます。',
    categories: { school: '学校', work: '仕事', clinic: 'クリニックの予約', transport: '交通', home: '住まいと近所', food: '食べ物と飲み物' },
  },
  ko: {
    open: '다른 현지 상황 둘러보기', categoriesLabel: '상황 종류', listLabel: '현지 상황 예시',
    note: '이 예시는 만들어 낸 내용이며 아직 현지 검토를 받지 않았어요. 자유롭게 고쳐 쓰세요.', picked: '예시를 넣었어요. 고친 뒤에 계속할 수 있어요.',
    categories: { school: '학교', work: '일', clinic: '병원 예약', transport: '교통', home: '집과 이웃', food: '음식과 음료' },
  },
  hi: {
    open: 'और स्थानीय परिस्थितियाँ देखें', categoriesLabel: 'परिस्थिति के प्रकार', listLabel: 'स्थानीय परिस्थितियों के उदाहरण',
    note: 'ये उदाहरण बनाए गए हैं और इनकी स्थानीय समीक्षा अभी नहीं हुई है। आप इन्हें जैसे चाहें बदल सकते हैं।', picked: 'उदाहरण भर दिया गया है। आगे बढ़ने से पहले बदल सकते हैं।',
    categories: { school: 'स्कूल', work: 'काम', clinic: 'क्लिनिक अपॉइंटमेंट', transport: 'यातायात', home: 'घर और पड़ोस', food: 'खाना-पीना' },
  },
};
