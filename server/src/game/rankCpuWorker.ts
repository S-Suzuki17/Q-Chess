import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import type { PublicGameState } from './GameEngine';
import { chooseCpuMove, type CpuMove, type CpuProfile } from './RankCpuSearch';

export interface RankCpuWorkerRequest {
    state: PublicGameState;
    profile: CpuProfile;
    deadline?: number;
    reportProgress?: boolean;
}
export interface RankCpuWorkerResponse {
    version: number;
    move: CpuMove | null;
    error?: string;
    partial?: boolean;
}

// No sockets, credentials or other network access enter this isolated rules worker.
// One worker per move exits naturally after posting its result. The match coordinator
// must compare version/turn before applying the payload through GameEngine.
if (!isMainThread && parentPort) {
    const request = workerData as RankCpuWorkerRequest;
    let response: RankCpuWorkerResponse;
    try {
        const report = request.reportProgress ? (move: CpuMove) => parentPort!.postMessage({
            version: request.state.version, move, partial: true,
        } satisfies RankCpuWorkerResponse) : undefined;
        response = { version: request.state.version, move: chooseCpuMove(request.state, request.profile, request.deadline, report) };
    } catch (error) {
        response = {
            version: request?.state?.version ?? -1,
            move: null,
            error: error instanceof Error ? error.message : 'CPU search failed',
        };
    }
    parentPort.postMessage(response);
}
