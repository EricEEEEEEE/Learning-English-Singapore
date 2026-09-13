import { test, expect } from '@playwright/test';
import { createScenarioSession, applyScenarioEvent, readScenarioSession } from '../../lib/scenario.ts';
const context = { content_band: 'L1', speed: 'slow', support: 'minimal', listening_status: 'unknown', speaking_status: 'unobserved' };
for (const [section,field] of [['session','stage'],['context','content_band'],['context','speed'],['context','support'],['context','listening_status'],['draft','origin'],['draft','language'],['draft','grounding_status']]) {
  test(`T06 regression: reject arrays posing as ${section}.${field}`, () => {
    const state = createScenarioSession(context);
    const object = section === 'session' ? state : section === 'context' ? state.learning_context : state.draft;
    object[field] = [object[field]];
    expect(() => readScenarioSession(JSON.stringify(state))).toThrow();
  });
}
for (const field of ['who','where','worry']) test(`T06 regression: edited seed ${field} no longer claims specification provenance`, () => {
  const original = applyScenarioEvent(createScenarioSession(context), { type: 'choose-start', kind: 'school' });
  const before = structuredClone(original);
  const state = applyScenarioEvent(original, { type: 'edit-field', field, value: 'user supplied detail' });
  expect(state.draft.grounding_status).toBe('user-provided');
  expect(state.draft.source_refs).toEqual([]);
  expect(state.draft.unknown_facts).toEqual(before.draft.unknown_facts);
  expect(original).toEqual(before);
});
