import type { EntryLanguage } from './entry-copy';

// C14 (2026-10-18): what the generation page says about the picture check and the partner keyframe.
// It never claims a check passed when a check could not run (no face detector is approved yet).
// Help-language text other than Chinese has not been reviewed by native speakers.
type Copy = { qualityFailedDetail: string; needsReview: string; partnerLook: string; partnerLookNote: string };

export const c14Copy: Record<EntryLanguage, Copy> = {
  'zh-Hans': {
    qualityFailedDetail: '画面里有镜头乱切、黑屏或卡住，重做一次后仍没通过。可以返回修改后再生成。',
    needsReview: '画面还没经过人脸检查，需要人工看一遍。',
    partnerLook: '对方长这样', partnerLookNote: '预演用的示意图，不是真实照片。',
  },
  id: {
    qualityFailedDetail: 'Gambarnya berpindah tiba-tiba, menjadi hitam, atau macet, dan tetap gagal setelah dibuat ulang sekali. Anda bisa kembali, mengubahnya, lalu membuat lagi.',
    needsReview: 'Wajah dalam gambar belum diperiksa. Perlu dilihat dulu oleh seseorang.',
    partnerLook: 'Lawan bicara Anda', partnerLookNote: 'Gambar contoh untuk pratinjau, bukan foto sungguhan.',
  },
  ja: {
    qualityFailedDetail: '映像に急な切り替わり、黒い画面、または止まった部分があり、作り直しても通りませんでした。戻って内容を変えてから、もう一度作れます。',
    needsReview: '映像の顔はまだチェックしていません。人が一度確認する必要があります。',
    partnerLook: '相手はこんな人です', partnerLookNote: 'プレビュー用の見本で、本物の写真ではありません。',
  },
  ko: {
    qualityFailedDetail: '화면이 갑자기 바뀌거나 검게 되거나 멈춘 부분이 있어서, 한 번 다시 만들었지만 통과하지 못했어요. 돌아가서 고친 뒤 다시 만들 수 있어요.',
    needsReview: '화면 속 얼굴은 아직 검사하지 않았어요. 사람이 한 번 확인해야 해요.',
    partnerLook: '상대는 이렇게 생겼어요', partnerLookNote: '미리보기용 예시 그림이며 실제 사진이 아니에요.',
  },
  hi: {
    qualityFailedDetail: 'वीडियो में अचानक दृश्य बदलना, काला पर्दा या रुकी हुई तस्वीर थी, और एक बार फिर बनाने पर भी यह पास नहीं हुआ। आप वापस जाकर बदलाव करके फिर बना सकते हैं।',
    needsReview: 'वीडियो में चेहरों की जाँच अभी नहीं हुई है। किसी व्यक्ति को इसे एक बार देखना होगा।',
    partnerLook: 'सामने वाला व्यक्ति ऐसा दिखता है', partnerLookNote: 'यह पूर्वावलोकन का नमूना चित्र है, असली फ़ोटो नहीं।',
  },
};
