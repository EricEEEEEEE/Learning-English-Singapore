// Test-only TypeScript loader for independent-process durability checks.
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  module._compile(compiled.outputText, filename);
};
const { createGenerationTaskStore } = require('../../lib/generation-tasks.ts');
const data = JSON.parse(fs.readFileSync(0, 'utf8'));
const store = createGenerationTaskStore(data.options);
(async () => {
  if (data.crash) {
    await store.runSimulation(data.input, async () => { process.exit(17); });
    process.exit(18);
  } else console.log(JSON.stringify(await store.get(data.input)));
})().catch(() => process.exit(19));
