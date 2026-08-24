import { EntanglementGraph, QuantumNode } from './QuantumGraph';

function runTest() {
    const graph = new EntanglementGraph();

    // ノードを作成
    const nodeA: QuantumNode = { id: 'A', pieceId: 'p1', position: 'e4', probability: 0.5, resolved: false, exists: false };
    const nodeB: QuantumNode = { id: 'B', pieceId: 'p1', position: 'e5', probability: 0.5, resolved: false, exists: false };
    const nodeC: QuantumNode = { id: 'C', pieceId: 'p1', position: 'f5', probability: 0.5, resolved: false, exists: false };

    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);

    // 意図的に閉路（サイクル）を作る：A-B-C-A
    graph.entangle('A', 'B');
    graph.entangle('B', 'C');
    graph.entangle('C', 'A');

    console.log('--- テスト開始（TC-3: グラフ処理・ガードコード） ---');
    console.log('無限ループ回避テスト実行...');
    
    // ガードコードが機能していなければここでハングアップする
    const success = graph.measure('A', true);

    console.log('measure結果:', success);
    console.log('A (exists):', graph.nodes.get('A')?.exists); // true
    console.log('B (exists):', graph.nodes.get('B')?.exists); // false
    console.log('C (exists):', graph.nodes.get('C')?.exists); // true

    if (success) {
        console.log('✅ テスト合格: ガードコードが機能し、無限ループを回避して波束の収縮が完了しました。');
    } else {
        console.error('❌ テスト失敗');
        process.exit(1);
    }
}

runTest();
