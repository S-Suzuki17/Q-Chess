import { useState, useEffect } from 'react';
import { campaignStore } from '../lib/campaignStore';
import { initialMatchAppearance } from '../lib/matchAppearance';

export function useBoardPreferences() {
    const [is2DView, setIs2DView] = useState(false);
    const [boardDesign, setBoardDesign] = useState<'classic'|'marble'|'neon'>('classic');
    const [isLoaded, setIsLoaded] = useState(false);
    const [appearance]=useState(()=>initialMatchAppearance(campaignStore.getSnapshot(),()=>localStorage));
    const {board:boardFinish,piece:pieceFinish,effect:victoryEffect,avatar:avatarFrame}=appearance;

    useEffect(() => {
        try {
        const saved2D = localStorage.getItem('qchess_is2DView');
        if (saved2D !== null) setIs2DView(saved2D === 'true');
        const savedDesign = localStorage.getItem('qchess_boardDesign');
        if (savedDesign === 'classic' || savedDesign === 'marble' || savedDesign === 'neon') {
            setBoardDesign(savedDesign);
        }
        } catch { /* Default view remains playable when storage is blocked. */ }
        setIsLoaded(true);
    }, []);

    useEffect(() => {
        if (!isLoaded) return;
        try { localStorage.setItem('qchess_is2DView', String(is2DView)); } catch { /* Session preference remains active. */ }
    }, [is2DView, isLoaded]);

    useEffect(() => {
        if (!isLoaded) return;
        try { localStorage.setItem('qchess_boardDesign', boardDesign); } catch { /* Session preference remains active. */ }
    }, [boardDesign, isLoaded]);

    return { is2DView, setIs2DView, boardDesign, boardFinish, pieceFinish, victoryEffect, avatarFrame };
}
