const fs = require('fs');

function fixPromotion(file) {
    let code = fs.readFileSync(file, 'utf8');
    // Promotion UI
    code = code.replace(/bg-gray-900 border-2 border-cyan-500\/50 p-6 rounded-lg max-w-sm w-full text-center/g, 'bg-[#161513] border border-[#B39A62]/30 p-8 rounded-lg max-w-sm w-full text-center shadow-2xl');
    code = code.replace(/text-xl font-bold text-cyan-300 mb-2/g, 'text-xl tracking-[0.2em] font-serif text-[#E8E2D7] mb-2');
    code = code.replace(/text-cyan-500\/70 text-sm mb-6/g, 'text-[#A89C86] text-xs tracking-widest mb-6 font-serif');
    code = code.replace(/p-3 bg-cyan-950\/40 border border-cyan-500\/30 hover:bg-cyan-800\/50 hover:border-cyan-400 rounded text-cyan-300 font-bold transition-all/g, 'p-4 bg-[#191714] border border-[#B39A62]/30 hover:bg-[#B39A62] hover:text-[#11100E] rounded text-[#E8E2D7] font-serif tracking-widest transition-all');
    code = code.replace(/w-full p-3 bg-red-950\/40 border border-red-500\/30 hover:bg-red-900\/20 hover:border-red-400 rounded text-red-300 font-bold transition-all text-sm/g, 'w-full p-4 mt-2 bg-transparent border border-[#A89C86]/30 hover:bg-[#2A2621] hover:border-[#A89C86] rounded text-[#A89C86] font-serif tracking-widest transition-all text-sm');

    fs.writeFileSync(file, code, 'utf8');
}

fixPromotion('src/components/LocalGameBoard.tsx');
fixPromotion('src/components/OnlineGameBoard.tsx');
