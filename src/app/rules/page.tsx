import type { Metadata } from 'next';
import Link from 'next/link';
import { AdBanner } from '../../components/AdBanner';

export const metadata: Metadata = {
  title: 'Rules & Strategy Guide | Q-GAMBIT',
  description: 'Master the rules of Q-GAMBIT. Learn about quantum superposition, wave function collapse, and the ultimate King Stealth strategy to dominate the game.',
};

export default function RulesPage() {
  return (
    <div className="h-[100dvh] w-full bg-[#050505] text-gray-300 font-mono p-6 md:p-12 overflow-y-auto">
      <div className="max-w-4xl mx-auto pb-16">
        <Link href="/" className="text-[#D4B872] hover:text-white transition-colors text-sm mb-8 inline-block tracking-widest font-bold">
          &larr; BACK TO Q-GAMBIT
        </Link>

        <h1 className="text-4xl md:text-5xl font-extrabold text-[#D4B872] mb-6 tracking-wider">
          Q-GAMBIT: RULES & STRATEGY GUIDE
        </h1>
        
        <p className="text-gray-400 text-lg mb-12 leading-relaxed">
          Welcome to the definitive guide for Q-GAMBIT, a revolutionary Quantum Chess experience. 
          Unlike traditional chess, Q-GAMBIT introduces the bizarre and fascinating principles of quantum mechanics—namely <strong>Superposition</strong> and <strong>Wave Function Collapse</strong>—into the classic game of strategy. 
          Here, information is your most valuable weapon, and hiding the true identity of your King is the key to victory.
        </p>

        <div className="mb-12">
           <AdBanner adClient="ca-pub-1116866075179199" adSlot="8798363654" />
        </div>

        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">1. The Core Concept: Quantum Superposition</h2>
          <div className="text-gray-300 leading-relaxed space-y-4">
            <p>
              In Q-GAMBIT, pieces do not start as definitive entities (like a Rook, Knight, or Bishop). Instead, they begin the game in a state of <strong>Quantum Superposition</strong>. 
              This means a single piece simultaneously holds the potential to be multiple different pieces at once. 
            </p>
            <p>
              Both players start with identical unknown tokens. Only through their movement do they begin to reveal their true nature. 
              For example, if a token moves diagonally, it instantly proves it cannot be a Rook or a Knight. The game engine mathematically eliminates the impossible piece types from that token's superposition.
            </p>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">2. Movement & Wave Function Collapse</h2>
          <div className="text-gray-300 leading-relaxed space-y-4">
            <p>
              Every time you command a piece to move, you force it to behave according to the rules of a specific chess piece. This action acts as an <strong>Observation</strong>.
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 text-gray-400">
              <li><strong>Validating the Move:</strong> If the piece's current superposition still contains a piece type capable of making the requested move, the move is executed.</li>
              <li><strong>Filtering Possibilities:</strong> Piece types that cannot make that move are permanently eliminated from the token's superposition.</li>
              <li><strong>Quantum Collapse:</strong> When only one possible piece type remains (e.g., it has moved exactly like a Knight so many times that it can be nothing else), the piece <em>collapses</em>. Its identity is permanently revealed to both players on the board.</li>
            </ul>
            <p className="mt-4">
              <strong>Crucial Rule:</strong> If you attempt a move that is impossible for ALL remaining potential identities of that piece, the move will be rejected (a Quantum Paradox).
            </p>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">3. Winning the Game & The "King Stealth" Strategy</h2>
          <div className="text-gray-300 leading-relaxed space-y-4">
            <p>
              The ultimate objective remains the same as traditional chess: <strong>Checkmate or capture the opponent's King</strong>. 
              However, because the King is hidden in superposition at the start of the game, finding it is half the battle.
            </p>
            <div className="bg-[#1A1814] p-6 rounded-lg border border-[#3A3224] mt-6">
              <h3 className="text-xl font-bold text-[#D4B872] mb-3">Master Strategy: King Stealth & Ambiguity</h3>
              <p className="mb-4">
                The most critical strategic element in Q-GAMBIT is the concept of <strong>King Ambiguity</strong>. You must actively protect the superposition state of your potential Kings.
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-400">
                <li><strong>Do not collapse your King early:</strong> If you make a 1-square diagonal move (which only a King, Queen, or Pawn can do), you drastically reduce the possibilities of that piece. If you reduce it down to just a King, your opponent knows exactly who to target.</li>
                <li><strong>The Qoppelia AI Engine:</strong> Our proprietary AI engine, Qoppelia, is explicitly programmed to evaluate King Entropy. It aggressively penalizes moves that reduce the ambiguity of its own King, treating information loss as a massive disadvantage. You should adopt this same mindset.</li>
                <li><strong>Bluffing:</strong> Move pieces in ways that mimic a King to draw enemy fire, while keeping your actual King disguised as a Pawn or a Bishop.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">4. Promotions and Captures</h2>
          <div className="text-gray-300 leading-relaxed space-y-4">
            <p>
              <strong>Capturing:</strong> When you capture an enemy piece, it is immediately removed from the board, regardless of its superposition. You may never know what you actually captured—unless it was the King, which immediately ends the game!
            </p>
            <p>
              <strong>Pawn Promotion:</strong> If a piece reaches the opposite end of the board AND its superposition still includes the possibility of being a Pawn, it collapses into a Pawn and is immediately promoted (e.g., to a Queen). 
              If the piece's superposition no longer contains a Pawn, it simply rests on the final rank without promoting.
            </p>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-800 pb-2">5. About the Development</h2>
          <div className="text-gray-300 leading-relaxed space-y-4">
            <p>
              Q-GAMBIT was developed to explore the intersection of incomplete information games and classical board game mechanics. 
              The backend utilizes a specialized Quantum Zobrist Hashing algorithm to manage millions of superposition board states per second, allowing our AI to calculate deep tactical variations despite the staggering mathematical complexity of hidden piece identities.
            </p>
            <p>
              Whether you are playing locally against our Minimax-based AI or challenging players worldwide via our Socket.io matchmaking servers, Q-GAMBIT offers a completely novel analytical challenge that traditional chess cannot provide.
            </p>
          </div>
        </section>

        <div className="mt-16 pt-8 border-t border-[#3A3224] text-center text-sm text-gray-500">
          <p className="mb-4">For inquiries, bug reports, or feature requests, please visit our GitHub repository.</p>
          <a href="https://github.com/S-Suzuki17/Q-Chess" target="_blank" rel="noopener noreferrer" className="text-[#D4B872] hover:text-white transition-colors">
            github.com/S-Suzuki17/Q-Chess
          </a>
        </div>
      </div>
    </div>
  );
}
