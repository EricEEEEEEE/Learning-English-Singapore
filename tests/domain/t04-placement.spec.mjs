import { test, expect } from '@playwright/test';

// Synthetic, editor-reviewed observation fixtures exercise rules only.
// They are never imported into the browser or reported as real study results.
const load = () => import('../../lib/placement.ts');
const at = '2026-09-12T04:00:00.000Z';
const options = { as_of: at, previous_extra_question_ids: [], ended: false };
const item = (id, band = 'L1', topic = 'daily', patch = {}) => ({
  question_id: id, band, topic, task_type: 'intent', tags: ['intent'],
  first_response: 'correct', prompt_played_before_choice: true,
  device_failure_before_choice: false, answer_before_choice: false,
  translation_before_choice: false, answer_needed: false, replay_count: 0,
  source: 'observed', reviewed: true, local_voice_id: null,
  local_voice_reviewed: false, is_followup: false, recorded_at: at, ...patch,
});
const pair = band => [item(`${band}-a`, band, 'daily'), item(`${band}-b`, band, 'school')];
const lower = band => ['L1', 'L2', 'L3'].slice(0, Number(band.slice(1)) - 1).flatMap(pair);
const ids = records => records.map(record => record.question_id);
async function evaluate(records, patch = {}) {
  return (await load()).evaluatePlacement(records, { ...options, ...patch });
}
function unknown(profile) {
  expect(profile).toMatchObject({ rule_version: 'placement_rules_v1', listening_band: null,
    placement_status: 'unknown', recommended_content_band: 'L0', evidence_confidence: 'insufficient',
    support_level: 'full', speaking_status: 'unobserved', local_listening_familiarity: 'unknown', evidence_date: at });
  expect(profile.evidence.valid_question_ids).toEqual([]);
}
function band(profile, level) {
  expect(profile).toMatchObject({ listening_band: level, placement_status: 'provisional',
    recommended_content_band: level, speaking_status: 'unobserved', evidence_date: at });
}

test('T04: empty, all skipped and all unknown remain unknown, never measured L0', async () => {
  unknown(await evaluate([]));
  unknown(await evaluate([item('skip', 'L0', 'daily', { first_response: 'skipped', answer_needed: true }),
    item('unknown', 'L0', 'school', { first_response: 'unknown', answer_needed: true }),
    item('blank', 'L0', 'work', { first_response: 'unanswered' })]));
});

test('T04: a lucky isolated L4 answer cannot bypass prerequisites or create speaking evidence', async () => {
  const profile = await evaluate([item('lucky', 'L4', 'daily', { local_voice_id: 'sg-1', local_voice_reviewed: true })]);
  expect(profile.listening_band).toBeNull();
  expect(profile.placement_status).toBe('unknown');
  expect(profile.recommended_content_band).toBe('L0');
  expect(profile.evidence.success_question_ids).toEqual(['lucky']);
  expect(profile.speaking_status).toBe('unobserved');
});

test('T04: L0 needs two attempted playable basic tasks still needing answer demonstration', async () => {
  const a = item('base-a', 'L0', 'daily', { first_response: 'incorrect', answer_needed: true });
  const b = item('base-b', 'L0', 'school', { first_response: 'incorrect', answer_needed: true });
  expect((await evaluate([a])).listening_band).toBeNull();
  band(await evaluate([a, b]), 'L0');
  expect((await evaluate([a, { ...b, answer_needed: false }])).listening_band).toBeNull();
  expect((await evaluate([a, { ...b, device_failure_before_choice: true }])).listening_band).toBeNull();
});

test('T04: two L1 topics suffice without L0 evidence; replays preserve independent success', async () => {
  const records = pair('L1').map((row, index) => ({ ...row, replay_count: index + 1 }));
  const before = structuredClone(records);
  const profile = await evaluate(records);
  band(profile, 'L1');
  expect(profile.evidence_confidence).toBe('provisional');
  expect(profile.evidence.success_question_ids).toEqual(ids(records));
  expect(profile.support_records.map(row => row.replay_count)).toEqual([1, 2]);
  expect(records).toEqual(before);
  expect(await evaluate(records)).toEqual(profile);
});

test('T04: two questions in one topic and many tags are not two independent topics', async () => {
  const profile = await evaluate([item('same-a', 'L1', 'daily', { tags: ['number', 'intent', 'local'] }),
    item('same-b', 'L1', 'daily')]);
  expect(profile.listening_band).toBeNull();
  expect(profile.evidence.success_question_ids).toEqual(['same-a', 'same-b']);
});

