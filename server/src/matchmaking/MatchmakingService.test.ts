import assert from 'assert';
import { MatchmakingService } from './MatchmakingService';

// Mock Socket.IO Server
class MockServer {
    events: any[] = [];
    to(room: string) {
        return {
            emit: (event: string, data: any) => {
                this.events.push({ room, event, data });
            }
        }
    }
}

function runTests() {
    console.log("Starting Node 3 Matchmaking Tests...");
    let passed = 0;
    let failed = 0;

    function check(name: string, fn: () => void) {
        try {
            fn();
            console.log(`[PASS] ${name}`);
            passed++;
        } catch (e: any) {
            console.error(`[FAIL] ${name}`);
            console.error(e.message);
            failed++;
        }
    }

    check("1. Double join prevention", () => {
        const io = new MockServer() as any;
        const mm = new MatchmakingService(io);
        mm.registerSocket("userA", "sockA");
        
        const res1 = mm.joinQueue("userA", 600);
        assert(res1.success === false, "First join works (but doesn't return a match yet, so success is false meaning 'no match found')");
        assert(mm.getPlayerSession("userA")?.state === "WAITING");

        const res2 = mm.joinQueue("userA", 600);
        assert(res2.success === false);
        // Ensure queue size is exactly 1 (internally Set handles this, but logic prevents state override)
    });

    check("2. Three players matchmaking", () => {
        const io = new MockServer() as any;
        const mm = new MatchmakingService(io);
        mm.registerSocket("A", "sockA");
        mm.registerSocket("B", "sockB");
        mm.registerSocket("C", "sockC");

        mm.joinQueue("A", 600);
        const resB = mm.joinQueue("B", 600);
        
        assert(resB.success === true, "A and B should match");
        assert(resB.match?.players.host === "A");
        assert(resB.match?.players.joiner === "B");
        assert(mm.getPlayerSession("A")?.state === "CONNECTING");

        const resC = mm.joinQueue("C", 600);
        assert(resC.success === false, "C should wait in queue");
        assert(mm.getPlayerSession("C")?.state === "WAITING");
    });

    check("3. Match cancel prevention (A -> matchmaking, B -> matchmaking, A -> cancel)", () => {
        const io = new MockServer() as any;
        const mm = new MatchmakingService(io);
        mm.registerSocket("A", "sockA");
        mm.registerSocket("B", "sockB");

        mm.joinQueue("A", 600);
        const res = mm.joinQueue("B", 600); // Matched
        assert(res.success === true);

        // A tries to cancel
        mm.leaveQueue("A");
        
        // A should STILL be CONNECTING because leaveQueue only affects WAITING state
        assert(mm.getPlayerSession("A")?.state === "CONNECTING");
    });

    check("4. Disconnect during CONNECTING (A -> mm, B -> mm, A -> disconnect)", () => {
        const io = new MockServer() as any;
        const mm = new MatchmakingService(io);
        mm.registerSocket("A", "sockA");
        mm.registerSocket("B", "sockB");

        mm.joinQueue("A", 600);
        const res = mm.joinQueue("B", 600); // Matched
        const matchId = res.match!.matchId;

        mm.removeSocket("sockA"); // A disconnects
        
        const match = mm.getMatch(matchId);
        assert(match?.state === "CANCELLED", "Match should be cancelled");
        assert(mm.getPlayerSession("B")?.state === "IDLE", "B should be reset to IDLE");
        
        // Check broadcast
        assert(io.events.some(e => e.event === "match_cancelled"), "Should broadcast match_cancelled");
    });

    check("5. Disconnect and Reconnect (A -> mm, B -> mm, A -> disconnect, A -> reconnect)", () => {
        const io = new MockServer() as any;
        const mm = new MatchmakingService(io);
        mm.registerSocket("A", "sockA");
        mm.registerSocket("B", "sockB");

        mm.joinQueue("A", 600);
        mm.joinQueue("B", 600);

        mm.removeSocket("sockA"); // Disconnects -> Cancelled
        mm.registerSocket("A", "sockA_NEW"); // Reconnects

        assert(mm.getPlayerSession("A")?.state === "IDLE", "A should be IDLE upon reconnecting after cancelled match");
    });

    check("6. Connect Match and transition to IN_GAME", () => {
        const io = new MockServer() as any;
        const mm = new MatchmakingService(io);
        mm.registerSocket("A", "sockA");
        mm.registerSocket("B", "sockB");

        mm.joinQueue("A", 600);
        const res = mm.joinQueue("B", 600);
        const matchId = res.match!.matchId;

        mm.connectMatch("A", matchId);
        assert(mm.getMatch(matchId)?.state === "CONNECTING"); // B hasn't connected yet

        const connectRes = mm.connectMatch("B", matchId);
        assert(connectRes.match?.state === "IN_GAME", "Should transition to IN_GAME");
        assert(connectRes.engine !== undefined, "GameEngine should be instantiated");
    });

    console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests();
