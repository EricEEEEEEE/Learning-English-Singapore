import type { EntryLanguage } from './entry-copy';

type Copy = { watch: string; enter: string; role: string; roleSource: string; learner: string; partner: string; learnerFallback: string; partnerFallback: string; start: string; watchAgain: string; roleBack: string; nextSentence: string; nextPrompt: string; previousSentence: string; previousTerm: string; complete: string; short: (seconds: number) => string };
export const guidedSceneCopy: Record<EntryLanguage, Copy> = {
  'zh-Hans': {
    watch: '看一遍这个场景', enter: '进入角色学习', role: '现在轮到你', roleSource: '本次需求中的身份', learner: '这次你是', partner: '对方是', learnerFallback: '场景中回答的一方', partnerFallback: '对方',
    start: '开始学词组', watchAgain: '重看场景', roleBack: '返回角色说明', nextSentence: '下一步：句子', nextPrompt: '下一步：提示接话', previousSentence: '上一步：句子', previousTerm: '上一步：词组',
    complete: '场景看完了。可以重播，或进入角色学习。', short: seconds => `约${seconds}秒短片 · 非5–8分钟完整课程`,
  },
  id: {
    watch: 'Tonton situasi ini', enter: 'Masuk ke peran Anda', role: 'Sekarang giliran Anda', roleSource: 'Peran dalam kebutuhan Anda', learner: 'Peran Anda', partner: 'Lawan bicara', learnerFallback: 'Pihak yang menjawab dalam situasi', partnerFallback: 'Lawan bicara',
    start: 'Mulai frasa', watchAgain: 'Tonton situasi lagi', roleBack: 'Kembali ke penjelasan peran', nextSentence: 'Berikutnya: kalimat', nextPrompt: 'Berikutnya: jawab dengan petunjuk', previousSentence: 'Sebelumnya: kalimat', previousTerm: 'Sebelumnya: frasa',
    complete: 'Situasi selesai. Tonton lagi atau mulai berlatih peran.', short: seconds => `Cuplikan sekitar ${seconds} detik · Bukan pelajaran lengkap 5–8 menit`,
  },
  ja: {
    watch: 'この場面を見ましょう', enter: '役になって練習', role: '今度はあなたの番です', roleSource: '今回の希望に記載された役', learner: 'あなたの役', partner: '相手の役', learnerFallback: '場面で応答する人', partnerFallback: '相手',
    start: 'フレーズから始める', watchAgain: '場面をもう一度見る', roleBack: '役の説明に戻る', nextSentence: '次へ：文', nextPrompt: '次へ：答えを見て応答', previousSentence: '前へ：文', previousTerm: '前へ：フレーズ',
    complete: '場面を見終わりました。もう一度見るか、役の練習に進めます。', short: seconds => `約${seconds}秒の短い動画 · 5–8分の完全な教材ではありません`,
  },
  ko: {
    watch: '이 상황을 먼저 보세요', enter: '역할 연습으로', role: '이제 당신 차례예요', roleSource: '이번 요청에 적은 역할', learner: '당신의 역할', partner: '상대 역할', learnerFallback: '상황에서 대답하는 사람', partnerFallback: '상대',
    start: '표현부터 시작', watchAgain: '상황 다시 보기', roleBack: '역할 설명으로', nextSentence: '다음: 문장', nextPrompt: '다음: 답을 보며 응답', previousSentence: '이전: 문장', previousTerm: '이전: 표현',
    complete: '상황을 다 봤어요. 다시 보거나 역할 연습으로 갈 수 있어요.', short: seconds => `약 ${seconds}초 짧은 영상 · 5–8분 완성 수업이 아니에요`,
  },
  hi: {
    watch: 'पहले यह दृश्य देखें', enter: 'अपनी भूमिका में जाएँ', role: 'अब आपकी बारी है', roleSource: 'इस अनुरोध में बताई गई भूमिका', learner: 'आपकी भूमिका', partner: 'सामने वाले की भूमिका', learnerFallback: 'दृश्य में जवाब देने वाला व्यक्ति', partnerFallback: 'सामने वाला',
    start: 'वाक्यांशों से शुरू करें', watchAgain: 'दृश्य फिर देखें', roleBack: 'भूमिका के विवरण पर लौटें', nextSentence: 'आगे: वाक्य', nextPrompt: 'आगे: उत्तर देखकर बोलें', previousSentence: 'पीछे: वाक्य', previousTerm: 'पीछे: वाक्यांश',
    complete: 'दृश्य पूरा हुआ। फिर देखें या भूमिका का अभ्यास शुरू करें।', short: seconds => `लगभग ${seconds} सेकंड का छोटा वीडियो · पूरा 5–8 मिनट का पाठ नहीं`,
  },
};
