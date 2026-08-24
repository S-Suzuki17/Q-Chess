export type NodeId = string;

export interface QuantumNode {
    id: NodeId;
    pieceId: string;
    position: string;
    probability: number;
    resolved: boolean;
    exists: boolean;
}

export class EntanglementGraph {
    nodes: Map<NodeId, QuantumNode> = new Map();
    edges: Map<NodeId, Set<NodeId>> = new Map();

    addNode(node: QuantumNode) {
        this.nodes.set(node.id, node);
        if (!this.edges.has(node.id)) {
            this.edges.set(node.id, new Set());
        }
    }

    entangle(id1: NodeId, id2: NodeId) {
        this.edges.get(id1)?.add(id2);
        this.edges.get(id2)?.add(id1);
    }

    /**
     * 観測（測定）による波束の収縮処理
     * @param startId 観測されたノードID
     * @param resultExists その場所に駒が存在したか(true)否か(false)
     * @returns 成功したかどうか
     */
    measure(startId: NodeId, resultExists: boolean): boolean {
        const startNode = this.nodes.get(startId);
        if (!startNode || startNode.resolved) return false;

        // 【ガードコード】 無限ループ（ゲームフリーズ）を防ぐため、訪問済みノードを追跡する
        const visited = new Set<NodeId>();
        const queue: {id: NodeId, exists: boolean}[] = [{id: startId, exists: resultExists}];

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) continue;
            
            // 既に確定処理済みのノードを再度処理しようとした場合はスキップ（無限ループ防止）
            if (visited.has(current.id)) continue;
            visited.add(current.id);

            const node = this.nodes.get(current.id);
            if (node && !node.resolved) {
                node.resolved = true;
                node.exists = current.exists;
                node.probability = current.exists ? 1 : 0;

                // もつれ関係にあるノードは「排他的（一方が存在すればもう一方は存在しない）」とする
                const neighbors = this.edges.get(current.id) || new Set();
                for (const neighborId of Array.from(neighbors)) {
                    if (!visited.has(neighborId)) {
                        queue.push({id: neighborId, exists: !current.exists});
                    }
                }
            }
        }
        return true;
    }
}
