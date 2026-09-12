export const languageChoices = [
  { code: 'zh-Hans', name: '简体中文', note: '试验版 · 未审核' },
  { code: 'id', name: 'Bahasa Indonesia', note: 'Uji coba · belum ditinjau' },
  { code: 'ja', name: '日本語', note: '試験版・未審査' },
  { code: 'en', name: 'English', note: 'Experimental · not yet reviewed' },
] as const;

export type EntryLanguage = typeof languageChoices[number]['code'];
export type EntryCopy = {
  demo: string; title: [string, string]; intro: string; choose: string; chooseHint: string;
  trial: string; login: string; loginHint: string; wechat: string; unavailable: string;
  providerNotice: string; change: string; audio: string; permissions: string;
  permissionsCopy: string; storageCopy: string; settings: string; large: string;
  reduced: string; settingsHint: string; readError: string; saveError: string;
  respectTitle: string; respect: string; pace: string;
  notice: { open: string; close: string; title: string; paragraphs: [string, string] };
};

export const entryCopy: Record<EntryLanguage, EntryCopy> = {
  'zh-Hans': {
    demo: '流程演示', title: ['在新加坡，', '从听懂开始。'],
    intro: '从买一杯咖啡，到和老师聊聊孩子。让英语，一点点走进你的生活。',
    choose: '先选你熟悉的语言', chooseHint: '用于操作说明和帮助，随时可以更换。',
    trial: '语言试验版 · 文字与语音尚未经过母语审查',
    login: '选择登录方式', loginHint: '两个入口都可选。真实账号连接尚未接入。',
    wechat: '微信', unavailable: '尚未接入',
    providerNotice: '真实登录尚未接入。当前仍是流程演示，没有连接或创建账号。',
    change: '更换语言', audio: '听说明', permissions: '权限说明',
    permissionsCopy: '这里只展示流程，不申请麦克风或摄像头权限，也不会录音。未来练习可以只听；准备开口时，再由你决定是否开启麦克风。',
    storageCopy: '语言与显示设置只保存在这台设备的浏览器中，不与账号同步。清除浏览器数据后，需要重新选择。',
    settings: '显示设置', large: '大字', reduced: '减少动画',
    settingsHint: '按你舒服的方式阅读。设置只保存在本机。',
    readError: '无法读取本机设置；本次仍可选择并继续，刷新后可能需要重新选择。',
    saveError: '无法保存本机设置；本次选择仍有效，刷新后可能需要重新选择。',
    respectTitle: '尊重每一种口音',
    respect: '英语有多种口音和方言，都值得尊重。这里帮助你熟悉新加坡英语及本地表达；你可以保留自己的口音。听不懂时，可以放慢、再听一次，也可以请对方换个说法。',
    pace: '听优先，按自己的节奏。',
    notice: { open: '查看演示说明', close: '收起演示说明', title: '演示说明', paragraphs: ['这是本地流程演示。真实登录、语音和视频尚未接入，暂时不能开始正式练习。', '你可以先了解练习方式。这里不会录音，也不会连接真实账号。'] },
  },
  id: {
    demo: 'Demo alur', title: ['Di Singapura,', 'mulai dengan mendengar.'],
    intro: 'Dari memesan kopi hingga berbicara dengan guru anak Anda. Mulai gunakan bahasa Inggris dalam keseharian, sedikit demi sedikit.',
    choose: 'Pilih bahasa yang Anda pahami', chooseHint: 'Untuk petunjuk dan bantuan. Anda dapat menggantinya kapan saja.',
    trial: 'Versi uji coba · teks dan suara belum ditinjau oleh penutur asli',
    login: 'Pilih cara masuk', loginHint: 'Kedua pilihan tersedia untuk semua pengguna. Koneksi akun belum terhubung.',
    wechat: 'WeChat', unavailable: 'Belum terhubung',
    providerNotice: 'Layanan masuk belum terhubung. Ini masih demo alur; tidak ada akun yang dihubungkan atau dibuat.',
    change: 'Ganti bahasa', audio: 'Dengarkan petunjuk', permissions: 'Izin dan privasi',
    permissionsCopy: 'Demo ini tidak meminta akses mikrofon atau kamera dan tidak merekam. Dalam latihan mendatang, Anda boleh hanya mendengarkan. Anda yang memutuskan kapan ingin mengaktifkan mikrofon.',
    storageCopy: 'Bahasa dan pengaturan tampilan disimpan hanya di peramban perangkat ini, tanpa sinkronisasi akun. Setelah data peramban dihapus, pilih kembali pengaturan Anda.',
    settings: 'Pengaturan tampilan', large: 'Teks besar', reduced: 'Kurangi animasi',
    settingsHint: 'Pilih tampilan yang nyaman. Pengaturan disimpan di perangkat ini saja.',
    readError: 'Pengaturan perangkat tidak dapat dibaca. Pilihan tetap berlaku saat ini; setelah memuat ulang, Anda mungkin perlu memilih lagi.',
    saveError: 'Pengaturan perangkat tidak dapat disimpan. Pilihan tetap berlaku saat ini; setelah memuat ulang, Anda mungkin perlu memilih lagi.',
    respectTitle: 'Setiap aksen patut dihargai',
    respect: 'Bahasa Inggris memiliki beragam aksen dan dialek, dan semuanya patut dihargai. Di sini Anda dapat mengenal bahasa Inggris Singapura dan ungkapan setempat; Anda boleh mempertahankan aksen Anda sendiri. Jika belum memahami, Anda dapat memperlambat, mendengarkan lagi, atau meminta lawan bicara menjelaskan dengan cara lain.',
    pace: 'Dengarkan dahulu, sesuai ritme Anda.',
    notice: { open: 'Lihat penjelasan demo', close: 'Tutup penjelasan demo', title: 'Penjelasan demo', paragraphs: ['Ini adalah demo alur lokal. Layanan masuk, suara, dan video belum terhubung; latihan sesungguhnya belum tersedia.', 'Anda dapat mengenal alur latihan terlebih dahulu. Demo ini tidak merekam dan tidak menghubungkan akun sungguhan.'] },
  },
  ja: {
    demo: '操作デモ', title: ['シンガポールで、', '聞いてわかることから。'],
    intro: 'コーヒーを頼むときも、子どもの先生と話すときも。少しずつ、暮らしの中で英語を使ってみましょう。',
    choose: '使い慣れた言語を選ぶ', chooseHint: '操作説明やサポートに使います。いつでも変更できます。',
    trial: '言語の試験版・文章と音声は母語話者による確認前です',
    login: 'ログイン方法を選ぶ', loginHint: 'どちらの方法も選べます。実際のアカウント連携は未接続です。',
    wechat: 'WeChat', unavailable: '未接続',
    providerNotice: '実際のログイン機能は未接続です。現在は操作デモで、アカウントの連携や作成は行っていません。',
    change: '言語を変更', audio: '説明を聞く', permissions: '権限とプライバシー',
    permissionsCopy: 'このデモはマイクやカメラの権限を求めず、録音もしません。今後の練習でも、聞くだけで利用できます。話したくなったときに、自分でマイクの使用を選べます。',
    storageCopy: '言語と表示設定は、この端末のブラウザーだけに保存されます。アカウントとの同期はありません。ブラウザーのデータを消去すると、選び直す必要があります。',
    settings: '表示設定', large: '大きな文字', reduced: '動きを減らす',
    settingsHint: '読みやすい表示を選べます。設定はこの端末だけに保存されます。',
    readError: '端末の設定を読み取れません。今回の選択は使えますが、再読み込み後に選び直す必要がある場合があります。',
    saveError: '端末に設定を保存できません。今回の選択は使えますが、再読み込み後に選び直す必要がある場合があります。',
    respectTitle: 'どのアクセントも大切に',
    respect: '英語にはさまざまなアクセントや方言があり、すべて尊重されるものです。ここではシンガポール英語や地域の表現に慣れるお手伝いをします。自分のアクセントを保ったままでかまいません。聞き取れないときは、速度を落としてもう一度聞いたり、別の言い方をお願いしたりできます。',
    pace: 'まずは聞くことから。自分のペースで。',
    notice: { open: 'デモの説明を見る', close: 'デモの説明を閉じる', title: 'デモの説明', paragraphs: ['これはローカルの操作デモです。実際のログイン、音声、動画は未接続で、正式な練習はまだ利用できません。', '練習の流れを先に確認できます。録音や実際のアカウント連携は行いません。'] },
  },
  en: {
    demo: 'Flow demo', title: ['In Singapore,', 'start by listening.'],
    intro: 'From ordering a coffee to talking with your child’s teacher. Bring English into everyday life, a little at a time.',
    choose: 'Choose a familiar language', chooseHint: 'For instructions and help. You can change it at any time.',
    trial: 'Experimental language version · text and audio not yet reviewed by native speakers',
    login: 'Choose how to sign in', loginHint: 'Both options are available to everyone. Account connections are not connected yet.',
    wechat: 'WeChat', unavailable: 'Not connected yet',
    providerNotice: 'Sign-in services are not connected yet. This is still a flow demo; no account has been connected or created.',
    change: 'Change language', audio: 'Listen to instructions', permissions: 'Permissions and privacy',
    permissionsCopy: 'This demo does not request microphone or camera access and does not record you. In future practice, you can choose just to listen. You decide whether to enable the microphone when you feel ready to speak.',
    storageCopy: 'Language and display preferences stay in this device’s browser, without account sync. Clearing browser data means you will need to choose them again.',
    settings: 'Display settings', large: 'Larger text', reduced: 'Reduce motion',
    settingsHint: 'Choose what feels comfortable to read. Preferences stay on this device.',
    readError: 'Device preferences could not be read. Your choice still works for this visit; you may need to choose again after reloading.',
    saveError: 'Device preferences could not be saved. Your choice still works for this visit; you may need to choose again after reloading.',
    respectTitle: 'Every accent deserves respect',
    respect: 'English has many accents and dialects, and all deserve respect. This space helps you become familiar with Singapore English and local expressions; you can keep your own accent. If something is unclear, you can slow down, listen again, or ask the other person to say it in a different way.',
    pace: 'Listen first. Your pace.',
    notice: { open: 'View demo explanation', close: 'Close demo explanation', title: 'Demo explanation', paragraphs: ['This is a local flow demo. Real sign-in, voice, and video are not connected yet, so full practice is not available.', 'You can explore the practice flow first. This demo does not record you or connect a real account.'] },
  },
};
