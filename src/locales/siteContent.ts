import type {Language} from './dict';
const labels:Record<Language,readonly string[]>={
  "en": [
      "About Q-Gambit",
      "Contact",
      "How it works",
      "Crown Circuit",
      "Help & feedback",
      "Back to game",
      "Example"
  ],
  "ja": [
      "Q-Gambitについて",
      "お問い合わせ",
      "遊び方の基本",
      "クラウン・サーキット",
      "ヘルプ・不具合報告",
      "ゲームへ戻る",
      "具体例"
  ],
  "zh": [
      "关于Q-Gambit",
      "联系我们",
      "基本玩法",
      "皇冠巡回赛",
      "帮助与反馈",
      "返回游戏",
      "示例"
  ],
  "ru": [
      "О Q-Gambit",
      "Связаться",
      "Основы игры",
      "Crown Circuit",
      "Помощь и отзывы",
      "Вернуться к игре",
      "Пример"
  ],
  "fr": [
      "À propos de Q-Gambit",
      "Contact",
      "Principes du jeu",
      "Crown Circuit",
      "Aide et retours",
      "Retour au jeu",
      "Exemple"
  ],
  "de": [
      "Über Q-Gambit",
      "Kontakt",
      "Spielprinzip",
      "Crown Circuit",
      "Hilfe und Feedback",
      "Zurück zum Spiel",
      "Beispiel"
  ],
  "es": [
      "Acerca de Q-Gambit",
      "Contacto",
      "Cómo funciona",
      "Crown Circuit",
      "Ayuda y comentarios",
      "Volver al juego",
      "Ejemplo"
  ],
  "tr": [
      "Q-Gambit hakkında",
      "İletişim",
      "Oyun temelleri",
      "Crown Circuit",
      "Yardım ve geri bildirim",
      "Oyuna dön",
      "Örnek"
  ],
  "pl": [
      "O Q-Gambit",
      "Kontakt",
      "Zasady gry",
      "Crown Circuit",
      "Pomoc i opinie",
      "Powrót do gry",
      "Przykład"
  ],
  "hi": [
      "Q-Gambit के बारे में",
      "संपर्क",
      "खेल की मूल बातें",
      "क्राउन सर्किट",
      "मदद और सुझाव",
      "खेल पर लौटें",
      "उदाहरण"
  ],
  "pt": [
      "Sobre Q-Gambit",
      "Contato",
      "Como funciona",
      "Crown Circuit",
      "Ajuda e comentários",
      "Voltar ao jogo",
      "Exemplo"
  ],
  "ta": [
      "Q-Gambit பற்றி",
      "தொடர்பு",
      "ஆட்டத்தின் அடிப்படை",
      "கிரவுன் சர்க்யூட்",
      "உதவி மற்றும் கருத்துகள்",
      "ஆட்டத்திற்குத் திரும்பு",
      "எடுத்துக்காட்டு"
  ]
};
const paragraphs:Record<Language,readonly string[]>={
  "en": [
    "Each piece occupies one square. Its remaining candidate identities determine how it can move. This is a game inspired by uncertainty, not a physical quantum simulation.",
    "If a piece has only bishop, rook and queen candidates, moving it diagonally along a clear path removes rook. Bishop and queen remain until further moves or constraints resolve the identity.",
    "Start with the interactive tutorial or CPU practice. Select a piece, inspect its candidates, then choose a highlighted destination. The hint identifies both the piece and the destination.",
    "Report the mode, approximate time, device/browser and steps that caused the problem. Remove personal information from screenshots. Never send passwords or sign-in codes. For account or data-deletion requests, use the email below."
  ],
  "ja": [
    "駒は常に1つのマスにあります。残っている駒の種類の候補によって、動ける場所が変わります。不確定な情報を読むゲームであり、実際の量子現象を再現するシミュレーターではありません。",
    "候補がビショップ・ルーク・クイーンの駒を、障害物のない斜め方向に動かすと、ルークの候補が外れます。ビショップとクイーンは、その後の着手や盤全体の制約で確定するまで残ります。",
    "最初はチュートリアルかCPU練習がおすすめです。駒を選んで候補を確認し、表示された移動先を選びます。ヒントでは動かす駒と移動先の両方を確認できます。",
    "不具合報告にはモード、発生時刻、端末・ブラウザー、再現手順を添えてください。画像の個人情報は隠し、パスワードや認証コードは送らないでください。アカウントやデータ削除の相談も下記メールで受け付けます。"
  ],
  "zh": [
    "每个棋子始终占据一个格子。剩余的候选身份决定它如何移动。这是受不确定性启发的游戏，并非物理量子模拟。",
    "若候选只有象、车和后，沿无障碍斜线移动会排除车。象和后的候选会保留，直到后续移动或约束确定身份。",
    "先试互动教程或CPU练习。选择棋子、查看候选，再选择标出的目标格。提示会指出棋子和目标格。",
    "报告问题时请附上模式、时间、设备和浏览器、重现步骤。截图请遮住个人信息，切勿发送密码或验证码。账户或数据删除请求请联系下方邮箱。"
  ],
  "ru": [
    "Каждая фигура занимает одну клетку. Оставшиеся варианты её типа определяют ходы. Это игра о неопределённости, а не симуляция квантовой физики.",
    "Если возможны только слон, ладья и ферзь, ход по свободной диагонали исключает ладью. Остальные варианты сохраняются до дальнейших ходов или ограничений.",
    "Начните с обучения или практики с CPU. Выберите фигуру, проверьте варианты и подсвеченную клетку назначения. Подсказка показывает и фигуру, и цель.",
    "Для сообщения об ошибке укажите режим, время, устройство, браузер и шаги воспроизведения. Скройте личные данные на снимках. Не отправляйте пароли и коды. По вопросам аккаунта и удаления данных используйте почту ниже."
  ],
  "fr": [
    "Chaque pièce occupe une seule case. Ses identités possibles déterminent ses déplacements. Le jeu s’inspire de l’incertitude, sans simuler la physique quantique.",
    "Si les candidats sont fou, tour et dame, un déplacement sur une diagonale libre élimine la tour. Fou et dame restent possibles jusqu’à une autre contrainte.",
    "Commencez par le tutoriel ou un entraînement CPU. Sélectionnez une pièce, examinez ses candidats et choisissez une case indiquée. L’indice montre la pièce et sa destination.",
    "Précisez le mode, l’heure, l’appareil, le navigateur et les étapes du problème. Masquez les données personnelles des captures. N’envoyez aucun mot de passe ou code. Pour le compte ou la suppression de données, utilisez l’adresse ci-dessous."
  ],
  "de": [
    "Jede Figur steht auf genau einem Feld. Ihre möglichen Typen bestimmen die Züge. Das Spiel nutzt Unsicherheit, ist aber keine Simulation der Quantenphysik.",
    "Sind nur Läufer, Turm und Dame möglich, schließt ein Zug entlang einer freien Diagonale den Turm aus. Die übrigen Typen bleiben bis zu weiteren Zügen oder Einschränkungen möglich.",
    "Beginne mit dem Tutorial oder CPU-Training. Wähle eine Figur, prüfe die Kandidaten und wähle ein markiertes Zielfeld. Der Hinweis zeigt Figur und Ziel.",
    "Nenne Modus, Zeitpunkt, Gerät, Browser und Schritte zum Fehler. Verberge persönliche Daten in Bildern. Sende keine Passwörter oder Codes. Anfragen zu Konto und Datenlöschung bitte an die folgende Adresse."
  ],
  "es": [
    "Cada pieza ocupa una sola casilla. Sus identidades posibles determinan sus movimientos. Es un juego inspirado en la incertidumbre, no una simulación física cuántica.",
    "Si los candidatos son alfil, torre y dama, moverse por una diagonal libre elimina la torre. Los otros candidatos permanecen hasta que nuevas jugadas o restricciones los resuelvan.",
    "Empieza con el tutorial o la práctica CPU. Selecciona una pieza, mira sus candidatos y elige una casilla marcada. La pista muestra la pieza y su destino.",
    "Indica modo, hora, dispositivo, navegador y pasos para reproducir el problema. Oculta los datos personales de las capturas. No envíes contraseñas ni códigos. Para cuentas o eliminación de datos, escribe al correo inferior."
  ],
  "tr": [
    "Her taş tek bir karede bulunur. Kalan olası taş türleri hareketlerini belirler. Bu belirsizlik temalı bir oyundur; fiziksel kuantum simülasyonu değildir.",
    "Adaylar yalnızca fil, kale ve vezirse, açık bir çapraz yol boyunca hareket kaleyi eler. Diğer adaylar yeni hamle veya kısıtlamalarla belirlenene kadar kalır.",
    "Öğretici veya CPU alıştırmasıyla başlayın. Taşı seçin, adaylara bakın ve işaretli hedefi seçin. İpucu hem taşı hem hedefi gösterir.",
    "Hata için mod, saat, cihaz, tarayıcı ve tekrar adımlarını belirtin. Görsellerde kişisel bilgileri gizleyin. Parola veya kod göndermeyin. Hesap ve veri silme talepleri için aşağıdaki e-postayı kullanın."
  ],
  "pl": [
    "Każda figura zajmuje jedno pole. Pozostałe możliwe typy określają jej ruchy. To gra inspirowana niepewnością, nie symulacja fizyki kwantowej.",
    "Jeśli możliwe są tylko goniec, wieża i hetman, ruch po wolnej przekątnej wyklucza wieżę. Inne możliwości pozostają do kolejnych ruchów lub ograniczeń.",
    "Zacznij od samouczka lub treningu CPU. Wybierz figurę, sprawdź kandydatów i zaznaczone pole docelowe. Podpowiedź wskazuje figurę i cel.",
    "Podaj tryb, czas, urządzenie, przeglądarkę i kroki odtworzenia błędu. Ukryj dane osobowe na zdjęciach. Nie wysyłaj haseł ani kodów. W sprawie konta lub usunięcia danych użyj adresu poniżej."
  ],
  "hi": [
    "हर मोहरा एक ही खाने पर रहता है। उसकी बची संभावित पहचानें तय करती हैं कि वह कैसे चलेगा। यह अनिश्चितता पर आधारित खेल है, वास्तविक क्वांटम भौतिकी का अनुकरण नहीं।",
    "अगर केवल ऊँट, हाथी और वज़ीर संभावित हों, तो खाली तिरछे रास्ते पर चलने से हाथी की संभावना हटती है। बाकी पहचानें आगे की चालों या सीमाओं से तय होती हैं।",
    "ट्यूटोरियल या CPU अभ्यास से शुरू करें। मोहरा चुनें, उम्मीदवार देखें और दिखाए गए लक्ष्य पर चलें। संकेत मोहरा और लक्ष्य दोनों दिखाता है।",
    "समस्या के साथ मोड, समय, उपकरण, ब्राउज़र और दोहराने के चरण बताएँ। तस्वीरों में निजी जानकारी छिपाएँ। पासवर्ड या कोड न भेजें। खाते या डेटा हटाने के लिए नीचे ईमेल करें।"
  ],
  "pt": [
    "Cada peça ocupa uma única casa. As identidades candidatas determinam seus movimentos. O jogo se inspira na incerteza, não simula a física quântica.",
    "Se os candidatos forem bispo, torre e rainha, mover por uma diagonal livre elimina a torre. Os demais continuam possíveis até novas jogadas ou restrições.",
    "Comece pelo tutorial ou treino CPU. Selecione a peça, veja os candidatos e escolha uma casa marcada. A dica mostra a peça e o destino.",
    "Informe modo, horário, dispositivo, navegador e passos para reproduzir o problema. Oculte dados pessoais nas imagens. Não envie senhas ou códigos. Para conta ou exclusão de dados, use o e-mail abaixo."
  ],
  "ta": [
    "ஒவ்வொரு காயும் ஒரு கட்டத்தில் மட்டுமே இருக்கும். மீதமுள்ள சாத்தியமான வகைகள் அதன் நகர்வைத் தீர்மானிக்கும். இது நிச்சயமின்மையை மையமாகக் கொண்ட விளையாட்டு; இயற்பியல் குவாண்டம் உருவகப்படுத்தல் அல்ல.",
    "பிஷப், ரூக், குயின் மட்டுமே சாத்தியமானால், தடையற்ற குறுக்குப் பாதையில் நகர்வது ரூக்கை நீக்கும். பிற நகர்வுகள் அல்லது கட்டுப்பாடுகள் தீர்மானிக்கும் வரை மற்ற சாத்தியங்கள் இருக்கும்.",
    "பயிற்சி வழிகாட்டி அல்லது CPU பயிற்சியில் தொடங்குங்கள். காயைத் தேர்ந்தெடுத்து சாத்தியங்களைப் பார்த்து குறிக்கப்பட்ட இலக்கைத் தேர்ந்தெடுக்கவும். குறிப்பு காயையும் இலக்கையும் காட்டும்.",
    "பிழை அறிக்கையில் முறை, நேரம், சாதனம், உலாவி மற்றும் மீண்டும் செய்யும் படிகளைச் சேர்க்கவும். படங்களில் தனிப்பட்ட தகவலை மறைக்கவும். கடவுச்சொல் அல்லது குறியீடுகளை அனுப்ப வேண்டாம். கணக்கு அல்லது தரவு நீக்கத்திற்கு கீழுள்ள மின்னஞ்சலைப் பயன்படுத்தவும்."
  ]
};
export const siteCopy=(lang:Language)=>({labels:labels[lang],paragraphs:paragraphs[lang]});

