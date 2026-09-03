'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function PrivacyPolicy() {
  const [lang, setLang] = useState<'en' | 'ja'>('en');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('qg_language');
      if (savedLang === 'ja') setLang('ja');
    }
  }, []);

  const content = {
    en: {
      back: "\u2190 Back to Q-GAMBIT",
      title: "Privacy Policy",
      updated: "Last updated: August 23, 2026",
      sec1Title: "1. Introduction",
      sec1p: "Q-GAMBIT (\"the Service\") is an online quantum chess game. This Privacy Policy explains how we collect, use, and protect your information when you use the Service.",
      sec2Title: "2. Information We Collect",
      sec2li1: "Account Information: When you create an account, we store your chosen display name and a generated user ID locally on your device (localStorage) and on our server (Supabase) for ranking purposes.",
      sec2li2: "Game Data: We record game replays (move history, results) to provide replay functionality and leaderboard rankings.",
      sec2li3: "Automatically Collected Information: We may collect standard web analytics data such as IP address, browser type, device type, and pages visited through third-party services (e.g., Vercel Analytics).",
      sec3Title: "3. Third-Party Services",
      sec3p: "The Service uses the following third-party services that may collect information:",
      sec3li1: "Google AdSense: We use Google AdSense to display advertisements. Google may use cookies and web beacons to serve ads based on your prior visits to this or other websites. You can opt out of personalized advertising by visiting Google Ads Settings.",
      sec3li2: "Supabase: We use Supabase as our backend database to store user profiles, game records, and rankings.",
      sec3li3: "Vercel: The Service is hosted on Vercel, which may collect standard server logs.",
      sec4Title: "4. Cookies",
      sec4p: "The Service itself does not directly set cookies. However, third-party services such as Google AdSense may use cookies to personalize ads. You can manage cookie preferences through your browser settings.",
      sec5Title: "5. Data Retention",
      sec5p: "Account data and game records are retained indefinitely to maintain leaderboard rankings and replay history. You may request deletion of your data by contacting us.",
      sec6Title: "6. Children's Privacy",
      sec6p: "The Service is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe we have collected such information, please contact us so we can delete it.",
      sec7Title: "7. Changes to This Policy",
      sec7p: "We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated revision date.",
      sec8Title: "8. Contact",
      sec8p: "If you have any questions about this Privacy Policy, please contact us through our GitHub repository: "
    },
    ja: {
      back: "\u2190 Q-GAMBIT に戻る",
      title: "プライバシーポリシー",
      updated: "最終更新日: 2026年8月23日",
      sec1Title: "1. はじめに",
      sec1p: "Q-GAMBIT（以下「本サービス」）はオンライン量子チェスゲームです。本プライバシーポリシーでは、お客様が本サービスを利用する際の情報の収集、利用、および保護について説明します。",
      sec2Title: "2. 収集する情報",
      sec2li1: "アカウント情報: アカウント作成時、表示名と生成されたユーザーIDをデバイス（localStorage）およびサーバー（Supabase）にランキング目的で保存します。",
      sec2li2: "ゲームデータ: リプレイ機能やリーダーボードを提供するため、ゲームのリプレイ（移動履歴、勝敗）を記録します。",
      sec2li3: "自動的に収集される情報: Vercel Analytics等のサードパーティサービスを通じて、IPアドレス、ブラウザの種類、デバイスの種類、訪問ページなどの標準的なウェブ解析データを収集する場合があります。",
      sec3Title: "3. サードパーティサービス",
      sec3p: "本サービスは、情報を収集する可能性のある以下のサードパーティサービスを使用しています：",
      sec3li1: "Google AdSense: 広告を表示するためにGoogle AdSenseを使用しています。GoogleはCookieやウェブビーコンを使用し、過去のアクセス情報に基づいてパーソナライズ広告を配信することがあります。Googleの広告設定でパーソナライズ広告を無効にすることができます。",
      sec3li2: "Supabase: ユーザープロフィール、ゲーム記録、ランキングを保存するためのバックエンドデータベースとして使用しています。",
      sec3li3: "Vercel: 本サービスはVercel上でホストされており、標準的なサーバーログを収集する場合があります。",
      sec4Title: "4. Cookie（クッキー）",
      sec4p: "本サービス自体が直接Cookieを設定することはありませんが、Google AdSense等のサードパーティサービスが広告のパーソナライズのためにCookieを使用する場合があります。Cookieの設定はブラウザから管理できます。",
      sec5Title: "5. データの保持",
      sec5p: "アカウントデータおよびゲーム記録は、リーダーボードのランキングやリプレイ履歴を維持するため無期限に保持されます。データの削除を希望される場合は、お問い合わせください。",
      sec6Title: "6. お子様のプライバシー",
      sec6p: "本サービスは13歳未満のお子様を対象としていません。13歳未満のお子様から意図的に個人情報を収集することはありません。情報が収集されたと思われる場合は、削除のためにご連絡ください。",
      sec7Title: "7. ポリシーの変更",
      sec7p: "本プライバシーポリシーは随時更新される場合があります。変更内容は、更新日とともにこのページに掲載されます。",
      sec8Title: "8. お問い合わせ",
      sec8p: "本プライバシーポリシーに関するご質問は、公式GitHubリポジトリまでお問い合わせください: "
    }
  };

  const c = content[lang];

  return (
    <div className="h-[100dvh] w-full bg-[#050505] text-gray-300 font-mono p-6 md:p-12 overflow-y-auto">
      <div className="max-w-3xl mx-auto pb-16">
        <Link href="/" className="text-[#D4B872] hover:text-white transition-colors tracking-widest font-bold text-sm mb-8 inline-block">{c.back}</Link>

        <h1 className="text-3xl md:text-4xl font-bold text-[#D4B872] tracking-wider mb-2">{c.title}</h1>
        <p className="text-gray-500 text-sm mb-8">{c.updated}</p>

        <div className="flex flex-col gap-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-white border-b border-[#3A3224] pb-1 mb-2">{c.sec1Title}</h2>
            <p>{c.sec1p}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white border-b border-[#3A3224] pb-1 mb-2">{c.sec2Title}</h2>
            <ul className="list-disc list-inside flex flex-col gap-2 ml-2">
              <li><strong className="text-gray-200">{c.sec2li1.split(': ')[0]}:</strong> {c.sec2li1.split(': ')[1]}</li>
              <li><strong className="text-gray-200">{c.sec2li2.split(': ')[0]}:</strong> {c.sec2li2.split(': ')[1]}</li>
              <li><strong className="text-gray-200">{c.sec2li3.split(': ')[0]}:</strong> {c.sec2li3.split(': ')[1]}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white border-b border-[#3A3224] pb-1 mb-2">{c.sec3Title}</h2>
            <p className="mb-2">{c.sec3p}</p>
            <ul className="list-disc list-inside flex flex-col gap-2 ml-2">
              <li><strong className="text-gray-200">{c.sec3li1.split(': ')[0]}:</strong> {c.sec3li1.split(': ')[1]}</li>
              <li><strong className="text-gray-200">{c.sec3li2.split(': ')[0]}:</strong> {c.sec3li2.split(': ')[1]}</li>
              <li><strong className="text-gray-200">{c.sec3li3.split(': ')[0]}:</strong> {c.sec3li3.split(': ')[1]}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white border-b border-[#3A3224] pb-1 mb-2">{c.sec4Title}</h2>
            <p>{c.sec4p}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white border-b border-[#3A3224] pb-1 mb-2">{c.sec5Title}</h2>
            <p>{c.sec5p}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white border-b border-[#3A3224] pb-1 mb-2">{c.sec6Title}</h2>
            <p>{c.sec6p}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white border-b border-[#3A3224] pb-1 mb-2">{c.sec7Title}</h2>
            <p>{c.sec7p}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white border-b border-[#3A3224] pb-1 mb-2">{c.sec8Title}</h2>
            <p>
              {c.sec8p} <a href="https://github.com/S-Suzuki17/Q-Chess" target="_blank" rel="noopener noreferrer" className="text-[#D4B872] hover:text-white transition-colors">github.com/S-Suzuki17/Q-Chess</a>
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
