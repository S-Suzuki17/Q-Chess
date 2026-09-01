const fs = require('fs');

function patchBoard(file) {
    let code = fs.readFileSync(file, 'utf8');

    // 1. Root div
    code = code.replace(
        '<div className="flex flex-col items-center w-full max-w-[800px] relative">',
        '<div className="flex flex-col items-center w-full h-full max-h-[100dvh] max-w-[800px] mx-auto relative select-none overflow-hidden pb-4">'
    );

    // 2. Add flex-1 wrapper around the board
    const boardStart = code.indexOf('<div className={`\n                grid grid-cols-8');
    if (boardStart > -1) {
        // Find matching closing div for the board
        let depth = 0;
        let boardEnd = -1;
        const searchRegex = /<\/?div/g;
        searchRegex.lastIndex = boardStart;
        
        let match;
        while ((match = searchRegex.exec(code)) !== null) {
            if (match[0] === '<div') {
                depth++;
            } else if (match[0] === '</div') {
                depth--;
                if (depth === 0) {
                    boardEnd = match.index + 6; // length of '</div>'
                    break;
                }
            }
        }

        if (boardEnd > -1) {
            const before = code.substring(0, boardStart);
            const boardStr = code.substring(boardStart, boardEnd);
            const after = code.substring(boardEnd);

            const modifiedBoardStr = boardStr
                .replace('w-full aspect-square', 'w-full h-full max-h-full max-w-full aspect-square mx-auto my-auto');

            const wrappedBoard = `<div className="flex-1 min-h-0 w-full flex items-center justify-center p-2">\n                ${modifiedBoardStr}\n            </div>`;

            code = before + wrappedBoard + after;
        }
    }
    
    fs.writeFileSync(file, code, 'utf8');
    console.log('Patched layout for', file);
}

patchBoard('src/components/LocalGameBoard.tsx');
patchBoard('src/components/OnlineGameBoard.tsx');
