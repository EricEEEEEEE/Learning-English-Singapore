'use client';

import { useEffect, useRef, useState } from 'react';
import type { EntryLanguage } from './entry-copy';
import { listenToolsCopy } from './listen-tools-copy';

type Line = { id: string; text: string; translations?: Partial<Record<EntryLanguage, string>> };
type PracticeCourse = { id: string; revision: number; materialsRevision?: number; lines: Line[]; turns: { partnerLineId: string; learnerLineId: string }[] };
type History = { learner: string; partner: string }[];
type Reply = { transcript: string; text: string; src: string };
// Kept by the course page so a detour to the hint page does not lose the conversation so far.
export type PracticeMemory = { turnIndex: number; history: History; reply: Reply | null };
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
const HELP_DELAY_MS = 6000;
const AUTO_HELP_KEY = 'les.practice.autoHelp';
function readAutoHelp() { try { return window.localStorage.getItem(AUTO_HELP_KEY) !== 'off'; } catch { return true; } }

async function toBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// One spoken exchange at a time: the microphone opens only on an explicit start, the turn is sent once when the
// learner says they are done, and every failure waits for the learner instead of retrying.
export default function ScenePractice({ course, language, startTurn, onHint, playPartner, memory, mediaBusy = false }: { course: PracticeCourse; language: EntryLanguage; startTurn: number; onHint: (turnIndex: number) => void; playPartner: (lineId: string, rate?: number) => void; memory?: PracticeMemory; mediaBusy?: boolean }) {
  const copy = scenePracticeCopy[language];
  const tools = listenToolsCopy[language];
  const [turnIndex, setTurnIndex] = useState(startTurn);
  const [stage, setStage] = useState<'idle' | 'opening' | 'recording' | 'sending'>('idle');
  const [notice, setNotice] = useState<{ kind: 'status' | 'alert'; key: keyof Copy | 'paused' } | null>(null);
  const [reply, setReply] = useState<Reply | null>(memory && memory.turnIndex === startTurn ? memory.reply : null);
  const [history, setHistory] = useState<History>(memory?.history ?? []);
  const [autoHelp, setAutoHelp] = useState(readAutoHelp);
  const [helpLevel, setHelpLevel] = useState(0);
  const [partnerHelp, setPartnerHelp] = useState(false);
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
  if (memory) { memory.turnIndex = turnIndex; memory.history = history; memory.reply = reply; }

  function release() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (recorder.current?.state === 'recording') recorder.current.stop(); release(); };
  }, []);
  useEffect(() => { if (reply && freshReply.current) { freshReply.current = false; audio.current?.play().catch(() => {}); } }, [reply]);
  // Silence after the partner has finished earns help: first how to begin, then the whole answer with a model.
  // Nothing is offered while the partner is still talking, while the learner is speaking, or once they answered.
  useEffect(() => {
    if (!autoHelp || stage !== 'idle' || reply || helpLevel >= 2 || mediaBusy) return;
    const id = setTimeout(() => { if (document.visibilityState !== 'hidden') setHelpLevel(level => level + 1); }, HELP_DELAY_MS);
    return () => clearTimeout(id);
  }, [autoHelp, stage, reply, helpLevel, mediaBusy, turnIndex]);
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

  async function start() {
    setNotice(null); setReply(null); setHelpLevel(0); discard.current = false; setStage('opening');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const type = AUDIO_TYPES.find(t => MediaRecorder.isTypeSupported?.(t));
      const rec = new MediaRecorder(media, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      rec.onstop = () => {
        release();
        if (discard.current) { discard.current = false; if (mounted.current) { setStage('idle'); setNotice({ kind: 'status', key: 'paused' }); } return; }
        void send(new Blob(chunks, { type: rec.mimeType || type || '' }));
      };
      recorder.current = rec;
      rec.start();
      timer.current = setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, MAX_RECORDING_MS);
      setStage('recording');
    } catch {
      release(); setStage('idle'); setNotice({ kind: 'alert', key: 'mic' });
    }
  }

  async function send(blob: Blob) {
    if (!mounted.current) return;
    const mimeType = blob.type.split(';')[0];
    if (!blob.size) { setStage('idle'); setNotice({ kind: 'status', key: 'silence' }); return; }
    if (blob.size > MAX_AUDIO_BYTES) { setStage('idle'); setNotice({ kind: 'alert', key: 'tooLong' }); return; }
    if (!AUDIO_TYPES.includes(mimeType)) { setStage('idle'); setNotice({ kind: 'alert', key: 'mic' }); return; }
    setStage('sending');
    try {
      const response = await fetch('/api/practice-turn', {
        method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ courseId: course.id, revision: course.revision, ...(course.materialsRevision !== undefined ? { materialsRevision: course.materialsRevision } : {}), turnIndex, language, history, mimeType, audioBase64: await toBase64(blob) }),
      });
      const data = await response.json().catch(() => null);
      if (!mounted.current) return;
      if (!response.ok) { setNotice({ kind: 'alert', key: errorKey[response.status] ?? 'failed' }); return; }
      if (data?.kind === 'silence') { setNotice({ kind: 'status', key: 'silence' }); return; }
      const r = data?.reply;
      if (data?.kind !== 'reply' || typeof data.transcript !== 'string' || typeof r?.text !== 'string' || typeof r.audioBase64 !== 'string' || !/^audio\/[a-z0-9.+-]+$/.test(r.mimeType)) { setNotice({ kind: 'alert', key: 'failed' }); return; }
      freshReply.current = true;
      setReply({ transcript: data.transcript, text: r.text, src: `data:${r.mimeType};base64,${r.audioBase64}` });
      setHistory(previous => [...previous, { learner: data.transcript.slice(0, 500), partner: r.text.slice(0, 500) }].slice(-10));
    } catch {
      if (mounted.current) setNotice({ kind: 'alert', key: 'failed' });
    } finally {
      if (mounted.current) setStage('idle');
    }
  }

  function nextTurn() {
    const next = turnIndex + 1;
    setTurnIndex(next); setReply(null); setNotice(null); setHelpLevel(0); setPartnerHelp(false);
    playPartner(course.turns[next].partnerLineId);
  }

  const busy = stage !== 'idle';
  return <div data-testid="scene-panel-5">
    <p>{copy.intro}</p>
    <article className="scene-card"><p data-testid="practice-partner" lang="en">{partner.text}</p>
      {partnerHelp && <p data-testid="partner-help" lang={language}>{partner.translations?.[language]}</p>}
      <div className="scene-actions"><button type="button" disabled={busy} onClick={() => playPartner(partner.id)}>{copy.replay}</button><button type="button" disabled={busy} onClick={() => playPartner(partner.id, 0.75)}>{tools.slower}</button><button type="button" onClick={() => setPartnerHelp(open => !open)}>{partnerHelp ? tools.helpClose : tools.help}</button></div>
    </article>
    <div className="scene-actions">
      {stage === 'recording'
        ? <button type="button" className="guide-primary" onClick={() => recorder.current?.stop()}>{copy.done}</button>
        : <button type="button" className="guide-primary" disabled={busy} onClick={start}>{copy.start}</button>}
      <button type="button" disabled={stage === 'recording' || stage === 'sending'} onClick={() => onHint(turnIndex)}>{copy.hint}</button>
    </div>
    {stage === 'recording' && <p role="status">{copy.listening}</p>}
    {stage === 'sending' && <p role="status">{copy.sending}</p>}
    {notice && <p role={notice.kind}>{notice.key === 'paused' ? tools.paused : copy[notice.key]}</p>}
    {helpLevel > 0 && !reply && stage === 'idle' && <div data-testid="practice-auto-help" className="scene-card practice-help" role="status">
      {helpLevel === 1
        ? <p>{tools.helpStart}<span lang="en">{learner.text.split(/\s+/).slice(0, 3).join(' ')}…</span></p>
        : <><p>{tools.helpFull}<span lang="en">{learner.text}</span></p><button type="button" onClick={() => playPartner(learner.id)}>{tools.demo}</button></>}
    </div>}
    <label className="practice-help"><input type="checkbox" checked={autoHelp} onChange={event => changeAutoHelp(event.target.checked)} /> {tools.autoHelp}</label>
    {reply && <article className="scene-card">
      <p data-testid="practice-heard">{copy.heard} <span lang="en">{reply.transcript}</span></p>
      <p data-testid="practice-reply" lang="en">{reply.text}</p>
      <audio data-testid="practice-reply-audio" ref={audio} src={reply.src} controls />
    </article>}
    {reply && turnIndex < course.turns.length - 1 && <div className="scene-actions"><button type="button" onClick={nextTurn}>{copy.next}</button></div>}
  </div>;
}
