import Image from 'next/image';
import type { BoardTheme } from './boardPresentation';

export const ENVIRONMENT_ART: Record<BoardTheme,string> = {
    classic: '/environments/classic-study-v2.png',
    marble: '/environments/marble-gallery-v2.png',
    neon: '/environments/neon-circuit-v2.png',
};

/** Decorative image plate only; real pieces, squares and hit testing stay in WebGL. */
export function BoardAtmosphere({theme}: {theme:BoardTheme}) {
    return <div className="board-environment" aria-hidden="true" data-environment={theme}>
        <Image key={theme} src={ENVIRONMENT_ART[theme]} alt="" width={1536} height={1024}
            unoptimized loading="eager" draggable={false} className="board-environment-art"/>
        <div className="board-environment-shade"/>
    </div>;
}
