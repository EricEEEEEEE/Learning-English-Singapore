import type { EntryLanguage } from './entry-copy';

type Translation = readonly [string, string, string, string];
const languageIndex: Record<EntryLanguage, number> = { 'zh-Hans': 0, id: 1, ja: 2, ko: 3, hi: 3 };
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

const extraControls: Record<'ko' | 'hi', Partial<Record<keyof typeof controls, string>>> = {
  ko: {
    entry:'단계별 안내 미리보기', entryHint:'계정 없이 흐름을 살펴보세요. 능력을 측정하지 않습니다.', title:'한 단계씩, 시작점을 알아보세요', intro:'몰라도 괜찮고 언제든 멈출 수 있습니다. 현재는 선택 흐름만 미리 보며, 음성은 아직 연결되지 않았습니다.', article:'현재 질문', answerChoices:'답변 선택', preference:'선호도 알아보기', listening:'듣고 그림 고르기', progress:'{n} / 12번 질문', optionalProgress:'선택 질문 {n} / 4', unknown:'모르겠어요', skip:'이 질문 건너뛰기', back:'이전 질문으로', finish:'안내 끝내기', pause:'나중에 계속하기', paused:'일시 중지됨', pauseCopy:'잠시 쉬세요. 돌아오면 여기서 계속할 수 있습니다.', resume:'안내 계속하기', instructions:'사용 안내 듣기', audioQuestion:'질문 듣기', audioNotice:'음성은 아직 연결되지 않았습니다. 그림과 글은 흐름 예시이며 실제 듣기 문제가 아닙니다.', help:'이해를 도와주세요', helpTitle:'이해 도움', meaning:'뜻 듣기', helpCopy:'익숙한 언어의 설명과 그림 도움을 제공할 예정입니다. 음성과 내용 검토는 아직 준비 중입니다.', simulationControls:'재생 데모 제어', simulationCopy:'재생 이벤트만 시뮬레이션하며 소리나 실제 듣기 증거를 만들지 않습니다.', promptEnded:'질문 재생 종료 시뮬레이션', answerEnded:'전체 답변 재생 종료 시뮬레이션', playbackFailed:'재생 오류 시뮬레이션', replayCount:'다시 들은 횟수: {n}회(시뮬레이션)', answerShown:'답변 도움을 확인함(시뮬레이션)', deviceFailed:'재생 오류(시뮬레이션)', historyHint:'다시 듣기, 도움, 기기 문제는 답을 바꿔도 기록됩니다.', summary:'짧은 문장부터 천천히 시작하세요', starter:'우선 입문 단계에서 시작하며 언제든 조정할 수 있습니다', unknownResult:'듣기 수준은 아직 판단할 수 없습니다. 음성이 연결되지 않았고 데모 선택은 실제 이해의 증거가 아닙니다.', speaking:'말하기는 아직 확인되지 않았습니다', optional:'조금 더 알아보기(선택)', leave:'로그인으로 돌아가기', respect:'내 억양을 유지하고 내 속도로 하세요.', readError:'안내 진행 상황을 읽을 수 없습니다. 이번에는 미리 볼 수 있지만 선택은 저장되지 않습니다.', saveError:'안내 진행 상황을 저장할 수 없습니다. 이번에는 계속할 수 있습니다.', extra:'다른 표현으로 다시 보기: ',
  },
  hi: {
    entry:'चरण-दर-चरण मार्गदर्शिका देखें', entryHint:'बिना अकाउंट के प्रक्रिया देखें। यह आपकी क्षमता नहीं मापता।', title:'एक-एक कदम से अपनी शुरुआत जानें', intro:'न जानना ठीक है और आप कभी भी रुक सकते हैं। यह केवल चुनाव की प्रक्रिया है; ऑडियो अभी जुड़ा नहीं है।', article:'मौजूदा सवाल', answerChoices:'उत्तर के विकल्प', preference:'आपकी पसंद', listening:'सुनें और चित्र चुनें', progress:'सवाल {n} / 12', optionalProgress:'वैकल्पिक सवाल {n} / 4', unknown:'पता नहीं', skip:'यह सवाल छोड़ें', back:'पिछले सवाल पर जाएँ', finish:'मार्गदर्शिका समाप्त करें', pause:'बाद में जारी रखें', paused:'रुका हुआ', pauseCopy:'थोड़ा आराम करें। लौटकर यहीं से जारी रख सकते हैं।', resume:'मार्गदर्शिका जारी रखें', instructions:'इस्तेमाल के निर्देश सुनें', audioQuestion:'सवाल सुनें', audioNotice:'ऑडियो अभी जुड़ा नहीं है। चित्र और टेक्स्ट केवल प्रक्रिया के नमूने हैं, असली सुनने का सवाल नहीं।', help:'समझने में मदद करें', helpTitle:'समझने की मदद', meaning:'अर्थ सुनें', helpCopy:'यहाँ परिचित भाषा में अर्थ और चित्र की मदद मिलेगी। ऑडियो और सामग्री की समीक्षा अभी तैयार नहीं है।', simulationControls:'प्लेबैक डेमो नियंत्रण', simulationCopy:'ये केवल प्लेबैक घटनाओं का डेमो हैं; आवाज़ या असली सुनने का प्रमाण नहीं बनता।', promptEnded:'सवाल का ऑडियो खत्म होने का डेमो', answerEnded:'पूरा उत्तर खत्म होने का डेमो', playbackFailed:'प्लेबैक खराब होने का डेमो', replayCount:'{n} बार फिर सुना (डेमो)', answerShown:'उत्तर की मदद देखी (डेमो)', deviceFailed:'प्लेबैक खराब (डेमो)', historyHint:'दोबारा सुनना, मदद और डिवाइस की समस्या उत्तर बदलने पर भी दर्ज रहती है।', summary:'छोटे वाक्यों से धीरे शुरू करें', starter:'अभी शुरुआती सामग्री से शुरू करें; कभी भी बदल सकते हैं', unknownResult:'सुनने का स्तर अभी तय नहीं हुआ: ऑडियो जुड़ा नहीं है और डेमो चुनाव असली समझ का प्रमाण नहीं है।', speaking:'बोलने की क्षमता अभी देखी नहीं गई', optional:'थोड़ा और जानें (वैकल्पिक)', leave:'साइन-इन पर लौटें', respect:'अपना उच्चारण रखें और अपनी गति से चलें।', readError:'मार्गदर्शिका की प्रगति पढ़ी नहीं जा सकी। अभी देख सकते हैं, लेकिन चुनाव सहेजे नहीं जाएँगे।', saveError:'मार्गदर्शिका की प्रगति सहेजी नहीं जा सकी। अभी जारी रख सकते हैं।', extra:'दूसरे तरीके से फिर देखें: ',
  },
};

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

