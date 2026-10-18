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
// C15-2c: each note quotes the learner, so only the help-language rule decides (understood notes need a quote or wording).
for (const [language, note, kept] of [
  ['zh-Hans', '"Is it allowed" can be simplified to Can I do this?', false],
  ['zh-Hans', '"Is it allowed" 可以更简单地说 Can I do this?', true],
  ['ja', 'Instead of "Is it allowed" you can also say Can I do this?', false],
  ['ja', '"Is it allowed" は Can I do this? と言ってもいいです。', true],
  ['ko', 'Try saying Can I do this? for "Is it allowed"', false],
  ['ko', '"Is it allowed" 는 Can I do this? 라고 해도 돼요.', true],
  ['hi', 'Say Can I do this? instead of "Is it allowed".', false],
  ['hi', '"Is it allowed" की जगह आप Can I do this? भी कह सकते हैं।', true],
  ['id', 'Selain "Is it allowed", bisa juga bilang Can I do this?', true],
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

// C15-2c (2026-10-18 real re-check, round 2 after C15-2b, see docs/evidence/c15-prompt-spotcheck.md "修复后复查"): the prompt
// alone still let through RC-R7a (goalChange set, reply already accepts "three packets"), RC-R3d / RC2-R3b (understood false,
// the reply still follows the small talk) and RC2-R2b / RC-R7b / RC2-R3d (praise or instructions as a coach note on an
// understandable answer). These tests pin the zero-cost deterministic fallbacks in the turn service; every provider is a fake.
const hawker = () => ({
  id: 'c15-2c-hawker', lines: [
    { id: 'p1', role: 'partner', text: 'Hi auntie, what would you like today?' }, { id: 'l1', role: 'learner', text: 'One chicken rice, please.' },
    { id: 'p2', role: 'partner', text: 'Okay. Steamed or roasted chicken? Eat here or take away?' }, { id: 'l2', role: 'learner', text: 'Steamed, eat here.' },
    { id: 'p3', role: 'partner', text: 'Please take this number and wait for your food.' }, { id: 'l3', role: 'learner', text: 'Okay, thank you.' },
  ],
  turns: [{ partnerLineId: 'p1', learnerLineId: 'l1' }, { partnerLineId: 'p2', learnerLineId: 'l2' }, { partnerLineId: 'p3', learnerLineId: 'l3' }],
});
async function fallbackSetup({ transcript = 'One chicken rice, please.', value = answer() } = {}) {
  const { createPracticeTurnService } = await import('../../lib/practice-turn.ts');
  const cookie = await sealGoogleSession(identity('c15-2c-owner'), secret, now);
  const course = hawker(), calls = { respond: 0, speak: [] };
  const service = createPracticeTurnService({
    directory: await mkdtemp(join(tmpdir(), 'les-c15-2c-turn-')), sessionSecret: secret, maxReservedMicros: 10_000_000, turnMicros: 100_000,
    getCourse: async () => course,
    transcribe: async () => ({ text: transcript }),
    respond: async () => { calls.respond++; return typeof value === 'function' ? value() : value; },
    speak: async input => { calls.speak.push(input); return { bytes: Buffer.from('ID3 partner mp3'), mimeType: 'audio/mpeg' }; },
  });
  const turn = (over = {}) => service.turn({ cookie, now: now + 1, courseId: course.id, revision: 1, turnIndex: 0, language: 'zh-Hans', history: [], audio: { bytes: Buffer.from('synthetic learner speech'), mimeType: 'audio/webm' }, ...over });
  return { turn, calls };
}

// ---- 1. a proposed goal change is only ever confirmed, never accepted, in the spoken reply ----

test('C15-2c R7 / F9.3: with a goalChange the spoken reply is its confirm question, not the model reply that already accepts the new task', async () => {
  const goalChange = { summary: '打包三份鸡饭带回家', confirm: 'You want three packets to take home, right?' };
  const { turn, calls } = await fallbackSetup({ transcript: 'Can I order three packets to take home for my family instead?', value: answer({ reply: 'Sure, three packets to take away. Will you want steamed or roasted chicken?', goalChange }) });
  const result = await turn();
  expect(result).toMatchObject({ kind: 'reply', goalChange, done: false, reply: { text: goalChange.confirm } });
  expect(calls.speak).toEqual([{ text: goalChange.confirm }]);
});

test('C15-2c R7: a confirm question that is not one English question is replaced by a fixed English check, never the accepting reply', async () => {
  for (const confirm of ['你想改成明天下午来，对吗？', 'Okay, tomorrow afternoon is fine.']) {
    const goalChange = { summary: '改到明天下午来', confirm };
    const { turn, calls } = await fallbackSetup({ transcript: 'Sorry, can I come back tomorrow afternoon instead?', value: answer({ reply: 'Okay, no problem. Tomorrow afternoon is fine.', goalChange }) });
    const result = await turn();
    expect(result.goalChange).toEqual(goalChange);
    expect(result.reply.text).toBe('Just to check, you want to change the plan, right?');
    expect(calls.speak).toEqual([{ text: 'Just to check, you want to change the plan, right?' }]);
  }
});

// ---- 2. when the partner did not understand, the reply is one short question about the scene ----

for (const [name, transcript, reply, turnIndex, expected] of [
  ['answers the small talk first, then asks (RC-R3d)', 'The weather is so hot today. Do you like durian?', 'Yes, I like durian very much. What would you like to eat?', 0, 'Hi auntie, what would you like today?'],
  ['follows the new topic in one question (RC2-R3b)', 'My son goes to school near here.', 'Oh, where is his school?', 0, 'Hi auntie, what would you like today?'],
  ['is not a question', 'Uh... the... rice... ah...', 'Sorry, I do not understand.', 1, 'Eat here or take away?'],
  ['is two questions', 'Uh... the... rice... ah...', 'Sorry? What do you want?', 1, 'Eat here or take away?'],
  ['has no question in the partner line, so the line becomes one', 'Uh... number... ah...', 'Sorry, I do not understand you.', 2, 'Please take this number and wait for your food, okay?'],
]) test(`C15-2c R3 / F9.2: a not-understood reply that ${name} is replaced by the current partner line from the stored course`, async () => {
  const { turn, calls } = await fallbackSetup({ transcript, value: answer({ understood: false, reply }) });
  const result = await turn({ turnIndex });
  expect(result).toMatchObject({ kind: 'reply', understood: false, reply: { text: expected } });
  expect(calls.speak).toEqual([{ text: expected }]);
  expect(calls.respond).toBe(1);
});

test('C15-2c R3: a not-understood reply that is one short question about the scene is kept; an understood reply is never touched', async () => {
  const clarify = 'Do you want chicken rice or some other rice?';
  let { turn } = await fallbackSetup({ transcript: 'Uh... the... rice... ah...', value: answer({ understood: false, reply: clarify }) });
  expect((await turn()).reply.text).toBe(clarify);
  const followed = 'Okay, roasted chicken, no chili. For your child, white rice or chicken only?';
  ({ turn } = await fallbackSetup({ transcript: 'Roasted one, no chili. My child eats also.', value: answer({ reply: followed }) }));
  expect((await turn()).reply.text).toBe(followed);
});

// ---- 3. an understandable answer gets a coach note only when it quotes the learner or suggests wording ----

const learnerSaid = 'Chili no want, chicken the steam.';
for (const [name, note, kept] of [
  ['praise without a quote (RC-R7b)', '问句表示确认，适合初学者。', false],
  ['an instruction about what to do next (RC2-R3d)', '不要换话题，回答对方的问题。', false],
  ['an explanation of the partner\'s words', 'steamed 是白切鸡的意思。', false],
  ['a quote in Chinese that the learner did not say (formerly kept by C12-2)', '“不要辣” 的意思很清楚。', false],
  ['a quote of the learner\'s own words', '“Chili no want” 可以说得更自然。', true],
  ['suggested wording joined by the provider', '可以说得更自然 → No chili, please.', true],
]) test(`C15-2c R4 / F8.3: on an understood answer, ${name} ${kept ? 'keeps' : 'drops'} the coach note; the reply stays`, async () => {
  const { turn } = await fallbackSetup({ transcript: learnerSaid, value: answer({ coachNote: note }) });
  expect(await turn()).toMatchObject({ kind: 'reply', understood: true, coachNote: kept ? note : null, reply: { text: answer().reply } });
});

test('C15-2c R4 / C12-2: when the meaning was unclear, a note without a quote is still kept (C12-2 rows formerly kept on understood answers)', async () => {
  for (const note of ['可以说 Could we move it to Friday? 也很自然。', '“改到星期五” 的意思很清楚。', '可以说 Friday morning。']) {
    const { turn } = await fallbackSetup({ transcript: 'Can we change to Friday instead?', value: answer({ understood: false, reply: 'Do you want chicken rice today?', coachNote: note }) });
    expect(await turn()).toMatchObject({ understood: false, coachNote: note });
  }
});

test('C15-2c R4: the provider\'s suggested-wording join is what the turn service recognises, so a real note with wording is kept', async () => {
  const { result } = await partnerTurn({ transcript: learnerSaid }, answer({ coachNote: '这样说有点不自然。', suggestedWording: 'No chili, please.' }));
  const { turn } = await fallbackSetup({ transcript: learnerSaid, value: result });
  expect((await turn()).coachNote).toBe('这样说有点不自然。 → No chili, please.');
});
