import type { Language } from './dict';

type Copy = Readonly<{
    title: string;
    rankedTickets: string;
    hintTickets: string;
    streakDays: string;
    lastClaimUtcDay: string;
    notClaimed: string;
    loading: string;
    unavailable: string;
}>;

const copy: Record<Language, Copy> = {
    en: { title: 'Daily rewards', rankedTickets: 'Ranked tickets', hintTickets: 'Hint tickets', streakDays: 'Login streak', lastClaimUtcDay: 'Last reward (UTC)', notClaimed: 'Not yet claimed', loading: 'Checking rewards…', unavailable: 'Rewards are unavailable right now.' },
    ja: { title: '毎日の特典', rankedTickets: 'ランク戦チケット', hintTickets: 'ヒントチケット', streakDays: '連続ログイン日数', lastClaimUtcDay: '前回の受取日（UTC）', notClaimed: 'まだ受け取っていません', loading: '特典を確認中…', unavailable: '現在、特典を確認できません。' },
    zh: { title: '每日奖励', rankedTickets: '排位赛券', hintTickets: '提示券', streakDays: '连续登录天数', lastClaimUtcDay: '上次领取日期（UTC）', notClaimed: '尚未领取', loading: '正在查询奖励…', unavailable: '暂时无法查看奖励。' },
    ru: { title: 'Ежедневные награды', rankedTickets: 'Билеты для рейтинговых игр', hintTickets: 'Билеты для подсказок', streakDays: 'Дней входа подряд', lastClaimUtcDay: 'Последняя награда (UTC)', notClaimed: 'Ещё не получена', loading: 'Проверяем награды…', unavailable: 'Награды сейчас недоступны.' },
    fr: { title: 'Récompenses quotidiennes', rankedTickets: 'Tickets de classement', hintTickets: 'Tickets d’indice', streakDays: 'Jours de connexion consécutifs', lastClaimUtcDay: 'Dernière récompense (UTC)', notClaimed: 'Pas encore obtenue', loading: 'Vérification des récompenses…', unavailable: 'Récompenses indisponibles pour le moment.' },
    de: { title: 'Tägliche Belohnungen', rankedTickets: 'Ranglisten-Tickets', hintTickets: 'Hinweis-Tickets', streakDays: 'Tage in Folge angemeldet', lastClaimUtcDay: 'Letzte Belohnung (UTC)', notClaimed: 'Noch nicht erhalten', loading: 'Belohnungen werden geprüft…', unavailable: 'Belohnungen sind derzeit nicht verfügbar.' },
    es: { title: 'Recompensas diarias', rankedTickets: 'Boletos de clasificatoria', hintTickets: 'Boletos de pistas', streakDays: 'Días seguidos de inicio de sesión', lastClaimUtcDay: 'Última recompensa (UTC)', notClaimed: 'Aún no reclamada', loading: 'Consultando recompensas…', unavailable: 'Las recompensas no están disponibles ahora.' },
    tr: { title: 'Günlük ödüller', rankedTickets: 'Dereceli maç biletleri', hintTickets: 'İpucu biletleri', streakDays: 'Ardışık giriş günü', lastClaimUtcDay: 'Son ödül (UTC)', notClaimed: 'Henüz alınmadı', loading: 'Ödüller kontrol ediliyor…', unavailable: 'Ödüller şu anda kullanılamıyor.' },
    pl: { title: 'Nagrody dzienne', rankedTickets: 'Bilety rankingowe', hintTickets: 'Bilety na podpowiedzi', streakDays: 'Dni logowania z rzędu', lastClaimUtcDay: 'Ostatnia nagroda (UTC)', notClaimed: 'Jeszcze nie odebrano', loading: 'Sprawdzanie nagród…', unavailable: 'Nagrody są teraz niedostępne.' },
    hi: { title: 'दैनिक इनाम', rankedTickets: 'रैंक्ड मैच टिकट', hintTickets: 'संकेत टिकट', streakDays: 'लगातार लॉगिन के दिन', lastClaimUtcDay: 'पिछला इनाम (UTC)', notClaimed: 'अभी तक नहीं मिला', loading: 'इनाम जाँचे जा रहे हैं…', unavailable: 'अभी इनाम उपलब्ध नहीं हैं।' },
    pt: { title: 'Recompensas diárias', rankedTickets: 'Bilhetes de partidas ranqueadas', hintTickets: 'Bilhetes de dicas', streakDays: 'Dias seguidos de login', lastClaimUtcDay: 'Última recompensa (UTC)', notClaimed: 'Ainda não recebida', loading: 'Verificando recompensas…', unavailable: 'As recompensas não estão disponíveis agora.' },
    ta: { title: 'தினசரி வெகுமதிகள்', rankedTickets: 'தரவரிசைப் போட்டிச் சீட்டுகள்', hintTickets: 'குறிப்புச் சீட்டுகள்', streakDays: 'தொடர் உள்நுழைவு நாட்கள்', lastClaimUtcDay: 'கடைசி வெகுமதி (UTC)', notClaimed: 'இன்னும் பெறவில்லை', loading: 'வெகுமதிகள் சரிபார்க்கப்படுகின்றன…', unavailable: 'வெகுமதிகள் இப்போது கிடைக்கவில்லை.' },
};

export const dailyLoginText = (lang: Language): Copy => copy[lang];