const extraPrompts: Record<'ko' | 'hi', Record<string, string>> = {
  ko: {
    experience:'평소 영어를 들을 때 어느 쪽에 가장 가깝나요?', situation:'요즘 가장 연습하고 싶은 상황은 무엇인가요?', voice:'지금 어떻게 참여하고 싶나요?', time:'보통 얼마 동안 연습하고 싶나요?', support:'막힐 때 어떤 도움을 받고 싶나요?',
    'foundation-drink':'음료 가게에서 어떤 음료를 들었나요?', 'foundation-greeting':'만났을 때 어떤 뜻을 들었나요?', 'foundation-time':'선생님이 하루 중 언제라고 말했나요?', 'foundation-number':'직원이 몇 잔이라고 했나요?', 'foundation-action':'동료가 먼저 어떤 행동을 하라고 했나요?', 'foundation-place':'교실은 어디에 있나요?', 'foundation-direction':'역무원이 어느 방향을 가리켰나요?',
    'natural-order':'업무 안내를 듣고 어떤 순서로 해야 하나요?', 'natural-plan':'두 사람의 말을 듣고 언제 만나기로 했나요?', 'natural-appointment':'방문자가 어떤 계획을 바꿨나요?', 'natural-response':'동료가 다른 표현으로 무엇을 말하려 하나요?', 'natural-number':'음료 주문을 들은 뒤 몇 잔이 필요한가요?', 'natural-direction':'다른 길 안내를 들은 뒤 어느 쪽으로 가야 하나요?', 'natural-local':'이 현지 표현은 상대에게 어떻게 말해 달라는 뜻인가요?',
  },
  hi: {
    experience:'आम तौर पर अंग्रेज़ी सुनते समय आप किसके सबसे करीब हैं?', situation:'इन दिनों आप किस स्थिति का सबसे अधिक अभ्यास करना चाहते हैं?', voice:'अभी आप किस तरह भाग लेना चाहते हैं?', time:'आप आम तौर पर कितना समय देना चाहते हैं?', support:'अटकने पर आपको कैसी मदद चाहिए?',
    'foundation-drink':'पेय की दुकान पर आपने कौन सा पेय सुना?', 'foundation-greeting':'मिलते समय आपने कौन सा अर्थ सुना?', 'foundation-time':'शिक्षक ने दिन का कौन सा समय कहा?', 'foundation-number':'दुकानदार ने कितने कप कहे?', 'foundation-action':'सहकर्मी ने पहले कौन सा काम करने को कहा?', 'foundation-place':'कक्षा कहाँ है?', 'foundation-direction':'स्टेशन कर्मचारी ने कौन सी दिशा बताई?',
    'natural-order':'काम के निर्देश सुनने के बाद क्रम क्या है?', 'natural-plan':'दोनों की बात सुनकर वे कब मिलने पर सहमत हुए?', 'natural-appointment':'आगंतुक ने कौन सी योजना बदली?', 'natural-response':'सहकर्मी ने दूसरे तरीके से क्या कहना चाहा?', 'natural-number':'पेय का ऑर्डर सुनने के बाद कितने कप चाहिए?', 'natural-direction':'दूसरे तरीके से दिशा सुनने पर आखिर किस ओर जाना है?', 'natural-local':'यह स्थानीय अभिव्यक्ति सामने वाले से किस तरह बोलने को कहती है?',
  },
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

const extraOptions: Record<'ko' | 'hi', Record<string, string>> = {
  ko: { new:'영어를 거의 못해요', words:'익숙한 단어 몇 개는 알아들어요', simple:'간단한 대화를 알아들어요', natural:'대부분 알아들어요', school:'학교와 선생님과의 대화', work:'직장에서의 대화', daily:'일상생활 서비스', own:'다른 일이 있어요', speak:'말해 보고 싶어요', quiet:'작게만 말할 수 있어요', listen:'지금은 듣기만 할래요', short:'몇 분', medium:'십여 분', long:'천천히, 서두르지 않기', show:'먼저 보여 주세요', twoChoices:'두 가지 선택을 주세요', wait:'잠시 기다려 주세요', coffee:'커피', water:'물', tea:'차', wave:'인사하기', enter:'들어가기', leave:'나가기', morning:'아침', noon:'정오', evening:'저녁', one:'한 잔', two:'두 잔', three:'세 잔', take:'물건 집기', here:'여기', upstairs:'위층', outside:'밖', left:'왼쪽', right:'오른쪽', straight:'직진', waitThenEnter:'기다린 뒤 들어가기', enterThenWait:'들어간 뒤 기다리기', afternoon:'오후', tomorrow:'내일', cancel:'예약 취소', move:'예약 시간 변경', confirm:'원래 시간 확인', cannot:'지금은 할 수 없음', repeat:'다시 말하기', ready:'준비됐어요', slow:'천천히 말하기', anotherWay:'다른 표현으로 말하기' },
  hi: { new:'अंग्रेज़ी लगभग नहीं आती', words:'कुछ परिचित शब्द समझता/समझती हूँ', simple:'सरल बातचीत समझता/समझती हूँ', natural:'अधिकतर समझता/समझती हूँ', school:'स्कूल और शिक्षक से बातचीत', work:'काम की बातचीत', daily:'रोज़मर्रा की सेवाएँ', own:'कुछ और कहना है', speak:'बोलना चाहता/चाहती हूँ', quiet:'केवल धीमी आवाज़ में', listen:'अभी केवल सुनना है', short:'कुछ मिनट', medium:'लगभग दस मिनट', long:'आराम से, जल्दी नहीं', show:'पहले उदाहरण दिखाएँ', twoChoices:'दो विकल्प दें', wait:'थोड़ा रुकें', coffee:'कॉफ़ी', water:'पानी', tea:'चाय', wave:'नमस्ते कहना', enter:'अंदर जाएँ', leave:'बाहर जाएँ', morning:'सुबह', noon:'दोपहर', evening:'शाम', one:'एक कप', two:'दो कप', three:'तीन कप', take:'वस्तु उठाएँ', here:'यहाँ', upstairs:'ऊपर', outside:'बाहर', left:'बाएँ', right:'दाएँ', straight:'सीधे', waitThenEnter:'रुकें, फिर अंदर जाएँ', enterThenWait:'अंदर जाएँ, फिर रुकें', afternoon:'दोपहर बाद', tomorrow:'कल', cancel:'अपॉइंटमेंट रद्द करें', move:'समय बदलें', confirm:'मूल समय की पुष्टि करें', cannot:'अभी नहीं कर सकते', repeat:'फिर से कहें', ready:'तैयार', slow:'धीरे बोलें', anotherWay:'दूसरे तरीके से कहें' },
};

export function guideCopy(language: EntryLanguage) {
  const base = Object.fromEntries(Object.entries(controls).map(([key, values]) => [key, values[languageIndex[language]]]));
  return { ...base, ...(language === 'ko' || language === 'hi' ? extraControls[language] : {}) } as Record<keyof typeof controls, string>;
}
export function questionText(key: string, language: EntryLanguage): string {
  const optional = key.startsWith('extra-');
  const base = optional ? key.slice(6) : key;
  const translated = language === 'ko' || language === 'hi' ? extraPrompts[language][base] : prompts[base][languageIndex[language]];
  return (optional ? guideCopy(language).extra : '') + translated;
}
export function optionText(id: string, language: EntryLanguage): string {
  return language === 'ko' || language === 'hi' ? extraOptions[language][id] : options[id][languageIndex[language]];
}
export function withNumber(text: string, number: number): string {
  return text.replace('{n}', String(number));
}
