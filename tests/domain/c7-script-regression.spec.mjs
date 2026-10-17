import { test, expect } from '@playwright/test';
import { scriptOutputs, knownBlindSpots } from '../fixtures/c7-script-outputs.mjs';

// C7 T32A: offline content regression. A fixed set of synthetic script outputs, good and bad, must be accepted or
// rejected by the same validator the generation task and the course builder use. The adapter is driven with a fake
// fetch, so nothing here reaches OpenAI.
const load = () => import('../../lib/generated-script.ts');
const words = text => text.toLowerCase().match(/[a-z0-9]+(?:['’][a-z0-9]+)*/g) ?? [];
const response = value => ({ id: 'resp_c7_synthetic', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });

test('C7 T32A: the fixture set covers good scripts and every listed failure kind', () => {
  expect(scriptOutputs.length + knownBlindSpots.length).toBeGreaterThanOrEqual(12);
  expect(scriptOutputs.filter(item => item.expect === 'accept').length).toBeGreaterThanOrEqual(3);
  const issues = new Set(scriptOutputs.filter(item => item.expect === 'reject').map(item => item.issue));
  for (const kind of ['alternation', 'turn-order', 'turn-adjacent', 'opening-role', 'length', 'line', 'phrase', 'english', 'phrase-source']) expect(issues.has(kind), kind).toBe(true);
  for (const item of knownBlindSpots) expect(item.reason.length, item.name).toBeGreaterThan(20);
});

test('C7 T32A: the accepted scene fixtures are real 50-second-sized scripts (10 lines, 5 turns, 115-160 words)', async () => {
  const { SCENE_MIN_WORDS, SCENE_MAX_WORDS } = await load();
  for (const item of scriptOutputs.filter(entry => entry.expect === 'accept' && entry.script.scene)) {
    const count = item.script.lines.reduce((sum, line) => sum + words(line.text).length, 0);
    expect(item.script.lines, item.name).toHaveLength(10);
    expect(item.script.turns, item.name).toHaveLength(5);
    expect(count, item.name).toBeGreaterThanOrEqual(SCENE_MIN_WORDS);
    expect(count, item.name).toBeLessThanOrEqual(SCENE_MAX_WORDS);
  }
});

for (const item of scriptOutputs) test(`C7 T32A: validator ${item.expect}s — ${item.name}`, async () => {
  const { validateGeneratedScript } = await load();
  const result = validateGeneratedScript(structuredClone(item.script));
  if (item.expect === 'accept') expect(result).toEqual({ ok: true, value: item.script });
  else {
    expect(result.ok).toBe(false);
    expect(result.issues).toContain(item.issue);
  }
});

test('C7 T32A: the script adapter returns accepted fixtures and refuses rejected ones without retrying', async () => {
  const { generateSceneScript } = await load();
  for (const item of scriptOutputs) {
    let calls = 0;
    const run = generateSceneScript({ goal: 'synthetic scene' }, { enabled: true, apiKey: 'synthetic-only', fetch: async () => { calls++; return Response.json(response(item.script)); } });
    if (item.expect === 'accept') expect(await run, item.name).toEqual({ requestId: 'resp_c7_synthetic', script: item.script });
    else await expect(run, item.name).rejects.toThrow('Script material validation failed');
    expect(calls, item.name).toBe(1);
  }
});

test('C7 T32A: known blind spots are recorded with what the validator does today', async () => {
  const { validateGeneratedScript } = await load();
  for (const item of knownBlindSpots) expect(validateGeneratedScript(structuredClone(item.script)).ok ? 'accept' : 'reject', item.name).toBe(item.currentResult);
});

test('C7 T32A: the script prompt still tells the model to keep each role to its own knowledge and to write English lines', async () => {
  const { generateSceneScript } = await load();
  let body;
  await generateSceneScript({ goal: 'synthetic scene' }, { enabled: true, apiKey: 'synthetic-only', fetch: async (_url, options) => { body = JSON.parse(options.body); return Response.json(response(scriptOutputs[0].script)); } });
  const system = body.input.find(item => item.role === 'system').content;
  expect(system).toContain('never give information that belongs to the partner role to the learner');
  expect(system).toMatch(/lines alternate strictly partner, learner/);
  expect(system).toMatch(/every line text in English/i);
});