// The learning articles are available in Japanese and English. Navigation stays
// localized without pretending that an untranslated article is in another language.
export const learningLabels: Record<Language, readonly [string, string, string, string]> = {
  ja: ['はじめての対局ガイド', 'よくある質問', '最初の一手を理解する', '開始手順、候補の読み方、短い練習問題をログイン前に確認できます。'],
  en: ['First game guide', 'Frequently asked questions', 'Understand your first move', 'Read the starting steps, learn to read candidates and try short exercises before signing in.'],
  zh: ['首局指南', '常见问题', '理解第一步', '指南和常见问题提供日语和英语版本。'],
  ru: ['Руководство для первой партии', 'Частые вопросы', 'Поймите первый ход', 'Руководство и ответы доступны на японском и английском.'],
  fr: ['Guide de première partie', 'Questions fréquentes', 'Comprendre le premier coup', 'Le guide et les réponses sont disponibles en japonais et en anglais.'],
  de: ['Anleitung für die erste Partie', 'Häufige Fragen', 'Den ersten Zug verstehen', 'Anleitung und Antworten sind auf Japanisch und Englisch verfügbar.'],
  es: ['Guía de la primera partida', 'Preguntas frecuentes', 'Entiende el primer movimiento', 'La guía y las respuestas están disponibles en japonés e inglés.'],
  tr: ['İlk oyun rehberi', 'Sık sorulan sorular', 'İlk hamleyi anlayın', 'Rehber ve yanıtlar Japonca ve İngilizce olarak mevcuttur.'],
  pl: ['Poradnik pierwszej partii', 'Częste pytania', 'Zrozum pierwszy ruch', 'Poradnik i odpowiedzi są dostępne po japońsku i angielsku.'],
  hi: ['पहले खेल की मार्गदर्शिका', 'अक्सर पूछे जाने वाले प्रश्न', 'पहली चाल समझें', 'मार्गदर्शिका और उत्तर जापानी और अंग्रेज़ी में उपलब्ध हैं।'],
  pt: ['Guia da primeira partida', 'Perguntas frequentes', 'Entenda o primeiro movimento', 'O guia e as respostas estão disponíveis em japonês e inglês.'],
  ta: ['முதல் ஆட்ட வழிகாட்டி', 'அடிக்கடி கேட்கப்படும் கேள்விகள்', 'முதல் நகர்வைப் புரிந்துகொள்ளுங்கள்', 'வழிகாட்டியும் பதில்களும் ஜப்பானிய மற்றும் ஆங்கில மொழிகளில் கிடைக்கும்.'],
};

