'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { AdBanner } from '../../components/AdBanner';

export default function RulesPage() {
  const [lang, setLang] = useState<'en' | 'ja'>('en');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('qg_language');
      if (savedLang === 'ja') setLang('ja');
    }
  }, []);

  const content = {
    en: {
      back: "\u2190 BACK TO Q-GAMBIT",
      title: "Q-GAMBIT: RULES & STRATEGY GUIDE",
      intro: "Welcome to the definitive guide for Q-GAMBIT, a revolutionary Quantum Chess experience. Unlike traditional chess, Q-GAMBIT introduces the bizarre and fascinating principles of quantum mechanics\u2014namely Superposition and Wave Function Collapse\u2014into the classic game of strategy. Here, information is your most valuable weapon, and hiding the true identity of your King is the key to victory.",
      sec1Title: "1. The Core Concept: Quantum Superposition",
      sec1p1: "In Q-GAMBIT, pieces do not start as definitive entities (like a Rook, Knight, or Bishop). Instead, they begin the game in a state of Quantum Superposition. This means a single piece simultaneously holds the potential to be multiple different pieces at once.",
      sec1p2: "Both players start with identical unknown tokens. Only through their movement do they begin to reveal their true nature. For example, if a token moves diagonally, it instantly proves it cannot be a Rook or a Knight. The game engine mathematically eliminates the impossible piece types from that token's superposition.",
      sec2Title: "2. Movement & Wave Function Collapse",
      sec2p1: "Every time you command a piece to move, you force it to behave according to the rules of a specific chess piece. This action acts as an Observation.",
      sec2li1: "Validating the Move: If the piece's current superposition still contains a piece type capable of making the requested move, the move is executed.",
      sec2li2: "Filtering Possibilities: Piece types that cannot make that move are permanently eliminated from the token's superposition.",
      sec2li3: "Quantum Collapse: When only one possible piece type remains (e.g., it has moved exactly like a Knight so many times that it can be nothing else), the piece collapses. Its identity is permanently revealed to both players on the board.",
      sec2rule: "Crucial Rule: If you attempt a move that is impossible for ALL remaining potential identities of that piece, the move will be rejected (a Quantum Paradox).",
      sec3Title: "3. Winning the Game & The 'King Stealth' Strategy",
      sec3p1: "The ultimate objective remains the same as traditional chess: Checkmate or capture the opponent's King. However, because the King is hidden in superposition at the start of the game, finding it is half the battle.",
      sec3BoxTitle: "Master Strategy: King Stealth & Ambiguity",
      sec3Boxp1: "The most critical strategic element in Q-GAMBIT is the concept of King Ambiguity. You must actively protect the superposition state of your potential Kings.",
      sec3Boxli1: "Do not collapse your King early: If you make a 1-square diagonal move (which only a King, Queen, or Pawn can do), you drastically reduce the possibilities of that piece. If you reduce it down to just a King, your opponent knows exactly who to target.",
      sec3Boxli2: "The Qoppelia AI Engine: Our proprietary AI engine, Qoppelia, is explicitly programmed to evaluate King Entropy. It aggressively penalizes moves that reduce the ambiguity of its own King, treating information loss as a massive disadvantage. You should adopt this same mindset.",
      sec3Boxli3: "Bluffing: Move pieces in ways that mimic a King to draw enemy fire, while keeping your actual King disguised as a Pawn or a Bishop.",
      sec4Title: "4. Promotions and Captures",
      sec4p1: "Capturing: When you capture an enemy piece, it is immediately removed from the board, regardless of its superposition. You may never know what you actually captured\u2014unless it was the King, which immediately ends the game!",
      sec4p2: "Pawn Promotion: If a piece reaches the opposite end of the board AND its superposition still includes the possibility of being a Pawn, it collapses into a Pawn and is immediately promoted (e.g., to a Queen). If the piece's superposition no longer contains a Pawn, it simply rests on the final rank without promoting.",
      sec5Title: "5. About the Development",
      sec5p1: "Q-GAMBIT was developed to explore the intersection of incomplete information games and classical board game mechanics. The backend utilizes a specialized Quantum Zobrist Hashing algorithm to manage millions of superposition board states per second, allowing our AI to calculate deep tactical variations despite the staggering mathematical complexity of hidden piece identities.",
      sec5p2: "Whether you are playing locally against our Minimax-based AI or challenging players worldwide via our Socket.io matchmaking servers, Q-GAMBIT offers a completely novel analytical challenge that traditional chess cannot provide.",
      footer: "For inquiries, bug reports, or feature requests, please visit our GitHub repository."
    },
    ja: {
      back: "\u2190 Q-GAMBIT に戻る",
      title: "Q-GAMBIT: ルール ＆ 戦略ガイド",
      intro: "Q-GAMBIT（量子チェス）の完全解説ガイドへようこそ。従来のチェスとは異なり、Q-GAMBITでは量子力学の「重ね合わせ（Superposition）」と「波束の収縮（Wave Function Collapse）」の概念が戦略に組み込まれています。このゲームでは「情報」こそが最大の武器であり、自玉（キング）の正体を隠し通すことが勝利への鍵となります。",
      sec1Title: "1. コアコンセプト: 量子的な重ね合わせ",
      sec1p1: "Q-GAMBITでは、ルークやナイトといった駒の種類はゲーム開始時には確定していません。すべての駒は「重ね合わせ」の状態で始まり、1つの駒が同時に複数の種類の駒である可能性を秘めています。",
      sec1p2: "両プレイヤーは全く同じ見た目の未知のトークンからスタートします。駒が移動することで初めてその正体が絞り込まれていきます。例えば、あるトークンが斜めに動いた瞬間、それがルークやナイトである可能性は消滅します。システムは数学的に不可能な駒種を重ね合わせ状態から除外します。",
      sec2Title: "2. 移動と波束の収縮（コラプス）",
      sec2p1: "駒を動かすという行為は、その駒の振る舞いを「観測」することを意味します。",
      sec2li1: "移動の判定: その駒が持っている可能性（重ね合わせ）の中に、指定された移動ができる駒種が1つでも残っていれば、移動は成立します。",
      sec2li2: "可能性の除外: その移動ができない駒種は、そのトークンの可能性から永久に除外されます。",
      sec2li3: "量子的収縮（コラプス）: 可能性が絞り込まれ、最後の一つの駒種に確定した瞬間、その駒は「収縮（コラプス）」し、正体が盤面上で両プレイヤーに公開されます。",
      sec2rule: "重要ルール: もし、残っているどの駒種であっても不可能な移動を行おうとした場合、その操作は「量子的パラドックス」として拒否されます。",
      sec3Title: "3. 勝利条件と『キングステルス戦術』",
      sec3p1: "最終的な勝利条件は通常のチェスと同じで、相手のキングを詰ます（または取る）ことです。しかし、開始時点ではキングも重ね合わせの中に隠れているため、相手のキングを見つけ出すことが最初の課題となります。",
      sec3BoxTitle: "究極の戦略: キングの曖昧性（King Stealth）",
      sec3Boxp1: "Q-GAMBITにおいて最も重要な戦略要素は「キングの曖昧性（King Ambiguity）」を保つことです。自軍のキング候補が特定されないよう、細心の注意を払う必要があります。",
      sec3Boxli1: "キングを早期に確定させない: 例えば斜めに1マス動く操作は、キング・クイーン・ポーンしかできないため、一気に可能性を狭めてしまいます。キングであることが確定してしまうと、相手にピンポイントで狙い撃ちされます。",
      sec3Boxli2: "Qoppelia AI エンジン: 当ゲームの専用AI「Qoppelia」は、キング候補の数（エントロピー）を評価し、「自玉の選択肢が狭まるほど不利になる（ステルス性の低下）」と判定して強烈なペナルティを課すように設計されています。プレイヤーもこの思考に倣うべきです。",
      sec3Boxli3: "ブラフ（ハッタリ）: 実際にはポーンやビショップである駒をあえてキングのように動かして相手の攻撃を誘導し、本物のキングは安全な場所で隠し通す戦術が極めて有効です。",
      sec4Title: "4. プロモーション（昇格）とキャプチャ（駒取り）",
      sec4p1: "駒取り: 相手の駒を取った場合、その駒は重ね合わせ状態に関わらず盤上から取り除かれます。それが何の駒だったのかは（それがキングでゲームが終了しない限り）永遠に分かりません。",
      sec4p2: "プロモーション: 盤面の最奥に到達した際、その駒の可能性に「ポーン」が残っていれば、強制的にポーンとして収縮し、そのままプロモーション（クイーン等への昇格）が行われます。ポーンの可能性が残っていなければ昇格はしません。",
      sec5Title: "5. 開発の背景と技術",
      sec5p1: "Q-GAMBITは不完全情報ゲームと古典的ボードゲームの融合を探求するために開発されました。バックエンドでは「量子対応Zobristハッシュ」アルゴリズムを採用し、駒の正体が隠されたことによる天文学的な計算量の増大を抑えつつ、AIが数百万手先まで深く探索できる設計になっています。",
      sec5p2: "オフラインでMinimaxベースのAIと戦う場合でも、Socket.ioを通じたオンラインマッチメイキングで世界中のプレイヤーと戦う場合でも、従来のチェスにはない全く新しい情報戦の体験を提供します。",
      footer: "お問い合わせ、バグ報告、機能リクエストは GitHub リポジトリまでお願いします。"
    }
  };

  const c = content[lang];

  return (
    <div className="h-[100dvh] w-full bg-[#050505] text-gray-300 font-mono p-6 md:p-12 overflow-y-auto">
      <div className="max-w-4xl mx-auto pb-16">
        <Link href="/" className="text-[#D4B872] hover:text-white transition-colors text-sm mb-8 inline-block tracking-widest font-bold">
          {c.back}
        </Link>

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
    </div>
  );
}
