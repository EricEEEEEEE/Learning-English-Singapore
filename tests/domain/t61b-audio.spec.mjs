import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
const load = () => import('../../lib/generated-audio.ts');
const line = (role = 'partner') => ({ id: 'a', role, text: 'Hello there.' });
// Synthetic PCM, not a voice recording. Duration is encoded in the actual data chunk.
function wav(seconds, sampleRate = 24000) {
  const size = Math.round(seconds * sampleRate) * 2; const b = Buffer.alloc(44 + size);
  b.write('RIFF'); b.writeUInt32LE(36 + size, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(size, 40); return b;
}

test('T61B audio: default disabled even with key and input approval', async () => {
  const { generateLineAudio } = await load(); let calls = 0;
  await expect(generateLineAudio({ ...line(), approved: true }, { apiKey: 'synthetic', fetch: async () => { calls++; return new Response(wav(1)); } })).rejects.toThrow();
  expect(calls).toBe(0);
});

for (const [role, voice] of [['partner', 'marin'], ['learner', 'cedar']]) test(`T61B audio: ${role} uses fixed voice and measured WAV duration`, async () => {
  const { generateLineAudio } = await load(); const bytes = wav(1.25); let calls = 0;
  const result = await generateLineAudio(line(role), { enabled: true, apiKey: 'synthetic', fetch: async (url, options) => {
    calls++; expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toMatchObject({ model: 'gpt-4o-mini-tts-2025-12-15', voice, input: line().text, response_format: 'wav' });
    expect(options.redirect).toBe('error'); expect(options.signal).toBeTruthy();
    return new Response(bytes, { headers: { 'Content-Type': 'audio/wav' } });
  } });
  expect(calls).toBe(1);
  expect(result).toMatchObject({ lineId: 'a', role, duration: 1.25, sha256: createHash('sha256').update(bytes).digest('hex') });
  expect(Buffer.from(result.bytes)).toEqual(bytes);
});

test('T61B audio: completed streaming WAV with unknown-size sentinels uses actual bytes', async () => {
  const { generateLineAudio } = await load(); const bytes = wav(2);
  bytes.writeUInt32LE(0xffffffff, 4); bytes.writeUInt32LE(0xffffffff, 40);
  const result = await generateLineAudio(line(), { enabled: true, apiKey: 'synthetic', fetch: async () => new Response(bytes) });
  expect(result.duration).toBe(2);
  expect(Buffer.from(result.bytes)).toEqual(bytes);
});

for (const kind of ['timeout', 'http', 'not-wav', 'truncated', 'over-20s', 'invalid-byte-rate']) test(`T61B audio: ${kind} fails without retry`, async () => {
  const { generateLineAudio } = await load(); let calls = 0;
  await expect(generateLineAudio(line(), { enabled: true, apiKey: 'synthetic', fetch: async () => {
    calls++;
    if (kind === 'timeout') throw new Error('private provider details');
    if (kind === 'http') return new Response('private provider details', { status: 429 });
    if (kind === 'not-wav') return new Response('not audio');
    if (kind === 'truncated') return new Response(wav(1).subarray(0, 44));
    if (kind === 'invalid-byte-rate') { const b = wav(1); b.writeUInt32LE(1, 28); return new Response(b); }
    return new Response(wav(20.01));
  } })).rejects.toThrow();
  expect(calls).toBe(1);
});

test('T61B audio: invalid role and empty input fail before transport', async () => {
  const { generateLineAudio } = await load(); let calls = 0;
  for (const item of [{ ...line(), role: ['partner'] }, { ...line(), text: ' ' }]) await expect(generateLineAudio(item, { enabled: true, apiKey: 'synthetic', fetch: async () => { calls++; return new Response(wav(1)); } })).rejects.toThrow();
  expect(calls).toBe(0);
});

test('T61B audio: segment planner preserves sentence order and real timing without padding', async () => {
  const { planAudioSegments } = await load();
  const assets = [12, 9, 5, 18].map((duration, i) => ({ lineId: `l${i}`, duration }));
  expect(planAudioSegments(assets)).toEqual([
    { lineIds: ['l0'], duration: 12 }, { lineIds: ['l1', 'l2'], duration: 14 }, { lineIds: ['l3'], duration: 18 },
  ]);
});

for (const [name, durations] of [['total over 60', [20, 20, 20, 1]], ['more than four segments', [11, 11, 11, 11, 11]], ['one line too long', [21]], ['invalid duration', [NaN]], ['zero', [0]]]) test(`T61B audio: planner rejects ${name} before video submission`, async () => {
  const { planAudioSegments } = await load();
  expect(() => planAudioSegments(durations.map((duration, i) => ({ lineId: `l${i}`, duration })))).toThrow();
});
