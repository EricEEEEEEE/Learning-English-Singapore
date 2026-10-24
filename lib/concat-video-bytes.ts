import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, lstat, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

type Settings = { shell: false; timeout: number; maxBuffer: number; encoding: 'utf8' };
type Execute = (executable: string, args: string[], options: Settings) => Promise<{ stdout: string; stderr: string }>;
const run = promisify(execFile);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

// C15-4g (2026-10-23, zero cost): picture-only cross-fade at each seam between segments. The first SEAM_CROSSFADE_FRAMES
// frames of the next segment are blended with the last frame of the one before (held), fading into the new segment;
// every segment still starts at its own timeline time, so the length, the audio and the line timings do not change.
export const SEAM_CROSSFADE_FRAMES = 3;
const FPS = 24;

// The video part of the filter graph: each segment at 24 fps from 0, all but the last held on their last frame for a
// little longer, then one xfade per seam starting a quarter frame before the seam's frame (so that frame is the first
// blended one) and lasting SEAM_CROSSFADE_FRAMES frames.
function crossfadeGraph(seamFrames: number[]) {
  const count = seamFrames.length + 1, fade = SEAM_CROSSFADE_FRAMES / FPS, hold = (SEAM_CROSSFADE_FRAMES + FPS) / FPS;
  const parts = Array.from({ length: count }, (_, i) => `[${i + 1}:v:0]fps=${FPS},setpts=PTS-STARTPTS,format=yuv420p,settb=1/${FPS}${i < count - 1 ? `,tpad=stop_mode=clone:stop_duration=${hold.toFixed(6)}` : ''}[v${i}]`);
  let last = 'v0';
  seamFrames.forEach((frame, i) => {
    parts.push(`[${last}][v${i + 1}]xfade=transition=fade:duration=${fade.toFixed(6)}:offset=${((frame - 0.25) / FPS).toFixed(6)}[x${i + 1}]`);
    last = `x${i + 1}`;
  });
  return { graph: parts.join(';'), output: `[${last}]` };
}

// Trusted caller supplies the verified timeline duration for optional CFR output.
// Caller must probe inputs and re-probe/decode the final output in either mode.
// C15-4g: crossfadeAt (CFR mode only) lists each later segment's start time on the timeline, one per seam.
export async function concatVideoBytes(inputs: { bytes: Uint8Array; sha256: string }[], options: { executable: string; execute?: Execute; normalizeDuration?: number; crossfadeAt?: number[] }) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 4 || !options || typeof options.executable !== 'string' || !isAbsolute(options.executable) || options.executable.includes('\0')) throw new Error('Invalid concat configuration');
  const duration = options.normalizeDuration;
  if (duration !== undefined && (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration > 60 + 4 * 0.129002)) throw new Error('Invalid normalization duration');
  const seams = options.crossfadeAt;
  let seamFrames: number[] | undefined;
  if (seams !== undefined) {
    if (duration === undefined || !Array.isArray(seams) || seams.length !== inputs.length - 1 || !seams.length) throw new Error('Invalid crossfade');
    seamFrames = seams.map(time => {
      if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0 || time >= duration) throw new Error('Invalid crossfade');
      return Math.round(time * FPS);
    });
    if (seamFrames.some((frame, i) => frame < SEAM_CROSSFADE_FRAMES || (i > 0 && frame - seamFrames![i - 1] < SEAM_CROSSFADE_FRAMES) || Math.abs(frame / FPS - seams[i]) > 0.5 / FPS)
      || duration * FPS - seamFrames.at(-1)! < SEAM_CROSSFADE_FRAMES) throw new Error('Invalid crossfade');
  }
  let total = 0;
  const segments = inputs.map(input => {
    if (!input || !(input.bytes instanceof Uint8Array) || !input.bytes.length || input.bytes.length > 100_000_000) throw new Error('Invalid concat input');
    total += input.bytes.length;
    if (total > 100_000_000) throw new Error('Concat inputs too large');
    const bytes = Buffer.from(input.bytes);
    if (hash(bytes) !== input.sha256) throw new Error('Invalid concat integrity');
    return bytes;
  });
  let directory: string;
  try { directory = await mkdtemp(join(tmpdir(), 'les-video-concat-')); } catch { throw new Error('Concat setup failed'); }
  const names = segments.map((_, i) => `segment-${i}.mp4`);
  const manifest = join(directory, 'segments.txt'), output = join(directory, 'output.mp4');
  const files = [...names.map(name => join(directory, name)), manifest, output];
  try {
    for (let i = 0; i < segments.length; i++) await writeFile(files[i], segments[i], { flag: 'wx', mode: 0o600 });
    await writeFile(manifest, names.map(name => `file '${name}'\n`).join(''), { flag: 'wx', mode: 0o600 });
    const execute: Execute = options.execute ?? ((executable, args, settings) => run(executable, args, settings));
    // C15-4i: the picture stops at the last whole 24 fps frame inside the planned length (a trim in the picture filter;
    // -frames:v would end the whole output and cut the audio short). A length that is not whole frames (attempt 9:
    // 48.158333 s) otherwise kept one more frame and ran the container past the plan.
    const frames = duration === undefined ? 0 : Math.floor(duration * FPS + 1e-6);
    const trim = `trim=end_frame=${frames}`;
    const encode = ['-af', 'apad', '-t', String(duration), '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k'];
    // Audio always comes from the concat list, as before; with cross-fades the picture comes from the segment files.
    const fade = seamFrames && crossfadeGraph(seamFrames);
    const streams = fade ? [...names.flatMap(name => ['-i', join(directory, name)]), '-filter_complex', `${fade.graph};${fade.output}${trim}[vout]`, '-map', '[vout]', '-map', '0:a:0']
      : ['-map', '0:v:0', '-map', '0:a:0', ...(duration === undefined ? [] : ['-vf', `fps=24,${trim}`])];
    const encoding = duration === undefined ? ['-c', 'copy'] : encode;
    const result = await execute(options.executable, ['-nostdin', '-v', 'error', '-n', '-copyts', '-protocol_whitelist', 'file', '-f', 'concat', '-safe', '1', '-i', manifest, ...streams, ...encoding, '-avoid_negative_ts', 'disabled', '-movflags', '+faststart', '-fs', '100000000', output], { shell: false, timeout: fade ? 180_000 : 60_000, maxBuffer: 1_000_000, encoding: 'utf8' });
    if (typeof result.stderr !== 'string' || result.stderr.trim()) throw new Error('Concat reported errors');
    const info = await lstat(output);
    // Reaching the ffmpeg size cap may produce truncated media even with exit 0.
    if (!info.isFile() || info.size <= 0 || info.size >= 100_000_000) throw new Error('Invalid concat output');
    const bytes = await readFile(output);
    if (bytes.length !== info.size) throw new Error('Concat output changed');
    return { bytes, sha256: hash(bytes) };
  } catch { throw new Error('Video concat failed'); }
  finally {
    let failed = false;
    for (const file of files) try { await unlink(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failed = true; }
    try { await rmdir(directory); } catch { failed = true; }
    if (failed) throw new Error('Video concat cleanup failed');
  }
}
