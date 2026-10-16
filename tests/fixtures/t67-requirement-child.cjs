// Independent process: use the same test-only TS loader pattern as t61-child.cjs.
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  module._compile(compiled.outputText, filename);
};
const { createSceneRequirementStore } = require('../../lib/scene-requirements.ts');
const { options, session, action, expectedRevision, content } = JSON.parse(fs.readFileSync(0, 'utf8'));
const store = createSceneRequirementStore(options);
if (action === 'save') {
  process.send({ ready: true });
  process.once('message', async () => {
    try { console.log(JSON.stringify({ ok: true, value: await store.save({ ...session, expectedRevision, content }) })); }
    catch (error) { console.log(JSON.stringify({ ok: false, error: error.message })); }
    finally { process.disconnect(); }
  });
} else store.get(session).then(value => console.log(JSON.stringify(value))).catch(error => { console.error(error.message); process.exitCode = 1; });
