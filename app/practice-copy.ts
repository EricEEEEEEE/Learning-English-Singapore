import type { EntryLanguage } from './entry-copy';
const zh = {
  entry: '预览听与练', title: '先听懂，再试着说', roles: '两位演示角色', partner: '对方 · 演示角色 A', visitor: '来访者 · 演示角色 B', yours: '你的位置',
  demo: '没有真实声音或视频', review: '尚未经本地与教学审查', generic: '以下是固定通用示例；你的目的保留原文，尚未翻译成英语课程。文字可作辅助，不需要朗读或作答。',
  version: '版本', goal: '这次想办的事', unknown: '口语尚未观察', current: '当前一句', practice: '我来练', start: '开始听（演示）',
  status: '练习状态', settings: '播放设置', gesture: '点一下，让对方先开始', listening: '先听示范就好', opening: '对方先开场', awaiting: '轮到你，按自己的节奏',
  hint1: '先听一个提示', hint2: '可以选择你的意思', thinking: '慢慢想，不会催你', speaking: '正在说话（模拟）', replying: '对方准备回应（模拟）', resuming: '对方带你接着练',
  paused: '已暂停', disconnected: '连接已暂停（模拟）', denied: '麦克风不可用', inaudible: '声音已暂停（模拟）', background: '已暂停，回来后可以继续', ended: '本次预览已结束',
  previous: '前一句', sentence: '单句循环', chapter: '章节循环', all: '整段循环', ab: 'A-B 片段循环', from: '片段起点', to: '片段终点',
  slow: '慢一点', natural: '自然速度', speedHint: '这里只保存速度选择，尚未真正变速。', pause: '停一下', think: '我想一想', resume: '继续', manual: '手动说话（尚未接入）',
  finished: '我说完了', listen: '只听示范', help: '给个提示', other: '需要其他帮助', choices: '意思选择', ask: '我想问一件事', again: '我想再听一遍',
  patience: '多等一会', six: '默认等待', ten: '多等一会', fifteen: '再多等一会', proactive: '主动提示', retry: '重试连接（演示）', exit: '结束本次预览',
  controls: '演示轮次控制', controlHint: '这些按钮只推进演示事件，不播放或录制声音，也不测量真实等待。', endPlayback: '模拟本句播放结束', wait: '模拟经过 6 秒',
  speech: '模拟开始说话', deny: '模拟麦克风不可用', disconnect: '模拟断开连接', saveError: '练习预览暂时无法保存，本次仍可继续', readError: '旧练习记录保持不变，本次仅临时预览。', active: '正在示范（模拟）', resting: '在听',
};
type Copy = { [K in keyof typeof zh]: string };
const en: Copy = {
  entry:'Preview listening and practice', title:'Listen first, then try speaking', roles:'Two demonstration characters', partner:'Partner · demo character A', visitor:'Visitor · demo character B', yours:'Your place',
  demo:'No real audio or video', review:'Not yet reviewed locally or by a teacher', generic:'These are fixed, general examples. Your original goal is kept as entered; it has not been translated into an English lesson. Text is optional support. No reading aloud or answer is required.',
  version:'Version', goal:'What you want to accomplish', unknown:'Speaking has not been observed', current:'Current line', practice:'Let me practise', start:'Start listening (demo)',
  status:'Practice status', settings:'Playback settings', gesture:'Tap to let your partner begin', listening:'You can just listen', opening:'Your partner starts', awaiting:'Your turn, at your own pace',
  hint1:'Listen to one hint', hint2:'Choose what you mean', thinking:'Take your time; no hurry', speaking:'Speaking (simulated)', replying:'Your partner is preparing a reply (simulated)', resuming:'Your partner guides you back in',
  paused:'Paused', disconnected:'Connection paused (simulated)', denied:'Microphone unavailable', inaudible:'Sound paused (simulated)', background:'Paused; continue when you return', ended:'Preview ended',
  previous:'Previous line', sentence:'Repeat this line', chapter:'Repeat chapter', all:'Repeat all', ab:'Repeat A-B section', from:'Section start', to:'Section end',
  slow:'Slower', natural:'Natural speed', speedHint:'This saves a speed preference; playback speed is not changed yet.', pause:'Pause for a moment', think:'Let me think', resume:'Continue', manual:'Speak manually (not connected)',
  finished:'I have finished', listen:'Just listen', help:'Give me a hint', other:'I need other help', choices:'Meaning choices', ask:'I want to ask something', again:'I want to hear it again',
  patience:'Wait a little longer', six:'Default wait', ten:'A little longer', fifteen:'Even longer', proactive:'Proactive hints', retry:'Retry connection (demo)', exit:'End this preview',
  controls:'Demo turn controls', controlHint:'These buttons advance simulated events only. They do not play or record audio, or measure real waiting times.', endPlayback:'Simulate this line ending', wait:'Simulate 6 seconds passing',
  speech:'Simulate starting to speak', deny:'Simulate unavailable microphone', disconnect:'Simulate disconnection', saveError:'This preview cannot be saved right now; you can continue this time', readError:'Your old practice record is unchanged. This preview is temporary.', active:'Demonstrating (simulated)', resting:'Listening',
};
const id: Copy = {
  entry:'Pratinjau mendengar dan berlatih', title:'Pahami dahulu, lalu coba berbicara', roles:'Dua tokoh demonstrasi', partner:'Lawan bicara · tokoh demo A', visitor:'Pengunjung · tokoh demo B', yours:'Posisi Anda',
  demo:'Tidak ada suara atau video nyata', review:'Belum ditinjau oleh penutur lokal dan pengajar', generic:'Ini contoh umum yang tetap. Tujuan Anda disimpan dalam bahasa aslinya, belum diterjemahkan menjadi pelajaran Inggris. Teks hanya bantuan pilihan; tidak perlu membaca keras atau menjawab.',
  version:'Versi', goal:'Hal yang ingin Anda lakukan', unknown:'Kemampuan berbicara belum diamati', current:'Kalimat saat ini', practice:'Saya mau berlatih', start:'Mulai mendengar (demo)',
  status:'Status latihan', settings:'Pengaturan pemutaran', gesture:'Ketuk agar lawan bicara memulai', listening:'Boleh mendengarkan saja', opening:'Lawan bicara memulai', awaiting:'Giliran Anda, santai saja',
  hint1:'Dengarkan satu petunjuk', hint2:'Pilih maksud Anda', thinking:'Pikirkan pelan-pelan, tidak terburu-buru', speaking:'Sedang berbicara (simulasi)', replying:'Lawan bicara menyiapkan jawaban (simulasi)', resuming:'Lawan bicara membantu Anda melanjutkan',
  paused:'Dijeda', disconnected:'Koneksi dijeda (simulasi)', denied:'Mikrofon tidak tersedia', inaudible:'Suara dijeda (simulasi)', background:'Dijeda; lanjutkan saat kembali', ended:'Pratinjau berakhir',
  previous:'Kalimat sebelumnya', sentence:'Ulangi kalimat ini', chapter:'Ulangi bagian', all:'Ulangi semuanya', ab:'Ulangi potongan A-B', from:'Awal potongan', to:'Akhir potongan',
  slow:'Lebih pelan', natural:'Kecepatan alami', speedHint:'Ini hanya menyimpan pilihan kecepatan, belum mengubah suara.', pause:'Berhenti sebentar', think:'Saya mau berpikir', resume:'Lanjutkan', manual:'Bicara manual (belum terhubung)',
  finished:'Saya sudah selesai', listen:'Dengarkan saja', help:'Beri petunjuk', other:'Saya butuh bantuan lain', choices:'Pilihan maksud', ask:'Saya ingin bertanya', again:'Saya ingin mendengar lagi',
  patience:'Tunggu lebih lama', six:'Waktu tunggu biasa', ten:'Sedikit lebih lama', fifteen:'Lebih lama lagi', proactive:'Petunjuk otomatis', retry:'Coba koneksi lagi (demo)', exit:'Akhiri pratinjau ini',
  controls:'Kontrol giliran demo', controlHint:'Tombol ini hanya menggerakkan simulasi, tanpa memutar atau merekam suara dan tanpa mengukur waktu nyata.', endPlayback:'Simulasikan akhir kalimat', wait:'Simulasikan berlalu 6 detik',
  speech:'Simulasikan mulai berbicara', deny:'Simulasikan mikrofon tidak tersedia', disconnect:'Simulasikan koneksi terputus', saveError:'Pratinjau belum bisa disimpan; Anda masih bisa melanjutkan', readError:'Catatan latihan lama tetap utuh. Pratinjau ini sementara.', active:'Memberi contoh (simulasi)', resting:'Mendengarkan',
};
const ja: Copy = {
  entry:'聞く・話す流れをプレビュー', title:'まず聞いてから、話してみる', roles:'2人のデモキャラクター', partner:'相手役 · デモ A', visitor:'訪問者役 · デモ B', yours:'あなたの位置',
  demo:'実際の音声や動画はありません', review:'現地の話者・指導者による確認はまだです', generic:'固定の一般的な例です。目的は入力した言語のまま保存し、英語教材への翻訳はまだ行っていません。文字は任意の補助です。音読や回答は不要です。',
  version:'バージョン', goal:'今回したいこと', unknown:'話す力はまだ観察していません', current:'今の一文', practice:'自分で練習する', start:'聞き始める（デモ）',
  status:'練習の状態', settings:'再生設定', gesture:'タップすると相手から始めます', listening:'聞くだけでも大丈夫です', opening:'相手から話し始めます', awaiting:'あなたのペースでどうぞ',
  hint1:'ヒントを一つ聞きましょう', hint2:'伝えたい意味を選べます', thinking:'ゆっくり考えて大丈夫です', speaking:'話している状態（シミュレーション）', replying:'相手が返事を準備中（シミュレーション）', resuming:'相手が続きへ案内します',
  paused:'一時停止中', disconnected:'接続を一時停止（シミュレーション）', denied:'マイクを利用できません', inaudible:'音声を一時停止（シミュレーション）', background:'一時停止中。戻ったら続けられます', ended:'プレビューを終了しました',
  previous:'前の一文', sentence:'一文を繰り返す', chapter:'章を繰り返す', all:'全体を繰り返す', ab:'A-B 区間を繰り返す', from:'区間の始点', to:'区間の終点',
  slow:'もっとゆっくり', natural:'自然な速さ', speedHint:'速さの設定だけを保存します。実際の音声速度はまだ変わりません。', pause:'いったん止める', think:'少し考えたい', resume:'続ける', manual:'手動で話す（未接続）',
  finished:'話し終わりました', listen:'お手本を聞くだけ', help:'ヒントをください', other:'別の助けが必要です', choices:'意味の選択肢', ask:'質問したいです', again:'もう一度聞きたいです',
  patience:'もう少し待つ', six:'通常の待ち時間', ten:'少し長めに待つ', fifteen:'さらに長めに待つ', proactive:'自動ヒント', retry:'接続を再試行（デモ）', exit:'今回のプレビューを終了',
  controls:'デモのターン操作', controlHint:'このボタンは模擬イベントだけを進めます。音声の再生・録音や実際の待ち時間の測定はしません。', endPlayback:'一文の再生終了を模擬', wait:'6秒の経過を模擬',
  speech:'発話開始を模擬', deny:'マイクが使えない状態を模擬', disconnect:'切断を模擬', saveError:'今は練習を保存できませんが、このまま続けられます', readError:'以前の練習記録はそのままです。今回は一時的なプレビューです。', active:'お手本の動作（シミュレーション）', resting:'聞いています',
};
export function practiceCopy(language: EntryLanguage): Copy { return language === 'zh-Hans' ? zh : language === 'id' ? id : language === 'ja' ? ja : en; }