test('T04: duplicate identity and changed topic labels cannot double-count or overwrite the first response', async () => {
  const first = item('same-id', 'L1', 'daily', { first_response: 'incorrect' });
  const later = { ...first, topic: 'school', first_response: 'correct', recorded_at: '2026-09-12T04:01:00.000Z' };
  const profile = await evaluate([first, later, item('other', 'L1', 'work')]);
  expect(profile.listening_band).toBeNull();
  expect(profile.evidence.valid_question_ids).toEqual(['same-id', 'other']);
  expect(profile.evidence.success_question_ids).toEqual(['other']);
  const repeated = await evaluate([item('dup'), item('dup', 'L1', 'school')]);
  expect(repeated.listening_band).toBeNull();
  expect(repeated.evidence.valid_question_ids).toEqual(['dup']);
});

const exclusions = [
  ['answer-before', { answer_before_choice: true }],
  ['translation-before', { translation_before_choice: true }],
  ['device-failure', { device_failure_before_choice: true }],
  ['no-playback', { prompt_played_before_choice: false }],
  ['simulation', { source: 'simulation' }],
  ['unreviewed', { reviewed: false }],
];
for (const [name, patch] of exclusions) {
  test(`T04: ${name} excludes answers from the valid denominator and higher-band success`, async () => {
    const excluded = pair('L2').map(row => ({ ...row, ...patch }));
    const profile = await evaluate([...pair('L1'), ...excluded]);
    band(profile, 'L1');
    expect(profile.evidence.valid_question_ids).toEqual(['L1-a', 'L1-b']);
    expect(profile.evidence.success_question_ids).toEqual(['L1-a', 'L1-b']);
    expect(profile.evidence.excluded.map(row => row.question_id)).toEqual(ids(excluded));
    expect(profile.support_records.filter(row => ids(excluded).includes(row.question_id))).toHaveLength(2);
  });
}

test('T04: help after the first independent answer cannot erase it; a corrected later answer cannot manufacture it', async () => {
  const after = pair('L1').map(row => ({ ...row, answer_after_choice: true, latest_response: 'incorrect' }));
  band(await evaluate(after), 'L1');
  const corrected = pair('L1').map(row => ({ ...row, first_response: 'incorrect', latest_response: 'correct' }));
  expect((await evaluate(corrected)).listening_band).toBeNull();
});

for (const level of ['L2', 'L3', 'L4']) {
  test(`T04: ${level} requires every preceding band, not only two successes at its own band`, async () => {
    const own = pair(level).map((row, i) => ({ ...row, local_voice_id: `sg-${i}`, local_voice_reviewed: true }));
    expect((await evaluate(own)).listening_band).toBeNull();
    band(await evaluate([...lower(level), ...own]), level);
    for (const missing of ['L1', 'L2', 'L3'].slice(0, Number(level.slice(1)) - 1)) {
      const incomplete = await evaluate([...lower(level).filter(row => row.band !== missing), ...own]);
      if (missing === 'L1') {
        expect(incomplete.listening_band).toBeNull();
        expect(incomplete.recommended_content_band).toBe('L0');
      } else band(incomplete, `L${Number(missing.slice(1)) - 1}`);
    }
  });
}

test('T04: L4 needs two different reviewed local voices across two topics, without requiring four cross-product samples', async () => {
  const base = lower('L4');
  const own = pair('L4').map(row => ({ ...row, local_voice_id: 'voice-a', local_voice_reviewed: true }));
  band(await evaluate([...base, ...own]), 'L3');
  const second = { ...own[1], local_voice_id: 'voice-b' };
  band(await evaluate([...base, own[0], { ...second, local_voice_reviewed: false }]), 'L3');
  const profile = await evaluate([...base, own[0], second]);
  band(profile, 'L4');
  expect(profile.local_listening_familiarity).toBe('provisional');
  expect(profile.evidence.success_question_ids.filter(id => id.startsWith('L4'))).toHaveLength(2);
});

function conflict(level = 'L2', kind = 'intent') {
  return [item(`${level}-${kind}-ok`, level, 'daily', { task_type: kind }),
    item(`${level}-${kind}-no`, level, 'school', { task_type: kind, first_response: 'incorrect' })];
}

test('T04: same task conflict requests one differently worded follow-up and keeps L2 unconfirmed', async () => {
  const profile = await evaluate([...pair('L1'), ...conflict()]);
  band(profile, 'L1');
  expect(profile.unresolved_bands).toContain('L2');
  expect(profile.followups).toEqual([{ band: 'L2', task_type: 'intent', count: 1 }]);
});