export type LearningLanguage = 'ja' | 'en';
type LearningSection = { id: string; title: string; paragraphs: readonly string[] };
type LearningCopy = {
  title: string; intro: string; contents: string; startTitle: string;
  steps: readonly { title: string; text: string }[];
  hintHelp: string;
  sections: readonly LearningSection[];
  practiceTitle: string; practiceIntro: string; answerLabel: string;
  exercises: readonly { question: string; answer: string }[];
  chainTitle: string; chainIntro: string; chainFixed: string; chainCaption: string;
  chainBefore: string; chainAfter: string; chainReasons: readonly string[]; chainTakeaway: string;
  faqTitle: string; faqIntro: string;
  faqs: readonly { id: string; question: string; answer: string; href: string; link: string }[];
};

// Deliberately small, rule-specific examples. Their geometry is checked against
// the authoritative engine in LearningPage.test.ts.
export const learningMoves = [
  { from: 'e4', to: 'h7', candidates: ['Bishop', 'Rook', 'Queen'], remaining: ['Bishop', 'Queen'] },
  { from: 'h7', to: 'h5', candidates: ['Bishop', 'Queen'], remaining: ['Queen'] },
  { from: 'e4', to: 'f5', candidates: ['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'], remaining: ['King', 'Queen', 'Bishop'] },
] as const;

