import { createPracticeTurnService } from './practice-turn';
import { transcribeSpeech, respondInScene, suggestInEnglish, speakReply } from './practice-providers';
import { C3_BATCH_CEILING_MICROS } from './live-scene-runner';

// One turn: a short transcription, one small text reply and one spoken reply stay well under USD0.03.
export const PRACTICE_TURN_MICROS = 30_000;
type GetCourse = Parameters<typeof createPracticeTurnService>[0]['getCourse'];
const whole = (value: string | undefined) => value !== undefined && /^(0|[1-9]\d*)$/.test(value) ? Number(value) : NaN;

// Null unless practice is explicitly enabled and its ceiling, together with the generation ceiling, fits the USD30 batch.
type Log = NonNullable<Parameters<typeof createPracticeTurnService>[0]['log']>;
// C12-4: one line per turn with stage timings (ms) and byte counts only; no transcript, reply or key.
const printTiming: Log = entry => console.info(JSON.stringify(entry));
export function createLivePracticeService(env: Record<string, string | undefined>, directory: string, options: { getCourse: GetCourse; fetch?: typeof fetch; log?: Log }) {
  if (env.LES_LIVE_PRACTICE !== '1' || !env.OPENAI_API_KEY?.trim() || !env.AUTH_SESSION_SECRET?.trim()) return null;
  const practice = whole(env.LES_PRACTICE_MAX_MICROS), generation = env.LES_LIVE_MAX_MICROS === undefined ? 0 : whole(env.LES_LIVE_MAX_MICROS);
  if (!Number.isSafeInteger(practice) || practice <= 0 || !Number.isSafeInteger(generation) || practice + generation > C3_BATCH_CEILING_MICROS) return null;
  const provider = { enabled: true, apiKey: env.OPENAI_API_KEY, ...(options.fetch ? { fetch: options.fetch } : {}) };
  try {
    return createPracticeTurnService({
      directory, sessionSecret: env.AUTH_SESSION_SECRET, maxReservedMicros: practice, turnMicros: PRACTICE_TURN_MICROS, getCourse: options.getCourse, log: options.log ?? printTiming,
      transcribe: audio => transcribeSpeech(audio, provider), respond: context => respondInScene(context, provider), suggest: context => suggestInEnglish(context, provider), speak: input => speakReply(input, provider),
    });
  } catch { return null; }
}
