import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | Q-GAMBIT',
  description: 'Q-GAMBIT Privacy Policy',
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#050505] text-gray-300 font-mono p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-cyan-500 hover:text-cyan-400 text-sm mb-8 inline-block">&larr; Back to Q-GAMBIT</Link>

        <h1 className="text-3xl md:text-4xl font-bold text-cyan-400 mb-2">Privacy Policy</h1>
        <p className="text-gray-500 text-sm mb-8">Last updated: August 23, 2026</p>

        <div className="flex flex-col gap-8 text-sm leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-cyan-300 mb-2">1. Introduction</h2>
            <p>
              Q-GAMBIT (&quot;the Service&quot;) is an online quantum chess game. This Privacy Policy explains how we collect, use, and protect your information when you use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cyan-300 mb-2">2. Information We Collect</h2>
            <ul className="list-disc list-inside flex flex-col gap-2 ml-2">
              <li><strong className="text-gray-200">Account Information:</strong> When you create an account, we store your chosen display name and a generated user ID locally on your device (localStorage) and on our server (Supabase) for ranking purposes.</li>
              <li><strong className="text-gray-200">Game Data:</strong> We record game replays (move history, results) to provide replay functionality and leaderboard rankings.</li>
              <li><strong className="text-gray-200">Automatically Collected Information:</strong> We may collect standard web analytics data such as IP address, browser type, device type, and pages visited through third-party services (e.g., Vercel Analytics).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cyan-300 mb-2">3. Third-Party Services</h2>
            <p className="mb-2">The Service uses the following third-party services that may collect information:</p>
            <ul className="list-disc list-inside flex flex-col gap-2 ml-2">
              <li><strong className="text-gray-200">Google AdSense:</strong> We use Google AdSense to display advertisements. Google may use cookies and web beacons to serve ads based on your prior visits to this or other websites. You can opt out of personalized advertising by visiting <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:underline">Google Ads Settings</a>.</li>
              <li><strong className="text-gray-200">Supabase:</strong> We use Supabase as our backend database to store user profiles, game records, and rankings.</li>
              <li><strong className="text-gray-200">Vercel:</strong> The Service is hosted on Vercel, which may collect standard server logs.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cyan-300 mb-2">4. Cookies</h2>
            <p>
              The Service itself does not directly set cookies. However, third-party services such as Google AdSense may use cookies to personalize ads. You can manage cookie preferences through your browser settings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cyan-300 mb-2">5. Data Retention</h2>
            <p>
              Account data and game records are retained indefinitely to maintain leaderboard rankings and replay history. You may request deletion of your data by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cyan-300 mb-2">6. Children&apos;s Privacy</h2>
            <p>
              The Service is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe we have collected such information, please contact us so we can delete it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cyan-300 mb-2">7. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated revision date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cyan-300 mb-2">8. Contact</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us through our GitHub repository: <a href="https://github.com/S-Suzuki17/Q-Chess" target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:underline">github.com/S-Suzuki17/Q-Chess</a>
            </p>
          </section>

        </div>

        <div className="border-t border-gray-800 mt-12 pt-6 text-center text-gray-600 text-xs">
          &copy; 2026 Q-GAMBIT. All rights reserved.
        </div>
      </div>
    </div>
  );
}
