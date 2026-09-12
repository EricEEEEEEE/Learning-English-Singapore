import type { EntryLanguage } from './entry-copy';

type Translation = readonly [string, string, string, string];
const languageIndex: Record<EntryLanguage, number> = { 'zh-Hans': 0, id: 1, ja: 2, en: 3 };
const controls = {
  entry: ['预览逐题引导', 'Pratinjau panduan bertahap', '質問の流れをプレビュー', 'Preview the step-by-step guide'],
  entryHint: ['无需账号，先看看流程。不会测量你的能力。', 'Lihat alurnya tanpa akun. Kemampuan Anda tidak diukur.', 'アカウントなしで流れを確認できます。能力は測定しません。', 'Explore without an account. This does not measure your ability.'],
  title: ['一步一步，认识你的起点', 'Kenali titik awal Anda, selangkah demi selangkah', '一つずつ、始める場所を知る', 'Find a starting point, one step at a time'],
  intro: ['可以不知道，也可以随时停下。当前只预览选择流程；音频尚未接入，选择不代表真实听力表现。', 'Tidak yakin juga tidak apa-apa. Anda boleh berhenti kapan saja. Ini hanya pratinjau pilihan; audio belum terhubung dan pilihan tidak menunjukkan kemampuan mendengar.', 'わからなくても、途中でやめてもかまいません。これは選択の流れのプレビューです。音声は未接続で、選択は実際の聞く力を示しません。', 'It is fine to be unsure or to stop. This previews the choice flow only; audio is not connected yet, and choices do not show actual listening ability.'],
  article: ['当前问题', 'Pertanyaan saat ini', '今の質問', 'Current question'],
  answerChoices: ['回答选项', 'Pilihan jawaban', '回答の選択肢', 'Answer choices'],
  preference: ['了解你的偏好', 'Kenali pilihan Anda', '希望を教えてください', 'Your preferences'],
  listening: ['听音配图', 'Mendengar dan memilih gambar', '音声と絵の選択', 'Listening with pictures'],
  progress: ['第 {n} / 12 题', 'Pertanyaan {n} / 12', '質問 {n} / 12', 'Question {n} / 12'],
  optionalProgress: ['可选问题 {n} / 4', 'Pertanyaan opsional {n} / 4', '任意の質問 {n} / 4', 'Optional question {n} / 4'],
  unknown: ['不知道', 'Belum tahu', 'わからない', 'Not sure'],
  skip: ['跳过这题', 'Lewati pertanyaan ini', 'この質問を飛ばす', 'Skip this question'],
  back: ['回到上一题', 'Kembali ke pertanyaan sebelumnya', '前の質問に戻る', 'Back to the previous question'],
  finish: ['结束引导', 'Akhiri panduan', '質問を終える', 'Finish the guide'],
  pause: ['稍后继续', 'Lanjutkan nanti', 'あとで続ける', 'Continue later'],
  paused: ['已暂停', 'Dijeda', '一時停止しました', 'Paused'],
  pauseCopy: ['休息一下。回来后从这里接着选，不必重新开始。', 'Silakan beristirahat. Lanjutkan dari sini tanpa mengulang dari awal.', 'ひと休みしましょう。戻ったらここから続けられます。', 'Take a break. You can continue from here without starting over.'],
  resume: ['继续逐题引导', 'Lanjutkan panduan', '質問を再開する', 'Resume the guide'],
  instructions: ['听操作说明', 'Dengarkan petunjuk penggunaan', '操作説明を聞く', 'Listen to the instructions'],
  audioQuestion: ['听题目', 'Dengarkan pertanyaan', '質問を聞く', 'Listen to the question'],
  audioNotice: ['音频尚未接入。图和文字只是流程占位，不是正式听力题。', 'Audio belum terhubung. Gambar dan teks hanya contoh alur, bukan soal mendengar yang sesungguhnya.', '音声は未接続です。絵と文章は流れを示す仮の内容で、正式な聞き取りの質問ではありません。', 'Audio is not connected yet. Pictures and text show the flow, not a real listening item.'],
  help: ['帮我理解', 'Bantu saya memahami', '理解を助けて', 'Help me understand'],
  helpTitle: ['理解帮助', 'Bantuan pemahaman', '理解のサポート', 'Understanding help'],
  meaning: ['听释义', 'Dengarkan penjelasan', '意味を聞く', 'Listen to the meaning'],
  helpCopy: ['这里将提供熟悉语言的释义和图示支撑。目前音轨与内容审查尚未就绪，你可以关闭帮助或跳过这题。', 'Di sini akan tersedia penjelasan dalam bahasa yang Anda pahami dan bantuan gambar. Audio serta peninjauan konten belum siap. Anda boleh menutup bantuan atau melewati pertanyaan.', 'ここでは使い慣れた言語の説明と絵によるサポートを提供する予定です。音声と内容の確認はまだ準備中です。閉じたり、質問を飛ばしたりできます。', 'This will offer explanations in your familiar language and picture support. Audio and content review are not ready yet. You can close help or skip the question.'],
  simulationControls: ['演示播放控制', 'Kontrol pemutaran simulasi', '再生のデモ操作', 'Simulated playback controls'],
  simulationCopy: ['只模拟播放事件，不播放声音，也不产生真实听力证据。', 'Hanya menyimulasikan peristiwa pemutaran, tanpa suara atau bukti kemampuan mendengar.', '再生の状態だけを模擬します。音は流さず、実際の聞く力の証拠にもなりません。', 'These simulate playback events. They produce no sound or actual listening evidence.'],
  promptEnded: ['模拟题目播放结束', 'Simulasikan akhir audio pertanyaan', '質問の再生終了を模擬', 'Simulate question playback ending'],
  answerEnded: ['模拟完整答案播放结束', 'Simulasikan akhir audio jawaban lengkap', '答え全体の再生終了を模擬', 'Simulate full-answer playback ending'],
  playbackFailed: ['模拟播放故障', 'Simulasikan gangguan pemutaran', '再生の不具合を模擬', 'Simulate playback failure'],
  replayCount: ['已重听 {n} 次（模拟）', 'Didengarkan ulang {n} kali (simulasi)', 'もう一度聞いた回数：{n}回（模擬）', 'Listened again {n} times (simulated)'],
  answerShown: ['已查看答案提示（模拟）', 'Petunjuk jawaban sudah dibuka (simulasi)', '答えのヒントを確認済み（模擬）', 'Answer support viewed (simulated)'],
  deviceFailed: ['播放故障（模拟）', 'Gangguan pemutaran (simulasi)', '再生の不具合（模擬）', 'Playback failure (simulated)'],
  historyHint: ['重听、帮助和设备问题会保留；回退改答不会把它们抹掉。', 'Pemutaran ulang, bantuan, dan gangguan perangkat tetap dicatat saat Anda mengubah pilihan.', '聞き直し、サポート、端末の不具合は、戻って選び直しても記録に残ります。', 'Replays, support and device issues stay recorded when you go back and change a choice.'],
  summary: ['先从短句、慢一点开始', 'Mulai dari kalimat pendek, dengan lebih pelan', '短い文から、ゆっくり始めましょう', 'Start with short phrases, a little slower'],
  starter: ['暂按入门程度开始，可随时调整', 'Mulai sementara dari materi dasar; Anda dapat menyesuaikannya kapan saja', 'まずは入門の内容から。いつでも調整できます', 'Start with introductory content for now; you can adjust it any time'],
  unknownResult: ['听力尚不能判断：当前音频尚未接入，演示选择不会被当作真实理解证据。', 'Kemampuan mendengar belum dapat ditentukan: audio belum terhubung dan pilihan demo bukan bukti pemahaman nyata.', '聞く力はまだ判断できません。音声は未接続で、デモの選択は実際の理解の証拠にはしません。', 'Listening has not been measured: audio is not connected yet, and demo choices are not evidence of real understanding.'],
  speaking: ['说英语尚未了解', 'Kemampuan berbicara belum diketahui', '話す力はまだわかりません', 'Speaking has not been observed'],
  optional: ['继续了解（可选）', 'Lanjutkan sedikit lagi (opsional)', 'もう少し続ける（任意）', 'Explore a little more (optional)'],
  leave: ['返回登录入口', 'Kembali ke pilihan masuk', 'ログインの入口に戻る', 'Back to sign-in options'],
  respect: ['保留自己的口音，按自己的节奏。', 'Pertahankan aksen Anda sendiri, sesuai ritme Anda.', '自分のアクセントのまま、自分のペースで。', 'Keep your own accent. Go at your own pace.'],
  readError: ['无法读取引导进度；本次可以预览，选择暂不保存。刷新后需重选，旧记录保持不变。', 'Kemajuan panduan tidak dapat dibaca. Anda dapat mencoba alurnya, tetapi pilihan saat ini tidak disimpan. Setelah memuat ulang, pilih lagi; catatan lama tetap utuh.', '質問の進み具合を読み取れません。今回はプレビューできますが、選択は保存されません。再読み込み後は選び直してください。以前の記録はそのまま残ります。', 'Guide progress could not be read. You can preview this visit, but new choices will not be saved. Choose again after reloading; the old record stays unchanged.'],
  saveError: ['无法保存引导进度；本次仍可继续，刷新后可能需要重新选择。', 'Kemajuan panduan tidak dapat disimpan. Anda tetap dapat melanjutkan saat ini; setelah memuat ulang, Anda mungkin perlu memilih lagi.', '質問の進み具合を保存できません。今回は続けられますが、再読み込み後に選び直す場合があります。', 'Guide progress could not be saved. You can continue this visit, but may need to choose again after reloading.'],
  extra: ['换个说法，再看一次：', 'Dengan ungkapan lain, coba lagi: ', '別の言い方でもう一度：', 'Try a different wording: '],
} satisfies Record<string, Translation>;

