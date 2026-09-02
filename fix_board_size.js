const fs = require('fs');

function fixBoardSize(file) {
    let code = fs.readFileSync(file, 'utf8');
    // Change w-full max-w-[calc(100dvh-260px)] aspect-square
    code = code.replace(/w-full max-w-\[calc\(100dvh-260px\)\] aspect-square/g, "w-full max-w-[min(100%,_calc(100dvh-320px))] aspect-square");
    fs.writeFileSync(file, code, 'utf8');
}

fixBoardSize('src/components/LocalGameBoard.tsx');
fixBoardSize('src/components/OnlineGameBoard.tsx');
fixBoardSize('src/components/ReplayBoard.tsx');
