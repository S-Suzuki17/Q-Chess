import Link from 'next/link';

export default function About() {
    return (
        <main className="min-h-screen bg-[#11100E] text-[#E8E2D7] font-sans p-8 md:p-16 flex flex-col items-center">
            <div className="w-full max-w-3xl bg-[#1E1C19] border border-[#3B342C] p-8 rounded-lg">
                <Link href="/" className="text-[#D4B872] hover:underline mb-8 inline-block">← Back to Game</Link>
                <h1 className="text-3xl text-[#D4B872] font-serif mb-6 border-b border-[#3B342C] pb-4">About the Developer</h1>
                
                <div className="space-y-6 text-[#A89C86] leading-relaxed">
                    <p>Welcome to Q-Gambit! I'm S-Suzuki17, the solo indie developer and creator behind this quantum chess experience.</p>
                    
                    <h2 className="text-xl text-white font-serif mt-8 mb-4">My Background</h2>
                    <p>As a passionate chess player and a software engineer with an interest in quantum computing, I've always been fascinated by how abstract scientific concepts could be translated into interactive experiences. Traditional chess is a game of perfect information, but the real world—especially at the quantum level—is governed by probabilities and uncertainty.</p>
                    <p>I started developing Q-Gambit in early 2026 as a passion project to see if I could merge these two worlds. What started as a simple command-line prototype quickly evolved into the full-fledged web application you see today.</p>

                    <h2 className="text-xl text-white font-serif mt-8 mb-4">The Vision for Q-Gambit</h2>
                    <p>My goal with Q-Gambit is to make the mind-bending principles of quantum mechanics accessible and fun through the familiar lens of chess. By introducing mechanics like superposition and entanglement, the game challenges players to think outside the traditional 64 squares and anticipate multiple possible realities simultaneously.</p>
                    <p>I'm committed to continuously updating the game, improving the AI, and expanding the single-player campaign based on community feedback.</p>

                    <h2 className="text-xl text-white font-serif mt-8 mb-4">Site Overview</h2>
                    <p><strong>Site Name:</strong> Q-GAMBIT - Quantum Superposition Chess</p>
                    <p><strong>Purpose:</strong> To provide a free, high-quality, online multiplayer platform for playing quantum chess variants, along with educational content explaining the underlying mechanics.</p>
                    <p><strong>Admin:</strong> S-Suzuki17</p>
                    <p><strong>Contact:</strong> soutasuzuki1101@gmail.com</p>

                    <div className="mt-12 pt-8 border-t border-[#3B342C] flex justify-center space-x-6">
                        <a href="https://github.com/S-Suzuki17" target="_blank" rel="noopener noreferrer" className="text-[#D4B872] hover:text-white transition-colors">GitHub Profile</a>
                        <Link href="/contact" className="text-[#D4B872] hover:text-white transition-colors">Contact Form</Link>
                    </div>
                </div>
            </div>
        </main>
    );
}
