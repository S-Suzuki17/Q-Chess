import type {Language} from './dict';
import type {EffectMotif} from '../config/championshipRewards';
const text:Record<Language,readonly [string,string,string,string,string,string]>={
 en:['Event horizon','Prism ascension','Astral cascade','Sovereign forge','Replay effect','Victory collection'],
 ja:['事象の地平','プリズムの覚醒','星辰の奔流','王冠の鍛造','もう一度再生','勝利のコレクション'],
 zh:['事件视界','棱晶觉醒','星辰瀑流','王冠铸造','重新播放','胜利收藏'],
 ru:['Горизонт событий','Пробуждение призмы','Звёздный каскад','Королевская кузня','Повторить эффект','Коллекция побед'],
 fr:['Horizon des événements','Éveil du prisme','Cascade astrale','Forge souveraine','Rejouer l’effet','Collection de victoires'],
 de:['Ereignishorizont','Prismenerwachen','Astralkaskade','Königliche Schmiede','Effekt wiederholen','Siegessammlung'],
 es:['Horizonte de sucesos','Despertar del prisma','Cascada astral','Forja soberana','Repetir efecto','Colección de victorias'],
 tr:['Olay ufku','Prizmanın uyanışı','Yıldız çağlayanı','Hükümdarın ocağı','Efekti yeniden oynat','Zafer koleksiyonu'],
 pl:['Horyzont zdarzeń','Przebudzenie pryzmatu','Astralna kaskada','Królewska kuźnia','Odtwórz ponownie','Kolekcja zwycięstw'],
 hi:['घटना क्षितिज','प्रिज़्म का जागरण','तारकीय झरना','राजसी भट्ठी','प्रभाव फिर चलाएँ','विजय संग्रह'],
 pt:['Horizonte de eventos','Despertar do prisma','Cascata astral','Forja soberana','Repetir efeito','Coleção de vitórias'],
 ta:['நிகழ்வு எல்லை','பட்டக எழுச்சி','விண்மீன் அருவி','அரச மகுட உலை','மீண்டும் இயக்கு','வெற்றிச் சேகரிப்பு'],
};
export const victoryText=(lang:Language,key:EffectMotif|'replay'|'collection')=>text[lang][(['rings','shards','starfall','corona','replay','collection'] as const).indexOf(key)];
