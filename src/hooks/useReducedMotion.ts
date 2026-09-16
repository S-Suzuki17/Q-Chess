'use client';
import { useEffect, useState } from 'react';

export function useReducedMotion() {
    // Keep the first paint still until the system preference is known.
    const [reduced, setReduced] = useState(true);
    useEffect(() => {
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setReduced(media.matches);
        update();
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, []);
    return reduced;
}
