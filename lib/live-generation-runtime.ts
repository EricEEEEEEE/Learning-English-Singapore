import { isAbsolute, join } from 'node:path';
import { isIP } from 'node:net';
import { createGenerationTaskStore } from './generation-tasks';
import { createPrivateMediaStore } from './private-media-store';
import { generateSceneScript } from './generated-script';
import { generateLineAudio } from './generated-audio';
import { submitEncodedVideoSegment, queryVideoSegment } from './generated-video';
import { downloadGeneratedMedia } from './download-generated-media';
import { encodeVideoAudio } from './encode-video-audio';
import { probeVideoBytes } from './probe-video-bytes';
import { concatVideoBytes } from './concat-video-bytes';
import { verifyFinalVideo } from './verify-final-video';

type Options = {
  enabled?: boolean; directory: string; sessionSecret: string; openaiKey: string; ltxKey: string;
  budget: { scope: string; priorSpentMicros: number; maxReservedMicros: number; scriptMicros: number; audioMicros: number; videoMicros: number };
  media: { ffmpeg: string; ffprobe: string; allowedHosts: string[]; maxBytes: number };
  fetch?: typeof fetch;
};
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

// Trusted server configuration only. Construction performs no network calls and reads no ambient keys.
// Each returned operation is explicit; this factory never auto-confirms audio or advances stages.
export function createLiveGenerationRuntime(options: Options) {
  const b = options?.budget, m = options?.media;
  if (options?.enabled !== true || !nonempty(options.directory) || !isAbsolute(options.directory) || !nonempty(options.sessionSecret) || !nonempty(options.openaiKey) || !nonempty(options.ltxKey)) throw new Error('Live runtime configuration required');
  if (!b || !nonempty(b.scope) || b.scope.length > 128 || !Number.isSafeInteger(b.priorSpentMicros) || b.priorSpentMicros < 0 || !positive(b.maxReservedMicros) || b.priorSpentMicros > b.maxReservedMicros || !positive(b.scriptMicros) || !positive(b.audioMicros) || !positive(b.videoMicros)) throw new Error('Live runtime budget required');
  if (!m || !nonempty(m.ffmpeg) || !isAbsolute(m.ffmpeg) || !nonempty(m.ffprobe) || !isAbsolute(m.ffprobe) || !positive(m.maxBytes) || m.maxBytes > 100_000_000 || !Array.isArray(m.allowedHosts) || !m.allowedHosts.length || m.allowedHosts.some(host => typeof host !== 'string' || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(host) || isIP(host) || host === 'localhost' || host.endsWith('.localhost'))) throw new Error('Live runtime media configuration required');
  const media = { ...m, allowedHosts: [...m.allowedHosts] };
  const openai = { enabled: true, apiKey: options.openaiKey, fetch: options.fetch };
  const video = { enabled: true, apiKey: options.ltxKey, fetch: options.fetch };
  const transport = options.fetch;
  return createGenerationTaskStore({
    directory: options.directory, sessionSecret: options.sessionSecret, simulation: false,
    maxReservedMicros: b.maxReservedMicros, liveBudget: { scope: b.scope, priorSpentMicros: b.priorSpentMicros },
    mediaStore: createPrivateMediaStore({ directory: join(options.directory, 'media'), sessionSecret: options.sessionSecret }),
    scriptProvider: { reservedMicros: b.scriptMicros, generate: input => generateSceneScript(input, openai) },
    audioProvider: { reservedMicros: b.audioMicros, generate: line => generateLineAudio(line, openai) },
    audioEncoder: input => encodeVideoAudio(input, media),
    encodedVideoProvider: {
      reservedMicros: b.videoMicros,
      submit: input => submitEncodedVideoSegment({ audio: input.audio, prompt: input.goal }, { ...video, reviewedSha256: input.reviewedSha256 }),
      query: id => queryVideoSegment(id, video),
    },
    videoDownload: url => downloadGeneratedMedia(url, { allowedHosts: media.allowedHosts, maxBytes: media.maxBytes, fetch: transport }),
    videoProbe: input => probeVideoBytes(input, { executable: media.ffprobe }),
    videoConcat: inputs => concatVideoBytes(inputs, { executable: media.ffmpeg }),
    finalVideoVerify: input => verifyFinalVideo(input, media),
  });
}
