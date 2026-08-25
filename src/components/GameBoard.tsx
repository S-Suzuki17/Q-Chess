'use client';
import React from 'react';
import LocalGameBoard from './LocalGameBoard';
import OnlineGameBoard from './OnlineGameBoard';
import { Language } from '../locales/dict';
import { User, TimeControl } from '../types/game';

interface GameBoardProps {
    lang: Language;
    user?: User;
    cpuLevel?: number;
    roomId?: string;
    onlineRole?: 'white' | 'black' | 'spectator';
    matchMode?: 'random' | 'private' | 'ranked';
    opponentId?: string;
    timeControl?: TimeControl;
    onHome?: () => void;
}

export default function GameBoard(props: GameBoardProps) {
    if (props.roomId) {
        return <OnlineGameBoard {...props} />;
    } else {
        return <LocalGameBoard {...props} />;
    }
}
