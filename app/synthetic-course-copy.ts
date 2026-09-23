import type { CourseLanguage } from '../lib/synthetic-courses';

type Copy = { entry: string; back: string; choose: string; purpose: string; roles: string; lines: string; notices: string[] };
export const syntheticCourseCopy: Record<CourseLanguage, Copy> = {
  'zh-Hans': { entry: '合成课程演示', back: '返回登录选择', choose: '选择固定样本', purpose: '交流目的', roles: '对话角色', lines: '逐句示范',
    notices: ['固定合成样本', '不是 AI 实时生成', '无真实声音和视频', '不用于能力评估', '辅助语言尚未经母语审查'] },
  id: { entry: 'Demo pelajaran sintetis', back: 'Kembali ke pilihan masuk', choose: 'Pilih sampel tetap', purpose: 'Tujuan percakapan', roles: 'Peran percakapan', lines: 'Contoh per kalimat',
    notices: ['Sampel sintetis tetap', 'Bukan hasil AI waktu nyata', 'Tanpa audio atau video nyata', 'Bukan untuk penilaian kemampuan', 'Bahasa bantuan belum ditinjau penutur asli'] },
  ja: { entry: '合成レッスンのデモ', back: 'ログイン選択に戻る', choose: '固定サンプルを選ぶ', purpose: '会話の目的', roles: '会話の役割', lines: '一文ずつの例',
    notices: ['固定の合成サンプル', 'AIによるリアルタイム生成ではありません', '実際の音声や動画はありません', '能力評価には使用しません', '補助言語は母語話者による未確認です'] },
  ko: { entry: '합성 수업 데모', back: '로그인 선택으로 돌아가기', choose: '고정 샘플 선택', purpose: '대화 목적', roles: '대화 역할', lines: '문장별 예시',
    notices: ['고정 합성 샘플', '실시간 AI 생성이 아닙니다', '실제 음성과 영상이 없습니다', '능력 평가에 사용하지 않습니다', '보조 언어는 원어민 검토 전입니다'] },
  hi: { entry: 'सिंथेटिक पाठ का डेमो', back: 'साइन इन विकल्पों पर वापस जाएँ', choose: 'तय नमूना चुनें', purpose: 'बातचीत का उद्देश्य', roles: 'बातचीत की भूमिकाएँ', lines: 'वाक्य-दर-वाक्य उदाहरण',
    notices: ['तय सिंथेटिक नमूने', 'यह रीयल-टाइम AI निर्माण नहीं है', 'असली आवाज़ या वीडियो नहीं है', 'क्षमता आकलन के लिए नहीं', 'सहायक भाषा की मूल वक्ता से समीक्षा बाकी है'] },
};
