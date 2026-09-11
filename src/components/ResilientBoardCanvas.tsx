'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { graphicsQuality, observeGraphicsContext } from './boardGraphics';
import { matchText } from '../locales/matchText';
import { dict, type Language } from '../locales/dict';

class GraphicsBoundary extends React.Component<{children: React.ReactNode; onError: () => void}, {failed: boolean}> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch() { this.props.onError(); }
    render() { return this.state.failed ? null : this.props.children; }
}

function FrameHealth({onReady, onLost, onRestoring}: {onReady: () => void; onLost: () => void; onRestoring: () => void}) {
    const { gl, size, invalidate } = useThree();
    const frames = useRef(0);
    const lost = useRef(false);
    useEffect(() => observeGraphicsContext(gl.domElement, document, () => gl.getContext().isContextLost(), () => {
        lost.current = true; frames.current = 0; onLost();
    }, () => {
        lost.current = false; frames.current = 0; onRestoring(); invalidate();
    }), [gl, invalidate, onLost, onRestoring]);
    useFrame(() => {
        if (lost.current || gl.getContext().isContextLost() || size.width < 1 || size.height < 1 || frames.current >= 2) return;
        frames.current++;
        if (frames.current === 2) onReady();
    });
    return null;
}

/** Never remove the playable board while WebGL loads or recovers. */
export function ResilientBoardCanvas({children, fallback, lang, onRetry}: {
    children: React.ReactNode; fallback: React.ReactNode; lang: Language; onRetry: () => void;
}) {
    const [phase, setPhase] = useState<'loading' | 'ready' | 'recovering' | 'failed'>('loading');
    const [epoch, setEpoch] = useState(0);
    const [compact, setCompact] = useState(true);
    const recoveryCount = useRef(0);
    useEffect(() => {
        const media = window.matchMedia('(max-width: 999px), (pointer: coarse)');
        const update = () => setCompact(media.matches);
        update(); media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, []);
    const ready = useCallback(() => setPhase('ready'), []);
    const lost = useCallback(() => setPhase('recovering'), []);
    const restoring = useCallback(() => setPhase('loading'), []);
    const fail = useCallback(() => setPhase('failed'), []);
    useEffect(() => {
        if (phase === 'ready' || phase === 'failed') return;
        const timer = setTimeout(() => {
            if (phase === 'recovering' && recoveryCount.current < 1) {
                recoveryCount.current++;
                setEpoch(value => value + 1);
                setPhase('loading');
            } else setPhase('failed');
        }, phase === 'recovering' ? 4000 : 15000);
        return () => clearTimeout(timer);
    }, [phase, epoch]);
    const quality = graphicsQuality(compact);
    return <div className="board-render-surface" data-graphics-state={phase} data-graphics-quality={compact ? 'mobile' : 'desktop'}>
        {phase !== 'ready' && <div className="board-render-fallback">{fallback}</div>}
        {phase !== 'failed' && <div className="board-webgl-layer" style={{visibility: phase === 'ready' ? 'visible' : 'hidden'}}>
            <GraphicsBoundary key={epoch} onError={fail}>
                <Canvas shadows={quality.shadows} dpr={quality.dpr} gl={{antialias:true, alpha:true}}
                    resize={{scroll:false, debounce:0}}>
                    <React.Suspense fallback={null}>
                        {children}
                        <FrameHealth onReady={ready} onLost={lost} onRestoring={restoring}/>
                    </React.Suspense>
                </Canvas>
            </GraphicsBoundary>
        </div>}
        {phase !== 'ready' && <div className="board-render-status" role="status">
            <span>{phase === 'failed' ? matchText(lang,'3Dを表示できないため2Dで表示しています。','3D unavailable. Showing 2D.') : `3D · ${dict[lang].loading}`}</span>
            {phase === 'failed' && <button type="button" onClick={() => {
                onRetry(); recoveryCount.current = 0; setEpoch(value => value + 1); setPhase('loading');
            }}>{matchText(lang,'3Dを再読み込み','Reload 3D')}</button>}
        </div>}
    </div>;
}
