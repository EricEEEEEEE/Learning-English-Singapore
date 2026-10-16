import type { EntryLanguage } from './entry-copy';

type Copy = {
  title: string; learn: string; back: string; input: string; local: string; empty: string; loading: string; error: string; retry: string;
  unavailable: (count: number) => string; neutral: string;
  progress: { loading: string; empty: string; restored: string; saving: string; saved: string; readFailed: string; saveFailed: string; conflict: string };
  read: string; save: string; reload: string;
};
export const learningLibraryCopy: Record<EntryLanguage, Copy> = {
  'zh-Hans': {
    title: '我的场景', learn: '继续学习', back: '返回我的场景', input: '返回场景输入', local: '保存在本机的场景，可重复学习。', empty: '这里还没有可学习的场景。', loading: '正在加载我的场景…', error: '暂时无法加载我的场景，请重试。', retry: '重试加载',
    unavailable: count => `有 ${count} 个场景暂时无法读取。`, neutral: '角色背景未记录，使用中性角色练习。',
    progress: { loading: '正在恢复学习位置…', empty: '还没有保存学习位置，可以从这里开始。', restored: '已恢复上次学习位置，播放保持暂停。', saving: '正在保存学习位置…', saved: '学习位置已保存在本机。', readFailed: '学习位置暂时无法读取，可继续临时学习。', saveFailed: '学习位置暂未保存，可继续临时学习。', conflict: '其他页面已更新学习位置，请重新读取。' },
    read: '重试读取', save: '重试保存', reload: '重新读取学习位置',
  },
  id: {
    title: 'Situasi saya', learn: 'Lanjut belajar', back: 'Kembali ke situasi saya', input: 'Kembali ke masukan situasi', local: 'Situasi tersimpan di perangkat ini untuk dipelajari kembali.', empty: 'Belum ada situasi yang dapat dipelajari.', loading: 'Memuat situasi saya…', error: 'Situasi saya belum dapat dimuat. Coba lagi.', retry: 'Muat ulang',
    unavailable: count => `${count} situasi belum dapat dibaca.`, neutral: 'Latar peran belum dicatat. Gunakan peran netral.',
    progress: { loading: 'Memulihkan posisi belajar…', empty: 'Belum ada posisi belajar tersimpan. Mulai dari sini.', restored: 'Posisi belajar dipulihkan. Pemutaran tetap dijeda.', saving: 'Menyimpan posisi belajar…', saved: 'Posisi belajar tersimpan di perangkat ini.', readFailed: 'Posisi belajar belum dapat dibaca. Anda masih dapat belajar sementara.', saveFailed: 'Posisi belajar belum tersimpan. Anda masih dapat belajar sementara.', conflict: 'Halaman lain memperbarui posisi belajar. Baca kembali.' },
    read: 'Coba baca lagi', save: 'Coba simpan lagi', reload: 'Baca kembali posisi belajar',
  },
  ja: {
    title: '自分の場面', learn: '学習を続ける', back: '自分の場面に戻る', input: '場面の入力に戻る', local: 'この端末に保存した場面を繰り返し学べます。', empty: '学習できる場面はまだありません。', loading: '場面を読み込み中…', error: '場面を読み込めません。もう一度お試しください。', retry: 'もう一度読み込む',
    unavailable: count => `${count}件の場面を読み込めません。`, neutral: '役の背景は未記録です。中立的な役で練習します。',
    progress: { loading: '学習位置を復元中…', empty: '保存した学習位置はまだありません。ここから始められます。', restored: '学習位置を復元しました。再生は一時停止のままです。', saving: '学習位置を保存中…', saved: '学習位置をこの端末に保存しました。', readFailed: '学習位置を読み込めません。一時的に学習を続けられます。', saveFailed: '学習位置を保存できませんでした。一時的に学習を続けられます。', conflict: '別のページで学習位置が更新されました。読み直してください。' },
    read: '再読み込み', save: 'もう一度保存', reload: '学習位置を読み直す',
  },
  ko: {
    title: '내 상황', learn: '학습 계속', back: '내 상황으로 돌아가기', input: '상황 입력으로 돌아가기', local: '이 기기에 저장된 상황을 반복해서 학습할 수 있어요.', empty: '아직 학습할 수 있는 상황이 없어요.', loading: '내 상황 불러오는 중…', error: '내 상황을 불러올 수 없어요. 다시 시도해 주세요.', retry: '다시 불러오기',
    unavailable: count => `${count}개 상황을 읽을 수 없어요.`, neutral: '역할 배경이 기록되지 않았어요. 중립적인 역할로 연습해요.',
    progress: { loading: '학습 위치 복원 중…', empty: '아직 저장된 학습 위치가 없어요. 여기서 시작하세요.', restored: '학습 위치를 복원했어요. 재생은 일시 정지 상태예요.', saving: '학습 위치 저장 중…', saved: '학습 위치를 이 기기에 저장했어요.', readFailed: '학습 위치를 불러올 수 없어요. 임시로 학습을 계속할 수 있어요.', saveFailed: '학습 위치가 저장되지 않았어요. 임시로 학습을 계속할 수 있어요.', conflict: '다른 페이지에서 학습 위치가 바뀌었어요. 다시 읽어 주세요.' },
    read: '다시 읽기', save: '다시 저장', reload: '학습 위치 다시 읽기',
  },
  hi: {
    title: 'मेरे दृश्य', learn: 'सीखना जारी रखें', back: 'मेरे दृश्यों पर लौटें', input: 'दृश्य के विवरण पर लौटें', local: 'इस डिवाइस पर सहेजे गए दृश्य से बार-बार सीखें।', empty: 'अभी सीखने के लिए कोई दृश्य नहीं है।', loading: 'मेरे दृश्य लोड हो रहे हैं…', error: 'मेरे दृश्य लोड नहीं हो सके। फिर कोशिश करें।', retry: 'फिर लोड करें',
    unavailable: count => `${count} दृश्य अभी नहीं पढ़े जा सके।`, neutral: 'भूमिका की पृष्ठभूमि दर्ज नहीं है। सामान्य भूमिका से अभ्यास करें।',
    progress: { loading: 'सीखने की स्थिति बहाल हो रही है…', empty: 'अभी सीखने की स्थिति सहेजी नहीं गई है। यहाँ से शुरू करें।', restored: 'सीखने की स्थिति बहाल हुई। वीडियो रुका रहेगा।', saving: 'सीखने की स्थिति सहेजी जा रही है…', saved: 'सीखने की स्थिति इस डिवाइस पर सहेजी गई।', readFailed: 'सीखने की स्थिति नहीं पढ़ी जा सकी। आप अभी अस्थायी रूप से सीख सकते हैं।', saveFailed: 'सीखने की स्थिति अभी सहेजी नहीं गई। अस्थायी रूप से सीखते रहें।', conflict: 'दूसरे पृष्ठ पर सीखने की स्थिति बदली है। फिर पढ़ें।' },
    read: 'फिर पढ़ें', save: 'फिर सहेजें', reload: 'सीखने की स्थिति फिर पढ़ें',
  },
};
