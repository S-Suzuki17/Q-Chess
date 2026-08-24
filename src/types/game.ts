export interface User {
    id: string;
    name: string;
    type: 'guest' | 'registered';
}

export type GameState = 'title' | 'level_select' | 'playing' | 'replay';

export type TimeControl = '10s' | '3m' | '10m';
