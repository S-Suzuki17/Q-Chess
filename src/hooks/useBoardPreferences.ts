import { useState, useEffect } from 'react';

export function useBoardPreferences() {
    const [is2DView, setIs2DView] = useState(false);
    const [boardDesign, setBoardDesign] = useState<'q-gambit'|'classic'|'marble'|'neon'>('q-gambit');
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const saved2D = localStorage.getItem('qchess_is2DView');
        if (saved2D !== null) setIs2DView(saved2D === 'true');
        const savedDesign = localStorage.getItem('qchess_boardDesign');
        if (savedDesign === 'q-gambit' || savedDesign === 'classic' || savedDesign === 'marble' || savedDesign === 'neon') {
            setBoardDesign(savedDesign);
        }
        setIsLoaded(true);
    }, []);

    useEffect(() => {
        if (!isLoaded) return;
        localStorage.setItem('qchess_is2DView', String(is2DView));
    }, [is2DView, isLoaded]);

    useEffect(() => {
        if (!isLoaded) return;
        localStorage.setItem('qchess_boardDesign', boardDesign);
    }, [boardDesign, isLoaded]);

    return { is2DView, setIs2DView, boardDesign, setBoardDesign };
}
