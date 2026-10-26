'use client';
import {useAndroidBackHandler} from '../hooks/useAndroidBack';


import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccountAvatar } from './AccountAvatar';
import { Settings2, HelpCircle, Flag, X } from 'lucide-react';
import type { Token } from '../lib/GameEngine';
import {hasVictoryPresentation} from '../lib/checkmatePresentation';
import type { PieceType } from '../config/gameConfig';
import type { MoveRecord } from '../lib/gameRecordService';
import type { HintMove } from './boardPresentation';
import './match-layout.css';
import './checkmate.css';
import { matchText } from '../locales/matchText';
import { hintAdviceText } from '../locales/hintAdviceText';
import { hintExplanationText } from '../locales/hintExplanationText';
import { HintExplanation } from './HintExplanation';
import { moveHintText } from '../locales/moveHintText';
import type { HintAccess } from '../lib/hintPolicy';
import { dict, type Language } from '../locales/dict';
import { QubeTeacher } from './QubeTeacher';
import type { VictoryFinish } from '../config/campaign';
import { VictoryCelebration } from './VictoryCelebration';

type Side = 'white' | 'black';
type Player = { name: string; clock: string; rating?: number | null; avatar?: string; frame?: string; emote?: string; artwork?: ReactNode };
const TYPES: PieceType[] = ['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'];
const SYMBOLS = ['♔', '♕', '♖', '♗', '♘', '♙'];
const NAMES = ['キング', 'クイーン', 'ルーク', 'ビショップ', 'ナイト', 'ポーン'];
const LIMITS = [1, 1, 2, 2, 2, 8];
const square = (row: number, col: number) => `${String.fromCharCode(97 + col)}${8 - row}`;

interface Props {
    lang: string; mode: string; white: Player; black: Player; bottomSide: Side;
    currentTurn: Side; spectator?: boolean; finished: boolean; checkmate?: boolean;
    tokens: Token[]; candidatesMap?: Map<string, ReadonlySet<PieceType>>;
    selectedTokenId: string | null; history?: MoveRecord[];
    validMoveCount: number; onClearSelection: () => void;
    onHint?: () => void; hintPending?: boolean; feedback?: string | null;
    hintAccess?: HintAccess; hintDisabled?: boolean; hintError?: string;
    onRecoverHint?: () => void; savedHint?: HintMove | null;
    hintMove?: HintMove | null; hintFailed?: boolean; onClearHint?: () => void;
    is2D: boolean; onViewChange: (flat: boolean) => void;
    onResetView: () => void;
    onHome: () => void; onRules: () => void; onResign: () => void;
    showMoveHints: boolean; onHintsChange: (show: boolean) => void;
    board: ReactNode; boardArrival?: ReactNode; notice?: ReactNode; children?: ReactNode;
    victory?:boolean; victoryEffect?:VictoryFinish;
    resultVisible?:boolean; checkNotice?:string; checkEvent?:string|number;
}

