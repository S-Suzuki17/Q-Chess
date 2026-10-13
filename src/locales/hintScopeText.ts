import type { Language } from './dict';

const scope: Record<Language, string> = {
    ja:'練習・チュートリアルのQUBEヒントは無料で、ヒント券を使いません。それ以外のオンライン・ランク戦・プライベート対局・100マスチャレンジでは、ヒント1回につきヒント券1枚を明示的に使用します。CPUが代役でも元の対局モードに従います。',
    en:'QUBE hints are free in practice and tutorials, without hint tickets. In online, ranked, private and 100-Tile Challenge games, each hint explicitly uses 1 hint ticket. A CPU replacement follows the original match mode.',
    zh:'练习和教程中的QUBE提示免费，不使用提示券。在线、排位、私人对局及100格挑战中，每次提示须明确使用1张提示券。CPU代替对手时仍按原对局模式处理。',
    ru:'Подсказки QUBE в тренировках и обучении бесплатны и не используют билеты. В онлайн-, рейтинговых, приватных партиях и Испытание из 100 клеток каждая подсказка явно использует 1 билет. Замена соперника CPU сохраняет исходный режим партии.',
    fr:'Les indices QUBE sont gratuits en entraînement et dans les tutoriels, sans ticket. En ligne, en mode classé, en partie privée et dans Défi des 100 cases, chaque indice utilise explicitement 1 ticket. Un adversaire remplacé par le CPU conserve le mode initial.',
    de:'QUBE-Hinweise sind im Training und in Tutorials kostenlos und benötigen keine Tickets. In Online-, Ranglisten-, privaten und 100-Felder-Herausforderung-Partien wird pro Hinweis ausdrücklich 1 Ticket verwendet. Ein CPU-Ersatz behält den ursprünglichen Spielmodus.',
    es:'Las pistas de QUBE son gratis en práctica y tutoriales, sin boletos. En partidas en línea, clasificadas, privadas y Desafío de 100 casillas, cada pista usa explícitamente 1 boleto. Un rival reemplazado por CPU conserva el modo original.',
    tr:'Alıştırma ve eğitimlerde QUBE ipuçları ücretsizdir, bilet kullanılmaz. Çevrimiçi, dereceli, özel ve 100 Kare Mücadelesi oyunlarında her ipucu açıkça 1 bilet kullanır. CPU yedek rakip olsa da özgün oyun modu geçerlidir.',
    pl:'Podpowiedzi QUBE w treningu i samouczkach są bezpłatne, bez biletów. W partiach online, rankingowych, prywatnych i Wyzwanie 100 pól każda podpowiedź jawnie zużywa 1 bilet. Zastępstwo przeciwnika przez CPU zachowuje pierwotny tryb gry.',
    hi:'अभ्यास और ट्यूटोरियल में QUBE के संकेत मुफ़्त हैं और टिकट इस्तेमाल नहीं होते। ऑनलाइन, रैंक्ड, निजी और 100 खाने की चुनौती खेलों में हर संकेत के लिए स्पष्ट रूप से 1 संकेत टिकट इस्तेमाल होता है। CPU के विरोधी की जगह लेने पर भी मूल खेल मोड लागू रहता है।',
    pt:'As dicas do QUBE são grátis na prática e nos tutoriais, sem bilhetes. Em partidas online, ranqueadas, privadas e Desafio de 100 casas, cada dica usa explicitamente 1 bilhete. Um adversário substituído por CPU mantém o modo original.',
    ta:'பயிற்சி மற்றும் கற்றல் வழிகாட்டிகளில் QUBE குறிப்புகள் இலவசம்; சீட்டுகள் பயன்படுத்தப்படாது. இணைய, தரவரிசை, தனிப்பட்ட மற்றும் 100 கட்டச் சவால் ஆட்டங்களில் ஒவ்வொரு குறிப்புக்கும் வெளிப்படையாக 1 குறிப்புச் சீட்டு பயன்படுத்தப்படும். CPU மாற்று எதிராளியாக இருந்தாலும் அசல் ஆட்ட முறை பொருந்தும்.',
};
export const hintScopeText = (lang: Language): string => scope[lang];
