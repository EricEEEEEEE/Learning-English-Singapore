import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { validateFinalVideoProbe } from './final-video-probe';

type Settings = { shell: false; timeout: number; maxBuffer: number; encoding: 'utf8' };
type Execute = (executable: string, args: string[], options: Settings) => Promise<{ stdout: string; stderr: string }>;
const run = promisify(execFile);
export async function verifyFinalVideo(input: { bytes: Uint8Array; sha256: string; plan: Parameters<typeof validateFinalVideoProbe>[1] }, options: { ffprobe: string; ffmpeg: string; execute?: Execute }) {
  if (!input || !(input.bytes instanceof Uint8Array) || !input.bytes.length || input.bytes.length > 100_000_000 || !options || [options.ffprobe, options.ffmpeg].some(p => typeof p !== 'string' || !isAbsolute(p) || p.includes('\0'))) throw new Error('Invalid final verification input');
  const bytes = Buffer.from(input.bytes), plan = structuredClone(input.plan);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== input.sha256) throw new Error('Invalid final integrity');
  let directory: string;
  try { directory = await mkdtemp(join(tmpdir(), 'les-final-video-')); } catch { throw new Error('Final verification setup failed'); }
  const path = join(directory, 'input.mp4');
  try {
    await writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
    const execute: Execute = options.execute ?? ((executable, args, settings) => run(executable, args, settings));
    const settings: Settings = { shell: false, timeout: 60_000, maxBuffer: 1_000_000, encoding: 'utf8' };
    const probe = await execute(options.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file', '-f', 'mov', '-show_streams', '-show_format', '-of', 'json', path], settings);
    if (typeof probe.stdout !== 'string' || Buffer.byteLength(probe.stdout) > settings.maxBuffer || typeof probe.stderr !== 'string' || probe.stderr.trim()) throw new Error('Final probe rejected');
    const summary = validateFinalVideoProbe(JSON.parse(probe.stdout), plan);
    const decoded = await execute(options.ffmpeg, ['-nostdin', '-v', 'error', '-xerror', '-protocol_whitelist', 'file', '-f', 'mov', '-i', path, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'], settings);
    if (typeof decoded.stderr !== 'string' || decoded.stderr.trim()) throw new Error('Final decode rejected');
    return { ...summary, sha256, decoded: true as const };
  } catch { throw new Error('Final video verification failed'); }
  finally {
    let failed = false;
    try { await unlink(path); } catch (error) { failed = (error as NodeJS.ErrnoException).code !== 'ENOENT'; }
    try { await rmdir(directory); } catch { failed = true; }
    if (failed) throw new Error('Final verification cleanup failed');
  }
}
