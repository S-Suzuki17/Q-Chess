'use client';
import { useEffect, useRef, useState } from 'react';
import { AccountAvatar } from './AccountAvatar';
import { Board3D } from './Board3D';
import { VictoryCelebration } from './VictoryCelebration';
import { rewardUnlocked, type BoardFinish, type PieceFinish, type VictoryFinish, type CampaignProgress } from '../config/campaign';
import { rewardName } from '../locales/campaignText';
import { circuitText } from '../locales/circuitText';
import type { Language } from '../locales/dict';
import type { Token } from '../lib/GameEngine';
import type { PieceType } from '../config/gameConfig';
import { championshipReward, referencePieceForBoard } from '../config/championshipRewards';
import { rewardCraftText } from '../locales/rewardCraftText';
import { cosmeticsSettingsText } from '../locales/cosmeticsSettingsText';
import { circuitIconForFrame } from '../config/circuitIcons';
import { MusicPreview } from './MusicPreview';
import { battleMusicTitle } from '../config/circuitMusic';

export type VisualReward={kind:'board'|'piece'|'effect'|'avatar'|'music';id:string};
const types:PieceType[]=['Rook','Knight','Bishop','Queen','King','Pawn'];
const pieces:Token[]=(['white','black'] as const).flatMap(player=>types.map((type,i)=>({
    id:`preview-${player}-${type}`,player,row:player==='white'?6:1,col:i+1,
    probabilities:Object.fromEntries(['King','Queen','Rook','Bishop','Knight','Pawn'].map(key=>[key,Number(key===type)])) as Record<PieceType,number>,
})));
const noop=()=>{};

/** Preview is local component state, never a write to the progression/equipment store. */
export function RewardPreview({lang,reward,progress,onClose}:{
    lang:Language;reward:VisualReward;progress:CampaignProgress;onClose:()=>void;onEquip?:(kind:VisualReward['kind'],id:string)=>void;
}) {
    const dialog=useRef<HTMLDialogElement>(null);
    const [run,setRun]=useState(0);
    const unlocked=rewardUnlocked(progress,reward.id);
    const design=championshipReward(reward.id);
    useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
    return <dialog ref={dialog} className="reward-preview-dialog" data-reward-motif={design?.motif} aria-labelledby="reward-preview-title" onCancel={event=>{event.preventDefault();onClose();}}>
        <header><div><small>{circuitText(lang,'preview')}</small><h2 id="reward-preview-title">{reward.kind==='music'?battleMusicTitle(reward.id)??rewardName(lang,reward.id):rewardName(lang,reward.id)}</h2></div>
            <button autoFocus onClick={onClose}>{circuitText(lang,'close')}</button></header>
        <p>{cosmeticsSettingsText(lang,'previewOnly')}</p>
        {design?.kind==='board' && <div className="reward-material-note"><span aria-hidden="true">{[design.frameColor,design.light,design.rim].map(color=><i key={color} style={{background:color}}/>)}</span>{rewardCraftText(lang,design.motif)}</div>}
        {reward.kind==='music'?<MusicPreview key={reward.id} id={reward.id} lang={lang}/>:<div className="reward-preview-board" data-testid="reward-preview-board">
            {reward.kind==='effect'?<div className="effect-preview-arena"/>:reward.kind==='avatar'?<div className="avatar-reward-preview"><AccountAvatar name="Q" url={circuitIconForFrame(reward.id)?.url} frame={reward.id} size={180}/></div>:<Board3D lang={lang} quietLayout boardFinish={(reward.kind==='board'?reward.id:progress.board) as BoardFinish}
                pieceFinish={(reward.kind==='piece'?reward.id:referencePieceForBoard(reward.id)??progress.piece) as PieceFinish}
                tokens={pieces} selectedTokenId={null} validMoves={[]} moveHistory={[]} onSquareClick={noop}
                showMoveHints={false} currentTurn="white" autoRotate={false}/>}
            {reward.kind==='effect' && <VictoryCelebration key={run} effect={reward.id as VictoryFinish} preview/>}
        </div>}
        <footer>
            {reward.kind==='effect' && <button onClick={()=>setRun(value=>value+1)}>{circuitText(lang,'preview')} ▷</button>}
            <span data-testid="preview-acquisition">{cosmeticsSettingsText(lang,unlocked?'acquired':'notAcquired')}</span>
            <p className="text-xs">{cosmeticsSettingsText(lang,'settingsOnly')}</p>
        </footer>
    </dialog>;
}
