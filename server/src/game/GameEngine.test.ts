import assert from 'assert';
import { GameEngine, Action } from './GameEngine';
import { createInitialBoard } from './quantumChess';

// Simple test runner
async function runTests() {
    console.log("Starting Node 2 Verification Tests...");
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

    const P1 = "host123";
    const P2 = "joiner456";

    check("1. 正常な着手 (Valid Move)", () => {
        const engine = new GameEngine("match1", P1, P2, createInitialBoard());
        // Move a pawn (y=1 to y=2)
        const pieceId = engine.getPublicState(P1).board[8]; // A white pawn at (0,1)
        const action: Action = { actionId: "a1", version: 0, playerId: P1, action: { type: "MOVE", payload: { pieceId, toX: 0, toY: 2 } } };
        
        const res = engine.processAction(action);
        assert(res.success, "Action should succeed");
        assert(engine.getPublicState(P1).version === 1, "Version should increment");
        assert(engine.getPublicState(P1).turn === 1, "Turn should pass to black");
    });

    check("2. 不正な着手 (Invalid Move)", () => {
        const engine = new GameEngine("match1", P1, P2, createInitialBoard());
        const pieceId = engine.getPublicState(P1).board[8];
        // Move pawn with a delta of (3, 4) which is impossible for any piece
        const action: Action = { actionId: "a1", version: 0, playerId: P1, action: { type: "MOVE", payload: { pieceId, toX: 3, toY: 5 } } };
        
        const res = engine.processAction(action);
        assert(res.success === false, "Invalid move should fail");
        assert(engine.getPublicState(P1).version === 0, "Version should not increment");
        assert(engine.getPublicState(P1).turn === 0, "Turn should remain");
    });

    check("3. 相手ターンへの着手 (Wrong Turn)", () => {
        const engine = new GameEngine("match1", P1, P2, createInitialBoard());
        const pieceId = engine.getPublicState(P1).board[48]; // Black pawn
        const action: Action = { actionId: "a1", version: 0, playerId: P2, action: { type: "MOVE", payload: { pieceId, toX: 0, toY: 5 } } };
        
        const res = engine.processAction(action);
        assert(res.success === false, "Move during opponent's turn should fail");
    });

    check("4. 同じAction IDの再送 (Idempotency / Action ID replay)", () => {
        const engine = new GameEngine("match1", P1, P2, createInitialBoard());
        const pieceId = engine.getPublicState(P1).board[8]; 
        const action: Action = { actionId: "a1", version: 0, playerId: P1, action: { type: "MOVE", payload: { pieceId, toX: 0, toY: 2 } } };
        
        const res1 = engine.processAction(action);
        assert(res1.success, "First action should succeed");
        
        const res2 = engine.processAction(action);
        assert(res2.success === true, "Replayed action should return previous success result");
        assert(engine.getPublicState(P1).version === 1, "Version should remain 1");
    });

    check("5. 古いversionからの着手 (Stale Version check)", () => {
        const engine = new GameEngine("match1", P1, P2, createInitialBoard());
        const pieceId = engine.getPublicState(P1).board[8]; 
        
        // Send a move with version 99 instead of 0
        const action: Action = { actionId: "a1", version: 99, playerId: P1, action: { type: "MOVE", payload: { pieceId, toX: 0, toY: 2 } } };
        const res = engine.processAction(action);
        assert(res.success === false, "Stale or mismatched version should fail");
    });

    check("6. ゲーム終了後の着手 (Move after Game Over)", () => {
        const engine = new GameEngine("match1", P1, P2, createInitialBoard());
        // P1 resigns
        engine.processAction({ actionId: "a1", version: 0, playerId: P1, action: { type: "RESIGN", payload: {} } });
        
        assert(engine.getPublicState(P1).gameOver === "BLACK", "Black should win");

        // P2 tries to move
        const pieceId = engine.getPublicState(P2).board[48]; 
        const action: Action = { actionId: "a2", version: 1, playerId: P2, action: { type: "MOVE", payload: { pieceId, toX: 0, toY: 5 } } };
        
        const res = engine.processAction(action);
        assert(res.success === false, "Move after game over should fail");
    });

    console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests();
