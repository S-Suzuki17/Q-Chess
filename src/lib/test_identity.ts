import { IdentityPool } from './IdentityPool';

function runIdentityTest() {
    const pool = new IdentityPool();
    
    // 3つの謎のトークンを盤面に配置
    pool.registerPiece('token1');
    pool.registerPiece('token2');
    pool.registerPiece('token3');

    console.log('--- アイデンティティ連鎖収縮テスト ---');
    console.log('初期状態 token1 の可能性数:', pool.piecePossibilities.get('token1')?.size); // 6 (全種類)

    // token1 が斜めや全方位に動けることが確定 -> Queenに確定させる
    console.log('\n[行動] token1 が「クイーン」でしかあり得ない動きをした！');
    pool.restrictIdentity('token1', ['Queen']);

    console.log('token1 の正体:', Array.from(pool.piecePossibilities.get('token1') || []));
    console.log('Queenの残りストック:', pool.remainingPool['Queen']); // 0のはず

    // クイーンは1つしか存在しないため、token2やtoken3は絶対にクイーンになれないはず
    const token2HasQueen = pool.piecePossibilities.get('token2')?.has('Queen');
    console.log('token2 はクイーンになれるか？:', token2HasQueen); // falseのはず

    if (token2HasQueen === false && pool.remainingPool['Queen'] === 0) {
        console.log('\n✅ テスト合格: 正体の収縮と、グローバルなストック連動（もつれ）が正しく機能し、無限ループも発生しませんでした。');
    } else {
        console.error('\n❌ テスト失敗');
        process.exit(1);
    }
}

runIdentityTest();
