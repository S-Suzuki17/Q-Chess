'use client';
import { useSyncExternalStore } from 'react';
import { circuitAccess,isCircuitAccount } from '../lib/circuitAccess';
import type { User } from '../types/game';

export function useCircuitAccess(user:User|null) {
    const access=useSyncExternalStore(circuitAccess.subscribe,circuitAccess.getSnapshot,circuitAccess.getServerSnapshot);
    return {allowed:isCircuitAccount(user)&&access.userId===user.id,revision:access.revision};
}
