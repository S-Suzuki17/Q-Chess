import { useId } from 'react';

/** Small authored vectors, not font glyphs or a second WebGL scene in the lobby. */
export function LobbyBrandMark() {
    return <svg viewBox="0 0 58 72" aria-hidden="true" focusable="false">
        <path d="m7 15 4-10 9 7 9-10 9 10 9-7 4 10ZM7 24l22-6 22 6v24q0 13-22 21Q7 61 7 48Z" fill="none" stroke="currentColor" strokeWidth="2.4"/>
        <path d="m15 29 14-4 14 4v18q0 10-14 16-14-6-14-16Z" fill="none" stroke="currentColor" opacity=".5"/>
        <path d="M20 54h19l-2-5-2-4q5-6 2-11l-8-5-4 5-5 3 1 5 7-2q1 5-3 8Z" fill="currentColor"/>
        <circle cx="30" cy="34" r="1.1" fill="#152015"/>
    </svg>;
}

export function LobbyChessArtwork() {
    const id=useId();
    return <svg viewBox="0 0 180 150" aria-hidden="true" focusable="false">
        <defs>
            <linearGradient id={`${id}-stone`}><stop stopColor="#758e86"/><stop offset=".38" stopColor="#d9e5df"/><stop offset=".58" stopColor="#adc5bc"/><stop offset="1" stopColor="#48665d"/></linearGradient>
            <linearGradient id={`${id}-base`} x2="0" y2="1"><stop stopColor="#aec8bc"/><stop offset="1" stopColor="#40554c"/></linearGradient>
        </defs>
        <ellipse cx="96" cy="139" rx="64" ry="9" fill="#15291e" opacity=".35"/>
        <path d="m26 125 70-19 59 20-61 20Z" fill={`url(#${id}-base)`} stroke="#dae8de" strokeOpacity=".5"/>
        <g fill={`url(#${id}-stone)`} stroke="#e6efea" strokeOpacity=".6" strokeWidth=".7">
            <path d="M72 127q-3-5 2-9l5-8h31l5 8q5 4 2 9ZM79 109q0-5 6-8 9-22 6-43h8q-3 21 6 43 6 3 6 8ZM84 55v-6h22v6ZM86 48l-5-20 13 5 13-5-5 20Z"/>
            <path d="M91 31V9h6v22ZM85 15h18v6H85Z"/>
        </g>
        <path d="M74 121h41M82 105h25M85 52h20M94 62v33" fill="none" stroke="#fbfffa" strokeOpacity=".65"/>
    </svg>;
}
