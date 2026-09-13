const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('../../../node_modules/typescript');
const target = path.resolve('tmp/t05-domain-review');
fs.mkdirSync(target, { recursive: true });
for (const name of ['scenario', 'scenario-content']) {
  const source = fs.readFileSync(`lib/${name}.ts`, 'utf8');
  fs.writeFileSync(`${target}/${name}.js`, ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText);
}
const flow = require(`${target}/scenario.js`);
const context = { content_band: 'L1', speed: 'slow', support: 'minimal', listening_status: 'unknown', speaking_status: 'unobserved' };
const results = [];
function check(name, run) {
  try { run(); results.push({ name, result: 'pass' }); }
  catch (error) { results.push({ name, result: 'fail', message: error.message }); }
}
for (const [section, field] of [['session','stage'],['context','content_band'],['context','speed'],['context','support'],['context','listening_status'],['draft','origin'],['draft','language'],['draft','grounding_status']]) {
  check(`reject array masquerading as ${section}.${field}`, () => {
    const state = flow.createScenarioSession(context);
    const object = section === 'session' ? state : section === 'context' ? state.learning_context : state.draft;
    object[field] = [object[field]];
    assert.throws(() => flow.readScenarioSession(JSON.stringify(state)));
  });
}
for (const field of ['who','where','worry']) check(`edited seed ${field} becomes user-provided`, () => {
  let state = flow.applyScenarioEvent(flow.createScenarioSession(context), { type: 'choose-start', kind: 'school' });
  const before = structuredClone(state);
  state = flow.applyScenarioEvent(state, { type: 'edit-field', field, value: 'user-supplied detail' });
  assert.equal(state.draft.grounding_status, 'user-provided');
  assert.deepEqual(state.draft.source_refs, []);
  assert.deepEqual(state.draft.unknown_facts, before.draft.unknown_facts);
  assert.equal(before.draft.grounding_status, 'spec-seed');
});
const suffix = process.argv.includes('--red') ? 'red' : 'green';
fs.writeFileSync(`docs/evidence/t05/domain-review-${suffix}.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
process.exitCode = results.every(result => result.result === 'pass') ? 0 : 1;
