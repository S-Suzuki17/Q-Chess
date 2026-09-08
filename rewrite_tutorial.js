const fs = require('fs');

let content = fs.readFileSync('src/components/InteractiveTutorial.tsx', 'utf8');

// Replace imports
content = content.replace(
    "import { AnimatedDemoBoard, DemoPiece } from './AnimatedDemoBoard';",
    "import { Board3D } from './Board3D';\nimport { Token } from '../config/gameConfig';"
);

// Replace DemoPiece with Token in state
content = content.replace(
    "const [pieces, setPieces] = useState<DemoPiece[]>([",
    "const [pieces, setPieces] = useState<any[]>([ "
);

// We need to convert DemoPiece to Token[]
const boardReplacement = \                {/* Left: Board Demo */}
                <div className="w-full md:w-1/2 p-0 bg-[#0b0c10] flex items-center justify-center relative min-h-[300px]">
                    <div className="w-full aspect-square">
                        <Board3D 
                            tokens={pieces.filter(p => !p.isCaptured).map(p => ({
                                id: p.id,
                                player: p.player,
                                row: p.row,
                                col: p.col,
                                probabilities: p.probabilities,
                                promotedTo: p.promotedTo,
                                selected: p.id === selectedPieceId
                            })) as Token[]}
                            selectedTokenId={selectedPieceId}
                            validMoves={validMoves.map(m => ({ r: m.row, c: m.col }))}
                            moveHistory={[]}
                            onSquareClick={(r, c) => {
                                const clickedPiece = pieces.find(p => p.row === r && p.col === c && !p.isCaptured);
                                if (!selectedPieceId && clickedPiece) {
                                    handlePieceClick(clickedPiece.id);
                                } else if (selectedPieceId && clickedPiece && clickedPiece.player === pieces.find(p => p.id === selectedPieceId)?.player) {
                                    // clicked own piece, deselect
                                    handleSquareClick(r, c); // will hit the else block and deselect
                                } else {
                                    handleSquareClick(r, c);
                                }
                            }}
                            showMoveHints={true}
                            currentTurn="white"
                        />
                    </div>
                </div>\;

content = content.replace(
    /\{\/\* Left: Board Demo \*\/\}[\s\S]*?<\/div>\s*\{\/\* Right: Explanations \*\/\}/,
    boardReplacement + "\n\n                {/* Right: Explanations */}"
);

fs.writeFileSync('src/components/InteractiveTutorial.tsx', content);
console.log("Rewrote InteractiveTutorial.tsx");
