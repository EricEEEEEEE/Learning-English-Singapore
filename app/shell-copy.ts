import type { EntryLanguage } from './entry-copy';

// C10 copy for the shared shell (top bar, "more" sheet, bottom bar) and the simplified practice page.
// Help-language text other than Chinese has not been reviewed by native speakers yet.
export const shellCopyReviewed = false;
type Copy = {
  more: string; close: string; language: string; about: string; aboutApp: string;
  progress: (step: number, total: number) => string; turn: (turn: number, total: number) => string;
  moreHelp: string; tipHint: string; playReply: string;
  setupTitle: string; setupNote: string; setupStart: string; practiceSettings: string; howTo: string; changeLanguage: (name: string) => string;
};
export const shellCopy: Record<EntryLanguage, Copy> = {
  'zh-Hans': {
    more: '更多', close: '关闭', language: '界面语言', about: '关于这节课', aboutApp: '关于',
    progress: (step, total) => `第 ${step} 步，共 ${total} 步`, turn: (turn, total) => `回合 ${turn}/${total}`,
    moreHelp: '更多帮助', tipHint: '不会说？点“需要提示”。', playReply: '再听回应',
    setupTitle: '开始前，选一下怎么练', setupNote: '不选也可以，直接用默认设置。之后可以在“更多”里改。', setupStart: '开始对练',
    practiceSettings: '练习设置', howTo: '怎么练', changeLanguage: name => `界面语言：${name}`,
  },
  id: {
    more: 'Lainnya', close: 'Tutup', language: 'Bahasa tampilan', about: 'Tentang pelajaran ini', aboutApp: 'Tentang',
    progress: (step, total) => `Langkah ${step} dari ${total}`, turn: (turn, total) => `Giliran ${turn}/${total}`,
    moreHelp: 'Bantuan lain', tipHint: 'Bingung mau bilang apa? Tekan "Lihat petunjuk".', playReply: 'Dengarkan balasan lagi',
    setupTitle: 'Sebelum mulai, pilih cara berlatih', setupNote: 'Boleh langsung mulai dengan pengaturan bawaan. Nanti bisa diubah di "Lainnya".', setupStart: 'Mulai latihan',
    practiceSettings: 'Pengaturan latihan', howTo: 'Cara berlatih', changeLanguage: name => `Bahasa tampilan: ${name}`,
  },
  ja: {
    more: 'その他', close: '閉じる', language: '表示言語', about: 'このレッスンについて', aboutApp: 'このアプリについて',
    progress: (step, total) => `ステップ ${step}/${total}`, turn: (turn, total) => `${turn}/${total} 回目`,
    moreHelp: 'ほかの助け', tipHint: '言葉が出ないときは「ヒントを見る」を押してください。', playReply: '返事をもう一度聞く',
    setupTitle: '始める前に、練習のしかたを選びましょう', setupNote: '選ばずにそのまま始めても大丈夫です。あとで「その他」から変えられます。', setupStart: '練習を始める',
    practiceSettings: '練習の設定', howTo: '練習のしかた', changeLanguage: name => `表示言語：${name}`,
  },
  ko: {
    more: '더 보기', close: '닫기', language: '화면 언어', about: '이 수업에 대해', aboutApp: '앱 정보',
    progress: (step, total) => `${total}단계 중 ${step}단계`, turn: (turn, total) => `대화 ${turn}/${total}`,
    moreHelp: '다른 도움', tipHint: '말이 안 나오면 "힌트 보기"를 누르세요.', playReply: '답변 다시 듣기',
    setupTitle: '시작하기 전에 연습 방법을 골라 보세요', setupNote: '고르지 않고 기본 설정으로 시작해도 돼요. 나중에 "더 보기"에서 바꿀 수 있어요.', setupStart: '연습 시작',
    practiceSettings: '연습 설정', howTo: '연습 방법', changeLanguage: name => `화면 언어: ${name}`,
  },
  hi: {
    more: 'और विकल्प', close: 'बंद करें', language: 'इंटरफ़ेस की भाषा', about: 'इस पाठ के बारे में', aboutApp: 'जानकारी',
    progress: (step, total) => `चरण ${step} / ${total}`, turn: (turn, total) => `बारी ${turn}/${total}`,
    moreHelp: 'और मदद', tipHint: 'क्या कहें समझ न आए? "संकेत देखें" दबाएँ।', playReply: 'जवाब फिर सुनें',
    setupTitle: 'शुरू करने से पहले अभ्यास का तरीका चुनें', setupNote: 'चाहें तो सीधे सामान्य सेटिंग से शुरू करें। बाद में "और विकल्प" में बदल सकते हैं।', setupStart: 'अभ्यास शुरू करें',
    practiceSettings: 'अभ्यास की सेटिंग', howTo: 'कैसे अभ्यास करें', changeLanguage: name => `इंटरफ़ेस की भाषा: ${name}`,
  },
};
