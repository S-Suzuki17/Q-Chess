const fs = require('fs');

function addTouchNone(file) {
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(
        'select-none overflow-hidden pb-4',
        'select-none touch-none overflow-hidden pb-4'
    );
    fs.writeFileSync(file, code, 'utf8');
    console.log('Added touch-none to', file);
}

addTouchNone('src/components/LocalGameBoard.tsx');
addTouchNone('src/components/OnlineGameBoard.tsx');
