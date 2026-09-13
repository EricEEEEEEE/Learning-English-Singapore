export type ScenarioLanguage = 'zh-Hans' | 'id' | 'ja' | 'en';
export type ScenarioOrigin = 'school' | 'work' | 'daily' | 'custom';
export type ScenarioFocus = 'purpose' | 'detail' | 'repair';
type Translation = readonly [string, string, string, string];
const indices: Record<ScenarioLanguage, number> = { 'zh-Hans': 0, id: 1, ja: 2, en: 3 };
export const focusIds: ScenarioFocus[] = ['purpose', 'detail', 'repair'];
const focuses: Record<ScenarioFocus, Translation> = {
  purpose: ['先说明来意', 'Sampaikan tujuan dahulu', 'まず用件を伝える', 'Start with your purpose'],
  detail: ['多问一个细节', 'Tanyakan satu detail lagi', 'もう一つ詳しく聞く', 'Ask one more detail'],
  repair: ['听不清时求助', 'Minta bantuan saat kurang jelas', '聞き取れないときに頼む', 'Ask for help when unclear'],
};
export function focusText(focus: ScenarioFocus, language: ScenarioLanguage) { return focuses[focus][indices[language]]; }
export function unknownFact(language: ScenarioLanguage) {
  return ['具体安排尚未核实', 'Pengaturan sebenarnya belum diperiksa', '実際の予定や手順は未確認です', 'The actual arrangements have not been verified'][indices[language]];
}
const seeds: Record<Exclude<ScenarioOrigin, 'custom'>, { goal: Translation; who: Translation; where: Translation; worry: Translation; source: string }> = {
  school: {
    goal: ['向老师了解一项课堂近况并确认下一步', 'Menanyakan satu kabar di kelas kepada guru dan memastikan langkah berikutnya', '先生に授業の様子を一つ聞いて、次の一歩を確かめたい', 'Ask a teacher about one classroom observation and agree a next step'],
    who: ['老师', 'Guru', '先生', 'Teacher'], where: ['约好的见面地点', 'Tempat pertemuan yang disepakati', '約束した面談の場所', 'An agreed meeting place'],
    worry: ['怕没听懂老师的观察', 'Khawatir tidak memahami pengamatan guru', '先生の話を聞き取れるか心配', 'Missing the teacher’s observation'], source: 'spec.md §7.4 · S02/S03/S07',
  },
  work: {
    goal: ['请同事把任务讲慢一点并确认先做哪一步', 'Meminta rekan menjelaskan tugas lebih pelan dan memastikan langkah pertama', '同僚に作業をゆっくり説明してもらい、最初の手順を確認したい', 'Ask a colleague to explain slowly and confirm the first step'],
    who: ['同事', 'Rekan kerja', '同僚', 'Colleague'], where: ['工作地点', 'Tempat kerja', '職場', 'Workplace'],
    worry: ['怕没听清先后顺序', 'Khawatir tidak menangkap urutannya', '順番を聞き取れるか心配', 'Missing the order of steps'], source: 'spec.md §7.2 · S13/S14',
  },
  daily: {
    goal: ['向店员说明饮品偏好并确认堂食还是打包', 'Menyampaikan pilihan minuman dan memastikan minum di tempat atau dibawa pulang', '店員に飲み物の希望を伝え、店内か持ち帰りかを確認したい', 'Tell a server your drink preferences and confirm eat-in or takeaway'],
    who: ['店员', 'Petugas kedai', '店員', 'Server'], where: ['饮品摊位', 'Kedai minuman', '飲み物の売り場', 'Drink stall'],
    worry: ['怕没听懂店员的确认', 'Khawatir tidak memahami konfirmasi petugas', '店員の確認を聞き取れるか心配', 'Missing the server’s confirmation'], source: 'spec.md §7.2 · S33–S36',
  },
};
export function seedContent(origin: Exclude<ScenarioOrigin, 'custom'>, language: ScenarioLanguage) {
  const seed = seeds[origin], index = indices[language];
  return { goal: seed.goal[index], who: seed.who[index], where: seed.where[index], worry: seed.worry[index], source: seed.source };
}

