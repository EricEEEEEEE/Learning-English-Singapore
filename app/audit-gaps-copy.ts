import type { EntryLanguage } from './entry-copy';

// C9 copy: goal change, "say it in my language", the "hard to hear" focus, review outcomes and comparison,
// and sentence report statuses. Help-language text other than Chinese has not been reviewed by native speakers yet.
export const auditGapsReviewed = false;
type Copy = {
  goalAsk: (summary: string) => string; goalConfirm: string; goalKeep: string; goalLine: (count: number, summary: string) => string; goalStale: string;
  nativeStart: string; nativeHeard: string; nativeSay: string; nativePlay: string; nativeRetry: string; nativeUnclear: string; nativeNote: string; nativeCount: (n: number) => string;
  focusUnclear: string;
  outcomeIndependent: string; outcomeAfterHint: string; outcomeNeedsHelp: string; outcomeChose: string; outcomeUnobserved: string;
  previousReview: string; thisReview: string; compareFirst: string; compareNote: string; reviewUnsaved: string;
  reportProcessing: string; reportDisabled: string; reportCorrected: string; sentenceDisabled: string; answerDisabled: string; elsewhere: (places: string) => string;
};

export const auditGapsCopy: Record<EntryLanguage, Copy> = {
  'zh-Hans': {
    goalAsk: summary => `对方想确认新的目标：${summary}`, goalConfirm: '换成新目标', goalKeep: '保持原来', goalLine: (count, summary) => `现在的目标：${summary}（第 ${count} 次改目标）`,
    goalStale: '目标已经改了，这条旧回应没有采用。请按新目标再说一次。',
    nativeStart: '用母语说', nativeHeard: '你用母语说的是：', nativeSay: '可以这样说：', nativePlay: '听这句', nativeRetry: '再用英语试一次',
    nativeUnclear: '没听清你想说的意思，可以再用母语说一次。', nativeNote: '这句英文是 AI 给的建议，还没有经过真人检查。', nativeCount: n => `母语说意思：${n} 次`,
    focusUnclear: '多练听不清',
    outcomeIndependent: '独立完成', outcomeAfterHint: '提示后完成', outcomeNeedsHelp: '还需要帮助', outcomeChose: '选了意思，未开口', outcomeUnobserved: '尚不能判断',
    previousReview: '上次', thisReview: '这次', compareFirst: '这是这个场景第一次保存的回顾，下次练完可以对比。', compareNote: '只对比各回合的情况。', reviewUnsaved: '这次回顾没有保存，下次不能拿来对比。',
    reportProcessing: '处理中', reportDisabled: '已停用这句', reportCorrected: '已有修正版',
    sentenceDisabled: '这句暂时停用：有人报告了问题，正在处理。原版保留，不会悄悄改动。', answerDisabled: '这句暂时停用：可以先听对方，再用自己的话回答。',
    elsewhere: places => `同样的表达也出现在：${places}`,
  },
  id: {
    goalAsk: summary => `Lawan bicara ingin memastikan tujuan baru: ${summary}`, goalConfirm: 'Pakai tujuan baru', goalKeep: 'Tetap seperti semula', goalLine: (count, summary) => `Tujuan sekarang: ${summary} (perubahan ke-${count})`,
    goalStale: 'Tujuan sudah berubah, jadi jawaban lama ini tidak dipakai. Silakan bicara lagi untuk tujuan baru.',
    nativeStart: 'Pakai bahasa saya', nativeHeard: 'Yang Anda katakan dalam bahasa Anda:', nativeSay: 'Anda bisa bilang: ', nativePlay: 'Dengarkan kalimat ini', nativeRetry: 'Coba lagi dalam bahasa Inggris',
    nativeUnclear: 'Maksud Anda belum jelas. Silakan katakan sekali lagi dalam bahasa Anda.', nativeNote: 'Kalimat bahasa Inggris ini saran dari AI dan belum diperiksa manusia.', nativeCount: n => `Pakai bahasa sendiri: ${n} kali`,
    focusUnclear: 'Lebih banyak latihan mendengar yang kurang jelas',
    outcomeIndependent: 'Selesai sendiri', outcomeAfterHint: 'Selesai setelah petunjuk', outcomeNeedsHelp: 'Masih perlu bantuan', outcomeChose: 'Memilih arti, belum bicara', outcomeUnobserved: 'Belum diketahui',
    previousReview: 'Terakhir kali', thisReview: 'Kali ini', compareFirst: 'Ini ringkasan pertama yang disimpan untuk situasi ini; lain kali bisa dibandingkan.', compareNote: 'Hanya membandingkan tiap giliran.', reviewUnsaved: 'Ringkasan ini belum tersimpan, jadi tidak bisa dibandingkan lain kali.',
    reportProcessing: 'Sedang diproses', reportDisabled: 'Kalimat ini dinonaktifkan', reportCorrected: 'Sudah ada versi perbaikan',
    sentenceDisabled: 'Kalimat ini dinonaktifkan sementara: ada laporan masalah yang sedang diproses. Versi asli tetap disimpan dan tidak diubah diam-diam.', answerDisabled: 'Kalimat ini dinonaktifkan sementara: dengarkan lawan bicara dulu, lalu jawab dengan kata-kata Anda sendiri.',
    elsewhere: places => `Ungkapan yang sama juga ada di: ${places}`,
  },
  ja: {
    goalAsk: summary => `相手が新しい目標を確かめています：${summary}`, goalConfirm: '新しい目標にする', goalKeep: '元のままにする', goalLine: (count, summary) => `今の目標：${summary}（${count} 回目の変更）`,
    goalStale: '目標が変わったため、この古い返事は使いませんでした。新しい目標でもう一度話してください。',
    nativeStart: '母語で話す', nativeHeard: '母語で話した内容：', nativeSay: 'こう言えます：', nativePlay: 'この文を聞く', nativeRetry: 'もう一度英語で話す',
    nativeUnclear: '言いたいことが聞き取れませんでした。もう一度母語で話してください。', nativeNote: 'この英文は AI の提案で、まだ人が確認していません。', nativeCount: n => `母語で意味を伝えた：${n} 回`,
    focusUnclear: '聞き取りにくい話し方を多めに',
    outcomeIndependent: '自力でできた', outcomeAfterHint: 'ヒントの後でできた', outcomeNeedsHelp: 'まだ助けが必要', outcomeChose: '意味を選んだ・まだ話していない', outcomeUnobserved: 'まだ判断できない',
    previousReview: '前回', thisReview: '今回', compareFirst: 'この場面で初めて保存したふり返りです。次回と比べられます。', compareNote: '各やり取りの様子を比べるだけです。', reviewUnsaved: '今回のふり返りは保存されませんでした。次回の比較には使えません。',
    reportProcessing: '対応中', reportDisabled: 'この文は停止中', reportCorrected: '修正版あり',
    sentenceDisabled: 'この文は一時停止中です：問題の報告があり、対応しています。元の版は残り、黙って変えることはありません。', answerDisabled: 'この文は一時停止中です：まず相手を聞いて、自分の言葉で答えてください。',
    elsewhere: places => `同じ表現はほかにも出てきます：${places}`,
  },
  ko: {
    goalAsk: summary => `상대가 새 목표를 확인하고 있어요: ${summary}`, goalConfirm: '새 목표로 바꾸기', goalKeep: '원래대로 두기', goalLine: (count, summary) => `지금 목표: ${summary} (${count}번째 변경)`,
    goalStale: '목표가 바뀌어서 이 이전 답은 쓰지 않았어요. 새 목표로 다시 말해 주세요.',
    nativeStart: '모국어로 말하기', nativeHeard: '모국어로 말한 내용:', nativeSay: '이렇게 말할 수 있어요: ', nativePlay: '이 문장 듣기', nativeRetry: '다시 영어로 해 보기',
    nativeUnclear: '하고 싶은 말을 잘 알아듣지 못했어요. 모국어로 한 번 더 말해 주세요.', nativeNote: '이 영어 문장은 AI의 제안이며 아직 사람이 확인하지 않았어요.', nativeCount: n => `모국어로 뜻 말하기: ${n}번`,
    focusUnclear: '잘 안 들리는 말 더 연습',
    outcomeIndependent: '혼자 해냄', outcomeAfterHint: '힌트 후 해냄', outcomeNeedsHelp: '아직 도움이 필요함', outcomeChose: '뜻을 골랐고 아직 말하지 않음', outcomeUnobserved: '아직 판단할 수 없음',
    previousReview: '지난번', thisReview: '이번', compareFirst: '이 상황에서 처음 저장한 돌아보기예요. 다음에 비교할 수 있어요.', compareNote: '대화별 상황만 비교해요.', reviewUnsaved: '이번 돌아보기는 저장되지 않아 다음에 비교할 수 없어요.',
    reportProcessing: '처리 중', reportDisabled: '이 문장 사용 중지', reportCorrected: '수정본 있음',
    sentenceDisabled: '이 문장은 잠시 사용 중지됐어요: 문제 신고가 있어 처리하고 있어요. 원래 버전은 남아 있고 몰래 바뀌지 않아요.', answerDisabled: '이 문장은 잠시 사용 중지됐어요: 먼저 상대 말을 듣고 내 말로 답해 보세요.',
    elsewhere: places => `같은 표현이 나오는 곳: ${places}`,
  },
  hi: {
    goalAsk: summary => `सामने वाला नया लक्ष्य पक्का कर रहा है: ${summary}`, goalConfirm: 'नया लक्ष्य अपनाएँ', goalKeep: 'पहले जैसा रखें', goalLine: (count, summary) => `अभी का लक्ष्य: ${summary} (${count}वाँ बदलाव)`,
    goalStale: 'लक्ष्य बदल गया है, इसलिए यह पुराना जवाब इस्तेमाल नहीं हुआ। नए लक्ष्य के लिए फिर से बोलें।',
    nativeStart: 'अपनी भाषा में बोलें', nativeHeard: 'आपने अपनी भाषा में कहा:', nativeSay: 'आप ऐसे कह सकते हैं: ', nativePlay: 'यह वाक्य सुनें', nativeRetry: 'फिर से अंग्रेज़ी में कोशिश करें',
    nativeUnclear: 'आपकी बात साफ़ समझ नहीं आई। अपनी भाषा में एक बार फिर कहें।', nativeNote: 'यह अंग्रेज़ी वाक्य AI का सुझाव है, अभी किसी इंसान ने नहीं जाँचा।', nativeCount: n => `अपनी भाषा में अर्थ बताया: ${n} बार`,
    focusUnclear: 'साफ़ न सुनाई देने वाली बात का ज़्यादा अभ्यास',
    outcomeIndependent: 'खुद पूरा किया', outcomeAfterHint: 'संकेत के बाद पूरा किया', outcomeNeedsHelp: 'अभी मदद चाहिए', outcomeChose: 'अर्थ चुना, अभी बोला नहीं', outcomeUnobserved: 'अभी तय नहीं कर सकते',
    previousReview: 'पिछली बार', thisReview: 'इस बार', compareFirst: 'इस दृश्य की यह पहली सहेजी गई समीक्षा है; अगली बार तुलना हो सकेगी।', compareNote: 'सिर्फ़ हर बारी की तुलना है।', reviewUnsaved: 'यह समीक्षा सहेजी नहीं गई, इसलिए अगली बार तुलना नहीं होगी।',
    reportProcessing: 'काम चल रहा है', reportDisabled: 'यह वाक्य रोका गया', reportCorrected: 'सुधरा हुआ संस्करण है',
    sentenceDisabled: 'यह वाक्य अभी रोका गया है: इसकी शिकायत आई है और उस पर काम चल रहा है। मूल संस्करण रखा गया है, उसे चुपचाप नहीं बदला जाएगा।', answerDisabled: 'यह वाक्य अभी रोका गया है: पहले सामने वाले को सुनें, फिर अपने शब्दों में जवाब दें।',
    elsewhere: places => `यही अभिव्यक्ति यहाँ भी है: ${places}`,
  },
};
