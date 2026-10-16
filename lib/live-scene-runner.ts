import { isAbsolute, join } from 'node:path';
import { createLiveGenerationRuntime } from './live-generation-runtime';
import { createPrivateMediaStore } from './private-media-store';
import { createGenerationRunner } from './generation-runner';
import { createMachineAudioReview } from './machine-audio-review';

// C3 batch: the user approved at most USD30 of real provider calls (2026-10-16). No configuration may exceed it.
export const C3_BATCH_CEILING_MICROS = 30_000_000;
// Per-call reservations are upper bounds, not prices: script and one TTS line stay well under USD0.05;
// one video segment is at most 20 seconds at USD0.09 per second.
export const LIVE_RESERVATIONS = { scriptMicros: 50_000, audioMicros: 50_000, videoMicros: 1_900_000 };

type Env = Record<string, string | undefined>;
const whole = (value: string | undefined) => value !== undefined && /^(0|[1-9]\d*)$/.test(value) ? Number(value) : NaN;
const filled = (value: string | undefined): value is string => typeof value === 'string' && !!value.trim();

// Returns null unless every server-side condition for paid generation is present; never reads request input.
export function createLiveSceneRunner(env: Env, directory: string, options: { fetch?: typeof fetch } = {}) {
  if (env.LES_LIVE_GENERATION !== '1') return null;
  const maxReservedMicros = whole(env.LES_LIVE_MAX_MICROS), priorSpentMicros = whole(env.LES_LIVE_PRIOR_SPENT_MICROS ?? '0');
  const hosts = (env.LES_MEDIA_HOSTS ?? '').split(',').map(host => host.trim()).filter(Boolean);
  const ffmpeg = env.LES_FFMPEG ?? '/usr/bin/ffmpeg', ffprobe = env.LES_FFPROBE ?? '/usr/bin/ffprobe';
  if (!filled(env.OPENAI_API_KEY) || !filled(env.LTX_API_KEY) || !filled(env.AUTH_SESSION_SECRET) || !filled(env.LES_LIVE_BUDGET_SCOPE)) return null;
  if (!Number.isSafeInteger(maxReservedMicros) || maxReservedMicros <= 0 || maxReservedMicros > C3_BATCH_CEILING_MICROS) return null;
  if (!Number.isSafeInteger(priorSpentMicros) || priorSpentMicros > maxReservedMicros) return null;
  if (!hosts.length || !isAbsolute(ffmpeg) || !isAbsolute(ffprobe) || !isAbsolute(directory)) return null;
  try {
    const store = createLiveGenerationRuntime({
      enabled: true, directory, sessionSecret: env.AUTH_SESSION_SECRET, openaiKey: env.OPENAI_API_KEY, ltxKey: env.LTX_API_KEY,
      budget: { scope: env.LES_LIVE_BUDGET_SCOPE.trim(), priorSpentMicros, maxReservedMicros, ...LIVE_RESERVATIONS },
      media: { ffmpeg, ffprobe, allowedHosts: hosts, maxBytes: 100_000_000 },
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
    const mediaStore = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: env.AUTH_SESSION_SECRET });
    return createGenerationRunner({ store, audioReview: createMachineAudioReview({ read: input => mediaStore.get(input) }) });
  } catch {
    return null;
  }
}
