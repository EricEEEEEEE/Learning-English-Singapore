import type { EntryLanguage } from './entry-copy';

// Labels for the C4 listening and help controls. Assistant-language text is not yet native-reviewed.
type Copy = {
  slow: string; previous: string; hideCaption: string; showCaption: string; loopLine: string; abStart: string; abEnd: string; abLoop: string;
  help: string; helpClose: string; autoHelp: string; helpStart: string; helpFull: string; demo: string; slower: string; paused: string;
};
export const listenToolsCopy: Record<EntryLanguage, Copy> = {
  'zh-Hans': { slow: '慢速', previous: '上一句', hideCaption: '收起字幕', showCaption: '显示字幕', loopLine: '循环这句', abStart: 'A：从这句开始', abEnd: 'B：到这句结束', abLoop: 'A-B 循环',
    help: '帮我理解', helpClose: '收起解释', autoHelp: '我没开口时主动给提示', helpStart: '需要帮忙吗？可以这样开头：', helpFull: '可以这样说：', demo: '听示范', slower: '慢一点再听', paused: '录音已停止，没有发送。准备好可以再说一次。' },
  id: { slow: 'Pelan', previous: 'Kalimat sebelumnya', hideCaption: 'Sembunyikan teks', showCaption: 'Tampilkan teks', loopLine: 'Ulangi kalimat ini', abStart: 'A: mulai dari kalimat ini', abEnd: 'B: sampai kalimat ini', abLoop: 'Ulangi A-B',
    help: 'Bantu saya memahami', helpClose: 'Tutup penjelasan', autoHelp: 'Beri petunjuk jika saya diam', helpStart: 'Perlu bantuan? Bisa mulai dengan:', helpFull: 'Bisa dijawab:', demo: 'Dengarkan contoh', slower: 'Dengarkan lebih pelan', paused: 'Rekaman dihentikan dan tidak dikirim. Coba lagi saat siap.' },
  ja: { slow: 'ゆっくり', previous: '前の文', hideCaption: '字幕を隠す', showCaption: '字幕を表示', loopLine: 'この文をくり返す', abStart: 'A：この文から', abEnd: 'B：この文まで', abLoop: 'A-B くり返し',
    help: '意味を知りたい', helpClose: '説明を閉じる', autoHelp: '黙っているときにヒントを出す', helpStart: 'お手伝いしましょうか？こう始められます：', helpFull: 'こう言えます：', demo: 'お手本を聞く', slower: 'ゆっくりもう一度', paused: '録音を止めました。送信していません。準備ができたらもう一度どうぞ。' },
  ko: { slow: '느리게', previous: '이전 문장', hideCaption: '자막 숨기기', showCaption: '자막 보기', loopLine: '이 문장 반복', abStart: 'A: 이 문장부터', abEnd: 'B: 이 문장까지', abLoop: 'A-B 반복',
    help: '뜻 알려 주기', helpClose: '설명 닫기', autoHelp: '말이 없을 때 힌트 주기', helpStart: '도와드릴까요? 이렇게 시작해 보세요:', helpFull: '이렇게 말할 수 있어요:', demo: '예시 듣기', slower: '천천히 다시 듣기', paused: '녹음을 멈췄고 보내지 않았어요. 준비되면 다시 말해 주세요.' },
  hi: { slow: 'धीमा', previous: 'पिछला वाक्य', hideCaption: 'उपशीर्षक छिपाएँ', showCaption: 'उपशीर्षक दिखाएँ', loopLine: 'यह वाक्य दोहराएँ', abStart: 'A: इस वाक्य से', abEnd: 'B: इस वाक्य तक', abLoop: 'A-B दोहराएँ',
    help: 'समझने में मदद', helpClose: 'व्याख्या बंद करें', autoHelp: 'चुप रहने पर संकेत दें', helpStart: 'मदद चाहिए? ऐसे शुरू कर सकते हैं:', helpFull: 'ऐसे कह सकते हैं:', demo: 'उदाहरण सुनें', slower: 'धीरे फिर सुनें', paused: 'रिकॉर्डिंग रोक दी गई, भेजी नहीं गई। तैयार हों तो फिर बोलें।' },
};
