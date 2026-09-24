'use client';

import { useEffect, useRef, useState } from 'react';
import type { EntryLanguage } from './entry-copy';

type Copy = { title: string; steps: string[]; notice: string; play: string; replay: string; pause: string; back: string; listen: string; answer: string; hint: string; error: string; terms: string[]; sentences: string[] };
export const realSceneCopy: Record<EntryLanguage, Copy> = {
  'zh-Hans': { title: '酒店真实场景样片', steps: ['看场景', '词组', '句子', '提示接话'], notice: '12秒 AI 场景样片 · 非完整课程 · 非实时生成 · 辅助语言尚未经母语审查', play: '播放', replay: '从头重听', pause: '暂停', back: '返回登录选择', listen: '听原片中的这句', answer: '听回答示范', hint: '对方说完后，看着答案自己跟读。准备好再重听或继续；不会录音、识别或评分。自由对话与账户保存尚未接入。', error: '播放失败，请重试。', terms: ['办理入住', '预订了一间客房'], sentences: ['您好。办理入住吗？', '是的。我预订了一间客房。'] },
  id: { title: 'Cuplikan situasi hotel', steps: ['Tonton', 'Frasa', 'Kalimat', 'Jawab dengan petunjuk'], notice: 'Cuplikan AI 12 detik · Bukan pelajaran lengkap atau pembuatan langsung · Bahasa bantuan belum ditinjau penutur asli', play: 'Putar', replay: 'Ulangi', pause: 'Jeda', back: 'Kembali ke pilihan masuk', listen: 'Dengarkan kalimat dalam video', answer: 'Dengarkan contoh jawaban', hint: 'Setelah lawan bicara selesai, ucapkan jawaban yang terlihat. Tidak ada rekaman, pengenalan atau penilaian. Percakapan bebas dan penyimpanan akun belum tersedia.', error: 'Pemutaran gagal. Coba lagi.', terms: ['mendaftar masuk', 'memesan kamar'], sentences: ['Halo. Mau check-in?', 'Ya. Saya sudah memesan kamar.'] },
  ja: { title: 'ホテル場面のサンプル', steps: ['動画', 'フレーズ', '文', '答えを見て応答'], notice: '12秒のAIサンプル · 完全な教材やリアルタイム生成ではありません · 補助言語は母語話者による未確認です', play: '再生', replay: 'もう一度', pause: '一時停止', back: 'ログイン選択に戻る', listen: '動画の文を聞く', answer: '返答例を聞く', hint: '相手の後に答えを見て声に出してください。録音・認識・採点はありません。自由会話とアカウント保存は未対応です。', error: '再生できません。再試行してください。', terms: ['チェックインする', '部屋を予約した'], sentences: ['こんにちは。チェックインですか？', 'はい。部屋を予約しました。'] },
  ko: { title: '호텔 상황 영상 샘플', steps: ['영상', '표현', '문장', '답을 보며 응답'], notice: '12초 AI 샘플 · 완성된 수업이나 실시간 생성이 아님 · 보조 언어는 원어민 검토 전입니다', play: '재생', replay: '다시 듣기', pause: '일시 정지', back: '로그인 선택으로 돌아가기', listen: '영상 속 문장 듣기', answer: '답변 예시 듣기', hint: '상대가 말한 후 답을 보며 따라 말하세요. 녹음, 인식, 채점은 하지 않습니다. 자유 대화와 계정 저장은 아직 지원하지 않습니다.', error: '재생 실패. 다시 시도하세요.', terms: ['체크인하기', '객실을 예약했다'], sentences: ['안녕하세요. 체크인하시나요?', '네. 객실을 예약했어요.'] },
  hi: { title: 'होटल दृश्य का नमूना', steps: ['वीडियो', 'वाक्यांश', 'वाक्य', 'उत्तर देखकर बोलें'], notice: '12 सेकंड का AI नमूना · पूरा पाठ या रीयल-टाइम निर्माण नहीं · सहायक भाषा की मूल वक्ता से समीक्षा बाकी है', play: 'चलाएँ', replay: 'फिर सुनें', pause: 'रोकें', back: 'साइन इन विकल्पों पर वापस जाएँ', listen: 'वीडियो का वाक्य सुनें', answer: 'उत्तर का उदाहरण सुनें', hint: 'सामने वाले के बोलने के बाद उत्तर देखकर बोलें। रिकॉर्डिंग, पहचान या अंक नहीं दिए जाते। खुली बातचीत और खाते में सहेजना अभी उपलब्ध नहीं है।', error: 'वीडियो नहीं चला। फिर कोशिश करें।', terms: ['चेक-इन करना', 'एक कमरा बुक किया'], sentences: ['नमस्ते। चेक-इन करना है?', 'जी हाँ। मैंने एक कमरा बुक किया है।'] },
};
const lines = ['Hello. Checking in?', 'Yes. I booked a room.'];
const terms = ['Checking in', 'booked a room'];
const windows = [[1, 2.5], [6, 7.7]];

