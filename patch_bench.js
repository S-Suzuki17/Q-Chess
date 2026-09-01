const fs = require('fs');
let code = fs.readFileSync('run_benchmark.ts', 'utf8');
code = code.replace(/const TOTAL_GAMES = 1000;/, 'const TOTAL_GAMES = 10;');
code = code.replace(/const CHUNK_SIZE = 25;/, 'const CHUNK_SIZE = 5;');
code = code.replace(/const budgets = \[100, 500, 1000, 2000, 5000\];/, 'const budgets = [100];');
fs.writeFileSync('test_benchmark.ts', code, 'utf8');