const prompts: Record<string, Translation> = {
  experience: ['平时听到英语，你更像哪一种？', 'Saat mendengar bahasa Inggris, mana yang paling sesuai dengan Anda?', '普段英語を聞くとき、どれに近いですか？', 'When you hear English, which feels closest?'],
  situation: ['最近最想应付哪种情境？', 'Situasi apa yang paling Anda butuhkan akhir-akhir ini?', '最近、どんな場面で使いたいですか？', 'Which situation matters most to you right now?'],
  voice: ['现在，你愿意怎样参与？', 'Bagaimana Anda ingin berlatih saat ini?', '今はどんなふうに参加したいですか？', 'How would you like to take part right now?'],
  time: ['通常想留多久给自己？', 'Biasanya, berapa lama waktu yang ingin Anda luangkan?', '普段はどのくらいの時間を使いたいですか？', 'How much time would you usually like?'],
  support: ['卡住时，你希望得到什么帮助？', 'Saat merasa buntu, bantuan apa yang Anda inginkan?', '困ったとき、どんな助けがほしいですか？', 'When you get stuck, what help would you like?'],
  'foundation-drink': ['在饮品店，你听到了哪种饮品？', 'Di kedai minuman, minuman apa yang Anda dengar?', '飲み物のお店で、何の飲み物が聞こえましたか？', 'At the drink stall, which drink did you hear?'],
  'foundation-greeting': ['见面时，你听到了哪种意思？', 'Saat bertemu, maksud apa yang Anda dengar?', '会ったとき、どんな意味が聞こえましたか？', 'When meeting someone, which meaning did you hear?'],
  'foundation-time': ['老师说的是一天中的哪个时候？', 'Guru menyebut waktu yang mana?', '先生が話したのは、一日のいつですか？', 'Which part of the day did the teacher mention?'],
  'foundation-number': ['店员说的是几杯？', 'Berapa cangkir yang disebut penjual?', '店員さんは何杯と言いましたか？', 'How many cups did the stallholder mention?'],
  'foundation-action': ['同事请你先做哪个动作？', 'Tindakan apa yang diminta rekan kerja terlebih dahulu?', '同僚はまずどの動作をお願いしましたか？', 'Which action did your colleague ask for first?'],
  'foundation-place': ['教室的位置在哪里？', 'Di mana letak ruang kelasnya?', '教室はどこにありますか？', 'Where is the classroom?'],
  'foundation-direction': ['站员指的是哪个方向？', 'Petugas stasiun menyebut arah yang mana?', '駅員さんが示したのはどちらの方向ですか？', 'Which direction did the station staff give?'],
  'natural-order': ['听过工作安排后，先后顺序是什么？', 'Setelah mendengar instruksi kerja, bagaimana urutannya?', '仕事の説明を聞いて、どんな順番ですか？', 'After the work instructions, what is the order?'],
  'natural-plan': ['听完两个人的话，最后约在什么时候？', 'Setelah mendengar keduanya, kapan akhirnya mereka sepakat bertemu?', '二人の話のあと、最後にいつ会うことになりましたか？', 'After both people speak, when do they agree to meet?'],
  'natural-appointment': ['来访者改变了什么打算？', 'Rencana apa yang diubah pengunjung?', '来た人は予定をどう変えましたか？', 'How did the visitor change their plan?'],
  'natural-response': ['同事换了说法，想表达什么？', 'Rekan kerja mengatakannya dengan cara lain. Apa maksudnya?', '同僚が別の言い方をしました。何を伝えたいのでしょう？', 'Your colleague rephrased it. What do they mean?'],
  'natural-number': ['听完饮品订单，需要几杯？', 'Setelah mendengar pesanan minuman, berapa cangkir yang dibutuhkan?', '飲み物の注文を聞いて、何杯必要ですか？', 'After the drink order, how many cups are needed?'],
  'natural-direction': ['换一种问路说法，最后往哪走？', 'Dengan petunjuk arah yang berbeda, akhirnya harus ke mana?', '別の道案内の言い方で、最後はどちらへ進みますか？', 'With different directions, which way should you go?'],
  'natural-local': ['这段本地表达想请对方怎样说？', 'Ungkapan setempat ini meminta orang lain berbicara bagaimana?', 'この地域の表現は、相手にどう話してほしいという意味ですか？', 'What does this local expression ask the other person to do?'],
};

