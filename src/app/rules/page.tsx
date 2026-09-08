'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { AdBanner } from '../../components/AdBanner';
import { InteractiveTutorial } from '../../components/InteractiveTutorial';

export default function RulesPage() {
  const [lang, setLang] = useState<'en' | 'ja'>('en');
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('qg_language');
      if (savedLang === 'ja') {
        setLang('ja');
      } else if (!savedLang) {
        const browserLang = navigator.language.split('-')[0];
        if (browserLang === 'ja') setLang('ja');
      }
    }
  }, []);

  const content = {
    en: {
      back: "← BACK TO Q-GAMBIT",
      title: "Q-GAMBIT: HOW TO PLAY",
      intro: "Welcome to Q-GAMBIT! In this unique chess variant, the true identity of every piece is hidden at the start. Deduction, bluffing, and keeping your King hidden are the keys to victory.",
      sec1Title: "1. Identities are hidden until they move",
      sec1p1: "At the start of the game, all pieces look exactly the same. No one knows which piece is the Rook, Knight, or Bishop.",
      sec1p2: "A piece's identity is gradually revealed by how it moves. For example, if a piece moves diagonally, it proves it must be a Bishop or a Queen. The game automatically eliminates impossible identities.",
      sec2Title: "2. Revealing the True Identity",
      sec2p1: "Every time you move a piece, its possible identities are narrowed down.",
      sec2li1: "Validating the Move: If the piece's remaining possibilities include a piece that can make the requested move, the move succeeds.",
      sec2li2: "Filtering Possibilities: Any identity that cannot make that move is permanently eliminated.",
      sec2li3: "Revealing (Flipping): When only ONE possible identity remains (e.g., it has moved exactly like a Knight), its true identity is permanently revealed to both players.",
      sec2rule: "Crucial Rule: If you attempt a move that is impossible for ALL remaining identities of that piece, the move will be rejected.",
      sec3Title: "3. Winning the Game & Strategy",
      sec3p1: "The goal is the same as traditional chess: Capture the opponent's King. However, since the King is hidden, finding it is your first objective.",
      sec3BoxTitle: "Master Strategy: Hide Your King",
      sec3Boxp1: "The most important strategy in Q-GAMBIT is to keep your King's identity a secret.",
      sec3Boxli1: "Don't reveal your King early: Making King-specific moves will narrow down its identity and make it a target.",
      sec3Boxli2: "Bluffing: Move a different piece as if it were your King to draw enemy attacks.",
      sec3Boxli3: "Chain Reactions: If a piece is revealed to be a Queen, the game knows no other piece can be a Queen, which might instantly reveal the identities of other pieces!",
      sec4Title: "4. Capturing and Promotion",
      sec4p1: "Capturing: When you capture an enemy piece, it is removed from the board immediately, even if its true identity was never fully revealed. (If you captured their King, you win instantly!)",
      sec4p2: "Promotion: If a piece reaches the opposite end of the board AND it still has the possibility of being a Pawn, it is revealed as a Pawn and promoted (e.g., to a Queen).",
      sec5Title: "5. About the Game",
      sec5p1: "Q-GAMBIT combines the mechanics of chess with deduction and hidden information.",
      sec5p2: "Test your logic and bluffing skills against our AI or challenge players worldwide in Online mode!",
      footer: "For bug reports or inquiries, please visit our GitHub.",
      playTutorial: "Play Interactive Tutorial"
    },
    ja: {
      back: "← もどる",
      title: "Q-GAMBIT: ルール説明",
      intro: "Q-GAMBIT（キュー・ギャンビット）へようこそ！このゲームは、すべての駒の正体が隠された状態からスタートする、推理と心理戦のチェスです。情報こそが最大の武器であり、自分の「王様（キング）」の正体を隠し通すことが勝利へのカギとなります。",
      sec1Title: "1. 駒の正体は動かすまでわからない！",
      sec1p1: "ゲーム開始時、すべての駒は全く同じ見た目をしています。どれがルークで、どれがナイトなのかは誰にもわかりません。",
      sec1p2: "駒の正体は「動かし方」によって少しずつバレていきます。例えば、大きく斜めに動いた駒は「斜めに動ける駒（ビショップかクイーン）」のどちらかだと確定します。ありえない可能性は自動的に消去されていきます。",
      sec2Title: "2. 正体が確定する瞬間",
      sec2p1: "駒を動かすたびに、その駒が何者であるかが絞り込まれていきます。",
      sec2li1: "移動できるかチェック: 選んだ駒の可能性の中に、その動きができる駒が残っていれば移動できます。",
      sec2li2: "可能性の消去: その動きができない駒の可能性は、リストから完全に消去されます。",
      sec2li3: "正体の確定（オープン）: 可能性が「残り１つ」になると、その駒の正体が確定し、両方のプレイヤーに本当の姿が公開されます。",
      sec2rule: "重要ルール: 残っているどの可能性でも「絶対にできない動き」をしようとした場合は、エラーとなり動かすことができません。",
      sec3Title: "3. 勝利条件と戦略",
      sec3p1: "勝利条件は普通のチェスと同じで、「相手のキングを倒すこと」です。ただし、最初はキングも隠れているため、相手のキングを探し出すことが最初の目標になります。",
      sec3BoxTitle: "最強の戦術：キングを隠し通せ",
      sec3Boxp1: "このゲームで最も重要なのは、「自分のキングがどれかバレないようにすること」です。",
      sec3Boxli1: "キングを不用意に動かさない: ナナメに1マスだけ動くなど、キング特有の動きをすると、正体が絞り込まれて相手に狙われやすくなります。",
      sec3Boxli2: "あえてウソの動きをする: キングのフリをして別の駒を動かし、相手の攻撃を誘うのも強力な戦術です。",
      sec3Boxli3: "連鎖に注意: 例えばクイーンの正体が確定すると、「他の駒はクイーンではない」ことが確定し、他の駒の正体まで連鎖してバレてしまうことがあります。",
      sec4Title: "4. 駒を取る ＆ プロモーション",
      sec4p1: "駒を取る: 相手の駒を取った場合、その駒の正体が完全にバレる前に盤面から消滅します。何を倒したのかは最後までわからないこともあります（もし倒したのがキングなら、その瞬間にあなたの勝利です！）。",
      sec4p2: "プロモーション（昇格）: 相手の一番奥のマスにたどり着いた時、その駒が「ポーン（歩兵）」である可能性が残っていた場合、ポーンとして確定し、クイーンなどに変身することができます。",
      sec5Title: "5. ゲームの特徴",
      sec5p1: "Q-GAMBITは、「見えない情報」を推理しながら戦う新感覚のボードゲームです。普通のチェスとは違い、相手を騙す心理戦が楽しめます。",
      sec5p2: "コンピュータ（AI）との対戦や、世界中のプレイヤーとのオンライン対戦で、あなたの推理力と戦略を試してみてください！",
      footer: "バグ報告やお問い合わせはGitHubまでお願いします。",
      playTutorial: "実際の盤面でチュートリアルを見る"
    }
  };

  const c = content[lang];

  return (
    <div className="h-[100dvh] w-full bg-[#050505] text-gray-300 font-mono p-6 md:p-12 overflow-y-auto">
      <div className="max-w-4xl mx-auto pb-16">
        <div className="flex justify-between items-center mb-8">
            <Link href="/" className="text-[#D4B872] hover:text-white transition-colors text-sm inline-block tracking-widest font-bold">
            {c.back}
            </Link>
            <div className="flex gap-4 items-center">
                <button 
                    onClick={() => setShowTutorial(true)}
                    className="px-4 py-2 bg-[#B39A62]/20 border border-[#B39A62] text-[#D4B872] text-sm font-bold tracking-widest rounded hover:bg-[#B39A62] hover:text-[#11100E] transition-colors"
                >
                    {c.playTutorial}
                </button>
                <div className="flex gap-2">
                    <button onClick={() => { setLang('en'); localStorage.setItem('qg_language', 'en'); }} className={`text-sm font-bold px-2 py-1 rounded ${lang === 'en' ? 'bg-[#B39A62] text-black' : 'text-gray-400 hover:text-white'}`}>EN</button>
                    <button onClick={() => { setLang('ja'); localStorage.setItem('qg_language', 'ja'); }} className={`text-sm font-bold px-2 py-1 rounded ${lang === 'ja' ? 'bg-[#B39A62] text-black' : 'text-gray-400 hover:text-white'}`}>JA</button>
                </div>
            </div>
        </div>

        <h1 className="text-4xl md:text-5xl font-extrabold text-[#D4B872] mb-6 tracking-wider">
          {c.title}
        </h1>
        
        <p className="text-gray-400 text-lg mb-12 leading-relaxed">
          {c.intro}
        </p>

        <div className="mb-12">
           <AdBanner adClient="ca-pub-1116866075179199" adSlot="8798363654" />
        </div>

        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">{c.sec1Title}</h2>
          <div className="text-gray-300 leading-relaxed space-y-4">
            <p>{c.sec1p1}</p>
            <p>{c.sec1p2}</p>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">{c.sec2Title}</h2>
          <div className="text-gray-300 leading-relaxed space-y-4">
            <p>{c.sec2p1}</p>
            <ul className="list-disc list-inside space-y-2 ml-4 text-gray-400">
              <li><strong>{c.sec2li1.split(': ')[0]}: </strong>{c.sec2li1.split(': ')[1]}</li>
              <li><strong>{c.sec2li2.split(': ')[0]}: </strong>{c.sec2li2.split(': ')[1]}</li>
              <li><strong>{c.sec2li3.split(': ')[0]}: </strong>{c.sec2li3.split(': ')[1]}</li>
            </ul>
            <p className="mt-4">
              <strong>{c.sec2rule.split(': ')[0]}: </strong>{c.sec2rule.split(': ')[1]}
            </p>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">{c.sec3Title}</h2>
          <div className="text-gray-300 leading-relaxed space-y-4">
            <p>{c.sec3p1}</p>
            <div className="bg-[#1A1814] p-6 rounded-lg border border-[#3A3224] mt-6">
              <h3 className="text-xl font-bold text-[#D4B872] mb-3">{c.sec3BoxTitle}</h3>
              <p className="mb-4">{c.sec3Boxp1}</p>
              <ul className="list-disc list-inside space-y-2 text-gray-400">
                <li><strong>{c.sec3Boxli1.split(': ')[0]}: </strong>{c.sec3Boxli1.split(': ')[1]}</li>
                <li><strong>{c.sec3Boxli2.split(': ')[0]}: </strong>{c.sec3Boxli2.split(': ')[1]}</li>
                <li><strong>{c.sec3Boxli3.split(': ')[0]}: </strong>{c.sec3Boxli3.split(': ')[1]}</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">{c.sec4Title}</h2>
          <div className="text-gray-300 leading-relaxed space-y-4">
            <p><strong>{c.sec4p1.split(': ')[0]}: </strong>{c.sec4p1.split(': ')[1]}</p>
            <p><strong>{c.sec4p2.split(': ')[0]}: </strong>{c.sec4p2.split(': ')[1]}</p>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">{c.sec5Title}</h2>
          <div className="text-gray-300 leading-relaxed space-y-4">
            <p>{c.sec5p1}</p>
            <p>{c.sec5p2}</p>
          </div>
        </section>

        <div className="mt-16 pt-8 border-t border-[#3A3224] text-center text-sm text-gray-500">
          <p className="mb-4">{c.footer}</p>
          <a href="https://github.com/S-Suzuki17/Q-Chess" target="_blank" rel="noopener noreferrer" className="text-[#D4B872] hover:text-white transition-colors">
            github.com/S-Suzuki17/Q-Chess
          </a>
        </div>

      </div>
      {showTutorial && <InteractiveTutorial lang={lang} onClose={() => setShowTutorial(false)} />}
    </div>

  );
}
