import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
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

async function toolsFor(c, fault) {
  for (const name of ['ffmpeg', 'ffprobe']) {
    const file = join(c.options.directory, name);
    const content = fault === name ? '#!/bin/sh\necho synthetic-error >&2\nexit 1\n' : `#!/bin/sh\n[ "$1" = "-version" ] || exit 2\necho '${name} version synthetic'\n`;
    await writeFile(file, content, { mode: fault === 'permission' ? 0o600 : 0o700 });
    c.options.media[name] = file;
  }
}

test('T61B runtime preflight: verifies both local tools before exposing staged runtime without network', async () => {
  const { prepareLiveGenerationRuntime } = await import('../../lib/live-generation-runtime.ts');
  const c = await context(); await toolsFor(c);
  let calls = 0;
  const runtime = await prepareLiveGenerationRuntime({ ...c.options, fetch: async () => { calls++; throw new Error('unexpected network'); } });
  const task = await runtime.create(c.input);
  expect(task).toMatchObject({ simulation: false, status: 'awaiting_budget', providerCalls: 0, reservedMicros: 0 });
  expect(calls).toBe(0);
});

for (const fault of ['ffmpeg', 'ffprobe', 'permission', 'missing']) test(`T61B runtime preflight: unavailable ${fault} refuses before any paid operation`, async () => {
  const { prepareLiveGenerationRuntime } = await import('../../lib/live-generation-runtime.ts');
  const c = await context(); await toolsFor(c, fault);
  if (fault === 'missing') c.options.media.ffprobe = join(c.options.directory, 'missing');
  let calls = 0;
  await expect(prepareLiveGenerationRuntime({ ...c.options, fetch: async () => { calls++; throw new Error('unexpected network'); } })).rejects.toThrow();
  expect(calls).toBe(0);
});