const options: Record<string, Translation> = {
  new: ['几乎不会英语', 'Hampir belum bisa bahasa Inggris', '英語はほとんどわからない', 'Almost no English'],
  words: ['听得懂一些熟悉的词', 'Memahami beberapa kata yang dikenal', '知っている単語が少しわかる', 'Some familiar words'],
  simple: ['能听懂简单交流', 'Memahami percakapan sederhana', '簡単な会話がわかる', 'Simple conversations'],
  natural: ['大多能听懂', 'Sebagian besar dapat dipahami', 'たいてい理解できる', 'Understand most of it'],
  school: ['学校与家校沟通', 'Sekolah dan komunikasi dengan guru', '学校や先生とのやりとり', 'School and teachers'],
  work: ['工作中的沟通', 'Komunikasi di tempat kerja', '仕事でのやりとり', 'At work'],
  daily: ['日常生活服务', 'Layanan sehari-hari', '暮らしのサービス', 'Everyday services'],
  own: ['有别的事想说', 'Ada hal lain yang dibutuhkan', 'ほかに話したいことがある', 'Something else in mind'],
  speak: ['愿意开口', 'Ingin berbicara', '話してみたい', 'Happy to speak'],
  quiet: ['只能小声', 'Hanya bisa berbicara pelan', '小さな声なら話せる', 'Only quietly'],
  listen: ['现在只想听', 'Saat ini hanya ingin mendengar', '今は聞くだけにしたい', 'Just listen for now'],
  short: ['几分钟', 'Beberapa menit', '数分', 'A few minutes'],
  medium: ['十来分钟', 'Sekitar sepuluh menit', '十数分', 'About ten minutes'],
  long: ['慢慢来，不着急', 'Santai, tidak terburu-buru', '急がずゆっくり', 'Take my time'],
  show: ['先给我示范', 'Tunjukkan contoh dahulu', 'まずお手本を見せて', 'Show me first'],
  twoChoices: ['给我两个选择', 'Berikan dua pilihan', '二つの選択肢がほしい', 'Give me two choices'],
  wait: ['等一等', 'Tunggu sebentar', '少し待つ', 'Wait a moment'],
  coffee: ['咖啡', 'Kopi', 'コーヒー', 'Coffee'], water: ['水', 'Air putih', '水', 'Water'], tea: ['茶', 'Teh', 'お茶', 'Tea'],
  wave: ['打招呼', 'Menyapa', 'あいさつする', 'Say hello'], enter: ['进去', 'Masuk', '中に入る', 'Go in'], leave: ['离开', 'Pergi', '外に出る', 'Leave'],
  morning: ['早上', 'Pagi', '朝', 'Morning'], noon: ['中午', 'Siang', '昼', 'Noon'], evening: ['晚上', 'Malam', '夜', 'Evening'],
  one: ['一杯', 'Satu cangkir', '一杯', 'One cup'], two: ['两杯', 'Dua cangkir', '二杯', 'Two cups'], three: ['三杯', 'Tiga cangkir', '三杯', 'Three cups'],
  take: ['拿起物品', 'Ambil barang', '物を取る', 'Pick it up'], here: ['这里', 'Di sini', 'ここ', 'Here'], upstairs: ['楼上', 'Di lantai atas', '上の階', 'Upstairs'], outside: ['外面', 'Di luar', '外', 'Outside'],
  left: ['左边', 'Kiri', '左', 'Left'], right: ['右边', 'Kanan', '右', 'Right'], straight: ['直走', 'Lurus', 'まっすぐ', 'Straight ahead'],
  waitThenEnter: ['先等，再进去', 'Tunggu, lalu masuk', '待ってから入る', 'Wait, then go in'], enterThenWait: ['先进去，再等', 'Masuk, lalu tunggu', '入ってから待つ', 'Go in, then wait'],
  afternoon: ['下午', 'Sore', '午後', 'Afternoon'], tomorrow: ['明天', 'Besok', '明日', 'Tomorrow'],
  cancel: ['取消预约', 'Batalkan janji', '予約を取り消す', 'Cancel the appointment'], move: ['改约时间', 'Ubah waktu janji', '予約の時間を変える', 'Change the time'], confirm: ['确认原定时间', 'Konfirmasi waktu semula', '元の時間を確認する', 'Confirm the original time'],
  cannot: ['暂时做不了', 'Belum bisa dilakukan', '今はできない', 'Cannot do it yet'], repeat: ['再说一次', 'Ulangi sekali lagi', 'もう一度言う', 'Say it again'], ready: ['准备好了', 'Sudah siap', '準備ができた', 'Ready'], slow: ['说慢一点', 'Bicara lebih pelan', 'ゆっくり話す', 'Speak more slowly'], anotherWay: ['换个说法', 'Katakan dengan cara lain', '別の言い方にする', 'Say it another way'],
};

export function guideCopy(language: EntryLanguage) {
  return Object.fromEntries(Object.entries(controls).map(([key, values]) => [key, values[languageIndex[language]]])) as Record<keyof typeof controls, string>;
}
export function questionText(key: string, language: EntryLanguage): string {
  const optional = key.startsWith('extra-');
  const base = optional ? key.slice(6) : key;
  return (optional ? guideCopy(language).extra : '') + prompts[base][languageIndex[language]];
}
export function optionText(id: string, language: EntryLanguage): string {
  return options[id][languageIndex[language]];
}
export function withNumber(text: string, number: number): string {
  return text.replace('{n}', String(number));
}
