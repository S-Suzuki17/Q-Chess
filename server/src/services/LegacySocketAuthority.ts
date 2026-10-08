import type { Server, Socket } from 'socket.io';
import type { RankedIdentity, RankedSessionAuthority } from './RankedAuth';
import type { LiveLegacySession, LiveLegacyStatus } from './DurableRankedAuth';

export const LEGACY_SOCKET_POLL_MS = 5_000;
type LiveAuthority = RankedSessionAuthority & {
    inspectLiveSessions?: (sessions: readonly LiveLegacySession[]) => Promise<LiveLegacyStatus[]>;
};
type Binding = LiveLegacySession & { admissionDeadline: number };

/** In-memory socket ownership, never an authentication cache or session store.
 * One DB batch per 200 live legacy sockets, once per nonoverlapping sweep.
 * Expiry/unknown evidence/outages deny future admission but preserve games.
 */
export class LegacySocketAuthority {
    private readonly bindings = new Map<string, Binding>();
    private polling = false;
    constructor(private readonly authority: LiveAuthority, private readonly io: Pick<Server, 'sockets'>,
        private readonly owns: (userId: string, socketId: string) => boolean,
        private readonly stopWaiting: (userId: string) => void,
        private readonly unavailable: (userId: string) => void = () => {}) {}

    capture(socket: Socket, token: string, proof: RankedIdentity): void {
        socket.data.legacyAdmissionDeadline = proof.admissionDeadline ?? performance.now() + proof.expiresAt - (proof.serverNow ?? Date.now());
        socket.data.legacyAdmissionWallDeadline = Date.now() + socket.data.legacyAdmissionDeadline - performance.now();
        if (proof.fence) this.bindings.set(socket.id, {
            token, userId: proof.userId, fence: { ...proof.fence }, admissionDeadline: socket.data.legacyAdmissionDeadline,
        });
        else this.bindings.delete(socket.id);
    }
    forget(socket: Socket): void { this.bindings.delete(socket.id); }
    canAdmit(socket: Socket): boolean {
        return !socket.data.legacy || (Number.isFinite(socket.data.legacyAdmissionDeadline)
            && performance.now() < socket.data.legacyAdmissionDeadline && Date.now() < socket.data.legacyAdmissionWallDeadline);
    }
    private current(socket: Socket, binding: Binding): boolean {
        const current=this.bindings.get(socket.id);
        return socket.connected && current?.token===binding.token && current.userId===binding.userId
            && current.fence.incarnation===binding.fence.incarnation && current.fence.generation===binding.fence.generation
            && socket.data.userId === binding.userId && socket.handshake.auth.token === binding.token
            && this.owns(binding.userId, socket.id);
    }
    async poll(): Promise<void> {
        if (this.polling || !this.authority.inspectLiveSessions) return;
        this.polling = true;
        try {
            const entries = [...this.bindings.entries()];
            // Independent bounded queries start together. Slow/outage batches
            // cannot postpone another batch's explicit revocation result.
            const work: Promise<void>[] = [];
            for (let offset = 0; offset < entries.length; offset += 200) {
                const batch = entries.slice(offset, offset + 200);
                work.push((async () => {
                    let statuses: LiveLegacyStatus[];
                    try { statuses = await this.authority.inspectLiveSessions!(batch.map(([, binding]) => binding)); }
                    catch {
                        for (const [id, binding] of batch) {
                            const socket = this.io.sockets.sockets.get(id);
                            if (socket && this.current(socket, binding)) {
                                socket.data.legacyAdmissionDeadline = 0;
                                this.unavailable(binding.userId);
                                this.stopWaiting(binding.userId);
                            }
                        }
                        return;
                    }
                    for (let i = 0; i < batch.length; i++) {
                        const [id, binding] = batch[i], socket = this.io.sockets.sockets.get(id);
                        if (!socket || !this.current(socket, binding)) continue;
                        const status = statuses[i];
                        if (status === 'revoked') {
                            socket.data.explicitlyRevoked=true;
                            socket.emit('session_revoked', { reason: 'revoked' }); socket.disconnect(true);
                        } else if (status !== 'valid') {
                            socket.data.legacyAdmissionDeadline = 0;
                            if(status==='evidence_lost')this.unavailable(binding.userId);
                            this.stopWaiting(binding.userId);
                        }
                    }
                })());
            }
            await Promise.all(work);
        } finally { this.polling = false; }
    }
}
