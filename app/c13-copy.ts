import type { EntryLanguage } from './entry-copy';

// C13 (2026-10-18): listening again, "continue", local register labels and the guess before watching.
// Help-language text other than Chinese has not been reviewed by native speakers. Labels describe where a word is
// used; they never call it wrong or non-standard (spec §6.5). Nothing here counts days, scores or percentages.
type Place = { watch: string; role: string; terms: string; sentences: (n: number) => string; prompt: (n: number) => string; practice: (n: number) => string };
type Copy = {
  continueLast: string; place: Place; heard: (n: number) => string; heardReset: string; reviewEntry: (n: number) => string;
  reviewTitle: string; ask: string; missed: string; hint: string; clear: string; plain: string; play: string; replay: string;
  doneTitle: string; doneNote: string; back: string; saveFailed: string; reviewSection: string; limitLabel: string;
  sgStandard: string; colloquialHear: string; colloquialCasual: string; localNote: string; reviewedLocal: string; notReviewed: string;
  alsoSay: string; seeModel: string; guessTitle: string; guessAsk: string; guessOptions: [string, string, string]; guessSkip: string;
  guessYou: (choice: string) => string; guessFirst: string;
};

export const c13Copy: Record<EntryLanguage, Copy> = {
  'zh-Hans': {
    continueLast: '继续上次', place: { watch: '看场景', role: '认识角色', terms: '词组', sentences: n => `句子第 ${n} 句`, prompt: n => `接话第 ${n} 回合`, practice: n => `对练第 ${n} 回合` },
    heard: n => `已听过 ${n} 句`, heardReset: '删除全部数据时，已听过的句数也一起清空了，所以从 0 开始。', reviewEntry: n => `今天可以再听这几句（${n} 句）`,
    reviewTitle: '再听这几句', ask: '这一句听懂了吗？', missed: '没听懂', hint: '提示后懂', clear: '听懂了', plain: '说得清楚一点：', play: '播放这一句', replay: '再听一次',
    doneTitle: '今天的几句听完了', doneNote: '过几天会再请你听一听。连着两次选“听懂了”的句子就不再出现。', back: '返回我的场景', saveFailed: '没有记下这次选择，请再选一次。',
    reviewSection: '再听几句', limitLabel: '每天最多再听几句',
    sgStandard: '新加坡常用词', colloquialHear: '本地口语 · 听懂就好', colloquialCasual: '本地口语 · 熟人之间可以说',
    localNote: '本地用法标注由 AI 写成，尚未经本地审核。', reviewedLocal: '本地审查过', notReviewed: '尚未经本地审核',
    alsoSay: '也可以这样说', seeModel: '看示范答案',
    guessTitle: '先猜一下', guessAsk: '你猜对方会先问什么？', guessOptions: ['打招呼，问你需要什么', '问你的名字或预约', '问你要哪一种'], guessSkip: '跳过，直接看',
    guessYou: choice => `你猜的是：${choice}`, guessFirst: '对方先说的是：',
  },
  id: {
    continueLast: 'Lanjutkan', place: { watch: 'Tonton', role: 'Kenali peran', terms: 'Frasa', sentences: n => `Kalimat ke-${n}`, prompt: n => `Menjawab, giliran ke-${n}`, practice: n => `Latihan bicara, giliran ke-${n}` },
    heard: n => `Sudah mendengar ${n} kalimat`, heardReset: 'Saat semua data dihapus, jumlah kalimat yang sudah didengar ikut dihapus, jadi mulai lagi dari 0.', reviewEntry: n => `Hari ini bisa dengar lagi kalimat ini (${n} kalimat)`,
    reviewTitle: 'Dengar lagi kalimat ini', ask: 'Apakah kalimat ini sudah dipahami?', missed: 'Belum paham', hint: 'Paham setelah bantuan', clear: 'Sudah paham', plain: 'Cara yang lebih jelas: ', play: 'Putar kalimat ini', replay: 'Dengar sekali lagi',
    doneTitle: 'Kalimat hari ini sudah selesai', doneNote: 'Beberapa hari lagi Anda akan diajak mendengarnya lagi. Kalimat yang dua kali berturut-turut dipilih "Sudah paham" tidak muncul lagi.', back: 'Kembali ke situasi saya', saveFailed: 'Pilihan ini belum tersimpan. Silakan pilih lagi.',
    reviewSection: 'Dengar lagi', limitLabel: 'Paling banyak berapa kalimat per hari',
    sgStandard: 'Kata umum di Singapura', colloquialHear: 'Bahasa lisan lokal · cukup dipahami', colloquialCasual: 'Bahasa lisan lokal · boleh dipakai dengan kenalan',
    localNote: 'Keterangan pemakaian lokal ditulis oleh AI dan belum ditinjau secara lokal.', reviewedLocal: 'Sudah ditinjau secara lokal', notReviewed: 'Belum ditinjau secara lokal',
    alsoSay: 'Bisa juga dikatakan', seeModel: 'Lihat contoh jawaban',
    guessTitle: 'Tebak dulu', guessAsk: 'Menurut Anda, apa yang akan ditanyakan lebih dulu?', guessOptions: ['Menyapa dan menanyakan keperluan Anda', 'Menanyakan nama atau janji Anda', 'Menanyakan mana yang Anda mau'], guessSkip: 'Lewati, langsung tonton',
    guessYou: choice => `Tebakan Anda: ${choice}`, guessFirst: 'Yang dikatakan lebih dulu: ',
  },
  ja: {
    continueLast: '前回の続き', place: { watch: '動画', role: '役を知る', terms: 'フレーズ', sentences: n => `文の${n}番目`, prompt: n => `応答の${n}回目`, practice: n => `会話練習の${n}回目` },
    heard: n => `これまでに${n}文を聞きました`, heardReset: 'すべてのデータを削除したときに、聞いた文の数も一緒に消えたので、0から数え直しています。', reviewEntry: n => `今日もう一度聞ける文（${n}文）`,
    reviewTitle: 'もう一度聞く', ask: 'この文は聞き取れましたか？', missed: '聞き取れなかった', hint: 'ヒントで分かった', clear: '聞き取れた', plain: 'もっと分かりやすく言うと：', play: 'この文を再生', replay: 'もう一回再生',
    doneTitle: '今日の文はこれで終わりです', doneNote: '数日後にまた聞いてもらいます。2回続けて「聞き取れた」を選んだ文は出てこなくなります。', back: '自分の場面に戻る', saveFailed: 'この選択を記録できませんでした。もう一度選んでください。',
    reviewSection: 'もう一度聞く', limitLabel: '1日に聞き直す文の数',
    sgStandard: 'シンガポールでよく使う言葉', colloquialHear: '地元の話し言葉 · 聞いて分かれば十分', colloquialCasual: '地元の話し言葉 · 親しい人となら使える',
    localNote: '地元での使い方の説明はAIが書いたもので、地元の人による確認はまだです。', reviewedLocal: '地元の人が確認済み', notReviewed: '地元の人による確認はまだです',
    alsoSay: 'こうも言えます', seeModel: 'お手本の答えを見る',
    guessTitle: 'まず予想', guessAsk: '相手は最初に何を聞くと思いますか？', guessOptions: ['あいさつして、用件を聞く', '名前や予約を聞く', 'どれがいいかを聞く'], guessSkip: '飛ばしてすぐ見る',
    guessYou: choice => `あなたの予想：${choice}`, guessFirst: '相手が最初に言ったこと：',
  },
  ko: {
    continueLast: '지난번 이어서', place: { watch: '영상', role: '역할 알기', terms: '표현', sentences: n => `문장 ${n}번째`, prompt: n => `응답 ${n}번째 대화`, practice: n => `말하기 연습 ${n}번째 대화` },
    heard: n => `지금까지 ${n}문장을 들었어요`, heardReset: '모든 데이터를 삭제할 때 들은 문장 수도 함께 지워져서 0부터 다시 셉니다.', reviewEntry: n => `오늘 다시 들어 볼 문장 (${n}문장)`,
    reviewTitle: '다시 들어 보기', ask: '이 문장을 알아들었나요?', missed: '못 알아들었어요', hint: '힌트 보고 알았어요', clear: '알아들었어요', plain: '더 쉽게 말하면: ', play: '이 문장 재생', replay: '한 번 더 듣기',
    doneTitle: '오늘 문장은 다 들었어요', doneNote: '며칠 뒤에 다시 들어 보도록 할게요. 두 번 이어서 "알아들었어요"를 고른 문장은 더 나오지 않아요.', back: '내 상황으로 돌아가기', saveFailed: '이번 선택이 기록되지 않았어요. 다시 골라 주세요.',
    reviewSection: '다시 듣기', limitLabel: '하루에 다시 들을 문장 수',
    sgStandard: '싱가포르에서 흔히 쓰는 말', colloquialHear: '현지 구어 · 알아듣기만 하면 돼요', colloquialCasual: '현지 구어 · 친한 사이에는 써도 돼요',
    localNote: '현지 표현 설명은 AI가 썼고 아직 현지 검토를 받지 않았어요.', reviewedLocal: '현지 검토 완료', notReviewed: '아직 현지 검토 전',
    alsoSay: '이렇게도 말할 수 있어요', seeModel: '예시 답 보기',
    guessTitle: '먼저 맞혀 보기', guessAsk: '상대가 처음에 무엇을 물어볼까요?', guessOptions: ['인사하고 무엇이 필요한지 묻기', '이름이나 예약을 묻기', '어느 것을 원하는지 묻기'], guessSkip: '건너뛰고 바로 보기',
    guessYou: choice => `내 예상: ${choice}`, guessFirst: '상대가 처음 한 말: ',
  },
  hi: {
    continueLast: 'पिछली बार से आगे', place: { watch: 'वीडियो', role: 'भूमिकाएँ', terms: 'वाक्यांश', sentences: n => `वाक्य ${n}`, prompt: n => `उत्तर, बारी ${n}`, practice: n => `बोलकर अभ्यास, बारी ${n}` },
    heard: n => `अब तक ${n} वाक्य सुने`, heardReset: 'सारा डेटा हटाते समय सुने गए वाक्यों की गिनती भी हट गई, इसलिए गिनती फिर 0 से शुरू है।', reviewEntry: n => `आज ये वाक्य फिर सुन सकते हैं (${n} वाक्य)`,
    reviewTitle: 'ये वाक्य फिर सुनें', ask: 'क्या यह वाक्य समझ आया?', missed: 'समझ नहीं आया', hint: 'मदद से समझ आया', clear: 'समझ आया', plain: 'और साफ़ तरीके से: ', play: 'यह वाक्य चलाएँ', replay: 'एक बार और सुनें',
    doneTitle: 'आज के वाक्य पूरे हुए', doneNote: 'कुछ दिन बाद ये फिर सुनने को कहा जाएगा। जिस वाक्य पर दो बार एक के बाद एक "समझ आया" चुना, वह फिर नहीं आएगा।', back: 'मेरे दृश्यों पर लौटें', saveFailed: 'यह चुनाव दर्ज नहीं हुआ। कृपया फिर चुनें।',
    reviewSection: 'फिर सुनें', limitLabel: 'हर दिन ज़्यादा से ज़्यादा कितने वाक्य',
    sgStandard: 'सिंगापुर में आम शब्द', colloquialHear: 'स्थानीय बोलचाल · समझ लेना काफ़ी है', colloquialCasual: 'स्थानीय बोलचाल · जान-पहचान वालों से बोल सकते हैं',
    localNote: 'स्थानीय इस्तेमाल की जानकारी AI ने लिखी है, अभी स्थानीय समीक्षा नहीं हुई है।', reviewedLocal: 'स्थानीय समीक्षा हो चुकी', notReviewed: 'अभी स्थानीय समीक्षा नहीं हुई',
    alsoSay: 'ऐसे भी कह सकते हैं', seeModel: 'उदाहरण उत्तर देखें',
    guessTitle: 'पहले अंदाज़ा लगाएँ', guessAsk: 'आपके हिसाब से सामने वाला पहले क्या पूछेगा?', guessOptions: ['नमस्ते करके पूछेंगे कि क्या चाहिए', 'आपका नाम या बुकिंग पूछेंगे', 'पूछेंगे कि कौन-सा चाहिए'], guessSkip: 'छोड़ें, सीधे देखें',
    guessYou: choice => `आपका अंदाज़ा: ${choice}`, guessFirst: 'सामने वाले ने पहले कहा: ',
  },
};

// The small label next to a phrase or sentence, or null for ordinary English.
export function localTag(language: EntryLanguage, item: { register?: string; useAdvice?: string }) {
  const copy = c13Copy[language];
  if (item.register === 'sg-standard') return copy.sgStandard;
  if (item.register === 'sg-colloquial') return item.useAdvice === 'hear-only' ? copy.colloquialHear : copy.colloquialCasual;
  return null;
}
// C13-4: "reviewed locally" only for a record that a local reviewer actually marked; AI checks do not count.
export function reviewNote(language: EntryLanguage, status: string) {
  return status === 'local-reviewed' ? c13Copy[language].reviewedLocal : c13Copy[language].notReviewed;
}