test('T04: unresolved conflict overrides two otherwise sufficient successes at the same band', async () => {
  const records = [...pair('L1'), ...pair('L2'),
    item('L2-conflicting-third', 'L2', 'work', { first_response: 'incorrect' })];
  const conflicted = await evaluate(records);
  band(conflicted, 'L1');
  expect(conflicted.evidence.success_question_ids).toEqual(['L1-a', 'L1-b', 'L2-a', 'L2-b']);
  expect(conflicted.unresolved_bands).toContain('L2');
  expect(conflicted.followups).toEqual([{ band: 'L2', task_type: 'intent', count: 1 }]);
  const skipped = await evaluate([...records,
    item('extra-skipped', 'L2', 'clinic', { first_response: 'skipped', is_followup: true })]);
  band(skipped, 'L1');
  expect(skipped.unresolved_bands).toContain('L2');
  expect(skipped.followups).toEqual([]);
});

for (const response of ['incorrect', 'skipped', 'unknown']) {
  test(`T04: ${response} follow-up leaves conflicting L2 unconfirmed and falls back to supported L1`, async () => {
    const extra = item('extra', 'L2', 'school', { first_response: response, is_followup: true });
    const profile = await evaluate([...pair('L1'), ...conflict(), extra], { previous_extra_question_ids: ['extra'] });
    band(profile, 'L1');
    expect(profile.unresolved_bands).toContain('L2');
    expect(profile.followups).toEqual([]);
  });
}

test('T04: successful follow-up resolves only with a second topic and reduces confidence', async () => {
  const extra = item('extra', 'L2', 'school', { is_followup: true });
  const profile = await evaluate([...pair('L1'), ...conflict(), extra]);
  band(profile, 'L2');
  expect(profile.evidence_confidence).toBe('reduced');
  expect(profile.unresolved_bands).not.toContain('L2');
  expect(profile.followups).toEqual([]);
  const sameTopic = await evaluate([...pair('L1'), ...conflict(), { ...extra, topic: 'daily' }]);
  band(sameTopic, 'L1');
  expect(sameTopic.unresolved_bands).toContain('L2');
});

test('T04: a second follow-up for the same task cannot wash out a failed first follow-up', async () => {
  const profile = await evaluate([...pair('L1'), ...conflict(),
    item('extra-first', 'L2', 'school', { is_followup: true, first_response: 'incorrect' }),
    item('extra-second', 'L2', 'school', { is_followup: true })]);
  band(profile, 'L1');
  expect(profile.evidence.valid_question_ids).not.toContain('extra-second');
  expect(profile.followups).toEqual([]);
});

test('T04: all optional work shares the four-question budget and ending never forces another question', async () => {
  const records = ['intent', 'number', 'order', 'change', 'local'].flatMap(kind => conflict('L2', kind));
  const noneUsed = await evaluate(records);
  expect(noneUsed.followups).toHaveLength(4);
  expect(new Set(noneUsed.followups.map(row => `${row.band}:${row.task_type}`)).size).toBe(4);
  expect((await evaluate(records, { previous_extra_question_ids: ['optional-1', 'optional-2', 'optional-3'] })).followups).toHaveLength(1);
  expect((await evaluate(records, { previous_extra_question_ids: ['optional-1', 'optional-2', 'optional-3', 'optional-4'] })).followups).toEqual([]);
  expect((await evaluate(records, { ended: true })).followups).toEqual([]);
  const consumed = records.concat(['intent', 'number', 'order', 'change'].map(kind =>
    item(`used-${kind}`, 'L2', 'school', { task_type: kind, is_followup: true, first_response: 'skipped' })));
  expect((await evaluate(consumed, { previous_extra_question_ids: [] })).followups).toEqual([]);
  const twoMore = records.concat(['intent', 'number'].map(kind =>
    item(`used-${kind}`, 'L2', 'school', { task_type: kind, is_followup: true, first_response: 'skipped' })));
  expect((await evaluate(twoMore, { previous_extra_question_ids: ['optional-1', 'optional-2'] })).followups).toEqual([]);
  // Ledger IDs that are also in records consume a slot once, not twice.
  expect((await evaluate(twoMore, { previous_extra_question_ids: ['used-intent', 'used-number'] })).followups).toHaveLength(2);
  const overBudget = await evaluate([...pair('L1'), ...conflict(),
    item('fifth-extra', 'L2', 'school', { is_followup: true })],
    { previous_extra_question_ids: ['optional-1', 'optional-2', 'optional-3', 'optional-4'] });
  band(overBudget, 'L1');
  expect(overBudget.evidence.valid_question_ids).not.toContain('fifth-extra');
  expect(overBudget.followups).toEqual([]);
});

