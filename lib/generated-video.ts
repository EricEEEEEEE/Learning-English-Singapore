import { createHash } from 'node:crypto';
import type { encodeVideoAudio } from './encode-video-audio';
type Options = { enabled?: boolean; apiKey?: string; fetch?: typeof fetch };
type VideoInput = { audioUri: string; duration: number; prompt: string };
type Submission = { status: 'pending'; jobId: string } | { status: 'submission_unknown' };
type VideoStatus = { jobId: string; status: 'pending' | 'processing' | 'failed' } | { jobId: string; status: 'completed'; videoUrl: string };
const endpoint = 'https://api.ltx.io/v2/audio-to-video';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const jobId = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(v);
const httpsUri = (v: unknown): v is string => {
  if (typeof v !== 'string' || v.length > 8192) return false;
  try { const url = new URL(v); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && !url.hash; } catch { return false; }
};
function configured(options: Options) {
  if (options.enabled !== true || !options.apiKey) throw new Error('Video provider disabled');
  return { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' };
}

// Internal transport only. Caller must durably reserve and bind the measured audio asset.
export async function submitVideoSegment(input: VideoInput, options: Options = {}): Promise<Submission> {
  const headers = configured(options);
  if (!input || !httpsUri(input.audioUri) || !Number.isFinite(input.duration) || input.duration <= 0 || input.duration > 20 || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 5000) throw new Error('Invalid video input');
  return submit(input, options, headers);
}

// Server-internal only: the caller owns durable budget reservation and review provenance.
export async function submitEncodedVideoSegment(input: { audio: Awaited<ReturnType<typeof encodeVideoAudio>>; prompt: string }, options: Options & { reviewedSha256?: string } = {}): Promise<Submission> {
  const headers = configured(options);
  const audio = input?.audio;
  if (!audio || !(audio.bytes instanceof Uint8Array) || !audio.bytes.length || audio.bytes.length > 11_250_000 || audio.mimeType !== 'audio/mp4' || audio.decoded !== true || !Number.isFinite(audio.duration) || audio.duration <= 0 || audio.duration > 20 || !Number.isFinite(audio.sourceDuration) || audio.sourceDuration <= 0 || audio.sourceDuration > 20 || Math.abs(audio.duration - audio.sourceDuration) > 1024 / 8000 + 0.001001 || typeof audio.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(audio.sourceSha256) || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 5000) throw new Error('Invalid encoded video input');
  const bytes = Buffer.from(audio.bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== audio.sha256 || sha256 !== options.reviewedSha256) throw new Error('Encoded audio review mismatch');
  const audioUri = `data:audio/mp4;base64,${bytes.toString('base64')}`;
  // Include the URI prefix in the conservative 15 MB encoded-input limit.
  if (Buffer.byteLength(audioUri) > 15_000_000) throw new Error('Encoded audio too large');
  return submit({ audioUri, duration: audio.duration, prompt: input.prompt }, options, headers);
}

async function submit(input: VideoInput, options: Options, headers: Record<string, string>): Promise<Submission> {
  try {
    const response = await (options.fetch ?? fetch)(endpoint, {
      method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ audio_uri: input.audioUri, prompt: input.prompt, model: 'ltx-2-5-fast', resolution: '720x1280', fps: 24 }),
    });
    if (response.status !== 202) return { status: 'submission_unknown' };
    const body: unknown = await response.json();
    return object(body) && jobId(body.id) ? { jobId: body.id, status: 'pending' } : { status: 'submission_unknown' };
  } catch { return { status: 'submission_unknown' }; }
}

// A single read, with no implicit polling loop, submission, download or course publication.
export async function queryVideoSegment(id: string, options: Options = {}): Promise<VideoStatus> {
  const headers = configured(options);
  if (!jobId(id)) throw new Error('Invalid video job ID');
  let body: unknown;
  try {
    const response = await (options.fetch ?? fetch)(`${endpoint}/${id}`, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error('Query failed');
    body = await response.json();
  } catch { throw new Error('Video status unavailable'); }
  if (!object(body) || body.id !== id) throw new Error('Invalid video status');
  if (body.status === 'pending' || body.status === 'processing' || body.status === 'failed') return { jobId: id, status: body.status };
  if (body.status === 'completed' && object(body.result) && httpsUri(body.result.video_url)) return { jobId: id, status: 'completed', videoUrl: body.result.video_url };
  throw new Error('Invalid video result');
}
