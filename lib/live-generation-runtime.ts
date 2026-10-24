import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isAbsolute, join } from 'node:path';
import { isIP } from 'node:net';
import { createGenerationTaskStore } from './generation-tasks';
import { createMediaStore } from './media-store-config';
import { generateSceneScript } from './generated-script';
import { generateLineAudio } from './generated-audio';
import { submitEncodedVideoSegment, queryVideoSegment, resolveLtxModel } from './generated-video';
import { createVideoQualityGate, createPreviewQualityGate, createFaceChecks, createAnchorFrameSelect } from './video-quality-gate';
import { createPlaceholderKeyframeProvider, createReferenceFrameCheck } from './generated-keyframe';
import { downloadGeneratedMedia } from './download-generated-media';
import { encodeVideoAudio } from './encode-video-audio';
import { probeVideoBytes } from './probe-video-bytes';
import { concatVideoBytes } from './concat-video-bytes';
import { verifyFinalVideo } from './verify-final-video';
import { repairAndVerifyVideoTail } from './repair-and-verify-video-tail';
import { extractReferenceImage } from './extract-reference-image';
import { createPreviewVideoProvider } from './preview-video-provider';

type Options = {
  enabled?: boolean; directory: string; sessionSecret: string; openaiKey: string; ltxKey: string;
  // Preview: real script and voices, but each video segment is a local card instead of a paid video.
  previewVideo?: boolean;
  // C14-3: one of the whitelisted LTX models; unset keeps the default.
  videoModel?: string;
  budget: { scope: string; priorSpentMicros: number; maxReservedMicros: number; scriptMicros: number; audioMicros: number; videoMicros: number };
  // python: for the C14-4 face check script (python3 -I); unset uses /usr/bin/python3.
  media: { ffmpeg: string; ffprobe: string; allowedHosts: string[]; maxBytes: number; python?: string };
  fetch?: typeof fetch;
};
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

