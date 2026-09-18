import { stageText } from './stageText';
import { rewardFormText } from './rewardFormText';
import type { Language } from './dict';
import type { ChampionshipReward } from '../config/championshipRewards';
import { rewardTrackTitle } from '../config/musicTracks';

export const championshipKeys=['lap','ascension','advance','previous','next','strength','cap','record','wins','medals','balanced','attacker','guardian','collection','effect','unlockAt','tier','complete'] as const;
type Labels<T extends readonly unknown[]> = {readonly [K in keyof T]:string};
const text:Record<Language,Labels<typeof championshipKeys>>={
    en:['Circuit','Ascension tournament','Next circuit','Previous','Next','CPU strength','Strength reaches its cap at circuit 5. Later circuits vary tactics and opening ties.','Personal records','Championships','Medals','Balanced','Attacker','Guardian','100 championship rewards','Victory effect','Championships required','Collection grade','All 100 rewards unlocked'],
    ja:['周回','昇格トーナメント','次の周回へ','前へ','次へ','CPU強度','強度は5周目で上限。その後も戦法と同評価の初手が変化します。','自己ベスト','優勝回数','メダル','均衡型','攻撃型','守備型','優勝報酬100種','勝利エフェクト','解放に必要な優勝回数','コレクショングレード','100種類すべて解放済み'],
    zh:['周目','晋级锦标赛','下一周目','上一页','下一页','CPU强度','强度在第5周目达到上限，之后继续变化战术和等评分开局。','个人纪录','夺冠次数','奖章','均衡型','进攻型','防守型','100种冠军奖励','胜利特效','所需夺冠次数','收藏等级','已解锁全部100种奖励'],
    ru:['Цикл','Турнир восхождения','Следующий цикл','Назад','Далее','Сила CPU','Предел силы — цикл 5. Затем меняются тактика и равноценные дебютные ходы.','Личные рекорды','Титулы','Медали','Баланс','Атака','Защита','100 наград чемпиона','Эффект победы','Нужно титулов','Уровень коллекции','Все 100 наград открыты'],
    fr:['Cycle','Tournoi d’ascension','Cycle suivant','Précédent','Suivant','Force du CPU','La force plafonne au cycle 5. Les tactiques et ouvertures équivalentes varient ensuite.','Records personnels','Titres','Médailles','Équilibré','Attaquant','Défenseur','100 récompenses de champion','Effet de victoire','Titres requis','Grade de collection','Les 100 récompenses sont débloquées'],
    de:['Durchlauf','Aufstiegsturnier','Nächster Durchlauf','Zurück','Weiter','CPU-Stärke','Ab Durchlauf 5 gilt die Höchststärke. Taktik und gleichwertige Eröffnungen wechseln weiter.','Eigene Rekorde','Titel','Medaillen','Ausgewogen','Angreifer','Verteidiger','100 Meisterbelohnungen','Siegeffekt','Benötigte Titel','Sammlungsstufe','Alle 100 Belohnungen freigeschaltet'],
    es:['Vuelta','Torneo de ascenso','Siguiente vuelta','Anterior','Siguiente','Fuerza de CPU','La fuerza alcanza el límite en la vuelta 5. Después varían las tácticas y aperturas equivalentes.','Récords personales','Campeonatos','Medallas','Equilibrado','Atacante','Defensor','100 premios de campeón','Efecto de victoria','Campeonatos necesarios','Grado de colección','Los 100 premios están desbloqueados'],
    tr:['Döngü','Yükseliş turnuvası','Sonraki döngü','Önceki','Sonraki','CPU gücü','Güç 5. döngüde sınıra ulaşır. Sonra taktikler ve eşdeğer açılışlar değişir.','Kişisel rekorlar','Şampiyonluklar','Madalyalar','Dengeli','Saldırgan','Savunmacı','100 şampiyonluk ödülü','Zafer efekti','Gerekli şampiyonluk','Koleksiyon derecesi','100 ödülün tümü açıldı'],
    pl:['Cykl','Turniej awansu','Następny cykl','Poprzedni','Następny','Siła CPU','Siła osiąga limit w cyklu 5. Później zmieniają się taktyki i równoważne otwarcia.','Rekordy osobiste','Tytuły','Medale','Zrównoważony','Atakujący','Obrońca','100 nagród mistrza','Efekt zwycięstwa','Wymagane tytuły','Poziom kolekcji','Odblokowano wszystkie 100 nagród'],
    hi:['चक्र','पदोन्नति टूर्नामेंट','अगला चक्र','पिछला','अगला','CPU शक्ति','शक्ति चक्र 5 पर अधिकतम होती है। इसके बाद रणनीतियाँ और समान मूल्य की शुरुआती चालें बदलती हैं।','निजी रिकॉर्ड','खिताब','पदक','संतुलित','आक्रामक','रक्षक','100 चैंपियन पुरस्कार','जीत का प्रभाव','आवश्यक खिताब','संग्रह स्तर','सभी 100 पुरस्कार खुल गए'],
    pt:['Ciclo','Torneio de ascensão','Próximo ciclo','Anterior','Próximo','Força da CPU','A força atinge o limite no ciclo 5. Depois variam as táticas e aberturas equivalentes.','Recordes pessoais','Títulos','Medalhas','Equilibrado','Atacante','Defensor','100 prêmios de campeão','Efeito de vitória','Títulos necessários','Grau da coleção','Todos os 100 prêmios desbloqueados'],
    ta:['சுற்றுப்பயணம்','முன்னேற்றப் போட்டி','அடுத்த சுற்றுப்பயணம்','முந்தையது','அடுத்தது','CPU வலிமை','5வது சுற்றில் வலிமை உச்சத்தை அடையும். பின்னர் உத்திகளும் சம மதிப்புள்ள தொடக்க நகர்வுகளும் மாறும்.','தனிப்பட்ட சாதனைகள்','வெற்றிக் கோப்பைகள்','பதக்கங்கள்','சமநிலை','தாக்குதல்','தற்காப்பு','100 வெற்றியாளர் பரிசுகள்','வெற்றி விளைவு','தேவையான கோப்பைகள்','சேகரிப்பு நிலை','100 பரிசுகளும் திறக்கப்பட்டன'],
};
const families:Record<Language,readonly [string,string,string,string,string,string,string,string,string,string]>={
    en:['Artisan inlay','Carved stone','Forged metal','Crystal setting','Obsidian sigil','Imperial regalia','Orbital rings','Crystal burst','Falling stars','Crown of light'],
    ja:['工芸の象嵌','彫刻の石盤','鍛造の金属','結晶の宝飾','黒曜の紋章','王家の装飾','光の軌道','結晶の花火','星の降臨','光冠の祝祭'],
    zh:['工艺镶嵌','雕刻石盘','锻造金属','水晶镶座','黑曜徽记','皇家华饰','光之轨道','水晶绽放','星辰降临','光冠庆典'],
    ru:['Инкрустация','Резной камень','Кованый металл','Кристальная оправа','Обсидиановый знак','Королевские регалии','Орбитальные кольца','Взрыв кристаллов','Падающие звёзды','Световая корона'],
    fr:['Marqueterie','Pierre sculptée','Métal forgé','Sertissage cristal','Sceau d’obsidienne','Ornement impérial','Anneaux orbitaux','Éclat de cristal','Étoiles filantes','Couronne de lumière'],
    de:['Intarsienkunst','Steinrelief','Schmiedemetall','Kristallfassung','Obsidiansiegel','Kaiserinsignien','Orbitalringe','Kristallexplosion','Sternenfall','Lichtkrone'],
    es:['Taracea artesanal','Piedra tallada','Metal forjado','Engaste de cristal','Sello de obsidiana','Regalia imperial','Anillos orbitales','Estallido de cristal','Lluvia de estrellas','Corona de luz'],
    tr:['El işi kakma','Oyma taş','Dövme metal','Kristal yuva','Obsidyen mühür','İmparatorluk nişanı','Yörünge halkaları','Kristal patlaması','Yıldız yağmuru','Işık tacı'],
    pl:['Artystyczna intarsja','Rzeźbiony kamień','Kuty metal','Kryształowa oprawa','Obsydianowa pieczęć','Cesarskie regalia','Pierścienie orbitalne','Kryształowy rozbłysk','Spadające gwiazdy','Korona światła'],
    hi:['कारीगरी जड़ाई','नक्काशीदार पत्थर','गढ़ी हुई धातु','क्रिस्टल जड़ाव','ओब्सीडियन चिह्न','शाही अलंकरण','कक्षीय छल्ले','क्रिस्टल विस्फोट','टूटते तारे','प्रकाश मुकुट'],
    pt:['Marchetaria','Pedra esculpida','Metal forjado','Engaste de cristal','Selo de obsidiana','Insígnia imperial','Anéis orbitais','Explosão de cristal','Chuva de estrelas','Coroa de luz'],
    ta:['கைவினைப் பதிப்பு','செதுக்கிய கல்','வடித்த உலோகம்','படிகப் பதிப்பு','கருங்கண்ணாடிச் சின்னம்','அரச அலங்காரம்','ஒளி வளையங்கள்','படிக வெடிப்பு','விண்மீன் மழை','ஒளிக் கிரீடம்'],
};
export const championshipText=(lang:Language,key:typeof championshipKeys[number])=>text[lang][championshipKeys.indexOf(key)];
const preview:Record<Language,string>={en:'Preview effect',ja:'エフェクトをプレビュー',zh:'预览特效',ru:'Просмотр эффекта',fr:'Aperçu de l’effet',de:'Effektvorschau',es:'Ver efecto',tr:'Efekti önizle',pl:'Podgląd efektu',hi:'प्रभाव देखें',pt:'Prévia do efeito',ta:'விளைவு முன்னோட்டம்'};
export const effectPreviewLabel=(lang:Language)=>preview[lang];
const extras:Record<Language,readonly [string,string]>={en:['Staunton finish','Circuit score'],ja:['スタントン・マテリアル','サーキット・スコア'],zh:['斯汤顿材质','巡回乐章'],ru:['Материал Стаунтона','Музыка цикла'],fr:['Finition Staunton','Partition du circuit'],de:['Staunton-Material','Turniermusik'],es:['Acabado Staunton','Música del circuito'],tr:['Staunton kaplama','Döngü müziği'],pl:['Wykończenie Staunton','Muzyka cyklu'],hi:['स्टॉन्टन सामग्री','चक्र संगीत'],pt:['Acabamento Staunton','Música do circuito'],ta:['ஸ்டான்டன் மேற்பரப்பு','சுற்று இசை']};
export const championshipName=(lang:Language,reward:ChampionshipReward)=>{
    if (reward.kind==='music') return `${rewardTrackTitle(reward.url) ?? extras[lang][1]} · ${String(reward.requiredWins).padStart(3,'0')}`;
    const name=reward.kind==='avatar'?stageText(lang,'frame'):reward.kind==='piece'?extras[lang][0]:families[lang][reward.familyIndex+(reward.kind==='effect'?6:0)];
    const style=rewardFormText(lang,reward.kind==='piece'?reward.form:reward.kind==='board'?reward.profile:undefined);
    return `${name}${style?' · '+style:''} ${(reward.kind==='piece'||reward.kind==='avatar')?String(reward.requiredWins).padStart(3,'0'):['I','II','III','IV','V','VI','VII','VIII','IX','X'][reward.tier-1]}`;
};
