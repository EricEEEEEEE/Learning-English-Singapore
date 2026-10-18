import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { verifyReferenceImage } from './verify-reference-image';
import { FACE_CHECK_PENDING } from './video-quality';
import type { GeneratedScript } from './generated-script';

type Scene = NonNullable<GeneratedScript['scene']>;
export type KeyframeImage = { bytes: Uint8Array; sha256: string; mimeType: 'image/png'; width: 720; height: 1280; decoded: true; source: 'placeholder' };
export type KeyframeProvider = { source: 'placeholder'; generate: (scene: Scene) => Promise<KeyframeImage> };
const run = promisify(execFile);

// C14-2: what a real image model would be asked for (C15-4). The placeholder only prints it.
export function keyframePrompt(scene: Scene) {
  const person = scene.partnerGender === 'male' ? 'man' : 'woman';
  return [
    `Vertical 720x1280 first-person photo, steady eye-level shot.`,
    `One fictional adult ${person}, ${scene.partnerLook}, faces the camera with a calm, friendly expression, mouth closed, face clearly visible and sharp.`,
    `Setting in Singapore: ${scene.setting}`,
    `No other people in focus, no readable signs, no text.`,
  ].join(' ');
}

// Zero-cost stand-in for the partner keyframe: a local card with the prompt written on it. No network, no model.
export function createPlaceholderKeyframeProvider(options: { ffmpeg: string; ffprobe: string; font?: string }): KeyframeProvider {
  if (!options || [options.ffmpeg, options.ffprobe].some(path => typeof path !== 'string' || !isAbsolute(path))) throw new Error('Invalid keyframe configuration');
  const font = options.font ?? '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  return {
    source: 'placeholder',
    async generate(scene) {
      const directory = await mkdtemp(join(tmpdir(), 'les-keyframe-'));
      try {
        const text = join(directory, 'prompt.txt'), output = join(directory, 'keyframe.png');
        await writeFile(text, 'PLACEHOLDER partner keyframe, no image model\n\n' + keyframePrompt(scene).replace(/(.{1,40})(\s+|$)/g, '$1\n'));
        await run(options.ffmpeg, ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x5a7d9a:s=720x1280',
          '-vf', `drawbox=x=210:y=360:w=300:h=380:color=0xe8c9a8@1:t=fill,drawtext=fontfile=${font}:textfile=${text}:fontcolor=white:fontsize=24:line_spacing=6:box=1:boxcolor=black@0.55:boxborderw=12:x=30:y=800`,
          '-frames:v', '1', '-f', 'image2', output], { timeout: 30_000, maxBuffer: 1_000_000 });
        const bytes = await readFile(output), sha256 = createHash('sha256').update(bytes).digest('hex');
        const checked = await verifyReferenceImage({ bytes, sha256, mimeType: 'image/png' }, options);
        if (checked.width !== 720 || checked.height !== 1280 || checked.decoded !== true) throw new Error('Invalid keyframe');
        return { bytes, sha256, mimeType: 'image/png', width: 720, height: 1280, decoded: true, source: 'placeholder' };
      } finally { await rm(directory, { recursive: true, force: true }); }
    },
  };
}

export type FrameCheck = { usable: boolean; checks: { id: 'sharp' | 'face'; status: 'passed' | 'failed' | 'not_checked'; value?: number; reason?: string }[] };
// Limits for a last frame that can start the next segment: ffmpeg blurdetect score and average luma (16-235).
export const FRAME_LIMITS = { maxBlur: 20, minLuma: 24 } as const;

// C14-2: is the extracted last frame good enough to start the next segment? Blur and darkness are measured with
// ffmpeg; "no front face" needs a face detector the user has not approved, so that part is not_checked and on
// its own never forces the fallback.
export function createReferenceFrameCheck(options: { ffmpeg: string }) {
  if (!options || typeof options.ffmpeg !== 'string' || !isAbsolute(options.ffmpeg)) throw new Error('Invalid frame check configuration');
  return async (input: { bytes: Uint8Array }): Promise<FrameCheck> => {
    if (!input || !(input.bytes instanceof Uint8Array) || !input.bytes.length || input.bytes.length > 5_249_982) throw new Error('Invalid frame');
    const directory = await mkdtemp(join(tmpdir(), 'les-frame-check-'));
    try {
      const file = join(directory, 'frame.png');
      await writeFile(file, input.bytes, { flag: 'wx', mode: 0o600 });
      const { stdout } = await run(options.ffmpeg, ['-hide_banner', '-nostdin', '-v', 'error', '-protocol_whitelist', 'file', '-i', file,
        '-vf', 'blurdetect=block_width=32:block_height=32,signalstats,metadata=print:file=-', '-f', 'null', '-'], { timeout: 30_000, maxBuffer: 1_000_000, encoding: 'utf8' });
      const blur = Number(/lavfi\.blur=([-\w.]+)/.exec(stdout)?.[1]), luma = Number(/lavfi\.signalstats\.YAVG=([\d.]+)/.exec(stdout)?.[1]);
      const sharp = Number.isFinite(blur) && blur <= FRAME_LIMITS.maxBlur && Number.isFinite(luma) && luma >= FRAME_LIMITS.minLuma;
      return { usable: sharp, checks: [
        { id: 'sharp', status: sharp ? 'passed' : 'failed', ...(Number.isFinite(blur) ? { value: Math.round(blur * 1000) / 1000 } : {}), ...(sharp ? {} : { reason: !Number.isFinite(luma) || luma < FRAME_LIMITS.minLuma ? 'frame too dark' : 'frame blurred' }) },
        { id: 'face', status: 'not_checked', reason: FACE_CHECK_PENDING },
      ] };
    } finally { await rm(directory, { recursive: true, force: true }); }
  };
}
