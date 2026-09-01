const fs = require('fs');
let code = fs.readFileSync('C:/Users/souta/.gemini/antigravity/brain/7192489c-d0a2-45db-a06f-72de4f4e02af/task.md', 'utf8');
code = code.replace('- `[/]` 1. Foundation', '- `[x]` 1. Foundation');
code = code.replace('- `[ ]` Create `types.ts`', '- `[x]` Create `types.ts`');
code = code.replace('- `[ ]` Create `constants.ts`', '- `[x]` Create `constants.ts`');
code = code.replace('- `[ ]` Create `errors.ts`', '- `[x]` Create `errors.ts`');
code = code.replace('- `[ ]` Create `board.ts`', '- `[x]` Create `board.ts`');
code = code.replace('- `[ ]` 2. Quantum Logic', '- `[/]` 2. Quantum Logic');
fs.writeFileSync('C:/Users/souta/.gemini/antigravity/brain/7192489c-d0a2-45db-a06f-72de4f4e02af/task.md', code, 'utf8');
