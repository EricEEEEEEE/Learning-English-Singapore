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
