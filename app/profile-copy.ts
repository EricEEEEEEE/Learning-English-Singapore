import type { EntryLanguage } from './entry-copy';
import type { ContentBand } from '../lib/onboarding';
import type { StudyChoice } from '../lib/placement';

type Translation = readonly [string, string, string, string];
const languageIndex: Record<EntryLanguage, number> = { 'zh-Hans': 0, id: 1, ja: 2, en: 3 };
const labels = {
  region: ['学习起点与帮助', 'Titik awal dan bantuan', '学習の出発点とサポート', 'Starting point and support'],
  listening: ['目前能听懂的内容', 'Yang sudah dipahami saat mendengar', '今聞いてわかる内容', 'What you understand when listening'],
  unknown: ['尚不能判断', 'Belum dapat dinilai', 'まだ判断できません', 'Not enough evidence yet'],
  provisional: ['暂定的听力起点，之后可调整', 'Titik awal mendengar sementara, dapat disesuaikan', '仮の聞き取りの出発点です。あとで調整できます', 'A provisional listening starting point, open to adjustment'],
  evidence: ['独立听力证据：{n}', 'Bukti mendengar mandiri: {n}', '自力で聞いて理解した記録：{n}', 'Independent listening observations: {n}'],
  demo: ['演示回答不作为能力证据', 'Jawaban simulasi bukan bukti kemampuan', 'デモでの回答は能力の証拠にはなりません', 'Demo answers are not evidence of ability'],
  recommendation: ['建议从这里开始', 'Saran titik awal', 'おすすめの始め方', 'Suggested starting point'],
  settings: ['当前练习设置', 'Pengaturan latihan saat ini', '現在の練習設定', 'Current practice settings'],
  content: ['内容', 'Materi', '内容', 'Content'],
  speedLabel: ['速度', 'Kecepatan', '速さ', 'Speed'],
  supportLabel: ['帮助', 'Bantuan', 'サポート', 'Support'],
  contentGroup: ['选择内容起点', 'Pilih titik awal materi', '内容の出発点を選ぶ', 'Choose a content starting point'],
  speedGroup: ['选择速度', 'Pilih kecepatan', '速さを選ぶ', 'Choose the pace'],
  helpGroup: ['调整提示', 'Sesuaikan petunjuk', 'ヒントを調整する', 'Adjust the hints'],
  simpler: ['更简单', 'Lebih sederhana', 'もっとやさしく', 'Simpler'],
  natural: ['更自然', 'Lebih alami', 'もっと自然に', 'More natural'],
  slower: ['更慢', 'Lebih lambat', 'もっとゆっくり', 'Slower'],
  speed: ['自然速度', 'Kecepatan alami', '自然な速さ', 'Natural speed'],
  fewer: ['减少提示', 'Kurangi petunjuk', 'ヒントを減らす', 'Fewer hints'],
  restore: ['恢复建议', 'Pulihkan saran', 'おすすめに戻す', 'Restore recommendation'],
  feedback: ['反馈有误', 'Tandai masukan keliru', '評価の誤りを知らせる', 'Flag incorrect feedback'],
  flagged: ['反馈已标记', 'Masukan telah ditandai', '誤りを記録しました', 'Feedback flagged'],
  feedbackHint: ['这项标记不会改变听力判断。', 'Penandaan ini tidak mengubah penilaian mendengar.', 'この印を付けても、聞く力の判断は変わりません。', 'This flag does not change your listening assessment.'],
  choiceHint: ['这是你选择的练习方式，不会改变能力记录。音频尚未接入，当前仅保存偏好。', 'Ini pilihan cara berlatih, bukan perubahan catatan kemampuan. Audio belum terhubung; hanya preferensi yang disimpan.', '練習のしかたを選ぶ設定です。能力の記録は変わりません。音声は未接続で、今は希望だけを保存します。', 'These are your practice preferences, without changing ability records. Audio is not connected; only preferences are saved.'],
  readError: ['练习设置读取失败，本次调整暂不保存，旧记录保持不变', 'Pengaturan latihan tidak dapat dibaca. Perubahan sementara tidak disimpan; catatan lama tetap utuh.', '練習設定を読み込めませんでした。今回の変更は保存せず、以前の記録はそのまま残します。', 'Practice settings could not be read. Changes are temporary; the old record stays unchanged.'],
  saveError: ['无法保存练习设置，本次仍可继续', 'Pengaturan latihan tidak dapat disimpan. Anda tetap bisa melanjutkan saat ini.', '練習設定を保存できませんが、今回はそのまま続けられます。', 'Practice settings could not be saved. You can still continue for now.'],
} satisfies Record<string, Translation>;
const bands: Record<ContentBand, Translation> = {
  L0: ['短句入门', 'Mulai dengan frasa pendek', '短い表現から始める', 'Start with short phrases'],
  L1: ['一句话一件事', 'Satu maksud per kalimat', '一文で一つのこと', 'One idea per sentence'],
  L2: ['简单的往来', 'Percakapan sederhana', '簡単なやりとり', 'Simple exchanges'],
  L3: ['练习接住变化', 'Latihan menghadapi perubahan', '変化への対応を練習', 'Practise handling a change'],
  L4: ['更自然的交流', 'Percakapan yang lebih alami', 'より自然なやりとり', 'More natural exchanges'],
};
const speeds: Record<StudyChoice['speed'], Translation> = {
  slow: ['慢一点', 'Pelan-pelan', 'ゆっくり', 'Slow'],
  natural: labels.speed,
};
const supports: Record<StudyChoice['support'], Translation> = {
  full: ['充分帮助', 'Bantuan lengkap', '十分なサポート', 'Full support'],
  guided: ['需要时给提示', 'Petunjuk saat diperlukan', '必要なときにヒント', 'Hints when needed'],
  minimal: ['较少提示', 'Lebih sedikit petunjuk', '少なめのヒント', 'Fewer hints'],
};
export function profileCopy(language: EntryLanguage) {
  return Object.fromEntries(Object.entries(labels).map(([key, value]) => [key, value[languageIndex[language]]])) as Record<keyof typeof labels, string>;
}
export function choiceText(choice: StudyChoice, language: EntryLanguage) {
  const index = languageIndex[language];
  return { content: bands[choice.content_band][index], speed: speeds[choice.speed][index], support: supports[choice.support][index] };
}
export function bandText(band: ContentBand, language: EntryLanguage) { return bands[band][languageIndex[language]]; }
