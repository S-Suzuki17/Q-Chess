const fs = require('fs');

function fixEmotes(file) {
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(/bg-indigo-900 border-2 border-indigo-500 rounded-full flex items-center justify-center text-3xl shadow-\[0_0_15px_rgba\(99,102,241,0\.5\)\] hover:scale-110/g, 'bg-[#191714] border-2 border-[#B39A62]/50 rounded-full flex items-center justify-center text-3xl shadow-[0_0_15px_rgba(179,154,98,0.3)] hover:scale-110');
    code = code.replace(/bg-gray-900 border border-indigo-500 rounded-xl p-2 flex flex-col gap-2 shadow-\[0_0_20px_rgba\(99,102,241,0\.3\)\]/g, 'bg-[#11100E] border border-[#B39A62]/30 rounded-xl p-2 flex flex-col gap-2 shadow-[0_0_20px_rgba(179,154,98,0.2)]');
    code = code.replace(/hover:bg-indigo-900\/50/g, 'hover:bg-[#2A2621]');
    code = code.replace(/hover:bg-red-900\/20/g, 'hover:bg-[#2A2621]');
    code = code.replace(/text-gray-300/g, 'text-[#E8E2D7]');
    code = code.replace(/text-red-400/g, 'text-[#E8E2D7]');
    code = code.replace(/border-gray-700/g, 'border-[#A89C86]/30');
    fs.writeFileSync(file, code, 'utf8');
}

fixEmotes('src/components/LocalGameBoard.tsx');
fixEmotes('src/components/OnlineGameBoard.tsx');
