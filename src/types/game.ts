export interface User {
    id: string;
    name: string;
    type: 'guest' | 'registered';
    avatar_url?: string;
}

export interface Profile {
    id: string;
    name: string;
    rating?: number;
    rating_10s?: number;
    rating_3m?: number;
    rating_10m?: number;
    is_anonymous?: boolean;
    password_hash?: string;
    email?: string;
    avatar_url?: string; // Newly added for user photos
}

export type GameState = 'title' | 'level_select' | 'playing' | 'replay';

export type TimeControl = '10s' | '3m' | '10m';
