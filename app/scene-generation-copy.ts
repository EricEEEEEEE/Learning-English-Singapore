import type { EntryLanguage } from './entry-copy';
import type { SceneGenerationPhase } from '../lib/scene-generation';

type Copy = { generate: string; title: string; loading: string; retry: string; back: string; watch: string; error: string; version: string; phases: Record<SceneGenerationPhase, string> };
export const sceneGenerationCopy: Record<EntryLanguage, Copy> = {
  'zh-Hans': {
    generate: '生成场景', title: '正在准备你的场景', loading: '正在检查本次场景…', retry: '重新检查', back: '返回修改', watch: '观看场景',
    error: '暂时无法检查场景，输入仍在，请重新检查。', version: '场景版本无法确认，请返回修改或重新检查。',
    phases: {
      not_submitted: '暂未查到生成任务，可以重新检查。', awaiting_budget: '场景需求已保存，尚未开始生成。',
      submitting: '正在提交场景内容。', submission_unknown: '提交结果尚未确认，不会自动重新提交。',
      script_ready: '场景内容已准备，等待声音。', audio_ready: '声音已准备，等待组合。', audio_assembled: '声音已组合，等待画面。',
      video_pending: '正在准备场景画面。', video_assembled: '正在检查课程材料。', failed: '场景准备遇到问题，可以返回修改。',
      simulation: '这是流程演示，不是新生成的场景。', media_unavailable: '课程材料暂时无法读取，请重新检查。', ready: '场景已准备好，可以观看。',
    },
  },
  id: {
    generate: 'Buat situasi', title: 'Menyiapkan situasi Anda', loading: 'Memeriksa situasi ini…', retry: 'Periksa lagi', back: 'Kembali mengedit', watch: 'Tonton situasi',
    error: 'Situasi belum dapat diperiksa. Masukan tetap tersimpan. Periksa lagi.', version: 'Versi situasi tidak dapat dipastikan. Kembali atau periksa lagi.',
    phases: {
      not_submitted: 'Tugas belum ditemukan. Anda dapat memeriksa lagi.', awaiting_budget: 'Kebutuhan situasi tersimpan. Pembuatan belum dimulai.',
      submitting: 'Mengirim isi situasi.', submission_unknown: 'Hasil pengiriman belum pasti. Tidak akan dikirim ulang otomatis.',
      script_ready: 'Isi situasi siap, menunggu suara.', audio_ready: 'Suara siap, menunggu penggabungan.', audio_assembled: 'Suara digabungkan, menunggu gambar.',
      video_pending: 'Menyiapkan gambar situasi.', video_assembled: 'Memeriksa materi.', failed: 'Ada masalah saat menyiapkan situasi. Kembali untuk mengedit.',
      simulation: 'Ini demonstrasi alur, bukan situasi baru yang dibuat.', media_unavailable: 'Materi belum dapat dibaca. Periksa lagi.', ready: 'Situasi siap ditonton.',
    },
  },
  ja: {
    generate: '場面を生成', title: '場面を準備しています', loading: 'この場面を確認中…', retry: 'もう一度確認', back: '修正に戻る', watch: '場面を見る',
    error: '場面を確認できません。入力は残っています。もう一度確認してください。', version: '場面のバージョンを確認できません。戻るか、もう一度確認してください。',
    phases: {
      not_submitted: '生成タスクがまだ見つかりません。もう一度確認できます。', awaiting_budget: '場面の希望を保存しました。生成はまだ始まっていません。',
      submitting: '場面の内容を送信中です。', submission_unknown: '送信結果を確認できません。自動で再送信しません。',
      script_ready: '内容の準備ができました。音声を待っています。', audio_ready: '音声の準備ができました。結合を待っています。', audio_assembled: '音声を結合しました。映像を待っています。',
      video_pending: '場面の映像を準備中です。', video_assembled: '教材を確認中です。', failed: '場面の準備に問題がありました。戻って修正できます。',
      simulation: 'これは操作のデモです。新しく生成された場面ではありません。', media_unavailable: '教材を読み込めません。もう一度確認してください。', ready: '場面を見る準備ができました。',
    },
  },
  ko: {
    generate: '상황 만들기', title: '상황을 준비하고 있어요', loading: '이 상황을 확인하고 있어요…', retry: '다시 확인', back: '돌아가서 수정', watch: '상황 보기',
    error: '상황을 확인할 수 없어요. 입력은 그대로 있어요. 다시 확인해 주세요.', version: '상황 버전을 확인할 수 없어요. 돌아가거나 다시 확인해 주세요.',
    phases: {
      not_submitted: '생성 작업을 아직 찾지 못했어요. 다시 확인할 수 있어요.', awaiting_budget: '상황 요청을 저장했어요. 생성은 아직 시작하지 않았어요.',
      submitting: '상황 내용을 전송하고 있어요.', submission_unknown: '전송 결과를 확인하지 못했어요. 자동으로 다시 전송하지 않아요.',
      script_ready: '내용이 준비되었어요. 음성을 기다리고 있어요.', audio_ready: '음성이 준비되었어요. 합치기를 기다리고 있어요.', audio_assembled: '음성을 합쳤어요. 영상을 기다리고 있어요.',
      video_pending: '상황 영상을 준비하고 있어요.', video_assembled: '학습 자료를 확인하고 있어요.', failed: '상황 준비 중 문제가 생겼어요. 돌아가서 수정할 수 있어요.',
      simulation: '이것은 사용 흐름 예시이며 새로 생성된 상황이 아니에요.', media_unavailable: '자료를 읽을 수 없어요. 다시 확인해 주세요.', ready: '상황을 볼 준비가 되었어요.',
    },
  },
  hi: {
    generate: 'दृश्य बनाएँ', title: 'आपका दृश्य तैयार किया जा रहा है', loading: 'इस दृश्य की जाँच हो रही है…', retry: 'फिर जाँचें', back: 'बदलाव करने के लिए लौटें', watch: 'दृश्य देखें',
    error: 'दृश्य की जाँच नहीं हो सकी। आपका विवरण मौजूद है। फिर जाँचें।', version: 'दृश्य के संस्करण की पुष्टि नहीं हो सकी। वापस जाएँ या फिर जाँचें।',
    phases: {
      not_submitted: 'बनाने का कार्य अभी नहीं मिला। फिर जाँच सकते हैं।', awaiting_budget: 'दृश्य का विवरण सहेजा गया है। बनाना अभी शुरू नहीं हुआ है।',
      submitting: 'दृश्य की सामग्री भेजी जा रही है।', submission_unknown: 'भेजने के नतीजे की पुष्टि नहीं हुई। अपने आप दोबारा नहीं भेजा जाएगा।',
      script_ready: 'सामग्री तैयार है, आवाज़ का इंतज़ार है।', audio_ready: 'आवाज़ तैयार है, जोड़ने का इंतज़ार है।', audio_assembled: 'आवाज़ जुड़ गई है, वीडियो का इंतज़ार है।',
      video_pending: 'दृश्य का वीडियो तैयार हो रहा है।', video_assembled: 'पाठ की सामग्री जाँची जा रही है।', failed: 'दृश्य तैयार करने में समस्या हुई। वापस जाकर बदलाव कर सकते हैं।',
      simulation: 'यह प्रक्रिया का प्रदर्शन है, नया बनाया गया दृश्य नहीं।', media_unavailable: 'पाठ की सामग्री अभी नहीं खुल रही। फिर जाँचें।', ready: 'दृश्य देखने के लिए तैयार है।',
    },
  },
};
