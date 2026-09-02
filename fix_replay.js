const fs = require('fs');
let code = fs.readFileSync('src/components/ReplayBoard.tsx', 'utf8');

code = code.replace(/bg-gray-900\/50 p-3 rounded-lg border border-gray-700/g, 'bg-[#191714] p-4 rounded-lg border border-[#A89C86]/20 shadow-lg');
code = code.replace(/text-gray-400/g, 'text-[#A89C86]');
code = code.replace(/bg-cyan-900\/40 hover:bg-cyan-800\/60 border border-cyan-500\/50 text-cyan-300/g, 'bg-transparent hover:bg-[#2A2621] border border-[#A89C86]/30 text-[#E8E2D7] transition-colors');
code = code.replace(/bg-indigo-900\/40 hover:bg-indigo-800\/60 border border-indigo-500\/50 text-indigo-300/g, 'bg-[#B39A62] hover:bg-[#D0C8B6] border border-[#B39A62] text-[#11100E] font-bold transition-colors');
code = code.replace(/disabled:opacity-50 disabled:cursor-not-allowed/g, 'disabled:opacity-30 disabled:cursor-not-allowed');

fs.writeFileSync('src/components/ReplayBoard.tsx', code, 'utf8');
