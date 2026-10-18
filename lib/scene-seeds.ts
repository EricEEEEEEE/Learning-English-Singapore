import type { EntryLanguage } from '../app/entry-copy';
import type { SceneKeywords } from './scene-requirement-content';
import seedCards from '../content/scene-seed-cards.json' with { type: 'json' };

// C7 T30A: 36 local example scenes to start from, following spec 7.2 (S01-S36) and the six samples A-F.
// All text is synthetic product design: no real people, organisations or brands, not reviewed by local or
// native-speaker reviewers yet. Picking a seed only fills the learner's own editable description and keywords.
// C13-4: each seed also has a scene card (content/scene-seed-cards.json) with its own review record; the old
// global flag is true only once every seed card has been reviewed by a local reviewer.
export type SceneRegister = 'standard' | 'sg-standard' | 'sg-colloquial';
export type ContentReviewStatus = 'unreviewed' | 'ai-checked' | 'local-reviewed';
export type ContentReview = { status: ContentReviewStatus; reviewer: string | null; date: string | null; notes: string };
export type SceneSeedCard = { flow: string[]; register: SceneRegister; chunks: string[]; twist: string };
type StoredCard = SceneSeedCard & { review: ContentReview };
const cards = (seedCards as unknown as { cards: Record<string, StoredCard> }).cards;
const unreviewed: ContentReview = { status: 'unreviewed', reviewer: null, date: null, notes: '' };
export function sceneSeedReview(id: string): ContentReview {
  const review = Object.hasOwn(cards, id) ? cards[id].review : null;
  if (!review || review.status === 'local-reviewed' && (!review.reviewer || !/^\d{4}-\d{2}-\d{2}$/.test(review.date ?? ''))) return { ...unreviewed };
  return { ...review };
}

export const sceneSeedCategories = [
  { id: 'school', sample: 'A' }, { id: 'work', sample: 'C' }, { id: 'clinic', sample: 'B' },
  { id: 'transport', sample: 'D' }, { id: 'home', sample: 'E' }, { id: 'food', sample: 'F' },
] as const;
export type SceneSeedCategory = typeof sceneSeedCategories[number]['id'];
export type SceneSeedText = { label: string; description: string; keywords: SceneKeywords };
export type SceneSeed = { id: string; category: SceneSeedCategory; text: Record<EntryLanguage, SceneSeedText>; card: SceneSeedCard };

// label, description, then the six keywords: location, learner role, partner role, topic, goal, special situation.
type Row = readonly [string, string, string, string, string, string, string, string];
const card = (id: string): SceneSeedCard => {
  const { flow, register, chunks, twist } = cards[id];
  return { flow: [...flow], register, chunks: [...chunks], twist };
};
const seed = (id: string, category: SceneSeedCategory, rows: Record<EntryLanguage, Row>): SceneSeed => ({
  id, category, card: card(id),
  text: Object.fromEntries(Object.entries(rows).map(([language, [label, description, location, learnerRole, partnerRole, topic, goal, special]]) =>
    [language, { label, description, keywords: { location, learnerRole, partnerRole, topic, goal, special } }])) as Record<EntryLanguage, SceneSeedText>,
});

