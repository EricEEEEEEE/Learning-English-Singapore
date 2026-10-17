import type { EntryLanguage } from './entry-copy';
import type { GenerationRecordStatus } from '../lib/my-data';

// C5 copy: deleting my data, signing out, sentence reports and generation records.
// Help-language text other than Chinese has not been reviewed by native speakers yet.
type Copy = {
  signOut: string; signingOut: string; signOutFailed: string;
  deleteScene: (description: string) => string; deleteShort: string; sceneConfirm: string; confirmDelete: string; cancel: string; deleting: string;
  sceneDeleted: string; sceneDeleteFailed: string;
  deleteAll: string; allConfirm: string; confirmAll: string; allDeleted: string; allDeleteFailed: string;
  storedTitle: string; stored: string[]; notStored: string; account: string;
  records: string; recordsNote: string; recordsEmpty: string; recordsError: string; recordsRetry: string; recordsLoading: string; recordsBack: string;
  status: Record<GenerationRecordStatus, string>; deletedScene: string; reserved: (usd: string) => string; deletedOn: (date: string) => string;
  deletion: { scene: string; all: string };
  report: { open: (sentence: string) => string; short: string; reasons: string; unclear: string; not_local: string; wrong_meaning: string; note: string; submit: string; cancel: string; received: string; failed: string; unchanged: string };
};

