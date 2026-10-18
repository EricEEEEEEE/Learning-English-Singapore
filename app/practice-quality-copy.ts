import type { EntryLanguage } from './entry-copy';

// C6 copy for practice quality: focus, light correction, the ending and the review.
// Help-language text other than Chinese has not been reviewed by native speakers yet.
export const practiceQualityReviewed = false;
type Copy = {
  focusLegend: string; focusNormal: string; focusRefusal: string; focusRephrase: string;
  correctionLegend: string; correctionNormal: string; correctionLess: string;
  clarify: string; coach: string; wrong: string; wrongSaved: string; wrongFailed: string;
  end: string; doneTitle: string; endedTitle: string; again: string; back: string; keepGoing: string;
  reviewTitle: string; turnAnswered: (turn: number, said: string) => string; turnSilent: (turn: number) => string;
  hints: (n: number) => string; autoHelp: (n: number) => string; translations: (n: number) => string; unknownTransfer: string; reviewNote: string;
};
export const practiceQualityCopy: Record<EntryLanguage, Copy> = {
  'zh-Hans': {
    focusLegend: '这次想多练什么', focusNormal: '正常练', focusRefusal: '多练拒绝和改主意', focusRephrase: '对方换个问法',
    correctionLegend: '纠正多少', correctionNormal: '正常', correctionLess: '少纠正',
    clarify: '对方想确认你的意思，可以再说一次。', coach: '小提示：', wrong: '这条反馈不对', wrongSaved: '已记下，谢谢。我们会查看这条反馈，不会改动课程。', wrongFailed: '没有记下，请再试一次。',
    end: '结束练习', doneTitle: '这个场景练完了', endedTitle: '练习结束了', again: '再练一次', back: '回去看场景', keepGoing: '继续练',
    reviewTitle: '这次练习回顾', turnAnswered: (turn, said) => `第 ${turn} 回合：你开口说了“${said}”`, turnSilent: turn => `第 ${turn} 回合：没有开口，尚不能判断`,
    hints: n => `看提示：${n} 次`, autoHelp: n => `主动帮助：${n} 次`, translations: n => `母语解释：${n} 次`,
    unknownTransfer: '能不能应对没练过的问法：尚不能判断', reviewNote: '这里只记录这次页面上发生的事，用了帮助也没关系。',
  },
  id: {
    focusLegend: 'Kali ini mau latihan apa', focusNormal: 'Latihan biasa', focusRefusal: 'Lebih banyak penolakan dan berubah pikiran', focusRephrase: 'Lawan bicara bertanya dengan cara lain',
    correctionLegend: 'Seberapa banyak koreksi', correctionNormal: 'Biasa', correctionLess: 'Lebih sedikit',
    clarify: 'Lawan bicara ingin memastikan maksud Anda. Silakan katakan sekali lagi.', coach: 'Tips: ', wrong: 'Masukan ini salah', wrongSaved: 'Sudah dicatat, terima kasih. Kami akan memeriksanya; pelajaran tidak diubah.', wrongFailed: 'Belum tercatat. Silakan coba lagi.',
    end: 'Akhiri latihan', doneTitle: 'Situasi ini sudah selesai dilatih', endedTitle: 'Latihan selesai', again: 'Latihan lagi', back: 'Kembali ke situasi', keepGoing: 'Lanjut latihan',
    reviewTitle: 'Ringkasan latihan ini', turnAnswered: (turn, said) => `Giliran ${turn}: Anda mengatakan "${said}"`, turnSilent: turn => `Giliran ${turn}: belum bicara, belum diketahui`,
    hints: n => `Lihat petunjuk: ${n} kali`, autoHelp: n => `Bantuan otomatis: ${n} kali`, translations: n => `Penjelasan bahasa ibu: ${n} kali`,
    unknownTransfer: 'Bisa menghadapi pertanyaan yang belum dilatih: belum diketahui', reviewNote: 'Hanya mencatat apa yang terjadi di halaman ini. Memakai bantuan tidak apa-apa.',
  },
  ja: {
    focusLegend: '今回は何を多めに練習しますか', focusNormal: 'ふつうに練習', focusRefusal: '断りや気が変わる場面を多めに', focusRephrase: '相手が別の聞き方をする',
    correctionLegend: '直しの量', correctionNormal: 'ふつう', correctionLess: '少なめ',
    clarify: '相手が意味を確かめています。もう一度話してみましょう。', coach: 'ひとことヒント：', wrong: 'このフィードバックは違う', wrongSaved: '記録しました。ありがとうございます。確認しますが、教材は変わりません。', wrongFailed: '記録できませんでした。もう一度お試しください。',
    end: '練習を終える', doneTitle: 'この場面の練習は終わりました', endedTitle: '練習を終えました', again: 'もう一度練習', back: '場面に戻る', keepGoing: '練習を続ける',
    reviewTitle: '今回の練習のふり返り', turnAnswered: (turn, said) => `${turn} 回目のやり取り：「${said}」と話しました`, turnSilent: turn => `${turn} 回目のやり取り：まだ話していないので、判断できません`,
    hints: n => `ヒントを見た：${n} 回`, autoHelp: n => `自動のお手伝い：${n} 回`, translations: n => `母語の説明：${n} 回`,
    unknownTransfer: '練習していない聞き方に対応できるか：まだ判断できません', reviewNote: 'このページで起きたことだけを記録しています。助けを使っても大丈夫です。',
  },
  ko: {
    focusLegend: '이번에는 무엇을 더 연습할까요', focusNormal: '보통 연습', focusRefusal: '거절과 마음 바꾸기 더 연습', focusRephrase: '상대가 다르게 물어보기',
    correctionLegend: '교정 정도', correctionNormal: '보통', correctionLess: '적게',
    clarify: '상대가 뜻을 확인하고 싶어 해요. 한 번 더 말해 보세요.', coach: '작은 팁: ', wrong: '이 피드백은 틀렸어요', wrongSaved: '기록했어요. 고마워요. 확인하겠지만 수업은 바뀌지 않아요.', wrongFailed: '기록하지 못했어요. 다시 시도하세요.',
    end: '연습 끝내기', doneTitle: '이 상황 연습을 마쳤어요', endedTitle: '연습을 끝냈어요', again: '다시 연습하기', back: '상황 보러 가기', keepGoing: '계속 연습하기',
    reviewTitle: '이번 연습 돌아보기', turnAnswered: (turn, said) => `${turn}번째 대화: "${said}"라고 말했어요`, turnSilent: turn => `${turn}번째 대화: 말하지 않아서 아직 판단할 수 없어요`,
    hints: n => `힌트 보기: ${n}번`, autoHelp: n => `자동 도움: ${n}번`, translations: n => `모국어 설명: ${n}번`,
    unknownTransfer: '연습하지 않은 질문에 대응할 수 있는지: 아직 판단할 수 없어요', reviewNote: '이 페이지에서 있었던 일만 기록해요. 도움을 써도 괜찮아요.',
  },
  hi: {
    focusLegend: 'इस बार किसका ज़्यादा अभ्यास करें', focusNormal: 'सामान्य अभ्यास', focusRefusal: 'मना करना और मन बदलना ज़्यादा', focusRephrase: 'सामने वाला दूसरे ढंग से पूछे',
    correctionLegend: 'कितना सुधार', correctionNormal: 'सामान्य', correctionLess: 'कम सुधार',
    clarify: 'सामने वाला आपका मतलब पक्का करना चाहता है। एक बार फिर बोलें।', coach: 'छोटा सुझाव: ', wrong: 'यह सुझाव गलत है', wrongSaved: 'दर्ज कर लिया, धन्यवाद। हम इसे देखेंगे; पाठ नहीं बदलेगा।', wrongFailed: 'दर्ज नहीं हुआ। फिर कोशिश करें।',
    end: 'अभ्यास समाप्त करें', doneTitle: 'यह दृश्य पूरा हो गया', endedTitle: 'अभ्यास समाप्त हुआ', again: 'फिर से अभ्यास करें', back: 'दृश्य पर लौटें', keepGoing: 'अभ्यास जारी रखें',
    reviewTitle: 'इस अभ्यास की समीक्षा', turnAnswered: (turn, said) => `बारी ${turn}: आपने कहा "${said}"`, turnSilent: turn => `बारी ${turn}: आप नहीं बोले, अभी कुछ नहीं कहा जा सकता`,
    hints: n => `संकेत देखे: ${n} बार`, autoHelp: n => `अपने-आप मदद: ${n} बार`, translations: n => `मातृभाषा व्याख्या: ${n} बार`,
    unknownTransfer: 'बिना अभ्यास वाले सवालों को संभाल पाना: अभी कुछ नहीं कहा जा सकता', reviewNote: 'यहाँ सिर्फ़ इस पेज पर हुई बातें दर्ज हैं। मदद लेना ठीक है।',
  },
};
