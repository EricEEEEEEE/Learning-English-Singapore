import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, lstat, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { wavDuration } from './generated-audio';

type Settings = { shell: false; timeout: number; maxBuffer: number; encoding: 'utf8' };
type Execute = (executable: string, args: string[], options: Settings) => Promise<{ stdout: string; stderr: string }>;
const run = promisify(execFile);
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const numeric = (value: unknown) => typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;

export async function encodeVideoAudio(input: { bytes: Uint8Array; sha256: string }, options: { ffmpeg: string; ffprobe: string; execute?: Execute }) {
  if (!input || !(input.bytes instanceof Uint8Array) || !input.bytes.length || input.bytes.length > 4_000_000 || !options || [options.ffmpeg, options.ffprobe].some(p => typeof p !== 'string' || !isAbsolute(p) || p.includes('\0'))) throw new Error('Invalid audio encoding input');
  const source = Buffer.from(input.bytes), sourceSha256 = digest(source);
  if (sourceSha256 !== input.sha256) throw new Error('Invalid audio integrity');
  const sourceDuration = wavDuration(source);
  let directory: string;
  try { directory = await mkdtemp(join(tmpdir(), 'les-encoded-audio-')); } catch { throw new Error('Audio encoding setup failed'); }
  const sourcePath = join(directory, 'input.wav'), output = join(directory, 'output.m4a');
  try {
    await writeFile(sourcePath, source, { flag: 'wx', mode: 0o600 });
    const execute: Execute = options.execute ?? ((exe, args, settings) => run(exe, args, settings));
    const settings: Settings = { shell: false, timeout: 60_000, maxBuffer: 1_000_000, encoding: 'utf8' };
    const invoke = async (exe: string, args: string[]) => {
      const result = await execute(exe, args, settings);
      if (typeof result.stderr !== 'string' || result.stderr.trim() || typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout) > settings.maxBuffer) throw new Error('Audio tool failed');
      return result.stdout;
    };
    await invoke(options.ffmpeg, ['-nostdin', '-v', 'error', '-n', '-protocol_whitelist', 'file', '-f', 'wav', '-i', sourcePath, '-map', '0:a:0', '-vn', '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '128k', '-movflags', '+faststart', '-fs', '10000000', output]);
    const stat = await lstat(output);
    if (!stat.isFile() || stat.size <= 0 || stat.size >= 10_000_000) throw new Error('Invalid encoded file');
    const report = JSON.parse(await invoke(options.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file', '-f', 'mov', '-show_streams', '-show_format', '-of', 'json', output]));
    const stream = Array.isArray(report?.streams) && report.streams.length === 1 ? report.streams[0] : undefined;
    const duration = numeric(report?.format?.duration), audioDuration = numeric(stream?.duration), rate = numeric(stream?.sample_rate);
    if (!stream || stream.codec_type !== 'audio' || stream.codec_name !== 'aac' || stream.profile !== 'LC' || ![1, 2].includes(stream.channels) || !Number.isFinite(rate) || rate < 8000 || rate > 192000 || typeof report?.format?.format_name !== 'string' || !report.format.format_name.split(',').includes('mp4') || numeric(report.format.start_time) !== 0 || numeric(stream.start_time) !== 0 || !Number.isFinite(duration) || duration <= 0 || duration > 20 || !Number.isFinite(audioDuration) || Math.abs(duration - audioDuration) > 0.001001 || Math.abs(duration - sourceDuration) > 1024 / rate + 0.001001) throw new Error('Invalid encoded audio report');
    await invoke(options.ffmpeg, ['-nostdin', '-v', 'error', '-xerror', '-protocol_whitelist', 'file', '-f', 'mov', '-i', output, '-map', '0:a:0', '-f', 'null', '-']);
    const bytes = await readFile(output);
    if (bytes.length !== stat.size) throw new Error('Encoded file changed');
    return { bytes, sourceSha256, sourceDuration, sha256: digest(bytes), duration, mimeType: 'audio/mp4' as const, decoded: true as const };
  } catch { throw new Error('Audio encoding failed'); }
  finally {
    let failed = false;
    for (const path of [sourcePath, output]) try { await unlink(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failed = true; }
    try { await rmdir(directory); } catch { failed = true; }
    if (failed) throw new Error('Audio encoding cleanup failed');
  }
}
