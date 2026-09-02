const fs = require('fs');
let code = fs.readFileSync('src/components/FriendsMenu.tsx', 'utf8');

code = code.replace(/bg-gray-900 border border-purple-500\/50 p-6 rounded-lg max-w-md w-full shadow-\[0_0_50px_rgba\(168,85,247,0\.2\)\]/g, 'bg-[#11100E] border border-[#B39A62]/30 p-6 rounded-lg max-w-md w-full shadow-2xl');
code = code.replace(/text-purple-300/g, 'text-[#E8E2D7] font-serif tracking-widest');
code = code.replace(/text-gray-500 hover:text-white/g, 'text-[#A89C86] hover:text-[#E8E2D7]');
code = code.replace(/bg-black\/50 border border-purple-900\/50/g, 'bg-[#191714] border border-[#A89C86]/20');
code = code.replace(/text-purple-400/g, 'text-[#B39A62] font-serif tracking-widest');
code = code.replace(/bg-gray-900 border border-purple-800 rounded px-3 py-2 text-white focus:outline-none focus:border-purple-400/g, 'bg-[#11100E] border border-[#A89C86]/30 rounded px-3 py-2 text-[#E8E2D7] focus:outline-none focus:border-[#B39A62]');
code = code.replace(/bg-purple-900\/50 hover:bg-purple-800 border border-purple-500 rounded text-purple-300/g, 'bg-[#B39A62] hover:bg-[#D0C8B6] border border-[#B39A62] rounded text-[#11100E]');
code = code.replace(/text-yellow-500/g, 'text-[#E8E2D7] font-serif tracking-widest');
code = code.replace(/bg-yellow-950\/30 border border-yellow-900\/50/g, 'bg-[#191714] border border-[#A89C86]/20');
code = code.replace(/text-yellow-300/g, 'text-[#E8E2D7]');
code = code.replace(/bg-green-900\/50 text-green-400 rounded text-xs border border-green-700/g, 'bg-[#B39A62] text-[#11100E] rounded text-xs font-bold border border-[#B39A62]');
code = code.replace(/bg-red-900\/50 text-red-400 rounded text-xs border border-red-700/g, 'bg-transparent text-[#A89C86] hover:text-[#E8E2D7] rounded text-xs border border-[#A89C86]/30 hover:border-[#A89C86]');
code = code.replace(/bg-black\/40 border border-purple-900\/30/g, 'bg-[#191714] border border-[#A89C86]/20');
code = code.replace(/text-purple-200/g, 'text-[#E8E2D7]');
code = code.replace(/bg-blue-900\/50 text-blue-400 rounded text-xs border border-blue-700 hover:bg-blue-800/g, 'bg-[#B39A62] text-[#11100E] rounded text-xs font-bold border border-[#B39A62] hover:bg-[#D0C8B6]');
code = code.replace(/bg-red-900\/50 text-red-400 rounded text-xs border border-red-900 hover:bg-red-800/g, 'bg-transparent text-[#A89C86] hover:text-[#E8E2D7] rounded text-xs border border-[#A89C86]/30 hover:border-[#A89C86]');

fs.writeFileSync('src/components/FriendsMenu.tsx', code, 'utf8');
