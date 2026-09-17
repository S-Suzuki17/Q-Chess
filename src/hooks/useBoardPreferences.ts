import { useState, useEffect } from 'react';
import { equipReward, rewardUnlocked, type BoardFinish } from '../config/campaign';
import { useCampaignProgress } from './useCampaignProgress';
import { CHAMPIONSHIP_REWARDS } from '../config/championshipRewards';

export function useBoardPreferences() {
    const [is2DView, setIs2DView] = useState(false);
    const [boardDesign, setBoardDesign] = useState<'classic'|'marble'|'neon'>('classic');
    const [isLoaded, setIsLoaded] = useState(false);
    const {progress,update}=useCampaignProgress();
    const {board:boardFinish,piece:pieceFinish,effect:victoryEffect,avatar:avatarFrame}=progress;

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

    const cycleBoard=()=>{
        const options=['theme:classic','theme:marble','theme:neon',...(['champion-board-reference-wood','champion-board-reference-neon','walnut','slate','obsidian','mahogany','marble'] as const).filter(value=>rewardUnlocked(progress,value)),...CHAMPIONSHIP_REWARDS.filter(reward=>reward.kind==='board'&&rewardUnlocked(progress,reward.id)).map(reward=>reward.id)];
        const current=boardFinish==='standard' ? `theme:${boardDesign}` : boardFinish;
        const next=options[(options.indexOf(current)+1)%options.length];
        const finish:BoardFinish=next.startsWith('theme:') ? 'standard' : next as BoardFinish;
        if (next.startsWith('theme:')) setBoardDesign(next.slice(6) as typeof boardDesign);
        update(current=>equipReward(current,'board',finish));
    };
    return { is2DView, setIs2DView, boardDesign, setBoardDesign, boardFinish, pieceFinish, victoryEffect, avatarFrame, cycleBoard };
}
