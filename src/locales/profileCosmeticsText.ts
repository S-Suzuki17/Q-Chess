import type { Language } from './dict';
import type { BadgeId } from '../config/profileBadges';

const keys=['title','current','preview','reset','rule','unranked','unavailable','threshold','gallery','motion','fallback'] as const;
type Copy = readonly [string,string,string,string,string,string,string,string,string,string,string];
const copy: Record<Language, Copy> = {
    en:['Rank insignia','Current rank','Preview only','Show my rank','Rank follows the current rating of the selected time control. Previewing does not equip a badge.','Not yet ranked','Rating unavailable','Required rating','Inspect all six insignias','Animate on hover or focus','Static display'],
    ja:['階級バッジ','現在の階級','プレビューのみ','自分の階級に戻す','選択した持ち時間の現在レートで階級が決まります。プレビューでは装備は変わりません。','未昇級','レート未取得','必要レート','6種類のバッジを鑑賞','ホバー・フォーカス中に動かす','静止表示'],
    zh:['段位徽章','当前段位','仅预览','显示我的段位','段位根据所选时限的当前等级分确定。预览不会装备徽章。','尚未晋级','等级分不可用','所需等级分','查看六种徽章','悬停或聚焦时播放动画','静态显示'],
    ru:['Знак ранга','Текущий ранг','Только просмотр','Мой ранг','Ранг зависит от текущего рейтинга выбранного контроля времени. Просмотр не меняет значок.','Без ранга','Рейтинг недоступен','Нужный рейтинг','Просмотр шести знаков','Анимация при наведении или фокусе','Статичный вид'],
    fr:['Insigne de rang','Rang actuel','Aperçu uniquement','Mon rang','Le rang suit le classement actuel de la cadence choisie. Un aperçu ne modifie pas votre insigne.','Sans rang','Classement indisponible','Classement requis','Voir les six insignes','Animer au survol ou au focus','Affichage fixe'],
    de:['Rangabzeichen','Aktueller Rang','Nur Vorschau','Mein Rang','Der Rang folgt der aktuellen Wertung der gewählten Bedenkzeit. Die Vorschau legt kein Abzeichen an.','Noch ohne Rang','Wertung nicht verfügbar','Benötigte Wertung','Sechs Abzeichen ansehen','Bei Hover oder Fokus animieren','Statische Ansicht'],
    es:['Insignia de rango','Rango actual','Solo vista previa','Mi rango','El rango depende de la puntuación actual del ritmo elegido. La vista previa no equipa la insignia.','Sin rango','Puntuación no disponible','Puntuación necesaria','Ver las seis insignias','Animar al pasar o enfocar','Vista estática'],
    tr:['Rütbe rozeti','Mevcut rütbe','Yalnızca önizleme','Rütbemi göster','Rütbe, seçilen sürenin güncel puanına bağlıdır. Önizleme rozeti takmaz.','Henüz rütbesiz','Puan alınamadı','Gerekli puan','Altı rozeti incele','Üzerine gelince veya odakta canlandır','Sabit görünüm'],
    pl:['Odznaka rangi','Obecna ranga','Tylko podgląd','Moja ranga','Ranga wynika z bieżącego rankingu wybranego tempa. Podgląd nie zakłada odznaki.','Bez rangi','Ranking niedostępny','Wymagany ranking','Obejrzyj sześć odznak','Animuj po najechaniu lub fokusie','Widok statyczny'],
    hi:['रैंक बैज','वर्तमान रैंक','केवल पूर्वावलोकन','मेरी रैंक दिखाएँ','चुने हुए समय नियंत्रण की वर्तमान रेटिंग से रैंक तय होती है। पूर्वावलोकन से बैज नहीं बदलता।','अभी कोई रैंक नहीं','रेटिंग उपलब्ध नहीं','आवश्यक रेटिंग','छह बैज देखें','होवर या फ़ोकस पर ऐनिमेशन','स्थिर दृश्य'],
    pt:['Insígnia de classificação','Classificação atual','Apenas prévia','Minha classificação','A classificação segue a pontuação atual do ritmo escolhido. A prévia não equipa a insígnia.','Sem classificação','Pontuação indisponível','Pontuação necessária','Ver as seis insígnias','Animar ao passar ou focar','Exibição estática'],
    ta:['தரநிலைப் பதக்கம்','தற்போதைய தரநிலை','முன்னோட்டம் மட்டும்','என் தரநிலையைக் காட்டு','தேர்ந்தெடுத்த நேரக் கட்டுப்பாட்டின் தற்போதைய மதிப்பீட்டால் தரநிலை தீர்மானிக்கப்படும். முன்னோட்டம் பதக்கத்தை மாற்றாது.','இன்னும் தரநிலை இல்லை','மதிப்பீடு கிடைக்கவில்லை','தேவையான மதிப்பீடு','ஆறு பதக்கங்களைக் காண்க','சுட்டும் அல்லது கவனம் பெறும் போது அசைவு','நிலையான காட்சி'],
};
const names: Record<Language, readonly [string,string,string,string,string,string]> = {
    en:['Pawn · Bronze','Knight · Silver','Bishop · Gold','Rook · Platinum','Queen · Diamond','King · Master'],
    ja:['ポーン級・ブロンズ','ナイト級・シルバー','ビショップ級・ゴールド','ルーク級・プラチナ','クイーン級・ダイヤ','キング級・マスター'],
    zh:['兵·青铜','马·白银','象·黄金','车·铂金','后·钻石','王·大师'],
    ru:['Пешка · Бронза','Конь · Серебро','Слон · Золото','Ладья · Платина','Ферзь · Алмаз','Король · Мастер'],
    fr:['Pion · Bronze','Cavalier · Argent','Fou · Or','Tour · Platine','Dame · Diamant','Roi · Maître'],
    de:['Bauer · Bronze','Springer · Silber','Läufer · Gold','Turm · Platin','Dame · Diamant','König · Meister'],
    es:['Peón · Bronce','Caballo · Plata','Alfil · Oro','Torre · Platino','Dama · Diamante','Rey · Maestro'],
    tr:['Piyon · Bronz','At · Gümüş','Fil · Altın','Kale · Platin','Vezir · Elmas','Şah · Usta'],
    pl:['Pion · Brąz','Skoczek · Srebro','Goniec · Złoto','Wieża · Platyna','Hetman · Diament','Król · Mistrz'],
    hi:['प्यादा · कांस्य','घोड़ा · रजत','ऊँट · स्वर्ण','हाथी · प्लैटिनम','वज़ीर · हीरा','राजा · मास्टर'],
    pt:['Peão · Bronze','Cavalo · Prata','Bispo · Ouro','Torre · Platina','Dama · Diamante','Rei · Mestre'],
    ta:['சிப்பாய் · வெண்கலம்','குதிரை · வெள்ளி','யானை · தங்கம்','கோட்டை · பிளாட்டினம்','ராணி · வைரம்','ராஜா · மாஸ்டர்'],
};
export const cosmeticsText=(lang:string,key:typeof keys[number])=>(copy[lang as Language]??copy.en)[keys.indexOf(key)];
export const badgeName=(lang:string,id:BadgeId)=>(names[lang as Language]??names.en)[(['pawn','knight','bishop','rook','queen','king'] as const).indexOf(id)];
