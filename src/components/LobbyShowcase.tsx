'use client';
import type { CSSProperties } from 'react';
import type { User } from '../types/game';
import type { Language } from '../locales/dict';
import { campaignText, rewardName } from '../locales/campaignText';
import { cosmeticsSettingsText } from '../locales/cosmeticsSettingsText';
import { circuitText } from '../locales/circuitText';
import { rewardsHubText } from '../locales/rewardsHubText';
import { rewardBoard, rewardUnlocked, type CampaignProgress } from '../config/campaign';
import { CIRCUIT_MUSIC, battleMusicTitle, battleMusicUrl, type MusicReward } from '../config/circuitMusic';
import { acquiredCosmetics } from '../lib/cosmeticOptions';
import { DAILY_LOGIN_REWARDS_ENABLED } from '../lib/dailyLoginRewards';
import { MEMBER_TICKET_USAGE_ENABLED } from '../lib/stripeMembership';
import { DailyLoginRewardsPanel } from './DailyLoginRewardsPanel';
import { MemberTicketsPanel } from './MemberTicketsPanel';
import { PieceRewardArtwork } from './RewardArtwork';
import type { VisualReward } from './RewardPreview';

/** Read-only projection: opening a preview cannot equip items or credit tickets. */
export function LobbyShowcase({ user, lang, progress, onPreview, onRewards, onSettings }: {
    user: User; lang: Language; progress: CampaignProgress;
    onPreview: (reward: VisualReward) => void; onRewards?: () => void; onSettings: () => void;
}) {
    const board = rewardBoard(progress.board) ?? rewardBoard('walnut')!;
    const candidates = [progress.music, ...acquiredCosmetics(progress, 'music'), CIRCUIT_MUSIC[0].id];
    const songs = candidates.filter((id, index) => candidates.findIndex(other =>
        battleMusicUrl(other as MusicReward) === battleMusicUrl(id as MusicReward)) === index).slice(0, 2);
    const hub = rewardsHubText(lang);
    return <div className="lobby-showcase">
        <section className="lobby-collection lobby-card">
            <header><h2>{campaignText(lang, 'rewards')}</h2><button type="button" onClick={onSettings}>{cosmeticsSettingsText(lang, 'title')} ↗</button></header>
            <div className="lobby-collection-grid">
                {(['board', 'piece'] as const).map(kind => <article key={kind} className="lobby-item-card" data-lobby-cosmetic={kind} data-reward-id={progress[kind]}>
                    <div className="lobby-item-art" aria-hidden="true">
                        {kind === 'board' ? <div className="lobby-board-miniature" style={{
                            '--mini-light': board.light, '--mini-dark': board.dark, '--mini-frame': board.frameColor,
                        } as CSSProperties}>{Array.from({ length: 64 }, (_, i) => <i key={i} data-light={(Math.floor(i / 8) + i) % 2 === 0}/>)}</div>
                            : <PieceRewardArtwork finish={progress.piece}/>}
                    </div>
                    <h3>{rewardName(lang, progress[kind])}</h3>
                    <p className="lobby-item-meta">{campaignText(lang, kind)} · {cosmeticsSettingsText(lang, rewardUnlocked(progress, progress[kind]) ? 'acquired' : 'notAcquired')}</p>
                    <button type="button" aria-label={`${rewardName(lang, progress[kind])} · ${campaignText(lang, kind)} · ${circuitText(lang, 'preview')}`} onClick={() => onPreview({ kind, id: progress[kind] })}>{circuitText(lang, 'preview')}</button>
                </article>)}
            </div>
        </section>
        <section className="lobby-music lobby-card">
            <header><h2>{circuitText(lang, 'music')}</h2></header>
            <div className="lobby-music-grid">
                {songs.map((id, index) => <article key={id} className="lobby-track" data-lobby-music={id}>
                    <div className={`lobby-album lobby-album-${index}`} aria-hidden="true"><span>♞</span></div>
                    <h3 title={battleMusicTitle(id) ?? rewardName(lang, id)}>{battleMusicTitle(id) ?? rewardName(lang, id)}</h3>
                    <p className="lobby-item-meta">{cosmeticsSettingsText(lang, rewardUnlocked(progress, id) ? 'acquired' : 'notAcquired')}</p>
                    <button type="button" aria-label={`${battleMusicTitle(id) ?? rewardName(lang, id)} · ${circuitText(lang, 'preview')}`} onClick={() => onPreview({ kind: 'music', id })}><span aria-hidden="true">▶</span> {circuitText(lang, 'preview')}</button>
                </article>)}
            </div>
        </section>
        {user.type === 'registered' && <section className="lobby-wallet lobby-card">
            <header><h2>{hub.title}</h2></header>
            {DAILY_LOGIN_REWARDS_ENABLED || MEMBER_TICKET_USAGE_ENABLED ? <><DailyLoginRewardsPanel user={user} lang={lang}/><MemberTicketsPanel user={user} lang={lang}/></>
                : <p className="lobby-wallet-status">{campaignText(lang, 'locked')}</p>}
            {onRewards && <button type="button" className="lobby-wallet-action" onClick={onRewards}>{hub.title} ↗</button>}
        </section>}
    </div>;
}
