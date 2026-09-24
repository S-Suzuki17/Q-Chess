import Link from 'next/link';

export default function Contact() {
    return (
        <main className="min-h-screen bg-[#11100E] text-[#E8E2D7] font-sans p-8 md:p-16 flex flex-col items-center">
            <div className="w-full max-w-2xl bg-[#1E1C19] border border-[#3B342C] p-8 rounded-lg">
                <Link href="/" className="text-[#D4B872] hover:underline mb-8 inline-block">← Back to Game</Link>
                <h1 className="text-3xl text-[#D4B872] font-serif mb-6 border-b border-[#3B342C] pb-4">Contact Us</h1>
                
                <div className="space-y-6 text-[#A89C86]">
                    <p>Have questions, feedback, or bug reports regarding Q-Gambit? We'd love to hear from you!</p>
                    <p>Please use the email address below to get in touch with the development team. We try to respond to all inquiries within 48 hours.</p>
                    
                    <div className="bg-black/50 p-6 rounded border border-[#3B342C] text-center my-8">
                        <h3 className="text-white mb-2 font-serif text-xl">Email Support</h3>
                        <a href="mailto:soutasuzuki1101@gmail.com" className="text-[#D4B872] text-lg hover:underline">soutasuzuki1101@gmail.com</a>
                    </div>

                    <h2 className="text-xl text-white font-serif mt-8 mb-4">Frequently Asked Questions</h2>
                    <dl className="space-y-4">
                        <div>
                            <dt className="text-[#D4B872] font-bold">How do I report a bug?</dt>
                            <dd className="mt-1">Please email us with a detailed description of the bug, your browser version, and ideally a screenshot or screen recording of the issue.</dd>
                        </div>
                        <div>
                            <dt className="text-[#D4B872] font-bold">Can I play with my friends?</dt>
                            <dd className="mt-1">Yes! You can create a private match in the main menu and share the room code with your friends.</dd>
                        </div>
                        <div>
                            <dt className="text-[#D4B872] font-bold">Are there mobile apps available?</dt>
                            <dd className="mt-1">Currently, Q-Gambit is a web-based game, but it is fully optimized for mobile browsers. Native iOS and Android apps are on our roadmap.</dd>
                        </div>
                    </dl>
                </div>
            </div>
        </main>
    );
}