// Trusted server configuration only. Construction performs no network calls and reads no ambient keys.
// Each returned operation is explicit; this factory never auto-confirms audio or advances stages.
export function createLiveGenerationRuntime(options: Options) {
  const b = options?.budget, m = options?.media;
  if (options?.enabled !== true || !nonempty(options.directory) || !isAbsolute(options.directory) || !nonempty(options.sessionSecret) || !nonempty(options.openaiKey) || (!options.previewVideo && !nonempty(options.ltxKey))) throw new Error('Live runtime configuration required');
  if (!b || !nonempty(b.scope) || b.scope.length > 128 || !Number.isSafeInteger(b.priorSpentMicros) || b.priorSpentMicros < 0 || !positive(b.maxReservedMicros) || b.priorSpentMicros > b.maxReservedMicros || !positive(b.scriptMicros) || !positive(b.audioMicros) || !positive(b.videoMicros)) throw new Error('Live runtime budget required');
  if (!m || !nonempty(m.ffmpeg) || !isAbsolute(m.ffmpeg) || !nonempty(m.ffprobe) || !isAbsolute(m.ffprobe) || !positive(m.maxBytes) || m.maxBytes > 100_000_000 || !Array.isArray(m.allowedHosts) || !m.allowedHosts.length || m.allowedHosts.some(host => typeof host !== 'string' || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(host) || isIP(host) || host === 'localhost' || host.endsWith('.localhost')) || (m.python !== undefined && (!nonempty(m.python) || !isAbsolute(m.python)))) throw new Error('Live runtime media configuration required');
  let videoModel: ReturnType<typeof resolveLtxModel>;
  try { videoModel = resolveLtxModel(options.videoModel); } catch { throw new Error('Live runtime video model not allowed'); }
  const { python = '/usr/bin/python3', ...tools } = m;
  const media = { ...tools, allowedHosts: [...m.allowedHosts] };
  const openai = { enabled: true, apiKey: options.openaiKey, fetch: options.fetch };
  const preview = options.previewVideo ? createPreviewVideoProvider({ ffmpeg: media.ffmpeg }) : undefined;
  const video = { enabled: true, apiKey: options.ltxKey, fetch: options.fetch, model: videoModel };
  const transport = options.fetch;
  return createGenerationTaskStore({
    directory: options.directory, sessionSecret: options.sessionSecret, simulation: false,
    maxReservedMicros: b.maxReservedMicros, liveBudget: { scope: b.scope, priorSpentMicros: b.priorSpentMicros },
    mediaStore: createMediaStore({ directory: join(options.directory, 'media'), sessionSecret: options.sessionSecret }),
    scriptProvider: { reservedMicros: b.scriptMicros, generate: input => generateSceneScript(input, openai) },
    audioProvider: { reservedMicros: b.audioMicros, generate: (line, cast) => generateLineAudio(line, { ...openai, ...(cast?.partnerGender ? { partnerGender: cast.partnerGender } : {}) }) },
    audioEncoder: input => encodeVideoAudio(input, media),
    encodedVideoProvider: preview ? {
      reservedMicros: b.videoMicros,
      submit: input => preview.submit({ audio: input.audio, prompt: input.prompt ?? input.goal, referenceImage: input.referenceImage }),
      query: id => preview.query(id),
    } : {
      reservedMicros: b.videoMicros,
      submit: input => submitEncodedVideoSegment({ audio: input.audio, prompt: input.prompt ?? input.goal, referenceImage: input.referenceImage }, { ...video, reviewedSha256: input.reviewedSha256 }),
      query: id => queryVideoSegment(id, video),
    },
    videoDownload: async url => preview?.download(url) ?? downloadGeneratedMedia(url, { allowedHosts: media.allowedHosts, maxBytes: media.maxBytes, fetch: transport }),
    videoProbe: input => probeVideoBytes(input, { executable: media.ffprobe }),
    videoRepair: input => repairAndVerifyVideoTail(input, media),
    referenceExtractor: input => extractReferenceImage(input, media),
    // C15-4g: a short picture cross-fade at every seam (audio, length and line timings unchanged).
    // C16-3: each seam a hard cut or one blended frame, as the store chose from the gate's seam measurement.
    videoConcat: (inputs, verifiedDuration, seams, modes) => concatVideoBytes(inputs, { executable: media.ffmpeg, normalizeDuration: verifiedDuration, ...(Array.isArray(seams) && seams.length ? { crossfadeAt: seams, ...(Array.isArray(modes) && modes.length === seams.length ? { seamModes: modes } : {}) } : {}) }),
    finalVideoVerify: input => verifyFinalVideo(input, media),
    // C14-1: every segment goes through the quality gate. Preview cards take the preview path; provider video gets
    // the local ffmpeg checks plus the C14-4 face checks (python3 -I script; not_checked whenever it cannot measure).
    videoQualityGate: preview ? createPreviewQualityGate() : createVideoQualityGate({ ...media, faces: createFaceChecks({ python }) }),
    // C14-2: in preview only, a local placeholder keyframe starts the first segment (no image model exists here yet).
    ...(preview ? { keyframeProvider: createPlaceholderKeyframeProvider(media), referenceFrameCheck: createReferenceFrameCheck(media) } : {}),
    // C15-4f: provider video only: segment 1 gives the lesson's fixed reference frame (same face script, --anchor).
    ...(preview ? {} : { anchorFrameSelect: createAnchorFrameSelect({ python }) }),
  });
}

// Paid-run preparation entry: validate configuration and test the configured local tools
// before returning any operation. No shell, provider calls, or ambient credentials.
export async function prepareLiveGenerationRuntime(options: Options) {
  const snapshot = { ...options, budget: options?.budget && { ...options.budget }, media: options?.media && { ...options.media, allowedHosts: [...(options.media.allowedHosts ?? [])] } };
  const runtime = createLiveGenerationRuntime(snapshot);
  const execute = promisify(execFile);
  for (const name of ['ffmpeg', 'ffprobe'] as const) {
    try {
      const result = await execute(snapshot.media[name], ['-version'], { timeout: 10_000, maxBuffer: 1_000_000, encoding: 'utf8' });
      if (!result.stdout.startsWith(`${name} version `)) throw new Error('Unexpected media tool');
    } catch {
      throw new Error(`Media tool preflight failed: ${name}`);
    }
  }
  return runtime;
}
