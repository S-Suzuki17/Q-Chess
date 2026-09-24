import Link from 'next/link';
import AdBanner from '../../components/AdBanner';

export default function Updates() {
    return (
        <main className="min-h-screen bg-[#11100E] text-[#E8E2D7] font-sans p-8 md:p-16 flex flex-col items-center">
            <div className="w-full max-w-4xl bg-[#1E1C19] border border-[#3B342C] p-8 rounded-lg">
                <Link href="/" className="text-[#D4B872] hover:underline mb-8 inline-block">← Back to Game</Link>
                <h1 className="text-3xl text-[#D4B872] font-serif mb-8 border-b border-[#3B342C] pb-4">Development Diary & Update Logs</h1>
                
                {/* Article 1 */}
                <article className="mb-12">
                    <h2 className="text-2xl font-serif mb-2 text-white">v1.2.0: Enhancing the Quantum AI Engine</h2>
                    <p className="text-sm text-[#A89C86] mb-4">Published on September 24, 2026 by S-Suzuki17</p>
                    <div className="space-y-4 text-base leading-relaxed text-[#D0C8B8]">
                        <p>Welcome back to another development update for Q-Gambit! Over the past few weeks, our primary focus has been on refining the Quantum AI engine that powers the single-player experience. Developing an AI for a game where pieces exist in multiple states simultaneously—superposition—is an incredibly complex challenge compared to traditional chess algorithms.</p>
                        <p>In traditional chess, engines like Stockfish evaluate the board state by calculating millions of possible future moves. However, in Q-Gambit, the branching factor is exponentially higher. A single move might not just change the position of a piece, but also trigger a wave function collapse that alters the state of multiple other pieces on the board.</p>
                        <p>To address this, we've implemented a new probabilistic search heuristic. Instead of attempting to calculate every possible collapsed state (which would require near-infinite processing power), the AI now uses a Monte Carlo Tree Search (MCTS) variant tailored specifically for quantum states. It simulates hundreds of possible wave function collapses and evaluates the expected value of the resulting boards.</p>
                        <div className="my-8 flex flex-col items-center justify-center">
                            <span className="text-[10px] tracking-widest text-[#8C7A5E] mb-2 uppercase">Advertisement</span>
                            <AdBanner adClient="ca-pub-1116866075179199" adSlot="8798363654" adFormat="horizontal" />
                        </div>
                        <p>Additionally, we've optimized the "Ranked AI" fallback system. When players are waiting in the global matchmaking queue and a human opponent cannot be found within the time limit, the server seamlessly transitions the match to an AI opponent that matches the player's Elo rating. This ensures that you never have to wait too long to play, while still providing a challenging and fair match.</p>
                        <p>We've also added a suite of new visual effects to make the moment of collapse more intuitive and exciting. When an attack occurs, you'll now see a distinct visual "measurement" effect, helping new players understand exactly when and why their quantum pieces resolve into a single state.</p>
                        <p>Thank you to all our beta testers who provided invaluable feedback on the AI difficulty levels. Your input has directly shaped this update, making the lower difficulty levels more forgiving while pushing the maximum difficulty to true Grandmaster levels.</p>
                    </div>
                </article>

                {/* Article 2 */}
                <article className="mb-12 border-t border-[#3B342C] pt-12">
                    <h2 className="text-2xl font-serif mb-2 text-white">v1.1.0: Introducing the Circuit Campaign</h2>
                    <p className="text-sm text-[#A89C86] mb-4">Published on September 15, 2026 by S-Suzuki17</p>
                    <div className="space-y-4 text-base leading-relaxed text-[#D0C8B8]">
                        <p>Today marks the release of one of our most anticipated features: The Circuit Campaign Mode. While Q-Gambit was originally conceived as a purely competitive multiplayer game, we realized that the mechanics of quantum chess offer incredible potential for puzzle-solving and single-player narratives.</p>
                        <p>The Circuit Campaign takes players on a journey through 15 distinct levels, each designed to teach a specific aspect of quantum strategy. Early levels focus on the basics: how superposition works, how to measure your opponent's pieces safely, and the concept of entanglement. As you progress, the scenarios become increasingly complex, requiring you to chain together multiple probability collapses to achieve checkmate.</p>
                        <div className="my-8 flex flex-col items-center justify-center">
                            <span className="text-[10px] tracking-widest text-[#8C7A5E] mb-2 uppercase">Advertisement</span>
                            <AdBanner adClient="ca-pub-1116866075179199" adSlot="8798363654" adFormat="horizontal" />
                        </div>
                        <p>Completing these levels doesn't just improve your skills; it also rewards you with exclusive cosmetics. We've introduced a new system of Profile Avatars and Match Banners that can only be unlocked by proving your mastery in the Circuit. From the beginner's "Spark" avatar to the ultimate "Quantum Core" badge, these cosmetics allow you to show off your achievements in online matches.</p>
                        <p>Behind the scenes, building the campaign required a complete overhaul of our state initialization logic. We needed the ability to load pre-configured board states, complete with specific probability distributions, rather than just the standard starting chess position. This underlying tech will also pave the way for a future "Puzzle Editor" where players can create and share their own quantum chess challenges.</p>
                        <p>We hope you enjoy the Circuit Campaign as much as we enjoyed building it. As always, let us know your thoughts on our community forums!</p>
                    </div>
                </article>

                {/* Article 3 */}
                <article className="mb-12 border-t border-[#3B342C] pt-12">
                    <h2 className="text-2xl font-serif mb-2 text-white">v1.0.0: The Launch of Q-Gambit</h2>
                    <p className="text-sm text-[#A89C86] mb-4">Published on September 1, 2026 by S-Suzuki17</p>
                    <div className="space-y-4 text-base leading-relaxed text-[#D0C8B8]">
                        <p>It's finally here! After months of development, testing, and countless cups of coffee, Q-Gambit v1.0.0 is officially live. This marks a major milestone for our small development team and the beginning of a new era for strategy game enthusiasts.</p>
                        <p>Q-Gambit was born from a simple question: What if chess pieces didn't have to choose a single square? What if, like subatomic particles, they could exist in a state of probability until they were forced to resolve? The result is a game that retains the logical elegance of traditional chess but injects it with the mind-bending uncertainty of quantum physics.</p>
                        <div className="my-8 flex flex-col items-center justify-center">
                            <span className="text-[10px] tracking-widest text-[#8C7A5E] mb-2 uppercase">Advertisement</span>
                            <AdBanner adClient="ca-pub-1116866075179199" adSlot="8798363654" adFormat="auto" />
                        </div>
                        <p>Our initial launch includes the core online multiplayer experience, complete with a robust matchmaking system and an Elo-based ranking ladder. We've also included a local practice mode where you can test your strategies against our preliminary AI engine. The rules engine handles all the complex probability math, ensuring that every wave function collapse is mathematically sound and fair.</p>
                        <p>The journey to v1.0.0 hasn't been easy. Dealing with edge cases—like what happens when a piece is entangled with another piece that is itself in superposition—required us to rewrite our movement resolution logic three separate times. But seeing the community discover completely new tactical maneuvers (like the "Schrödinger's Fork") has made all the hard work worthwhile.</p>
                        <p>This is just the beginning. We have a long roadmap ahead, including new game modes, improved AI, and cross-platform mobile support. Thank you for joining us on this quantum leap forward for chess.</p>
                    </div>
                </article>
            </div>
        </main>
    );
}
