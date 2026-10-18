import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sealGoogleSession } from '../../lib/google-auth.ts';
import { courseFixture } from '../fixtures/t60-course.mjs';

// C15-2 (2026-10-18 real spot check, 29 gpt-4.1-mini turns + 1 gpt-4.1 script, see docs/evidence/c15-prompt-spotcheck.md):
// the rules the real model did not keep become red tests here. Every provider is a fake; these tests pin the fixed
// prompt wording and the one deterministic check, not what the real model will do with them.
const secret = 'c15-prompt-fixes-synthetic-secret-at-least-32';
const now = Date.UTC(2026, 9, 18, 13);
const identity = s => ({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: s, email: 'synthetic@example.invalid' });
const answer = over => ({ reply: 'Okay. Eat here or take away?', understood: true, done: false, coachNote: null, goalChange: null, ...over });
const completed = value => ({ id: 'resp', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
const context = over => ({ partnerLine: 'Hi, what would you like today?', expectedLearnerLine: 'One chicken rice, please.', sceneLines: [{ role: 'partner', text: 'Hi, what would you like today?' }, { role: 'learner', text: 'One chicken rice, please.' }], transcript: 'One chicken rice, please.', history: [], language: 'zh-Hans', focus: 'normal', correction: 'normal', goal: null, safety: null, ...over });

async function partnerSystem() {
  const { respondInScene } = await import('../../lib/practice-providers.ts'); const bodies = [];
  await respondInScene(context(), { enabled: true, apiKey: 'synthetic', fetch: async (_u, o) => { bodies.push(JSON.parse(o.body)); return Response.json(completed(answer())); } });
  return bodies[0].input.find(x => x.role === 'system').content;
}

// Spot check R7a/R7b: "three packets to take home" and "tomorrow afternoon instead" were accepted at once, goalChange null.
test('C15-2 R7 / F9.3: a different quantity, time, place or extra request goes through goalChange first; small choices are just followed', async () => {
  const system = await partnerSystem();
  expect(system).toMatch(/small choice inside the same task/i);
  expect(system).toMatch(/different quantity/i);
  expect(system).toMatch(/do not accept it yet/i);
  // The older C6 / C9 wording stays.
  expect(system).toMatch(/changes? (their|his or her) mind/i);
  expect(system).toMatch(/do not switch yet/i);
});

// Spot check R3b: "My son goes to school near here." was followed as small talk with understood true.
test('C15-2 R3 / F9.2: talk unrelated to the scene goal is not followed; one question brings the learner back', async () => {
  const system = await partnerSystem();
  expect(system).toMatch(/unrelated to the scene goal/i);
  expect(system).toMatch(/do not follow the new topic/i);
  expect(system).toMatch(/one short clarifying question/i);
});

// Spot check: 25 of 27 replies carried a coach note, many on correct answers (praise, explaining the partner's words).
test('C15-2 R4 / F8.3: the prompt keeps the coach note empty for an understandable answer and never uses it to praise or explain', async () => {
  const system = await partnerSystem();
  expect(system).toMatch(/keep coachNote null when the learner's answer is understandable/i);
  expect(system).toMatch(/never use coachNote to praise/i);
});

// Spot check R11b: the learner answered the script's last partner line and the partner went on (done false).
test('C15-2 R11 / F9.4: answering the last partner line of the script finishes the scene', async () => {
  expect(await partnerSystem()).toMatch(/last partner line of the script/i);
});

// Spot check R8c: "嗯……那个……" (fillers only) got a guessed sentence from the script with understood true.
test('C15-2 R8 / F5.3: a native-language turn with only fillers is not understood, and the meaning is never guessed from the script', async () => {
  const { suggestInEnglish } = await import('../../lib/practice-providers.ts'); const bodies = [];
  await suggestInEnglish(context({ transcript: '嗯……那个……' }), { enabled: true, apiKey: 'synthetic', fetch: async (_u, o) => { bodies.push(JSON.parse(o.body)); return Response.json(completed({ understood: false, suggestion: null })); } });
  const system = bodies[0].input.find(x => x.role === 'system').content;
  expect(system).toMatch(/only fillers/i);
  expect(system).toMatch(/never guess the meaning from the scene/i);
});

// Spot check R10d: with Simplified Chinese help the model wrote the coach note in English.
async function setup(note) {
  const { createPracticeTurnService } = await import('../../lib/practice-turn.ts');
  const cookie = await sealGoogleSession(identity('c15-owner'), secret, now);
  const course = courseFixture();
  const service = createPracticeTurnService({
    directory: await mkdtemp(join(tmpdir(), 'les-c15-turn-')), sessionSecret: secret, maxReservedMicros: 10_000_000, turnMicros: 100_000,
    getCourse: async () => course,
    transcribe: async () => ({ text: 'Is it allowed to change my job?' }),
    respond: async () => answer({ coachNote: note }),
    speak: async () => ({ bytes: Buffer.from('ID3 partner mp3'), mimeType: 'audio/mpeg' }),
  });
  return language => service.turn({ cookie, now: now + 1, courseId: course.id, revision: 1, turnIndex: 0, language, history: [], audio: { bytes: Buffer.from('synthetic learner speech'), mimeType: 'audio/webm' } });
}
for (const [language, note, kept] of [
  ['zh-Hans', 'Is it allowed? can be simplified to Can I do this?', false],
  ['zh-Hans', '可以更简单地说 Can I do this?', true],
  ['ja', 'You can also say Can I do this?', false],
  ['ja', 'Can I do this? と言ってもいいです。', true],
  ['ko', 'Try saying Can I do this?', false],
  ['ko', 'Can I do this? 라고 해도 돼요.', true],
  ['hi', 'Say Can I do this? instead.', false],
  ['hi', 'आप Can I do this? भी कह सकते हैं।', true],
  ['id', 'Bisa juga bilang Can I do this?', true],
]) test(`C15-2 R10d / F8.3: a ${language} coach note ${kept ? 'in the help language is kept' : 'written only in English is dropped'}; the reply stays`, async () => {
  const turn = await setup(note);
  expect(await turn(language)).toMatchObject({ kind: 'reply', coachNote: kept ? note : null, reply: { text: answer().reply } });
});

// C13-3 real script: 3,889 of 4,000 output tokens with two alternatives a turn (97%); three alternatives would be cut off.
test('C15-2 C13-3: the script request leaves room for three alternatives a turn, and the live reservation covers the worst case', async () => {
  const { generateSceneScript } = await import('../../lib/generated-script.ts');
  const { LIVE_RESERVATIONS } = await import('../../lib/live-scene-runner.ts');
  const bodies = [];
  await generateSceneScript({ goal: 'Order chicken rice at a hawker centre.' }, { enabled: true, apiKey: 'synthetic', fetch: async (_u, o) => { bodies.push(JSON.parse(o.body)); return Response.json({ id: 'resp', status: 'incomplete', output: [] }); } }).catch(() => {});
  const body = bodies[0];
  expect(body.max_output_tokens).toBeGreaterThanOrEqual(6000);
  // gpt-4.1 standard price 2026-10-18: USD2 / 8 per 1M input / output tokens; the payload gate is 20,000 bytes (each byte at most one token).
  expect(LIVE_RESERVATIONS.scriptMicros).toBeGreaterThanOrEqual(body.max_output_tokens * 8 + 20_000 * 2);
});

// C13-3 real script: both sg-colloquial lines and phrases came back with useAdvice "say".
test('C15-2 C13-3: the script prompt asks for hear-only or casual-ok on every sg-colloquial item', async () => {
  const { generateSceneScript } = await import('../../lib/generated-script.ts'); const bodies = [];
  await generateSceneScript({ goal: 'Order chicken rice at a hawker centre.' }, { enabled: true, apiKey: 'synthetic', fetch: async (_u, o) => { bodies.push(JSON.parse(o.body)); return Response.json({ id: 'resp', status: 'incomplete', output: [] }); } }).catch(() => {});
  const system = bodies[0].input.find(x => x.role === 'system').content;
  expect(system).toMatch(/every sg-colloquial item takes useAdvice hear-only or casual-ok, never say/i);
});

// C15-2b (2026-10-18 real re-check, 12 gpt-4.1-mini turns after C15-2a, see docs/evidence/c15-prompt-spotcheck.md "修复后复查"):
// RC-R3b still followed "My son goes to school near here." (understood true), RC-R11b still went on after the last partner
// line (done false), RC-R7a accepted the new quantity in the reply while setting goalChange, and RC-R4b / RC-R6b still put the
// suggested wording in quotation marks ("have brought"), so C12-2 drops the note. The fixes below are pinned with fakes only.
const partnerTurn = async (over = {}, value = answer()) => {
  const { respondInScene } = await import('../../lib/practice-providers.ts'); const bodies = [];
  const result = await respondInScene(context(over), { enabled: true, apiKey: 'synthetic', fetch: async (_u, o) => { bodies.push(JSON.parse(o.body)); return Response.json(completed(value)); } });
  return { result, schema: bodies[0].text.format.schema, system: bodies[0].input.find(x => x.role === 'system').content };
};
const twoTurns = [{ role: 'partner', text: 'Hi, what would you like today?' }, { role: 'learner', text: 'One chicken rice, please.' }, { role: 'partner', text: 'Eat here or take away?' }, { role: 'learner', text: 'Eat here, please.' }];

test('C15-2b R3 / R7 / R11: the model decides understood, done and goalChange before it writes the reply, and the reply must match them', async () => {
  const { schema, system } = await partnerTurn();
  expect(Object.keys(schema.properties).slice(0, 4)).toEqual(['understood', 'done', 'goalChange', 'reply']);
  expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
  expect(system).toMatch(/decide understood, done and goalChange first/i);
  expect(system).toMatch(/when goalChange is set, the reply is its confirm question/i);
  expect(system).toMatch(/when understood is false, the reply does not answer or follow the unrelated topic/i);
});

test('C15-2b R11: on the script\'s last turn the prompt says so and asks for done; earlier turns do not get that line', async () => {
  const last = await partnerTurn({ sceneLines: twoTurns, partnerLine: twoTurns[2].text, expectedLearnerLine: twoTurns[3].text });
  expect(last.system).toMatch(/this is the last turn of the script/i);
  const first = await partnerTurn({ sceneLines: twoTurns, partnerLine: twoTurns[0].text, expectedLearnerLine: twoTurns[1].text });
  expect(first.system).not.toMatch(/this is the last turn of the script/i);
});

test('C15-2b C12-2: suggested English wording has its own field, so the coach note only quotes the learner', async () => {
  const { schema, system } = await partnerTurn();
  expect([...schema.properties.suggestedWording.type].sort()).toEqual(['null', 'string']);
  expect(schema.required).toContain('suggestedWording');
  expect(system).toMatch(/put the suggested English wording only in suggestedWording, never in coachNote/i);
});

test('C15-2b C12-2: the provider joins the suggested wording to the note without quotation marks, and the turn service keeps it', async () => {
  const { quotesOnlyLearnerWords } = await import('../../lib/practice-turn.ts');
  const transcript = 'Yes I have bring the passport and letter.';
  const { result } = await partnerTurn({ transcript }, answer({ coachNote: '"have bring" 要用过去分词。', suggestedWording: '"I have brought my passport and letter."' }));
  expect(result.coachNote).toBe('"have bring" 要用过去分词。 → I have brought my passport and letter.');
  expect(quotesOnlyLearnerWords(result.coachNote, transcript)).toBe(true);
  expect(Object.keys(result).sort()).toEqual(['coachNote', 'done', 'goalChange', 'reply', 'understood']);
  // No note, no wording on its own; a join longer than the note limit keeps the note only; an older answer without the field still parses.
  expect((await partnerTurn({}, answer({ coachNote: null, suggestedWording: 'No chili, please.' }))).result.coachNote).toBeNull();
  const long = '可以更简单地说。'.repeat(13);
  expect((await partnerTurn({}, answer({ coachNote: long, suggestedWording: 'I have brought my passport and my appointment letter.' }))).result.coachNote).toBe(long);
  expect((await partnerTurn({}, answer({ coachNote: '可以更简单。' }))).result.coachNote).toBe('可以更简单。');
});