// A complete side has five unresolved pieces plus these eleven known pieces.
// The Rook in the known group is captured; it still occupies an identity slot.
// Both candidate cycles fit the quotas before A reveals Queen.
export const learningChain = {
  pieces: [
    { id: 'A', before: ['Bishop', 'Queen'], after: ['Queen'] },
    { id: 'B', before: ['Rook', 'Queen'], after: ['Rook'] },
    { id: 'C', before: ['Rook', 'Knight'], after: ['Knight'] },
    { id: 'D', before: ['Knight', 'Pawn'], after: ['Pawn'] },
    { id: 'E', before: ['Bishop', 'Pawn'], after: ['Bishop'] },
  ],
  known: ['King', 'Rook', 'Bishop', 'Knight', 'Pawn', 'Pawn', 'Pawn', 'Pawn', 'Pawn', 'Pawn', 'Pawn'],
} as const;

export const learningPieceNames = {
  ja: { King: 'キング', Queen: 'クイーン', Rook: 'ルーク', Bishop: 'ビショップ', Knight: 'ナイト', Pawn: 'ポーン' },
  en: { King: 'King', Queen: 'Queen', Rook: 'Rook', Bishop: 'Bishop', Knight: 'Knight', Pawn: 'Pawn' },
} as const;

export const learningCopy: Record<LearningLanguage, LearningCopy> = {
  ja: {
    title: 'はじめての対局ガイド',
    intro: 'Q-Gambitでは、駒は1つのマスにいて、正体の候補がいくつも残っています。候補を読んで動き、相手に伝わる情報も考えるゲームです。このガイドは、初回の開始操作から、次の一手を考えるための短い推理練習までをつなぎます。',
    contents: 'このガイドでできること',
    startTitle: '1. ゲストで練習を始める',
    hintHelp: '練習対局のQUBEヒントは無料で、ヒント券を使いません。練習以外の対局では、新しいヒント1回につき券1枚を使います。券を使うには登録アカウントでのログインと最新の利用規約への同意が必要です。同じ取得結果の再表示に追加の券は不要です。表示された元の駒と行き先を見比べ、どの候補が消えるかを自分でも考えてみよう。',
    steps: [
      { title: 'ゲームを開き、ゲストを選ぶ', text: '「ゲームへ戻る」からトップへ進み、「ゲストとしてプレイ」を選びます。初回は利用規約とプライバシー説明を確認する画面が出ます。内容に同意して続けるとロビーに入ります。ガイドとルールを読むための同意やアカウント作成は不要です。' },
      { title: 'チュートリアルで選択を試す', text: 'ロビーの「遊び方」でチュートリアルを開き、案内された駒をタップまたはクリックし、示された移動先を選びます。駒を選ぶ操作と、移動先を決める操作は別です。説明を読み、候補が減る様子を確認してから次へ進んでください。' },
      { title: 'CPU練習の条件を決める', text: 'ロビーの「練習」から強さ、白・先手か黒・後手、時間を選びます。最初は弱いCPU、白・先手、10分を選ぶと候補を確認する余裕ができます。10分と3分は自分の対局全体の持ち時間、1手10秒は手番ごとの制限です。' },
      { title: '自分の駒と移動先を選ぶ', text: '自分の手番になったら駒の候補アイコンを確認して選び、表示された移動先をタップまたはクリックします。相手の手番には待ちます。着手後は移動した駒だけでなく、ほかの駒の候補が変わっていないかも見てください。' },
    ],
    sections: [
      { id: 'candidates', title: '2. 候補アイコンを読む', paragraphs: [
        '丸い駒に複数の小さな駒種アイコンがあれば、それらがまだ可能な正体です。残っている候補のうち、その動きを行えるものがあれば着手できます。動けなかった候補は取り除かれ、候補が1つになると正体が確定して表示されます。駒が複数のマスに分裂するわけではありません。',
        '一手で分かる情報は距離、方向、取り方によって違います。遠くへの斜め移動と、斜め1マスの移動を区別しましょう。キングも斜め1マスなら動けます。ポーンは前に進むときと取るときで方向が違い、ナイトは途中の駒を飛び越えられます。各駒の移動図はルールページにあります。',
        '移動で残った候補は、盤全体の正体枠によってさらに減ることがあります。片側の開始時16個にはキング1、クイーン1、ルーク2、ビショップ2、ナイト2、ポーン8の枠があります。取られた駒も計算に含まれます。盤上の駒の数だけを数えて候補を判断しないでください。',
      ] },
      { id: 'decisions', title: '3. 情報を残すか、正体を明かすか', paragraphs: [
        'たとえばビショップとクイーンが残る駒は斜めにも縦横にも進めます。縦へ進めばビショップが外れてクイーンと分かりますが、確定によって新しい動きが増えるわけではありません。相手にクイーンの位置が伝わり、ほかの味方駒からクイーン候補が外れます。「確定すれば常に得」と考えず、行き先の安全と、伝わる情報を一緒に見ます。',
        '着手前に、①行き先へ相手が取りに来られるか、②どの候補が消えるか、③ほかの味方に影響する枠があるか、を確認します。候補が広い相手の駒は、見た目だけで攻撃範囲を決めつけないでください。残っている候補の動きで、そのマスを取れるかを考えます。',
        'キング候補を残すことには意味がありますが、安全を無視して隠すことはできません。最後の生きたキング候補を危険にさらす着手は認められません。確定キングを守る必要もあります。まずはCPU練習で、候補が減った後に相手の攻撃がどう変わるかを1手ずつ確認しましょう。',
      ] },
      { id: 'outcomes', title: '4. 勝敗と振り返り', paragraphs: [
        '「キング候補のある駒を1個取ったら必ず勝ち」ではありません。相手にほかの生きたキング候補があれば対局は続き、最後の候補がなくなったときに決着します。確定したキングへの王手に対して、合法的な逃げ道がなければチェックメイトです。王手でないのに合法的な着手がない状態は引き分けになります。時間切れや投了による決着もあります。',
        '初めの練習では勝ち負けだけでなく、候補が減った手を1つ説明できることを目標にしてください。棋譜が保存された対局はロビーの棋譜一覧から振り返れます。直近10試合のため、気になった対局は早めに確認してください。表示されない場合や操作に困った場合はFAQから対処を探せます。',
      ] },
    ],
    practiceTitle: '5. 3つの短い推理練習',
    practiceIntro: '以下は白の駒、移動先は空きマス、途中に障害物なし、アンパッサンなし、盤全体の追加制約なしという説明用の例です。実際の局面では合法手と候補を画面で確認してください。答えを開く前に、残る候補を考えてみましょう。',
    answerLabel: '答えと理由を見る',
    exercises: [
      { question: '候補はビショップ・ルーク・クイーン。e4 → h7 と斜めに3マス進むと？', answer: 'ビショップとクイーンが残ります。ルークは斜めに進めないため外れます。方向だけでなく3マスという距離も大切で、キングの1マス移動とは違います。' },
      { question: '同じ駒がビショップ・クイーンの候補で、次の自分の手番に h7 → h5 と縦に2マス進むと？', answer: 'クイーンに確定します。ビショップは縦へ進めません。この側のクイーン枠が埋まると、別の駒に残るクイーン候補にも影響します。' },
      { question: '6種類すべてが候補の駒が、e4 → f5 と空きマスへ斜めに1マス進むと？', answer: 'キング・ビショップ・クイーンが残ります。キングは斜め1マスを動けます。この例のポーンは空きマスへ斜めに進めず、ルークとナイトもこの動きはできません。相手の駒を取る局面やアンパッサンでは条件が変わります。' },
    ],
    chainTitle: '6. 動かしていない駒まで確定する実例',
    chainIntro: '練習2を盤全体へ広げた説明用の例です。同じ側のA〜Eに下図の候補が残っています。Aが障害物のない h7 → h5 の直進でクイーンに確定すると、B〜Eは動いていなくても正体が決まります。駒の動きだけを見ていると、この情報の連鎖を見落とします。',
    chainFixed: '残り11個の正体は、キング1、ルーク1、ビショップ1、ナイト1、ポーン7と分かっているものとします。このルーク1個はすでに取られていますが、正体の枠は消えません。A〜Eと合わせて最初の16個を数えます。',
    chainCaption: 'Aの直進が引き起こす候補の変化。説明用の候補図で、実戦の棋譜や盤上の配置図ではありません。',
    chainBefore: '着手前', chainAfter: 'Aの直進後',
    chainReasons: [
      'Aのビショップ候補は直進できず、クイーンだけが残ります。クイーンは1個なので、Bからクイーンが外れ、Bはルークになります。',
      '取られたルーク1個とBで、ルーク2個の枠が埋まります。Cからルークが外れ、Cはナイトになります。',
      '正体の分かっていたナイト1個とCで、ナイト2個の枠が埋まります。Dからナイトが外れ、Dはポーンになります。',
      '正体の分かっていたポーン7個とDで、ポーン8個の枠が埋まります。Eからポーンが外れ、Eはビショップになります。',
    ],
    chainTakeaway: 'この例では、Aを確定させると味方4個の正体も相手に伝わります。B〜Eの候補を隠したままにしたいなら、その情報を渡す価値がある直進なのかを考えてください。実戦では各駒の候補や捕獲履歴が違うため、必ず同じ連鎖が起きるわけではありません。着手後に、動かした駒以外のアイコンも確認する習慣が役立ちます。',
    faqTitle: 'よくある質問と困ったときの対処',
    faqIntro: '始め方、候補の見方、通信や保存で迷ったときの確認先です。ガイドとルールはログイン前に読めます。解決しない場合は、問い合わせに必要な情報を末尾で確認してください。',
    faqs: [
      { id: 'guest', question: 'アカウントを作らずに試せますか？', answer: 'ゲストでチュートリアルとCPU練習を試せます。トップでゲストを選び、初回の規約確認を経てロビーへ進みます。「遊び方」でチュートリアル、「練習」でCPUとの対局を開けます。ランク対局やクラウン・サーキットなどにはログインが必要です。ゲストの端末内データを、別の端末でも復元できるアカウント保存と同じものとして扱わないでください。', href: '/guide/#start', link: '開始手順を読む' },
      { id: 'identity', question: '正体は最初から決まっていて、ランダムに当てるのですか？', answer: '残っている候補と駒数の制約から、成立する正体を絞り込む仕組みです。候補のどれかが動ける着手を選ぶと、動けない候補が外れます。「見えない正解を確率で当てる」操作ではありません。量子という名前は不確定な情報の着想で、実際の量子現象の再現ではありません。', href: '/guide/#candidates', link: '候補の読み方を確認する' },
      { id: 'move', question: '動けそうなマスを選んでも動けないのはなぜ？', answer: '自分の手番と駒か、残る候補にその動きがあるか、途中に障害物や行き先に味方がいないかを確認します。最後のキング候補を王手にさらす手や、全体の正体枠と矛盾する手は認められません。ポーンの前進と取り方も別です。候補アイコンを見て駒を選び直し、表示された移動先を確認してください。', href: '/rules/', link: '駒の移動図とルールを見る' },
      { id: 'win', question: 'キング候補の駒を取ったのに終わりません', answer: 'ほかに生きたキング候補が残れば対局は続きます。最後の候補がなくなる捕獲と、確定キングのチェックメイトは別の決着です。取った駒の見た目だけで勝敗を判断せず、残る候補とゲームの結果表示を確認してください。', href: '/guide/#outcomes', link: '勝敗の説明を読む' },
      { id: 'clock', question: '10分・3分・1手10秒は何が違いますか？', answer: '10分と3分は自分の対局全体の持ち時間で、考えている間に減ります。1手10秒は手番ごとの制限です。最初は10分で候補を読む練習をし、操作に慣れてから短い時間を選ぶと、時間に追われて候補を見落としにくくなります。', href: '/guide/#start', link: '練習条件を選ぶ手順を見る' },
      { id: 'hints', question: 'QUBEのヒントは無料ですか？ どこを見ればよいですか？', answer: 'ぼくのヒントは、動かす駒と移動先の両方を示すよ。練習対局では無料で使え、ヒント券を消費しません。練習以外の対局で新しいヒントを取得すると、1回につきヒント券1枚を使います。券を使うには登録アカウントでのログインと最新の利用規約への同意が必要です。同じ取得結果の再表示では追加の券を消費しません。利用できる状態や残数は画面で確認してください。行き先だけでなく元の駒にも注目し、どの候補が消えるか一緒に確かめてみよう。', href: '/guide/#practice', link: 'ヒントなしの推理練習を試す' },
      { id: 'connection', question: '読み込みが終わらない、対局中に接続が切れた場合は？', answer: '通信状態と画面の接続案内を確認します。CPU相手でも計算や保存に通信を使う場合があり、完全なオフライン動作を前提にしないでください。進行中のオンライン対局は同じアカウント・ブラウザーで復帰を試し、表示された猶予時間に従ってください。復帰前にサイトデータを消すと端末内の状態を失う場合があります。解決しない場合はモード、発生時刻、表示されたエラーを添えて報告できます。', href: '/contact/', link: '不具合を報告する' },
      { id: 'save', question: '端末変更でサーキット進行や棋譜は引き継げますか？', answer: 'ログインした利用者のサーキット進行と外観選択には端末内保存とクラウド保存があります。端末変更前に設定の保存状態を確認し、新端末では同じアカウントを使ってください。通信に失敗した状態を保存完了とは扱わないでください。棋譜は直近10試合で、永続的な全対局保管ではありません。', href: '/terms/', link: '保存と利用条件を確認する' },
      { id: 'privacy', question: 'アカウント削除や個人情報の相談をしたいです', answer: '設定のアカウント削除では、本人確認と確認操作を経て削除を要求できます。ログインできない場合も問い合わせの経路があります。報告には画面のユーザーIDを使えますが、パスワードや認証コードを送らないでください。スクリーンショットは他の利用者の情報も隠します。', href: '/contact/', link: 'アカウントとデータの問い合わせ先を見る' },
    ],
  },
  en: {
    title: 'Your first game of Q-Gambit',
    intro: 'A Q-Gambit piece occupies one square while several identities may remain possible. You choose moves by reading those candidates and considering what your opponent learns. This guide connects the starting controls to short deduction exercises you can use in your next game.',
    contents: 'What you will learn',
    startTitle: '1. Start a guest practice game',
    hintHelp: 'QUBE hints are free in practice games and do not use tickets. Outside practice, each new hint uses one ticket. To use tickets, sign in to a registered account and accept the current terms. Showing the same retrieved result again does not use another ticket. Compare the source piece with the destination and try explaining which candidates disappear.',
    steps: [
      { title: 'Open the game and choose Guest', text: 'Use “Back to game”, then “Play as Guest” on the title screen. On your first visit, review the terms and privacy information. If you agree, continue to the lobby. Reading this guide or the rules requires neither account creation nor consent to play.' },
      { title: 'Try selecting a piece in the tutorial', text: 'Open “HOW TO PLAY” in the lobby to start the tutorial. Tap or click the instructed piece, then choose the indicated destination. Selecting a piece and choosing where it goes are separate actions. Read the explanation and watch the candidates change before continuing.' },
      { title: 'Choose your practice conditions', text: 'Open “PRACTICE” and choose difficulty, White (first) or Black (second), and time. Start with a weaker CPU, White and 10 minutes to leave room for reading candidates. The 10-minute and 3-minute modes give each player a total game clock; 10 seconds per move is a turn-by-turn limit.' },
      { title: 'Choose your piece and destination', text: 'On your turn, inspect the candidate icons and select your piece, then tap or click a displayed destination. Wait during the opponent’s turn. After your move, check other pieces too: a team-wide constraint can change their candidates without moving them.' },
    ],
    sections: [
      { id: 'candidates', title: '2. Read the candidate icons', paragraphs: [
        'Several small piece icons on a round piece show its remaining possible identities. A move can proceed when a remaining candidate can perform it. Candidates incompatible with that move are removed; when only one remains, the identity is revealed. The piece does not split across multiple squares.',
        'The information a move reveals depends on direction, distance and whether it captures. Distinguish a long diagonal move from a single diagonal step: a King can also move one square diagonally. A Pawn moves forward but captures diagonally; only a Knight jumps over intervening pieces. The rules page shows the movement diagrams.',
        'Movement candidates may shrink further because the whole side must fit its identity slots. The 16 starting pieces have one King, one Queen, two Rooks, two Bishops, two Knights and eight Pawns. Captured pieces remain part of that calculation. Counting only the pieces still on the board does not give the remaining identity slots.',
      ] },
      { id: 'decisions', title: '3. Keep information hidden or reveal an identity?', paragraphs: [
        'A piece with Bishop and Queen candidates can move diagonally or straight. A straight move removes Bishop and confirms Queen, but confirmation does not grant new movement. It tells your opponent where the Queen is and removes Queen candidates elsewhere on your side. Confirmation is not always an advantage: consider both the destination’s safety and the information you reveal.',
        'Before moving, ask: can an opposing piece capture on the destination, which candidates disappear, and does filling an identity slot affect another friendly piece? Do not infer an opposing piece’s attack range from its appearance alone. Read its remaining candidates and consider whether any of them can capture on that square.',
        'Keeping King candidates unresolved can matter, but it does not replace safety. A move that leaves your last living King candidate in check is not allowed. A confirmed King must also be protected. In CPU practice, examine one move at a time and see how threats change when candidates disappear.',
      ] },
      { id: 'outcomes', title: '4. Understand the finish and review your play', paragraphs: [
        'Capturing one piece with a King candidate does not always win. If another living King candidate remains, play continues; removing the final one ends the game. A confirmed King in check with no legal escape is checkmated. Having no legal move while not in check is a draw. Games can also end through time expiry or resignation.',
        'For your first practice, aim to explain one move that narrowed an identity, as well as trying to win. Saved games can be reviewed from the lobby’s replay list. It contains your latest 10 games, so review an interesting game soon. If a record is missing or a control is confusing, check the FAQ for the next step.',
      ] },
    ],
    practiceTitle: '5. Try three short deduction exercises',
    practiceIntro: 'These teaching examples use a White piece, an empty destination, no blockers, no en passant and no additional team-wide constraints. In an actual position, check the displayed candidates and legal destinations. Decide which candidates survive before opening each answer.',
    answerLabel: 'Show the answer and reason',
    exercises: [
      { question: 'Bishop, Rook and Queen remain. What happens after e4 → h7, three squares diagonally?', answer: 'Bishop and Queen remain. Rook cannot move diagonally, so it is removed. Distance matters as well as direction: this is not the King’s single-square step.' },
      { question: 'The same piece now has Bishop and Queen candidates. On its next turn it moves h7 → h5, two squares straight. What remains?', answer: 'Queen is confirmed. Bishop cannot move straight. Filling the side’s single Queen slot also affects Queen candidates on other pieces.' },
      { question: 'All six identities remain. What survives e4 → f5, one diagonal step to an empty square?', answer: 'King, Bishop and Queen remain. King can make a one-square diagonal move. Pawn cannot move diagonally to this empty square, and Rook and Knight cannot make this move. A capture or en passant position changes the conditions.' },
    ],
    chainTitle: '6. A move can reveal pieces that did not move',
    chainIntro: 'Extend exercise 2 into a teaching example for the whole side. Pieces A–E have the candidates below. When A moves straight from h7 to h5 without blockers and confirms Queen, B–E are also revealed without moving. Reading only the moved piece misses this chain of information.',
    chainFixed: 'The other eleven identities are known: one King, one Rook, one Bishop, one Knight and seven Pawns. That known Rook has already been captured, but its identity slot remains occupied. Count all sixteen starting pieces, including A–E.',
    chainCaption: 'Candidate changes caused by A’s straight move. This is a teaching diagram, not a recorded match or a diagram of board positions.',
    chainBefore: 'Before the move', chainAfter: 'After A moves straight',
    chainReasons: [
      'A loses Bishop, which cannot move straight, leaving Queen. There is only one Queen slot, so B loses Queen and becomes Rook.',
      'The captured Rook and B fill both Rook slots. C loses Rook and becomes Knight.',
      'The already known Knight and C fill both Knight slots. D loses Knight and becomes Pawn.',
      'The seven already known Pawns and D fill all eight Pawn slots. E loses Pawn and becomes Bishop.',
    ],
    chainTakeaway: 'In this example, revealing A tells your opponent the identities of four other pieces too. If you want to keep B–E unresolved, consider whether the straight move is worth revealing that information. Actual candidates and capture histories differ, so this chain will not happen every time. Make a habit of checking other pieces’ icons after a move.',
    faqTitle: 'Frequently asked questions and troubleshooting',
    faqIntro: 'Find the next step when starting, reading candidates or checking a connection or saved game. The guide and rules are available before sign-in. If the problem remains, use the contact instructions to report useful details.',
    faqs: [
      { id: 'guest', question: 'Can I try it without creating an account?', answer: 'Guests can use the tutorial and CPU practice. Choose Guest on the title screen and review the first-visit terms to enter the lobby. “HOW TO PLAY” opens the tutorial; “PRACTICE” opens CPU games. Ranked play and Crown Circuit require sign-in. Guest data stored on a device should not be treated as account-backed progress that can be restored on another device.', href: '/guide/#start', link: 'Read the starting steps' },
      { id: 'identity', question: 'Am I guessing a secretly fixed identity at random?', answer: 'The game narrows identities using the remaining candidates and piece-count constraints. Choose a move that a candidate can perform, and incompatible candidates are removed. You are not making a probability-based guess at an invisible answer. “Quantum” describes uncertainty as an inspiration, rather than a simulation of physical quantum phenomena.', href: '/guide/#candidates', link: 'Learn to read candidates' },
      { id: 'move', question: 'Why can’t my piece move to a square that seems possible?', answer: 'Check whose turn it is, whether it is your piece, whether a remaining candidate can make that move, and whether a blocker or friendly destination piece prevents it. Moves leaving your last possible King in check or contradicting the team’s identity slots are rejected. Pawn movement and captures differ too. Select the piece again and inspect its candidate icons and displayed destinations.', href: '/rules/', link: 'See movement diagrams and rules' },
      { id: 'win', question: 'I captured a King candidate. Why did play continue?', answer: 'Play continues when another living King candidate remains. Capturing the final candidate and checkmating a confirmed King are different finishes. Check the remaining candidates and result display rather than judging the outcome only by the appearance of the captured piece.', href: '/guide/#outcomes', link: 'Read about game outcomes' },
      { id: 'clock', question: 'How do 10 minutes, 3 minutes and 10 seconds per move differ?', answer: 'The 10-minute and 3-minute modes are your total game clock, which runs while you think. The 10-second mode limits each turn. Start with 10 minutes to practice reading candidates, then try shorter controls after becoming familiar with the interface.', href: '/guide/#start', link: 'Choose practice conditions' },
      { id: 'hints', question: 'Are QUBE hints free, and what should I look at?', answer: 'My hints show both the moving piece and its destination. In practice games, hints are free and do not consume tickets. Outside practice, retrieving each new hint uses one ticket. To use tickets, sign in to a registered account and accept the current terms. Showing the same retrieved result again does not consume another ticket. Check availability and your remaining tickets in the game interface. Look at the source piece as well as the destination, and let’s work out which candidates the move removes.', href: '/guide/#practice', link: 'Try deduction without a hint' },
      { id: 'connection', question: 'What if loading stalls or I lose connection during a game?', answer: 'Check your connection and the status shown in the game. CPU calculations and saving may also use a connection; do not assume everything works offline. For an ongoing online game, try returning with the same account and browser, and follow the displayed reconnection timer. Clearing site data before recovery can remove local state. If the problem remains, report the mode, approximate time and displayed error.', href: '/contact/', link: 'Report a problem' },
      { id: 'save', question: 'Will circuit progress and replays transfer to another device?', answer: 'Signed-in circuit progress and cosmetic selections use local and cloud storage. Check the saving status in Settings before changing devices and use the same account on the new device. A failed connection does not mean saving finished. The replay list contains the latest 10 games, rather than a permanent archive of every game.', href: '/terms/', link: 'Check saving and usage terms' },
      { id: 'privacy', question: 'How can I request account deletion or ask about personal data?', answer: 'Account deletion in Settings uses identity verification and a confirmation step. Contact support if you cannot sign in. You can include the user ID displayed in the interface, but never send passwords or sign-in codes. Hide other players’ personal information in screenshots too.', href: '/contact/', link: 'Find account and data support' },
    ],
  },
};
