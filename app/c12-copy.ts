import type { EntryLanguage } from './entry-copy';

// C12 copy (2026-10-18, research reports 1 and 2): a recording with no sound, turns left today and the daily limit,
// a reply the phone would not autoplay, a microphone request that never answers, and "hear myself / hear the model".
// Help-language text other than Chinese has not been reviewed by native speakers yet.
export const c12CopyReviewed = false;
type Copy = {
  quiet: string; micStuck: string; dailyLimit: string; rateLimit: string; remaining: (n: number) => string;
  tapToHear: string; hearMe: string; hearModel: string; modelLine: string; youSaid: string; model: string; turn: (n: number) => string;
};
export const c12Copy: Record<EntryLanguage, Copy> = {
  'zh-Hans': {
    quiet: '没听到声音，可以再说一次，或者点“需要提示”。', micStuck: '麦克风没有反应。如果在微信或其他应用里，请在系统浏览器打开再试。',
    dailyLimit: '今天的对练次数用完了，可以继续听和看', rateLimit: '说得有点快，请等一分钟再试。', remaining: n => `今天还能对练 ${n} 轮`,
    tapToHear: '点这里听对方的回答', hearMe: '听我刚才说的', hearModel: '听示范', modelLine: '示范句：', youSaid: '你说的', model: '示范句', turn: n => `第 ${n} 回合`,
  },
  id: {
    quiet: 'Tidak terdengar suara. Coba bicara lagi, atau ketuk "Lihat petunjuk".', micStuck: 'Mikrofon tidak merespons. Jika dibuka di WeChat atau aplikasi lain, buka di browser sistem lalu coba lagi.',
    dailyLimit: 'Jatah latihan bicara hari ini sudah habis. Anda tetap bisa mendengar dan menonton', rateLimit: 'Terlalu cepat. Tunggu satu menit lalu coba lagi.', remaining: n => `Sisa latihan bicara hari ini: ${n} giliran`,
    tapToHear: 'Ketuk di sini untuk mendengar jawabannya', hearMe: 'Dengar suara saya', hearModel: 'Dengarkan contoh', modelLine: 'Contoh: ', youSaid: 'Anda bilang', model: 'Contoh', turn: n => `Giliran ${n}`,
  },
  ja: {
    quiet: '声が聞こえませんでした。もう一度話すか、「ヒントを見る」を押してください。', micStuck: 'マイクが反応しません。WeChat などのアプリ内で開いている場合は、標準のブラウザで開いてもう一度お試しください。',
    dailyLimit: '今日の話す練習の回数を使い切りました。聞く・見るはこのまま続けられます', rateLimit: '少し速すぎます。1 分ほど待ってからもう一度どうぞ。', remaining: n => `今日はあと ${n} 回話して練習できます`,
    tapToHear: 'ここを押して相手の答えを聞く', hearMe: '自分の声を聞く', hearModel: 'お手本を聞く', modelLine: 'お手本：', youSaid: 'あなたの発話', model: 'お手本', turn: n => `${n} 回目のやり取り`,
  },
  ko: {
    quiet: '소리가 들리지 않았어요. 다시 말하거나 "힌트 보기"를 누르세요.', micStuck: '마이크가 반응하지 않아요. 위챗 등 앱 안에서 열었다면 기본 브라우저에서 열어 다시 시도하세요.',
    dailyLimit: '오늘 말하기 연습 횟수를 다 썼어요. 듣기와 보기는 계속할 수 있어요', rateLimit: '조금 빨라요. 1분 뒤에 다시 시도하세요.', remaining: n => `오늘 말하기 연습 ${n}번 남았어요`,
    tapToHear: '여기를 눌러 상대의 대답 듣기', hearMe: '내가 한 말 듣기', hearModel: '예시 듣기', modelLine: '예시: ', youSaid: '내가 한 말', model: '예시', turn: n => `${n}번째 대화`,
  },
  hi: {
    quiet: 'आवाज़ नहीं सुनाई दी। फिर से बोलें, या "संकेत देखें" दबाएँ।', micStuck: 'माइक्रोफ़ोन जवाब नहीं दे रहा। अगर आप WeChat या किसी और ऐप में हैं, तो सिस्टम ब्राउज़र में खोलकर फिर कोशिश करें।',
    dailyLimit: 'आज के बोलकर अभ्यास पूरे हो गए। सुनना और देखना जारी रख सकते हैं', rateLimit: 'थोड़ा जल्दी हो गया। एक मिनट रुककर फिर कोशिश करें।', remaining: n => `आज ${n} बार और बोलकर अभ्यास कर सकते हैं`,
    tapToHear: 'सामने वाले का जवाब सुनने के लिए यहाँ दबाएँ', hearMe: 'अपनी आवाज़ सुनें', hearModel: 'नमूना सुनें', modelLine: 'नमूना: ', youSaid: 'आपने कहा', model: 'नमूना', turn: n => `बारी ${n}`,
  },
};
