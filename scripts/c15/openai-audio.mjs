// C15-1 / C15-3 helpers: one TTS or transcription request each, never retried. TTS uses stream_format "sse" only
// because the final event reports the real token usage, which the ledger settles on. Keys come from the environment
// and are never logged or written anywhere.
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PRICES } from './ledger.mjs';

const key = () => { const k = process.env.OPENAI_API_KEY; if (!k) throw new Error('OPENAI_API_KEY missing'); return k; };
export const TTS_MODEL = 'gpt-4o-mini-tts-2025-12-15'; // the snapshot lib/generated-audio.ts uses

// Worst case for one short line: 60 s of audio at a generous 50 audio tokens a second, plus the text.
export const ttsReserve = text => ((text.length + 400) * PRICES['gpt-4o-mini-tts'].textInput + 3000 * PRICES['gpt-4o-mini-tts'].audioOutput) / 1e6;
export const ttsCost = usage => (usage.input_tokens * PRICES['gpt-4o-mini-tts'].textInput + usage.output_tokens * PRICES['gpt-4o-mini-tts'].audioOutput) / 1e6;

export async function tts({ text, voice, instructions, format = 'mp3' }) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({ model: TTS_MODEL, voice, input: text, response_format: format, stream_format: 'sse', ...(instructions ? { instructions } : {}) }),
  });
  if (!response.ok) throw new Error(`tts http ${response.status}`);
  const events = (await response.text()).split('\n').filter(l => l.startsWith('data:') && !l.includes('[DONE]')).map(l => JSON.parse(l.slice(5)));
  const done = events.find(e => e.type === 'speech.audio.done');
  const bytes = Buffer.concat(events.filter(e => e.type === 'speech.audio.delta').map(e => Buffer.from(e.audio, 'base64')));
  return { bytes, usage: done?.usage ?? null };
}

export const probeDuration = path => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path]).toString().trim());

// Transcription price: booked at the higher of the token prices (gpt-4o models) or the per-minute estimate.
const TRANSCRIBE = {
  'gpt-4o-mini-transcribe': { audio: 3.00, text: 1.25, output: 5.00, perMinute: 0.003 },
  'gpt-4o-transcribe': { audio: 6.00, text: 2.50, output: 10.00, perMinute: 0.006 },
  'whisper-1': { perMinute: 0.006 },
};
export const transcribeReserve = (model, seconds, promptChars = 0) => Math.max(seconds, 1) / 60 * TRANSCRIBE[model].perMinute * 4 + (promptChars + 200) * 3 / 1e6 + 0.0002;
export function transcribeCost(model, seconds, usage) {
  const p = TRANSCRIBE[model], byMinute = Math.max(seconds, 1) / 60 * p.perMinute;
  if (!usage || usage.type !== 'tokens') return byMinute;
  const audio = usage.input_token_details?.audio_tokens ?? usage.input_tokens, text = usage.input_token_details?.text_tokens ?? 0;
  return Math.max(byMinute, (audio * p.audio + text * p.text + usage.output_tokens * p.output) / 1e6);
}

// Same form fields as lib/practice-providers.ts transcribeSpeech, with language and prompt made optional for the study.
export async function transcribe({ path, mimeType = 'audio/wav', model = 'gpt-4o-mini-transcribe', language, prompt }) {
  const form = new FormData();
  form.set('model', model);
  if (language) form.set('language', language);
  if (prompt) form.set('prompt', prompt);
  form.set('response_format', 'json');
  form.set('file', new Blob([readFileSync(path)], { type: mimeType }), 'answer.' + (mimeType.split('/')[1] ?? 'wav'));
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key()}` }, body: form, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`transcribe http ${response.status}`);
  const body = await response.json();
  return { text: typeof body.text === 'string' ? body.text.trim() : '', usage: body.usage ?? null };
}

// Writes the TTS bytes as the requested container; SSE deltas may come as raw 24 kHz 16-bit mono PCM.
export function saveAudio(bytes, path) {
  const head = bytes.subarray(0, 4).toString('latin1');
  const mp3 = head.startsWith('ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (head === 'RIFF' || mp3) {
    if (path.endsWith('.mp3') === mp3) { writeFileSync(path, bytes); return; }
  }
  const dir = mkdtempSync(join(tmpdir(), 'les-c15-')), raw = join(dir, head === 'RIFF' ? 'in.wav' : mp3 ? 'in.mp3' : 'in.pcm');
  writeFileSync(raw, bytes);
  const input = raw.endsWith('.pcm') ? ['-f', 's16le', '-ar', '24000', '-ac', '1', '-i', raw] : ['-i', raw];
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...input, path]);
}