export default function RealSceneCourse({ language, onBack }: { language: EntryLanguage; onBack: () => void }) {
  const copy = realSceneCopy[language];
  const [step, setStep] = useState(1);
  const [time, setTime] = useState(0);
  const [error, setError] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const end = useRef(12.1);
  const request = useRef(0);
  const wantsPlayback = useRef(false);
  useEffect(() => {
    const media = video.current;
    return () => { wantsPlayback.current = false; request.current++; media?.pause(); };
  }, []);
  function stop() { wantsPlayback.current = false; request.current++; video.current?.pause(); }
  async function play(start: number, finish: number) {
    const media = video.current;
    if (!media) return;
    stop();
    wantsPlayback.current = true;
    const id = request.current;
    end.current = finish;
    setError(false);
    media.currentTime = start;
    setTime(start);
    try { await media.play(); if (!wantsPlayback.current) media.pause(); }
    catch { if (request.current === id) setError(true); }
  }
  function move(next: number) { stop(); setStep(next); }
  const caption = time >= 1 && time < 2.5 ? lines[0] : time >= 6 && time < 7.7 ? lines[1] : '';
  return <section data-testid="real-scene-course" className="real-scene">
    <h1>{copy.title}</h1><p className="trial-note">{copy.notice}</p>
    <nav className="scene-actions" aria-label={copy.title}>{copy.steps.map((label, i) => <button key={label} type="button" data-testid={`scene-step-${i + 1}`} aria-current={step === i + 1 ? 'step' : undefined} onClick={() => move(i + 1)}>{i + 1}. {label}</button>)}</nav>
    <video ref={video} src="/media/hotel-pov-12s.mp4" preload="auto" playsInline aria-label={copy.title} onError={() => setError(true)} onTimeUpdate={() => {
      const media = video.current;
      if (!media) return;
      if (media.currentTime >= end.current) { media.pause(); media.currentTime = end.current; }
      setTime(media.currentTime);
    }} />
    {step === 1 && <div data-testid="scene-panel-1">
      <p data-testid="scene-caption" lang="en" className="scene-caption" aria-live="off">{caption || '\u00a0'}</p>
      <div className="scene-actions"><button data-testid="scene-play" onClick={() => play(video.current?.ended ? 0 : video.current?.currentTime ?? 0, 12.1)}>{copy.play}</button><button onClick={stop}>{copy.pause}</button><button data-testid="scene-replay" onClick={() => play(0, 12.1)}>{copy.replay}</button></div>
    </div>}
    {step === 2 && <div data-testid="scene-panel-2"><h2>{copy.steps[1]}</h2>{terms.map((term, i) => <article key={term} data-testid="scene-term" className="scene-card"><strong lang="en">{term}</strong><p lang={language}>{copy.terms[i]}</p><button onClick={() => play(...windows[i] as [number, number])}>{copy.listen}</button></article>)}</div>}
    {step === 3 && <div data-testid="scene-panel-3"><h2>{copy.steps[2]}</h2>{lines.map((line, i) => <article key={line} data-testid="scene-sentence" className="scene-card"><strong lang="en">{line}</strong><p lang={language}>{copy.sentences[i]}</p><button onClick={() => play(...windows[i] as [number, number])}>{copy.listen}</button></article>)}</div>}
    {step === 4 && <div data-testid="scene-panel-4"><h2>{copy.steps[3]}</h2><article className="scene-card"><p data-testid="scene-partner" lang="en">{lines[0]}</p><button data-testid="scene-turn-play" onClick={() => play(1, 2.5)}>{copy.listen}</button></article><article className="scene-card"><p data-testid="scene-answer" lang="en">{lines[1]}</p><p>{copy.sentences[1]}</p><button data-testid="scene-answer-play" onClick={() => play(6, 7.7)}>{copy.answer}</button></article><p>{copy.hint}</p></div>}
    {error && <p role="alert">{copy.error}</p>}
    <button data-testid="scene-back" className="text-button" onClick={() => { stop(); onBack(); }}>{copy.back}</button>
  </section>;
}
