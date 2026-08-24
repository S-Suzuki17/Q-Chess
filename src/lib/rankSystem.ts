export type TitleInfo = {
    name: string;
    icon: string;
    color: string;
};

export function getTitleFromRating(rating: number): TitleInfo {
    if (rating < 1200) {
        return { name: "Novice", icon: "🔰", color: "text-gray-400" };
    } else if (rating < 1500) {
        return { name: "Bronze", icon: "🥉", color: "text-amber-700" };
    } else if (rating < 1800) {
        return { name: "Silver", icon: "🥈", color: "text-gray-300" };
    } else if (rating < 2100) {
        return { name: "Gold", icon: "🥇", color: "text-yellow-400" };
    } else if (rating < 2400) {
        return { name: "Diamond", icon: "💎", color: "text-cyan-400" };
    } else {
        return { name: "Master", icon: "👑", color: "text-fuchsia-500" };
    }
}
