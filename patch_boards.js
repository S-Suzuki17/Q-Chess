const fs = require('fs');

function patchBoard(file) {
    let code = fs.readFileSync(file, 'utf8');
    
    // Patch squares
    code = code.replace(/\$\{isDark \? 'bg-\[\#1a202c\]' : 'bg-\[\#2d3748\]'\}/g, "${isDark ? 'bg-[#11100E]' : 'bg-[#191714]'}");
    code = code.replace(/\$\{isMoveCandidate \? 'hover:bg-\[\#00ff41\]\/20' : 'hover:bg-white\/10'\}/g, "${isMoveCandidate ? 'hover:bg-[#B39A62]/20' : 'hover:bg-[#E8E2D7]/5'}");
    code = code.replace(/bg-\[\#00ff41\]\/50/g, 'bg-[#B39A62]/40'); // Move candidate dots
    code = code.replace(/border-red-500\/60/g, 'border-[#B39A62]/60'); // Capture candidate ring

    // Patch board border
    code = code.replace(/border-4 border-\[\#4A4238\]/g, 'border border-[#A89C86]/30');
    code = code.replace(/border-2 border-\[\#4A4238\]/g, 'border border-[#A89C86]/30');
    
    // Patch check warning
    code = code.replace(/border-red-600/g, 'border-red-900/50');
    code = code.replace(/bg-red-900\/50/g, 'bg-red-900/20');
    code = code.replace(/text-red-500/g, 'text-red-900');
    code = code.replace(/shadow-\[0_0_20px_rgba\(220,38,38,0.3\)\]/g, '');

    // Patch player infos
    code = code.replace(/text-gray-500/g, 'text-[#A89C86]');
    code = code.replace(/text-white/g, 'text-[#E8E2D7]');
    code = code.replace(/text-\[\#D4B872\]/g, 'text-[#B39A62]');
    code = code.replace(/bg-gray-800/g, 'bg-[#191714]');
    code = code.replace(/bg-\[\#3B342C\]/g, 'bg-[#191714]');

    fs.writeFileSync(file, code);
}

patchBoard('src/components/LocalGameBoard.tsx');
patchBoard('src/components/OnlineGameBoard.tsx');
console.log('Boards patched');
