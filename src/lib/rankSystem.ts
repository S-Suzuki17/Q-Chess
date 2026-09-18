import { badgeFromRating, type BadgeId } from '../config/profileBadges';

export type TitleInfo = {
    name: string;
    icon: string;
    color: string;
};

const TITLES: Record<BadgeId,TitleInfo> = {
    pawn:{name:'Bronze',icon:'🥉',color:'text-amber-700'},
    knight:{name:'Silver',icon:'🥈',color:'text-gray-300'},
    bishop:{name:'Gold',icon:'🥇',color:'text-yellow-400'},
    rook:{name:'Platinum',icon:'♜',color:'text-slate-300'},
    queen:{name:'Diamond',icon:'💎',color:'text-cyan-400'},
    king:{name:'Master',icon:'👑',color:'text-fuchsia-500'},
};
export function getTitleFromRating(rating: number): TitleInfo {
    const badge=badgeFromRating(rating);
    return badge?TITLES[badge.id]:{name:'Novice',icon:'🔰',color:'text-gray-400'};
}
