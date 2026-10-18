// C15-1 (paid, user-approved 2026-10-18, cap USD0.5): a SYNTHETIC PROXY transcription study. There are no consented
// volunteer recordings yet, so every clip is gpt-4o-mini-tts speech asked to imitate an accent; it cannot stand in
// for real learners' voices. Compares gpt-4o-mini-transcribe with and without language='en' and with and without a
// lesson keyword prompt (proper nouns and local words only, never a model answer), plus gpt-4o-transcribe and
// whisper-1 on the product setting. Every request is reserved first and made once.
// Run: OPENAI_API_KEY="$OPEN_API_KEY" NODE_USE_ENV_PROXY=1 node --no-warnings scripts/c15/asr-eval.mjs clips|transcribe
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { openLedger } from './ledger.mjs';
import { tts, ttsCost, ttsReserve, saveAudio, probeDuration, transcribe, transcribeCost, transcribeReserve } from './openai-audio.mjs';

const ITEM = 'C15-1';
const dir = '/mnt/project-files/les-c15/asr-eval', clipsDir = join(dir, 'clips');
mkdirSync(clipsDir, { recursive: true });
const ledger = openLedger();

const keywords = {
  hawker: 'Singapore words in this lesson: Hainanese chicken rice, kopi-O, kosong, Milo, PayNow, aunty.',
  clinic: 'Singapore words in this lesson: polyclinic, MC, Medisave, queue number.',
  office: 'Singapore words in this lesson: work pass, MOM, ICA, appointment letter.',
  home: 'Singapore words in this lesson: HDB, MRT, Tampines, PCF, block.',
};
const accent = {
  sg: 'Speak as a Singaporean adult speaking everyday Singapore English, with a natural local accent and rhythm. Not exaggerated.',
  in: 'Speak as an adult from India who speaks English with a natural Indian accent. Not exaggerated.',
  id: 'Speak as an Indonesian adult who is a beginner in English, with a natural Indonesian accent. Speak a little slowly.',
  ja: 'Speak as a Japanese adult who is a beginner in English, with a natural Japanese accent. Speak a little slowly.',
  ko: 'Speak as a Korean adult who is a beginner in English, with a natural Korean accent. Speak a little slowly.',
  zh: 'Speak as a Mandarin Chinese speaker from China who is a beginner in English, with a natural Chinese accent. Read Chinese words in Mandarin and English words in English.',
  hesitant: 'Speak as a nervous beginner learner with a Chinese accent: slow, with long pauses and an "uh" between words.',
};
// ref: what was said; meaning: content words that must survive; han: Chinese part that should stay Chinese.
export const clips = [
  { id: 'c01', lesson: 'hawker', voice: 'marin', accent: 'sg', text: 'One chicken rice, please.', meaning: ['one', 'chicken', 'rice'] },
  { id: 'c02', lesson: 'hawker', voice: 'cedar', accent: 'sg', text: 'Steamed, a little chili.', meaning: ['steamed', 'little', 'chili'] },
  { id: 'c03', lesson: 'hawker', voice: 'coral', accent: 'sg', text: 'Can pay by PayNow or not?', meaning: ['pay', 'paynow'] },
  { id: 'c04', lesson: 'hawker', voice: 'ash', accent: 'sg', text: 'Aunty, kopi-O kosong, one.', meaning: ['kopi', 'kosong', 'one'] },
  { id: 'c05', lesson: 'home', voice: 'sage', accent: 'in', text: 'I stay in Tampines, near the MRT.', meaning: ['tampines', 'mrt'] },
  { id: 'c06', lesson: 'home', voice: 'onyx', accent: 'in', text: 'My HDB flat is at block two three five.', meaning: ['hdb', 'block', '235'] },
  { id: 'c07', lesson: 'clinic', voice: 'shimmer', accent: 'id', text: 'I have a cough for three days.', meaning: ['cough', 'three', 'days'] },
  { id: 'c08', lesson: 'clinic', voice: 'echo', accent: 'id', text: 'Is the polyclinic open on Sunday?', meaning: ['polyclinic', 'open', 'sunday'] },
  { id: 'c09', lesson: 'clinic', voice: 'nova', accent: 'ja', text: 'Yes.', meaning: ['yes'] },
  { id: 'c10', lesson: 'hawker', voice: 'verse', accent: 'sg', text: 'Can.', meaning: ['can'] },
  { id: 'c11', lesson: 'office', voice: 'ballad', accent: 'ko', text: 'No, thank you.', meaning: ['no', 'thank'] },
  { id: 'c12', lesson: 'home', voice: 'coral', accent: 'ko', text: 'My son goes to PCF kindergarten.', meaning: ['son', 'pcf', 'kindergarten'] },
  { id: 'c13', lesson: 'office', voice: 'fable', accent: 'ja', text: 'I want to collect my work pass card.', meaning: ['collect', 'work', 'pass', 'card'] },
  { id: 'c14', lesson: 'hawker', voice: 'marin', accent: 'zh', text: '我想要 less chili, please.', meaning: ['less', 'chili'], han: '我想要' },
  { id: 'c15', lesson: 'hawker', voice: 'cedar', accent: 'zh', text: 'One kopi, 不要糖.', meaning: ['one', 'kopi'], han: '不要糖' },
  { id: 'c16', lesson: 'hawker', voice: 'sage', accent: 'zh', text: 'Excuse me, 这个多少钱?', meaning: ['excuse'], han: '多少钱' },
  { id: 'c17', lesson: 'office', voice: 'ash', accent: 'zh', text: '我忘记带 passport 了.', meaning: ['passport'], han: '忘记' },
  { id: 'c18', lesson: 'clinic', voice: 'nova', accent: 'zh', text: 'Okay.', meaning: ['okay'] },
  { id: 'c19', lesson: 'hawker', from: 'c01', effect: 'noise', text: 'One chicken rice, please.', meaning: ['one', 'chicken', 'rice'] },
  { id: 'c20', lesson: 'clinic', from: 'c07', effect: 'noise', text: 'I have a cough for three days.', meaning: ['cough', 'three', 'days'] },
  { id: 'c21', lesson: 'home', from: 'c05', effect: 'slow', text: 'I stay in Tampines, near the MRT.', meaning: ['tampines', 'mrt'] },
  { id: 'c22', lesson: 'office', from: 'c13', effect: 'slow', text: 'I want to collect my work pass card.', meaning: ['collect', 'work', 'pass', 'card'] },
  { id: 'c23', lesson: 'hawker', voice: 'echo', accent: 'hesitant', text: 'Uh... I... want... chicken... rice.', meaning: ['want', 'chicken', 'rice'] },
  { id: 'c24', lesson: 'hawker', effect: 'silence', text: '', meaning: [] },
  { id: 'c25', lesson: 'hawker', from: 'c04', effect: 'noise', text: 'Aunty, kopi-O kosong, one.', meaning: ['kopi', 'kosong', 'one'] },
  // Noise-only clips (no speech): does a keyword prompt get echoed back as if the learner said it?
  { id: 'c27', lesson: 'clinic', effect: 'noise-only', source: 'anoisesrc=color=pink:amplitude=0.08:sample_rate=24000', seconds: 3, text: '', meaning: [] },
  { id: 'c28', lesson: 'office', effect: 'noise-only', source: 'anoisesrc=color=brown:amplitude=0.2:sample_rate=24000', seconds: 2, text: '', meaning: [] },
  { id: 'c29', lesson: 'home', effect: 'noise-only', source: 'sine=frequency=100:sample_rate=24000', seconds: 2, text: '', meaning: [] },
  { id: 'c30', lesson: 'hawker', effect: 'noise-only', source: 'anoisesrc=color=white:amplitude=0.02:sample_rate=24000', seconds: 1, text: '', meaning: [] },
  { id: 'c26', lesson: 'home', voice: 'shimmer', accent: 'zh', text: '我住在 Tampines, block 235.', meaning: ['tampines', 'block', '235'], han: '我住在' },
];

