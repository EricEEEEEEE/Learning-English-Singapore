import { test, expect } from '@playwright/test';

for (const timing of ['after-choice', 'before-choice', 'late-first-playback']) {
  test(`T05 regression: ${timing} preserves cumulative support and the independent first-choice snapshot`, async () => {
    const flow = await import('../../lib/onboarding.ts');
    const placement = await import('../../lib/placement.ts');
    let session = flow.createOnboardingSession();
    const event = (state, type, extra = {}) => flow.applyOnboardingEvent(state,
      { type, questionId: flow.getCurrentQuestion(state)?.id, ...extra });
    for (let count = 0; count < 5; count += 1) session = event(session, 'answer', { response: 'unknown', choiceId: null });
    const question = flow.getCurrentQuestion(session);
    if (timing !== 'late-first-playback') session = event(session, 'playback', { kind: 'prompt', outcome: 'ended', source: 'simulation' });
    if (timing === 'before-choice') session = event(session, 'playback', { kind: 'answer', outcome: 'ended', source: 'simulation' });
    session = event(session, 'answer', { choiceId: question.options[0].id, response: 'choice' });
    session = event(session, 'back');
    session = event(session, 'playback', { kind: 'answer', outcome: 'ended', source: 'simulation' });
    session = event(session, 'playback', { kind: 'prompt', outcome: 'failed', source: 'simulation' });
    session = event(session, 'playback', { kind: 'prompt', outcome: 'ended', source: 'simulation' });
    const before = structuredClone(session);
    const profile = placement.profileFromOnboarding(JSON.parse(JSON.stringify(session)), session.createdAt);
    const support = profile.support_records.find(row => row.question_id === question.id);
    expect(support).toMatchObject({ answer_before_choice: timing === 'before-choice', device_failure_before_choice: false,
      prompt_played_before_choice: timing !== 'late-first-playback', answer_exposed: true, device_failure: true,
      prompt_play_count: timing === 'late-first-playback' ? 1 : 2, replay_count: timing === 'late-first-playback' ? 0 : 1 });
    expect(profile.listening_band).toBeNull();
    expect(profile.speaking_status).toBe('unobserved');
    expect(profile.evidence.valid_question_ids).toEqual([]);
    expect(session).toEqual(before);
  });
}
