'use client';

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { EntryLanguage } from './entry-copy';
import { listenToolsCopy } from './listen-tools-copy';
import { practiceQualityCopy } from './practice-quality-copy';
import { resumeSafetyCopy } from './resume-safety-copy';
import { useOnline, isOffline } from './use-online';
import { meaningOptions } from '../lib/practice-meanings';
import { auditGapsCopy } from './audit-gaps-copy';
import { classifyPracticeTurn, countOutcomes, practiceOutcomes, type PracticeOutcome, type PracticeReview } from '../lib/practice-review-outcomes';
import { ActionBar, Icon, Sheet, useShell } from './shell';
import { shellCopy } from './shell-copy';
import { c11Copy } from './c11-copy';
import { c12Copy } from './c12-copy';
import { c13Copy } from './c13-copy';

type Line = { id: string; text: string; translations?: Partial<Record<EntryLanguage, string>>; register?: string; plainAlternative?: string | null };
type Alternative = { text: string; translations?: Partial<Record<EntryLanguage, string>> };
type PracticeCourse = { id: string; revision: number; materialsRevision?: number; lines: Line[]; turns: { partnerLineId: string; learnerLineId: string; alternatives?: Alternative[] }[] };
// C13-3: the course's own "you could also say" answers for a turn; older courses have none.
const alternativesOf = (turn: { alternatives?: unknown }) => Array.isArray(turn.alternatives)
  ? (turn.alternatives as Alternative[]).filter(item => item && typeof item.text === 'string' && item.text.trim()).slice(0, 3) : [];
type History = { learner: string; partner: string }[];
type Reply = { transcript: string; text: string; src: string; understood?: boolean; coachNote?: string | null };
type Focus = 'normal' | 'refusal' | 'rephrase' | 'unclear';
type Goal = { revision: number; summary: string };
type GoalChange = { summary: string; confirm: string };
type Native = { transcript: string; understood: boolean; text: string | null; src: string | null };
type Correction = 'normal' | 'less';
// What this visit observed, for the review after practice. Nothing here is sent anywhere.
type Stats = { hints: number; autoHelp: number; translations: number; native?: number };
// Kept by the course page so a detour to the hint page does not lose the conversation so far.
export type PracticeMemory = { turnIndex: number; history: History; reply: Reply | null; focus?: Focus; ending?: 'done' | 'ended' | null; stats?: Stats; answered?: Record<number, string>; chosen?: Record<number, string>;
  // C9: the confirmed goal (its revision counts changes in this session), per-turn help and understanding, and the review session id.
  goal?: Goal | null; goalRevision?: number; helped?: Record<number, boolean>; understood?: Record<number, boolean>; session?: string;
  // C10-4: the first-turn settings sheet has been shown (or skipped) for this visit.
  setupAsked?: boolean };
// C10: the course page's "more" sheet is rendered here on the practice page, with the course's own rows.
type MoreSheet = { open: boolean; close: () => void; returnFocus: RefObject<HTMLButtonElement | null> };
type Copy = { start: string; done: string; hint: string; next: string; listening: string; sending: string; heard: string; silence: string; unavailable: string; budget: string; failed: string; login: string; mic: string; tooLong: string; intro: string; replay: string };

export const scenePracticeCopy: Record<EntryLanguage, Copy & { title: string; enter: string; promptHint: string }> = {
  'zh-Hans': { title: '开口对练', enter: '下一步：开口对练', promptHint: '听对方说话，再看答案跟读；这一步不录音、不评分。准备好后可以进入开口对练。',
    intro: '听对方说完，按“开始说”用英语回答，说完按“说完了”。对方会接着回应；不会给发音打分。', start: '开始说', done: '说完了', hint: '需要提示', next: '下一回合', replay: '重听对方',
    listening: '正在听你说…', sending: '正在发送…', heard: '听到你说：', silence: '没听到声音，可以再说一次或看提示。', unavailable: '语音对练尚未开通，可以先看提示跟读。',
    budget: '本批语音对练额度已用完。', failed: '这一轮没有完成，可以再试一次。', login: '请重新登录后再对练。', mic: '无法使用麦克风，可以先看提示跟读。', tooLong: '这段录音太长，请说短一点再试。' },
  id: { title: 'Latihan bicara', enter: 'Berikutnya: latihan bicara', promptHint: 'Dengarkan lawan bicara, lalu ikuti jawabannya. Langkah ini tidak merekam atau menilai.',
    intro: 'Setelah lawan bicara selesai, tekan "Mulai bicara" dan jawab dalam bahasa Inggris, lalu tekan "Selesai". Pengucapan tidak dinilai.', start: 'Mulai bicara', done: 'Selesai', hint: 'Lihat petunjuk', next: 'Giliran berikutnya', replay: 'Dengarkan lagi',
    listening: 'Mendengarkan…', sending: 'Mengirim…', heard: 'Kami mendengar:', silence: 'Tidak terdengar suara. Coba lagi atau lihat petunjuk.', unavailable: 'Latihan suara belum tersedia. Ikuti petunjuk dulu.',
    budget: 'Kuota latihan suara sudah habis.', failed: 'Giliran ini tidak selesai. Silakan coba lagi.', login: 'Silakan masuk lagi untuk berlatih.', mic: 'Mikrofon tidak dapat dipakai. Ikuti petunjuk dulu.', tooLong: 'Rekaman terlalu panjang. Coba lebih singkat.' },
  ja: { title: '話して練習', enter: '次へ：話して練習', promptHint: '相手を聞いて答えを読み上げます。この段階では録音も採点もしません。',
    intro: '相手が話し終えたら「話す」を押して英語で答え、終わったら「話し終えた」を押します。発音の採点はしません。', start: '話す', done: '話し終えた', hint: 'ヒントを見る', next: '次のやり取り', replay: '相手をもう一度聞く',
    listening: '聞いています…', sending: '送信中…', heard: '聞き取った内容：', silence: '声が聞こえませんでした。もう一度話すかヒントを見てください。', unavailable: '音声練習はまだ利用できません。ヒントを見て練習してください。',
    budget: '今回の音声練習の上限に達しました。', failed: 'このやり取りは完了しませんでした。もう一度お試しください。', login: 'もう一度ログインしてください。', mic: 'マイクを使えません。ヒントを見て練習してください。', tooLong: '録音が長すぎます。短くしてもう一度どうぞ。' },
  ko: { title: '말하기 연습', enter: '다음: 말하기 연습', promptHint: '상대 말을 듣고 답을 따라 말하세요. 이 단계는 녹음하거나 평가하지 않습니다.',
    intro: '상대가 말한 뒤 "말하기"를 눌러 영어로 답하고 끝나면 "다 말했어요"를 누르세요. 발음은 평가하지 않습니다.', start: '말하기', done: '다 말했어요', hint: '힌트 보기', next: '다음 대화', replay: '상대 다시 듣기',
    listening: '듣고 있어요…', sending: '보내는 중…', heard: '들은 내용:', silence: '소리가 들리지 않았어요. 다시 말하거나 힌트를 보세요.', unavailable: '음성 연습은 아직 열리지 않았습니다. 힌트를 보며 연습하세요.',
    budget: '이번 음성 연습 한도를 다 썼습니다.', failed: '이번 대화가 완료되지 않았어요. 다시 시도하세요.', login: '다시 로그인한 뒤 연습하세요.', mic: '마이크를 쓸 수 없습니다. 힌트를 보며 연습하세요.', tooLong: '녹음이 너무 깁니다. 짧게 다시 말해 주세요.' },
  hi: { title: 'बोलकर अभ्यास', enter: 'आगे: बोलकर अभ्यास', promptHint: 'सामने वाले को सुनें, फिर उत्तर देखकर बोलें। इस चरण में रिकॉर्डिंग या अंक नहीं हैं।',
    intro: 'सामने वाले के बोलने के बाद "बोलना शुरू करें" दबाकर अंग्रेज़ी में जवाब दें, फिर "बोल लिया" दबाएँ। उच्चारण के अंक नहीं दिए जाते।', start: 'बोलना शुरू करें', done: 'बोल लिया', hint: 'संकेत देखें', next: 'अगली बारी', replay: 'फिर सुनें',
    listening: 'सुन रहे हैं…', sending: 'भेज रहे हैं…', heard: 'हमने सुना:', silence: 'आवाज़ नहीं सुनाई दी। फिर बोलें या संकेत देखें।', unavailable: 'आवाज़ अभ्यास अभी उपलब्ध नहीं है। पहले संकेत देखकर बोलें।',
    budget: 'इस बार का आवाज़ अभ्यास कोटा खत्म हो गया।', failed: 'यह बारी पूरी नहीं हुई। फिर कोशिश करें।', login: 'अभ्यास के लिए फिर से साइन इन करें।', mic: 'माइक्रोफ़ोन उपलब्ध नहीं है। पहले संकेत देखकर बोलें।', tooLong: 'रिकॉर्डिंग बहुत लंबी है। छोटा करके फिर बोलें।' },
};

