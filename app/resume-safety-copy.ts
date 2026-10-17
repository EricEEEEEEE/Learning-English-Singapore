import type { EntryLanguage } from './entry-copy';

// C8 copy: offline and reconnect, display switches, practice resume, cancelling a generation, small practice
// controls and safety notes. Help-language text other than Chinese has not been reviewed by native speakers yet.
export const resumeSafetyCopyReviewed = false;
type Copy = {
  offline: string; unsavedOffline: string; practiceOffline: string; progressOffline: string;
  display: string; largeText: string; reducedMotion: string;
  cancel: string; cancelled: string; cancelFailed: string; stopExplain: string; stopConfirm: string; keepGoing: string; stopped: string;
  think: string; thinking: string; pause: string; choose: string; chooseLegend: string; chosenSay: string; chosenScene: string; turnChosen: (turn: number) => string;
  resumeTitle: string; resumeListen: string; resumeContinue: string;
  safety: string; privacy: string;
};
export const resumeSafetyCopy: Record<EntryLanguage, Copy> = {
  'zh-Hans': {
    offline: '网络断开。现在不会发送或重试任何内容，连上网后会自动恢复。', unsavedOffline: '未保存，连上网后再试。',
    practiceOffline: '网络断开，暂时不能开口对练。连上网后再按“开始说”。', progressOffline: '网络断开：学习位置还没保存，连上网后会自动保存。',
    display: '显示', largeText: '大字号', reducedMotion: '减少动画',
    cancel: '取消生成', cancelled: '已取消。还没有提交给任何服务，不产生费用。可以返回修改后重新生成。', cancelFailed: '没有取消成功，请再试一次。',
    stopExplain: '已经交给服务方的步骤无法撤回，费用照记。可以在当前这一步完成后停止，不再提交新的步骤。', stopConfirm: '当前步骤后停止', keepGoing: '继续生成',
    stopped: '已停止：已经提交的步骤无法撤回，费用照记；之后不会再提交新的步骤。',
    think: '我想一想', thinking: '好的，这一回合先不弹出提示。想好了再按“开始说”。', pause: '停一下', choose: '选意思', chooseLegend: '你想说的是哪个意思？',
    chosenSay: '英语可以这样说：', chosenScene: '这一回合场景里的回答是：', turnChosen: turn => `第 ${turn} 回合：选了意思，未开口`,
    resumeTitle: '回到上次练到的这一回合。', resumeListen: '先听对方这句', resumeContinue: '直接继续',
    safety: '这是沟通练习，不是医疗或办事的真实结论。', privacy: '不必写真实姓名、学校或证件号。',
  },
  id: {
    offline: 'Koneksi internet terputus. Tidak ada yang dikirim atau dicoba ulang sekarang; akan pulih otomatis saat tersambung lagi.', unsavedOffline: 'Belum tersimpan. Coba lagi setelah tersambung ke internet.',
    practiceOffline: 'Koneksi terputus, latihan bicara belum bisa dimulai. Tekan "Mulai bicara" lagi setelah tersambung.', progressOffline: 'Koneksi terputus: posisi belajar belum tersimpan dan akan disimpan otomatis saat tersambung lagi.',
    display: 'Tampilan', largeText: 'Teks besar', reducedMotion: 'Kurangi animasi',
    cancel: 'Batalkan pembuatan', cancelled: 'Dibatalkan. Belum dikirim ke layanan mana pun dan tidak ada biaya. Anda dapat kembali mengedit lalu membuat lagi.', cancelFailed: 'Pembatalan belum berhasil. Silakan coba lagi.',
    stopExplain: 'Langkah yang sudah dikirim ke penyedia tidak dapat ditarik kembali dan biayanya tetap dicatat. Pembuatan dapat dihentikan setelah langkah ini selesai, tanpa mengirim langkah baru.', stopConfirm: 'Hentikan setelah langkah ini', keepGoing: 'Lanjutkan pembuatan',
    stopped: 'Dihentikan: langkah yang sudah dikirim tidak dapat ditarik kembali dan biayanya tetap dicatat; tidak ada langkah baru yang akan dikirim.',
    think: 'Saya pikir dulu', thinking: 'Baik, petunjuk otomatis tidak muncul untuk giliran ini. Tekan "Mulai bicara" saat siap.', pause: 'Berhenti sebentar', choose: 'Pilih maksud', chooseLegend: 'Maksud mana yang ingin Anda sampaikan?',
    chosenSay: 'Dalam bahasa Inggris bisa dikatakan:', chosenScene: 'Jawaban dalam situasi untuk giliran ini:', turnChosen: turn => `Giliran ${turn}: memilih maksud, belum berbicara`,
    resumeTitle: 'Kembali ke giliran terakhir yang Anda latih.', resumeListen: 'Dengarkan kalimat lawan bicara dulu', resumeContinue: 'Langsung lanjut',
    safety: 'Ini latihan komunikasi, bukan kesimpulan medis atau urusan resmi yang sebenarnya.', privacy: 'Tidak perlu menulis nama asli, sekolah, atau nomor identitas.',
  },
  ja: {
    offline: 'ネットワークが切れています。今は何も送信・再試行しません。つながると自動で戻ります。', unsavedOffline: '保存されていません。ネットにつながってからもう一度どうぞ。',
    practiceOffline: 'ネットワークが切れているため、話す練習はまだ始められません。つながってから「話す」を押してください。', progressOffline: 'ネットワークが切れています：学習位置はまだ保存されていません。つながると自動で保存します。',
    display: '表示', largeText: '大きな文字', reducedMotion: '動きを減らす',
    cancel: '生成をキャンセル', cancelled: 'キャンセルしました。まだどのサービスにも送っていないので、費用はかかりません。戻って修正し、もう一度生成できます。', cancelFailed: 'キャンセルできませんでした。もう一度お試しください。',
    stopExplain: 'サービスに送った手順は取り消せず、費用はそのまま記録されます。今の手順が終わったところで止め、新しい手順は送らないようにできます。', stopConfirm: '今の手順の後で止める', keepGoing: '生成を続ける',
    stopped: '停止しました：送信済みの手順は取り消せず、費用はそのまま記録されます。この後、新しい手順は送りません。',
    think: '少し考えたい', thinking: 'わかりました。このやり取りではヒントを自動で出しません。準備ができたら「話す」を押してください。', pause: '一時停止', choose: '意味を選ぶ', chooseLegend: '言いたいのはどの意味ですか？',
    chosenSay: '英語ではこう言えます：', chosenScene: 'このやり取りの場面での答え：', turnChosen: turn => `${turn} 回目：意味を選んだだけで、まだ話していません`,
    resumeTitle: '前回練習していたやり取りに戻りました。', resumeListen: '先に相手の文を聞く', resumeContinue: 'そのまま続ける',
    safety: 'これはコミュニケーションの練習で、医療や手続きの実際の結論ではありません。', privacy: '本名、学校名、身分証の番号を書く必要はありません。',
  },
  ko: {
    offline: '네트워크 연결이 끊겼어요. 지금은 아무것도 보내거나 다시 시도하지 않아요. 연결되면 자동으로 돌아와요.', unsavedOffline: '저장되지 않았어요. 인터넷에 연결된 뒤 다시 시도하세요.',
    practiceOffline: '네트워크가 끊겨서 말하기 연습을 시작할 수 없어요. 연결된 뒤 "말하기"를 다시 누르세요.', progressOffline: '네트워크가 끊겼어요: 학습 위치는 아직 저장되지 않았고, 연결되면 자동으로 저장해요.',
    display: '화면', largeText: '큰 글씨', reducedMotion: '움직임 줄이기',
    cancel: '생성 취소', cancelled: '취소했어요. 아직 어떤 서비스에도 보내지 않아서 비용이 들지 않아요. 돌아가서 수정한 뒤 다시 만들 수 있어요.', cancelFailed: '취소하지 못했어요. 다시 시도해 주세요.',
    stopExplain: '서비스에 이미 보낸 단계는 되돌릴 수 없고 비용도 그대로 기록돼요. 지금 단계가 끝난 뒤 멈추고 새 단계는 보내지 않을 수 있어요.', stopConfirm: '지금 단계 후 멈추기', keepGoing: '계속 생성하기',
    stopped: '멈췄어요: 이미 보낸 단계는 되돌릴 수 없고 비용도 그대로 기록돼요. 이후 새 단계는 보내지 않아요.',
    think: '잠깐 생각할게요', thinking: '알겠어요. 이번 대화에서는 힌트를 자동으로 띄우지 않아요. 준비되면 "말하기"를 누르세요.', pause: '잠깐 멈추기', choose: '뜻 고르기', chooseLegend: '어떤 뜻으로 말하고 싶으세요?',
    chosenSay: '영어로는 이렇게 말할 수 있어요:', chosenScene: '이번 대화에서 상황 속 대답:', turnChosen: turn => `${turn}번째 대화: 뜻만 고르고 아직 말하지 않음`,
    resumeTitle: '지난번에 연습하던 대화로 돌아왔어요.', resumeListen: '상대 말 먼저 듣기', resumeContinue: '바로 계속하기',
    safety: '이것은 의사소통 연습이며, 실제 의료나 행정 절차의 결론이 아니에요.', privacy: '실제 이름, 학교, 신분증 번호는 쓰지 않아도 돼요.',
  },
  hi: {
    offline: 'इंटरनेट कनेक्शन टूट गया है। अभी कुछ भी भेजा या दोबारा कोशिश नहीं की जाएगी; जुड़ते ही अपने आप ठीक हो जाएगा।', unsavedOffline: 'सहेजा नहीं गया। इंटरनेट जुड़ने के बाद फिर कोशिश करें।',
    practiceOffline: 'कनेक्शन टूट गया है, अभी बोलकर अभ्यास शुरू नहीं हो सकता। जुड़ने के बाद "बोलना शुरू करें" दबाएँ।', progressOffline: 'कनेक्शन टूट गया है: सीखने की जगह अभी सहेजी नहीं गई, जुड़ते ही अपने आप सहेजी जाएगी।',
    display: 'दिखावट', largeText: 'बड़े अक्षर', reducedMotion: 'कम एनिमेशन',
    cancel: 'बनाना रद्द करें', cancelled: 'रद्द कर दिया। अभी किसी सेवा को नहीं भेजा गया था, कोई खर्च नहीं हुआ। वापस जाकर बदलाव करके फिर बना सकते हैं।', cancelFailed: 'रद्द नहीं हो सका। फिर कोशिश करें।',
    stopExplain: 'जो चरण सेवा को भेजा जा चुका है उसे वापस नहीं लिया जा सकता और उसका खर्च दर्ज रहेगा। यह चरण पूरा होने के बाद रोका जा सकता है, नया चरण नहीं भेजा जाएगा।', stopConfirm: 'इस चरण के बाद रोकें', keepGoing: 'बनाना जारी रखें',
    stopped: 'रोक दिया गया: भेजे जा चुके चरण वापस नहीं लिए जा सकते और उनका खर्च दर्ज रहेगा; आगे कोई नया चरण नहीं भेजा जाएगा।',
    think: 'मुझे सोचने दें', thinking: 'ठीक है, इस बारी में संकेत अपने आप नहीं आएगा। तैयार होने पर "बोलना शुरू करें" दबाएँ।', pause: 'थोड़ा रुकें', choose: 'अर्थ चुनें', chooseLegend: 'आप कौन सा अर्थ कहना चाहते हैं?',
    chosenSay: 'अंग्रेज़ी में ऐसे कह सकते हैं:', chosenScene: 'इस बारी में दृश्य का उत्तर:', turnChosen: turn => `बारी ${turn}: अर्थ चुना, अभी बोला नहीं`,
    resumeTitle: 'पिछली बार जिस बारी का अभ्यास कर रहे थे, वहीं लौट आए।', resumeListen: 'पहले सामने वाले का वाक्य सुनें', resumeContinue: 'सीधे आगे बढ़ें',
    safety: 'यह बातचीत का अभ्यास है, कोई असली चिकित्सा या सरकारी प्रक्रिया का निष्कर्ष नहीं।', privacy: 'असली नाम, स्कूल या पहचान पत्र का नंबर लिखने की ज़रूरत नहीं है।',
  },
};
