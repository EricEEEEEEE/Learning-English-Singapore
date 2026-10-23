import { createHash } from 'node:crypto';

type AudioLine = { id: string; role: 'partner' | 'learner'; text: string };
export type AudioAsset = { lineId: string; role: AudioLine['role']; duration: number; sha256: string; bytes: Uint8Array };
const MAX_BYTES = 4_000_000;

// Restrict to uncompressed PCM WAV; unknown streaming lengths terminate at EOF.
export function wavDuration(bytes: Uint8Array): number {
  const b = Buffer.from(bytes);
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid WAV');
  const riffSize = b.readUInt32LE(4);
  if (riffSize !== 0xffffffff && riffSize + 8 !== b.length) throw new Error('Truncated WAV');
  let byteRate = 0, blockAlign = 0, dataBytes: number | undefined;
  for (let offset = 12; offset < b.length;) {
    if (offset + 8 > b.length) throw new Error('Truncated WAV chunk');
    const tag = b.toString('ascii', offset, offset + 4), declared = b.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (declared === 0xffffffff && tag !== 'data') throw new Error('Invalid streaming chunk');
    const size = declared === 0xffffffff ? b.length - start : declared;
    if (start + size > b.length) throw new Error('Truncated WAV data');
    if (tag === 'fmt ') {
      if (byteRate || size < 16 || b.readUInt16LE(start) !== 1) throw new Error('Unsupported WAV format');
      const channels = b.readUInt16LE(start + 2), rate = b.readUInt32LE(start + 4), bits = b.readUInt16LE(start + 14);
      byteRate = b.readUInt32LE(start + 8); blockAlign = b.readUInt16LE(start + 12);
      if (channels < 1 || channels > 2 || rate < 8000 || rate > 192000 || ![8, 16, 24, 32].includes(bits) || blockAlign !== channels * bits / 8 || byteRate !== rate * blockAlign) throw new Error('Invalid PCM rates');
    } else if (tag === 'data') {
      if (dataBytes !== undefined) throw new Error('Multiple audio data chunks');
      dataBytes = size;
    }
    offset = start + size + (size % 2);
    if (offset > b.length) throw new Error('Missing WAV padding');
  }
  if (!byteRate || !blockAlign || dataBytes === undefined || dataBytes <= 0 || dataBytes % blockAlign !== 0) throw new Error('Invalid audio samples');
  const duration = dataBytes / byteRate;
  if (duration > 20) throw new Error('Audio line exceeds 20 seconds');
  return duration;
}

// marin is a female voice and cedar a male one. The partner's voice follows the gender shown on camera;
// the off-camera learner takes the other voice so the two speakers stay distinct.
export function lineVoice(role: 'partner' | 'learner', partnerGender?: 'female' | 'male') {
  const partner = partnerGender === 'male' ? 'cedar' : 'marin';
  return role === 'partner' ? partner : partner === 'marin' ? 'cedar' : 'marin';
}

type SpeechOptions = { enabled?: boolean; apiKey?: string; fetch?: typeof fetch; partnerGender?: 'female' | 'male' };
export async function generateLineAudio(line: AudioLine, options: SpeechOptions = {}): Promise<AudioAsset> {
  // Course audio stays uncompressed WAV: the video assembly needs it.
  const bytes = await requestSpeech(line, options, 'wav');
  return { lineId: line.id, role: line.role, bytes, duration: wavDuration(bytes), sha256: createHash('sha256').update(bytes).digest('hex') };
}

// C12-4: one speech request in the given format; exactly one request, never retried.
export async function requestSpeech(line: AudioLine, options: SpeechOptions, format: 'wav' | 'mp3'): Promise<Uint8Array> {
  if (options.enabled !== true || !options.apiKey) throw new Error('Audio provider disabled');
  if (!line || typeof line.id !== 'string' || !line.id.trim() || line.id.length > 500 || (line.role !== 'partner' && line.role !== 'learner') || typeof line.text !== 'string' || !line.text.trim() || line.text.length > 500) throw new Error('Invalid audio line');
  let bytes: Uint8Array;
  try {
    const response = await (options.fetch ?? fetch)('https://api.openai.com/v1/audio/speech', {
      method: 'POST', headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts-2025-12-15', voice: lineVoice(line.role, options.partnerGender), input: line.text, response_format: format, instructions: 'Speak slowly and clearly for an adult English beginner, with a natural Singapore English accent. Be respectful and conversational, never exaggerated. Read only the supplied line.' }),
      redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok || !response.body) throw new Error('Audio response failed');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const item = await reader.read(); if (item.done) break;
        size += item.value.length;
        if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Audio response too large'); }
        chunks.push(item.value);
      }
    } finally { reader.releaseLock(); }
    bytes = Buffer.concat(chunks, size);
  } catch { throw new Error('Audio request failed; do not automatically retry'); }
  return bytes;
}

// An MP3 stream starts with an ID3 tag or an MPEG audio frame sync.
export function looksLikeMp3(bytes: Uint8Array) {
  return bytes.length >= 4 && ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
}

// C15-4d: in a scene lesson (learner lines marked silence) lines are packed as "partner line + the learner lines after
// it", so every later segment starts with the partner speaking and its reference frame is taken while she listens.
// When those groups cannot fit four segments of at most 20 s, the line-by-line plan below is used unchanged.
export function planAudioSegments(assets: { lineId: string; duration: number; silence?: boolean }[]): { lineIds: string[]; duration: number }[] {
  const lineByLine = planLineByLine(assets);
  if (!assets.some(asset => asset.silence === true)) return lineByLine;
  const groups: { lineIds: string[]; duration: number }[] = [];
  for (const asset of assets) {
    const group = groups.at(-1);
    if (!group || asset.silence !== true) groups.push({ lineIds: [asset.lineId], duration: asset.duration });
    else { group.lineIds.push(asset.lineId); group.duration += asset.duration; }
  }
  const segments: { lineIds: string[]; duration: number }[] = [];
  for (const group of groups) {
    if (group.duration > 20) return lineByLine;
    const segment = segments.at(-1);
    if (!segment || segment.duration + group.duration > 20) segments.push({ lineIds: [...group.lineIds], duration: group.duration });
    else { segment.lineIds.push(...group.lineIds); segment.duration += group.duration; }
  }
  return segments.length <= 4 ? segments : lineByLine;
}

function planLineByLine(assets: { lineId: string; duration: number }[]): { lineIds: string[]; duration: number }[] {
  if (!Array.isArray(assets) || !assets.length || assets.length > 10) throw new Error('Invalid audio assets');
  const seen = new Set<string>(); const segments: { lineIds: string[]; duration: number }[] = []; let total = 0;
  for (const asset of assets) {
    if (!asset || typeof asset.lineId !== 'string' || !asset.lineId.trim() || seen.has(asset.lineId) || !Number.isFinite(asset.duration) || asset.duration <= 0 || asset.duration > 20) throw new Error('Invalid audio asset');
    seen.add(asset.lineId); total += asset.duration;
    if (total > 60) throw new Error('Audio exceeds 60 seconds');
    let segment = segments.at(-1);
    if (!segment || segment.duration + asset.duration > 20) { segment = { lineIds: [], duration: 0 }; segments.push(segment); }
    segment.lineIds.push(asset.lineId); segment.duration += asset.duration;
    if (segments.length > 4) throw new Error('More than four video segments required');
  }
  return segments;
}