export const sceneSeeds: readonly SceneSeed[] = [
  // ---- Home and school (sample A) ----
  seed('S01', 'school', {
    'zh-Hans': ['第一次见班主任', '我第一次见孩子的班主任，想介绍自己，并说明我英语还在学，希望老师说慢一点。', '学校会客室', '学生家长', '班主任', '互相认识和沟通方式', '介绍自己，请老师说慢一点', '第一次见面，英语还在学'],
    id: ['Pertama kali bertemu wali kelas', 'Saya pertama kali bertemu wali kelas anak saya. Saya ingin memperkenalkan diri dan meminta guru berbicara lebih pelan karena saya masih belajar bahasa Inggris.', 'Ruang tamu sekolah', 'Orang tua murid', 'Wali kelas', 'Perkenalan dan cara berkomunikasi', 'Memperkenalkan diri dan meminta bicara pelan', 'Pertemuan pertama, masih belajar bahasa Inggris'],
    ja: ['担任の先生と初めて会う', '子どもの担任の先生と初めて会います。自己紹介をして、英語はまだ勉強中なのでゆっくり話してほしいと伝えたいです。', '学校の面談室', '保護者', '担任の先生', '自己紹介と連絡の取り方', '自己紹介し、ゆっくり話してもらう', '初対面で、英語は勉強中'],
    ko: ['담임 선생님과 첫 만남', '아이의 담임 선생님을 처음 만나요. 저를 소개하고, 아직 영어를 배우는 중이라 천천히 말해 달라고 부탁하고 싶어요.', '학교 상담실', '학부모', '담임 선생님', '인사와 소통 방법', '자기소개 후 천천히 말해 달라고 부탁하기', '첫 만남, 영어는 배우는 중'],
    hi: ['कक्षा शिक्षक से पहली मुलाकात', 'मैं पहली बार अपने बच्चे के कक्षा शिक्षक से मिल रहा/रही हूँ। अपना परिचय देना चाहता/चाहती हूँ और बताना चाहता/चाहती हूँ कि मैं अंग्रेज़ी सीख रहा/रही हूँ, इसलिए धीरे बोलें।', 'स्कूल का मुलाकात कक्ष', 'अभिभावक', 'कक्षा शिक्षक', 'परिचय और बातचीत का तरीका', 'परिचय देना और धीरे बोलने का अनुरोध', 'पहली मुलाकात, अंग्रेज़ी अभी सीख रहे हैं'],
  }),
  seed('S02', 'school', {
    'zh-Hans': ['问孩子上课听不听得懂', '我想问老师，孩子上课时能不能听懂，有没有需要注意的地方。', '教室门口', '学生家长', '任课老师', '孩子上课的理解情况', '听懂老师的一项观察', '放学时只能聊几句'],
    id: ['Bertanya apakah anak paham pelajaran', 'Saya ingin bertanya kepada guru apakah anak saya bisa mengikuti pelajaran di kelas dan apa yang perlu diperhatikan.', 'Depan pintu kelas', 'Orang tua murid', 'Guru mata pelajaran', 'Pemahaman anak di kelas', 'Memahami satu pengamatan guru', 'Hanya sempat bicara sebentar saat pulang sekolah'],
    ja: ['授業が分かっているか聞く', '子どもが授業を理解できているか、気をつけることはあるか、先生に聞きたいです。', '教室の入り口', '保護者', '教科の先生', '授業の理解', '先生の見方を一つ聞き取る', '下校時に少しだけ話せる'],
    ko: ['수업을 이해하는지 묻기', '아이가 수업 시간에 잘 알아듣는지, 신경 써야 할 점이 있는지 선생님께 여쭤보고 싶어요.', '교실 앞', '학부모', '교과 선생님', '아이의 수업 이해', '선생님의 관찰 하나 알아듣기', '하교 시간이라 잠깐만 이야기할 수 있음'],
    hi: ['क्या बच्चा कक्षा में समझता है', 'मैं शिक्षक से पूछना चाहता/चाहती हूँ कि क्या मेरा बच्चा कक्षा में पढ़ाई समझ पाता है और किस बात का ध्यान रखना चाहिए।', 'कक्षा के दरवाज़े पर', 'अभिभावक', 'विषय शिक्षक', 'कक्षा में बच्चे की समझ', 'शिक्षक की एक बात समझना', 'छुट्टी के समय बस थोड़ी बात हो सकती है'],
  }),
  seed('S03', 'school', {
    'zh-Hans': ['问在家可以怎么帮', '我想问老师，在家里可以怎样帮助孩子学习。', '学校会客室', '学生家长', '班主任', '在家可以做的事', '记下一件在家能做的事', '希望建议简单具体'],
    id: ['Bertanya cara membantu di rumah', 'Saya ingin bertanya kepada guru bagaimana saya bisa membantu anak belajar di rumah.', 'Ruang tamu sekolah', 'Orang tua murid', 'Wali kelas', 'Hal yang bisa dilakukan di rumah', 'Mencatat satu hal yang bisa dilakukan di rumah', 'Ingin saran yang sederhana dan jelas'],
    ja: ['家でできることを聞く', '家で子どもの勉強をどう手伝えるか、先生に聞きたいです。', '学校の面談室', '保護者', '担任の先生', '家でできること', '家でできることを一つ決める', '簡単で具体的なアドバイスがほしい'],
    ko: ['집에서 도울 방법 묻기', '집에서 아이의 공부를 어떻게 도와줄 수 있는지 선생님께 여쭤보고 싶어요.', '학교 상담실', '학부모', '담임 선생님', '집에서 할 수 있는 일', '집에서 할 일 하나 정하기', '간단하고 구체적인 조언을 원함'],
    hi: ['घर पर कैसे मदद करें', 'मैं शिक्षक से पूछना चाहता/चाहती हूँ कि घर पर बच्चे की पढ़ाई में कैसे मदद कर सकता/सकती हूँ।', 'स्कूल का मुलाकात कक्ष', 'अभिभावक', 'कक्षा शिक्षक', 'घर पर करने लायक काम', 'घर के लिए एक काम तय करना', 'सरल और साफ़ सलाह चाहिए'],
  }),
  seed('S04', 'school', {
    'zh-Hans': ['约好以后怎么联系', '我想和老师约好以后用什么方式联系，比如留言还是打电话，多久沟通一次。', '学校办公室', '学生家长', '班主任', '以后的联系方式', '确认联系渠道和时间', '白天上班，不方便接电话'],
    id: ['Sepakat cara menghubungi', 'Saya ingin sepakat dengan guru tentang cara kami saling menghubungi, misalnya pesan atau telepon, dan seberapa sering.', 'Kantor sekolah', 'Orang tua murid', 'Wali kelas', 'Cara menghubungi ke depan', 'Memastikan saluran dan waktu kontak', 'Bekerja siang hari, sulit menerima telepon'],
    ja: ['今後の連絡方法を決める', 'メッセージか電話か、どのくらいの頻度で連絡するか、先生と決めておきたいです。', '学校の事務室', '保護者', '担任の先生', '今後の連絡方法', '連絡手段とタイミングを確かめる', '日中は仕事で電話に出にくい'],
    ko: ['앞으로 연락 방법 정하기', '메시지로 할지 전화로 할지, 얼마나 자주 연락할지 선생님과 정해 두고 싶어요.', '학교 교무실', '학부모', '담임 선생님', '앞으로의 연락 방법', '연락 수단과 시간 확인하기', '낮에는 일해서 전화 받기 어려움'],
    hi: ['आगे संपर्क का तरीका तय करना', 'मैं शिक्षक के साथ तय करना चाहता/चाहती हूँ कि आगे संदेश से बात होगी या फ़ोन से, और कितनी बार।', 'स्कूल का दफ़्तर', 'अभिभावक', 'कक्षा शिक्षक', 'आगे संपर्क का तरीका', 'संपर्क का माध्यम और समय तय करना', 'दिन में काम पर, फ़ोन उठाना मुश्किल'],
  }),
  seed('S05', 'school', {
    'zh-Hans': ['孩子刚转学，问适应情况', '孩子刚转到新学校，我想问老师他这几周适应得怎么样。', '学校会客室', '学生家长', '班主任', '转学后的适应', '听懂老师的观察，再问一个问题', '孩子刚转学几周'],
    id: ['Anak baru pindah sekolah', 'Anak saya baru pindah ke sekolah baru. Saya ingin bertanya kepada guru bagaimana ia beradaptasi beberapa minggu ini.', 'Ruang tamu sekolah', 'Orang tua murid', 'Wali kelas', 'Adaptasi setelah pindah sekolah', 'Memahami pengamatan guru lalu bertanya satu hal', 'Anak baru pindah beberapa minggu'],
    ja: ['転校したばかりの様子を聞く', '子どもが新しい学校に転校したばかりです。この数週間どう過ごしているか、先生に聞きたいです。', '学校の面談室', '保護者', '担任の先生', '転校後の様子', '先生の話を聞き、一つ質問する', '転校して数週間'],
    ko: ['전학 온 아이의 적응 묻기', '아이가 새 학교로 막 전학 왔어요. 몇 주 동안 어떻게 적응하고 있는지 선생님께 여쭤보고 싶어요.', '학교 상담실', '학부모', '담임 선생님', '전학 후 적응', '선생님 이야기를 듣고 질문 하나 하기', '전학 온 지 몇 주'],
    hi: ['नए स्कूल में बच्चा कैसा है', 'मेरा बच्चा अभी नए स्कूल में आया है। मैं शिक्षक से पूछना चाहता/चाहती हूँ कि इन कुछ हफ़्तों में वह कैसे घुल-मिल रहा है।', 'स्कूल का मुलाकात कक्ष', 'अभिभावक', 'कक्षा शिक्षक', 'नए स्कूल में घुलना-मिलना', 'शिक्षक की बात समझकर एक सवाल पूछना', 'स्कूल बदले कुछ ही हफ़्ते हुए'],
  }),
  seed('S06', 'school', {
    'zh-Hans': ['问学校每天的安排', '我想了解孩子在学校每天的安排，比如几点到校、午饭和放学怎么安排。', '学校接待处', '学生家长', '学校职员', '每天的上学流程', '弄清到校和放学时间', '新学期刚开始'],
    id: ['Bertanya jadwal harian sekolah', 'Saya ingin tahu jadwal harian anak di sekolah, misalnya jam masuk, makan siang, dan jam pulang.', 'Meja resepsionis sekolah', 'Orang tua murid', 'Staf sekolah', 'Rutinitas harian sekolah', 'Memastikan jam masuk dan jam pulang', 'Semester baru baru dimulai'],
    ja: ['学校の一日の流れを聞く', '登校時間や昼食、下校の流れなど、学校での一日の過ごし方を知りたいです。', '学校の受付', '保護者', '学校の職員', '毎日の学校の流れ', '登校と下校の時間を確かめる', '新学期が始まったばかり'],
    ko: ['학교 하루 일과 묻기', '등교 시간, 점심, 하교 등 아이의 학교 하루 일과를 알고 싶어요.', '학교 안내 데스크', '학부모', '학교 직원', '학교의 하루 일과', '등교와 하교 시간 확인하기', '새 학기가 막 시작됨'],
    hi: ['स्कूल की रोज़ की दिनचर्या', 'मैं जानना चाहता/चाहती हूँ कि स्कूल में बच्चे का दिन कैसे चलता है, जैसे पहुँचने का समय, दोपहर का खाना और छुट्टी का समय।', 'स्कूल का स्वागत डेस्क', 'अभिभावक', 'स्कूल कर्मचारी', 'स्कूल की रोज़ की दिनचर्या', 'पहुँचने और छुट्टी का समय पक्का करना', 'नया सत्र अभी शुरू हुआ है'],
  }),
  seed('S07', 'school', {
    'zh-Hans': ['孩子说没有朋友', '孩子说在学校没有朋友，我想和老师聊聊，看看能怎样帮他交朋友。', '学校会客室', '学生家长', '班主任', '交朋友的困难', '说出担心，约定下一步', '孩子比较害羞'],
    id: ['Anak bilang tidak punya teman', 'Anak saya bilang tidak punya teman di sekolah. Saya ingin berbicara dengan guru tentang cara membantunya berteman.', 'Ruang tamu sekolah', 'Orang tua murid', 'Wali kelas', 'Kesulitan berteman', 'Menyampaikan kekhawatiran dan sepakat langkah berikutnya', 'Anak agak pemalu'],
    ja: ['友だちがいないと言う', '子どもが学校に友だちがいないと言っています。友だちづくりをどう手伝えるか先生と話したいです。', '学校の面談室', '保護者', '担任の先生', '友だちづくりの悩み', '心配を伝え、次の一歩を決める', '子どもは少し人見知り'],
    ko: ['아이가 친구가 없다고 해요', '아이가 학교에 친구가 없다고 해요. 친구를 사귀도록 어떻게 도울 수 있을지 선생님과 이야기하고 싶어요.', '학교 상담실', '학부모', '담임 선생님', '친구 사귀기의 어려움', '걱정을 말하고 다음 단계 정하기', '아이가 조금 수줍음이 많음'],
    hi: ['बच्चा कहता है उसके दोस्त नहीं', 'मेरा बच्चा कहता है कि स्कूल में उसका कोई दोस्त नहीं है। मैं शिक्षक से बात करना चाहता/चाहती हूँ कि उसे दोस्त बनाने में कैसे मदद करें।', 'स्कूल का मुलाकात कक्ष', 'अभिभावक', 'कक्षा शिक्षक', 'दोस्त बनाने में मुश्किल', 'चिंता बताना और अगला कदम तय करना', 'बच्चा थोड़ा शर्मीला है'],
  }),
  seed('S08', 'school', {
    'zh-Hans': ['介绍孩子的长处', '我想向老师介绍孩子喜欢什么、擅长什么，以及他在哪些方面需要多一点支持。', '学校会客室', '学生家长', '班主任', '孩子的长处和需要', '让老师更了解孩子', '希望老师多鼓励他'],
    id: ['Menceritakan kelebihan anak', 'Saya ingin menceritakan kepada guru apa yang disukai dan dikuasai anak saya, serta di bagian mana ia perlu sedikit dukungan.', 'Ruang tamu sekolah', 'Orang tua murid', 'Wali kelas', 'Kelebihan dan kebutuhan anak', 'Membantu guru lebih mengenal anak', 'Berharap guru lebih menyemangatinya'],
    ja: ['子どもの得意なことを伝える', '子どもの好きなことや得意なこと、少し支えが必要なところを先生に伝えたいです。', '学校の面談室', '保護者', '担任の先生', '子どもの強みと必要な支え', '先生に子どもをよく知ってもらう', 'もっと励ましてほしい'],
    ko: ['아이의 장점 소개하기', '아이가 좋아하는 것과 잘하는 것, 그리고 조금 더 도움이 필요한 부분을 선생님께 알려 드리고 싶어요.', '학교 상담실', '학부모', '담임 선생님', '아이의 장점과 필요한 도움', '선생님이 아이를 더 잘 알게 하기', '아이를 더 격려해 주셨으면 함'],
    hi: ['बच्चे की खूबियाँ बताना', 'मैं शिक्षक को बताना चाहता/चाहती हूँ कि मेरे बच्चे को क्या पसंद है, वह किसमें अच्छा है और किन बातों में उसे थोड़ी ज़्यादा मदद चाहिए।', 'स्कूल का मुलाकात कक्ष', 'अभिभावक', 'कक्षा शिक्षक', 'बच्चे की खूबियाँ और ज़रूरतें', 'शिक्षक बच्चे को बेहतर जानें', 'चाहते हैं कि शिक्षक उसका हौसला बढ़ाएँ'],
  }),
  seed('S09', 'school', {
    'zh-Hans': ['孩子说和同学起了冲突', '孩子回家说和同学起了冲突，我想把他说的情况告诉老师，并问老师看到了什么。', '学校会客室', '学生家长', '班主任', '同学之间的一件事', '说明情况，问老师的观察', '只听了孩子一方的说法'],
    id: ['Anak bilang berselisih dengan teman', 'Anak saya pulang dan bercerita ia berselisih dengan teman sekelas. Saya ingin menyampaikan ceritanya kepada guru dan bertanya apa yang guru lihat.', 'Ruang tamu sekolah', 'Orang tua murid', 'Wali kelas', 'Kejadian antara teman sekelas', 'Menceritakan dan bertanya pengamatan guru', 'Baru mendengar dari sisi anak saja'],
    ja: ['同級生ともめたと聞いた', '子どもが同級生ともめたと話していました。子どもの話を先生に伝え、先生から見た様子を聞きたいです。', '学校の面談室', '保護者', '担任の先生', '同級生との出来事', '状況を伝え、先生の見方を聞く', '子どもの話しか聞いていない'],
    ko: ['친구와 다퉜다는 이야기', '아이가 집에 와서 반 친구와 다퉜다고 했어요. 아이가 한 말을 선생님께 전하고, 선생님은 무엇을 보셨는지 여쭤보고 싶어요.', '학교 상담실', '학부모', '담임 선생님', '친구 사이에 있었던 일', '상황을 전하고 선생님의 관찰 묻기', '아이 쪽 이야기만 들었음'],
    hi: ['बच्चे का सहपाठी से झगड़ा', 'मेरे बच्चे ने घर आकर बताया कि सहपाठी से उसकी अनबन हुई। मैं उसकी बात शिक्षक को बताना और पूछना चाहता/चाहती हूँ कि उन्होंने क्या देखा।', 'स्कूल का मुलाकात कक्ष', 'अभिभावक', 'कक्षा शिक्षक', 'सहपाठियों के बीच की एक घटना', 'बात बताना और शिक्षक की राय पूछना', 'अभी केवल बच्चे की बात सुनी है'],
  }),
  seed('S10', 'school', {
    'zh-Hans': ['约定之后怎么跟进', '上次和老师谈过一件事，我想约好接下来怎么了解情况，什么时候再联系。', '学校办公室', '学生家长', '班主任', '后续跟进', '约定下次联系的时间', '希望用留言联系'],
    id: ['Sepakat tindak lanjut', 'Saya sudah membicarakan satu hal dengan guru. Sekarang saya ingin sepakat cara memantau perkembangannya dan kapan kami berbicara lagi.', 'Kantor sekolah', 'Orang tua murid', 'Wali kelas', 'Tindak lanjut', 'Menyepakati waktu kontak berikutnya', 'Lebih suka lewat pesan'],
    ja: ['この後のフォローを決める', '前に先生と話したことについて、これからどう様子を確かめ、次にいつ連絡するか決めたいです。', '学校の事務室', '保護者', '担任の先生', 'この後のフォロー', '次に連絡する時期を決める', 'メッセージで連絡したい'],
    ko: ['후속 확인 방법 정하기', '지난번에 선생님과 이야기한 일이 있어요. 앞으로 어떻게 상황을 확인하고 언제 다시 연락할지 정하고 싶어요.', '학교 교무실', '학부모', '담임 선생님', '후속 확인', '다음 연락 시기 정하기', '메시지로 연락하고 싶음'],
    hi: ['आगे की जानकारी कैसे मिलेगी', 'मैंने पिछली बार शिक्षक से एक बात की थी। अब तय करना चाहता/चाहती हूँ कि आगे स्थिति कैसे पता चलेगी और दोबारा कब बात होगी।', 'स्कूल का दफ़्तर', 'अभिभावक', 'कक्षा शिक्षक', 'आगे की देखरेख', 'अगली बातचीत का समय तय करना', 'संदेश से संपर्क पसंद है'],
  }),
  seed('S11', 'school', {
    'zh-Hans': ['聊孩子用手机平板的习惯', '我想和老师聊聊孩子在家用手机和平板的时间，问问学校有什么建议。', '家长会会场', '学生家长', '班主任', '用电子设备的习惯', '听懂一条建议', '孩子晚上用得比较多'],
    id: ['Kebiasaan anak memakai gawai', 'Saya ingin berbicara dengan guru tentang waktu anak memakai ponsel dan tablet di rumah, dan bertanya saran dari sekolah.', 'Ruang pertemuan orang tua', 'Orang tua murid', 'Wali kelas', 'Kebiasaan memakai gawai', 'Memahami satu saran', 'Anak banyak memakai gawai malam hari'],
    ja: ['スマホやタブレットの使い方', '家でスマホやタブレットを使う時間について先生と話し、学校からのアドバイスを聞きたいです。', '保護者会の会場', '保護者', '担任の先生', '電子機器の使い方', 'アドバイスを一つ聞き取る', '夜に使うことが多い'],
    ko: ['휴대폰과 태블릿 사용 습관', '아이가 집에서 휴대폰과 태블릿을 쓰는 시간에 대해 선생님과 이야기하고 학교의 조언을 듣고 싶어요.', '학부모 모임 장소', '학부모', '담임 선생님', '전자 기기 사용 습관', '조언 하나 알아듣기', '밤에 많이 사용함'],
    hi: ['फ़ोन और टैबलेट की आदत', 'मैं शिक्षक से बात करना चाहता/चाहती हूँ कि बच्चा घर पर फ़ोन और टैबलेट कितनी देर इस्तेमाल करता है, और स्कूल की सलाह पूछना चाहता/चाहती हूँ।', 'अभिभावक बैठक का कमरा', 'अभिभावक', 'कक्षा शिक्षक', 'डिजिटल उपकरणों की आदत', 'एक सलाह समझना', 'रात में ज़्यादा इस्तेमाल करता है'],
  }),
  seed('S12', 'school', {
    'zh-Hans': ['担心孩子在网上被欺负', '孩子在网上收到让他难过的消息，我想告诉老师我的担心，并问学校能提供什么支持。', '学校会客室', '学生家长', '学校辅导老师', '网上遇到的不愉快', '说出担心，问可以找谁帮忙', '孩子不想多谈这件事'],
    id: ['Khawatir anak dirundung daring', 'Anak saya menerima pesan daring yang membuatnya sedih. Saya ingin menyampaikan kekhawatiran kepada guru dan bertanya dukungan apa yang tersedia di sekolah.', 'Ruang tamu sekolah', 'Orang tua murid', 'Guru konseling sekolah', 'Pengalaman buruk di internet', 'Menyampaikan kekhawatiran dan bertanya siapa yang bisa membantu', 'Anak tidak mau banyak membicarakannya'],
    ja: ['ネットでのいじめが心配', '子どもがネットで悲しくなるメッセージを受け取りました。心配を先生に伝え、学校でどんな支えがあるか聞きたいです。', '学校の面談室', '保護者', 'スクールカウンセラー', 'ネットでのいやな出来事', '心配を伝え、相談先を聞く', '子どもはあまり話したがらない'],
    ko: ['온라인 괴롭힘이 걱정돼요', '아이가 온라인에서 속상한 메시지를 받았어요. 걱정을 선생님께 말씀드리고 학교에서 어떤 도움을 받을 수 있는지 여쭤보고 싶어요.', '학교 상담실', '학부모', '학교 상담 선생님', '온라인에서 겪은 불쾌한 일', '걱정을 말하고 도움받을 곳 묻기', '아이가 이야기하기 싫어함'],
    hi: ['ऑनलाइन परेशान किए जाने की चिंता', 'मेरे बच्चे को ऑनलाइन ऐसे संदेश मिले जिनसे वह दुखी है। मैं शिक्षक को अपनी चिंता बताना और पूछना चाहता/चाहती हूँ कि स्कूल क्या मदद दे सकता है।', 'स्कूल का मुलाकात कक्ष', 'अभिभावक', 'स्कूल के परामर्श शिक्षक', 'ऑनलाइन हुई बुरी घटना', 'चिंता बताना और मदद किससे मिले, पूछना', 'बच्चा इस बारे में ज़्यादा बात नहीं करना चाहता'],
  }),
  // ---- Work (sample C) ----
  seed('S13', 'work', {
    'zh-Hans': ['请主管讲慢一点', '主管交代工作时说得很快，我想请他讲慢一点，再说一遍。', '工作场所', '新员工', '主管', '今天的工作要求', '听清要求', '第一次做这项工作'],
    id: ['Meminta atasan bicara pelan', 'Atasan memberi tugas dengan cepat. Saya ingin memintanya berbicara lebih pelan dan mengulanginya.', 'Tempat kerja', 'Karyawan baru', 'Atasan', 'Tugas hari ini', 'Mendengar tugas dengan jelas', 'Pertama kali melakukan pekerjaan ini'],
    ja: ['上司にゆっくり話してもらう', '上司が仕事の指示を早口で話します。もう少しゆっくり、もう一度言ってほしいと頼みたいです。', '職場', '新しいスタッフ', '上司', '今日の仕事の指示', '指示をはっきり聞き取る', 'この仕事は初めて'],
    ko: ['상사에게 천천히 말해 달라고 하기', '상사가 업무 지시를 빨리 말해요. 조금 천천히 다시 말해 달라고 부탁하고 싶어요.', '직장', '신입 직원', '상사', '오늘의 업무 지시', '지시를 정확히 알아듣기', '이 일은 처음 해 봄'],
    hi: ['सुपरवाइज़र से धीरे बोलने को कहना', 'सुपरवाइज़र काम जल्दी-जल्दी समझाते हैं। मैं उनसे धीरे बोलने और फिर से बताने का अनुरोध करना चाहता/चाहती हूँ।', 'कार्यस्थल', 'नया कर्मचारी', 'सुपरवाइज़र', 'आज का काम', 'काम साफ़ समझना', 'यह काम पहली बार कर रहे हैं'],
  }),
  seed('S14', 'work', {
    'zh-Hans': ['确认先做哪一步', '主管交代了几件事，我想确认应该先做哪一件，再做哪一件。', '仓库', '新员工', '主管', '工作的先后顺序', '确认第一步做什么', '事情有点多'],
    id: ['Memastikan langkah pertama', 'Atasan memberi beberapa tugas. Saya ingin memastikan mana yang dikerjakan dulu dan mana yang berikutnya.', 'Gudang', 'Karyawan baru', 'Atasan', 'Urutan pekerjaan', 'Memastikan langkah pertama', 'Tugasnya agak banyak'],
    ja: ['最初に何をするか確かめる', '上司からいくつか仕事を頼まれました。どれを先にして、どれを後にするか確かめたいです。', '倉庫', '新しいスタッフ', '上司', '仕事の順番', '最初の作業を確かめる', '頼まれたことが多い'],
    ko: ['먼저 할 일 확인하기', '상사가 여러 가지 일을 맡겼어요. 무엇을 먼저 하고 무엇을 나중에 할지 확인하고 싶어요.', '창고', '신입 직원', '상사', '업무 순서', '첫 번째 할 일 확인하기', '할 일이 좀 많음'],
    hi: ['पहले कौन-सा काम करें', 'सुपरवाइज़र ने कई काम बताए हैं। मैं पक्का करना चाहता/चाहती हूँ कि पहले कौन-सा करना है और बाद में कौन-सा।', 'गोदाम', 'नया कर्मचारी', 'सुपरवाइज़र', 'काम का क्रम', 'पहला कदम पक्का करना', 'काम थोड़े ज़्यादा हैं'],
  }),
  seed('S15', 'work', {
    'zh-Hans': ['交接班时复述确认', '换班时同事告诉我要注意的事，我想复述一遍，请他确认我听对了。', '工作场所', '接班的员工', '下班的同事', '交接内容', '复述并确认没有听错', '交接时间比较紧'],
    id: ['Mengulang info saat serah terima', 'Saat ganti sif, rekan kerja memberi tahu hal yang perlu diperhatikan. Saya ingin mengulanginya dan memintanya memastikan saya benar.', 'Tempat kerja', 'Karyawan sif berikutnya', 'Rekan sif sebelumnya', 'Isi serah terima', 'Mengulang dan memastikan tidak salah dengar', 'Waktu serah terima singkat'],
    ja: ['引き継ぎで復唱して確かめる', 'シフト交代のとき、同僚から注意点を聞きます。復唱して、聞き間違いがないか確かめてもらいたいです。', '職場', '次のシフトのスタッフ', '前のシフトの同僚', '引き継ぎの内容', '復唱して聞き間違いを防ぐ', '引き継ぎの時間が短い'],
    ko: ['인수인계 내용 다시 말해 확인하기', '교대할 때 동료가 주의할 점을 알려 줘요. 제가 다시 말해 보고 맞게 들었는지 확인받고 싶어요.', '직장', '다음 근무자', '이전 근무 동료', '인수인계 내용', '다시 말하고 맞게 들었는지 확인하기', '인수인계 시간이 짧음'],
    hi: ['शिफ़्ट बदलते समय बात दोहराना', 'शिफ़्ट बदलते समय सहकर्मी ध्यान रखने वाली बातें बताते हैं। मैं उन्हें दोहराकर पक्का करना चाहता/चाहती हूँ कि मैंने सही सुना।', 'कार्यस्थल', 'अगली शिफ़्ट का कर्मचारी', 'पिछली शिफ़्ट का सहकर्मी', 'शिफ़्ट सौंपने की बातें', 'दोहराकर सही समझ पक्की करना', 'शिफ़्ट बदलने का समय कम है'],
  }),
  seed('S16', 'work', {
    'zh-Hans': ['没听懂安全要求，先暂停', '主管讲了一条安全要求，我没听懂，想先暂停，请他再解释一次。', '工作现场', '员工', '主管', '一条安全要求', '弄懂以后再开始做', '不确定时先不动手'],
    id: ['Belum paham aturan keselamatan', 'Atasan menjelaskan satu aturan keselamatan dan saya belum paham. Saya ingin berhenti dulu dan memintanya menjelaskan lagi.', 'Lokasi kerja', 'Karyawan', 'Atasan', 'Satu aturan keselamatan', 'Paham dulu baru mulai bekerja', 'Kalau ragu, jangan mulai dulu'],
    ja: ['安全の説明が分からず手を止める', '上司が安全のルールを説明しましたが、分かりませんでした。作業を止めて、もう一度説明してもらいたいです。', '作業現場', 'スタッフ', '上司', '安全のルール', '理解してから作業を始める', '分からないときは手を出さない'],
    ko: ['안전 수칙을 몰라서 잠시 멈추기', '상사가 안전 수칙을 설명했는데 이해하지 못했어요. 일을 잠시 멈추고 다시 설명해 달라고 하고 싶어요.', '작업 현장', '직원', '상사', '안전 수칙 하나', '이해한 뒤에 일 시작하기', '확실하지 않으면 손대지 않기'],
    hi: ['सुरक्षा नियम समझ न आए तो रुकना', 'सुपरवाइज़र ने एक सुरक्षा नियम बताया, जो मुझे समझ नहीं आया। मैं काम रोककर उनसे फिर समझाने को कहना चाहता/चाहती हूँ।', 'काम की जगह', 'कर्मचारी', 'सुपरवाइज़र', 'एक सुरक्षा नियम', 'समझकर ही काम शुरू करना', 'शक हो तो काम शुरू न करें'],
  }),
  seed('S17', 'work', {
    'zh-Hans': ['问工资单上的一项', '我看不懂工资单上的一项金额，想礼貌地问负责的同事这是什么。', '办公室', '员工', '负责工资的同事', '工资单上的一项', '弄清这一项是什么', '带着工资单去问'],
    id: ['Bertanya satu baris di slip gaji', 'Ada satu jumlah di slip gaji yang tidak saya pahami. Saya ingin bertanya dengan sopan kepada petugas penggajian.', 'Kantor', 'Karyawan', 'Petugas penggajian', 'Satu baris di slip gaji', 'Memahami arti baris itu', 'Membawa slip gaji'],
    ja: ['給与明細の項目を聞く', '給与明細の金額で分からない項目があります。担当の人に丁寧に聞きたいです。', '事務所', 'スタッフ', '給与担当の人', '給与明細の一項目', 'その項目の意味を知る', '給与明細を持っていく'],
    ko: ['급여 명세서 항목 묻기', '급여 명세서에 이해되지 않는 금액이 하나 있어요. 담당자에게 정중하게 여쭤보고 싶어요.', '사무실', '직원', '급여 담당자', '급여 명세서의 한 항목', '그 항목이 무엇인지 알기', '급여 명세서를 가져감'],
    hi: ['वेतन पर्ची की एक पंक्ति पूछना', 'वेतन पर्ची में एक रकम मुझे समझ नहीं आई। मैं वेतन देखने वाले सहकर्मी से विनम्रता से पूछना चाहता/चाहती हूँ।', 'दफ़्तर', 'कर्मचारी', 'वेतन देखने वाले सहकर्मी', 'वेतन पर्ची की एक पंक्ति', 'उस पंक्ति का मतलब समझना', 'वेतन पर्ची साथ है'],
  }),
  seed('S18', 'work', {
    'zh-Hans': ['确认加班有没有记录', '我上周加了班，想和主管确认加班时间有没有记录下来。', '办公室', '员工', '主管', '上周的加班时间', '确认记录正确', '记得具体日期和时间'],
    id: ['Memastikan lembur tercatat', 'Saya lembur minggu lalu. Saya ingin memastikan kepada atasan bahwa jam lembur saya sudah dicatat.', 'Kantor', 'Karyawan', 'Atasan', 'Jam lembur minggu lalu', 'Memastikan catatannya benar', 'Ingat tanggal dan jamnya'],
    ja: ['残業の記録を確かめる', '先週残業しました。残業時間がきちんと記録されているか上司に確かめたいです。', '事務所', 'スタッフ', '上司', '先週の残業時間', '記録が正しいか確かめる', '日付と時間を覚えている'],
    ko: ['초과 근무 기록 확인하기', '지난주에 초과 근무를 했어요. 초과 근무 시간이 기록되었는지 상사에게 확인하고 싶어요.', '사무실', '직원', '상사', '지난주 초과 근무 시간', '기록이 맞는지 확인하기', '날짜와 시간을 기억함'],
    hi: ['ओवरटाइम दर्ज हुआ या नहीं', 'मैंने पिछले हफ़्ते ओवरटाइम किया था। मैं सुपरवाइज़र से पक्का करना चाहता/चाहती हूँ कि वह समय दर्ज हुआ है।', 'दफ़्तर', 'कर्मचारी', 'सुपरवाइज़र', 'पिछले हफ़्ते का ओवरटाइम', 'रिकॉर्ड सही है, यह पक्का करना', 'तारीख और समय याद है'],
  }),
  seed('S19', 'work', {
    'zh-Hans': ['问这件事该找谁', '我有一件事不知道该找谁处理，想问同事应该联系哪位负责人。', '办公室', '新员工', '同事', '找对负责人', '问到负责人和联系方式', '刚来不久，还不认识大家'],
    id: ['Bertanya harus menghubungi siapa', 'Ada satu urusan dan saya tidak tahu harus ke siapa. Saya ingin bertanya kepada rekan kerja siapa penanggung jawabnya.', 'Kantor', 'Karyawan baru', 'Rekan kerja', 'Mencari penanggung jawab', 'Mengetahui nama dan kontak penanggung jawab', 'Masih baru, belum kenal semua orang'],
    ja: ['誰に相談すればいいか聞く', 'ある用件を誰に頼めばいいか分かりません。どの担当者に連絡すればいいか同僚に聞きたいです。', '事務所', '新しいスタッフ', '同僚', '担当者を探す', '担当者と連絡先を聞く', '入ったばかりで、まだ皆を知らない'],
    ko: ['누구에게 연락해야 하는지 묻기', '어떤 일을 누구에게 맡겨야 할지 모르겠어요. 어느 담당자에게 연락해야 하는지 동료에게 묻고 싶어요.', '사무실', '신입 직원', '동료', '담당자 찾기', '담당자와 연락처 알아내기', '입사한 지 얼마 안 돼 아직 다들 모름'],
    hi: ['यह काम किससे पूछें', 'मुझे एक काम के लिए नहीं पता कि किससे बात करूँ। मैं सहकर्मी से पूछना चाहता/चाहती हूँ कि किस ज़िम्मेदार व्यक्ति से संपर्क करूँ।', 'दफ़्तर', 'नया कर्मचारी', 'सहकर्मी', 'सही ज़िम्मेदार व्यक्ति', 'नाम और संपर्क जानना', 'अभी नए हैं, सबको नहीं जानते'],
  }),
  seed('S20', 'work', {
    'zh-Hans': ['请对方用简单的话解释', '有一份工作说明我看不太懂，想请负责人用更简单的英语解释，或者问有没有其他语言的资料。', '办公室', '员工', '人事负责人', '一份工作说明', '得到更容易懂的解释', '英语还在学'],
    id: ['Meminta penjelasan yang lebih mudah', 'Ada satu petunjuk kerja yang sulit saya pahami. Saya ingin meminta penjelasan dalam bahasa Inggris yang lebih sederhana atau bertanya apakah ada materi dalam bahasa lain.', 'Kantor', 'Karyawan', 'Petugas SDM', 'Satu petunjuk kerja', 'Mendapat penjelasan yang lebih mudah', 'Masih belajar bahasa Inggris'],
    ja: ['やさしい言葉で説明してもらう', '仕事の説明書がよく分かりません。もっとやさしい英語で説明してもらうか、ほかの言語の資料があるか聞きたいです。', '事務所', 'スタッフ', '人事の担当者', '仕事の説明書', '分かりやすい説明をもらう', '英語は勉強中'],
    ko: ['쉬운 말로 설명해 달라고 하기', '업무 안내문을 잘 이해하지 못했어요. 더 쉬운 영어로 설명해 달라고 하거나 다른 언어 자료가 있는지 묻고 싶어요.', '사무실', '직원', '인사 담당자', '업무 안내문', '이해하기 쉬운 설명 받기', '영어는 배우는 중'],
    hi: ['आसान शब्दों में समझाने को कहना', 'काम की एक जानकारी मुझे ठीक से समझ नहीं आई। मैं ज़िम्मेदार व्यक्ति से आसान अंग्रेज़ी में समझाने या दूसरी भाषा की सामग्री के बारे में पूछना चाहता/चाहती हूँ।', 'दफ़्तर', 'कर्मचारी', 'मानव संसाधन अधिकारी', 'काम की एक जानकारी', 'आसानी से समझ आने वाली व्याख्या', 'अंग्रेज़ी अभी सीख रहे हैं'],
  }),
  // ---- Clinic appointments (sample B) ----
  seed('S21', 'clinic', {
    'zh-Hans': ['打电话问能不能预约', '我想打电话给诊所，问能不能预约看医生，有哪些时间可以选。', '诊所（电话）', '病人', '诊所接待员', '预约看诊', '约到一个合适的时间', '在电话里看不到对方'],
    id: ['Menelepon untuk membuat janji', 'Saya ingin menelepon klinik untuk bertanya apakah bisa membuat janji dengan dokter dan waktu apa saja yang tersedia.', 'Klinik (lewat telepon)', 'Pasien', 'Resepsionis klinik', 'Membuat janji temu', 'Mendapat waktu yang cocok', 'Lewat telepon, tidak bisa melihat lawan bicara'],
    ja: ['電話で予約できるか聞く', 'クリニックに電話して、診察の予約ができるか、どの時間が空いているか聞きたいです。', 'クリニック（電話）', '患者', 'クリニックの受付', '診察の予約', '都合のいい時間を取る', '電話なので相手の顔が見えない'],
    ko: ['전화로 진료 예약 묻기', '병원에 전화해서 진료 예약이 되는지, 어떤 시간이 가능한지 묻고 싶어요.', '병원(전화)', '환자', '병원 접수 직원', '진료 예약', '맞는 시간으로 예약하기', '전화라서 상대 표정을 볼 수 없음'],
    hi: ['फ़ोन पर अपॉइंटमेंट पूछना', 'मैं क्लिनिक को फ़ोन करके पूछना चाहता/चाहती हूँ कि क्या डॉक्टर से मिलने का समय मिल सकता है और कौन-से समय खाली हैं।', 'क्लिनिक (फ़ोन पर)', 'मरीज़', 'क्लिनिक का रिसेप्शनिस्ट', 'डॉक्टर से मिलने का समय', 'सही समय तय करना', 'फ़ोन पर सामने वाला दिखता नहीं'],
  }),
  seed('S22', 'clinic', {
    'zh-Hans': ['原来的时间不方便，想改约', '我原来约的时间不方便，想改到另一天的下午。', '诊所接待处', '病人', '诊所接待员', '更改预约', '改到合适的时间', '只想改时间，不想取消'],
    id: ['Mengganti jadwal janji temu', 'Waktu janji saya ternyata tidak cocok. Saya ingin menggantinya ke sore hari di hari lain.', 'Meja resepsionis klinik', 'Pasien', 'Resepsionis klinik', 'Mengubah janji temu', 'Pindah ke waktu yang cocok', 'Hanya ingin ganti waktu, tidak membatalkan'],
    ja: ['予約の時間を変えたい', '予約した時間が都合が悪くなりました。別の日の午後に変えたいです。', 'クリニックの受付', '患者', 'クリニックの受付', '予約の変更', '都合のいい時間に変える', '時間だけ変えたい、キャンセルはしない'],
    ko: ['예약 시간 바꾸기', '예약한 시간이 맞지 않게 되었어요. 다른 날 오후로 바꾸고 싶어요.', '병원 접수처', '환자', '병원 접수 직원', '예약 변경', '맞는 시간으로 바꾸기', '취소가 아니라 시간만 바꾸고 싶음'],
    hi: ['अपॉइंटमेंट का समय बदलना', 'जो समय लिया था वह अब ठीक नहीं है। मैं उसे किसी दूसरे दिन दोपहर बाद में बदलना चाहता/चाहती हूँ।', 'क्लिनिक का रिसेप्शन', 'मरीज़', 'क्लिनिक का रिसेप्शनिस्ट', 'अपॉइंटमेंट बदलना', 'सही समय पर बदलना', 'रद्द नहीं करना, बस समय बदलना है'],
  }),
  seed('S23', 'clinic', {
    'zh-Hans': ['确认地点和要带什么', '我下周要去诊所，想确认具体在哪一层、几号房，以及需要带什么。', '诊所接待处', '病人', '诊所接待员', '地点和准备事项', '记下地点和要带的东西', '第一次去这家诊所'],
    id: ['Memastikan lokasi dan yang dibawa', 'Minggu depan saya ke klinik. Saya ingin memastikan lantai dan nomor ruangannya, dan apa yang perlu dibawa.', 'Meja resepsionis klinik', 'Pasien', 'Resepsionis klinik', 'Lokasi dan persiapan', 'Mencatat lokasi dan barang yang dibawa', 'Pertama kali ke klinik ini'],
    ja: ['場所と持ち物を確かめる', '来週クリニックに行きます。何階の何番の部屋か、何を持っていけばいいか確かめたいです。', 'クリニックの受付', '患者', 'クリニックの受付', '場所と準備', '場所と持ち物をメモする', 'このクリニックは初めて'],
    ko: ['위치와 준비물 확인하기', '다음 주에 병원에 가요. 몇 층 몇 번 방인지, 무엇을 가져가야 하는지 확인하고 싶어요.', '병원 접수처', '환자', '병원 접수 직원', '위치와 준비물', '위치와 준비물 적어 두기', '이 병원은 처음 감'],
    hi: ['जगह और साथ ले जाने की चीज़ें', 'मुझे अगले हफ़्ते क्लिनिक जाना है। मैं पक्का करना चाहता/चाहती हूँ कि कौन-सी मंज़िल और कौन-सा कमरा है, और क्या साथ लाना है।', 'क्लिनिक का रिसेप्शन', 'मरीज़', 'क्लिनिक का रिसेप्शनिस्ट', 'जगह और तैयारी', 'जगह और ज़रूरी चीज़ें लिख लेना', 'इस क्लिनिक में पहली बार'],
  }),
  seed('S24', 'clinic', {
    'zh-Hans': ['网上看不到我的预约', '我在网上看不到自己的预约记录，想问接待员是怎么回事，要怎么处理。', '诊所接待处', '病人', '诊所接待员', '网上看不到预约', '弄清预约是否还在', '手机里有截图'],
    id: ['Janji temu tidak terlihat daring', 'Janji temu saya tidak muncul di aplikasi daring. Saya ingin bertanya kepada resepsionis apa yang terjadi dan bagaimana mengurusnya.', 'Meja resepsionis klinik', 'Pasien', 'Resepsionis klinik', 'Janji temu tidak muncul daring', 'Memastikan janji temu masih ada', 'Ada tangkapan layar di ponsel'],
    ja: ['ネットで予約が見えない', 'ネットで自分の予約が表示されません。どうなっているか、どうすればいいか受付で聞きたいです。', 'クリニックの受付', '患者', 'クリニックの受付', 'ネットで予約が見えない', '予約が残っているか確かめる', 'スマホにスクリーンショットがある'],
    ko: ['온라인에서 예약이 안 보여요', '온라인에서 제 예약 기록이 보이지 않아요. 어떻게 된 건지, 어떻게 처리하면 되는지 접수 직원에게 묻고 싶어요.', '병원 접수처', '환자', '병원 접수 직원', '온라인에서 안 보이는 예약', '예약이 아직 있는지 확인하기', '휴대폰에 화면 캡처가 있음'],
    hi: ['ऑनलाइन अपॉइंटमेंट नहीं दिख रहा', 'मुझे ऑनलाइन अपना अपॉइंटमेंट नहीं दिख रहा। मैं रिसेप्शनिस्ट से पूछना चाहता/चाहती हूँ कि क्या हुआ और अब क्या करें।', 'क्लिनिक का रिसेप्शन', 'मरीज़', 'क्लिनिक का रिसेप्शनिस्ट', 'ऑनलाइन न दिखने वाला अपॉइंटमेंट', 'पक्का करना कि अपॉइंटमेंट अब भी है', 'फ़ोन में स्क्रीनशॉट है'],
  }),
  // ---- Public transport (sample D) ----
  seed('S25', 'transport', {
    'zh-Hans': ['交通卡刷不了', '我在地铁站刷交通卡，闸门没有打开，想向站务人员说明情况。', '地铁站闸门旁', '乘客', '站务人员', '交通卡不能用', '听懂下一步该怎么做', '后面有人在排队'],
    id: ['Kartu transportasi tidak bisa dipakai', 'Saya menempelkan kartu transportasi di stasiun kereta, tetapi gerbangnya tidak terbuka. Saya ingin menjelaskannya kepada petugas stasiun.', 'Di samping gerbang stasiun', 'Penumpang', 'Petugas stasiun', 'Kartu tidak bisa dipakai', 'Memahami langkah berikutnya', 'Ada orang mengantre di belakang'],
    ja: ['交通カードが使えない', '駅の改札で交通カードをタッチしましたが、ゲートが開きません。駅員に状況を説明したいです。', '駅の改札の横', '乗客', '駅員', '交通カードが使えない', '次に何をすればいいか聞き取る', '後ろに人が並んでいる'],
    ko: ['교통카드가 안 찍혀요', '지하철역에서 교통카드를 찍었는데 개찰구가 열리지 않아요. 역무원에게 상황을 설명하고 싶어요.', '지하철역 개찰구 옆', '승객', '역무원', '교통카드 오류', '다음에 할 일 알아듣기', '뒤에 사람들이 줄 서 있음'],
    hi: ['ट्रांसपोर्ट कार्ड काम नहीं कर रहा', 'मैंने स्टेशन पर ट्रांसपोर्ट कार्ड लगाया, पर गेट नहीं खुला। मैं स्टेशन कर्मचारी को यह बताना चाहता/चाहती हूँ।', 'स्टेशन के गेट के पास', 'यात्री', 'स्टेशन कर्मचारी', 'कार्ड काम नहीं कर रहा', 'अगला कदम समझना', 'पीछे लोग कतार में हैं'],
  }),
  seed('S26', 'transport', {
    'zh-Hans': ['问该去哪个服务点', '站务人员说要去服务点处理，我想确认服务点在哪里，怎么走。', '地铁站大厅', '乘客', '站务人员', '服务点的位置', '听懂怎么走', '车站很大，出口很多'],
    id: ['Bertanya letak loket layanan', 'Petugas bilang saya harus ke loket layanan. Saya ingin memastikan di mana letaknya dan bagaimana ke sana.', 'Aula stasiun', 'Penumpang', 'Petugas stasiun', 'Letak loket layanan', 'Memahami arah jalan', 'Stasiunnya besar dan banyak pintu keluar'],
    ja: ['サービス窓口の場所を聞く', '駅員にサービス窓口へ行くように言われました。窓口がどこにあって、どう行けばいいか確かめたいです。', '駅のコンコース', '乗客', '駅員', 'サービス窓口の場所', '行き方を聞き取る', '駅が大きく、出口が多い'],
    ko: ['서비스 창구 위치 묻기', '역무원이 서비스 창구에 가라고 했어요. 창구가 어디 있는지, 어떻게 가는지 확인하고 싶어요.', '지하철역 대합실', '승객', '역무원', '서비스 창구 위치', '가는 길 알아듣기', '역이 크고 출구가 많음'],
    hi: ['सेवा काउंटर कहाँ है', 'स्टेशन कर्मचारी ने सेवा काउंटर जाने को कहा। मैं पक्का करना चाहता/चाहती हूँ कि काउंटर कहाँ है और वहाँ कैसे पहुँचूँ।', 'स्टेशन का हॉल', 'यात्री', 'स्टेशन कर्मचारी', 'सेवा काउंटर की जगह', 'रास्ता समझना', 'स्टेशन बड़ा है, कई निकास हैं'],
  }),
  seed('S27', 'transport', {
    'zh-Hans': ['问一次车费为什么比较多', '我发现有一次车费比平时多，想问工作人员怎么查看这次的记录。', '车站服务点', '乘客', '服务点职员', '一次车费记录', '知道怎样查记录', '记得大概的日期'],
    id: ['Bertanya ongkos yang lebih mahal', 'Ada satu perjalanan yang ongkosnya lebih mahal dari biasanya. Saya ingin bertanya kepada petugas cara melihat catatannya.', 'Loket layanan stasiun', 'Penumpang', 'Petugas loket layanan', 'Catatan satu ongkos perjalanan', 'Tahu cara memeriksa catatan', 'Ingat kira-kira tanggalnya'],
    ja: ['運賃がいつもより高かった', '一度だけ運賃がいつもより高かったので、その記録の確かめ方を係の人に聞きたいです。', '駅のサービス窓口', '乗客', '窓口の係員', '一回分の運賃の記録', '記録の確かめ方を知る', 'だいたいの日付を覚えている'],
    ko: ['요금이 더 나온 이유 묻기', '한 번은 요금이 평소보다 많이 나왔어요. 그 기록을 어떻게 확인하는지 직원에게 묻고 싶어요.', '역 서비스 창구', '승객', '창구 직원', '한 번의 요금 기록', '기록 확인 방법 알기', '대략적인 날짜를 기억함'],
    hi: ['एक बार किराया ज़्यादा क्यों', 'एक यात्रा का किराया सामान्य से ज़्यादा लगा। मैं कर्मचारी से पूछना चाहता/चाहती हूँ कि उस यात्रा का रिकॉर्ड कैसे देखूँ।', 'स्टेशन का सेवा काउंटर', 'यात्री', 'सेवा काउंटर कर्मचारी', 'एक यात्रा का किराया', 'रिकॉर्ड देखने का तरीका जानना', 'लगभग तारीख याद है'],
  }),
  seed('S28', 'transport', {
    'zh-Hans': ['没听懂，请对方再说一遍', '工作人员解释了一件事，我没听懂，想请他再说一遍，或者换个简单的说法。', '车站服务点', '乘客', '服务点职员', '没听懂的解释', '请对方重复或换个说法', '不想假装听懂'],
    id: ['Belum paham, minta diulang', 'Petugas menjelaskan sesuatu dan saya belum paham. Saya ingin memintanya mengulang atau menjelaskan dengan cara yang lebih sederhana.', 'Loket layanan stasiun', 'Penumpang', 'Petugas loket layanan', 'Penjelasan yang belum dipahami', 'Meminta diulang atau dijelaskan dengan cara lain', 'Tidak mau pura-pura paham'],
    ja: ['分からないのでもう一度頼む', '係の人の説明が分かりませんでした。もう一度言ってもらうか、簡単な言い方にしてもらいたいです。', '駅のサービス窓口', '乗客', '窓口の係員', '分からなかった説明', 'くり返しや言い換えを頼む', '分かったふりをしたくない'],
    ko: ['못 알아들어서 다시 부탁하기', '직원의 설명을 알아듣지 못했어요. 다시 말해 주거나 더 쉬운 말로 바꿔 달라고 하고 싶어요.', '역 서비스 창구', '승객', '창구 직원', '이해하지 못한 설명', '다시 말하거나 바꿔 말해 달라고 하기', '아는 척하고 싶지 않음'],
    hi: ['समझ नहीं आया, फिर से कहें', 'कर्मचारी ने कुछ समझाया, पर मुझे समझ नहीं आया। मैं उनसे दोहराने या आसान तरीके से कहने को कहना चाहता/चाहती हूँ।', 'स्टेशन का सेवा काउंटर', 'यात्री', 'सेवा काउंटर कर्मचारी', 'जो बात समझ नहीं आई', 'दोहराने या दूसरे तरीके से कहने को कहना', 'समझने का दिखावा नहीं करना'],
  }),
  // ---- Home and neighbours (sample E) ----
  seed('S29', 'home', {
    'zh-Hans': ['向邻居介绍自己', '我刚搬进组屋，在走廊遇到隔壁邻居，想简单介绍自己，打个招呼。', '组屋走廊', '新搬来的住户', '隔壁邻居', '互相认识', '打招呼并介绍自己', '刚搬来一个星期'],
    id: ['Memperkenalkan diri ke tetangga', 'Saya baru pindah ke flat. Saya bertemu tetangga sebelah di koridor dan ingin menyapa serta memperkenalkan diri singkat.', 'Koridor flat', 'Penghuni baru', 'Tetangga sebelah', 'Saling berkenalan', 'Menyapa dan memperkenalkan diri', 'Baru pindah seminggu'],
    ja: ['隣の人にあいさつする', '公営住宅に引っ越してきたばかりです。廊下で隣の人に会ったので、あいさつして簡単に自己紹介したいです。', '公営住宅の廊下', '引っ越してきた住人', '隣の住人', 'お互いを知る', 'あいさつと自己紹介', '引っ越して一週間'],
    ko: ['이웃에게 인사하기', '공공 아파트로 막 이사 왔어요. 복도에서 옆집 이웃을 만나서 인사하고 간단히 소개하고 싶어요.', '아파트 복도', '새로 이사 온 주민', '옆집 이웃', '서로 알게 되기', '인사하고 자기소개하기', '이사 온 지 일주일'],
    hi: ['पड़ोसी से परिचय', 'मैं अभी फ़्लैट में आया/आई हूँ। गलियारे में बगल वाले पड़ोसी मिले, मैं नमस्ते करके अपना छोटा-सा परिचय देना चाहता/चाहती हूँ।', 'फ़्लैट का गलियारा', 'नए आए निवासी', 'बगल वाले पड़ोसी', 'एक-दूसरे को जानना', 'नमस्ते करना और परिचय देना', 'आए हुए एक हफ़्ता हुआ'],
  }),
  seed('S30', 'home', {
    'zh-Hans': ['浴室天花板漏水', '我家浴室天花板在滴水，想去楼上邻居家说明情况，约时间一起看看。', '楼上邻居家门口', '住户', '楼上邻居', '浴室天花板漏水', '约好查看的时间', '晚上六点以后比较方便'],
    id: ['Plafon kamar mandi bocor', 'Plafon kamar mandi saya meneteskan air. Saya ingin memberi tahu tetangga di atas dan membuat janji untuk memeriksanya bersama.', 'Depan pintu tetangga di atas', 'Penghuni', 'Tetangga lantai atas', 'Kebocoran plafon kamar mandi', 'Menyepakati waktu pemeriksaan', 'Lebih cocok setelah jam enam sore'],
    ja: ['浴室の天井から水漏れ', '浴室の天井から水がたれています。上の階の人に事情を話して、一緒に見る時間を決めたいです。', '上の階の家の前', '住人', '上の階の住人', '浴室の天井の水漏れ', '一緒に見る時間を決める', '夕方六時以降が都合がいい'],
    ko: ['욕실 천장에서 물이 새요', '욕실 천장에서 물이 떨어져요. 위층 이웃에게 상황을 말하고 함께 살펴볼 시간을 정하고 싶어요.', '위층 집 문 앞', '주민', '위층 이웃', '욕실 천장 누수', '함께 볼 시간 정하기', '저녁 여섯 시 이후가 편함'],
    hi: ['बाथरूम की छत से पानी टपकना', 'मेरे बाथरूम की छत से पानी टपक रहा है। मैं ऊपर वाले पड़ोसी को बताना और साथ में देखने का समय तय करना चाहता/चाहती हूँ।', 'ऊपर वाले पड़ोसी के दरवाज़े पर', 'निवासी', 'ऊपर वाले पड़ोसी', 'बाथरूम की छत से रिसाव', 'देखने का समय तय करना', 'शाम छह बजे के बाद सुविधा है'],
  }),
  seed('S31', 'home', {
    'zh-Hans': ['和维修师傅确认时间', '维修师傅要来家里检查漏水，我想确认他来的时间和要做哪些工作。', '家里（电话）', '住户', '维修师傅', '上门检查的时间和范围', '确认时间和工作内容', '白天家里没人'],
    id: ['Memastikan jadwal tukang', 'Tukang akan datang memeriksa kebocoran. Saya ingin memastikan jam kedatangannya dan pekerjaan apa saja yang akan dilakukan.', 'Rumah (lewat telepon)', 'Penghuni', 'Tukang perbaikan', 'Jadwal dan lingkup pemeriksaan', 'Memastikan jam dan pekerjaannya', 'Siang hari tidak ada orang di rumah'],
    ja: ['修理業者と時間を確かめる', '修理の人が水漏れを見に来ます。来る時間と、どんな作業をするかを確かめたいです。', '自宅（電話）', '住人', '修理業者', '点検の時間と作業内容', '時間と作業内容を確かめる', '昼間は家に誰もいない'],
    ko: ['수리 기사와 시간 확인하기', '수리 기사가 누수를 점검하러 와요. 오는 시간과 어떤 작업을 하는지 확인하고 싶어요.', '집(전화)', '주민', '수리 기사', '방문 점검 시간과 작업 범위', '시간과 작업 내용 확인하기', '낮에는 집에 아무도 없음'],
    hi: ['मरम्मत करने वाले से समय पक्का करना', 'मरम्मत करने वाले रिसाव देखने आएँगे। मैं उनके आने का समय और किए जाने वाले काम पक्के करना चाहता/चाहती हूँ।', 'घर (फ़ोन पर)', 'निवासी', 'मरम्मत करने वाले', 'जाँच का समय और काम', 'समय और काम पक्का करना', 'दिन में घर पर कोई नहीं होता'],
  }),
  seed('S32', 'home', {
    'zh-Hans': ['温和地说说噪音', '楼上晚上常有声音，影响孩子睡觉，我想温和地和邻居商量一个办法。', '组屋走廊', '住户', '楼上邻居', '晚上的声音', '一起想一个办法', '语气要客气，保持好关系'],
    id: ['Membicarakan suara bising dengan sopan', 'Malam hari sering ada suara dari lantai atas sehingga anak saya sulit tidur. Saya ingin membicarakan jalan keluarnya dengan sopan.', 'Koridor flat', 'Penghuni', 'Tetangga lantai atas', 'Suara di malam hari', 'Mencari jalan keluar bersama', 'Tetap sopan dan menjaga hubungan baik'],
    ja: ['夜の音についておだやかに話す', '夜に上の階から音がして、子どもが眠れません。上の階の人とおだやかに話して、方法を一緒に考えたいです。', '公営住宅の廊下', '住人', '上の階の住人', '夜の音', '一緒に方法を考える', 'ていねいに話し、よい関係を保つ'],
    ko: ['소음 이야기를 부드럽게 하기', '밤에 위층에서 소리가 자주 나서 아이가 잠을 못 자요. 이웃과 부드럽게 방법을 의논하고 싶어요.', '아파트 복도', '주민', '위층 이웃', '밤에 나는 소리', '함께 방법 찾기', '정중하게, 좋은 관계 유지하기'],
    hi: ['शोर के बारे में नरमी से बात', 'रात में ऊपर से अक्सर आवाज़ आती है और बच्चा सो नहीं पाता। मैं पड़ोसी से नरमी से बात करके कोई रास्ता निकालना चाहता/चाहती हूँ।', 'फ़्लैट का गलियारा', 'निवासी', 'ऊपर वाले पड़ोसी', 'रात की आवाज़ें', 'मिलकर रास्ता निकालना', 'विनम्र रहना, अच्छे संबंध रखना'],
  }),
  // ---- Food and local life (sample F) ----
  seed('S33', 'food', {
    'zh-Hans': ['点一杯本地咖啡', '我想在饮料摊点一杯本地咖啡（kopi），听懂店员的问题并回答。', '小贩中心饮料摊', '顾客', '饮料摊店员', '点一杯饮料', '点到想要的饮料', '第一次自己点'],
    id: ['Memesan kopi lokal', 'Saya ingin memesan kopi lokal (kopi) di kios minuman, memahami pertanyaan penjual, dan menjawabnya.', 'Kios minuman di pusat jajanan', 'Pembeli', 'Penjual minuman', 'Memesan minuman', 'Mendapat minuman yang diinginkan', 'Pertama kali memesan sendiri'],
    ja: ['地元のコーヒーを注文する', '屋台の飲み物の店で地元のコーヒー（kopi）を注文し、店員の質問を聞き取って答えたいです。', 'ホーカーセンターの飲み物の屋台', '客', '屋台の店員', '飲み物の注文', 'ほしい飲み物を注文する', '自分で注文するのは初めて'],
    ko: ['현지 커피 주문하기', '음료 가판대에서 현지 커피(kopi)를 주문하고, 점원의 질문을 알아듣고 대답하고 싶어요.', '호커 센터 음료 가판대', '손님', '음료 가판대 점원', '음료 주문', '원하는 음료 주문하기', '처음으로 혼자 주문함'],
    hi: ['स्थानीय कॉफ़ी मँगवाना', 'मैं पेय की दुकान पर स्थानीय कॉफ़ी (kopi) मँगवाना चाहता/चाहती हूँ, और दुकानदार के सवाल समझकर जवाब देना चाहता/चाहती हूँ।', 'फ़ूड सेंटर की पेय दुकान', 'ग्राहक', 'पेय दुकान के कर्मचारी', 'एक पेय मँगवाना', 'मनचाहा पेय मिलना', 'पहली बार खुद मँगवा रहे हैं'],
  }),
  seed('S34', 'food', {
    'zh-Hans': ['要少糖、要冰的', '我想点一杯茶，说清楚要少糖，要冰的。', '咖啡店柜台', '顾客', '店员', '甜度和冷热', '说出自己的偏好', '不喜欢太甜'],
    id: ['Kurang manis dan pakai es', 'Saya ingin memesan teh dan menjelaskan bahwa saya mau kurang manis dan pakai es.', 'Konter kedai kopi', 'Pembeli', 'Penjual', 'Tingkat manis dan suhu', 'Menyampaikan pilihan sendiri', 'Tidak suka terlalu manis'],
    ja: ['甘さひかえめで冷たいもの', 'お茶を注文して、甘さはひかえめ、冷たいものがいいと伝えたいです。', 'コーヒー店のカウンター', '客', '店員', '甘さと温度', '自分の好みを伝える', '甘すぎるのは苦手'],
    ko: ['덜 달고 차갑게', '차를 주문하면서 덜 달게, 차갑게 해 달라고 분명히 말하고 싶어요.', '커피숍 카운터', '손님', '점원', '단맛과 온도', '내 취향 말하기', '너무 단 것을 싫어함'],
    hi: ['कम मीठा और ठंडा', 'मैं चाय मँगवाना चाहता/चाहती हूँ और साफ़ बताना चाहता/चाहती हूँ कि कम मीठी और ठंडी चाहिए।', 'कॉफ़ी की दुकान का काउंटर', 'ग्राहक', 'दुकान के कर्मचारी', 'मिठास और ठंडा-गरम', 'अपनी पसंद बताना', 'बहुत मीठा पसंद नहीं'],
  }),
  seed('S35', 'food', {
    'zh-Hans': ['在这里吃还是打包', '我在小贩中心买午饭，店员问我在这里吃还是带走，我想听懂并回答。', '小贩中心摊位', '顾客', '摊主', '堂食还是打包', '听懂问题并回答', '午饭时间人很多'],
    id: ['Makan di sini atau dibungkus', 'Saya membeli makan siang di pusat jajanan. Penjual bertanya apakah makan di sini atau dibawa pulang, dan saya ingin memahami lalu menjawab.', 'Kios di pusat jajanan', 'Pembeli', 'Pemilik kios', 'Makan di tempat atau dibungkus', 'Memahami pertanyaan dan menjawab', 'Jam makan siang sangat ramai'],
    ja: ['店内で食べるか持ち帰りか', 'ホーカーセンターで昼ごはんを買います。ここで食べるか持ち帰るか聞かれたら、聞き取って答えたいです。', 'ホーカーセンターの屋台', '客', '屋台の店主', '店内か持ち帰りか', '質問を聞き取って答える', '昼どきでとても混んでいる'],
    ko: ['먹고 갈지 포장할지', '호커 센터에서 점심을 사요. 점원이 여기서 먹을지 포장할지 물으면 알아듣고 대답하고 싶어요.', '호커 센터 가판대', '손님', '가판대 주인', '매장 식사 또는 포장', '질문을 알아듣고 대답하기', '점심시간이라 사람이 많음'],
    hi: ['यहीं खाएँगे या पैक करें', 'मैं फ़ूड सेंटर में दोपहर का खाना ले रहा/रही हूँ। दुकानदार पूछते हैं कि यहीं खाएँगे या ले जाएँगे, मैं समझकर जवाब देना चाहता/चाहती हूँ।', 'फ़ूड सेंटर की दुकान', 'ग्राहक', 'दुकान के मालिक', 'यहीं खाना या पैक करवाना', 'सवाल समझकर जवाब देना', 'दोपहर में बहुत भीड़ है'],
  }),
  seed('S36', 'food', {
    'zh-Hans': ['没听懂店员用的词', '店员用了一个我没听过的本地说法，我想请他解释，然后确认我的订单。', '小贩中心饮料摊', '顾客', '饮料摊店员', '没听过的本地说法', '请对方解释并确认订单', '不知道这个词的意思'],
    id: ['Tidak paham kata yang dipakai penjual', 'Penjual memakai istilah lokal yang belum pernah saya dengar. Saya ingin memintanya menjelaskan, lalu memastikan pesanan saya.', 'Kios minuman di pusat jajanan', 'Pembeli', 'Penjual minuman', 'Istilah lokal yang belum dikenal', 'Meminta penjelasan dan memastikan pesanan', 'Tidak tahu arti kata itu'],
    ja: ['店員の言葉が分からない', '店員が聞いたことのない地元の言い方を使いました。意味を説明してもらって、注文を確かめたいです。', 'ホーカーセンターの飲み物の屋台', '客', '屋台の店員', '知らない地元の言い方', '説明してもらい、注文を確かめる', 'その言葉の意味が分からない'],
    ko: ['점원이 쓴 말을 모르겠어요', '점원이 처음 듣는 현지 표현을 썼어요. 뜻을 설명해 달라고 한 뒤 주문을 확인하고 싶어요.', '호커 센터 음료 가판대', '손님', '음료 가판대 점원', '처음 듣는 현지 표현', '설명을 부탁하고 주문 확인하기', '그 말의 뜻을 모름'],
    hi: ['दुकानदार का शब्द समझ नहीं आया', 'दुकानदार ने एक स्थानीय शब्द कहा जो मैंने पहले नहीं सुना। मैं उसका मतलब पूछकर अपना ऑर्डर पक्का करना चाहता/चाहती हूँ।', 'फ़ूड सेंटर की पेय दुकान', 'ग्राहक', 'पेय दुकान के कर्मचारी', 'अनजाना स्थानीय शब्द', 'मतलब पूछना और ऑर्डर पक्का करना', 'उस शब्द का मतलब नहीं पता'],
  }),
];

export const sceneSeedsReviewed = sceneSeeds.every(item => sceneSeedReview(item.id).status === 'local-reviewed');
