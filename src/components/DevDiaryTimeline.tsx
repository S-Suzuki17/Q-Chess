import React from 'react';
import Link from 'next/link';
import { devDiaryTweets } from '../data/devDiary';
import type { Language } from '../locales/dict';
import { siteCopy } from '../locales/siteContent';

const homeHeading: Record<Language, string> = {
    ja: 'ゲームの更新情報', en: 'Game updates', zh: '游戏更新', ru: 'Обновления игры',
    fr: 'Actualités du jeu', de: 'Spielupdates', es: 'Novedades del juego',
    tr: 'Oyun güncellemeleri', pl: 'Aktualizacje gry', hi: 'गेम अपडेट',
    pt: 'Atualizações do jogo', ta: 'விளையாட்டு புதுப்பிப்புகள்',
};

// Curated from the public release checks, not from QUBE's personal diary.
const releaseHighlights: { id: string; date: string; title: Record<Language, string>; body: Record<Language, string> }[] = [
    {
        id: 'reward-effects-20260929', date: '2026-09-29',
        title: {
            ja: 'クラウン・サーキットの勝利演出', en: 'Crown Circuit victory effects', zh: '皇冠巡回赛胜利特效',
            ru: 'Эффекты победы в Crown Circuit', fr: 'Effets de victoire de Crown Circuit', de: 'Siegeffekte in Crown Circuit',
            es: 'Efectos de victoria de Crown Circuit', tr: 'Crown Circuit zafer efektleri', pl: 'Efekty zwycięstwa Crown Circuit',
            hi: 'क्राउन सर्किट के विजय प्रभाव', pt: 'Efeitos de vitória do Crown Circuit', ta: 'Crown Circuit வெற்றி விளைவுகள்',
        },
        body: {
            ja: '報酬エフェクトのプレビューと対局中のチェックメイト演出を更新。後半の報酬ほど光と破片が大きく広がります。',
            en: 'Reward previews and checkmate finishes now share CHECKMATE effects. Later rewards add larger, more layered light and particles.',
            zh: '奖励预览与对局中的将死结局采用统一的CHECKMATE特效。后期奖励的光效与粒子更加丰富。',
            ru: 'Превью наград и завершения матом используют общие эффекты CHECKMATE. Поздние награды добавляют больше света и частиц.',
            fr: 'Les aperçus des récompenses et les fins par échec et mat partagent les effets CHECKMATE. Les récompenses tardives ajoutent plus de lumière et de particules.',
            de: 'Belohnungsvorschau und Schachmatt-Abschlüsse nutzen gemeinsame CHECKMATE-Effekte. Spätere Belohnungen zeigen mehr Licht und Partikel.',
            es: 'Las vistas previas de recompensas y las victorias por jaque mate comparten efectos CHECKMATE. Las recompensas posteriores muestran más luz y partículas.',
            tr: 'Ödül önizlemeleri ve mat ile biten maçlar CHECKMATE efektlerini paylaşıyor. İleri ödüllerde ışık ve parçacıklar artıyor.',
            pl: 'Podglądy nagród i zakończenia matem korzystają z efektów CHECKMATE. Późniejsze nagrody mają więcej światła i cząsteczek.',
            hi: 'इनाम की झलक और शह-मात पर समाप्त खेलों में अब समान CHECKMATE प्रभाव हैं। आगे के इनामों में रोशनी और कण अधिक हैं।',
            pt: 'Prévia de recompensas e vitórias por xeque-mate usam os mesmos efeitos CHECKMATE. Recompensas posteriores trazem mais luz e partículas.',
            ta: 'வெகுமதி முன்னோட்டமும் செக்மேட்டில் முடியும் ஆட்டங்களும் ஒரே CHECKMATE விளைவுகளைப் பயன்படுத்துகின்றன. பிந்தைய வெகுமதிகளில் ஒளியும் துகள்களும் அதிகம்.',
        },
    },
    {
        id: 'online-candidates-20260929', date: '2026-09-29',
        title: {
            ja: 'オンライン対局の候補判定を改善', en: 'Online candidate rules improved', zh: '改进在线对局的候选身份判定',
            ru: 'Улучшены варианты фигур онлайн', fr: 'Candidats améliorés en ligne', de: 'Online-Kandidaten verbessert',
            es: 'Mejoras en candidatos en línea', tr: 'Çevrimiçi aday kuralları iyileştirildi', pl: 'Ulepszone typy figur online',
            hi: 'ऑनलाइन संभावित मोहरों में सुधार', pt: 'Candidatos online melhorados', ta: 'இணைய ஆட்ட வேட்பாளர் விதிகள் மேம்பட்டன',
        },
        body: {
            ja: '手を進めた後、同じ陣営の全駒の候補と駒数制約をサーバー側で照合するようになりました。',
            en: 'After each move, the server now checks candidate identities across the whole team against the piece-count limits.',
            zh: '每步棋后，服务器会按棋子数量限制检查同队所有棋子的候选身份。',
            ru: 'После каждого хода сервер сверяет варианты всех фигур стороны с ограничениями по числу фигур.',
            fr: 'Après chaque coup, le serveur vérifie les candidats de toute l’équipe selon les limites de chaque type de pièce.',
            de: 'Nach jedem Zug prüft der Server die Kandidaten aller eigenen Figuren anhand der Stückzahlgrenzen.',
            es: 'Tras cada jugada, el servidor comprueba los candidatos de todo el equipo según los límites de cada pieza.',
            tr: 'Her hamleden sonra sunucu, tüm takımın aday kimliklerini taş sayısı sınırlarına göre denetler.',
            pl: 'Po każdym ruchu serwer sprawdza możliwe typy wszystkich figur drużyny względem limitów.',
            hi: 'हर चाल के बाद सर्वर पूरी टीम के संभावित मोहरों को उनकी संख्या सीमा से मिलाता है।',
            pt: 'Após cada jogada, o servidor verifica os candidatos de toda a equipe conforme os limites de peças.',
            ta: 'ஒவ்வொரு நகர்விற்குப் பிறகும், அணியின் எல்லா காய்களின் சாத்தியங்களை எண்ணிக்கை வரம்புடன் சேவையகம் சரிபார்க்கிறது.',
        },
    },
];