test('T04: number and intent observations stay separate; no local familiarity without reviewed local success', async () => {
  const records = [item('num', 'L1', 'daily', { task_type: 'number' }),
    item('intent', 'L1', 'school'), item('num-no', 'L1', 'work', { task_type: 'number', first_response: 'incorrect' })];
  const profile = await evaluate(records);
  expect(profile.evidence.by_task.number.success_question_ids).toEqual(['num']);
  expect(profile.evidence.by_task.number.failure_question_ids).toEqual(['num-no']);
  expect(profile.evidence.by_task.intent.success_question_ids).toEqual(['intent']);
  expect(profile.local_listening_familiarity).toBe('unknown');
});

test('T04: completed onboarding remains unknown even after every simulated prompt and selected answer', async () => {
  const flow = await import('../../lib/onboarding.ts');
  const placement = await load();
  let session = flow.createOnboardingSession();
  for (let index = 0; index < 12; index += 1) {
    const q = flow.getCurrentQuestion(session);
    if (q.kind === 'listening') session = flow.applyOnboardingEvent(session,
      { type: 'playback', questionId: q.id, kind: 'prompt', outcome: 'ended', source: 'simulation' });
    session = flow.applyOnboardingEvent(session,
      { type: 'answer', questionId: q.id, choiceId: q.options[0].id, response: 'choice' });
  }
  const before = structuredClone(session);
  const profile = placement.profileFromOnboarding(session, at);
  unknown(profile);
  expect(profile.evidence.excluded.filter(row => row.reason === 'simulation')).toHaveLength(7);
  expect(profile.support_records).toHaveLength(7);
  expect(session).toEqual(before);
});

test('T04: study adjustments and feedback are reversible preferences, never altered ability evidence', async () => {
  const placement = await load();
  const profile = await evaluate(pair('L1'));
  const originalProfile = structuredClone(profile);
  const start = placement.createStudySettings(profile);
  const originalSettings = structuredClone(start);
  const simpler = placement.applyStudyAction(start, 'simpler');
  expect(simpler.chosen.content_band).toBe('L0');
  const natural = placement.applyStudyAction(simpler, 'more-natural');
  expect(natural.chosen.content_band).toBe('L1');
  const slower = placement.applyStudyAction(natural, 'slower');
  expect(slower.chosen.speed).toBe('slow');
  const fewer = placement.applyStudyAction(slower, 'fewer-hints');
  expect(fewer.chosen.support).toBe('minimal');
  const beforeFlag = structuredClone(fewer);
  const flagged = placement.applyStudyAction(fewer, 'flag-feedback');
  expect(flagged.feedback_flagged).toBe(true);
  expect(flagged.chosen).toEqual(beforeFlag.chosen);
  expect(fewer).toEqual(beforeFlag);
  const beforeRestore = structuredClone(flagged);
  const restored = placement.applyStudyAction(flagged, 'restore');
  expect(flagged).toEqual(beforeRestore);
  expect(restored.chosen).toEqual(start.recommended);
  expect(restored.feedback_flagged).toBe(true);
  expect(start).toEqual(originalSettings);
  expect(profile).toEqual(originalProfile);
  let high = start;
  for (let index = 0; index < 9; index += 1) high = placement.applyStudyAction(high, 'more-natural');
  expect(high.chosen.content_band).toBe('L4');
  for (let index = 0; index < 9; index += 1) high = placement.applyStudyAction(high, 'simpler');
  expect(high.chosen.content_band).toBe('L0');
});

test('T04: new evidence updates the recommendation without clearing user choices; restore uses the new recommendation', async () => {
  const placement = await load();
  const firstProfile = await evaluate(pair('L1'));
  const nextProfile = await evaluate([...pair('L1'), ...pair('L2')]);
  const profileSnapshot = structuredClone(nextProfile);
  const initial = placement.createStudySettings(firstProfile);
  let chosen = placement.applyStudyAction(initial, 'simpler');
  chosen = placement.applyStudyAction(chosen, 'fewer-hints');
  chosen = placement.applyStudyAction(chosen, 'flag-feedback');
  const chosenSnapshot = structuredClone(chosen);
  const refreshed = placement.refreshStudyRecommendation(chosen, nextProfile);
  expect(refreshed.recommended.content_band).toBe('L2');
  expect(refreshed.chosen).toEqual(chosenSnapshot.chosen);
  expect(refreshed.feedback_flagged).toBe(true);
  expect(chosen).toEqual(chosenSnapshot);
  const restored = placement.applyStudyAction(refreshed, 'restore');
  expect(restored.chosen).toEqual(refreshed.recommended);
  expect(restored.chosen.content_band).toBe('L2');
  expect(restored.feedback_flagged).toBe(true);
  expect(nextProfile).toEqual(profileSnapshot);
  const noOverride = placement.refreshStudyRecommendation(initial, nextProfile);
  expect(noOverride.chosen.content_band).toBe('L2');
  expect(noOverride.chosen).toEqual(noOverride.recommended);
});
