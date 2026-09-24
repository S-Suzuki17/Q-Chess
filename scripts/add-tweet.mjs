import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Usage: node scripts/add-tweet.mjs --author Boss --content "テスト"
const args = process.argv.slice(2);
let author = 'AI';
let content = '';

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--author') {
        author = args[i + 1];
        i++;
    } else if (args[i] === '--content') {
        content = args[i + 1];
        i++;
    }
}

if (!content) {
    console.error('Usage: node add-tweet.mjs --author <Boss|AI|Astra> --content "<text>"');
    process.exit(1);
}

const file = path.join(__dirname, '..', 'src', 'data', 'devDiary.ts');
let text = fs.readFileSync(file, 'utf-8');

// 新しいIDを生成
const match = text.match(/id:\s*"t(\d+)"/g);
let maxId = 0;
if (match) {
    match.forEach(m => {
        const idMatch = m.match(/t(\d+)/);
        if (idMatch) {
            maxId = Math.max(maxId, parseInt(idMatch[1], 10));
        }
    });
}
const newId = `t${maxId + 1}`;

let authorName = '開発アシスタントAI';
let handle = '@dev_ai_assistant';
if (author === 'Boss') {
    authorName = '開発ディレクター (人間)';
    handle = '@game_director';
} else if (author === 'Astra') {
    authorName = 'Codex Astra';
    handle = '@astra_agent';
}

const newObj = `    },
    {
        id: "${newId}",
        author: "${author}",
        authorName: "${authorName}",
        handle: "${handle}",
        date: "たった今",
        content: ${JSON.stringify(content)},
        hasAd: false
    }
];`;

text = text.replace(/    \}\n\];/, newObj);

fs.writeFileSync(file, text, 'utf-8');
console.log(`Successfully added tweet ${newId} from ${author}`);
