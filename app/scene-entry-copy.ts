import type { EntryLanguage } from './entry-copy';

type SceneEntryCopy = {
  examplesLabel: string; next: string; back: string; background: string; empty: string;
  examples: { label: string; text: string }[];
};

export const sceneEntryCopy: Record<EntryLanguage, SceneEntryCopy> = {
  'zh-Hans': {
    examplesLabel: '场景示例', next: '下一步', back: '返回',
    background: '再给几个关键词，让场景更贴近你', empty: '先简单说说你想准备的场景。',
    examples: [
      { label: '家长会', text: '我想和老师聊聊孩子最近在学校的情况。' },
      { label: 'Party', text: '我要参加孩子同学的生日聚会，想和其他家长聊天。' },
      { label: '其他场景', text: '我想在酒店办理入住，或者和同事确认工作安排。' },
    ],
  },
  id: {
    examplesLabel: 'Contoh situasi', next: 'Lanjut', back: 'Kembali',
    background: 'Beri beberapa kata kunci agar situasinya lebih sesuai dengan Anda', empty: 'Jelaskan singkat situasi yang ingin Anda siapkan.',
    examples: [
      { label: 'Pertemuan orang tua dan guru', text: 'Saya ingin berbicara dengan guru tentang kegiatan anak saya di sekolah akhir-akhir ini.' },
      { label: 'Pesta', text: 'Saya akan menghadiri pesta ulang tahun teman sekelas anak saya dan ingin mengobrol dengan orang tua lainnya.' },
      { label: 'Situasi lain', text: 'Saya ingin melakukan check-in di hotel atau memastikan pengaturan kerja dengan rekan kerja.' },
    ],
  },
  ja: {
    examplesLabel: '場面の例', next: '次へ', back: '戻る',
    background: 'キーワードで、もっと自分に合った場面に', empty: '準備したい場面を少し教えてください。',
    examples: [
      { label: '保護者面談', text: '子どもの最近の学校での様子について、先生と話したいです。' },
      { label: 'パーティー', text: '子どもの同級生の誕生日会で、ほかの保護者と話したいです。' },
      { label: 'その他の場面', text: 'ホテルでチェックインしたり、同僚と仕事の予定を確認したりしたいです。' },
    ],
  },
  ko: {
    examplesLabel: '상황 예시', next: '다음', back: '뒤로',
    background: '키워드로 상황을 더 구체적으로 알려 주세요', empty: '준비하고 싶은 상황을 간단히 알려 주세요.',
    examples: [
      { label: '학부모 면담', text: '아이의 최근 학교생활에 대해 선생님과 이야기하고 싶어요.' },
      { label: '파티', text: '아이의 반 친구 생일 파티에서 다른 학부모들과 이야기하고 싶어요.' },
      { label: '다른 상황', text: '호텔에서 체크인하거나 동료와 업무 일정을 확인하고 싶어요.' },
    ],
  },
  hi: {
    examplesLabel: 'परिस्थिति के उदाहरण', next: 'आगे', back: 'वापस',
    background: 'कुछ शब्दों से परिस्थिति को अपने अनुसार बनाएँ', empty: 'जिस परिस्थिति की तैयारी करनी है, उसे थोड़ा बताएँ।',
    examples: [
      { label: 'अभिभावक-शिक्षक बैठक', text: 'मैं शिक्षक से अपने बच्चे के हाल के स्कूल के अनुभव के बारे में बात करना चाहता हूँ।' },
      { label: 'पार्टी', text: 'मैं अपने बच्चे के सहपाठी की जन्मदिन पार्टी में दूसरे अभिभावकों से बात करना चाहता हूँ।' },
      { label: 'अन्य परिस्थिति', text: 'मैं होटल में चेक-इन करना या सहकर्मी से काम की योजना की पुष्टि करना चाहता हूँ।' },
    ],
  },
};
