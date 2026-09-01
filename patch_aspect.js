const fs = require('fs');

function fixBoardAspect(file) {
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(
        'w-full h-full max-h-full max-w-full aspect-square mx-auto my-auto',
        'h-full max-w-full aspect-square mx-auto'
    );
    fs.writeFileSync(file, code, 'utf8');
    console.log('Fixed aspect ratio for', file);
}

fixBoardAspect('src/components/LocalGameBoard.tsx');
fixBoardAspect('src/components/OnlineGameBoard.tsx');
