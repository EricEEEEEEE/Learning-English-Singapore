import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, lstat, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { planVideoTailRepair } from './video-tail-repair';

type Asset = { bytes: Uint8Array; sha256: string };
type Settings = { shell: false; timeout: number; maxBuffer: number; encoding: 'utf8' };
type Execute = (file: string, args: string[], settings: Settings) => Promise<{ stdout: string; stderr: string }>;
const run = promisify(execFile);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

// Internal executor: caller must bind timing to the input bytes, then probe and
// decode the returned media before saving it as an accepted course asset.
export async function repairVideoTailBytes(input: { video: Asset; audio: Asset; timing: Parameters<typeof planVideoTailRepair>[0] }, options: { executable: string; execute?: Execute }) {
  if (!input || !options || typeof options.executable !== 'string' || !isAbsolute(options.executable) || options.executable.includes('\0')) throw new Error('Invalid repair configuration');
  const plan = planVideoTailRepair(input.timing);
  const sources = [input.video, input.audio].map(asset => {
    if (!asset || !(asset.bytes instanceof Uint8Array) || !asset.bytes.length || asset.bytes.length > 100_000_000) throw new Error('Invalid repair input');
    const bytes = Buffer.from(asset.bytes);
    if (hash(bytes) !== asset.sha256) throw new Error('Invalid repair integrity');
    return bytes;
  });
  let directory: string;
  try { directory = await mkdtemp(join(tmpdir(), 'les-tail-repair-')); } catch { throw new Error('Repair setup failed'); }
  const video = join(directory, 'input.mp4'), audio = join(directory, 'source.wav'), output = join(directory, 'output.mp4');
  try {
    await writeFile(video, sources[0], { flag: 'wx', mode: 0o600 });
    await writeFile(audio, sources[1], { flag: 'wx', mode: 0o600 });
    const execute: Execute = options.execute ?? ((file, args, settings) => run(file, args, settings));
    const result = await execute(options.executable, ['-nostdin', '-v', 'error', '-n',
      '-protocol_whitelist', 'file', '-f', 'mov', '-i', video,
      '-protocol_whitelist', 'file', '-f', 'wav', '-i', audio,
      '-map', '0:v:0', '-map', '1:a:0', '-vf', `tpad=stop_mode=clone:stop_duration=${plan.padSeconds}`,
      '-t', String(plan.targetDuration), '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-fs', '100000000', output],
    { shell: false, timeout: 60_000, maxBuffer: 1_000_000, encoding: 'utf8' });
    if (typeof result.stderr !== 'string' || result.stderr.trim()) throw new Error('Repair reported errors');
    const info = await lstat(output);
    if (!info.isFile() || info.size <= 0 || info.size >= 100_000_000) throw new Error('Invalid repair output');
    const bytes = await readFile(output);
    if (bytes.length !== info.size) throw new Error('Repair output changed');
    return { bytes, sha256: hash(bytes) };
  } catch { throw new Error('Video tail repair failed'); }
  finally {
    let failed = false;
    for (const file of [video, audio, output]) try { await unlink(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failed = true; }
    try { await rmdir(directory); } catch { failed = true; }
    if (failed) throw new Error('Repair cleanup failed');
  }
}
