import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, lstat, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { validateVideoProbe } from './video-probe';
import { verifyReferenceImage } from './verify-reference-image';

type Settings = { shell: false; timeout: number; maxBuffer: number; encoding: 'utf8' };
type Execute = (file: string, args: string[], settings: Settings) => Promise<{ stdout: string; stderr: string }>;
const run = promisify(execFile);

// Local, short-course profile. The requested time is provenance, not a claim
// that a compressed video contains a frame at that exact fractional timestamp.
export async function extractReferenceImage(input: { bytes: Uint8Array; sha256: string; timeSeconds: number }, options: { ffmpeg: string; ffprobe: string; execute?: Execute }) {
  if (!input || !(input.bytes instanceof Uint8Array) || !input.bytes.length || input.bytes.length > 100_000_000 || !Number.isFinite(input.timeSeconds) || input.timeSeconds < 0 || input.timeSeconds >= 20 || !options || [options.ffmpeg, options.ffprobe].some(path => typeof path !== 'string' || !isAbsolute(path) || path.includes('\0'))) throw new Error('Invalid extraction input');
  const bytes = Buffer.from(input.bytes), timeSeconds = input.timeSeconds, sourceVideoSha256 = createHash('sha256').update(bytes).digest('hex');
  if (sourceVideoSha256 !== input.sha256) throw new Error('Invalid extraction integrity');
  const execute: Execute = options.execute ?? ((file, args, settings) => run(file, args, settings));
  let directory: string;
  try { directory = await mkdtemp(join(tmpdir(), 'les-reference-frame-')); } catch { throw new Error('Extraction setup failed'); }
  const source = join(directory, 'source.mp4'), output = join(directory, 'frame.png');
  try {
    await writeFile(source, bytes, { flag: 'wx', mode: 0o600 });
    const invoke = async (file: string, args: string[]) => {
      const result = await execute(file, args, { shell: false, timeout: 60_000, maxBuffer: 1_000_000, encoding: 'utf8' });
      if (typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout) > 1_000_000 || typeof result.stderr !== 'string' || result.stderr.trim()) throw new Error('Extraction tool failed');
      return result.stdout;
    };
    const report = JSON.parse(await invoke(options.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file', '-f', 'mov', '-show_streams', '-show_format', '-of', 'json', source]));
    const duration = Number(report?.streams?.find((s: { codec_type?: string }) => s.codec_type === 'video')?.duration);
    validateVideoProbe(report, duration);
    for (const stream of [report.format, ...report.streams]) {
      if ((typeof stream.start_time !== 'string' && typeof stream.start_time !== 'number') || String(stream.start_time).trim() === '' || Number(stream.start_time) !== 0) throw new Error('Invalid source start');
    }
    if (timeSeconds >= duration) throw new Error('Reference time outside video');
    await invoke(options.ffmpeg, ['-nostdin', '-v', 'error', '-xerror', '-n', '-protocol_whitelist', 'file', '-f', 'mov', '-i', source, '-ss', String(timeSeconds), '-map', '0:v:0', '-frames:v', '1', '-c:v', 'png', '-f', 'image2', '-fs', '5249982', output]);
    const stat = await lstat(output);
    if (!stat.isFile() || stat.size <= 0 || stat.size >= 5_249_982) throw new Error('Invalid extracted image');
    const image = await readFile(output);
    if (image.length !== stat.size) throw new Error('Extracted image changed');
    const checked = await verifyReferenceImage({ bytes: image, sha256: createHash('sha256').update(image).digest('hex'), mimeType: 'image/png' }, { ...options, execute });
    return { ...checked, sourceVideoSha256, timeSeconds };
  } catch { throw new Error('Reference extraction failed'); }
  finally {
    let failed = false;
    for (const path of [source, output]) try { await unlink(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failed = true; }
    try { await rmdir(directory); } catch { failed = true; }
    if (failed) throw new Error('Extraction cleanup failed');
  }
}