export const dataTrustCopy: Record<EntryLanguage, Copy> = {
  'zh-Hans': {
    signOut: '退出登录', signingOut: '正在退出…', signOutFailed: '退出没有完成，请重试。',
    deleteScene: description => `删除这个场景：${description}`, deleteShort: '删除', sceneConfirm: '删除后，这个场景的课程、视频、学习位置和句子反馈都会从本机删除，不能恢复。', confirmDelete: '确认删除', cancel: '取消', deleting: '正在删除…',
    sceneDeleted: '已删除这个场景。', sceneDeleteFailed: '删除没有完成，场景还在。请重试。',
    deleteAll: '删除我的全部学习数据', allConfirm: '会删除你在本机保存的全部场景、课程、视频、学习位置和句子反馈，不能恢复。你的 Google 账号不会被删除。', confirmAll: '确认全部删除', allDeleted: '你的学习数据已删除。Google 账号本身没有删除。', allDeleteFailed: '删除没有完成，数据还在。请重试。',
    storedTitle: '我们保存了什么',
    stored: ['你描述的场景和六项背景', '为你生成的课程、视频和声音，只有你登录后能看', '你的学习位置和句子反馈', '生成和对练的费用记录：只有金额、时间和状态，用来守住费用上限；删除后仍保留，但不含场景内容'],
    notStored: '练习时的录音不保存：录音只发给转写服务变成文字，本产品不留存。转写和生成服务按它们自己的规定保留日志，这里的删除管不到。',
    account: '删除只删除本产品保存的数据，不会删除你的 Google 账号。',
    records: '生成记录', recordsNote: '预留费用是本产品为这次生成预先留出的上限，不是供应商的实际账单。', recordsEmpty: '还没有生成记录。', recordsError: '暂时无法读取生成记录，请重试。', recordsRetry: '重试读取记录', recordsLoading: '正在读取生成记录…', recordsBack: '返回我的场景',
    status: { ready: '已完成', failed: '失败', unknown: '结果未知，没有自动重发', in_progress: '进行中', simulation: '预演（没有真实生成）', deleted: '已删除' },
    deletedScene: '（已删除的场景）', reserved: usd => `预留费用上限 US$${usd}`, deletedOn: date => `删除于 ${date}`,
    deletion: { scene: '删除了一个场景', all: '删除了全部学习数据' },
    report: { open: sentence => `报告这句：${sentence}`, short: '这句有问题', reasons: '问题类型', unclear: '听不懂', not_local: '不像本地说法', wrong_meaning: '意思不对', note: '补充说明（可不填）', submit: '提交', cancel: '取消', received: '已收到，等待处理', failed: '没有提交成功，请重试。', unchanged: '提交后课程不会改变。' },
  },
  id: {
    signOut: 'Keluar', signingOut: 'Sedang keluar…', signOutFailed: 'Belum berhasil keluar. Coba lagi.',
    deleteScene: description => `Hapus situasi ini: ${description}`, deleteShort: 'Hapus', sceneConfirm: 'Pelajaran, video, posisi belajar, dan laporan kalimat situasi ini akan dihapus dari perangkat ini dan tidak dapat dipulihkan.', confirmDelete: 'Ya, hapus', cancel: 'Batal', deleting: 'Menghapus…',
    sceneDeleted: 'Situasi ini sudah dihapus.', sceneDeleteFailed: 'Penghapusan belum selesai; situasi masih ada. Coba lagi.',
    deleteAll: 'Hapus semua data belajar saya', allConfirm: 'Semua situasi, pelajaran, video, posisi belajar, dan laporan kalimat di perangkat ini akan dihapus dan tidak dapat dipulihkan. Akun Google Anda tidak dihapus.', confirmAll: 'Ya, hapus semua', allDeleted: 'Data belajar Anda sudah dihapus. Akun Google tidak dihapus.', allDeleteFailed: 'Penghapusan belum selesai; data masih ada. Coba lagi.',
    storedTitle: 'Data apa yang kami simpan',
    stored: ['Situasi yang Anda tulis dan enam keterangannya', 'Pelajaran, video, dan suara yang dibuat untuk Anda; hanya terlihat setelah Anda masuk', 'Posisi belajar dan laporan kalimat Anda', 'Catatan biaya pembuatan dan latihan: hanya jumlah, waktu, dan status untuk menjaga batas biaya; tetap disimpan setelah dihapus, tanpa isi situasi'],
    notStored: 'Rekaman latihan tidak disimpan: rekaman hanya dikirim ke layanan transkripsi untuk diubah menjadi teks. Layanan transkripsi dan pembuatan menyimpan log menurut aturan mereka sendiri; penghapusan di sini tidak menjangkaunya.',
    account: 'Penghapusan hanya menghapus data yang disimpan produk ini, bukan akun Google Anda.',
    records: 'Riwayat pembuatan', recordsNote: 'Biaya cadangan adalah batas atas yang disisihkan produk ini, bukan tagihan nyata penyedia.', recordsEmpty: 'Belum ada riwayat pembuatan.', recordsError: 'Riwayat pembuatan belum dapat dibaca. Coba lagi.', recordsRetry: 'Baca ulang riwayat', recordsLoading: 'Membaca riwayat pembuatan…', recordsBack: 'Kembali ke situasi saya',
    status: { ready: 'Selesai', failed: 'Gagal', unknown: 'Hasil tidak diketahui; tidak dikirim ulang otomatis', in_progress: 'Sedang berjalan', simulation: 'Pratinjau (tanpa pembuatan nyata)', deleted: 'Dihapus' },
    deletedScene: '(Situasi yang dihapus)', reserved: usd => `Batas biaya cadangan US$${usd}`, deletedOn: date => `Dihapus pada ${date}`,
    deletion: { scene: 'Menghapus satu situasi', all: 'Menghapus semua data belajar' },
    report: { open: sentence => `Laporkan kalimat ini: ${sentence}`, short: 'Kalimat ini bermasalah', reasons: 'Jenis masalah', unclear: 'Tidak paham', not_local: 'Tidak seperti ucapan lokal', wrong_meaning: 'Artinya salah', note: 'Catatan tambahan (boleh kosong)', submit: 'Kirim', cancel: 'Batal', received: 'Sudah diterima, menunggu ditangani', failed: 'Belum terkirim. Coba lagi.', unchanged: 'Pelajaran tidak berubah setelah dikirim.' },
  },
  ja: {
    signOut: 'ログアウト', signingOut: 'ログアウト中…', signOutFailed: 'ログアウトできませんでした。もう一度お試しください。',
    deleteScene: description => `この場面を削除：${description}`, deleteShort: '削除', sceneConfirm: 'この場面の教材・動画・学習位置・文の報告がこの端末から削除され、元に戻せません。', confirmDelete: '削除する', cancel: 'キャンセル', deleting: '削除中…',
    sceneDeleted: 'この場面を削除しました。', sceneDeleteFailed: '削除が完了していません。場面は残っています。もう一度お試しください。',
    deleteAll: '自分の学習データをすべて削除', allConfirm: 'この端末に保存した場面・教材・動画・学習位置・文の報告をすべて削除し、元に戻せません。Google アカウントは削除されません。', confirmAll: 'すべて削除する', allDeleted: '学習データを削除しました。Google アカウント自体は削除していません。', allDeleteFailed: '削除が完了していません。データは残っています。もう一度お試しください。',
    storedTitle: '保存しているデータ',
    stored: ['入力した場面と6つの背景', 'あなた用に作った教材・動画・音声（ログインした本人だけが見られます）', '学習位置と文の報告', '生成と会話練習の費用記録：金額・時刻・状態のみで費用上限を守るために使います。削除後も残りますが、場面の内容は含みません'],
    notStored: '練習の録音は保存しません。録音は文字起こしサービスに送って文字にするだけで、本製品には残りません。文字起こし・生成サービスは各社の規定でログを保持し、ここでの削除は及びません。',
    account: '削除するのは本製品が保存したデータだけで、Google アカウントは削除しません。',
    records: '生成記録', recordsNote: '予約費用は本製品がこの生成のために確保した上限で、提供元の実際の請求額ではありません。', recordsEmpty: '生成記録はまだありません。', recordsError: '生成記録を読み込めません。もう一度お試しください。', recordsRetry: '記録を再読み込み', recordsLoading: '生成記録を読み込み中…', recordsBack: '自分の場面に戻る',
    status: { ready: '完了', failed: '失敗', unknown: '結果不明・自動再送なし', in_progress: '進行中', simulation: '予行（実際の生成なし）', deleted: '削除済み' },
    deletedScene: '（削除した場面）', reserved: usd => `予約費用の上限 US$${usd}`, deletedOn: date => `${date} に削除`,
    deletion: { scene: '場面を1つ削除', all: '学習データをすべて削除' },
    report: { open: sentence => `この文を報告：${sentence}`, short: 'この文に問題がある', reasons: '問題の種類', unclear: '聞き取れない', not_local: '現地の言い方らしくない', wrong_meaning: '意味が違う', note: '補足（任意）', submit: '送信', cancel: 'キャンセル', received: '受け付けました。対応待ちです', failed: '送信できませんでした。もう一度お試しください。', unchanged: '送信しても教材は変わりません。' },
  },
  ko: {
    signOut: '로그아웃', signingOut: '로그아웃 중…', signOutFailed: '로그아웃되지 않았어요. 다시 시도해 주세요.',
    deleteScene: description => `이 상황 삭제: ${description}`, deleteShort: '삭제', sceneConfirm: '이 상황의 수업, 영상, 학습 위치, 문장 신고가 이 기기에서 삭제되며 되돌릴 수 없어요.', confirmDelete: '삭제하기', cancel: '취소', deleting: '삭제 중…',
    sceneDeleted: '이 상황을 삭제했어요.', sceneDeleteFailed: '삭제가 끝나지 않았어요. 상황은 그대로 있어요. 다시 시도해 주세요.',
    deleteAll: '내 학습 데이터 모두 삭제', allConfirm: '이 기기에 저장된 모든 상황, 수업, 영상, 학습 위치, 문장 신고를 삭제하며 되돌릴 수 없어요. Google 계정은 삭제되지 않아요.', confirmAll: '모두 삭제하기', allDeleted: '학습 데이터를 삭제했어요. Google 계정 자체는 삭제하지 않았어요.', allDeleteFailed: '삭제가 끝나지 않았어요. 데이터는 그대로 있어요. 다시 시도해 주세요.',
    storedTitle: '저장하는 데이터',
    stored: ['입력한 상황과 여섯 가지 배경', '나를 위해 만든 수업, 영상, 음성(로그인한 본인만 볼 수 있어요)', '학습 위치와 문장 신고', '생성과 대화 연습 비용 기록: 금액, 시간, 상태만 남겨 비용 상한을 지켜요. 삭제 후에도 남지만 상황 내용은 없어요'],
    notStored: '연습 녹음은 저장하지 않아요. 녹음은 글자로 바꾸기 위해 받아쓰기 서비스로만 보내고 이 제품에는 남지 않아요. 받아쓰기·생성 서비스는 각자의 규정에 따라 로그를 보관하며 여기서의 삭제는 미치지 않아요.',
    account: '삭제는 이 제품이 저장한 데이터만 지우며 Google 계정은 삭제하지 않아요.',
    records: '생성 기록', recordsNote: '예약 비용은 이 제품이 이번 생성을 위해 미리 잡아 둔 상한이며 제공업체의 실제 청구액이 아니에요.', recordsEmpty: '아직 생성 기록이 없어요.', recordsError: '생성 기록을 불러올 수 없어요. 다시 시도해 주세요.', recordsRetry: '기록 다시 불러오기', recordsLoading: '생성 기록 불러오는 중…', recordsBack: '내 상황으로 돌아가기',
    status: { ready: '완료', failed: '실패', unknown: '결과 알 수 없음, 자동으로 다시 보내지 않음', in_progress: '진행 중', simulation: '미리 보기(실제 생성 없음)', deleted: '삭제됨' },
    deletedScene: '(삭제된 상황)', reserved: usd => `예약 비용 상한 US$${usd}`, deletedOn: date => `${date} 삭제`,
    deletion: { scene: '상황 하나 삭제', all: '학습 데이터 모두 삭제' },
    report: { open: sentence => `이 문장 신고: ${sentence}`, short: '이 문장에 문제가 있어요', reasons: '문제 유형', unclear: '못 알아듣겠어요', not_local: '현지 표현 같지 않아요', wrong_meaning: '뜻이 틀려요', note: '추가 설명(선택)', submit: '보내기', cancel: '취소', received: '접수됨, 처리 대기 중', failed: '보내지 못했어요. 다시 시도해 주세요.', unchanged: '보내도 수업은 바뀌지 않아요.' },
  },
  hi: {
    signOut: 'साइन आउट करें', signingOut: 'साइन आउट हो रहा है…', signOutFailed: 'साइन आउट पूरा नहीं हुआ। फिर कोशिश करें।',
    deleteScene: description => `यह दृश्य हटाएँ: ${description}`, deleteShort: 'हटाएँ', sceneConfirm: 'इस दृश्य का पाठ, वीडियो, सीखने की स्थिति और वाक्य रिपोर्ट इस डिवाइस से हटा दी जाएँगी और वापस नहीं आएँगी।', confirmDelete: 'हाँ, हटाएँ', cancel: 'रद्द करें', deleting: 'हटाया जा रहा है…',
    sceneDeleted: 'यह दृश्य हटा दिया गया।', sceneDeleteFailed: 'हटाना पूरा नहीं हुआ; दृश्य अभी भी है। फिर कोशिश करें।',
    deleteAll: 'मेरा सारा सीखने का डेटा हटाएँ', allConfirm: 'इस डिवाइस पर सहेजे गए सभी दृश्य, पाठ, वीडियो, सीखने की स्थिति और वाक्य रिपोर्ट हटा दी जाएँगी और वापस नहीं आएँगी। आपका Google खाता नहीं हटेगा।', confirmAll: 'हाँ, सब हटाएँ', allDeleted: 'आपका सीखने का डेटा हटा दिया गया। Google खाता नहीं हटाया गया।', allDeleteFailed: 'हटाना पूरा नहीं हुआ; डेटा अभी भी है। फिर कोशिश करें।',
    storedTitle: 'हम क्या सहेजते हैं',
    stored: ['आपका लिखा दृश्य और उसकी छह जानकारियाँ', 'आपके लिए बने पाठ, वीडियो और आवाज़; केवल आपके साइन इन करने पर दिखते हैं', 'आपकी सीखने की स्थिति और वाक्य रिपोर्ट', 'निर्माण और अभ्यास के खर्च का रिकॉर्ड: केवल राशि, समय और स्थिति, ताकि खर्च की सीमा बनी रहे; हटाने के बाद भी रहता है, पर दृश्य की सामग्री के बिना'],
    notStored: 'अभ्यास की रिकॉर्डिंग सहेजी नहीं जाती: रिकॉर्डिंग केवल लिखित रूप में बदलने के लिए ट्रांसक्रिप्शन सेवा को भेजी जाती है। ट्रांसक्रिप्शन और निर्माण सेवाएँ अपने नियमों से लॉग रखती हैं; यहाँ हटाने से वे नहीं हटते।',
    account: 'हटाने से केवल इस उत्पाद में सहेजा गया डेटा हटता है, आपका Google खाता नहीं।',
    records: 'निर्माण रिकॉर्ड', recordsNote: 'आरक्षित खर्च इस निर्माण के लिए उत्पाद द्वारा रखी गई ऊपरी सीमा है, सेवा प्रदाता का वास्तविक बिल नहीं।', recordsEmpty: 'अभी कोई निर्माण रिकॉर्ड नहीं है।', recordsError: 'निर्माण रिकॉर्ड अभी नहीं पढ़े जा सके। फिर कोशिश करें।', recordsRetry: 'रिकॉर्ड फिर पढ़ें', recordsLoading: 'निर्माण रिकॉर्ड पढ़े जा रहे हैं…', recordsBack: 'मेरे दृश्यों पर लौटें',
    status: { ready: 'पूरा हुआ', failed: 'विफल', unknown: 'परिणाम अज्ञात; अपने-आप दोबारा नहीं भेजा गया', in_progress: 'चल रहा है', simulation: 'पूर्वाभ्यास (वास्तविक निर्माण नहीं)', deleted: 'हटाया गया' },
    deletedScene: '(हटाया गया दृश्य)', reserved: usd => `आरक्षित खर्च की सीमा US$${usd}`, deletedOn: date => `${date} को हटाया गया`,
    deletion: { scene: 'एक दृश्य हटाया', all: 'सारा सीखने का डेटा हटाया' },
    report: { open: sentence => `यह वाक्य रिपोर्ट करें: ${sentence}`, short: 'इस वाक्य में समस्या है', reasons: 'समस्या का प्रकार', unclear: 'समझ नहीं आया', not_local: 'स्थानीय बोलचाल जैसा नहीं', wrong_meaning: 'अर्थ गलत है', note: 'अतिरिक्त टिप्पणी (वैकल्पिक)', submit: 'भेजें', cancel: 'रद्द करें', received: 'मिल गया, कार्रवाई की प्रतीक्षा', failed: 'भेजा नहीं जा सका। फिर कोशिश करें।', unchanged: 'भेजने से पाठ नहीं बदलता।' },
  },
};

// Show the stored micro-dollar reservation exactly: cents when exact, otherwise up to six decimals.
export function usd(micros: number) {
  return micros % 10_000 === 0 ? (micros / 1_000_000).toFixed(2) : (micros / 1_000_000).toFixed(6).replace(/0+$/, '');
}
export const day = (at: number) => new Date(at).toISOString().slice(0, 10);
