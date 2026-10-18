'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { validateSceneCourse, type SceneCourse, type SceneLine } from '../lib/scene-course';
import { parseSceneRequirement, type SceneRequirement } from '../lib/scene-requirement-content';
import type { EntryLanguage } from './entry-copy';
import { guidedSceneCopy } from './guided-scene-copy';
import ScenePractice, { scenePracticeCopy, type PracticeMemory } from './scene-practice';
import { listenToolsCopy } from './listen-tools-copy';
import { useSceneProgress, type ProgressContext } from './use-scene-progress';
import type { SceneProgressPosition } from '../lib/scene-progress';
import { requestLearningJson } from './learning-request';
import { learningLibraryCopy } from './learning-library-copy';
import { SentenceReport, useSentenceReports } from './data-trust';
import { resumeSafetyCopy } from './resume-safety-copy';
import { auditGapsCopy } from './audit-gaps-copy';
import { sceneSafetyKind } from '../lib/scene-safety';
import { ActionBar, AppBar, Icon, Sheet, useShell } from './shell';
import { shellCopy } from './shell-copy';
import { c11Copy } from './c11-copy';

type Copy = { title: string; steps: string[]; notice: string; play: string; replay: string; pause: string; back: string; listen: string; answer: string; hint: string; error: string };
export const realSceneCopy: Record<EntryLanguage, Copy> = {
  'zh-Hans': { title: '酒店真实场景样片', steps: ['看场景', '词组', '句子', '提示接话'], notice: '12秒 AI 场景样片 · 非完整课程 · 非实时生成 · 辅助语言尚未经母语审查', play: '播放', replay: '从头重听', pause: '暂停', back: '返回登录选择', listen: '听原片中的这句', answer: '听回答示范', hint: '对方说完后，看着答案自己跟读。准备好再重听或继续；不会录音、识别或评分。自由对话与账户保存尚未接入。', error: '播放失败，请重试。' },
  id: { title: 'Cuplikan situasi hotel', steps: ['Tonton', 'Frasa', 'Kalimat', 'Jawab dengan petunjuk'], notice: 'Cuplikan AI 12 detik · Bukan pelajaran lengkap atau pembuatan langsung · Bahasa bantuan belum ditinjau penutur asli', play: 'Putar', replay: 'Ulangi', pause: 'Jeda', back: 'Kembali ke pilihan masuk', listen: 'Dengarkan kalimat dalam video', answer: 'Dengarkan contoh jawaban', hint: 'Setelah lawan bicara selesai, ucapkan jawaban yang terlihat. Tidak ada rekaman, pengenalan atau penilaian. Percakapan bebas dan penyimpanan akun belum tersedia.', error: 'Pemutaran gagal. Coba lagi.' },
  ja: { title: 'ホテル場面のサンプル', steps: ['動画', 'フレーズ', '文', '答えを見て応答'], notice: '12秒のAIサンプル · 完全な教材やリアルタイム生成ではありません · 補助言語は母語話者による未確認です', play: '再生', replay: 'もう一度', pause: '一時停止', back: 'ログイン選択に戻る', listen: '動画の文を聞く', answer: '返答例を聞く', hint: '相手の後に答えを見て声に出してください。録音・認識・採点はありません。自由会話とアカウント保存は未対応です。', error: '再生できません。再試行してください。' },
  ko: { title: '호텔 상황 영상 샘플', steps: ['영상', '표현', '문장', '답을 보며 응답'], notice: '12초 AI 샘플 · 완성된 수업이나 실시간 생성이 아님 · 보조 언어는 원어민 검토 전입니다', play: '재생', replay: '다시 듣기', pause: '일시 정지', back: '로그인 선택으로 돌아가기', listen: '영상 속 문장 듣기', answer: '답변 예시 듣기', hint: '상대가 말한 후 답을 보며 따라 말하세요. 녹음, 인식, 채점은 하지 않습니다. 자유 대화와 계정 저장은 아직 지원하지 않습니다.', error: '재생 실패. 다시 시도하세요.' },
  hi: { title: 'होटल दृश्य का नमूना', steps: ['वीडियो', 'वाक्यांश', 'वाक्य', 'उत्तर देखकर बोलें'], notice: '12 सेकंड का AI नमूना · पूरा पाठ या रीयल-टाइम निर्माण नहीं · सहायक भाषा की मूल वक्ता से समीक्षा बाकी है', play: 'चलाएँ', replay: 'फिर सुनें', pause: 'रोकें', back: 'साइन इन विकल्पों पर वापस जाएँ', listen: 'वीडियो का वाक्य सुनें', answer: 'उत्तर का उदाहरण सुनें', hint: 'सामने वाले के बोलने के बाद उत्तर देखकर बोलें। रिकॉर्डिंग, पहचान या अंक नहीं दिए जाते। खुली बातचीत और खाते में सहेजना अभी उपलब्ध नहीं है।', error: 'वीडियो नहीं चला। फिर कोशिश करें।' },
};
export default function RealSceneCourse({ language, onBack, saved, guided = false, requirement, rememberProgress = false, active = true, contextSource = 'requirement', backLabel }: { language: EntryLanguage; onBack: () => void; saved?: { id: string; revision: number; materialsRevision?: number }; guided?: boolean; requirement?: SceneRequirement | null; rememberProgress?: boolean; active?: boolean; contextSource?: 'requirement' | 'legacy-neutral'; backLabel?: string }) {
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
  const [page, setPage] = useState<'watch' | 'role' | 'learn'>('watch');
  const [roles, setRoles] = useState<{ learner: string; partner: string } | null>(null);
  const [watchComplete, setWatchComplete] = useState(false);
  // C11-1: once the scene has been watched to the end in this visit, "enter the role" becomes the primary action.
  const [watchedOnce, setWatchedOnce] = useState(false);
  // C11-2: "you could say" on the prompt page stays folded until tapped (or until a hint asked for it).
  const [answerShown, setAnswerShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [slow, setSlow] = useState(false);
  const [captionsHidden, setCaptionsHidden] = useState(false);
  const [loopKey, setLoopKey] = useState<string | null>(null);
  const [ab, setAb] = useState<{ a: string; b: string } | null>(null);
  const [partnerHelp, setPartnerHelp] = useState(false);
  const [segmentPlaying, setSegmentPlaying] = useState(false);
  // C8-3: true when the saved position reopened the practice page; it offers "listen first" or "continue" once.
  const [resumedPractice, setResumedPractice] = useState(false);
  const slowRef = useRef(false);
  const loopRange = useRef<{ start: number; end: number } | null>(null);
  const loopFrame = useRef(0);
  const abId = useId();
  const practiceMemory = useRef<PracticeMemory>({ turnIndex: 0, history: [], reply: null });
  const mounted = useRef(true);
  const [progressContext, setProgressContext] = useState<ProgressContext | null>(null);
  const progress = useSceneProgress(rememberProgress ? progressContext : null, active);
  const position = useRef<SceneProgressPosition>({ page: 'watch', time: 0, turnIndex: 0 });
  const restoreTime = useRef<number | null>(null);
  const mediaReady = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const end = useRef(Number.POSITIVE_INFINITY);
  const request = useRef(0);
  const wantsPlayback = useRef(false);
  const fullPlayback = useRef(false);
  const guide = guidedSceneCopy[language];
  const libraryCopy = learningLibraryCopy[language];
  const practiceCopy = scenePracticeCopy[language];
  const tools = listenToolsCopy[language];
  const extra = resumeSafetyCopy[language];
  // C8-6: a simple, visible rule (lib/scene-safety.ts) on the learner's own description and keywords.
  const safety = guided && requirement ? (() => { try { return sceneSafetyKind(requirement.content); } catch { return null; } })() : null;
  // C9-5: report statuses are read on the sentences page and the prompt page (a disabled line is not shown as the model answer).
  const reports = useSentenceReports(saved && course && (!guided || page === 'learn') && (step === 3 || step === 4) ? saved : null);
  const gaps = auditGapsCopy[language];
  const listSeparator = language === 'zh-Hans' || language === 'ja' ? '、' : ', ';
  // C10: the guided pages share the thin top bar and a "more" sheet; practice puts its own items into that sheet.
  const shellContext = useShell();
  const shell = shellCopy[language];
  const c11 = c11Copy[language];
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const title = guided ? page === 'watch' ? guide.watch : page === 'role' ? guide.role : step === 5 ? practiceCopy.title : copy.steps[step - 1] : copy.title;
  useLayoutEffect(() => {
    if (guided && focusNext.current) { heading.current?.focus(); focusNext.current = false; }
  }, [guided, page, step]);
  useEffect(() => {
    const controller = new AbortController(); let loading = true;
    stop(); setCourse(null); setProgressContext(null); setLoadFailed(false); setRoles(null); setPage('watch'); setStep(1); setTurnIndex(0); setWatchComplete(false); setWatchedOnce(false); setAnswerShown(false); setTime(0); setError(false);
    position.current = { page: 'watch', time: 0, turnIndex: 0 }; restoreTime.current = null; mediaReady.current = false;
    practiceMemory.current = { turnIndex: 0, history: [], reply: null }; setAb(null); setPartnerHelp(false);
    if (guided) {
      try {
        const snapshot = parseSceneRequirement(requirement);
        if (!saved || snapshot.revision !== saved.revision) throw new Error('Requirement version');
        setRoles({ learner: snapshot.content.keywords.learnerRole.trim(), partner: snapshot.content.keywords.partnerRole.trim() });
      } catch { setLoadFailed(true); return () => { loading = false; controller.abort(); }; }
    }
    if (saved?.materialsRevision !== undefined && (!Number.isSafeInteger(saved.materialsRevision) || saved.materialsRevision < 1)) { setLoadFailed(true); return () => { loading = false; controller.abort(); }; }
    const url = saved ? `/api/generated-courses?${new URLSearchParams({ id: saved.id, revision: String(saved.revision), ...(saved.materialsRevision !== undefined ? { materialsRevision: String(saved.materialsRevision) } : {}) })}` : '/media/hotel-course.json';
    const loaded = rememberProgress && saved ? requestLearningJson(url, controller) : fetch(url, { signal: controller.signal, cache: 'no-store' }).then(response => { if (!response.ok) throw new Error('course'); return response.json(); });
    loaded
      .then(data => {
        let source = data;
        let privateUrl: string | undefined;
        if (saved) {
          if (guided && data?.source !== 'ai-generated') throw new Error('Generated source required');
          if (data?.materialsRevision !== saved.materialsRevision) throw new Error('materials version');
          if (data?.id !== saved.id || data?.revision !== saved.revision || data?.media?.courseId !== saved.id || data?.media?.revision !== saved.revision || !['test-fixture', 'ai-generated'].includes(data?.source) || !Array.isArray(data?.lines) || data.lines.some((line: { revision?: number }) => line.revision !== saved.revision)) throw new Error('course');
          const version = String(saved.revision);
          // Validate learning materials through the existing contract; the media URL is constructed locally.
          source = { ...data, version, source: data.source === 'test-fixture' ? 'test-fixture' : 'ai-sample', media: { src: '/media/private-validation.mp4', duration: data.media.duration, version }, lines: data.lines.map((line: object) => ({ ...line, version })) };
          privateUrl = `/api/generated-course-media?${new URLSearchParams({ id: saved.id, revision: version })}`;
        }
        const result = validateSceneCourse(source);
        if (result.ok && privateUrl) result.value.media.src = privateUrl; if (!result.ok) throw new Error('course');
        if (rememberProgress && saved && (typeof data.media.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.media.sha256))) throw new Error('media identity');
        if (!controller.signal.aborted) {
          setCourse(result.value);
          if (rememberProgress && saved) setProgressContext({ ...saved, mediaSha256: data.media.sha256, duration: data.media.duration, turns: data.turns.length });
        } })
      .catch(() => { if (loading) setLoadFailed(true); });
    return () => { loading = false; controller.abort(); };
  }, [saved?.id, saved?.revision, saved?.materialsRevision, guided, requirement, rememberProgress]);
  useLayoutEffect(() => { if (!active) stop(); }, [active]);
  useEffect(() => {
    if (!progress.restore) return;
    const restored = progress.restore.position;
    stop(); position.current = { ...restored }; restoreTime.current = restored.time;
    setPage(restored.page === 'watch' || restored.page === 'role' ? restored.page : 'learn');
    setStep(restored.page === 'terms' ? 2 : restored.page === 'sentences' ? 3 : restored.page === 'prompt' ? 4 : restored.page === 'practice' ? 5 : 1);
    setResumedPractice(restored.page === 'practice'); setWatchedOnce(restored.page !== 'watch'); setAnswerShown(false);
    setTurnIndex(restored.turnIndex); setTime(restored.time); setWatchComplete(false);
    if (video.current && video.current.readyState >= 1) { video.current.currentTime = restored.time; restoreTime.current = null; }
  }, [progress.restore]);
  useEffect(() => {
    const media = video.current;
    return () => { wantsPlayback.current = false; fullPlayback.current = false; request.current++; media?.pause(); };
  }, [course]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function stop() {
    wantsPlayback.current = false; fullPlayback.current = false; end.current = Number.POSITIVE_INFINITY; request.current++; video.current?.pause();
    loopRange.current = null; cancelAnimationFrame(loopFrame.current); setLoopKey(null); setSegmentPlaying(false);
  }
  // Loops are checked every frame so the jump back happens at the boundary rather than up to a timeupdate late.
  function watchLoop() {
    const media = video.current, range = loopRange.current;
    if (!media || !range || !wantsPlayback.current) return;
    if (media.currentTime >= range.end || media.currentTime < range.start - 0.05) media.currentTime = range.start;
    loopFrame.current = requestAnimationFrame(watchLoop);
  }
  function savePosition(flush = false) {
    if (!mediaReady.current || video.current?.error || restoreTime.current !== null) return;
    const currentTime = video.current?.currentTime ?? position.current.time;
    if (!Number.isFinite(currentTime)) return;
    position.current = { ...position.current, time: Math.min(course?.media.duration ?? currentTime, Math.max(0, currentTime)) };
    progress.change(position.current, flush);
  }
  async function play(start: number, finish: number, full = false, options: { rate?: number; loop?: string } = {}) {
    const media = video.current;
    if (!media) return;
    stop();
    media.playbackRate = options.rate ?? (slowRef.current ? 0.75 : 1); media.preservesPitch = true;
    wantsPlayback.current = true; setSegmentPlaying(true);
    fullPlayback.current = full;
    setWatchComplete(false);
    const id = request.current;
    end.current = finish;
    setError(false);
    media.currentTime = start;
    setTime(start);
    restoreTime.current = null; position.current = { ...position.current, time: start }; savePosition(true);
    if (options.loop) { loopRange.current = { start, end: finish }; setLoopKey(options.loop); }
    try { await media.play(); if (!wantsPlayback.current) media.pause(); else if (loopRange.current) loopFrame.current = requestAnimationFrame(watchLoop); }
    catch { if (request.current === id) { setError(true); setSegmentPlaying(false); } }
  }
  function toggleSlow() {
    const next = !slowRef.current; slowRef.current = next; setSlow(next);
    if (video.current) { video.current.playbackRate = next ? 0.75 : 1; video.current.preservesPitch = true; }
  }
  // C11-1: the line that starts after the current time (or the first one).
  function nextLine() {
    const t = video.current?.currentTime ?? time, lines = course!.lines;
    const next = lines.find(line => line.start > t + 0.05) ?? lines[lines.length - 1];
    void playLine(next);
  }
  function previousLine() {
    const t = video.current?.currentTime ?? time, lines = course!.lines;
    const current = lines.findIndex(line => t >= line.start && t < line.end);
    const finished = lines.reduce((found, line, i) => line.end <= t ? i : found, 0);
    void playLine(lines[current >= 0 ? Math.max(0, current - 1) : finished]);
  }
  function toggleLoop(key: string, start: number, finish: number) {
    if (loopKey === key) stop(); else void play(start, finish, false, { loop: key });
  }
  function move(next: number) { stop(); setStep(next); }
  const lineById = (id: string) => course!.lines.find(line => line.id === id)!;
  const playLine = (line: SceneLine, rate?: number) => play(line.start, line.end, false, { rate });
  function changePage(next: 'watch' | 'role' | 'learn', nextStep = 1, turn = turnIndex, reveal = false) {
    position.current = { ...position.current, page: next === 'learn' ? nextStep === 2 ? 'terms' : nextStep === 3 ? 'sentences' : nextStep === 5 ? 'practice' : 'prompt' : next };
    stop(); focusNext.current = true; setPage(next); setStep(nextStep); setResumedPractice(false); setAnswerShown(reveal); setMoreOpen(false);
    savePosition(true);
    if (next === 'learn' && (nextStep === 4 || (nextStep === 5 && practiceMemory.current.setupAsked))) void playLine(lineById(course!.turns[turn].partnerLineId));
  }
  function changeTurn(next: number) {
    position.current = { ...position.current, turnIndex: next };
    stop(); setTurnIndex(next); setPartnerHelp(false); setAnswerShown(false);
    savePosition(true);
    if (guided) void playLine(lineById(course!.turns[next].partnerLineId));
  }
  const notices = {
    'zh-Hans': { loading: '正在加载课程', invalid: '课程材料不完整或版本不一致，请返回重试。', test: '测试材料：文字与画面仅用于程序验证，不是新场景课程。', next: '下一回合', previous: '上一回合' },
    id: { loading: 'Memuat pelajaran', invalid: 'Materi tidak lengkap atau versinya berbeda. Silakan kembali.', test: 'Materi uji, bukan pelajaran situasi baru.', next: 'Giliran berikutnya', previous: 'Giliran sebelumnya' },
    ja: { loading: '教材を読み込み中', invalid: '教材が不完全か、版が一致しません。戻ってください。', test: '動作確認用のテスト教材です。新しい場面の教材ではありません。', next: '次のやり取り', previous: '前のやり取り' },
    ko: { loading: '수업 불러오는 중', invalid: '자료가 불완전하거나 버전이 다릅니다. 돌아가세요.', test: '동작 확인용 테스트 자료이며 새 상황 수업이 아닙니다.', next: '다음 대화', previous: '이전 대화' },
    hi: { loading: 'पाठ लोड हो रहा है', invalid: 'सामग्री अधूरी है या संस्करण अलग हैं। वापस जाएँ।', test: 'यह परीक्षण सामग्री है, नया दृश्य पाठ नहीं।', next: 'अगली बारी', previous: 'पिछली बारी' },
  }[language];
  const leave = async () => {
    if (leaving) return;
    stop(); savePosition(true); setLeaving(true);
    const saved = await progress.finish();
    if (!mounted.current) return;
    setLeaving(false);
    // A newly failed final save remains visible. Previously disclosed temporary
    // learning can be left deliberately without claiming it was saved.
    if (saved || !rememberProgress || ['loading', 'readFailed', 'saveFailed', 'conflict', 'offline'].includes(progress.stage)) onBack();
  };
  const backText = backLabel ?? copy.back;
  const back = <button data-testid="scene-back" className="text-button" disabled={leaving} onClick={leave}>{backText}</button>;
  const practising = guided && page === 'learn' && step === 5;
  const stepIndex = guided && page === 'learn' ? step : 1;
  const failedStage = ['readFailed', 'saveFailed', 'conflict', 'offline'].includes(progress.stage);
  // Saving is a thin line under the bar; only a failure becomes a visible one-line banner with its retry.
  const progressLine = rememberProgress ? <>
    <div className="progress-line" data-testid="progress-line" aria-hidden="true"><span style={{ width: `${stepIndex * 20}%` }} /></div>
    <div className={failedStage ? 'progress-banner' : 'sr-only'} data-testid={failedStage ? 'progress-banner' : undefined}>
      <p data-testid="scene-progress-status" role="status">{progress.stage === 'offline' ? extra.progressOffline : libraryCopy.progress[progress.stage]}</p>
      {progress.stage === 'readFailed' && <button className="text-button" type="button" onClick={progress.retryRead}>{libraryCopy.read}</button>}
      {progress.stage === 'saveFailed' && <button className="text-button" type="button" onClick={progress.retrySave}>{libraryCopy.save}</button>}
      {progress.stage === 'conflict' && <button className="text-button" type="button" onClick={progress.retryRead}>{libraryCopy.reload}</button>}
    </div>
  </> : null;
  // C11: the ‹ in the top bar is "one page back": leave the course on the watch page, back to watching from the
  // role page, and the previous step on the learning pages. Leaving the course moves into "more" there.
  const learnBack = page === 'learn' && step >= 2 && step <= 4 ? { label: step === 2 ? guide.roleBack : step === 3 ? guide.previousTerm : guide.previousSentence, go: () => step === 2 ? changePage('role') : changePage('learn', step - 1) } : null;
  const appBarStart = practising ? undefined
    : page === 'role' && course ? <button className="icon-btn" type="button" aria-label={guide.watchAgain} onClick={() => changePage('watch')}><Icon name="back" /></button>
    : learnBack && course ? <button className="icon-btn" type="button" aria-label={learnBack.label} onClick={learnBack.go}><Icon name="back" /></button>
    : <button data-testid="scene-back" className="icon-btn" type="button" aria-label={backText} disabled={leaving} onClick={leave}><Icon name="back" /></button>;
  const stepBar = guided && page === 'learn' && course ? <ol className="step-bar" data-testid="step-bar" aria-label={c11.stepsLabel}>
    {c11.steps.map((label, i) => <li key={label} aria-current={step === i + 2 ? 'step' : undefined} data-done={step > i + 2 || undefined}><span className="step-bar-line" aria-hidden="true" /><span className="step-bar-label">{label}</span></li>)}
  </ol> : null;
  const appBar = guided ? <AppBar moreLabel={shell.more} moreOpen={moreOpen} onMore={() => setMoreOpen(true)} moreRef={moreRef}
    start={appBarStart} center={stepBar}
    end={practising && course ? <span className="app-bar-meta" data-testid="practice-turn">{shell.turn(turnIndex + 1, course.turns.length)}</span> : undefined}>{progressLine}</AppBar> : null;
  const meta = guided && course ? `${guide.short(Math.max(1, Math.round(course.media.duration)))} · ${copy.notice}` : copy.notice;
  const watchAgainRow = <button type="button" className="sheet-row" onClick={() => { setMoreOpen(false); changePage('watch'); }}><Icon name="watch" />{guide.watchAgain}</button>;
  const leaveRow = <button data-testid="scene-back" type="button" className="sheet-row" disabled={leaving} onClick={() => { setMoreOpen(false); void leave(); }}><Icon name="exit" />{backText}</button>;
  // C11-1: the A-B loop and the global slow switch sit in "more → practice tools" on the sentences page.
  const abLoop = course ? (() => {
    const a = ab?.a ?? course.lines[0].id, b = ab?.b ?? course.lines[course.lines.length - 1].id;
    const ai = course.lines.findIndex(line => line.id === a), bi = course.lines.findIndex(line => line.id === b);
    return <div className="ab-loop">
      <label className="sheet-field" htmlFor={`${abId}-a`}><span className="sheet-label">{tools.abStart}</span></label><select id={`${abId}-a`} value={a} onChange={event => { stop(); setAb({ a: event.target.value, b }); }}>{course.lines.map(line => <option key={line.id} value={line.id}>{line.text}</option>)}</select>
      <label className="sheet-field" htmlFor={`${abId}-b`}><span className="sheet-label">{tools.abEnd}</span></label><select id={`${abId}-b`} value={b} onChange={event => { stop(); setAb({ a, b: event.target.value }); }}>{course.lines.map(line => <option key={line.id} value={line.id}>{line.text}</option>)}</select>
      <div className="ab-actions"><button type="button" className="btn btn-tonal btn-small" disabled={bi < ai} aria-pressed={loopKey === 'ab'} onClick={() => toggleLoop('ab', course.lines[ai].start, course.lines[bi].end)}><Icon name="loop" size={18} />{tools.abLoop}</button>
        <button type="button" className="btn btn-tonal btn-small" aria-pressed={slow} onClick={toggleSlow}>{tools.slow}</button></div>
    </div>;
  })() : null;
  const sheet = guided && !practising ? <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={shell.more} testId="more-sheet" closeLabel={shell.close}>
    {page === 'learn' && step === 3 && course ? <section className="sheet-section"><h3 className="sheet-label">{c11.practiceTools}</h3>{abLoop}</section> : null}
    {page === 'learn' ? <div className="sheet-rows">{watchAgainRow}{leaveRow}</div> : page === 'role' && course ? <div className="sheet-rows">{leaveRow}</div> : null}
    {shellContext?.common({ meta: course ? meta : undefined, trial: true })}
  </Sheet> : null;
  if (!course) return <section data-testid="real-scene-course" className={`real-scene${guided ? ' guided-scene' : ''}`}>{appBar}<h1>{title}</h1><p role={loadFailed ? 'alert' : 'status'}>{loadFailed ? notices.invalid : notices.loading}</p>{guided ? null : back}{sheet}</section>;
  const caption = course.lines.find(line => time >= line.start && time < line.end)?.text ?? '';
  const turn = course.turns[turnIndex];
  const partner = lineById(turn.partnerLineId);
  const learner = lineById(turn.learnerLineId);
  const learning = !guided || page === 'learn';
  const showAnswer = !guided || answerShown;
  const playing = segmentPlaying && fullPlayback.current;
  // C11-1: before the scene has been watched, the play circle is the page's one primary action.
  const playPrimary = guided && !watchedOnce ? ' btn-primary' : '';
  const tool = (icon: ReactNode, label: string, props: ButtonHTMLAttributes<HTMLButtonElement> & { 'data-testid'?: string }) =>
    <button type="button" className="tool-btn" {...props}><span className="tool-icon" aria-hidden="true">{icon}</span><span className="tool-label" aria-hidden="true">{label}</span></button>;
  return <section data-testid="real-scene-course" className={`real-scene${guided ? ' guided-scene' : ''}`} data-step={guided ? page === 'learn' ? step : page : undefined}>
    {appBar}
    <h1 ref={heading} tabIndex={-1}>{title}</h1>{guided ? null : <p className="trial-note">{copy.notice}</p>}
    {!guided && progressLine}
    {safety && <p data-testid="scene-safety" className="trial-note scene-safety">{extra.safety}</p>}
    {course.source === 'test-fixture' && <p role="note">{notices.test}</p>}
    {!guided && <nav className="scene-actions" aria-label={copy.title}>{copy.steps.map((label, i) => <button key={label} type="button" data-testid={`scene-step-${i + 1}`} aria-current={step === i + 1 ? 'step' : undefined} onClick={() => move(i + 1)}>{i + 1}. {label}</button>)}</nav>}
    <video ref={video} src={course.media.src} hidden={guided && page === 'role'} preload="auto" playsInline aria-label={title} onError={() => { mediaReady.current = false; stop(); setWatchComplete(false); setError(true); }} onEnded={() => {
      const range = loopRange.current, media = video.current;
      if (range && media && wantsPlayback.current) { media.currentTime = range.start; void media.play().catch(() => setError(true)); return; }
      if (guided && page === 'watch' && fullPlayback.current && wantsPlayback.current && !error && (video.current?.currentTime ?? 0) >= course.media.duration - 0.1) { setWatchComplete(true); setWatchedOnce(true); }
      wantsPlayback.current = false; fullPlayback.current = false; setSegmentPlaying(false); savePosition(true);
    }} onLoadedMetadata={() => {
      const duration = video.current?.duration;
      if (duration === undefined || !Number.isFinite(duration) || Math.abs(duration - course.media.duration) > 0.25 || course.lines.some(line => line.end > duration)) {
        mediaReady.current = false; stop(); setLoadFailed(true); setCourse(null);
        setProgressContext(null);
      } else {
        mediaReady.current = true;
        if (restoreTime.current !== null && video.current) { video.current.currentTime = restoreTime.current; restoreTime.current = null; }
      }
    }} onTimeUpdate={() => {
      const media = video.current;
      if (!media) return;
      if (wantsPlayback.current && !fullPlayback.current && !loopRange.current && media.currentTime >= end.current) {
        media.pause(); if (media.currentTime > end.current) media.currentTime = end.current; wantsPlayback.current = false; setSegmentPlaying(false);
      }
      setTime(media.currentTime);
      savePosition();
    }} onPause={() => savePosition(true)} />
    {step === 1 && (!guided || page === 'watch') && <div data-testid="scene-panel-1" className="watch-panel">
      <p data-testid="scene-caption" lang="en" className="scene-caption" aria-live="off" hidden={captionsHidden} data-empty={caption ? undefined : ''}>{caption || ' '}</p>
      <div className="watch-tools" data-testid="watch-tools">
        {tool(<Icon name="prev" />, c11.tools.previous, { 'aria-label': tools.previous, onClick: previousLine })}
        {tool(<Icon name="replay" />, c11.tools.replay, { 'aria-label': copy.replay, 'data-testid': 'scene-replay', onClick: () => play(0, course.media.duration, true) })}
        {playing
          ? <button type="button" className={`play-btn${playPrimary}`} onClick={stop}><Icon name="pause" size={26} /><span className="sr-only">{copy.pause}</span></button>
          : <button type="button" className={`play-btn${playPrimary}`} data-testid="scene-play" onClick={() => play(video.current?.ended ? 0 : video.current?.currentTime ?? 0, course.media.duration, true)}><Icon name="play" size={26} /><span className="sr-only">{copy.play}</span></button>}
        {tool(<Icon name="next" />, c11.tools.next, { 'aria-label': c11.nextLine, onClick: nextLine })}
        {tool(<Icon name="cc" />, c11.tools.caption, { 'aria-label': captionsHidden ? tools.showCaption : tools.hideCaption, onClick: () => setCaptionsHidden(hidden => !hidden), 'data-off': captionsHidden || undefined } as ButtonHTMLAttributes<HTMLButtonElement>)}
        {tool(<span className="speed-text">0.75×</span>, c11.tools.slow, { 'aria-label': tools.slow, 'aria-pressed': slow, onClick: toggleSlow })}
      </div>
      {guided && <>{watchComplete && <p className="watch-done" role="status">{guide.complete}</p>}<ActionBar><button className={`btn ${watchedOnce ? 'btn-primary' : 'btn-tonal'}`} type="button" onClick={() => changePage('role')}>{guide.enter}</button></ActionBar></>}
    </div>}
    {guided && page === 'role' && <div className="role-cards"><p className="scene-note">{contextSource === 'legacy-neutral' ? libraryCopy.neutral : guide.roleSource}</p>
      <div className="role-card role-card--me" data-testid="scene-learner-role"><span className="role-avatar" aria-hidden="true"><Icon name="person" /></span><p>{guide.learner}：{roles?.learner || guide.learnerFallback}</p></div>
      <div className="role-card" data-testid="scene-partner-role"><span className="role-avatar" aria-hidden="true"><Icon name="person" /></span><p>{guide.partner}：{roles?.partner || guide.partnerFallback}</p></div>
      <ActionBar><button type="button" className="btn btn-primary" onClick={() => changePage('learn', 2)}>{guide.start}</button></ActionBar>
    </div>}
    {learning && step === 2 && <div data-testid="scene-panel-2">{!guided && <h2>{copy.steps[1]}</h2>}<div className="term-list">{course.phrases.map(phrase => <article key={phrase.id} data-testid="scene-term" className="term-row">
      <div className="term-text"><strong lang="en">{phrase.text}</strong><p lang={language}>{phrase.translations[language]}</p></div>
      <button type="button" className="icon-btn icon-btn--soft" aria-label={copy.listen} onClick={() => playLine(lineById(phrase.lineId))}><Icon name="speaker" /></button>
    </article>)}</div></div>}
    {learning && step === 3 && <div data-testid="scene-panel-3">{!guided && <h2>{copy.steps[2]}</h2>}{course.lines.map(line => {
        const status = reports.statusOf(line.id), places = reports.elsewhere(line.id);
        return <div key={line.id} className={`sentence-row${status === 'disabled' ? ' sentence-disabled' : ''}`} data-status={status ?? undefined}>
          <article data-testid="scene-sentence" className="sentence-card"><strong lang="en">{line.text}</strong><p lang={language}>{line.translations[language]}</p>
            <button type="button" className="icon-btn icon-btn--soft sentence-play" aria-label={copy.listen} onClick={() => playLine(line)}><Icon name="play" /></button></article>
          <button type="button" className="icon-btn icon-btn--soft sentence-loop" aria-pressed={loopKey === line.id} aria-label={`${tools.loopLine}：${line.text}`} onClick={() => toggleLoop(line.id, line.start, line.end)}><Icon name="loop" /></button>
          {status === 'disabled' && <p data-testid="sentence-disabled-note" className="sentence-disabled-note" lang={language}>{gaps.sentenceDisabled}</p>}
          {saved ? <SentenceReport language={language} course={saved} lineId={line.id} text={line.text} received={reports.has(line.id)} status={status} onReceived={reports.mark} /> : null}
          {places.length > 0 && <p data-testid="sentence-elsewhere" className="sentence-elsewhere" lang={language}>{gaps.elsewhere(places.map(place => place.description).join(listSeparator))}</p>}</div>;
      })}
      {guided ? null : <div className="scene-card ab-loop-inline">{abLoop}</div>}</div>}
    {learning && step === 4 && <div data-testid="scene-panel-4" className="prompt-panel">{!guided && <h2>{copy.steps[3]}</h2>}
      <div className="chat">
        <div className="bubble bubble--partner">
          <p data-testid="scene-partner" lang="en" className="bubble-text">{partner.text}</p>
          {partnerHelp && <p data-testid="partner-help" className="bubble-sub" lang={language}>{partner.translations[language]}</p>}
          <div className="bubble-tools"><button data-testid="scene-turn-play" type="button" className="icon-btn icon-btn--soft" aria-label={copy.listen} onClick={() => playLine(partner)}><Icon name="play" /></button>
            <button type="button" className="chip-btn" aria-pressed={partnerHelp} onClick={() => setPartnerHelp(open => !open)}><Icon name="translate" size={18} />{partnerHelp ? tools.helpClose : tools.help}</button></div>
        </div>
        {reports.statusOf(learner.id) === 'disabled'
          ? <div className="bubble bubble--me bubble--soft sentence-disabled-answer"><p data-testid="scene-answer-disabled" lang={language}>{gaps.answerDisabled}</p></div>
          : showAnswer ? <div className="bubble bubble--me bubble--soft"><p className="bubble-label">{c11.youCanSay}</p><p data-testid="scene-answer" lang="en" className="bubble-text">{learner.text}</p><p className="bubble-sub" lang={language}>{learner.translations[language]}</p>
            <div className="bubble-tools"><button data-testid="scene-answer-play" type="button" className="icon-btn icon-btn--soft" aria-label={copy.answer} onClick={() => playLine(learner)}><Icon name="play" /></button></div></div>
          : <><button type="button" data-testid="answer-reveal" className="bubble bubble--reveal" onClick={() => setAnswerShown(true)}><span className="bubble-label">{c11.youCanSay}</span><span className="reveal-hint">{c11.reveal}</span></button>
            <p data-testid="scene-answer" lang="en" hidden>{learner.text}</p></>}
      </div>
      <p className="scene-note prompt-hint">{guided ? practiceCopy.promptHint : copy.hint}</p>
      {course.turns.length > 1 && <div className="turn-pager" data-testid="turn-pager"><button type="button" className="icon-btn" aria-label={notices.previous} disabled={turnIndex === 0} onClick={() => changeTurn(turnIndex - 1)}><Icon name="back" /></button>
        <span className="turn-pager-count">{turnIndex + 1}/{course.turns.length}</span>
        <button type="button" className="icon-btn" data-testid="scene-next-turn" aria-label={notices.next} disabled={turnIndex === course.turns.length - 1} onClick={() => changeTurn(turnIndex + 1)}><Icon name="chevron" /></button></div>}
    </div>}
    {guided && saved && page === 'learn' && step === 5 && <ScenePractice key={`${saved.id}:${saved.revision}:${saved.materialsRevision ?? 0}`} course={{ ...saved, lines: course.lines, turns: course.turns }} language={language} startTurn={turnIndex} memory={practiceMemory.current} mediaBusy={segmentPlaying} resumed={resumedPractice} stopPartner={stop}
      onTurn={turn => { position.current = { ...position.current, page: 'practice', turnIndex: turn }; setTurnIndex(turn); setResumedPractice(false); savePosition(true); }}
      onHint={turn => { position.current = { ...position.current, turnIndex: turn }; setTurnIndex(turn); setPartnerHelp(false); changePage('learn', 4, turn, true); }} onLeave={() => changePage('watch')} playPartner={(id, rate) => void playLine(lineById(id), rate)}
      more={{ open: moreOpen, close: () => setMoreOpen(false), returnFocus: moreRef }} meta={meta}
      moreRows={<>{watchAgainRow}{leaveRow}</>} />}
    {guided && page === 'learn' && step < 5 && <ActionBar>
      <button type="button" className="btn btn-primary" onClick={() => changePage('learn', step + 1)}>{step === 2 ? guide.nextSentence : step === 3 ? guide.nextPrompt : practiceCopy.enter}</button>
    </ActionBar>}
    {error && <p role="alert">{copy.error}</p>}
    {guided ? null : back}
    {sheet}
  </section>;
}
