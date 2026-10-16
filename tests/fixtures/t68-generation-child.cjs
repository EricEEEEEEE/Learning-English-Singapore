const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  module._compile(compiled.outputText, filename);
};
const { createSceneRequirementStore } = require('../../lib/scene-requirements.ts');
const { createGenerationTaskStore } = require('../../lib/generation-tasks.ts');
const { createSceneGenerationService } = require('../../lib/scene-generation.ts');
const { requirementOptions, taskOptions, input } = JSON.parse(fs.readFileSync(0, 'utf8'));
const service = createSceneGenerationService({ requirements: createSceneRequirementStore(requirementOptions), tasks: createGenerationTaskStore(taskOptions) });
service.get(input).then(value => console.log(JSON.stringify(value))).catch(error => { console.error(error.message); process.exitCode = 1; });
