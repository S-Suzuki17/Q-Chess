const fs = require('fs');

let code = fs.readFileSync('src/components/LevelSelect.tsx', 'utf8');

// The regex matches the minimalist text buttons I created
const buttonRegex = /className="flex flex-col md:flex-row(?: md:items-baseline)? justify-between w-full py-4 group text-left relative border-b border-\[#A89C86\]\/30 hover:border-\[#E8E2D7\] transition-all([^"]*)"/g;

code = code.replace(buttonRegex, 'className="flex flex-col md:flex-row md:items-baseline justify-between w-full p-4 group text-left relative border border-[#A89C86]/20 bg-[#191714] hover:bg-[#2D2A26] hover:border-[#B39A62] transition-colors mb-3"$1');

// Change the section headers to be more prominent
code = code.replace(/className="text-sm tracking-\[0\.3em\] text-\[#A89C86\] uppercase border-b border-\[#A89C86\]\/30 pb-2"/g, 'className="text-sm tracking-[0.3em] text-[#B39A62] uppercase mb-4"');

fs.writeFileSync('src/components/LevelSelect.tsx', code);
console.log('Patched LevelSelect with better affordances.');
