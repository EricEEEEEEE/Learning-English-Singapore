import type { EntryLanguage } from './entry-copy';

// C7 T14A: the card shown before a generation is submitted. Nothing is saved or sent until "confirm".
// Help-language text other than Chinese has not been reviewed by native speakers yet.
type Copy = {
  title: string; scene: string; keywords: string; none: string; roleUnset: string;
  you: (role: string) => string; partner: (role: string) => string;
  length: string; wait: string; cost: string; confirm: string; edit: string;
};

export const sceneConfirmCopy: Record<EntryLanguage, Copy> = {
  'zh-Hans': {
    title: '确认要生成的场景', scene: '场景', keywords: '关键词', none: '没有填写关键词', roleUnset: '未填写，按场景安排',
    you: role => `你：${role}`, partner: role => `对方：${role}`,
    length: '课程长度：约50秒', wait: '生成需要一些时间，请耐心等待。', cost: '每次生成都会使用项目负责人的费用预算。',
    confirm: '确认生成', edit: '再改改',
  },
  id: {
    title: 'Periksa situasi yang akan dibuat', scene: 'Situasi', keywords: 'Kata kunci', none: 'Tidak ada kata kunci yang diisi', roleUnset: 'belum diisi, mengikuti situasi',
    you: role => `Anda: ${role}`, partner: role => `Lawan bicara: ${role}`,
    length: 'Panjang pelajaran: sekitar 50 detik', wait: 'Pembuatan memerlukan waktu. Mohon bersabar.', cost: 'Setiap pembuatan memakai anggaran biaya pemilik proyek.',
    confirm: 'Ya, buat sekarang', edit: 'Ubah lagi',
  },
  ja: {
    title: '生成する場面の確認', scene: '場面', keywords: 'キーワード', none: 'キーワードは入力されていません', roleUnset: '未入力（場面に合わせます）',
    you: role => `あなた：${role}`, partner: role => `相手：${role}`,
    length: 'レッスンの長さ：約50秒', wait: '生成には少し時間がかかります。しばらくお待ちください。', cost: '生成するたびに、プロジェクト責任者の費用予算を使います。',
    confirm: '生成する', edit: 'もう少し直す',
  },
  ko: {
    title: '만들 상황 확인', scene: '상황', keywords: '키워드', none: '입력한 키워드가 없어요', roleUnset: '입력하지 않음, 상황에 맞춤',
    you: role => `나: ${role}`, partner: role => `상대: ${role}`,
    length: '수업 길이: 약 50초', wait: '만드는 데 시간이 조금 걸려요. 잠시 기다려 주세요.', cost: '만들 때마다 프로젝트 책임자의 비용 예산을 사용해요.',
    confirm: '네, 만들어 주세요', edit: '조금 더 고치기',
  },
  hi: {
    title: 'बनने वाले दृश्य की पुष्टि करें', scene: 'दृश्य', keywords: 'मुख्य शब्द', none: 'कोई मुख्य शब्द नहीं भरा गया', roleUnset: 'नहीं भरा, दृश्य के अनुसार',
    you: role => `आप: ${role}`, partner: role => `सामने वाला: ${role}`,
    length: 'पाठ की लंबाई: लगभग 50 सेकंड', wait: 'बनने में कुछ समय लगता है। कृपया धैर्य रखें।', cost: 'हर बार बनाने पर प्रोजेक्ट के ज़िम्मेदार व्यक्ति का खर्च बजट इस्तेमाल होता है।',
    confirm: 'हाँ, बनाएँ', edit: 'थोड़ा और बदलें',
  },
};
