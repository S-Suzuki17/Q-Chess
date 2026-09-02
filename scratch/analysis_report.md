# Q-GAMBIT First Move Greedy Analysis

ご指摘の通り、「なぜ現在のGreedy評価が初手からクイーン・ルークを確定させてまで駒を取りにいくのか」を分析しました。

以下は、初期盤面から白（先手）が指せる全ての手を生成し、その後の状態（`nextState`）に対して各評価要素を出力した結果の一部です。

## 分析結果 (Turn 1)

### A. 量子候補を維持する手（例：ポーンのように2マス前進）
* **Move**: `(0,6) -> (0,4)`
* **Resulting Quantum State**: `{Pawn, Rook, Queen}` (候補数: 3)
* **Captured Pieces**: 0
* **Constraint Changes**: `Count: 6 -> 3`
* **Eval Breakdown**:
  * **Piece Value (Material)**: `0.0` (互角)
  * **Candidate Allocation (Count)**: `-1.5` (自分の候補が減ったことによる微減)

### B. 候補を確定して駒を取る手（例：ルークのように直進して敵陣の駒を取る）
* **Move**: `(0,6) -> (0,1)`
* **Resulting Quantum State**: `{Rook, Queen}` (候補数: 2)
* **Captured Pieces**: 1 (相手の初期状態の駒)
* **Constraint Changes**: `Count: 6 -> 2`
* **Eval Breakdown**:
  * **Piece Value (Material)**: `+9.0` (相手の未確定駒[Max=9]を取った圧倒的アドバンテージ)
  * **Candidate Allocation (Count)**: `+1.0` (相手の候補数が6減り、自分の候補数が4減ったため、相対的に自分の候補総数の方が多くなった)

## 考察
現在のGreedy評価（Materialベース）では、**「相手の未確定駒（最大価値9）を盤面から消し去ること」による物質的スコア（+9.0）が圧倒的に高く評価**されています。

さらに悪いことに、駒を取ることで相手の未確定駒が消滅するため、盤面全体の「量子候補の総数（Candidate Allocation）」すらも自軍の方が有利になってしまっています（相手は6候補失うが、自分は6->2で4候補しか失わないため）。

結果として、「駒を1枚取ること」が「自分の量子状態を維持する価値」をあらゆる面で上回ってしまっており、Qoppelia的な高度な評価軸（MobilityやOrigin Valueなど）が存在しない・機能していないことが、この特攻挙動の根本原因です。