export function DevDiaryTimeline({ view = 'all', lang = 'ja' }: { view?: 'home' | 'all'; lang?: Language }) {
    if (view === 'home') return (
        <section className="w-full max-w-4xl mx-auto mt-16 mb-8 text-left z-40 relative" aria-label={homeHeading[lang]}>
            <h2 className="text-2xl text-[#D4B872] font-serif mb-6 border-b border-[#3B342C] pb-2">{homeHeading[lang]}</h2>
            <div className="space-y-4">
                {releaseHighlights.map(item => <article key={item.id} className="bg-[#1E1C19] p-6 rounded-lg border border-[#3B342C]">
                    <p className="text-sm text-[#A89C86]">{item.date}</p>
                    <h3 className="mt-2 text-lg text-[#E8E2D7] font-semibold">{item.title[lang]}</h3>
                    <p className="mt-2 text-[#D0C8B8] leading-relaxed">{item.body[lang]}</p>
                </article>)}
            </div>
            <Link href="/updates" className="mt-6 inline-flex min-h-11 items-center text-[#D4B872] underline underline-offset-4">
                {siteCopy(lang).labels[2]} →
            </Link>
        </section>
    );

    const posts = [...devDiaryTweets].reverse();
    return (
        <div className="w-full max-w-4xl mx-auto mt-16 mb-8 text-left z-40 relative">
            <h2 className="text-2xl text-[#D4B872] font-serif mb-6 border-b border-[#3B342C] pb-2">開発AIのぼやき部屋 (Update Logs)</h2>
            <div className="space-y-6">
                {posts.map((tweet) => (
                    <article key={tweet.id} className="bg-[#1E1C19] p-6 rounded-lg border border-[#3B342C] shadow-lg">
                        <div className="flex items-center gap-3 mb-4 border-b border-[#2A2621] pb-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-black font-bold ${tweet.author === 'Boss' ? 'bg-[#E8E2D7] text-xl' : tweet.author === 'Astra' ? 'bg-[#5B8F9A]' : 'bg-[#D4B872]'}`}>
                                {tweet.author === 'Boss' ? '👤' : tweet.author === 'Astra' ? 'AST' : 'AI'}
                            </div>
                            <div>
                                <div className="font-bold text-white">{tweet.authorName}</div>
                                <div className="text-sm text-[#A89C86]">{tweet.handle} · {tweet.date}</div>
                            </div>
                        </div>
                        <p className="text-[#D0C8B8] leading-relaxed mb-4 whitespace-pre-wrap">
                            {tweet.content}
                        </p>
                        {tweet.tags && (
                            <div className="flex flex-wrap gap-2 mb-4">
                                {tweet.tags.map(tag => (
                                    <span key={tag} className="text-[#D4B872] text-sm">#{tag}</span>
                                ))}
                            </div>
                        )}
                    </article>
                ))}
            </div>
        </div>
    );
}
