import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

type Settings = { shell: false; timeout: number; maxBuffer: number; encoding: 'utf8' };
type Execute = (file: string, args: string[], options: Settings) => Promise<{ stdout: string; stderr: string }>;
const run = promisify(execFile);

// Trusted local tools only; this verifies decoding, not identity or visual quality.
export async function verifyReferenceImage(input: { bytes: Uint8Array; sha256: string; mimeType: string }, options: { ffprobe: string; ffmpeg: string; execute?: Execute }) {
  if (!input || input.mimeType !== 'image/png' || !(input.bytes instanceof Uint8Array) || input.bytes.length < 8 || input.bytes.length > 5_249_982 || !options || [options.ffprobe, options.ffmpeg].some(path => typeof path !== 'string' || !isAbsolute(path) || path.includes('\0'))) throw new Error('Invalid reference configuration');
  const bytes = Buffer.from(input.bytes), sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== input.sha256 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Invalid reference integrity');
  let directory: string;
  try { directory = await mkdtemp(join(tmpdir(), 'les-reference-image-')); } catch { throw new Error('Reference setup failed'); }
  const path = join(directory, 'reference.png');
  try {
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
    const execute: Execute = options.execute ?? ((file, args, settings) => run(file, args, settings));
    const settings: Settings = { shell: false, timeout: 30_000, maxBuffer: 1_000_000, encoding: 'utf8' };
    const invoke = async (file: string, args: string[]) => {
      const result = await execute(file, args, settings);
      if (typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout) > settings.maxBuffer || typeof result.stderr !== 'string' || result.stderr.trim()) throw new Error('Reference tool failed');
      return result.stdout;
    };
    const report = JSON.parse(await invoke(options.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file', '-f', 'png_pipe', '-show_streams', '-of', 'json', path]));
    const stream = Array.isArray(report?.streams) && report.streams.length === 1 ? report.streams[0] : undefined;
    if (!stream || stream.codec_type !== 'video' || stream.codec_name !== 'png' || stream.width !== 720 || stream.height !== 1280) throw new Error('Unsupported reference image');
    await invoke(options.ffmpeg, ['-nostdin', '-v', 'error', '-xerror', '-protocol_whitelist', 'file', '-f', 'png_pipe', '-i', path, '-map', '0:v:0', '-f', 'null', '-']);
    return { bytes, sha256, mimeType: 'image/png' as const, width: 720, height: 1280, decoded: true as const };
  } catch { throw new Error('Reference image verification failed'); }
  finally {
    let failed = false;
    try { await unlink(path); } catch (error) { failed = (error as NodeJS.ErrnoException).code !== 'ENOENT'; }
    try { await rmdir(directory); } catch { failed = true; }
    if (failed) throw new Error('Reference cleanup failed');
  }
}
