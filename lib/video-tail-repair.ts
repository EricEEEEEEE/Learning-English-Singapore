type Timing = {
  sourceAudioDuration: number; videoDuration: number;
  videoStart: number; audioStart: number; fps: number; width: number; height: number;
};

// Internal repair plan only. The caller must verify media bytes and preserve originals.
// A short tail hold cannot repair shifted speech or establish lip-sync correctness.
// Up to 12 frames short since C15-4e (was 8): C3 live LTX segments came back 7 frames short (2026-10-17), the party course 7.4 (2026-09-30).
export function planVideoTailRepair(input: Timing) {
  if (!input || ![input.sourceAudioDuration, input.videoDuration, input.videoStart, input.audioStart].every(Number.isFinite)
    || input.sourceAudioDuration <= 0 || input.sourceAudioDuration > 20
    || input.videoDuration <= 0 || input.videoDuration > 20
    || input.videoStart !== 0 || input.audioStart !== 0
    || input.fps !== 24 || input.width !== 720 || input.height !== 1280) throw new Error('Invalid tail repair input');
  const difference = input.sourceAudioDuration - input.videoDuration;
  // Up to 12 frames short is padded with the last frame (C15-4e: a real LTX segment came back 8.2 frames short;
  // was 8); up to 8 frames long is trimmed to the audio length (partner-only drive segments always go through this
  // step to restore the full audio).
  if (difference > 12 / input.fps || difference < -8 / input.fps) throw new Error('Tail difference exceeds repair limit');
  const padSeconds = Math.max(0, difference);
  // ffprobe reports seconds to six decimals; avoid rounding a five-frame gap to six.
  const padFrames = Math.ceil(Math.max(0, padSeconds * input.fps - 0.000024));
  return { targetDuration: input.sourceAudioDuration, padSeconds, padFrames, replaceWithSourceAudio: true as const };
}
