const fs = require('fs');

function fixHeader(file) {
    let code = fs.readFileSync(file, 'utf8');
    
    // Top bar background
    code = code.replace(/bg-gray-900\/40 py-2 border-b border-cyan-900\/50/g, 'bg-[#191714]/80 py-3 border-b border-[#B39A62]/20 shadow-lg');
    
    // White Player active text
    code = code.replace(/text-blue-400 drop-shadow-\[0_0_5px_currentColor\]/g, 'text-[#E8E2D7] drop-shadow-[0_0_8px_rgba(232,226,215,0.4)]');
    
    // Black Player active text
    code = code.replace(/text-red-400 drop-shadow-\[0_0_5px_currentColor\]/g, 'text-[#E8E2D7] drop-shadow-[0_0_8px_rgba(232,226,215,0.4)]');
    
    // Avatars borders
    code = code.replace(/border-blue-400\/50/g, 'border-[#E8E2D7]/50');
    code = code.replace(/border-red-400\/50/g, 'border-[#11100E]/80');
    
    // CHECK warning text
    code = code.replace(/text-red-900 text-sm animate-pulse/g, 'text-[#B39A62] text-sm animate-pulse font-serif tracking-widest');
    
    // Resign Confirm UI
    code = code.replace(/bg-gray-900 border border-red-500\/50 rounded-xl p-6/g, 'bg-[#161513] border border-[#B39A62]/30 rounded-xl p-8');
    code = code.replace(/text-red-400 font-bold mb-4/g, 'text-[#B39A62] font-serif tracking-[0.1em] font-bold mb-6');
    code = code.replace(/bg-red-900\/50 hover:bg-red-800 text-red-200 border border-red-700/g, 'bg-[#B39A62] hover:bg-[#D0C8B6] text-[#11100E] font-bold border border-[#B39A62]');
    code = code.replace(/bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600/g, 'bg-transparent hover:bg-[#2A2621] text-[#A89C86] border border-[#A89C86]/30');
    
    fs.writeFileSync(file, code, 'utf8');
}

fixHeader('src/components/LocalGameBoard.tsx');
fixHeader('src/components/OnlineGameBoard.tsx');
