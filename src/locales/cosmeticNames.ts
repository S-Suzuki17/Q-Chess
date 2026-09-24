import type { Language } from './dict';
const keys = ['walnut','marble','brass','crystal','obsidian','gold','rings','shards','starfall','corona','boxwood','ebony','alabaster','bronze','silver','laurel','facets','wings','circuit','crown','iceglass','neonglass','wood','neon'] as const;
const labels: Record<Language, readonly string[]> = {
  en: ["Walnut","Stone","Metal","Crystal","Obsidian","Gold","Rings","Shards","Particles","Glow","Boxwood","Ebony","Alabaster","Bronze","Silver","Laurel","Facets","Wings","Circuit","Crown","Clear glass","Tinted glass","Walnut & maple","Neon grid"],
  ja: ["ウォールナット","ストーン","メタル","クリスタル","オブシディアン","ゴールド","リング","シャード","パーティクル","グロー","ツゲ","エボニー","アラバスター","ブロンズ","シルバー","ローレル","ファセット","ウィング","サーキット","クラウン","クリアガラス","カラーガラス","ウォールナット＆メープル","ネオングリッド"],
  zh: ["胡桃木","石材","金属","水晶","黑曜石","金色","光环","碎片","粒子","柔光","黄杨木","黑檀木","雪花石膏","青铜","银色","月桂","切面","羽翼","电路","王冠","透明玻璃","彩色玻璃","胡桃木与枫木","霓虹网格"],
  ru: ["Орех","Камень","Металл","Кристалл","Обсидиан","Золото","Кольца","Осколки","Частицы","Сияние","Самшит","Эбен","Алебастр","Бронза","Серебро","Лавр","Грани","Крылья","Схема","Корона","Прозрачное стекло","Цветное стекло","Орех и клён","Неоновая сетка"],
  fr: ["Noyer","Pierre","Métal","Cristal","Obsidienne","Or","Anneaux","Éclats","Particules","Lueur","Buis","Ébène","Albâtre","Bronze","Argent","Laurier","Facettes","Ailes","Circuit","Couronne","Verre transparent","Verre teinté","Noyer et érable","Grille néon"],
  de: ["Nussbaum","Stein","Metall","Kristall","Obsidian","Gold","Ringe","Splitter","Partikel","Leuchten","Buchsbaum","Ebenholz","Alabaster","Bronze","Silber","Lorbeer","Facetten","Flügel","Schaltung","Krone","Klarglas","Farbglas","Nussbaum und Ahorn","Neonraster"],
  es: ["Nogal","Piedra","Metal","Cristal","Obsidiana","Oro","Anillos","Fragmentos","Partículas","Brillo","Boj","Ébano","Alabastro","Bronce","Plata","Laurel","Facetas","Alas","Circuito","Corona","Vidrio transparente","Vidrio tintado","Nogal y arce","Cuadrícula neón"],
  tr: ["Ceviz","Taş","Metal","Kristal","Obsidyen","Altın","Halkalar","Parçalar","Parçacıklar","Parıltı","Şimşir","Abanoz","Kaymak taşı","Bronz","Gümüş","Defne","Fasetler","Kanatlar","Devre","Taç","Şeffaf cam","Renkli cam","Ceviz ve akçaağaç","Neon ızgara"],
  pl: ["Orzech","Kamień","Metal","Kryształ","Obsydian","Złoto","Pierścienie","Odłamki","Cząstki","Blask","Bukszpan","Heban","Alabaster","Brąz","Srebro","Laur","Fasety","Skrzydła","Obwód","Korona","Przezroczyste szkło","Barwione szkło","Orzech i klon","Neonowa siatka"],
  hi: ["अखरोट","पत्थर","धातु","क्रिस्टल","ओब्सीडियन","सोना","छल्ले","टुकड़े","कण","चमक","बॉक्सवुड","आबनूस","एलाबास्टर","कांस्य","चाँदी","लॉरेल","फलक","पंख","सर्किट","मुकुट","पारदर्शी काँच","रंगीन काँच","अखरोट और मेपल","नियॉन ग्रिड"],
  pt: ["Nogueira","Pedra","Metal","Cristal","Obsidiana","Ouro","Anéis","Fragmentos","Partículas","Brilho","Buxo","Ébano","Alabastro","Bronze","Prata","Louro","Facetas","Asas","Circuito","Coroa","Vidro transparente","Vidro colorido","Nogueira e bordo","Grade néon"],
  ta: ["வால்நட்","கல்","உலோகம்","படிகம்","கருங்கண்ணாடி","தங்கம்","வளையங்கள்","துண்டுகள்","துகள்கள்","ஒளிர்வு","பாக்ஸ்வுட்","எபனி","அலபாஸ்டர்","வெண்கலம்","வெள்ளி","லாரல்","முகங்கள்","சிறகுகள்","சுற்று","கிரீடம்","தெளிவான கண்ணாடி","வண்ணக் கண்ணாடி","வால்நட் மற்றும் மேப்பிள்","நியான் கட்டம்"],
};
export const cosmeticLabel = (lang: Language, key: string) => labels[lang][keys.indexOf(key as typeof keys[number])] ?? key;
export const cosmeticLabelCount = (lang: Language) => labels[lang].length;
