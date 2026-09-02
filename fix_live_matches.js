const fs = require('fs');
let code = fs.readFileSync('src/components/LiveMatchesMenu.tsx', 'utf8');

code = code.replace(/bg-gray-900 border border-red-500\/50 p-6 rounded-lg max-w-md w-full shadow-\[0_0_50px_rgba\(239,68,68,0\.2\)\]/g, 'bg-[#11100E] border border-[#B39A62]/30 p-6 rounded-lg max-w-md w-full shadow-2xl');
code = code.replace(/text-red-300/g, 'text-[#E8E2D7] font-serif tracking-widest');
code = code.replace(/bg-red-500/g, 'bg-[#B39A62]');
code = code.replace(/text-gray-500 hover:text-white/g, 'text-[#A89C86] hover:text-[#E8E2D7]');
code = code.replace(/bg-black\/50 border border-red-900\/30/g, 'bg-[#191714] border border-[#A89C86]/20');
code = code.replace(/text-gray-300/g, 'text-[#E8E2D7]');
code = code.replace(/text-gray-500/g, 'text-[#A89C86]');
code = code.replace(/bg-red-900\/50 hover:bg-red-800 border border-red-700 text-red-200/g, 'bg-[#B39A62] hover:bg-[#D0C8B6] border border-[#B39A62] text-[#11100E] font-bold');

fs.writeFileSync('src/components/LiveMatchesMenu.tsx', code, 'utf8');
