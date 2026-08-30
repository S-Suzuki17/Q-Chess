const fs = require('fs');
let code = fs.readFileSync('src/components/LevelSelect.tsx', 'utf8');

// 1. Change the wrapper div
code = code.replace(/<div className="flex flex-col items-center justify-center min-h-\[80vh\] w-full text-\[#D4B872\]">/g, '<div className="flex flex-col items-center min-h-[100vh] w-full pt-16 px-8 text-[#E8E2D7] bg-[#11100E]">');

// 2. Change the Header (Profile button)
code = code.replace(/<button onClick=\{\(\) => setShowAccount\(true\)\} className="flex items-center gap-2 hover:bg-\[#2A2621\] p-2 rounded transition-colors group">/, '<button onClick={() => setShowAccount(true)} className="flex items-center gap-2 hover:text-[#B39A62] transition-colors group pb-1">');
code = code.replace(/<span className="text-xs border border-\[#4A4238\] px-2 py-1 rounded bg-cyan-950\/30 group-hover:bg-\[#3B342C\]">View Account<\/span>/, '<span className="text-xs text-[#A89C86] tracking-widest uppercase">Account</span>');

// 3. Change "Select Mode" title
code = code.replace(/<h2 className="text-4xl font-bold tracking-widest text-\[#D4B872\] font-serif">/, '<h2 className="text-3xl font-serif tracking-[0.2em] text-[#E8E2D7] mb-12 uppercase text-left w-full max-w-2xl">');

// 4. Change separators
code = code.replace(/<div className="flex items-center justify-center gap-2 my-2 opacity-50( mt-8)?">[\s\S]*?<\/div>/g, (match) => {
    let title = 'SECTION';
    if (match.includes('onlineMultiplayer')) title = '{t.onlineMultiplayer}';
    if (match.includes('Social & Live')) title = '"Social & Live"';
    if (match.includes('gameReplays')) title = '{t.gameReplays}';
    return `<div className="w-full max-w-2xl mt-16 mb-8"><h3 className="text-sm tracking-[0.3em] text-[#A89C86] uppercase border-b border-[#A89C86]/30 pb-2">${title}</h3></div>`;
});

// 5. Upgrade buttons to minimalist style
const buttonRegex = /<button[\s\S]*?className="(?:group )?relative w-full p-4 (?:bg-\[[^\]]+\]|border)[\s\S]*?<\/button>/g;
code = code.replace(buttonRegex, (match) => {
    // Modify the button's class to be minimalist
    let newMatch = match.replace(/className="[^"]+"/, 'className="flex flex-col md:flex-row md:items-baseline justify-between w-full max-w-2xl py-4 group text-left relative border-b border-[#A89C86]/30 hover:border-[#E8E2D7] transition-all"');
    newMatch = newMatch.replace(/<div className="absolute inset-0[^>]+><\/div>/g, ''); // remove hover highlights
    
    // Replace emojis and tracking
    newMatch = newMatch.replace(/🤖 |🏆 |🎲 |🔒 |📺 /g, '');
    newMatch = newMatch.replace(/text-xl font-bold/g, 'text-xl tracking-widest');
    newMatch = newMatch.replace(/text-\[#E8E5DF\]/g, 'text-[#E8E2D7] group-hover:text-[#B39A62]');
    newMatch = newMatch.replace(/text-xs px-2 py-1 rounded border[^>]+/g, 'text-xs tracking-widest text-[#A89C86]');
    
    return newMatch;
});

// 6. Social Buttons (half width)
const socialBtnRegex = /<button[\s\S]*?className="(?:group )?relative w-1\/2 p-3[^>]+>[\s\S]*?<\/button>/g;
code = code.replace(socialBtnRegex, (match) => {
    let newMatch = match.replace(/className="[^"]+"/, 'className="flex flex-col md:flex-row justify-between w-full max-w-2xl py-4 group text-left relative border-b border-[#A89C86]/30 hover:border-[#E8E2D7] transition-all"');
    newMatch = newMatch.replace(/<div className="relative z-10 flex flex-col justify-center items-center gap-1">/, '<div className="flex items-baseline w-full">');
    newMatch = newMatch.replace(/text-lg font-bold/g, 'text-lg tracking-widest text-[#E8E2D7] group-hover:text-[#B39A62]');
    newMatch = newMatch.replace(/👥 |🔴 /g, '');
    return newMatch;
});
code = code.replace(/<div className="flex gap-2">/g, '<div className="flex flex-col w-full max-w-2xl">');

// 7. Modals and panels background
code = code.replace(/bg-\[#2A2621\]/g, 'bg-[#191714]');
code = code.replace(/bg-\[#3B342C\]/g, 'bg-[#11100E]');
code = code.replace(/bg-\[#1E1C19\]/g, 'bg-[#11100E]');
code = code.replace(/border-\[#4A4238\]/g, 'border-[#A89C86]/30');
code = code.replace(/text-\[#D4B872\]/g, 'text-[#B39A62]');

fs.writeFileSync('src/components/LevelSelect.tsx', code);
console.log('Patched LevelSelect to minimalist layout.');