const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav'];
const MAX_AUDIO_BYTES = 1_000_000;
const MAX_RECORDING_MS = 30_000;
const errorKey: Record<number, keyof Copy> = { 401: 'login', 429: 'budget', 502: 'failed', 503: 'unavailable' };
// C12-1: a recording needs about 300 ms of sound above a quiet-room level before it is sent at all.
const VOICE_RMS = 0.02, MIN_VOICED_MS = 300, METER_TICK_MS = 50;
// C12-4: the microphone asks for the phone's own cleanup, and a request that never answers is explained after 8 s.
const MIC_CONSTRAINTS = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
const MIC_TIMEOUT_MS = 8000;
// A few samples of silence, used once to unlock the reply audio element inside the learner's tap.
const SILENT_WAV = 'data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA';
type Meter = { ctx: AudioContext; analyser: AnalyserNode | null; timer: number; samples: number; voicedMs: number; last: number };
function openAudioContext(): AudioContext | null {
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    const ctx = new Context();
    ctx.resume?.()?.catch?.(() => undefined);
    return ctx;
  } catch { return null; /* no Web Audio: the recording is sent without a sound check */ }
}
const HELP_DELAY_MS = 6000;
const AUTO_HELP_KEY = 'les.practice.autoHelp';
function readAutoHelp() { try { return window.localStorage.getItem(AUTO_HELP_KEY) !== 'off'; } catch { return true; } }
const CORRECTION_KEY = 'les.practice.correction';
function readCorrection(): Correction { try { return window.localStorage.getItem(CORRECTION_KEY) === 'less' ? 'less' : 'normal'; } catch { return 'normal'; } }
const MAX_COACH_NOTE = 120;
const AUDIO_MIME = /^audio\/[a-z0-9.+-]+$/;
const goalChangeOf = (value: unknown): GoalChange | null => {
  const v = value as GoalChange | null | undefined;
  return v && typeof v === 'object' && typeof v.summary === 'string' && typeof v.confirm === 'string' && v.summary.trim() && v.summary.length <= 120 && v.confirm.length <= 200 ? { summary: v.summary.trim(), confirm: v.confirm.trim() } : null;
};
function newSession() {
  try { return crypto.randomUUID(); } catch { return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`; }
}
const outcomeOrder: PracticeOutcome[] = [...practiceOutcomes];

async function toBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// One spoken exchange at a time: the microphone opens only on an explicit start, the turn is sent once when the
// learner says they are done, and every failure waits for the learner instead of retrying.
export default function ScenePractice({ course, language, startTurn, onHint, onLeave, playPartner, stopPartner, onTurn, resumed = false, memory, mediaBusy = false, more, moreRows, meta }: { course: PracticeCourse; language: EntryLanguage; startTurn: number; onHint: (turnIndex: number) => void; onLeave?: () => void; playPartner: (lineId: string, rate?: number) => void; stopPartner?: () => void; onTurn?: (turnIndex: number) => void; resumed?: boolean; memory?: PracticeMemory; mediaBusy?: boolean; more?: MoreSheet; moreRows?: ReactNode; meta?: string }) {
  const copy = scenePracticeCopy[language];
  const tools = listenToolsCopy[language];
  const quality = practiceQualityCopy[language];
  const extra = resumeSafetyCopy[language];
  const gaps = auditGapsCopy[language];
  const shell = shellCopy[language];
  const c11 = c11Copy[language];
  const c12 = c12Copy[language];
  const shellContext = useShell();
  const online = useOnline();
  const choiceId = useId();
  const [focus, setFocus] = useState<Focus>(memory?.focus ?? 'normal');
  const [correction, setCorrection] = useState<Correction>(readCorrection);
  const [ending, setEnding] = useState<'done' | 'ended' | null>(memory?.ending ?? null);
  const [feedback, setFeedback] = useState<'idle' | 'busy' | 'saved' | 'failed' | 'offline'>('idle');
  const stats = useRef<Stats>(memory?.stats ?? { hints: 0, autoHelp: 0, translations: 0 });
  const answered = useRef<Record<number, string>>(memory?.answered ?? {});
  // C8-5: meanings picked without speaking, per turn (line id). The review shows them as "picked, not spoken".
  const chosen = useRef<Record<number, string>>(memory?.chosen ?? {});
  // C9-6: per-turn help and whether the partner understood the last attempt, for the review's classification.
  const helped = useRef<Record<number, boolean>>(memory?.helped ?? {});
  const understoodBy = useRef<Record<number, boolean>>(memory?.understood ?? {});
  const session = useRef<string>(memory?.session ?? '');
  if (!session.current) session.current = newSession();
  const [reviewSave, setReviewSave] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [previousReview, setPreviousReview] = useState<PracticeReview | null>(null);
  // C9-1: the confirmed goal and its revision; a reply sent under an older revision is ignored when it arrives.
  const [goal, setGoal] = useState<Goal | null>(memory?.goal ?? null);
  const goalRef = useRef<Goal | null>(memory?.goal ?? null);
  const goalRevision = useRef<number>(memory?.goalRevision ?? memory?.goal?.revision ?? 0);
  const [pendingGoal, setPendingGoal] = useState<GoalChange | null>(null);
  // C9-2: "say it in my language": the suggestion card, and which kind of recording is running.
  const [native, setNative] = useState<Native | null>(null);
  const mode = useRef<'english' | 'native'>('english');
  const nativeAudio = useRef<HTMLAudioElement>(null);
  const [turnIndex, setTurnIndex] = useState(startTurn);
  const [stage, setStage] = useState<'idle' | 'opening' | 'recording' | 'sending'>('idle');
  const [notice, setNotice] = useState<{ kind: 'status' | 'alert'; key: keyof Copy | 'paused' | 'offline' | 'staleGoal' | 'quiet' | 'micStuck' | 'rateLimit' } | null>(null);
  // C12-3: turns left today (from the last answer) and whether today's turns are used up.
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  // C12-4: the phone refused to autoplay the reply; one tap in the bubble plays it.
  const [blocked, setBlocked] = useState(false);
  // C12-5: this turn's own recording, only in this page's memory, released when the turn changes.
  const [selfUrl, setSelfUrl] = useState<string | null>(null);
  const selfUrlRef = useRef<string | null>(null);
  const selfAudio = useRef<HTMLAudioElement>(null);
  const [showModel, setShowModel] = useState(false);
  const meter = useRef<Meter | null>(null);
  const unlocked = useRef(false);
  const [thinking, setThinking] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [chosenLine, setChosenLine] = useState<string | null>(memory && memory.turnIndex === startTurn ? memory.chosen?.[startTurn] ?? null : null);
  const [resumeChoice, setResumeChoice] = useState(resumed);
  const [reply, setReply] = useState<Reply | null>(memory && memory.turnIndex === startTurn ? memory.reply : null);
  const [history, setHistory] = useState<History>(memory?.history ?? []);
  const [autoHelp, setAutoHelp] = useState(readAutoHelp);
  const [helpLevel, setHelpLevel] = useState(0);
  const [partnerHelp, setPartnerHelp] = useState(false);
  const [alternativesShown, setAlternativesShown] = useState(false);
  // C10-3/C10-4: "more help" sheet, the once-only first-turn settings sheet, and where focus lands after them.
  const [helpOpen, setHelpOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(() => !resumed && !memory?.setupAsked && !(memory?.history?.length) && startTurn === 0 && !memory?.ending);
  const setupAsked = useRef(!!memory?.setupAsked);
  const micButton = useRef<HTMLButtonElement>(null);
  const freshReply = useRef(false);
  const discard = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const mounted = useRef(true);
  const turn = course.turns[turnIndex];
  const partner = course.lines.find(line => line.id === turn.partnerLineId)!;
  const learner = course.lines.find(line => line.id === turn.learnerLineId)!;
  const alternatives = alternativesOf(turn);
  const c13 = c13Copy[language];
  if (memory) { memory.turnIndex = turnIndex; memory.history = history; memory.reply = reply; memory.focus = focus; memory.ending = ending; memory.stats = stats.current; memory.answered = answered.current; memory.chosen = chosen.current;
    memory.goal = goal; memory.goalRevision = goalRevision.current; memory.helped = helped.current; memory.understood = understoodBy.current; memory.session = session.current; memory.setupAsked = setupAsked.current || !setupOpen; }

  function release() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    closeMeter();
  }
  // C12-1: how much of the recording had sound. Unknown (null) when Web Audio could not listen, so nothing is held back.
  function closeMeter(): number | null {
    const m = meter.current;
    meter.current = null;
    if (!m) return null;
    window.clearInterval(m.timer);
    m.ctx.close?.()?.catch?.(() => undefined);
    return m.analyser && m.samples >= 2 ? m.voicedMs : null;
  }
  function startMeter(ctx: AudioContext | null, media: MediaStream) {
    if (!ctx) return;
    let analyser: AnalyserNode;
    try {
      const source = ctx.createMediaStreamSource(media);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
    } catch { ctx.close?.()?.catch?.(() => undefined); return; /* not a stream Web Audio can read: send without a sound check */ }
    const samples = new Float32Array(analyser.fftSize);
    const m: Meter = { ctx, analyser, timer: 0, samples: 0, voicedMs: 0, last: performance.now() };
    m.timer = window.setInterval(() => {
      const now = performance.now(), elapsed = Math.min(200, now - m.last);
      m.last = now;
      if (m.ctx.state !== 'running') return;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      m.samples++;
      if (Math.sqrt(sum / samples.length) >= VOICE_RMS) m.voicedMs += elapsed;
    }, METER_TICK_MS);
    meter.current = m;
  }
  function releaseSelf() {
    if (selfUrlRef.current) URL.revokeObjectURL(selfUrlRef.current);
    selfUrlRef.current = null;
    setSelfUrl(null); setShowModel(false);
  }
  // C12-4: inside the learner's tap, play the reused reply element once, muted, so a later reply may play on phones.
  function unlockReplyAudio() {
    const element = audio.current;
    if (!element || unlocked.current) return;
    unlocked.current = true;
    if (!element.getAttribute('src')) element.src = SILENT_WAV;
    element.muted = true;
    const done = () => { element.pause(); element.muted = false; };
    try { element.play()?.then(done, () => { element.muted = false; }); } catch { element.muted = false; }
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (recorder.current?.state === 'recording') recorder.current.stop(); release(); if (selfUrlRef.current) URL.revokeObjectURL(selfUrlRef.current); selfUrlRef.current = null; };
  }, []);
  // A new bubble (reply, native-language help, a chosen meaning, a hint) is scrolled into view above the bottom bar.
  const chat = useRef<HTMLDivElement>(null);
  const chatShown = useRef(false);
  const chatKey = `${reply?.text ?? ''}|${native ? 1 : 0}|${chosenLine ?? ''}|${choosing ? 1 : 0}|${helpLevel}|${thinking ? 1 : 0}`;
  useEffect(() => {
    if (!chatShown.current) { chatShown.current = true; return; }
    const last = chat.current?.lastElementChild;
    if (last && typeof last.scrollIntoView === 'function') last.scrollIntoView({ block: 'nearest' });
  }, [chatKey]);
  useEffect(() => {
    if (!reply || !freshReply.current) return;
    freshReply.current = false;
    const element = audio.current;
    if (!element) return;
    element.muted = false;
    // C12-4: a refused autoplay is said out loud as a button in the reply bubble instead of failing silently.
    element.play().then(() => { if (mounted.current) setBlocked(false); }, (error: unknown) => { if (mounted.current && (error as DOMException)?.name === 'NotAllowedError') setBlocked(true); });
  }, [reply]);
  function playReply() {
    const element = audio.current;
    if (!element) return;
    element.muted = false;
    element.play().then(() => { if (mounted.current) setBlocked(false); }, () => undefined);
  }
  // Silence after the partner has finished earns help: first how to begin, then the whole answer with a model.
  // Nothing is offered while the partner is still talking, while the learner is speaking, or once they answered.
  useEffect(() => {
    if (!autoHelp || ending || stage !== 'idle' || reply || helpLevel >= 2 || mediaBusy || thinking || chosenLine || choosing || resumeChoice || native || setupOpen) return;
    const id = setTimeout(() => { if (document.visibilityState !== 'hidden') { stats.current.autoHelp++; helped.current[turnIndex] = true; setHelpLevel(level => level + 1); } }, HELP_DELAY_MS);
    return () => clearTimeout(id);
  }, [autoHelp, ending, stage, reply, helpLevel, mediaBusy, turnIndex, thinking, chosenLine, choosing, resumeChoice, native, setupOpen]);
  // C9-6: each ending saves this visit's review once (the same session id updates it) and brings back the last one.
  useEffect(() => {
    if (!ending) return;
    let active = true;
    const outcomes = course.turns.map((_, i) => outcomeOf(i));
    const body = { course: { id: course.id, revision: course.revision, ...(course.materialsRevision !== undefined ? { materialsRevision: course.materialsRevision } : {}) }, session: session.current,
      turns: outcomes.map((outcome, turnIndex) => ({ turnIndex, outcome })), help: { hints: stats.current.hints, autoHelp: stats.current.autoHelp, translations: stats.current.translations, native: stats.current.native ?? 0 } };
    if (isOffline()) { setReviewSave('failed'); return; }
    setReviewSave('saving'); setPreviousReview(null);
    const controller = new AbortController(), deadline = window.setTimeout(() => controller.abort(), 5000);
    fetch('/api/practice-reviews', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(async response => {
        const data = response.status === 201 ? await response.json() : null;
        if (!active) return;
        if (!data) { setReviewSave('failed'); return; }
        const previous = data.previous as PracticeReview | null;
        setPreviousReview(previous && Array.isArray(previous.turns) && previous.turns.every(turn => outcomeOrder.includes(turn?.outcome)) ? previous : null);
        setReviewSave('saved');
      })
      .catch(() => { if (active) setReviewSave('failed'); })
      .finally(() => window.clearTimeout(deadline));
    return () => { active = false; };
  }, [ending]);
  // Going to the background ends the recording without sending it and gives the microphone back.
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === 'hidden' && recorder.current?.state === 'recording') { discard.current = true; recorder.current.stop(); }
    };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, []);
  function changeAutoHelp(on: boolean) {
    setAutoHelp(on); if (!on) setHelpLevel(0);
    try { window.localStorage.setItem(AUTO_HELP_KEY, on ? 'on' : 'off'); } catch { /* the choice still holds for this visit */ }
  }
  function changeCorrection(next: Correction) {
    setCorrection(next);
    try { window.localStorage.setItem(CORRECTION_KEY, next); } catch { /* the choice still holds for this visit */ }
  }

  function outcomeOf(i: number): PracticeOutcome {
    return classifyPracticeTurn({ spoken: answered.current[i] !== undefined, understood: understoodBy.current[i] ?? null, helped: !!helped.current[i], chose: chosen.current[i] !== undefined });
  }

  async function start(kind: 'english' | 'native' = 'english') {
    if (isOffline()) { setNotice({ kind: 'alert', key: 'offline' }); return; }
    mode.current = kind;
    if (kind === 'native') setNative(null);
    unlockReplyAudio();
    const ctx = openAudioContext();
    setResumeChoice(false); setChoosing(false); releaseSelf(); setBlocked(false);
    setNotice(null); setReply(null); setFeedback('idle'); setHelpLevel(0); discard.current = false; setStage('opening');
    let timedOut = false;
    try {
      const media = await new Promise<MediaStream>((resolve, reject) => {
        const deadline = window.setTimeout(() => { timedOut = true; reject(new Error('Microphone request timed out')); }, MIC_TIMEOUT_MS);
        Promise.resolve().then(() => navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)).then(media => {
          window.clearTimeout(deadline);
          // An answer after the deadline gives the microphone straight back.
          if (timedOut) media.getTracks().forEach(track => track.stop()); else resolve(media);
        }, error => { window.clearTimeout(deadline); reject(error); });
      });
      if (!mounted.current) { media.getTracks().forEach(track => track.stop()); ctx?.close?.()?.catch?.(() => undefined); return; }
      stream.current = media;
      startMeter(ctx, media);
      const type = AUDIO_TYPES.find(t => MediaRecorder.isTypeSupported?.(t));
      const rec = new MediaRecorder(media, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      rec.onstop = () => {
        const voiced = closeMeter();
        release();
        if (discard.current) { discard.current = false; if (mounted.current) { setStage('idle'); setNotice({ kind: 'status', key: 'paused' }); } return; }
        // C12-1: no real sound, nothing sent: no request, no reservation, no turn used.
        if (voiced !== null && voiced < MIN_VOICED_MS) { if (mounted.current) { setStage('idle'); setNotice({ kind: 'status', key: 'quiet' }); } return; }
        void send(new Blob(chunks, { type: rec.mimeType || type || '' }));
      };
      recorder.current = rec;
      rec.start();
      timer.current = setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, MAX_RECORDING_MS);
      setStage('recording');
    } catch {
      release(); ctx?.close?.()?.catch?.(() => undefined);
      if (mounted.current) { setStage('idle'); setNotice({ kind: 'alert', key: timedOut ? 'micStuck' : 'mic' }); }
    }
  }

  async function send(blob: Blob) {
    if (!mounted.current) return;
    const mimeType = blob.type.split(';')[0];
    if (!blob.size) { setStage('idle'); setNotice({ kind: 'status', key: 'silence' }); return; }
    if (blob.size > MAX_AUDIO_BYTES) { setStage('idle'); setNotice({ kind: 'alert', key: 'tooLong' }); return; }
    if (!AUDIO_TYPES.includes(mimeType)) { setStage('idle'); setNotice({ kind: 'alert', key: 'mic' }); return; }
    // C8-1: a recording finished offline is not sent and not retried; the learner can say it again once back online.
    if (isOffline()) { setStage('idle'); setNotice({ kind: 'alert', key: 'offline' }); return; }
    setStage('sending');
    const sentRevision = goalRevision.current, sentGoal = goalRef.current, sentMode = mode.current;
    try {
      const response = await fetch('/api/practice-turn', {
        method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ courseId: course.id, revision: course.revision, ...(course.materialsRevision !== undefined ? { materialsRevision: course.materialsRevision } : {}), turnIndex, language, history, ...(focus !== 'normal' ? { focus } : {}), ...(correction === 'less' ? { correction } : {}),
          ...(sentMode === 'native' ? { mode: 'native' } : {}), ...(sentGoal ? { goal: { revision: sentGoal.revision, summary: sentGoal.summary } } : {}), mimeType, audioBase64: await toBase64(blob) }),
      });
      const data = await response.json().catch(() => null);
      if (!mounted.current) return;
      // C12-3: past today's turns the page says so once and keeps listening, replay and hints open.
      if (response.status === 429 && data?.error === 'daily_limit') { setLimitReached(true); setRemaining(0); return; }
      if (response.status === 429 && data?.error === 'rate_limit') { setNotice({ kind: 'status', key: 'rateLimit' }); return; }
      if (!response.ok) { setNotice({ kind: 'alert', key: errorKey[response.status] ?? 'failed' }); return; }
      if (Number.isSafeInteger(data?.remainingToday) && data.remainingToday >= 0) setRemaining(data.remainingToday);
      if (data?.kind === 'silence') { setNotice({ kind: 'status', key: 'silence' }); return; }
      // C9-1: the goal changed while this reply was on its way: it belongs to the old goal and must not overwrite the new one.
      if (goalRevision.current !== sentRevision || (data?.goalRevision !== undefined && data.goalRevision !== sentRevision)) { setNotice({ kind: 'status', key: 'staleGoal' }); return; }
      if (sentMode === 'native') {
        const suggestion = data?.suggestion;
        const valid = data?.kind === 'native' && typeof data.transcript === 'string' && typeof data.understood === 'boolean'
          && (data.understood ? !!suggestion && typeof suggestion.text === 'string' && !!suggestion.text.trim() && suggestion.text.length <= 160 && typeof suggestion.audioBase64 === 'string' && AUDIO_MIME.test(suggestion.mimeType) : suggestion === null);
        if (!valid) { setNotice({ kind: 'alert', key: 'failed' }); return; }
        stats.current.native = (stats.current.native ?? 0) + 1; helped.current[turnIndex] = true;
        setNative({ transcript: data.transcript, understood: data.understood, text: data.understood ? suggestion.text.trim() : null, src: data.understood ? `data:${suggestion.mimeType};base64,${suggestion.audioBase64}` : null });
        return;
      }
      const r = data?.reply;
      const note = data?.coachNote;
      if (data?.kind !== 'reply' || typeof data.transcript !== 'string' || typeof r?.text !== 'string' || typeof r.audioBase64 !== 'string' || !AUDIO_MIME.test(r.mimeType)
        || (data.done !== undefined && typeof data.done !== 'boolean') || (data.understood !== undefined && typeof data.understood !== 'boolean')
        || !(note === undefined || note === null || typeof note === 'string' && note.length <= MAX_COACH_NOTE)) { setNotice({ kind: 'alert', key: 'failed' }); return; }
      freshReply.current = true;
      // C12-5: keep this turn's recording in the page so the learner can hear it next to the model.
      try { const url = URL.createObjectURL(blob); selfUrlRef.current = url; setSelfUrl(url); } catch { setSelfUrl(null); /* no object URLs: only the model can be played */ }
      answered.current[turnIndex] = data.transcript;
      understoodBy.current[turnIndex] = data.understood !== false;
      setNative(null);
      setPendingGoal(goalChangeOf(data.goalChange));
      setReply({ transcript: data.transcript, text: r.text, src: `data:${r.mimeType};base64,${r.audioBase64}`, understood: data.understood !== false, coachNote: typeof note === 'string' && note.trim() ? note.trim() : null });
      if (data.done === true) setEnding('done');
      setHistory(previous => [...previous, { learner: data.transcript.slice(0, 500), partner: r.text.slice(0, 500) }].slice(-10));
    } catch {
      if (mounted.current) setNotice({ kind: 'alert', key: 'failed' });
    } finally {
      if (mounted.current) setStage('idle');
    }
  }

  function resetTurn() { setAlternativesShown(false); releaseSelf(); setBlocked(false); setReply(null); setNotice(null); setHelpLevel(0); setPartnerHelp(false); setFeedback('idle'); setThinking(false); setChoosing(false); setChosenLine(null); setResumeChoice(false); setNative(null); setPendingGoal(null); }
  function confirmGoal() {
    if (!pendingGoal) return;
    goalRevision.current += 1;
    const next = { revision: goalRevision.current, summary: pendingGoal.summary };
    goalRef.current = next; setGoal(next); setPendingGoal(null);
  }
  function nextTurn() {
    const next = turnIndex + 1;
    setTurnIndex(next); resetTurn(); onTurn?.(next);
    playPartner(course.turns[next].partnerLineId);
  }
  function practiseAgain() {
    setTurnIndex(0); setHistory([]); resetTurn(); setEnding(null); onTurn?.(0);
    Object.assign(stats.current, { hints: 0, autoHelp: 0, translations: 0 });
    for (const key of Object.keys(answered.current)) delete answered.current[Number(key)];
    for (const key of Object.keys(chosen.current)) delete chosen.current[Number(key)];
    for (const record of [helped.current, understoodBy.current]) for (const key of Object.keys(record)) delete record[Number(key)];
    stats.current.native = 0; session.current = newSession(); setReviewSave('idle'); setPreviousReview(null);
    goalRef.current = null; setGoal(null);
    playPartner(course.turns[0].partnerLineId);
  }
  // C8-5: picking a meaning shows and plays the course's own English line for it; nothing is sent or scored.
  function pickMeaning(lineId: string) {
    chosen.current[turnIndex] = lineId; helped.current[turnIndex] = true;
    setChosenLine(lineId); setChoosing(false); setHelpLevel(0); setResumeChoice(false);
    playPartner(lineId);
  }
  function pause() { stopPartner?.(); audio.current?.pause(); }
  // "This feedback is wrong": one same-origin write with a 5 second deadline; only a 201 counts as recorded.
  async function markWrong(note: string) {
    if (isOffline()) { setFeedback('offline'); return; }
    setFeedback('busy');
    const controller = new AbortController(), deadline = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('/api/practice-feedback', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ course: { id: course.id, revision: course.revision, ...(course.materialsRevision !== undefined ? { materialsRevision: course.materialsRevision } : {}) }, turnIndex, note }) });
      if (mounted.current) setFeedback(response.status === 201 ? 'saved' : 'failed');
    } catch { if (mounted.current) setFeedback('failed'); }
    finally { window.clearTimeout(deadline); }
  }

  const busy = stage !== 'idle';
  const outcomeLabel: Record<PracticeOutcome, string> = { independent: gaps.outcomeIndependent, after_hint: gaps.outcomeAfterHint, needs_help: gaps.outcomeNeedsHelp, chose_meaning: gaps.outcomeChose, unobserved: gaps.outcomeUnobserved };
  const compareLine = (label: string, outcomes: PracticeOutcome[]) => { const counts = countOutcomes(outcomes); return `${label}：${outcomeOrder.map(outcome => `${outcomeLabel[outcome]} ${counts[outcome]}`).join(' · ')}`; };
  const showCoach = reply?.coachNote && !(correction === 'less' && reply.understood);
  // Settings are native radios drawn as segmented controls; they live in the first-turn sheet, then in "more".
  const radio = <T extends string>(group: string, value: T, current: T, label: string, change: (v: T) => void) =>
    <label key={value} className="segment"><input type="radio" name={`${choiceId}-${group}`} value={value} checked={current === value} disabled={busy} onChange={() => change(value)} /><span>{label}</span></label>;
  const settings = <>
    <fieldset className="segmented"><legend>{quality.focusLegend}</legend><div className="segments">
      {radio('focus', 'normal', focus, quality.focusNormal, setFocus)}{radio('focus', 'refusal', focus, quality.focusRefusal, setFocus)}{radio('focus', 'rephrase', focus, quality.focusRephrase, setFocus)}{radio('focus', 'unclear', focus, gaps.focusUnclear, setFocus)}
    </div></fieldset>
    <fieldset className="segmented"><legend>{quality.correctionLegend}</legend><div className="segments">
      {radio('correction', 'normal', correction, quality.correctionNormal, changeCorrection)}{radio('correction', 'less', correction, quality.correctionLess, changeCorrection)}
    </div></fieldset>
  </>;
  function finishSetup() {
    if (!setupOpen) return;
    setupAsked.current = true; setSetupOpen(false);
    playPartner(partner.id);
    requestAnimationFrame(() => micButton.current?.focus({ preventScroll: true }));
  }
  const canNext = !ending && !!(reply || chosenLine) && turnIndex < course.turns.length - 1;
  const showTip = stage === 'idle' && !notice && online && !limitReached && !reply && !chosenLine && !native && !thinking && !choosing && helpLevel === 0 && history.length === 0 && turnIndex === 0 && stats.current.hints === 0;
  const helpAction = (action: () => void) => () => { setHelpOpen(false); action(); };
  const offlineId = `${choiceId}-offline`;
  return <div data-testid="scene-panel-5" className="practice-panel">
    {goal && !ending && <p data-testid="practice-goal" className="goal-chip" lang={language}>{gaps.goalLine(goal.revision, goal.summary)}</p>}
    <div className="chat" ref={chat}>
      <div className="bubble bubble--partner">
        <p data-testid="practice-partner" lang="en" className="bubble-text">{partner.text}</p>
        {partnerHelp && <p data-testid="partner-help" className="bubble-sub" lang={language}>{partner.translations?.[language]}</p>}
        {partnerHelp && partner.register === 'sg-colloquial' && typeof partner.plainAlternative === 'string' && partner.plainAlternative.trim()
          && <p data-testid="partner-plain" className="plain-alt" lang={language}>{c13.plain}<span lang="en">{partner.plainAlternative}</span></p>}
        <div className="bubble-tools">
          {mediaBusy
            ? <button type="button" className="icon-btn icon-btn--soft" aria-label={extra.pause} onClick={pause}><Icon name="pause" /></button>
            : <button type="button" className="icon-btn icon-btn--soft" aria-label={copy.replay} disabled={busy} onClick={() => playPartner(partner.id)}><Icon name="replay" /></button>}
          <button type="button" className="icon-btn icon-btn--soft" aria-label={tools.slower} disabled={busy} onClick={() => playPartner(partner.id, 0.75)}><span className="speed-text">0.75×</span></button>
          <button type="button" className="chip-btn" aria-pressed={partnerHelp} onClick={() => { if (!partnerHelp) { stats.current.translations++; helped.current[turnIndex] = true; } setPartnerHelp(open => !open); }}><Icon name="translate" size={18} />{partnerHelp ? tools.helpClose : tools.help}</button>
        </div>
      </div>
      {native && !ending && <div data-testid="practice-native" className="bubble bubble--help practice-native">
        <p lang={language}>{gaps.nativeHeard} {native.transcript}</p>
        {native.understood && native.text && native.src ? <>
          <p className="bubble-text">{gaps.nativeSay}<span lang="en">{native.text}</span></p>
          <audio data-testid="practice-native-audio" ref={nativeAudio} src={native.src} preload="auto" />
          <div className="bubble-actions"><button type="button" className="btn btn-tonal btn-small" onClick={() => { nativeAudio.current?.play().catch(() => {}); }}><Icon name="play" size={18} />{gaps.nativePlay}</button>
            <button type="button" className="btn btn-tonal btn-small" disabled={busy || !online} onClick={() => start('english')}><Icon name="mic" size={18} />{gaps.nativeRetry}</button></div>
          <p className="bubble-sub">{gaps.nativeNote}</p>
        </> : <p role="status">{gaps.nativeUnclear}</p>}
      </div>}
      {thinking && !ending && !reply && stage === 'idle' && <p data-testid="practice-thinking" className="chat-note" role="status">{extra.thinking}</p>}
      {choosing && !ending && <fieldset className="bubble bubble--help practice-meanings"><legend>{extra.chooseLegend}</legend>
        {meaningOptions(course, turnIndex, language).map(option => <button key={option.lineId} type="button" className="choice-btn" lang={language} onClick={() => pickMeaning(option.lineId)}>{option.meaning}</button>)}
      </fieldset>}
      {chosenLine && !ending && (() => {
        const line = course.lines.find(item => item.id === chosenLine);
        return line ? <div data-testid="practice-chosen" className="bubble bubble--help">
          <p className="bubble-text">{extra.chosenSay}<span lang="en">{line.text}</span></p>
          {line.id !== learner.id && <p className="bubble-sub">{extra.chosenScene}<span lang="en">{learner.text}</span></p>}
          <div className="bubble-actions"><button type="button" className="btn btn-tonal btn-small" onClick={() => playPartner(line.id)}><Icon name="play" size={18} />{tools.demo}</button></div>
        </div> : null;
      })()}
      {alternativesShown && !ending && <div data-testid="practice-alternatives" className="bubble bubble--help practice-alternatives" role="status">
        <p className="bubble-label">{c13.alsoSay}</p>
        <ul className="alt-list">{[{ text: learner.text, translations: learner.translations }, ...alternatives].map(item => <li key={item.text}>
          <span lang="en" className="alt-text">{item.text}</span>{item.translations?.[language] ? <span lang={language} className="bubble-sub">{item.translations[language]}</span> : null}</li>)}</ul>
        <div className="bubble-actions"><button type="button" className="btn btn-tonal btn-small" onClick={() => { setAlternativesShown(false); onHint(turnIndex); }}>{c13.seeModel}</button></div>
      </div>}
      {helpLevel > 0 && !reply && !ending && stage === 'idle' && <div data-testid="practice-auto-help" className="bubble bubble--help practice-help" role="status">
        {helpLevel === 1
          ? <p>{tools.helpStart}<span lang="en">{learner.text.split(/\s+/).slice(0, 3).join(' ')}…</span></p>
          : <><p>{tools.helpFull}<span lang="en">{learner.text}</span></p><div className="bubble-actions"><button type="button" className="btn btn-tonal btn-small" onClick={() => playPartner(learner.id)}><Icon name="play" size={18} />{tools.demo}</button></div></>}
      </div>}
      {reply && <>
        <div className="bubble bubble--me"><p data-testid="practice-heard">{copy.heard} <span lang="en">{reply.transcript}</span></p>
          {showModel && <p data-testid="practice-model-line" className="bubble-sub">{c12.modelLine}<span lang="en">{learner.text}</span></p>}
          <div data-testid="practice-self" className="bubble-tools">
            {selfUrl && <><audio data-testid="practice-self-audio" ref={selfAudio} src={selfUrl} preload="auto" hidden />
              <button type="button" className="chip-btn" disabled={busy} onClick={() => { audio.current?.pause(); stopPartner?.(); selfAudio.current?.play().catch(() => undefined); }}><Icon name="voice" size={18} />{c12.hearMe}</button></>}
            <button type="button" className="chip-btn" disabled={busy} onClick={() => { selfAudio.current?.pause(); audio.current?.pause(); setShowModel(true); playPartner(learner.id); }}><Icon name="play" size={18} />{c12.hearModel}</button>
          </div>
        </div>
        <div className="bubble bubble--partner">
          <p data-testid="practice-reply" lang="en" className="bubble-text">{reply.text}</p>
          {!reply.understood && <p data-testid="practice-clarify" className="bubble-sub" role="status">{quality.clarify}</p>}
          <div className="bubble-tools">{blocked
            ? <button type="button" className="btn btn-tonal btn-small" onClick={playReply}><Icon name="speaker" size={18} />{c12.tapToHear}</button>
            : <button type="button" className="icon-btn icon-btn--soft" aria-label={shell.playReply} onClick={playReply}><Icon name="play" /></button>}</div>
        </div>
        {showCoach && <div data-testid="practice-coach" className="coach-note" lang={language}>
          <p>{quality.coach}{reply.coachNote}</p>
          {feedback === 'saved'
            ? <p role="status">{quality.wrongSaved}</p>
            : <><button type="button" className="text-button" disabled={feedback === 'busy'} onClick={() => markWrong(reply.coachNote!)}>{quality.wrong}</button>{feedback === 'failed' && <p role="alert">{quality.wrongFailed}</p>}{feedback === 'offline' && <p role="alert">{extra.unsavedOffline}</p>}</>}
        </div>}
      </>}
    </div>
    {/* C12-4: one reply element for the whole visit, so the tap on "start" can unlock it for later replies. */}
    <audio data-testid="practice-reply-audio" ref={audio} src={reply?.src} preload="auto" hidden />
    {pendingGoal && !ending && <div data-testid="practice-goal-confirm" className="notice-card" role="group" aria-label={gaps.goalAsk(pendingGoal.summary)}>
      <p lang={language}>{gaps.goalAsk(pendingGoal.summary)}</p>
      <div className="bubble-actions"><button type="button" className="btn btn-tonal btn-small" onClick={confirmGoal}>{gaps.goalConfirm}</button><button type="button" className="btn btn-ghost btn-small" onClick={() => setPendingGoal(null)}>{gaps.goalKeep}</button></div>
    </div>}
    {ending && <section data-testid="practice-ending" className="practice-ending">
      <h3>{ending === 'done' ? quality.doneTitle : quality.endedTitle}</h3>
      <div data-testid="practice-review" className="practice-review">
        {(() => {
          const spoken = course.turns.filter((_, i) => answered.current[i] !== undefined).length;
          const small: [string, number][] = [[c11.small.hints, stats.current.hints], [c11.small.help, stats.current.autoHelp + stats.current.translations], [c11.small.native, stats.current.native ?? 0]];
          return <div data-testid="review-counts" className="review-counts">
            <p data-testid="review-spoken" className="review-spoken">{c11.spoken} <span className="review-spoken-figure"><strong data-testid="review-spoken-number" className="review-spoken-number">{spoken}</strong><span className="review-spoken-total">/{course.turns.length}</span></span></p>
            <ul className="review-small">{small.map(([label, n]) => <li key={label} data-testid="review-small">{label} <strong>{n}</strong></li>)}</ul>
          </div>;
        })()}
        <details data-testid="review-turns" className="review-turns">
          <summary><h4>{quality.reviewTitle}</h4><Icon name="chevron" size={18} /></summary>
          <ul className="review-turn-list">{course.turns.map((_, i) => <li key={i}>{answered.current[i] !== undefined ? `${quality.turnAnswered(i + 1, answered.current[i])} · ${outcomeLabel[outcomeOf(i)]}` : chosen.current[i] !== undefined ? extra.turnChosen(i + 1) : quality.turnSilent(i + 1)}</li>)}</ul>
          {/* C12-5: what the learner said next to the model line, side by side; nothing compares or judges them. */}
          {course.turns.map((item, i) => {
            const said = answered.current[i], model = course.lines.find(line => line.id === item.learnerLineId);
            return said !== undefined && model ? <div key={i} data-testid="review-compare" className="review-compare" role="group" aria-label={c12.turn(i + 1)}>
              <p className="review-compare-turn">{c12.turn(i + 1)}</p>
              <div className="review-compare-cell"><span className="review-compare-label">{c12.youSaid}</span><p data-testid="review-compare-said" lang="en">{said}</p></div>
              <div className="review-compare-cell"><span className="review-compare-label">{c12.model}</span><p data-testid="review-compare-model" lang="en">{model.text}</p>
                <button type="button" className="chip-btn review-compare-play" onClick={() => playPartner(model.id)}><Icon name="play" size={18} />{c12.hearModel}</button></div>
            </div> : null;
          })}
          <ul className="review-stat-list"><li>{quality.hints(stats.current.hints)}</li><li>{quality.autoHelp(stats.current.autoHelp)}</li><li>{quality.translations(stats.current.translations)}</li><li>{gaps.nativeCount(stats.current.native ?? 0)}</li><li>{quality.unknownTransfer}</li></ul>
          <p className="scene-note">{quality.reviewNote}</p>
        </details>
        {reviewSave === 'failed' && <p data-testid="practice-review-unsaved" role="status">{gaps.reviewUnsaved}</p>}
        {reviewSave === 'saved' && !previousReview && <p data-testid="practice-compare-first" className="scene-note">{gaps.compareFirst}</p>}
        {reviewSave === 'saved' && previousReview && <div className="practice-compare">
          <p data-testid="practice-compare-previous">{compareLine(gaps.previousReview, previousReview.turns.map(turn => turn.outcome))}</p>
          <p data-testid="practice-compare-current">{compareLine(gaps.thisReview, course.turns.map((_, i) => outcomeOf(i)))}</p>
          <p className="scene-note">{gaps.compareNote}</p>
        </div>}
      </div>
      {ending === 'ended' && <button type="button" className="text-button keep-going" onClick={() => setEnding(null)}>{quality.keepGoing}</button>}
      <ActionBar>
        <button type="button" className="btn btn-primary" onClick={practiseAgain}>{quality.again}</button>
        {onLeave && <button type="button" className="btn btn-ghost" onClick={onLeave}>{quality.back}</button>}
      </ActionBar>
    </section>}
    {!ending && <ActionBar className="action-bar--practice">
      <div className="practice-messages">
        {stage === 'recording' && <p role="status">{copy.listening}</p>}
        {stage === 'sending' && <p role="status">{copy.sending}</p>}
        {!online && <p id={offlineId} data-testid="practice-offline" role="status">{extra.practiceOffline}</p>}
        {limitReached && <p data-testid="practice-limit" role="status">{c12.dailyLimit}</p>}
        {notice && <p role={notice.kind}>{notice.key === 'paused' ? tools.paused : notice.key === 'offline' ? extra.practiceOffline : notice.key === 'staleGoal' ? gaps.goalStale
          : notice.key === 'quiet' || notice.key === 'micStuck' || notice.key === 'rateLimit' ? c12[notice.key] : copy[notice.key]}</p>}
        {showTip && <p data-testid="practice-tip" className="practice-tip">{shell.tipHint}</p>}
      </div>
      {canNext && stage !== 'recording' && <button type="button" className="btn btn-primary practice-next" onClick={nextTurn}>{copy.next}</button>}
      <div className="practice-controls">
        <button type="button" className="side-btn" disabled={stage === 'recording' || stage === 'sending'} onClick={() => {
          stats.current.hints++; helped.current[turnIndex] = true;
          // C13-3: first the course's own "you could also say" answers, without any model call; the model answer stays one tap away.
          if (alternatives.length && !alternativesShown) setAlternativesShown(true); else onHint(turnIndex);
        }}><span className="side-icon"><Icon name="bulb" /></span><span className="side-label">{copy.hint}</span></button>
        {stage === 'recording'
          ? <button ref={micButton} type="button" className="mic-btn is-recording" onClick={() => recorder.current?.stop()}><span className="mic-circle"><span className="mic-ring" aria-hidden="true" /><Icon name="stop" size={30} /></span><span className="mic-label">{copy.done}</span></button>
          : canNext
            ? <button ref={micButton} type="button" className="side-btn" disabled={busy || !online || limitReached} aria-describedby={!online ? offlineId : undefined} onClick={() => start('english')}><span className="side-icon"><Icon name="mic" /></span><span className="side-label">{copy.start}</span></button>
            : <button ref={micButton} type="button" className="mic-btn" disabled={busy || !online || limitReached} aria-describedby={!online ? offlineId : undefined} onClick={() => start('english')}><span className="mic-circle"><Icon name="mic" size={30} /></span><span className="mic-label">{copy.start}</span></button>}
        <button type="button" className="side-btn" data-testid="help-open" aria-haspopup="dialog" aria-expanded={helpOpen} disabled={stage === 'recording' || stage === 'sending'} onClick={() => setHelpOpen(true)}><span className="side-icon"><Icon name="help" /></span><span className="side-label">{shell.moreHelp}</span></button>
      </div>
    </ActionBar>}
    <Sheet open={helpOpen && !ending} onClose={() => setHelpOpen(false)} title={shell.moreHelp} testId="help-sheet" closeLabel={shell.close}>
      <div className="sheet-rows">
        <button type="button" className="sheet-row" disabled={busy || !online || limitReached} onClick={helpAction(() => void start('native'))}><Icon name="translate" />{gaps.nativeStart}</button>
        <button type="button" className="sheet-row" disabled={busy} aria-expanded={choosing} onClick={helpAction(() => { setChoosing(open => !open); setResumeChoice(false); })}><Icon name="help" />{extra.choose}</button>
        <button type="button" className="sheet-row" disabled={busy || thinking} onClick={helpAction(() => { setThinking(true); setHelpLevel(0); setResumeChoice(false); })}><Icon name="pause" />{extra.think}</button>
      </div>
      {remaining !== null && <p data-testid="practice-quota" className="sheet-note sheet-section">{c12.remaining(remaining)}</p>}
      <label className="switch-row sheet-section"><span>{tools.autoHelp}</span><input className="switch" type="checkbox" checked={autoHelp} onChange={event => changeAutoHelp(event.target.checked)} /></label>
    </Sheet>
    {more && <Sheet open={more.open} onClose={more.close} title={shellContext ? shell.more : shell.more} testId="more-sheet" closeLabel={shell.close} fallbackFocus={more.returnFocus}>
      {!ending && !setupOpen ? <section className="sheet-section"><h3 className="sheet-label">{shell.practiceSettings}</h3>{settings}</section> : null}
      <div className="sheet-rows">
        {!ending && <button type="button" className="sheet-row" disabled={busy} onClick={() => { more.close(); setEnding('ended'); }}><Icon name="flag" />{quality.end}</button>}
        {moreRows}
      </div>
      <section className="sheet-section sheet-about"><h3 className="sheet-label">{shell.howTo}</h3><p>{copy.intro}</p></section>
      {shellContext?.common({ meta, trial: true })}
    </Sheet>}
    <Sheet open={setupOpen && !ending} onClose={finishSetup} title={shell.setupTitle} testId="practice-setup" closeLabel={shell.close} fallbackFocus={micButton}>
      <p className="sheet-note">{shell.setupNote}</p>
      {setupOpen ? settings : null}
      <button type="button" className="btn btn-primary sheet-cta" data-testid="practice-setup-start" onClick={finishSetup}>{shell.setupStart}</button>
    </Sheet>
    <Sheet open={resumeChoice && !ending} onClose={() => setResumeChoice(false)} title={extra.resumeTitle} testId="practice-resume-sheet" closeLabel={shell.close} fallbackFocus={micButton}>
      <div data-testid="practice-resume" className="sheet-actions" role="group" aria-label={extra.resumeTitle}>
        <button type="button" className="btn btn-primary" onClick={() => { setResumeChoice(false); playPartner(partner.id); }}>{extra.resumeListen}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setResumeChoice(false)}>{extra.resumeContinue}</button>
      </div>
    </Sheet>
  </div>;
}
