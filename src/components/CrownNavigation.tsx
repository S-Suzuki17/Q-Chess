'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import type { PieceType } from '../config/gameConfig';
import { QuantumPieceUI } from './QuantumPieceUI';
import { championshipReward } from '../config/championshipRewards';
import { rewardBoard, type BoardFinish, type PieceFinish } from '../config/campaign';
import { circuitIconForFrame } from '../config/circuitIcons';
import { AccountAvatar } from './AccountAvatar';
import { BoardRewardArtwork, PieceRewardArtwork, EffectRewardArtwork, MusicRewardArtwork } from './RewardArtwork';
import { crownEncounterForStage, type CrownCategory } from './crownCollection';
import {dismissDialog} from './dialogDismissal';

export function CrownTabs<T extends string>({ id, label, value, items, onChange, className = '' }: {
 id: string; label: string; value: T; items: readonly { value: T; label: string; icon?: ReactNode }[]; onChange: (value: T) => void; className?: string;
}) {
 return <div role="tablist" aria-label={label} className={`crown-tabs ${className}`}>
  {items.map((item, index) => <button type="button" key={item.value} id={`${id}-tab-${item.value}`} role="tab" aria-selected={value === item.value} aria-controls={`${id}-panel-${item.value}`} tabIndex={value === item.value ? 0 : -1}
   onClick={() => onChange(item.value)} onKeyDown={event => {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowRight' ? (index + 1) % items.length : event.key === 'ArrowLeft' ? (index + items.length - 1) % items.length : null;
    if (next === null) return;
    event.preventDefault(); onChange(items[next].value);
    document.getElementById(`${id}-tab-${items[next].value}`)?.focus();
   }}>{item.icon}<span>{item.label}</span></button>)}
 </div>;
}

/** Render the same artwork as the earned item, never an invented next reward. */
export function CrownRewardArtwork({ kind, id }: { kind: CrownCategory; id: string }) {
 const design = championshipReward(id);
 if (kind === 'avatar') return <AccountAvatar name="Q" url={circuitIconForFrame(id)?.url} frame={id} size={104}/>;
 if (design?.kind === 'board') return <BoardRewardArtwork preset={design}/>;
 if (design?.kind === 'effect') return <EffectRewardArtwork preset={design}/>;
 if (kind === 'piece') return <PieceRewardArtwork finish={id as PieceFinish} tier={design?.tier}/>;
 if (kind === 'music') return <MusicRewardArtwork tier={design?.tier ?? 1}/>;
 const board = rewardBoard(id as BoardFinish);
 return <span className="crown-board-swatch" aria-hidden="true">{Array.from({ length: 16 }, (_, index) => <i key={index} style={{ background: (Math.floor(index / 4) + index) % 2 ? board?.dark ?? '#67523d' : board?.light ?? '#ddcfb0' }}/>)}</span>;
}

export function CrownInfoDialog({ title, closeLabel, onClose, children }: { title: string; closeLabel: string; onClose: () => void; children: ReactNode }) {
 const dialog = useRef<HTMLDialogElement>(null);
 const close=()=>dismissDialog(dialog.current,onClose);
 useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
 return <dialog ref={dialog} className="reward-preview-dialog crown-info-dialog" aria-labelledby="crown-info-title" onCancel={event => { event.preventDefault(); close(); }}>
  <header><h2 id="crown-info-title">{title}</h2><button autoFocus onClick={close}>{closeLabel}</button></header>{children}
 </dialog>;
}

/** Reuse the adopted 2D game-piece renderer; never substitute a new model. */
export function CrownOpponentArtwork({ stageId, player='black' }: { stageId: number; player?: 'white'|'black' }) {
 const {foe}=crownEncounterForStage(stageId);
 const type:PieceType={pawn:'Pawn',knight:'Knight',bishop:'Bishop',rook:'Rook',queen:'Queen',king:'King'}[foe] as PieceType;
 const probabilities:Record<PieceType,number>={Pawn:0,Knight:0,Bishop:0,Rook:0,Queen:0,King:0};
 probabilities[type]=1;
 return <span className="crown-adopted-piece" data-current-piece={type}>
  <QuantumPieceUI id={`crown-opponent-${foe}`} player={player} probabilities={probabilities} isSelected={false} onClick={()=>{}} responsive/>
 </span>;
}
