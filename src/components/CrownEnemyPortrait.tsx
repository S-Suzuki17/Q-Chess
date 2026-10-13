import type { CSSProperties } from 'react';
import { crownEnemyForStage, type CrownEnemy } from '../config/crownEnemies';
import { CrownCharacterBody } from './CrownCharacterBody';
import './crown-motion.css';

// One original body and its crest; board piece renderers and the seated QUBE stay unchanged.
const seals = [
    'M16 48V20L32 10 48 20V48M24 48V30Q32 19 40 30V48',
    'M32 8V54M32 10L50 20 32 29M18 46L32 54 46 46',
    'M10 16L26 12 28 34 18 49 8 34ZM38 12L54 16 56 34 46 49 36 34Z',
    'M30 48L10 35 7 17 20 26 30 14M34 48L54 35 57 17 44 26 34 14',
    'M42 10A24 24 0 1 0 51 45A20 20 0 0 1 42 10Z',
    'M16 10L46 48M48 10L18 48M10 40L24 51M40 51L54 40',
    'M32 8L38 25 56 26 42 37 47 55 32 45 17 55 22 37 8 26 26 25Z',
    'M25 10H39M22 20H42V45H22ZM26 45V54H38V45M32 25V40',
    'M39 25A11 11 0 1 0 25 25L25 52H39V44H33V36H39ZM32 13V20',
    'M19 16L11 9V26L18 45 32 55 46 45 53 26V9L45 16M23 29H25M39 29H41M27 39L32 43 37 39',
    'M21 9A10 10 0 0 1 31 19V28H11V19A10 10 0 0 1 21 9ZM43 26A10 10 0 0 1 53 36V45H33V36A10 10 0 0 1 43 26ZM23 27L41 43',
    'M32 28C9 2 1 27 27 32C1 57 26 63 32 36C39 63 63 54 37 32C64 24 54 1 32 28Z',
    'M8 50L23 18 32 36 43 10 57 50ZM23 18L29 30M43 10L49 26',
    'M14 13L23 22H41L50 13V36L32 53 14 36ZM23 29H26M38 29H41M29 36L32 41 35 36',
    'M32 8V51M28 12L9 42H28ZM36 17L54 42H36ZM10 50Q32 59 54 50',
    'M39 8L15 34H30L24 57 51 27H36Z',
    'M32 8L53 32 32 56 11 32ZM21 32L32 17 43 32 32 47ZM32 8V56',
    'M13 48L22 23 28 36 32 12 36 36 42 23 51 48ZM13 48Q32 60 51 48',
    'M15 10H49M15 54H49M20 10Q20 25 32 32Q44 39 44 54M44 10Q44 25 32 32Q20 39 20 54M25 47H39',
    'M32 19A13 13 0 1 0 32 45A13 13 0 1 0 32 19ZM32 5V12M32 52V59M5 32H12M52 32H59M13 13L18 18M46 46L51 51M13 51L18 46M46 18L51 13',
];
export function CrownEnemyPortrait({ stageId = 1, enemy: chosen, player = 'black', compact = false }: { stageId?: number; enemy?: CrownEnemy; player?: 'white' | 'black'; compact?: boolean }) {
    const enemy = chosen ?? crownEnemyForStage(stageId);
    return <span className={`crown-enemy-portrait${compact ? ' crown-enemy-portrait-compact' : ''}`} data-crown-enemy-id={enemy.id} data-enemy-entrance={enemy.entrance} data-enemy-pose={enemy.pose} data-final-boss={enemy.finalBoss} data-chess-side={player} style={{ '--enemy-accent': enemy.color } as CSSProperties} aria-hidden="true">
        <svg className="crown-enemy-regalia" viewBox="0 0 160 160" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d={enemy.pose === 'sovereign' ? 'M12 124V50L30 62 42 30 54 59 80 14 106 59 118 30 130 62 148 50V124' : enemy.pose === 'vanguard' ? 'M14 128V44L29 30V122M146 128V44L131 30V122' : enemy.pose === 'sentinel' ? 'M18 40L7 73 16 113 35 134M142 40L153 73 144 113 125 134' : enemy.pose === 'duelist' ? 'M16 134L38 35 28 26M144 134L122 35 132 26' : enemy.pose === 'warden' ? 'M13 128V43H39M147 128V43H121M21 55H37M123 55H139' : 'M14 113Q-3 69 36 34M146 113Q163 69 124 34M20 104L13 97 8 105M140 104L147 97 152 105'} />
            <path className="crown-enemy-floor" d="M20 137Q80 155 140 137M35 145Q80 154 125 145"/>
        </svg>
        <CrownCharacterBody enemy={enemy} compact={compact}/>
        <svg className="crown-enemy-crest" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" aria-hidden="true"><path d={seals[enemy.crest]}/></svg>
    </span>;
}