const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
const resultsFile = join(dir, 'results.json');
const results = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : { clips: {}, runs: [] };
const save = () => writeFileSync(resultsFile, JSON.stringify(results, null, 2));

if (process.argv[2] === 'clips') {
  for (const clip of clips) {
    const out = join(clipsDir, `${clip.id}.wav`);
    if (existsSync(out)) continue;
    if (clip.effect === 'noise-only') { ff('-f', 'lavfi', '-i', clip.source, '-t', String(clip.seconds), '-ac', '1', out); }
    else if (clip.effect === 'silence') { ff('-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.003:sample_rate=24000', '-t', '3', '-ac', '1', out); }
    else if (clip.from) {
      const src = join(clipsDir, `${clip.from}.wav`);
      // Babble-like pink noise about 10 dB under the speech, or 0.8x speed with the pitch kept.
      if (clip.effect === 'noise') ff('-i', src, '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.08:sample_rate=24000', '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first:normalize=0', '-ac', '1', out);
      else ff('-i', src, '-filter:a', 'atempo=0.8', out);
    } else {
      const hold = ledger.reserve(ITEM, `tts ${clip.id}`, ttsReserve(clip.text + accent[clip.accent]));
      try {
        const { bytes, usage } = await tts({ text: clip.text, voice: clip.voice, instructions: accent[clip.accent], format: 'wav' });
        if (usage) hold.settle(ttsCost(usage), usage); else hold.unknown('no usage');
        saveAudio(bytes, out);
      } catch (e) { hold.unknown(e.message); console.error(clip.id, e.message); break; }
    }
    results.clips[clip.id] = { seconds: probeDuration(out) }; save();
    console.log(clip.id, results.clips[clip.id].seconds);
  }
}

