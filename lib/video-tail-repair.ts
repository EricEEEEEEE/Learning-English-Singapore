type Timing = {
  sourceAudioDuration: number; videoDuration: number;
  videoStart: number; audioStart: number; fps: number; width: number; height: number;
};

// Internal repair plan only. The caller must verify media bytes and preserve originals.
// A short tail hold cannot repair shifted speech or establish lip-sync correctness.
// Up to 8 frames: C3 live LTX segments came back 7 frames short (2026-10-17), the party course 7.4 (2026-09-30).
export function planVideoTailRepair(input: Timing) {
  if (!input || ![input.sourceAudioDuration, input.videoDuration, input.videoStart, input.audioStart].every(Number.isFinite)
    || input.sourceAudioDuration <= 0 || input.sourceAudioDuration > 20
    || input.videoDuration <= 0 || input.videoDuration > 20
    || input.videoStart !== 0 || input.audioStart !== 0
    || input.fps !== 24 || input.width !== 720 || input.height !== 1280) throw new Error('Invalid tail repair input');
  const padSeconds = input.sourceAudioDuration - input.videoDuration;
  if (padSeconds < 0 || padSeconds > 8 / input.fps) throw new Error('Tail difference exceeds repair limit');
  // ffprobe reports seconds to six decimals; avoid rounding a five-frame gap to six.
  const padFrames = Math.ceil(Math.max(0, padSeconds * input.fps - 0.000024));
  return { targetDuration: input.sourceAudioDuration, padSeconds, padFrames, replaceWithSourceAudio: true as const };
}
