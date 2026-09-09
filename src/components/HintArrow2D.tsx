import { hintArrowPoints, type HintMove, squareName } from './boardPresentation';

export function HintArrow2D({ move, flipped }: { move: HintMove; flipped: boolean }) {
    return <svg data-testid="hint-arrow-2d" aria-label={`${squareName(move.fromRow, move.fromCol)} → ${squareName(move.toRow, move.toCol)}`}
        viewBox="0 0 8 8" style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:55, pointerEvents:'none', overflow:'visible' }}>
        <polygon points={hintArrowPoints(move).map(point => point.join(',')).join(' ')} fill="#ffe3a0" stroke="#332d20" strokeWidth=".025" strokeLinejoin="round" />
        {(['from','to'] as const).map(kind => {
            const row = kind === 'from' ? move.fromRow : move.toRow;
            const col = kind === 'from' ? move.fromCol : move.toCol;
            const color = kind === 'from' ? '#9ed8ff' : '#ffe3a0';
            return <g key={kind} data-hint-endpoint={kind}>
                <rect x={col + .035} y={row + .035} width=".93" height=".93" rx=".07" fill="none" stroke="#172219" strokeWidth=".085" />
                <rect x={col + .035} y={row + .035} width=".93" height=".93" rx=".07" fill="none" stroke={color} strokeWidth=".045" />
                <g transform={`translate(${col + .5},${row + (flipped ? .15 : .85)}) rotate(${flipped ? 180 : 0})`}>
                    <rect x="-.27" y="-.11" width=".54" height=".22" rx=".05" fill="#182119" />
                    <text textAnchor="middle" dominantBaseline="central" fill={color} fontSize=".18" fontFamily="sans-serif" fontWeight="700">{squareName(row,col)}</text>
                </g>
            </g>;
        })}
    </svg>;
}
