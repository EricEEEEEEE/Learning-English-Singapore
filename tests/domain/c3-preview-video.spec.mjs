import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// C3 preview: before any paid video, a local card per segment carries the exact audio, prompt and chained
// reference frame, so voices, cuts and roles can be checked at zero video cost.
const ffmpeg = '/usr/bin/ffmpeg', ffprobe = '/usr/bin/ffprobe';
const probe = bytes => {
  const dir = mkdtempSync(join(tmpdir(), 'les-preview-test-')), file = join(dir, 'v.mp4');
  execFileSync('/bin/sh', ['-c', 'cat > "$1"', 'sh', file], { input: Buffer.from(bytes) });
  return JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]).toString());
};

test('C3 preview: a card renders the supplied audio at the course video format and is served only for its own URL', async () => {
  const { createPreviewVideoProvider } = await import('../../lib/preview-video-provider.ts');
  const dir = mkdtempSync(join(tmpdir(), 'les-preview-audio-')), audio = join(dir, 'a.m4a'), png = join(dir, 'f.png');
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'aac', audio]);
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=720x1280', '-frames:v', '1', png]);
  const provider = createPreviewVideoProvider({ ffmpeg });
  for (const referenceImage of [undefined, { bytes: readFileSync(png) }]) {
    const submitted = await provider.submit({ audio: { bytes: readFileSync(audio), duration: 2 }, prompt: 'Vertical first-person view. One adult man says: "Hello"', ...(referenceImage ? { referenceImage } : {}) });
    expect(submitted.status).toBe('pending');
    const status = await provider.query(submitted.jobId);
    expect(status.status).toBe('completed');
    expect(new URL(status.videoUrl).hostname).toBe('preview.invalid');
    const media = provider.download(status.videoUrl);
    const report = probe(media.bytes);
    const video = report.streams.find(s => s.codec_type === 'video'), sound = report.streams.find(s => s.codec_type === 'audio');
    expect([video.codec_name, video.width, video.height, video.avg_frame_rate]).toEqual(['h264', 720, 1280, '24/1']);
    expect(sound.codec_name).toBe('aac');
    expect(Number(report.format.duration)).toBeCloseTo(2, 1);
  }
  expect(provider.download('https://storage.googleapis.com/x.mp4')).toBeUndefined();
  await expect(provider.query('unknown')).rejects.toThrow();
});

test('C3 preview: the live runner needs no video key in preview and reserves almost nothing for video', async () => {
  const { createLiveSceneRunner } = await import('../../lib/live-scene-runner.ts');
  const dir = mkdtempSync(join(tmpdir(), 'les-preview-runner-'));
  const env = { LES_LIVE_GENERATION: '1', OPENAI_API_KEY: 'sk-synthetic', AUTH_SESSION_SECRET: 'offline-preview-session-secret-at-least-32-characters', LES_LIVE_BUDGET_SCOPE: 'preview', LES_LIVE_MAX_MICROS: '1000000', LES_MEDIA_HOSTS: 'storage.googleapis.com', LES_FFMPEG: ffmpeg, LES_FFPROBE: ffprobe };
  expect(createLiveSceneRunner(env, dir)).toBeNull();
  expect(createLiveSceneRunner({ ...env, LES_VIDEO_PREVIEW: '1' }, dir)).not.toBeNull();
});
