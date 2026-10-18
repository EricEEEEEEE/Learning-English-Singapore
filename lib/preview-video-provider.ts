import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
export const PREVIEW_HOST = 'preview.invalid';
type Rendered = { bytes: Uint8Array; sha256: string };

// Zero-cost stand-in for the paid video provider. It renders a 720x1280 24fps card per segment from the exact
// audio, prompt and reference frame the provider would receive, so the whole chain (voices, segment cuts,
// frame chaining, audio restore, concat) can be checked locally before any paid video. Not a course video.
export function createPreviewVideoProvider(options: { ffmpeg: string; font?: string }) {
  const jobs = new Map<string, Rendered>();
  const font = options.font ?? '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  async function render(input: { audio: { bytes: Uint8Array; duration: number }; prompt: string; referenceImage?: { bytes: Uint8Array } }, index: number): Promise<Rendered> {
    const directory = await mkdtemp(join(tmpdir(), 'les-preview-'));
    try {
      const audio = join(directory, 'audio.m4a'), text = join(directory, 'prompt.txt'), image = join(directory, 'reference.png'), output = join(directory, 'preview.mp4');
      await writeFile(audio, input.audio.bytes);
      const wrapped = `PREVIEW card ${index + 1}, no paid video${input.referenceImage ? ", starts from a reference frame" : ""}\n\n` + input.prompt.replace(/(.{1,46})(\s+|$)/g, "$1\n");
      await writeFile(text, wrapped);
      const background = input.referenceImage ? ['-loop', '1', '-framerate', '24', '-i', image] : ['-f', 'lavfi', '-i', 'color=c=0x22313f:s=720x1280:r=24'];
      if (input.referenceImage) await writeFile(image, input.referenceImage.bytes);
      await run(options.ffmpeg, ['-nostdin', '-v', 'error', '-y', ...background, '-i', audio,
        '-vf', `scale=720:1280,drawtext=fontfile=${font}:textfile=${text}:fontcolor=white:fontsize=22:line_spacing=6:box=1:boxcolor=black@0.55:boxborderw=12:x=24:y=60`,
        '-map', '0:v:0', '-map', '1:a:0', '-t', String(input.audio.duration), '-r', '24', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', output],
      { timeout: 60_000, maxBuffer: 1_000_000 });
      const bytes = await readFile(output);
      return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  let submitted = 0;
  return {
    async submit(input: { audio: { bytes: Uint8Array; duration: number }; prompt: string; referenceImage?: { bytes: Uint8Array } }) {
      const jobId = randomUUID().replace(/-/g, '');
      jobs.set(jobId, await render(input, submitted++));
      return { status: 'pending' as const, jobId };
    },
    async query(jobId: string) {
      if (!jobs.has(jobId)) throw new Error('Video status unavailable');
      return { jobId, status: 'completed' as const, videoUrl: `https://${PREVIEW_HOST}/${jobId}.mp4` };
    },
    // Serves only the cards rendered above; every other URL goes to the real downloader.
    download(url: string): Rendered | undefined {
      const parsed = new URL(url);
      return parsed.hostname === PREVIEW_HOST ? jobs.get(parsed.pathname.slice(1, -4)) : undefined;
    },
  };
}
