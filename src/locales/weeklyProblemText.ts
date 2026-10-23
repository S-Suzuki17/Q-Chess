import type {Language} from './dict';

const rows:Record<Language,readonly [string,string]>={
 ja:['通常ルール5題＋Q-Gambit独自ルール5題。全10題クリアで対局チケット1枚。','Q-Gambitのルールです。駒の候補を読み、白から1手でチェックメイト。通常の移動では、動きに合う候補がすべて残ります。'],
 en:['Five ordinary chess problems and five Q-Gambit problems. Solve all ten to earn one match ticket.','Q-Gambit rules. Read the possible identities and mate in one as White. An ordinary move keeps every identity compatible with that move.'],
 zh:['5道普通国际象棋题＋5道Q-Gambit题。全部10题完成可获得1张对局券。','Q-Gambit规则。根据棋子候选身份，白方走一步将杀。普通移动保留所有符合该走法的候选身份。'],
 fr:['Cinq problèmes classiques et cinq problèmes Q-Gambit. Réussissez les dix pour gagner un ticket de partie.','Règles Q-Gambit. Étudiez les identités possibles et matez en un coup avec les Blancs. Un déplacement ordinaire conserve toutes les identités compatibles.'],
 de:['Fünf klassische Schachaufgaben und fünf Q-Gambit-Aufgaben. Löse alle zehn für ein Partieticket.','Q-Gambit-Regeln. Beachte die möglichen Identitäten und setze mit Weiß in einem Zug matt. Ein gewöhnlicher Zug erhält alle dazu passenden Identitäten.'],
 es:['Cinco problemas clásicos y cinco de Q-Gambit. Resuelve los diez para ganar un ticket de partida.','Reglas de Q-Gambit. Observa las identidades posibles y da mate en una con blancas. Un movimiento normal conserva todas las identidades compatibles.'],
 pt:['Cinco problemas clássicos e cinco de Q-Gambit. Resolva os dez para ganhar um bilhete de partida.','Regras de Q-Gambit. Observe as identidades possíveis e dê mate em um lance com as brancas. Um movimento comum mantém todas as identidades compatíveis.'],
 ru:['Пять обычных шахматных задач и пять задач Q-Gambit. Решите все десять и получите билет на партию.','Правила Q-Gambit. Учитывайте возможные фигуры и поставьте мат в один ход белыми. Обычный ход сохраняет все совместимые с ним типы фигуры.'],
 tr:['Beş klasik satranç ve beş Q-Gambit sorusu. Onunu da çözerek bir maç bileti kazan.','Q-Gambit kuralları. Olası kimliklere bakarak beyazla tek hamlede mat et. Normal hamle, hareketle uyumlu tüm kimlikleri korur.'],
 pl:['Pięć klasycznych zadań i pięć zadań Q-Gambit. Rozwiąż wszystkie dziesięć, aby zdobyć bilet na partię.','Zasady Q-Gambit. Uwzględnij możliwe tożsamości figur i daj mata białymi w jednym ruchu. Zwykły ruch zachowuje wszystkie zgodne z nim tożsamości.'],
 hi:['पाँच साधारण शतरंज और पाँच Q-Gambit समस्याएँ। सभी दस हल करने पर एक मैच टिकट मिलेगा।','Q-Gambit के नियम। संभावित पहचानों को देखकर सफेद की एक चाल में मात दें। साधारण चाल में उस चाल से मेल खाने वाली सभी पहचानें बची रहती हैं।'],
 ta:['ஐந்து வழக்கமான சதுரங்கப் புதிர்கள் மற்றும் ஐந்து Q-Gambit புதிர்கள். பத்தையும் தீர்த்தால் ஒரு ஆட்டச் சீட்டு கிடைக்கும்.','Q-Gambit விதிகள். சாத்தியமான அடையாளங்களைப் பார்த்து வெள்ளையின் ஒரே நகர்வில் செக்மேட் செய்யுங்கள். வழக்கமான நகர்வு அதற்குப் பொருந்தும் அனைத்து அடையாளங்களையும் தக்கவைக்கும்.'],
};
export function weeklyProblemText(lang:Language) {
 const [mixedDescription,quantumGoal]=rows[lang];
 return {mixedDescription,quantumGoal};
}
