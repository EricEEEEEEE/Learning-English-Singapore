import type { EntryLanguage } from './entry-copy';

// C11 copy (user 2026-10-18, second round of "simpler"): short labels under the watch tools, the learning step bar,
// "you could say", optional keywords, generation stages, data and privacy, my scenes rows and the review counts.
// Help-language text other than Chinese has not been reviewed by native speakers yet.
export const c11CopyReviewed = false;
type Copy = {
  tools: { previous: string; replay: string; play: string; pause: string; next: string; caption: string; slow: string };
  nextLine: string; steps: [string, string, string, string]; stepsLabel: string; practiceTools: string;
  youCanSay: string; reveal: string; keywordsMore: string; stages: [string, string, string]; stagesLabel: string;
  dataPrivacy: string; rowMore: (description: string) => string; seconds: (n: number) => string;
  spoken: string; small: { hints: string; help: string; native: string };
};
export const c11Copy: Record<EntryLanguage, Copy> = {
  'zh-Hans': {
    tools: { previous: '上一句', replay: '重播', play: '播放', pause: '暂停', next: '下一句', caption: '字幕', slow: '慢速' },
    nextLine: '下一句', steps: ['词组', '句子', '接话', '对练'], stepsLabel: '学习步骤', practiceTools: '练习工具',
    youCanSay: '你可以说', reveal: '点一下显示', keywordsMore: '再补充一点（可选）', stages: ['剧本', '配音', '画面'], stagesLabel: '生成阶段',
    dataPrivacy: '数据与隐私', rowMore: description => `更多操作：${description}`, seconds: n => `约${n}秒`,
    spoken: '开口', small: { hints: '提示', help: '帮助', native: '母语' },
  },
  id: {
    tools: { previous: 'Sebelum', replay: 'Ulang', play: 'Putar', pause: 'Jeda', next: 'Berikut', caption: 'Teks', slow: 'Pelan' },
    nextLine: 'Kalimat berikutnya', steps: ['Frasa', 'Kalimat', 'Jawab', 'Latihan'], stepsLabel: 'Langkah belajar', practiceTools: 'Alat latihan',
    youCanSay: 'Anda bisa bilang', reveal: 'Ketuk untuk melihat', keywordsMore: 'Tambah sedikit lagi (opsional)', stages: ['Naskah', 'Suara', 'Gambar'], stagesLabel: 'Tahap pembuatan',
    dataPrivacy: 'Data dan privasi', rowMore: description => `Pilihan lain: ${description}`, seconds: n => `sekitar ${n} detik`,
    spoken: 'Bicara', small: { hints: 'Petunjuk', help: 'Bantuan', native: 'Bahasa ibu' },
  },
  ja: {
    tools: { previous: '前の文', replay: '最初から', play: '再生', pause: '一時停止', next: '次の文', caption: '字幕', slow: 'ゆっくり' },
    nextLine: '次の文', steps: ['フレーズ', '文', '応答', '練習'], stepsLabel: '学習のステップ', practiceTools: '練習ツール',
    youCanSay: 'こう言えます', reveal: 'タップで表示', keywordsMore: 'もう少し追加（任意）', stages: ['台本', '音声', '映像'], stagesLabel: '作成の段階',
    dataPrivacy: 'データとプライバシー', rowMore: description => `その他の操作：${description}`, seconds: n => `約${n}秒`,
    spoken: '話した', small: { hints: 'ヒント', help: '手助け', native: '母語' },
  },
  ko: {
    tools: { previous: '이전', replay: '처음부터', play: '재생', pause: '정지', next: '다음', caption: '자막', slow: '느리게' },
    nextLine: '다음 문장', steps: ['표현', '문장', '응답', '연습'], stepsLabel: '학습 단계', practiceTools: '연습 도구',
    youCanSay: '이렇게 말할 수 있어요', reveal: '눌러서 보기', keywordsMore: '조금 더 적기 (선택)', stages: ['대본', '음성', '화면'], stagesLabel: '만드는 단계',
    dataPrivacy: '데이터와 개인정보', rowMore: description => `더 보기: ${description}`, seconds: n => `약 ${n}초`,
    spoken: '말하기', small: { hints: '힌트', help: '도움', native: '모국어' },
  },
  hi: {
    tools: { previous: 'पिछला', replay: 'दोबारा', play: 'चलाएँ', pause: 'रोकें', next: 'अगला', caption: 'उपशीर्षक', slow: 'धीमा' },
    nextLine: 'अगला वाक्य', steps: ['वाक्यांश', 'वाक्य', 'जवाब', 'अभ्यास'], stepsLabel: 'सीखने के चरण', practiceTools: 'अभ्यास के साधन',
    youCanSay: 'आप कह सकते हैं', reveal: 'देखने के लिए छुएँ', keywordsMore: 'थोड़ा और जोड़ें (वैकल्पिक)', stages: ['पटकथा', 'आवाज़', 'दृश्य'], stagesLabel: 'बनने के चरण',
    dataPrivacy: 'डेटा और निजता', rowMore: description => `और विकल्प: ${description}`, seconds: n => `लगभग ${n} सेकंड`,
    spoken: 'बोले', small: { hints: 'संकेत', help: 'मदद', native: 'मातृभाषा' },
  },
};
