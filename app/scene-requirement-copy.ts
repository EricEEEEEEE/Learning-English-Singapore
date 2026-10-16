import type { EntryLanguage } from './entry-copy';
import type { SceneKeywords } from '../lib/scene-requirement-content';

type Copy = { fields: Record<keyof SceneKeywords, { label: string; example: string }>; hint: string; save: string; saved: string; saving: string; loading: string; readError: string; retry: string; saveError: string; conflict: string; loadSaved: string; local: string };

export const sceneRequirementCopy: Record<EntryLanguage, Copy> = {
  'zh-Hans': {
    fields: {
      location: { label: '在哪里？', example: '例如：学校、同学家、酒店前台' },
      learnerRole: { label: '你在场景里是谁？', example: '例如：家长、新同事、住客' },
      partnerRole: { label: '你要和谁说话？', example: '例如：老师、另一位家长、前台人员' },
      topic: { label: '主要想聊什么？', example: '例如：孩子的学校生活、周末活动' },
      goal: { label: '希望达到什么结果？', example: '例如：问清时间、认识对方、办好入住' },
      special: { label: '有什么特别情况？', example: '例如：第一次见面，希望慢一点' },
    },
    hint: '只填你知道的，可以留空，用几个关键词就好。', save: '保存需求', saved: '需求已保存。', saving: '正在保存…', loading: '正在读取你的需求…',
    readError: '暂时无法读取已保存需求，请重试。', retry: '重新读取需求', saveError: '暂时没有确认保存成功，输入仍在，可以重试。',
    conflict: '其他页面已保存了新版本。你的输入仍在，请先载入已保存版本再修改。', loadSaved: '载入已保存版本', local: '保存到当前电脑的账号空间，尚未生成课程。',
  },
  id: {
    fields: {
      location: { label: 'Di mana?', example: 'Misalnya: sekolah, rumah teman, resepsionis hotel' },
      learnerRole: { label: 'Peran Anda?', example: 'Misalnya: orang tua, rekan baru, tamu hotel' },
      partnerRole: { label: 'Dengan siapa Anda akan berbicara?', example: 'Misalnya: guru, orang tua lain, resepsionis' },
      topic: { label: 'Apa yang ingin dibicarakan?', example: 'Misalnya: kegiatan anak di sekolah, acara akhir pekan' },
      goal: { label: 'Apa tujuan Anda?', example: 'Misalnya: memastikan waktu atau berkenalan' },
      special: { label: 'Ada hal khusus?', example: 'Misalnya: pertama kali bertemu, bicara lebih pelan' },
    },
    hint: 'Isi yang Anda tahu saja. Boleh kosong; beberapa kata kunci cukup.', save: 'Simpan kebutuhan', saved: 'Kebutuhan tersimpan.', saving: 'Menyimpan…', loading: 'Membaca kebutuhan Anda…',
    readError: 'Kebutuhan tersimpan belum dapat dibaca. Coba lagi.', retry: 'Baca kembali kebutuhan', saveError: 'Penyimpanan belum terkonfirmasi. Isian Anda tetap ada; coba lagi.',
    conflict: 'Halaman lain sudah menyimpan versi baru. Isian Anda tetap ada. Muat versi tersimpan sebelum mengedit lagi.', loadSaved: 'Muat versi tersimpan', local: 'Tersimpan untuk akun Anda di komputer ini. Pelajaran belum dibuat.',
  },
  ja: {
    fields: {
      location: { label: 'どこで？', example: '例：学校、友だちの家、ホテルの受付' },
      learnerRole: { label: 'あなたの役割は？', example: '例：保護者、新しい同僚、宿泊客' },
      partnerRole: { label: '誰と話しますか？', example: '例：先生、ほかの保護者、受付の人' },
      topic: { label: '何について話したいですか？', example: '例：子どもの学校生活、週末の行事' },
      goal: { label: 'どんなことができればよいですか？', example: '例：時間の確認、自己紹介、チェックイン' },
      special: { label: '特別な事情はありますか？', example: '例：初対面なので、ゆっくり話してほしい' },
    },
    hint: '分かる項目だけ、短いキーワードで。空欄でも大丈夫です。', save: '内容を保存', saved: '保存しました。', saving: '保存中…', loading: '保存した内容を読み込み中…',
    readError: '保存した内容を読み込めません。もう一度お試しください。', retry: 'もう一度読み込む', saveError: '保存を確認できません。入力内容は残っています。もう一度お試しください。',
    conflict: 'ほかのページで新しい内容が保存されました。入力は残っています。保存済みの内容を読み込んでから編集してください。', loadSaved: '保存済みの内容を読み込む', local: 'このパソコンのアカウント用に保存します。レッスンはまだ生成していません。',
  },
  ko: {
    fields: {
      location: { label: '어디에서?', example: '예: 학교, 친구 집, 호텔 프런트' },
      learnerRole: { label: '어떤 역할인가요?', example: '예: 학부모, 새 동료, 투숙객' },
      partnerRole: { label: '누구와 이야기하나요?', example: '예: 선생님, 다른 학부모, 직원' },
      topic: { label: '무슨 이야기를 하고 싶나요?', example: '예: 아이의 학교생활, 주말 행사' },
      goal: { label: '원하는 결과는 무엇인가요?', example: '예: 시간 확인, 인사 나누기, 체크인' },
      special: { label: '특별한 상황이 있나요?', example: '예: 첫 만남이라 천천히 말해 주면 좋겠어요' },
    },
    hint: '아는 것만 짧은 키워드로 적어 주세요. 빈칸으로 두어도 괜찮아요.', save: '내용 저장', saved: '저장했어요.', saving: '저장 중…', loading: '저장한 내용을 읽는 중…',
    readError: '저장한 내용을 읽을 수 없어요. 다시 시도해 주세요.', retry: '내용 다시 읽기', saveError: '저장을 확인하지 못했어요. 입력은 그대로 있어요. 다시 시도해 주세요.',
    conflict: '다른 페이지에서 새 내용을 저장했어요. 입력은 그대로 있어요. 저장된 버전을 불러온 뒤 수정해 주세요.', loadSaved: '저장된 버전 불러오기', local: '이 컴퓨터의 계정 공간에 저장해요. 수업은 아직 생성하지 않았어요.',
  },
  hi: {
    fields: {
      location: { label: 'कहाँ?', example: 'जैसे: स्कूल, दोस्त का घर, होटल का रिसेप्शन' },
      learnerRole: { label: 'आपकी भूमिका क्या है?', example: 'जैसे: अभिभावक, नया सहकर्मी, होटल का मेहमान' },
      partnerRole: { label: 'आप किससे बात करेंगे?', example: 'जैसे: शिक्षक, दूसरे अभिभावक, रिसेप्शन कर्मचारी' },
      topic: { label: 'किस बारे में बात करनी है?', example: 'जैसे: बच्चे का स्कूल जीवन, सप्ताहांत का कार्यक्रम' },
      goal: { label: 'आप क्या हासिल करना चाहते हैं?', example: 'जैसे: समय पूछना, परिचय करना, चेक-इन करना' },
      special: { label: 'कोई खास बात?', example: 'जैसे: पहली मुलाकात है, धीरे बोलना बेहतर होगा' },
    },
    hint: 'जो पता हो, उसे कुछ शब्दों में लिखें। खाली भी छोड़ सकते हैं।', save: 'ज़रूरत सहेजें', saved: 'ज़रूरत सहेज ली गई है।', saving: 'सहेजा जा रहा है…', loading: 'आपकी सहेजी ज़रूरत पढ़ी जा रही है…',
    readError: 'सहेजी ज़रूरत अभी नहीं पढ़ सके। फिर कोशिश करें।', retry: 'ज़रूरत फिर पढ़ें', saveError: 'सहेजने की पुष्टि नहीं हुई। आपकी जानकारी बनी हुई है; फिर कोशिश करें।',
    conflict: 'दूसरे पेज से नया संस्करण सहेजा गया है। आपकी जानकारी बनी हुई है। पहले सहेजा संस्करण खोलें, फिर बदलाव करें।', loadSaved: 'सहेजा संस्करण खोलें', local: 'इस कंप्यूटर पर आपके खाते के लिए सहेजा जाता है। पाठ अभी नहीं बना है।',
  },
};
