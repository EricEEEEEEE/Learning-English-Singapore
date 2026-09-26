'use client';

import { useEffect, useRef, useState } from 'react';
import { validateSceneCourse, type SceneCourse, type SceneLine } from '../lib/scene-course';
import type { EntryLanguage } from './entry-copy';

type Copy = { title: string; steps: string[]; notice: string; play: string; replay: string; pause: string; back: string; listen: string; answer: string; hint: string; error: string };
export const realSceneCopy: Record<EntryLanguage, Copy> = {
  'zh-Hans': { title: '酒店真实场景样片', steps: ['看场景', '词组', '句子', '提示接话'], notice: '12秒 AI 场景样片 · 非完整课程 · 非实时生成 · 辅助语言尚未经母语审查', play: '播放', replay: '从头重听', pause: '暂停', back: '返回登录选择', listen: '听原片中的这句', answer: '听回答示范', hint: '对方说完后，看着答案自己跟读。准备好再重听或继续；不会录音、识别或评分。自由对话与账户保存尚未接入。', error: '播放失败，请重试。' },
  id: { title: 'Cuplikan situasi hotel', steps: ['Tonton', 'Frasa', 'Kalimat', 'Jawab dengan petunjuk'], notice: 'Cuplikan AI 12 detik · Bukan pelajaran lengkap atau pembuatan langsung · Bahasa bantuan belum ditinjau penutur asli', play: 'Putar', replay: 'Ulangi', pause: 'Jeda', back: 'Kembali ke pilihan masuk', listen: 'Dengarkan kalimat dalam video', answer: 'Dengarkan contoh jawaban', hint: 'Setelah lawan bicara selesai, ucapkan jawaban yang terlihat. Tidak ada rekaman, pengenalan atau penilaian. Percakapan bebas dan penyimpanan akun belum tersedia.', error: 'Pemutaran gagal. Coba lagi.' },
  ja: { title: 'ホテル場面のサンプル', steps: ['動画', 'フレーズ', '文', '答えを見て応答'], notice: '12秒のAIサンプル · 完全な教材やリアルタイム生成ではありません · 補助言語は母語話者による未確認です', play: '再生', replay: 'もう一度', pause: '一時停止', back: 'ログイン選択に戻る', listen: '動画の文を聞く', answer: '返答例を聞く', hint: '相手の後に答えを見て声に出してください。録音・認識・採点はありません。自由会話とアカウント保存は未対応です。', error: '再生できません。再試行してください。' },
  ko: { title: '호텔 상황 영상 샘플', steps: ['영상', '표현', '문장', '답을 보며 응답'], notice: '12초 AI 샘플 · 완성된 수업이나 실시간 생성이 아님 · 보조 언어는 원어민 검토 전입니다', play: '재생', replay: '다시 듣기', pause: '일시 정지', back: '로그인 선택으로 돌아가기', listen: '영상 속 문장 듣기', answer: '답변 예시 듣기', hint: '상대가 말한 후 답을 보며 따라 말하세요. 녹음, 인식, 채점은 하지 않습니다. 자유 대화와 계정 저장은 아직 지원하지 않습니다.', error: '재생 실패. 다시 시도하세요.' },
  hi: { title: 'होटल दृश्य का नमूना', steps: ['वीडियो', 'वाक्यांश', 'वाक्य', 'उत्तर देखकर बोलें'], notice: '12 सेकंड का AI नमूना · पूरा पाठ या रीयल-टाइम निर्माण नहीं · सहायक भाषा की मूल वक्ता से समीक्षा बाकी है', play: 'चलाएँ', replay: 'फिर सुनें', pause: 'रोकें', back: 'साइन इन विकल्पों पर वापस जाएँ', listen: 'वीडियो का वाक्य सुनें', answer: 'उत्तर का उदाहरण सुनें', hint: 'सामने वाले के बोलने के बाद उत्तर देखकर बोलें। रिकॉर्डिंग, पहचान या अंक नहीं दिए जाते। खुली बातचीत और खाते में सहेजना अभी उपलब्ध नहीं है।', error: 'वीडियो नहीं चला। फिर कोशिश करें।' },
};
export default function RealSceneCourse({ language, onBack, saved }: { language: EntryLanguage; onBack: () => void; saved?: { id: string; revision: number } }) {
  const savedCopy = {
    'zh-Hans': ['已保存场景课程', '本地课程 · 辅助语言尚未经母语审查', '返回生成任务', '听对方说话，再看答案跟读；尚无录音、识别、评分或自由对话。'],
    id: ['Pelajaran tersimpan', 'Pelajaran lokal · Terjemahan belum ditinjau', 'Kembali ke tugas', 'Dengarkan lalu ikuti jawaban. Belum ada rekaman, penilaian atau percakapan bebas.'],
    ja: ['保存済みの教材', 'ローカル教材・翻訳は未確認', 'タスクに戻る', '相手を聞いて答えを読み上げます。録音・採点・自由会話は未対応です。'],
    ko: ['저장된 수업', '로컬 수업 · 번역 검토 전', '작업으로 돌아가기', '상대 말을 듣고 답을 따라 말하세요. 녹음, 평가, 자유 대화는 아직 없습니다.'],
    hi: ['सहेजा गया पाठ', 'स्थानीय पाठ · अनुवाद की समीक्षा बाकी', 'कार्य पर वापस जाएँ', 'पहले सुनें, फिर उत्तर देखकर बोलें। रिकॉर्डिंग, अंक और खुली बातचीत अभी उपलब्ध नहीं हैं।'],
  }[language];
  const copy = saved ? { ...realSceneCopy[language], title: savedCopy[0], notice: savedCopy[1], back: savedCopy[2], hint: savedCopy[3] } : realSceneCopy[language];
  const [course, setCourse] = useState<SceneCourse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [turnIndex, setTurnIndex] = useState(0);
  const [step, setStep] = useState(1);
  const [time, setTime] = useState(0);
  const [error, setError] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const end = useRef(12.1);
  const request = useRef(0);
  const wantsPlayback = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(saved ? `/api/generated-courses?${new URLSearchParams({ id: saved.id, revision: String(saved.revision) })}` : '/media/hotel-course.json', { signal: controller.signal, cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error('course'); return response.json(); })
      .then(data => {
        let source = data;
        let privateUrl: string | undefined;
        if (saved) {
          if (data?.id !== saved.id || data?.revision !== saved.revision || data?.media?.courseId !== saved.id || data?.media?.revision !== saved.revision || !['test-fixture', 'ai-generated'].includes(data?.source) || !Array.isArray(data?.lines) || data.lines.some((line: { revision?: number }) => line.revision !== saved.revision)) throw new Error('course');
          const version = String(saved.revision);
          // Validate learning materials through the existing contract; the media URL is constructed locally.
          source = { ...data, version, source: data.source === 'test-fixture' ? 'test-fixture' : 'ai-sample', media: { src: '/media/private-validation.mp4', duration: data.media.duration, version }, lines: data.lines.map((line: object) => ({ ...line, version })) };
          privateUrl = `/api/generated-course-media?${new URLSearchParams({ id: saved.id, revision: version })}`;
        }
        const result = validateSceneCourse(source);
        if (result.ok && privateUrl) result.value.media.src = privateUrl; if (!result.ok) throw new Error('course'); if (!controller.signal.aborted) setCourse(result.value); })
      .catch(() => { if (!controller.signal.aborted) setLoadFailed(true); });
    return () => controller.abort();
  }, [saved?.id, saved?.revision]);
  useEffect(() => {
    const media = video.current;
    return () => { wantsPlayback.current = false; request.current++; media?.pause(); };
  }, [course]);
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
  const lineById = (id: string) => course!.lines.find(line => line.id === id)!;
  const playLine = (line: SceneLine) => play(line.start, line.end);
  const notices = {
    'zh-Hans': { loading: '正在加载课程', invalid: '课程材料不完整或版本不一致，请返回重试。', test: '测试材料：文字与画面仅用于程序验证，不是新场景课程。', next: '下一回合', previous: '上一回合' },
    id: { loading: 'Memuat pelajaran', invalid: 'Materi tidak lengkap atau versinya berbeda. Silakan kembali.', test: 'Materi uji, bukan pelajaran situasi baru.', next: 'Giliran berikutnya', previous: 'Giliran sebelumnya' },
    ja: { loading: '教材を読み込み中', invalid: '教材が不完全か、版が一致しません。戻ってください。', test: '動作確認用のテスト教材です。新しい場面の教材ではありません。', next: '次のやり取り', previous: '前のやり取り' },
    ko: { loading: '수업 불러오는 중', invalid: '자료가 불완전하거나 버전이 다릅니다. 돌아가세요.', test: '동작 확인용 테스트 자료이며 새 상황 수업이 아닙니다.', next: '다음 대화', previous: '이전 대화' },
    hi: { loading: 'पाठ लोड हो रहा है', invalid: 'सामग्री अधूरी है या संस्करण अलग हैं। वापस जाएँ।', test: 'यह परीक्षण सामग्री है, नया दृश्य पाठ नहीं।', next: 'अगली बारी', previous: 'पिछली बारी' },
  }[language];
  const back = <button data-testid="scene-back" className="text-button" onClick={() => { stop(); onBack(); }}>{copy.back}</button>;
  if (!course) return <section data-testid="real-scene-course" className="real-scene"><h1>{copy.title}</h1><p role={loadFailed ? 'alert' : 'status'}>{loadFailed ? notices.invalid : notices.loading}</p>{back}</section>;
  const caption = course.lines.find(line => time >= line.start && time < line.end)?.text ?? '';
  const turn = course.turns[turnIndex];
  const partner = lineById(turn.partnerLineId);
  const learner = lineById(turn.learnerLineId);
  return <section data-testid="real-scene-course" className="real-scene">
    <h1>{copy.title}</h1><p className="trial-note">{copy.notice}</p>
    {course.source === 'test-fixture' && <p role="note">{notices.test}</p>}
    <nav className="scene-actions" aria-label={copy.title}>{copy.steps.map((label, i) => <button key={label} type="button" data-testid={`scene-step-${i + 1}`} aria-current={step === i + 1 ? 'step' : undefined} onClick={() => move(i + 1)}>{i + 1}. {label}</button>)}</nav>
    <video ref={video} src={course.media.src} preload="auto" playsInline aria-label={copy.title} onError={() => setError(true)} onLoadedMetadata={() => {
      const duration = video.current?.duration;
      if (duration === undefined || !Number.isFinite(duration) || Math.abs(duration - course.media.duration) > 0.25 || course.lines.some(line => line.end > duration)) {
        stop(); setLoadFailed(true); setCourse(null);
      }
    }} onTimeUpdate={() => {
      const media = video.current;
      if (!media) return;
      if (media.currentTime >= end.current) { media.pause(); if (media.currentTime > end.current) media.currentTime = end.current; }
      setTime(media.currentTime);
    }} />
    {step === 1 && <div data-testid="scene-panel-1">
      <p data-testid="scene-caption" lang="en" className="scene-caption" aria-live="off">{caption || '\u00a0'}</p>
      <div className="scene-actions"><button data-testid="scene-play" onClick={() => play(video.current?.ended ? 0 : video.current?.currentTime ?? 0, course.media.duration)}>{copy.play}</button><button onClick={stop}>{copy.pause}</button><button data-testid="scene-replay" onClick={() => play(0, course.media.duration)}>{copy.replay}</button></div>
    </div>}
    {step === 2 && <div data-testid="scene-panel-2"><h2>{copy.steps[1]}</h2>{course.phrases.map(phrase => <article key={phrase.id} data-testid="scene-term" className="scene-card"><strong lang="en">{phrase.text}</strong><p lang={language}>{phrase.translations[language]}</p><button onClick={() => playLine(lineById(phrase.lineId))}>{copy.listen}</button></article>)}</div>}
    {step === 3 && <div data-testid="scene-panel-3"><h2>{copy.steps[2]}</h2>{course.lines.map(line => <article key={line.id} data-testid="scene-sentence" className="scene-card"><strong lang="en">{line.text}</strong><p lang={language}>{line.translations[language]}</p><button onClick={() => playLine(line)}>{copy.listen}</button></article>)}</div>}
    {step === 4 && <div data-testid="scene-panel-4"><h2>{copy.steps[3]}</h2><article className="scene-card"><p data-testid="scene-partner" lang="en">{partner.text}</p><button data-testid="scene-turn-play" onClick={() => playLine(partner)}>{copy.listen}</button></article><article className="scene-card"><p data-testid="scene-answer" lang="en">{learner.text}</p><p>{learner.translations[language]}</p><button data-testid="scene-answer-play" onClick={() => playLine(learner)}>{copy.answer}</button></article><p>{copy.hint}</p>
      {course.turns.length > 1 && <div className="scene-actions"><button disabled={turnIndex === 0} onClick={() => { stop(); setTurnIndex(turnIndex - 1); }}>{notices.previous}</button><button data-testid="scene-next-turn" disabled={turnIndex === course.turns.length - 1} onClick={() => { stop(); setTurnIndex(turnIndex + 1); }}>{notices.next}</button></div>}
    </div>}
    {error && <p role="alert">{copy.error}</p>}
    {back}
  </section>;
}
