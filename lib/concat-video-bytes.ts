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

// Stream-copy only. Caller must probe inputs and re-probe/decode the final output.
export async function concatVideoBytes(inputs: { bytes: Uint8Array; sha256: string }[], options: { executable: string; execute?: Execute }) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 4 || !options || typeof options.executable !== 'string' || !isAbsolute(options.executable) || options.executable.includes('\0')) throw new Error('Invalid concat configuration');
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
    const result = await execute(options.executable, ['-nostdin', '-v', 'error', '-n', '-copyts', '-protocol_whitelist', 'file', '-f', 'concat', '-safe', '1', '-i', manifest, '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', '-avoid_negative_ts', 'disabled', '-movflags', '+faststart', '-fs', '100000000', output], { shell: false, timeout: 60_000, maxBuffer: 1_000_000, encoding: 'utf8' });
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
