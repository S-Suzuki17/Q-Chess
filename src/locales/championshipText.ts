import { cosmeticLabel } from './cosmeticNames';
import { avatarFrame } from '../config/avatarFrames';
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
export const championshipText=(lang:Language,key:typeof championshipKeys[number])=>text[lang][championshipKeys.indexOf(key)];
const preview:Record<Language,string>={en:'Preview effect',ja:'エフェクトをプレビュー',zh:'预览特效',ru:'Просмотр эффекта',fr:'Aperçu de l’effet',de:'Effektvorschau',es:'Ver efecto',tr:'Efekti önizle',pl:'Podgląd efektu',hi:'प्रभाव देखें',pt:'Prévia do efeito',ta:'விளைவு முன்னோட்டம்'};
export const effectPreviewLabel=(lang:Language)=>preview[lang];
export const championshipName=(lang:Language,reward:ChampionshipReward)=>{
    if (reward.kind==='music') return rewardTrackTitle(reward.url) ?? 'BGM';
    const frame=reward.kind==='avatar'?avatarFrame(reward.id):undefined;
    const name=frame
        ? `${cosmeticLabel(lang, ['bronze','silver','gold'][Math.floor((frame.tier-1)/5)])} · ${cosmeticLabel(lang,frame.motif)}`
        : cosmeticLabel(lang,reward.motif);
    const form=rewardFormText(lang,reward.kind==='piece'?reward.form:reward.kind==='board'?reward.profile:undefined);
    return `${name}${form?' · '+form:''} ${String(reward.requiredWins).padStart(3,'0')}`;
};
