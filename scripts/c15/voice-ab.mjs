// C15-3 (paid, user-approved 2026-10-18, cap < USD0.1): the same 20 partner lines in gpt-4o-mini-tts twice, with the
// same voice: version "plain" asks only for slow, clear speech; version "sg" is the product instruction from
// lib/generated-audio.ts, which adds "a natural Singapore English accent". Files get blind labels X/Y per line; the
// key is kept apart for the organiser. Then both versions are transcribed back once (product setting) as a rough
// intelligibility check. Azure en-SG is not part of this run (no Azure Speech key: blocked).
// Run: OPENAI_API_KEY="$OPEN_API_KEY" NODE_USE_ENV_PROXY=1 node --no-warnings scripts/c15/voice-ab.mjs tts|transcribe|sheet
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { openLedger } from './ledger.mjs';
import { tts, ttsCost, ttsReserve, saveAudio, probeDuration, transcribe, transcribeCost, transcribeReserve } from './openai-audio.mjs';

const ITEM = 'C15-3';
const dir = '/mnt/project-files/les-c15/voice-ab', work = join(dir, 'organiser-only');
mkdirSync(work, { recursive: true });
const ledger = openLedger();

export const INSTRUCTIONS = {
  plain: 'Speak slowly and clearly for an adult English beginner. Be respectful and conversational, never exaggerated. Read only the supplied line.',
  // Exactly the product instruction (lib/generated-audio.ts requestSpeech).
  sg: 'Speak slowly and clearly for an adult English beginner, with a natural Singapore English accent. Be respectful and conversational, never exaggerated. Read only the supplied line.',
};
export const lines = [
  ['marin', 'Hi, what would you like today? Chicken rice or noodles?'],
  ['cedar', 'Steamed or roasted chicken? You want chili or not?'],
  ['marin', 'Eat here or take away? Take away is twenty cents more.'],
  ['cedar', 'Four fifty. You can pay by PayNow or cash.'],
  ['marin', 'One kopi-O kosong, coming right up.'],
  ['cedar', 'Good morning. Do you have an appointment at the polyclinic today?'],
  ['marin', 'Please take a queue number and wait for your turn.'],
  ['cedar', 'The doctor will see you soon. Please have a seat over there.'],
  ['marin', 'Today the clinic is a bit crowded, so maybe wait around one hour, can?'],
  ['cedar', 'Excuse me, this train goes to Tampines. You need to change at Tanah Merah.'],
  ['marin', 'Tap your card here when you go in and when you come out.'],
  ['cedar', 'Your HDB block is number two three five, the lift is on the left.'],
  ['marin', 'Good afternoon. Are you here to pick up your child from class?'],
  ['cedar', 'He settled in quite well this week. He likes the reading corner.'],
  ['marin', 'Please sign here and bring the form back by Friday.'],
  ['cedar', 'Good morning. How can I help you at the service centre today?'],
  ['marin', 'Do you have your appointment letter and your passport?'],
  ['cedar', 'Thank you. Please take this number and wait to be called.'],
  ['marin', 'No problem lah, just let me know if you need anything.'],
  ['cedar', 'Okay, see you next week. Take care, ya.'],
];

const keyFile = join(work, 'key.json');
// Blind order: a fixed hash of the line decides which version is X (reproducible, not guessable from the file name).
const xIsSg = i => createHash('sha256').update(`c15-3-${i}-${lines[i][1]}`).digest()[0] % 2 === 0;
const key = existsSync(keyFile) ? JSON.parse(readFileSync(keyFile, 'utf8')) : { items: [] };
const saveKey = () => writeFileSync(keyFile, JSON.stringify(key, null, 2));

if (process.argv[2] === 'tts') {
  for (let i = 0; i < lines.length; i++) {
    const [voice, text] = lines[i], n = String(i + 1).padStart(2, '0');
    for (const version of ['plain', 'sg']) {
      const label = (version === 'sg') === xIsSg(i) ? 'X' : 'Y', out = join(dir, `line${n}-${label}.mp3`);
      if (existsSync(out)) continue;
      let hold;
      try { hold = ledger.reserve(ITEM, `tts line${n} ${version}`, ttsReserve(text + INSTRUCTIONS[version])); } catch (e) { console.error(e.message); process.exit(1); }
      try {
        const { bytes, usage } = await tts({ text, voice, instructions: INSTRUCTIONS[version], format: 'mp3' });
        if (usage) hold.settle(ttsCost(usage), usage); else hold.unknown('no usage');
        saveAudio(bytes, out);
        key.items = key.items.filter(k => !(k.line === i + 1 && k.version === version));
        key.items.push({ line: i + 1, label, version, voice, text, seconds: probeDuration(out), file: `line${n}-${label}.mp3` }); saveKey();
        console.log(n, label, version, key.items.at(-1).seconds);
      } catch (e) { hold.unknown(e.message); console.error(n, version, e.message); process.exit(1); }
    }
  }
}
if (process.argv[2] === 'transcribe') {
  for (const item of key.items) {
    if (item.heard !== undefined) continue;
    let hold;
    try { hold = ledger.reserve(ITEM, `stt ${item.file}`, transcribeReserve('gpt-4o-mini-transcribe', item.seconds)); } catch (e) { console.error(e.message); break; }
    try {
      const { text, usage } = await transcribe({ path: join(dir, item.file), mimeType: 'audio/mpeg', language: 'en' });
      hold.settle(transcribeCost('gpt-4o-mini-transcribe', item.seconds, usage), usage);
      item.heard = text; saveKey(); console.log(item.file, item.version, JSON.stringify(text));
    } catch (e) { hold.unknown(e.message); item.heard = null; saveKey(); console.error(item.file, e.message); }
  }
}
if (process.argv[2] === 'sheet') {
  // One row per listener per line; the listener plays X and Y and scores each 1-5 on three questions.
  const header = 'listener_id,line,text,version_label,sounds_local_1to5,easy_to_understand_1to5,not_exaggerated_1to5,prefer_X_or_Y_or_same,comment';
  const rows = [];
  for (let i = 0; i < lines.length; i++) for (const label of ['X', 'Y']) rows.push(['', i + 1, `"${lines[i][1].replace(/"/g, '""')}"`, label, '', '', '', label === 'X' ? '' : '-', ''].join(','));
  writeFileSync(join(dir, 'rating-sheet.csv'), [header, ...rows].join('\n') + '\n');
  writeFileSync(join(work, 'key.csv'), ['line,label,version,voice,seconds,heard_back', ...key.items.sort((a, b) => a.line - b.line || a.label.localeCompare(b.label)).map(k => [k.line, k.label, k.version, k.voice, k.seconds, `"${(k.heard ?? '').replace(/"/g, '""')}"`].join(','))].join('\n') + '\n');
  console.log('sheet written');
}
console.log(`${ITEM} spent so far USD ${ledger.total(ITEM).toFixed(6)}`);
