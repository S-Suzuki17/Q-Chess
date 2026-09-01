const fs = require('fs');
let code = fs.readFileSync('src/lib/__tests__/adapter_flow.test.ts', 'utf8');
code = code.replace(/{ id: 'T1', player: 'black', row: 1, col: 0, isCaptured: false }/g, "{ id: 'T1', player: 'black', row: 1, col: 0, isCaptured: false, probabilities: {} as any }");
code = code.replace(/{ id: 'T2', player: 'black', row: 1, col: 1, isCaptured: false }/g, "{ id: 'T2', player: 'black', row: 1, col: 1, isCaptured: false, probabilities: {} as any }");
code = code.replace(/{ id: 'T3', player: 'black', row: 1, col: 2, isCaptured: false }/g, "{ id: 'T3', player: 'black', row: 1, col: 2, isCaptured: false, probabilities: {} as any }");
code = code.replace(/{ id: 'T_K', player: 'black', row: 0, col: 4, isCaptured: false }/g, "{ id: 'T_K', player: 'black', row: 0, col: 4, isCaptured: false, probabilities: {} as any }");
fs.writeFileSync('src/lib/__tests__/adapter_flow.test.ts', code, 'utf8');