// These are generic communication templates, never inferred institutional facts or generated dialogue.
export function planContent(goal: string, focus: ScenarioFocus, language: ScenarioLanguage) {
  const title = focusText(focus, language);
  const index = indices[language];
  const opening: Translation = [`围绕「${goal}」，先说明自己想办的事。`, `Untuk “${goal}”, sampaikan maksud Anda dahulu.`, `「${goal}」について、自分の用件をまず伝えます。`, `For “${goal}”, start by explaining what you want to do.`];
  const actions: Record<ScenarioFocus, Translation> = {
    purpose: [`${title}：围绕「${goal}」提出一个请求，听对方回应后确认下一步。`, `${title}: ajukan satu permintaan tentang “${goal}”, lalu pastikan langkah berikutnya setelah mendengar jawaban.`, `${title}：「${goal}」について一つ頼み、返事を聞いて次の一歩を確認します。`, `${title}: make one request about “${goal}”, listen, and confirm a next step.`],
    detail: [`${title}：围绕「${goal}」问一个尚不清楚的细节；实际答案留给对方。`, `${title}: tanyakan satu hal yang belum jelas tentang “${goal}”; jawaban sebenarnya harus dari lawan bicara.`, `${title}：「${goal}」について不明な点を一つ聞きます。実際の答えは相手に確認します。`, `${title}: ask one unresolved detail about “${goal}”; leave the actual answer to the other person.`],
    repair: [`${title}：围绕「${goal}」请求重说或讲慢一点，再确认自己听到的意思。`, `${title}: untuk “${goal}”, minta pengulangan atau penjelasan lebih pelan, lalu pastikan maksudnya.`, `${title}：「${goal}」について、もう一度かゆっくり話してもらい、聞いた意味を確認します。`, `${title}: for “${goal}”, ask for repetition or a slower explanation, then check what you understood.`],
  };
  const prompts: Record<ScenarioFocus, Translation> = {
    purpose: [`${title}：想一想「${goal}」中最想请对方帮忙的一件事。`, `${title}: pikirkan satu bantuan yang Anda butuhkan untuk “${goal}”.`, `${title}：「${goal}」で、一番頼みたいことを一つ考えます。`, `${title}: pick one thing you need the other person to help with for “${goal}”.`],
    detail: [`${title}：为了「${goal}」，现在还缺哪一条信息？只问一条。`, `${title}: informasi apa yang masih kurang untuk “${goal}”? Tanyakan satu saja.`, `${title}：「${goal}」のために、まだ必要な情報は何ですか。一つだけ聞きます。`, `${title}: what one detail is still missing for “${goal}”? Ask that one question.`],
    repair: [`${title}：为了「${goal}」，选择请求重复或放慢；不猜没听到的信息。`, `${title}: untuk “${goal}”, pilih meminta pengulangan atau tempo lebih pelan; jangan menebak informasi.`, `${title}：「${goal}」のために、繰り返しかゆっくり話すことを頼みます。聞けなかった情報は推測しません。`, `${title}: for “${goal}”, choose repetition or a slower pace; do not guess missing information.`],
  };
  const ending: Translation = ['不清楚的内容可保留未知；可以请求帮助或换一个目的。', 'Hal yang belum jelas boleh tetap tidak diketahui; Anda boleh meminta bantuan atau mengubah tujuan.', '不明なことは未確認のままで構いません。助けを頼んだり、目的を変えたりできます。', 'Unknown information can stay unknown. You can ask for help or change your goal.'];
  return { focus: title, steps: [opening[index], actions[focus][index]], practice_prompts: [prompts[focus][index], ending[index]] };
}
