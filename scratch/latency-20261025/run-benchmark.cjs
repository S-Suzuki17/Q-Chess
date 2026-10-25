const ts = require('typescript');
const fs = require('node:fs');
// Compile the shared engine in memory, without a dev server or external traffic.
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(
    fs.readFileSync(file, 'utf8'),
    {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}},
).outputText, file);
require('./benchmark.ts');
