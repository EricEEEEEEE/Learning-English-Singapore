import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { validateVideoProbe } from './video-probe';

type ExecutionOptions = { shell: false; timeout: number; maxBuffer: number; encoding: 'utf8' };
type Execute = (executable: string, args: string[], options: ExecutionOptions) => Promise<{ stdout: string; stderr: string }>;
const run = promisify(execFile);

// Caller supplies a trusted local executable; never accept its path from the browser.
export async function probeVideoBytes(input: { bytes: Uint8Array; sha256: string; expectedDuration: number }, options: { executable: string; execute?: Execute }) {
  if (!input || !(input.bytes instanceof Uint8Array) || !input.bytes.length || input.bytes.length > 100_000_000 || !Number.isFinite(input.expectedDuration) || input.expectedDuration <= 0 || input.expectedDuration > 20) throw new Error('Invalid probe input');
  if (!options || typeof options.executable !== 'string' || !isAbsolute(options.executable) || options.executable.includes('\0')) throw new Error('Probe executable required');
  // Copy before any await so a caller cannot mutate the buffer after hash verification.
  const bytes = Buffer.from(input.bytes), expectedDuration = input.expectedDuration;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== input.sha256) throw new Error('Invalid video integrity');
  let directory: string;
  try { directory = await mkdtemp(join(tmpdir(), 'les-video-probe-')); } catch { throw new Error('Video probe setup failed'); }
  const path = join(directory, 'input.mp4');
  try {
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
    const args = ['-v', 'error', '-protocol_whitelist', 'file', '-f', 'mov', '-show_streams', '-show_format', '-of', 'json', path];
    const execute: Execute = options.execute ?? ((executable, arguments_, settings) => run(executable, arguments_, settings));
    const result = await execute(options.executable, args, { shell: false, timeout: 30_000, maxBuffer: 1_000_000, encoding: 'utf8' });
    if (typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout) > 1_000_000 || typeof result.stderr !== 'string' || result.stderr.trim()) throw new Error('Probe output rejected');
    return { ...validateVideoProbe(JSON.parse(result.stdout), expectedDuration), sha256 };
  } catch { throw new Error('Video probe failed'); }
  finally {
    // Remove only this invocation's temporary input and empty directory.
    let cleanupFailed = false;
    try { await unlink(path); } catch (error) { cleanupFailed = (error as NodeJS.ErrnoException).code !== 'ENOENT'; }
    try { await rmdir(directory); } catch { cleanupFailed = true; }
    if (cleanupFailed) throw new Error('Video probe cleanup failed');
  }
}
