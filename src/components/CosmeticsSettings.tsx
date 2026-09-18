'use client';
import { useEffect, useId, useState } from 'react';
import { Grid2X2, Diamond, Sparkles, CircleUserRound, Music2, LockKeyhole } from 'lucide-react';
import type { CampaignProgress } from '../config/campaign';
import { campaignText, rewardName } from '../locales/campaignText';
import { championshipText } from '../locales/championshipText';
import { circuitText } from '../locales/circuitText';
import { stageText } from '../locales/stageText';
import { cosmeticsSettingsText } from '../locales/cosmeticsSettingsText';
import { battleMusicTitle } from '../config/circuitMusic';
import type { Language } from '../locales/dict';
import { acquiredCosmetics, boardTheme, BOARD_THEME_KEY, chooseCosmetic, type BoardTheme, type CosmeticKind } from '../lib/cosmeticOptions';

const kinds: CosmeticKind[] = ['board', 'piece', 'effect', 'avatar', 'music'];
const icons = { board: Grid2X2, piece: Diamond, effect: Sparkles, avatar: CircleUserRound, music: Music2 };
export function CosmeticsSettings({ lang, progress, update, loaded, locked }: {
    lang: Language; progress: CampaignProgress; update: (change: (current: CampaignProgress) => CampaignProgress) => void; loaded: boolean; locked: boolean;
}) {
    const id = useId();
    const [theme, setTheme] = useState<BoardTheme>('classic');
    const text = (key: Parameters<typeof cosmeticsSettingsText>[1]) => cosmeticsSettingsText(lang, key);
    useEffect(() => { try { setTheme(boardTheme(localStorage.getItem(BOARD_THEME_KEY))); } catch { /* Defaults remain usable. */ } }, []);
    const labels = { board: campaignText(lang, 'board'), piece: campaignText(lang, 'piece'), effect: championshipText(lang, 'effect'), avatar: stageText(lang, 'frame'), music: circuitText(lang, 'music') };
    const name = (value: string) => value.startsWith('theme:') ? `${campaignText(lang, 'standard')} · ${text(boardTheme(value.slice(6)))}`
        : battleMusicTitle(value) ?? rewardName(lang, value);
    return <section data-testid="cosmetics-settings" className="mt-5 border-t border-[#B39A62]/25 pt-5" aria-labelledby={`${id}-title`}>
        <header className="mb-4"><h3 id={`${id}-title`} className="text-sm font-semibold tracking-wide text-[#E8E2D7]">{text('title')}</h3><p className="mt-1 text-xs leading-relaxed text-[#A89C86]">{text('help')}</p></header>
        {locked ? <p role="status" data-testid="cosmetics-match-locked" className="flex gap-3 rounded-lg border border-[#B39A62]/20 bg-[#11100E]/50 p-3 text-xs leading-relaxed text-[#C4B8A4]"><LockKeyhole size={18} className="shrink-0" aria-hidden="true"/>{text('locked')}</p> :
            <div className="grid gap-2">{kinds.map(kind => {
                const Icon = icons[kind];
                const acquired = acquiredCosmetics(progress, kind);
                const options = kind === 'board' ? ['theme:classic', 'theme:marble', 'theme:neon', ...acquired.filter(value => value !== 'standard')] : acquired;
                const selected = kind === 'board' && progress.board === 'standard' ? `theme:${theme}` : progress[kind] ?? 'standard';
                return <div key={kind} className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-3 rounded-lg border border-[#A89C86]/15 bg-[#11100E]/45 p-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#B39A62]/10 text-[#C9AF77]"><Icon size={17} aria-hidden="true"/></span>
                    <div className="min-w-0"><label htmlFor={`${id}-${kind}`} className="mb-1.5 flex items-center justify-between gap-2 text-xs text-[#C4B8A4]"><span>{labels[kind]}</span><span className="font-mono text-[10px] text-[#8F856F]">{options.length}</span></label>
                        <select id={`${id}-${kind}`} data-cosmetic-kind={kind} value={options.includes(selected) ? selected : options[0]} disabled={!loaded}
                            onChange={event => {
                                if (locked || !loaded) return;
                                const value = event.target.value;
                                if (!options.includes(value)) return;
                                if (kind === 'board' && value.startsWith('theme:')) {
                                    const next = boardTheme(value.slice(6)); setTheme(next);
                                    try { localStorage.setItem(BOARD_THEME_KEY, next); } catch { /* Other preferences still save independently. */ }
                                }
                                update(current => chooseCosmetic(current, kind, value, locked));
                            }} className="min-h-11 w-full min-w-0 rounded-md border border-[#A89C86]/25 bg-[#211E19] px-2 text-sm text-[#E8E2D7] focus-visible:outline-2 focus-visible:outline-[#C9AF77] disabled:opacity-40">
                            {options.map(value => <option key={value} value={value}>{name(value)}</option>)}
                        </select>
                    </div>
                </div>;
            })}</div>}
    </section>;
}
