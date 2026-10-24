import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// C15-4i (2026-10-24): hawker attempt 9 passed every gate on all three segments, then the product's own final check
// refused the assembled lesson. The lesson length (19.35 + 12.35 + 16.458333 = 48.158333 s) is not a whole number of
// 24 fps frames; the assembly kept a last frame that started before the end and so ran the picture to 48.1667 s, and
// the container length (48.1667) missed the planned 48.1583 by more than the 1 ms the final check allows. Attempt 7
// passed only because its length (57.375 s) happened to be whole frames. The picture now stops at the last whole
// frame inside the planned length (never longer); the audio keeps the exact length, with and without cross-fades.
const ffmpeg = '/usr/bin/ffmpeg', ffprobe = '/usr/bin/ffprobe';
const scratch = mkdtempSync(join(tmpdir(), 'les-c15-4i-'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// A segment as the repair step leaves it (attempt 9 measured): whole 24 fps frames of picture, audio of the spoken
// length, and the file as long as the longer of the two (19.35 s audio over 464 frames; 395 frames over 16.45 s audio).
function segment(name, color, frames, audioSeconds) {
  const file = join(scratch, `${name}.mp4`);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=72x128:r=24`, '-f', 'lavfi', '-i', `sine=frequency=400:sample_rate=24000:duration=${audioSeconds}`,
    '-frames:v', String(frames), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', file]);
  const bytes = readFileSync(file);
  return { bytes, sha256: sha(bytes) };
}
function probe(bytes) {
  const file = join(mkdtempSync(join(scratch, 'out-')), 'v.mp4');
  writeFileSync(file, bytes);
  const report = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const stream = type => Number(report.streams.find(s => s.codec_type === type).duration);
  return { format: Number(report.format.duration), video: stream('video'), audio: stream('audio') };
}

for (const crossfade of [false, true]) test(`C15-4i assembly: a lesson that is not whole frames long keeps its planned length${crossfade ? ' with a cross-fade' : ''}`, async () => {
  const { concatVideoBytes } = await import('../../lib/concat-video-bytes.ts');
  // 32 frames under 1.35 s of audio, then 25 frames (1.041667 s) over 1.0 s of audio: 2.391667 s, not whole frames.
  const planned = 1.35 + 25 / 24;
  const inputs = [segment(`a-${crossfade}`, 'black', 32, 1.35), segment(`b-${crossfade}`, 'white', 25, 1.0)];
  const joined = await concatVideoBytes(inputs, { executable: ffmpeg, normalizeDuration: planned, ...(crossfade ? { crossfadeAt: [1.35] } : {}) });
  const measured = probe(joined.bytes);
  // The same bounds the final check (validateFinalVideoProbe) applies to the assembled lesson.
  expect(Math.abs(measured.format - planned)).toBeLessThanOrEqual(0.001001);
  expect(measured.video).toBeLessThanOrEqual(planned + 0.001);
  expect(planned - measured.video).toBeLessThanOrEqual(1 / 24 + 0.001001);
  expect(Math.abs(measured.audio - planned)).toBeLessThanOrEqual(1024 / 24000 * 2 + 0.001001);
});

test('C15-4i assembly: a whole-frame lesson keeps every frame (no frame is dropped when the length divides evenly)', async () => {
  const { concatVideoBytes } = await import('../../lib/concat-video-bytes.ts');
  const inputs = [segment('c', 'black', 24, 1.0), segment('d', 'white', 24, 1.0)];
  const measured = probe((await concatVideoBytes(inputs, { executable: ffmpeg, normalizeDuration: 2, crossfadeAt: [1] })).bytes);
  expect(Math.abs(measured.video - 2)).toBeLessThanOrEqual(0.001001);
  expect(Math.abs(measured.format - 2)).toBeLessThanOrEqual(0.001001);
});

// The real attempt 9 segments (after the product's own audio restore), copied from its task store. The shared folder adds
// its own uuid box to mp4 files after copying, so the bytes are not pinned by hash; the streams are unchanged.
const realDir = '/mnt/project-files/les-c15/video';
const realFiles = [0, 1, 2].map(i => join(realDir, `hawker-ltx-2-3-pro-a9-seg${i}.mp4`));
for (const crossfade of [false, true]) test(`C15-4i assembly: the real attempt 9 lesson passes the product's final check${crossfade ? ' with cross-fades' : ''}`, async () => {
  test.setTimeout(240_000);
  const { concatVideoBytes } = await import('../../lib/concat-video-bytes.ts');
  const { validateFinalVideoProbe } = await import('../../lib/final-video-probe.ts');
  const inputs = realFiles.map(file => { const bytes = readFileSync(file); return { bytes, sha256: sha(bytes) }; });
  // Segment lengths as the product's probe measured them, and the audio sent for each (attempt 9 task record).
  const segmentDurations = [19.35, 12.35, 16.458333], submitted = [19.35, 12.35, 16.45];
  const planned = segmentDurations.reduce((sum, n) => sum + n, 0);
  const joined = await concatVideoBytes(inputs, { executable: ffmpeg, normalizeDuration: planned, ...(crossfade ? { crossfadeAt: [19.35, 31.7] } : {}) });
  const file = join(mkdtempSync(join(scratch, 'real-')), 'v.mp4');
  writeFileSync(file, joined.bytes);
  const report = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file', '-f', 'mov', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const checked = validateFinalVideoProbe(report, { sourceDuration: 19.35 + 12.35 + 16.45, segmentDurations, audioStages: submitted.map(n => ({ sourceDuration: n, submittedDuration: n })) });
  expect(Math.abs(checked.duration - planned)).toBeLessThanOrEqual(0.001001);
});
