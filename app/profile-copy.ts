import type { EntryLanguage } from './entry-copy';
import type { ContentBand } from '../lib/onboarding';
import type { StudyChoice } from '../lib/placement';

type Translation = readonly [string, string, string, string];
const languageIndex: Record<EntryLanguage, number> = { 'zh-Hans': 0, id: 1, ja: 2, ko: 3, hi: 3 };
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
const extraLabels: Record<'ko'|'hi', Partial<Record<keyof typeof labels,string>>> = {
  ko: { region:'학습 시작점과 도움', listening:'현재 알아들을 수 있는 내용', unknown:'아직 판단할 수 없음', provisional:'임시 듣기 시작점이며 나중에 조정할 수 있습니다', evidence:'독립 듣기 증거: {n}', demo:'데모 답변은 능력 증거가 아닙니다', recommendation:'추천 시작점', settings:'현재 연습 설정', content:'내용', speedLabel:'속도', supportLabel:'도움', contentGroup:'내용 시작점 선택', speedGroup:'속도 선택', helpGroup:'힌트 조정', simpler:'더 쉽게', natural:'더 자연스럽게', slower:'더 천천히', speed:'자연스러운 속도', fewer:'힌트 줄이기', restore:'추천으로 복원', feedback:'잘못된 피드백 신고', flagged:'피드백이 표시됨', feedbackHint:'이 표시는 듣기 판단을 바꾸지 않습니다.', choiceHint:'연습 방식 선택이며 능력 기록을 바꾸지 않습니다. 지금은 선호도만 저장합니다.', readError:'연습 설정을 읽을 수 없습니다. 변경은 임시이며 이전 기록은 유지됩니다.', saveError:'연습 설정을 저장할 수 없지만 계속할 수 있습니다.' },
  hi: { region:'सीखने की शुरुआत और मदद', listening:'अभी सुनकर समझी जाने वाली सामग्री', unknown:'अभी तय नहीं किया जा सकता', provisional:'सुनने की अस्थायी शुरुआत, बाद में बदली जा सकती है', evidence:'स्वतंत्र सुनने के प्रमाण: {n}', demo:'डेमो उत्तर क्षमता का प्रमाण नहीं हैं', recommendation:'यहाँ से शुरू करने का सुझाव', settings:'मौजूदा अभ्यास सेटिंग', content:'सामग्री', speedLabel:'गति', supportLabel:'मदद', contentGroup:'सामग्री की शुरुआत चुनें', speedGroup:'गति चुनें', helpGroup:'संकेत बदलें', simpler:'और सरल', natural:'अधिक स्वाभाविक', slower:'और धीमा', speed:'स्वाभाविक गति', fewer:'कम संकेत', restore:'सुझाव वापस लाएँ', feedback:'गलत फ़ीडबैक बताएँ', flagged:'फ़ीडबैक चिह्नित', feedbackHint:'यह चिह्न सुनने के आकलन को नहीं बदलता।', choiceHint:'ये अभ्यास की पसंद हैं, क्षमता का रिकॉर्ड नहीं बदलता। अभी केवल पसंद सहेजी जाती है।', readError:'अभ्यास सेटिंग पढ़ी नहीं जा सकीं। बदलाव अस्थायी हैं और पुराना रिकॉर्ड सुरक्षित है।', saveError:'अभ्यास सेटिंग सहेजी नहीं जा सकीं; अभी जारी रख सकते हैं।' },
};
const extraBands: Record<'ko'|'hi',Record<ContentBand,string>> = {
  ko:{L0:'짧은 문장으로 시작',L1:'한 문장에 한 가지',L2:'간단한 대화',L3:'변화에 대응하기',L4:'더 자연스러운 대화'},
  hi:{L0:'छोटे वाक्यों से शुरू करें',L1:'एक वाक्य में एक बात',L2:'सरल बातचीत',L3:'बदलाव सँभालने का अभ्यास',L4:'अधिक स्वाभाविक बातचीत'},
};
const extraSpeeds={ko:{slow:'천천히',natural:'자연스러운 속도'},hi:{slow:'धीमा',natural:'स्वाभाविक गति'}};
const extraSupports={ko:{full:'충분한 도움',guided:'필요할 때 힌트',minimal:'적은 힌트'},hi:{full:'पूरी मदद',guided:'ज़रूरत पर संकेत',minimal:'कम संकेत'}};
export function profileCopy(language: EntryLanguage) {
  const base=Object.fromEntries(Object.entries(labels).map(([key, value]) => [key, value[languageIndex[language]]]));
  return {...base,...(language==='ko'||language==='hi'?extraLabels[language]:{})} as Record<keyof typeof labels, string>;
}
export function choiceText(choice: StudyChoice, language: EntryLanguage) {
  const index = languageIndex[language];
  if(language==='ko'||language==='hi') return {content:extraBands[language][choice.content_band],speed:extraSpeeds[language][choice.speed],support:extraSupports[language][choice.support]};
  return { content: bands[choice.content_band][index], speed: speeds[choice.speed][index], support: supports[choice.support][index] };
}
export function bandText(band: ContentBand, language: EntryLanguage) { return language==='ko'||language==='hi'?extraBands[language][band]:bands[band][languageIndex[language]]; }
