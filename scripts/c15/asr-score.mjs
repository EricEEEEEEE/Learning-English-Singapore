// C15-1 scoring (free): meaning kept = every content word of the clip survives (case, hyphens and spacing aside);
// mixed Chinese: "kept" when the Chinese part is still in Chinese, "translated" when it is gone and Han text is gone too.
import { readFileSync } from 'node:fs';
import { clips, configs } from './asr-eval.mjs';
const results = JSON.parse(readFileSync('/mnt/project-files/les-c15/asr-eval/results.json', 'utf8'));
const norm = t => t.toLowerCase().replace(/[-,.?!。，、:;]/g, ' ').replace(/chilly/g, 'chili').replace(/\bok\b/g, 'okay'); // homophone spellings count as kept
const rows = [];
for (const config of configs) {
  let kept = 0, total = 0, hanKept = 0, hanTotal = 0, englishTurnedChinese = 0, silenceOk = null; const noiseText = []; const misses = [];
  for (const clip of clips) {
    const run = results.runs.find(r => r.config === config.id && r.clip === clip.id); if (!run) continue;
    const text = norm(run.text ?? '');
    if (clip.effect === 'silence' || clip.effect === 'noise-only') { if (/[\p{L}\p{N}]/u.test(text)) noiseText.push(clip.id); continue; }
    total++;
    const words = text.split(/\s+/);
    const ok = clip.meaning.every(w => w === 'paynow' ? /pay\s*now/.test(text) : words.includes(w) || text.includes(w));
    if (ok) kept++; else misses.push(clip.id);
    if (clip.han) { hanTotal++; if (run.text.includes(clip.han) || /[\p{Script=Han}]/u.test(run.text) && clip.han.split('').some(c => run.text.includes(c))) hanKept++; }
    if (clip.han && clip.meaning.some(w => !text.includes(w))) englishTurnedChinese++;
  }
  rows.push({ config: config.id, model: config.model, language: config.language ?? 'auto', prompt: config.prompt, meaningKept: `${kept}/${total}`, misses: misses.join(' '), chineseKept: `${hanKept}/${hanTotal}`, mixedEnglishLost: englishTurnedChinese, silenceText: noiseText.length ? noiseText.join(' ') : 'none' });
}
console.table(rows);
