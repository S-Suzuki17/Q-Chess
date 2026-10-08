import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Socket } from 'socket.io-client';
import { SharedMatchAdmissionChoice } from '../../../../src/components/SharedMatchAdmissionChoice';
import { useSharedMatchChoice } from '../../../../src/hooks/useSharedMatchChoice';
import '../../../../src/app/globals.css';

// In-memory transport only. This fixture never imports a runtime socket client,
// account provider, balance authority or ad provider.
type Listener = (data?: unknown) => void;
type Emission = { socket: string; event: string; data: unknown };
const emissions: Emission[] = [];
class FixtureSocket {
    connected = true;
    listeners = new Map<string, Set<Listener>>();
    constructor(readonly id: string) {}
    on(event: string, listener: Listener) {
        const group = this.listeners.get(event) ?? new Set<Listener>();
        group.add(listener); this.listeners.set(event, group); return this;
    }
    off(event: string, listener: Listener) { this.listeners.get(event)?.delete(listener); return this; }
    emit(event: string, data: unknown) { emissions.push({ socket: this.id, event, data }); return this; }
    receive(event: string, data?: unknown) { this.listeners.get(event)?.forEach(listener => listener(data)); }
}
const sockets = new Map<string, FixtureSocket>();
const initialSocket = new FixtureSocket('account-a'); sockets.set(initialSocket.id, initialSocket);
const captured = new Map<string, Map<string, Listener[]>>();
let retainedChoice: ReturnType<typeof useSharedMatchChoice> | null = null;
const qa = {
    ready: false,
    matchId: '',
    socketId: '',
    setMatch: (_matchId: string) => {},
    replaceSocket: (_socketId: string | null) => {},
    rerender: () => {},
    retainChoice: () => {},
    chooseRetained: (source: 'ticket' | 'verified_ad') => retainedChoice?.choose(source),
    cancelRetained: () => retainedChoice?.cancel(),
    emissions: () => emissions.map(entry => ({ ...entry })),
    receive: (socketId: string, event: string, data?: unknown) => sockets.get(socketId)!.receive(event, data),
    disconnect: (socketId: string) => {
        const socket = sockets.get(socketId)!; socket.connected = false; socket.receive('disconnect');
    },
    reconnect: (socketId: string) => {
        const socket = sockets.get(socketId)!; socket.connected = true; socket.receive('connect');
    },
    capture: (name: string, socketId: string) => {
        captured.set(name, new Map([...sockets.get(socketId)!.listeners].map(([event, listeners]) => [event, [...listeners]])));
    },
    replay: (name: string, event: string, data?: unknown) => captured.get(name)?.get(event)?.forEach(listener => listener(data)),
};
Object.assign(window, { sharedChoiceQA: qa });
function Fixture() {
    const [matchId, setMatch] = useState('10000000-0000-4000-8000-000000000001');
    const [socket, setSocket] = useState<FixtureSocket | null>(initialSocket);
    const [, setRevision] = useState(0);
    const lang = new URLSearchParams(location.search).get('lang') === 'ja' ? 'ja' : 'en';
    const choice = useSharedMatchChoice(socket as unknown as Socket | null, matchId);
    useEffect(() => {
        document.documentElement.lang = lang;
        qa.setMatch = setMatch;
        qa.replaceSocket = id => {
            if (id === null) { setSocket(null); return; }
            const replacement = new FixtureSocket(id); sockets.set(id, replacement); setSocket(replacement);
        };
        qa.rerender = () => setRevision(value => value + 1);
        qa.retainChoice = () => { retainedChoice = choice; };
        qa.matchId = matchId;
        qa.socketId = socket?.id ?? 'none';
        qa.ready = true;
    }, [choice, lang, matchId, socket]);
    return <main className="grid min-h-dvh items-center p-4" data-testid="fixture"
        data-match={matchId} data-socket={socket?.id ?? 'none'} data-pending={choice.pending} data-error={choice.error}>
        {choice.offer
            ? <SharedMatchAdmissionChoice lang={lang} mode="ranked" offer={choice.offer} pending={choice.pending}
                error={choice.error} onChoose={choice.choose} onCancel={choice.cancel}/>
            : <p data-testid="waiting">{lang === 'ja' ? '参加方法の案内を待っています' : 'Waiting for a match offer'}</p>}
    </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>);
