import type {Language} from './dict';
const labels:Record<Language,readonly string[]>={
  "en": [
    "About Q-Gambit",
    "Contact",
    "Developer notes",
    "How it works",
    "Crown Circuit",
    "Help & feedback",
    "Back to game",
    "Example",
    "QUBE is the development diary character. Notes may describe local prototypes; they are not a list of features already released."
  ],
  "ja": [
    "Q-Gambitについて",
    "お問い合わせ",
    "開発ノート",
    "遊び方の基本",
    "クラウン・サーキット",
    "ヘルプ・不具合報告",
    "ゲームへ戻る",
    "具体例",
    "QUBEは開発日記のキャラクターです。試作についての投稿も含むため、すべてが公開済みの機能ではありません。"
  ],
  "zh": [
    "关于Q-Gambit",
    "联系我们",
    "开发日志",
    "基本玩法",
    "皇冠巡回赛",
    "帮助与反馈",
    "返回游戏",
    "示例",
    "QUBE是开发日志角色。日志可能介绍本地原型，不代表功能均已上线。"
  ],
  "ru": [
    "О Q-Gambit",
    "Связаться",
    "Дневник разработки",
    "Основы игры",
    "Crown Circuit",
    "Помощь и отзывы",
    "Вернуться к игре",
    "Пример",
    "QUBE — персонаж дневника разработки. Записи о прототипах не означают, что функции уже выпущены."
  ],
  "fr": [
    "À propos de Q-Gambit",
    "Contact",
    "Journal de développement",
    "Principes du jeu",
    "Crown Circuit",
    "Aide et retours",
    "Retour au jeu",
    "Exemple",
    "QUBE est le personnage du journal. Les notes sur des prototypes ne décrivent pas nécessairement des fonctions publiées."
  ],
  "de": [
    "Über Q-Gambit",
    "Kontakt",
    "Entwicklungsnotizen",
    "Spielprinzip",
    "Crown Circuit",
    "Hilfe und Feedback",
    "Zurück zum Spiel",
    "Beispiel",
    "QUBE ist die Figur des Entwicklungstagebuchs. Notizen zu Prototypen bedeuten nicht, dass diese Funktionen veröffentlicht sind."
  ],
  "es": [
    "Acerca de Q-Gambit",
    "Contacto",
    "Diario de desarrollo",
    "Cómo funciona",
    "Crown Circuit",
    "Ayuda y comentarios",
    "Volver al juego",
    "Ejemplo",
    "QUBE es el personaje del diario de desarrollo. Las notas sobre prototipos no significan que esas funciones estén publicadas."
  ],
  "tr": [
    "Q-Gambit hakkında",
    "İletişim",
    "Geliştirme notları",
    "Oyun temelleri",
    "Crown Circuit",
    "Yardım ve geri bildirim",
    "Oyuna dön",
    "Örnek",
    "QUBE geliştirme günlüğünün karakteridir. Prototip notları tüm özelliklerin yayımlandığı anlamına gelmez."
  ],
  "pl": [
    "O Q-Gambit",
    "Kontakt",
    "Dziennik rozwoju",
    "Zasady gry",
    "Crown Circuit",
    "Pomoc i opinie",
    "Powrót do gry",
    "Przykład",
    "QUBE to postać dziennika rozwoju. Wpisy o prototypach nie oznaczają, że opisane funkcje zostały wydane."
  ],
  "hi": [
    "Q-Gambit के बारे में",
    "संपर्क",
    "विकास डायरी",
    "खेल की मूल बातें",
    "क्राउन सर्किट",
    "मदद और सुझाव",
    "खेल पर लौटें",
    "उदाहरण",
    "QUBE विकास डायरी का पात्र है। प्रोटोटाइप की जानकारी का अर्थ यह नहीं कि सभी सुविधाएँ जारी हो चुकी हैं।"
  ],
  "pt": [
    "Sobre Q-Gambit",
    "Contato",
    "Diário de desenvolvimento",
    "Como funciona",
    "Crown Circuit",
    "Ajuda e comentários",
    "Voltar ao jogo",
    "Exemplo",
    "QUBE é o personagem do diário de desenvolvimento. Notas sobre protótipos não significam que as funções já foram publicadas."
  ],
  "ta": [
    "Q-Gambit பற்றி",
    "தொடர்பு",
    "மேம்பாட்டுக் குறிப்புகள்",
    "ஆட்டத்தின் அடிப்படை",
    "கிரவுன் சர்க்யூட்",
    "உதவி மற்றும் கருத்துகள்",
    "ஆட்டத்திற்குத் திரும்பு",
    "எடுத்துக்காட்டு",
    "QUBE மேம்பாட்டுப் பதிவின் கதாபாத்திரம். முன்மாதிரிக் குறிப்புகளில் உள்ள அம்சங்கள் அனைத்தும் வெளியிடப்பட்டவை அல்ல."
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