export const configs = [
  { id: 'A', model: 'gpt-4o-mini-transcribe', language: 'en', prompt: false, note: 'current product setting' },
  { id: 'B', model: 'gpt-4o-mini-transcribe', language: null, prompt: false },
  { id: 'C', model: 'gpt-4o-mini-transcribe', language: 'en', prompt: true },
  { id: 'D', model: 'gpt-4o-mini-transcribe', language: null, prompt: true },
  { id: 'E', model: 'gpt-4o-transcribe', language: 'en', prompt: false },
  { id: 'F', model: 'whisper-1', language: 'en', prompt: false },
];
if (process.argv[2] === 'transcribe') {
  outer: for (const config of configs) {
    for (const clip of clips) {
      if (results.runs.some(r => r.config === config.id && r.clip === clip.id)) continue;
      const path = join(clipsDir, `${clip.id}.wav`), seconds = results.clips[clip.id]?.seconds ?? probeDuration(path);
      const prompt = config.prompt ? keywords[clip.lesson] : undefined;
      let hold;
      try { hold = ledger.reserve(ITEM, `stt ${config.id} ${clip.id}`, transcribeReserve(config.model, seconds, prompt?.length ?? 0)); }
      catch (e) { console.error(e.message); break outer; }
      try {
        const { text, usage } = await transcribe({ path, model: config.model, language: config.language ?? undefined, prompt });
        hold.settle(transcribeCost(config.model, seconds, usage), usage);
        results.runs.push({ config: config.id, clip: clip.id, text }); save();
        console.log(config.id, clip.id, JSON.stringify(text));
      } catch (e) { hold.unknown(e.message); results.runs.push({ config: config.id, clip: clip.id, error: e.message }); save(); console.error(config.id, clip.id, e.message); }
    }
  }
}
console.log(`${ITEM} spent so far USD ${ledger.total(ITEM).toFixed(6)}`);
