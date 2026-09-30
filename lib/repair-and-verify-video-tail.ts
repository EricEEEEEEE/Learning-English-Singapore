import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { wavDuration } from './generated-audio';
import { validateVideoProbe } from './video-probe';
import { repairVideoTailBytes } from './repair-video-tail-bytes';

type Asset = { bytes: Uint8Array; sha256: string };
type Settings = { shell: false; timeout: number; maxBuffer: number; encoding: 'utf8' };
type Execute = (file: string, args: string[], settings: Settings) => Promise<{ stdout: string; stderr: string }>;
const run = promisify(execFile);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

// Internal local operation only: does not replace stored originals or publish a course.
export async function repairAndVerifyVideoTail(input: { video: Asset; audio: Asset }, options: { ffmpeg: string; ffprobe: string; execute?: Execute }) {
  if (!input || !options || [options.ffmpeg, options.ffprobe].some(path => typeof path !== 'string' || !isAbsolute(path) || path.includes('\0'))) throw new Error('Invalid repair verification configuration');
  const [video, audio] = [input.video, input.audio].map((asset, index) => {
    if (!asset || !(asset.bytes instanceof Uint8Array) || !asset.bytes.length || asset.bytes.length > (index === 0 ? 100_000_000 : 4_000_000)) throw new Error('Invalid repair source');
    const bytes = Buffer.from(asset.bytes), sha256 = hash(bytes);
    if (sha256 !== asset.sha256) throw new Error('Invalid repair source integrity');
    return { bytes, sha256 };
  });
  const sourceDuration = wavDuration(audio.bytes);
  const execute: Execute = options.execute ?? ((file, args, settings) => run(file, args, settings));
  const settings: Settings = { shell: false, timeout: 60_000, maxBuffer: 1_000_000, encoding: 'utf8' };
  let directory: string;
  try { directory = await mkdtemp(join(tmpdir(), 'les-verified-tail-')); } catch { throw new Error('Repair verification setup failed'); }
  const original = join(directory, 'original.mp4'), output = join(directory, 'repaired.mp4');
  try {
    const invoke = async (file: string, args: string[]) => {
      const result = await execute(file, args, settings);
      if (typeof result.stderr !== 'string' || result.stderr.trim() || typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout) > settings.maxBuffer) throw new Error('Media tool failed');
      return result.stdout;
    };
    const probe = async (path: string) => JSON.parse(await invoke(options.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file', '-f', 'mov', '-show_streams', '-show_format', '-of', 'json', path]));
    const requireStarts = (report: { format?: { start_time?: unknown }; streams?: { start_time?: unknown }[] }) => {
      if (!report?.format || !Array.isArray(report.streams)) throw new Error('Missing media starts');
      for (const stream of [report.format, ...report.streams]) {
        const start = stream.start_time;
        if ((typeof start !== 'string' && typeof start !== 'number') || String(start).trim() === '' || Number(start) !== 0) throw new Error('Invalid media start');
      }
    };
    await writeFile(original, video.bytes, { flag: 'wx', mode: 0o600 });
    const report = await probe(original);
    requireStarts(report);
    const videoDuration = Number(report.streams.find((stream: { codec_type?: string }) => stream.codec_type === 'video')?.duration);
    // Validate the source against its own video duration, then separately bound
    // its shortfall relative to the verified WAV in the repair planner.
    validateVideoProbe(report, videoDuration);
    const repaired = await repairVideoTailBytes({ video, audio, timing: { sourceAudioDuration: sourceDuration, videoDuration, videoStart: 0, audioStart: 0, width: 720, height: 1280, fps: 24 } }, { executable: options.ffmpeg, execute });
    await writeFile(output, repaired.bytes, { flag: 'wx', mode: 0o600 });
    const finalReport = await probe(output);
    requireStarts(finalReport);
    const summary = validateVideoProbe(finalReport, sourceDuration);
    await invoke(options.ffmpeg, ['-nostdin', '-v', 'error', '-xerror', '-protocol_whitelist', 'file', '-f', 'mov', '-i', output, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-']);
    return { ...repaired, ...summary, sourceVideoSha256: video.sha256, sourceAudioSha256: audio.sha256, decoded: true as const };
  } catch { throw new Error('Verified tail repair failed'); }
  finally {
    let failed = false;
    for (const path of [original, output]) try { await unlink(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failed = true; }
    try { await rmdir(directory); } catch { failed = true; }
    if (failed) throw new Error('Repair verification cleanup failed');
  }
}
