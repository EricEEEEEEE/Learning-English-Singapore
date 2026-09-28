import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Synthetic credentials and transport only. This factory must never read ambient keys.
async function context() {
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-runtime-'));
  const sessionSecret = 'synthetic-runtime-session-secret-only';
  const now = Date.UTC(2026, 8, 28);
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic', email: 'synthetic@example.invalid' }, sessionSecret, now);
  const options = { enabled: true, directory, sessionSecret, openaiKey: 'synthetic-openai', ltxKey: 'synthetic-ltx',
    budget: { scope: 'synthetic-runtime', priorSpentMicros: 900, maxReservedMicros: 1400, scriptMicros: 100, audioMicros: 200, videoMicros: 90000 },
    media: { ffmpeg: '/synthetic/ffmpeg', ffprobe: '/synthetic/ffprobe', allowedHosts: ['media.example.invalid'], maxBytes: 1000000 } };
  return { options, input: { cookie, now, goal: 'Party greeting', revision: 1, requestKey: 'one' } };
}
function wav() {
  const b = Buffer.alloc(16044); b.write('RIFF'); b.writeUInt32LE(16036, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(16000, 40); return b;
}

test('T61B runtime: real adapters receive stored goal and role voices then stop without auto video', async () => {
  const { createLiveGenerationRuntime } = await import('../../lib/live-generation-runtime.ts');
  const c = await context(); const calls = [];
  const translations = Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(k => [k, 'synthetic']));
  const script = { lines: [{ id: 'a', role: 'partner', text: 'Hello', translations }, { id: 'b', role: 'learner', text: 'Hi', translations }], phrases: [{ id: 'p', text: 'Hello', lineId: 'a', translations }], turns: [{ partnerLineId: 'a', learnerLineId: 'b' }] };
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url, body });
    expect(init.headers.Authorization).toBe('Bearer synthetic-openai');
    if (url === 'https://api.openai.com/v1/responses') {
      expect(body.input.find(item => item.role === 'user').content).toBe(c.input.goal);
      return Response.json({ id: 'synthetic-script', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(script) }] }] });
    }
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    return new Response(wav());
  };
  const open = () => createLiveGenerationRuntime({ ...c.options, fetch });
  const task = await open().create(c.input);
  const input = { ...c.input, id: task.id };
  await open().runScript(input);
  expect(calls).toHaveLength(1);
  await open().runAudio(input); await open().runAudio(input);
  expect(calls.map(c => c.body.voice).filter(Boolean)).toEqual(['marin', 'cedar']);
  expect(await open().get(input)).toMatchObject({ simulation: false, status: 'audio_ready', reservedMicros: 500, providerCalls: 3 });
  await expect(open().runAudio(input)).rejects.toThrow();
  expect(calls).toHaveLength(3);
});

for (const fault of ['disabled', 'key', 'budget', 'negative-history', 'ceiling', 'reservation', 'hosts', 'tool']) test(`T61B runtime: incomplete configuration ${fault} refuses before transport`, async () => {
  const { createLiveGenerationRuntime } = await import('../../lib/live-generation-runtime.ts');
  const c = await context(); let calls = 0;
  const options = structuredClone(c.options);
  if (fault === 'disabled') options.enabled = false;
  if (fault === 'key') options.openaiKey = '';
  if (fault === 'budget') delete options.budget;
  if (fault === 'negative-history') options.budget.priorSpentMicros = -1;
  if (fault === 'ceiling') options.budget.maxReservedMicros = 0;
  if (fault === 'reservation') options.budget.audioMicros = 0;
  if (fault === 'hosts') options.media.allowedHosts = [];
  if (fault === 'tool') options.media.ffmpeg = '';
  expect(() => createLiveGenerationRuntime({ ...options, fetch: async () => { calls++; throw new Error('unexpected'); } })).toThrow();
  expect(calls).toBe(0);
});