export function MatchLayout(props: Props) {
    const [expanded, setExpanded] = useState(false);
    const layout = useRef<HTMLElement>(null), footer = useRef<HTMLElement>(null);
    const details = useRef<HTMLDivElement>(null), detailsToggle = useRef<HTMLButtonElement>(null);
    const detailsReturnScroll = useRef(0);
    useEffect(() => {
        if (!expanded || !window.matchMedia('(max-width:999px)').matches) return;
        details.current?.focus({preventScroll:true});
        details.current?.scrollIntoView({block:'start', behavior:'instant'});
    }, [expanded]);
    function closeDetails() {
        setExpanded(false);
        detailsToggle.current?.focus({preventScroll:true});
        layout.current?.scrollTo({top:detailsReturnScroll.current, behavior:'instant'});
    }
    useAndroidBackHandler(()=>{if(!expanded)return false;closeDetails();return true;},30);
    function toggleDetails() {
        if (expanded) return closeDetails();
        detailsReturnScroll.current = layout.current?.scrollTop ?? 0;
        setExpanded(true);
    }
    useEffect(() => {
        const root = layout.current;
        if (!root || !footer.current || typeof ResizeObserver === 'undefined') return;
        const header = root.querySelector<HTMLElement>('.match-header');
        const main = root.querySelector<HTMLElement>('.match-main');
        const advice = root.querySelector<HTMLElement>('.match-advice');
        const players = Array.from(root.querySelectorAll<HTMLElement>('.match-player'));
        const update = () => {
            root.style.setProperty('--match-footer-height', `${footer.current?.getBoundingClientRect().height ?? 128}px`);
            const adviceHeight = advice?.childElementCount ? advice.getBoundingClientRect().height : 0;
            const gaps = 2 * (parseFloat(getComputedStyle(root).rowGap) || 0)
                + (adviceHeight ? 3 : 2) * (main ? parseFloat(getComputedStyle(main).rowGap) || 0 : 0);
            const chrome = (header?.getBoundingClientRect().height ?? 0)
                + players.reduce((height, player) => height + player.getBoundingClientRect().height, 0) + adviceHeight + gaps;
            root.style.setProperty('--match-mobile-chrome', `${chrome}px`);
        };
        const observer = new ResizeObserver(update);
        for (const element of [footer.current, header, advice, ...players]) if (element) observer.observe(element);
        update();
        return () => observer.disconnect();
    }, []);
    const label = (jp: string, en: string) => matchText(props.lang, jp, en);
    const hintText = moveHintText(props.lang), teacherLang = (props.lang in dict ? props.lang : 'en') as Language;
    const candidates = (token: Token) => token.promotedTo ? [token.promotedTo]
        : TYPES.filter(type => props.candidatesMap?.get(token.id)?.has(type)
            ?? token.probabilities[type] > 0);
    const selected = props.tokens.find(token => token.id === props.selectedTokenId && !token.isCaptured);
    const lastMove = props.history?.at(-1);
    const inspected = selected ?? props.tokens.find(token => token.id === lastMove?.tokenId && !token.isCaptured);
    const selectedTypes = inspected ? candidates(inspected) : [];
    const topSide = props.bottomSide === 'white' ? 'black' : 'white';
    const isMyTurn = !props.spectator && props.currentTurn === props.bottomSide && !props.finished;
    const enemySelected = selected && selected.player !== props.bottomSide;
    const hintPending = isMyTurn && !!props.hintPending;
    const hint = isMyTurn && !hintPending ? props.hintMove : null;
    const hintChoice = hintAdviceText(props.lang, hint ?? null);
    const hasAdvice = isMyTurn && !hintPending && !!(hint || props.hintFailed || props.hintError);
    const instruction = props.finished ? label('対局が終了しました', 'Match complete')
        : props.spectator ? label('観戦中', 'Spectating')
        : !isMyTurn ? label('相手の手番です。駒を選んで候補を確認できます。', 'Opponent’s turn. Select a piece to inspect it.')
        : enemySelected ? label('相手の駒を確認中。動かすには自分の駒を選択。', 'Inspecting an opponent’s piece. Select your piece to move.')
        : selected ? (props.validMoveCount ? label(`移動先を選択 · ${props.validMoveCount}マス`, `Choose a destination · ${props.validMoveCount} squares`) : label('移動先がありません。別の駒を選択。', 'No available moves. Select another piece.'))
        : label('あなたの手番 · 自分の駒を選択', 'Your turn · Select one of your pieces');

    function playerBar(side: Side) {
        const player = props[side];
        const active = !props.finished && props.currentTurn === side;
        const [minutes, seconds] = player.clock.split(':').map(Number);
        const urgent = !props.finished && minutes * 60 + seconds <= 30;
        const captured = props.tokens.filter(token => token.isCaptured && token.player !== side);
        return <section className={`match-player ${active ? 'is-active' : ''}`} aria-label={label(side === 'white' ? '白の対局者' : '黒の対局者', `${side} player`)}>
            {player.artwork ?? <AccountAvatar name={player.name} url={player.avatar} frame={player.frame} size={36} rating={player.rating} lang={props.lang}/>}
            <div className="match-player-name"><strong title={player.name}>{player.name}</strong>
                <span>{label(side === 'white' ? '白' : '黒', side === 'white' ? 'White' : 'Black')}{player.rating != null && ` · ${player.rating}`}
                    {active && <b>{label(side === props.bottomSide && !props.spectator ? 'あなたの手番' : '思考中', side === props.bottomSide && !props.spectator ? 'YOUR TURN' : 'THINKING')}</b>}
                </span>
            </div>
            {player.emote && <span className="match-emote">{player.emote}</span>}
            <div className="match-captured-list" data-captured-by={side} data-empty={captured.length === 0} aria-label={label('獲得した駒', 'Captured pieces')}>
                <span className="captured-heading">{label('獲得した駒', 'Captured pieces')} <b>{captured.length}</b></span>
                <div className="captured-inline">
                    {captured.length ? <ul>{captured.map(token => {
                        const types = candidates(token);
                        return <li key={token.id} data-captured-token={token.id} aria-label={`${types.map(type => label(NAMES[TYPES.indexOf(type)],type)).join(' / ')} · ${types.length === 1 ? label('確定','RESOLVED') : label('候補','possible')}`}>
                            {types.map(type => <span key={type} className={`captured-piece-icon ${token.player}`} data-captured-candidate={type} aria-hidden="true">{(token.player === 'white' ? SYMBOLS : ['♚','♛','♜','♝','♞','♟'])[TYPES.indexOf(type)]}</span>)}
                            {!types.length && <span aria-hidden="true">—</span>}
                        </li>;
                    })}</ul> : <span>—</span>}
                </div>
            </div>
            <time className={`match-clock ${active ? 'active' : ''} ${urgent ? 'urgent' : ''}`} aria-label={label(`残り時間 ${player.clock}`, `Time remaining ${player.clock}`)}>{urgent && <small>{label('残り', 'LEFT')}</small>}{player.clock}</time>
        </section>;
    }

    return <section ref={layout} lang={props.lang} className="match-layout" data-layout="strategy-studio-v2" aria-label={label('Q-GAMBIT 対局画面', 'Q-GAMBIT match')}>
        {props.victory && props.victoryEffect && <VictoryCelebration effect={props.victoryEffect} checkmate={!!props.checkmate}/>}
        <header className="match-header">
            <button className="match-brand" onClick={props.onHome} aria-label={label('ホームに戻る', 'Return home')}><span>Q</span><strong>GAMBIT</strong></button>
            <span className="match-heading">{label('対局', 'MATCH')}</span>
            <span className="match-mode">{props.mode}</span>
            <nav className="match-tools" aria-label={label('盤面の表示', 'Board view')}>
                <div className="match-view-switch">
                    <button className={`match-tool ${!props.is2D ? 'selected' : ''}`} onClick={() => props.onViewChange(false)} aria-pressed={!props.is2D}>3D</button>
                    <button className={`match-tool ${props.is2D ? 'selected' : ''}`} onClick={() => props.onViewChange(true)} aria-pressed={props.is2D}>2D</button>
                </div>
            </nav>
            <button className="match-button header-help" onClick={props.onRules}><HelpCircle size={16}/>{label('ルール', 'Rules')}</button>
            <button className="match-button" onClick={() => window.dispatchEvent(new CustomEvent('qg-open-settings'))} aria-label={label('設定', 'Settings')}><Settings2 size={17}/><span className="desktop-label">{label('設定', 'Settings')}</span></button>
            <p className="match-mobile-instruction" role="status" aria-live="polite" aria-atomic="true">
                {selected && <strong>{square(selected.row, selected.col)} · </strong>}{instruction}
            </p>
        </header>

        <main className={`match-main ${hasAdvice ? 'has-advice' : ''}`}>
            {playerBar(topSide)}
            <div className={`match-board-area ${props.checkmate ? 'is-checkmate' : ''}`} data-testid="match-board">{props.board}{props.boardArrival}
                {props.checkmate && !props.resultVisible && !(props.victory && hasVictoryPresentation(props.victoryEffect)) && <div className="checkmate-celebration" role="status" data-testid="checkmate-celebration">
                    <span aria-hidden="true">♔</span><strong>{label('チェックメイト！','Checkmate!')}</strong>
                </div>}
                {props.checkNotice && !props.finished && <div className="match-check-warning" key={props.checkEvent} role="status" data-testid="check-warning">{props.checkNotice}</div>}
                {props.notice && !props.finished && <div className="match-notice" role="status">{props.notice}</div>}
            </div>
            {/* Keep results and errors announceable; pending work stays on the action. */}
            <section className="match-advice" role="status" aria-live="polite" aria-atomic="true" data-hint-status="true" data-testid={hasAdvice ? 'move-advice' : undefined}>
                {hasAdvice && <><QubeTeacher lang={teacherLang} variant="compact" className="match-qube-advice">
                {hint ? <div className="match-advice-move">
                    <span className="advice-from">{label('動かす駒', 'Move from')} <strong data-testid="hint-source">{square(hint.fromRow,hint.fromCol)}</strong></span>
                    <span className="advice-arrow" aria-hidden="true">→</span>
                    <span className="advice-to">{label('移動先', 'Move to')} <strong data-testid="hint-destination">{square(hint.toRow,hint.toCol)}</strong></span>
                    <small className="advice-manual">{hintExplanationText(props.lang).manual}</small>
                    {hintChoice && <small className="advice-choice" data-testid="hint-choice">{hintChoice}</small>}
                    <HintExplanation key={`${hint.fromRow}:${hint.fromCol}:${hint.toRow}:${hint.toCol}`}
                        lang={props.lang} hint={hint} tokens={props.tokens} candidates={props.candidatesMap}
                        turn={props.currentTurn} history={props.history}/>
                </div> : <span>{props.hintError || label('ヒントを取得できませんでした。もう一度お試しください。', 'Hint unavailable. Please try again.')}</span>}
                </QubeTeacher>
                {props.onClearHint && <button onClick={props.onClearHint} aria-label={label('ヒントを閉じる', 'Dismiss hint')}><X size={16}/></button>}</>}
            </section>
            {playerBar(props.bottomSide)}
        </main>

        <aside className="match-sidebar">
            <section className="match-panel match-inspector" aria-label={label('駒の候補', 'Piece candidates')}>
                <div className="inspector-title"><span>{selected ? label('選択中の駒', 'SELECTED PIECE') : inspected ? label('直前に動いた駒', 'LAST MOVED PIECE') : label('駒の候補', 'PIECE IDENTITIES')}</span>
                    <strong data-testid="selected-square">{inspected ? square(inspected.row, inspected.col) : '—'}</strong>
                    <small>{!inspected ? label('未選択', 'NO SELECTION') : `${inspected.player === 'white' ? label('白', 'WHITE') : label('黒', 'BLACK')} · ${selectedTypes.length === 1 ? label('確定', 'RESOLVED') : label(`${selectedTypes.length}候補`, `${selectedTypes.length} TYPES`)}`}</small>
                    {selected && <button className="clear-selection" onClick={props.onClearSelection} aria-label={label('駒の選択を解除', 'Clear selection')}><X size={16}/></button>}
                </div>
                {inspected && <h2>{label(`${selectedTypes.length}種類の可能性`, `${selectedTypes.length} possible identities`)}</h2>}
                <div className="match-candidates">{TYPES.map((type, i) => <div key={type} className={`candidate ${selectedTypes.includes(type) ? 'possible' : inspected ? 'excluded' : ''}`} data-candidate={type} data-possible={selectedTypes.includes(type)} aria-label={`${label(NAMES[i], type)}: ${!inspected ? label('未選択', 'no selection') : selectedTypes.includes(type) ? label('候補', 'possible') : label('候補から除外', 'excluded')}`}>
                    <span aria-hidden="true">{SYMBOLS[i]}</span><small>{label(NAMES[i], type)}</small>
                </div>)}</div>
                <QubeTeacher lang={teacherLang} variant="compact" className="match-inspector-teacher">
                    <p className={`inspector-instruction ${isMyTurn ? 'your-turn' : ''}`} role="status">{instruction}</p>
                    <p className="inspector-note">{label('駒の動きから正体を絞り込む。取り消しはできません。', 'Moves narrow identities. Moves cannot be undone.')}</p>
                    <p>{label('選択した駒はもう一度押すと解除', 'Select the same piece again to deselect')}</p>
                    {props.feedback&&<p role="status">{props.feedback}</p>}
                </QubeTeacher>
            </section>
            {props.savedHint&&<QubeTeacher lang={teacherLang} variant="compact" className="match-panel match-saved-hint">
                <div role="status" data-testid="saved-hint"><strong>{hintText.saved}</strong>
                    <p>{square(props.savedHint.fromRow,props.savedHint.fromCol)} → {square(props.savedHint.toRow,props.savedHint.toCol)}</p>
                    {hintAdviceText(props.lang,props.savedHint)&&<p>{hintAdviceText(props.lang,props.savedHint)}</p>}
                    <p>{hintText.historical}</p>
                </div>
            </QubeTeacher>}
            {props.hintError&&!hasAdvice&&<QubeTeacher lang={teacherLang} variant="compact" className="match-panel"><p role="alert">{props.hintError}</p></QubeTeacher>}
            <div ref={details} className={`match-secondary ${expanded ? 'expanded' : ''}`} id="match-detail-panels"
                role="region" aria-label={label('棋譜・正体', 'Details')} tabIndex={-1}
                onKeyDown={event => { if (expanded && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeDetails(); } }}>
                <section className="match-panel match-pool">
                    <h2>{label('まだ確定していない正体', 'Unresolved identities')}</h2>
                    <div className="pool-grid"><span/>{SYMBOLS.map((symbol,i)=><span key={i} aria-label={label(NAMES[i], TYPES[i])}>{symbol}</span>)}
                        {(['white','black'] as const).map(side => {
                            const counts = [...LIMITS];
                            props.tokens.filter(token => token.player === side).forEach(token => {
                                const types = token.promotedTo ? ['Pawn' as const] : candidates(token);
                                if (types.length === 1) counts[TYPES.indexOf(types[0])]--;
                            });
                            return <div className="pool-side" key={side}><small>{side === 'white' ? 'W' : 'B'}</small>{counts.map((n,i)=><b key={i}>{Math.max(0,n)}</b>)}</div>;
                        })}
                    </div>
                    <QubeTeacher lang={teacherLang} variant="compact"><p>{label('捕獲済みも含め、正体が1種類に確定した駒を除いた残数。盤上の駒数ではありません。', 'Identity slots not yet resolved, including captures. Not the number of pieces on the board.')}</p></QubeTeacher>
                </section>
                <section className="match-panel match-history" aria-label={label('棋譜', 'Move history')}>
                    <h2>{label('棋譜', 'Moves')}<small>{props.history && `${props.history.length} ${label('手', 'plies')}`}</small></h2>
                    {props.history?.length ? <ol aria-label={label('新しい指し手から表示', 'Newest moves first')}>{props.history.map((move,i)=>({move,i})).reverse().map(({move,i})=><li key={`${i}-${move.tokenId}`} className={i === props.history!.length - 1 ? 'latest' : ''}><span>{i+1}</span><b aria-label={move.player==='white'?label('白','White'):label('黒','Black')}>{move.player==='white'?'○':'●'}</b><code>{square(...move.from)} {move.capturedTokenId ? '×' : '→'} {square(...move.to)}</code><small>{move.promotedTo ? SYMBOLS[TYPES.indexOf(move.promotedTo)] : move.possibleTypes.length===1 ? SYMBOLS[TYPES.indexOf(move.possibleTypes[0])] : '◉'}</small></li>)}</ol>
                        : <p className="history-empty">{props.history ? label('まだ指し手はありません', 'No moves yet') : label('棋譜は対局終了後に確認できます', 'Review moves after the match')}</p>}
                </section>
            </div>
        </aside>

        <footer ref={footer} className="match-footer">
            <label className="match-hints"><input type="checkbox" checked={props.showMoveHints} onChange={e=>props.onHintsChange(e.target.checked)}/>{label('移動候補', 'Move hints')}</label>
            {props.onHint && <button className="match-button match-hint-action" onClick={props.onHint} disabled={!isMyTurn || hintPending || props.hintDisabled} aria-busy={hintPending} data-hint-access={props.hintAccess??'free'}>
                <img src="/qube_icon.jpg" alt="" aria-hidden="true" className={`qube-icon ${hintPending ? 'thinking' : ''}`} width={15} height={15} />
                {props.hintAccess==='ticket' ? hintText.ticket : hintText.free}
            </button>}
            {hintPending && props.onClearHint && <button className="match-button" onClick={props.onClearHint} aria-label={label('ヒントを閉じる', 'Dismiss hint')}><X size={16}/></button>}
            {props.onRecoverHint&&<button className="match-button match-hint-recovery" disabled={!!props.hintPending} onClick={props.onRecoverHint}>{hintText.recover}</button>}
            <button ref={detailsToggle} className="match-button mobile-details" onClick={toggleDetails}
                onKeyDown={event => { if (expanded && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeDetails(); } }}
                aria-expanded={expanded} aria-controls="match-detail-panels">{label(expanded ? '閉じる' : '棋譜・正体', expanded ? 'Close' : 'Details')}</button>
            <button className="match-button mobile-rules" onClick={props.onRules}>{label('ルール', 'Rules')}</button>
            {!props.finished && !props.spectator && <button className="match-button match-resign" onClick={props.onResign}><Flag size={14}/>{label('リザイン', 'Resign')}</button>}
        </footer>
        {props.children}
    </section>;
}
