import type { Language } from './dict';

// About has its own editorial purpose; do not repeat the homepage introduction.
type AboutContent = readonly [intro: string, example: string, modes: string, circuit: string];
export const aboutContent: Record<Language, AboutContent> = {
  ja: [
    'Q-Gambitは、チェスの移動規則に「まだ見えていない情報を読む」という判断を重ねた対戦ゲームです。良いマスを取るだけでなく、一手で相手に何を知らせ、何を隠すかを考えます。量子という表現は不確定な候補の着想を表し、実際の量子現象を計算するシミュレーターではありません。',
    'ビショップ・ルーク・クイーンだけが候補の駒を考えてみましょう。空いた斜めの道を進むとルークが外れます。その後、縦か横に進めばビショップも外れ、クイーンと分かります。これは移動による絞り込みの説明例です。実際の対局では駒数の制約が盤全体に伝わり、それより早く候補が確定する場合もあります。',
    '初めてならチュートリアルで駒と移動先の選び方を確認し、CPU練習で先手・後手や強さを選んで試してください。ヒントは動かす駒と行き先を示します。オンラインでは他のプレイヤーと対戦でき、棋譜で自分の直近10試合を振り返れます。候補を一つずつ読みながら、一手でどの情報が変わったかを確かめるのが上達の近道です。',
    'ログインして挑む100ステージのソロモードです。10分、3分、1手10秒の順に進み、3ステージごとにCPUが強くなります。勝利で得た盤・駒・勝利エフェクト・アイコン装飾・対局BGMは設定で選択します。BGMは鑑賞専用ではなく対局中に流れる曲。見た目や音楽の報酬で駒の移動規則や強さが変わることはありません。',
  ],
  en: [
    'Q-Gambit combines chess movement with decisions about incomplete information. A good move is not only about the square you occupy: it also changes what your opponent can infer. “Quantum” describes the idea of unresolved candidates, not a simulation of physical quantum phenomena.',
    'Consider a piece with only bishop, rook and queen candidates. A diagonal move along a clear path rules out rook. A later straight move rules out bishop, leaving queen. This illustrates movement-based deduction; in a real match, team-wide piece-count constraints can resolve candidates earlier.',
    'Start with the tutorial, then choose your side and CPU strength in practice. Hints show both the piece and its destination. Online play lets you face other players; replays let you revisit your latest 10 matches. Track which candidates change after each move to understand the position.',
    'Crown Circuit is a 100-stage solo mode that requires sign-in. Stages cycle through 10 minutes, 3 minutes and 10 seconds per move, with a stronger CPU every three stages. Select earned boards, pieces, victory effects, avatar decorations and battle music in Settings. Music plays during matches; cosmetic rewards do not change movement rules or playing strength.',
  ],
  zh: [
    'Q-Gambit把国际象棋的走法与不完整信息下的判断结合起来。好的一步不仅取决于占据哪个格子，还取决于向对手透露了什么。“量子”指尚未确定的候选身份这一灵感，而不是对真实量子现象的模拟。',
    '假设一枚棋子只有象、车和后三种候选。沿畅通的斜线移动会排除车；之后直行会排除象，只剩后。这是根据走法推理的示例。在实际对局中，全队棋子数量的约束也可能更早确定身份。',
    '先用教程学习选择棋子和目标格，再在CPU练习中选择先后手和强度。提示会同时指出棋子与目的地。在线模式可与其他玩家对战，棋谱可回顾最近10局。观察每一步改变了哪些候选，有助于理解局面。',
    '皇冠巡回赛是需要登录的100关单人模式。依次采用10分钟、3分钟、每步10秒，每三关提升CPU强度。获得的棋盘、棋子、胜利特效、头像装饰和对局音乐可在设置中选择。音乐会在对局中播放；外观奖励不会改变走法或棋力。',
  ],
  ru: [
    'Q-Gambit сочетает шахматные ходы с решениями при неполной информации. Важно не только занять клетку, но и понять, что ваш ход раскрывает сопернику. «Квантовый» означает идею неопределённых вариантов, а не симуляцию физических явлений.',
    'Допустим, фигура может быть слоном, ладьёй или ферзём. Ход по свободной диагонали исключает ладью. Последующий ход по прямой исключает слона, оставляя ферзя. Это пример вывода по ходам; ограничения на число фигур всей стороны могут определить тип раньше.',
    'Начните с обучения, затем выберите сторону и силу CPU в тренировке. Подсказка показывает фигуру и клетку назначения. В сети можно играть с другими людьми, а в повторах — изучать последние 10 партий. Следите, как каждый ход меняет наборы вариантов.',
    'Crown Circuit — 100 одиночных этапов с входом в аккаунт. Режимы времени: 10 минут, 3 минуты, 10 секунд на ход; каждые три этапа CPU усиливается. Полученные доски, фигуры, эффекты победы, украшения аватара и музыку для партий выбирают в настройках. Музыка звучит во время игры, а оформление не меняет правила или силу фигур.',
  ],
  fr: [
    'Q-Gambit associe les déplacements des échecs aux décisions prises avec des informations incomplètes. Un coup compte autant pour sa case que pour ce qu’il révèle à l’adversaire. « Quantique » évoque des identités encore possibles, sans simuler de phénomènes physiques.',
    'Imaginez une pièce pouvant être un fou, une tour ou une dame. Un déplacement diagonal libre élimine la tour. Un déplacement ultérieur en ligne droite élimine le fou : il reste la dame. Cet exemple illustre la déduction par les coups ; les contraintes sur le nombre de pièces peuvent résoudre l’identité plus tôt.',
    'Commencez par le tutoriel, puis choisissez votre camp et la force du CPU en entraînement. Les indices montrent la pièce et sa destination. Jouez en ligne et revoyez vos 10 dernières parties. Observez les possibilités modifiées après chaque coup pour comprendre la position.',
    'Crown Circuit propose 100 étapes solo après connexion. Les cadences alternent entre 10 minutes, 3 minutes et 10 secondes par coup ; le CPU devient plus fort tous les trois niveaux. Choisissez vos plateaux, pièces, effets, décorations d’avatar et musiques gagnés dans les paramètres. La musique accompagne les parties ; ces récompenses ne modifient ni les déplacements ni la force des pièces.',
  ],
  de: [
    'Q-Gambit verbindet Schachzüge mit Entscheidungen unter unvollständiger Information. Ein guter Zug betrifft nicht nur das Zielfeld, sondern auch das Wissen des Gegners. „Quantum“ steht für noch offene Identitäten, nicht für eine Simulation physikalischer Quantenphänomene.',
    'Eine Figur könnte Läufer, Turm oder Dame sein. Ein freier Diagonalzug schließt den Turm aus. Ein späterer gerader Zug schließt den Läufer aus: Die Dame bleibt. Das ist ein Beispiel für Schlussfolgerungen aus Zügen; die Figurenanzahl einer Seite kann die Identität schon vorher klären.',
    'Beginne mit dem Tutorial und wähle danach im Training Seite und CPU-Stärke. Hinweise zeigen Figur und Zielfeld. Spiele online gegen andere und sieh dir deine letzten 10 Partien erneut an. Achte darauf, welche Möglichkeiten sich mit jedem Zug ändern.',
    'Crown Circuit bietet nach der Anmeldung 100 Solo-Etappen. Die Zeiten wechseln zwischen 10 Minuten, 3 Minuten und 10 Sekunden pro Zug; alle drei Etappen wird die CPU stärker. Erhaltene Bretter, Figuren, Siegeffekte, Avatar-Dekorationen und Partiemusik wählst du in den Einstellungen. Die Musik läuft während der Partie; kosmetische Belohnungen verändern keine Zugregeln oder Spielstärke.',
  ],
  es: [
    'Q-Gambit combina los movimientos del ajedrez con decisiones basadas en información incompleta. Un buen movimiento también depende de lo que revela al rival. «Cuántico» alude a identidades todavía posibles, no a una simulación de fenómenos físicos.',
    'Imagina una pieza que solo puede ser alfil, torre o reina. Un movimiento diagonal por un camino libre descarta la torre. Un movimiento recto posterior descarta el alfil: queda la reina. Es un ejemplo de deducción por movimientos; las restricciones sobre la cantidad de piezas pueden resolver la identidad antes.',
    'Empieza por el tutorial y elige después tu lado y la fuerza de la CPU en práctica. Las pistas muestran la pieza y su destino. Juega en línea y revisa tus últimas 10 partidas. Observa qué posibilidades cambian tras cada movimiento para comprender la posición.',
    'Crown Circuit ofrece 100 etapas individuales tras iniciar sesión. Alterna 10 minutos, 3 minutos y 10 segundos por movimiento; la CPU se refuerza cada tres etapas. Elige tableros, piezas, efectos, adornos de avatar y música obtenidos en ajustes. La música suena durante las partidas; las recompensas cosméticas no cambian las reglas ni la fuerza de las piezas.',
  ],
  tr: [
    'Q-Gambit, satranç hareketlerini eksik bilgiyle karar vermeyle birleştirir. İyi bir hamle yalnızca kareyi değil, rakibin ne öğrenebileceğini de değiştirir. “Kuantum”, belirsiz aday kimlikler fikridir; fiziksel kuantum olaylarının simülasyonu değildir.',
    'Yalnızca fil, kale veya vezir olabilen bir taş düşünün. Açık bir çapraz yoldaki hamle kaleyi eler. Daha sonraki düz hamle fili eler ve vezir kalır. Bu, hamlelerle çıkarım örneğidir; takımın taş sayısı kısıtları kimliği daha erken de belirleyebilir.',
    'Öğreticiyle başlayın; antrenmanda tarafınızı ve CPU gücünü seçin. İpuçları taşı ve hedef kareyi gösterir. Çevrimiçi rakiplerle oynayın, son 10 maçınızı tekrar izleyin. Her hamlenin hangi adayları değiştirdiğini takip edin.',
    'Crown Circuit, giriş gerektiren 100 aşamalı tek oyunculu moddur. Süreler 10 dakika, 3 dakika ve hamle başına 10 saniye olarak döner; CPU her üç aşamada güçlenir. Kazanılan tahta, taş, zafer efekti, avatar süsü ve maç müziğini ayarlardan seçin. Müzik maçta çalar; görsel ödüller hareket kurallarını veya oyun gücünü değiştirmez.',
  ],
  pl: [
    'Q-Gambit łączy ruchy szachowe z decyzjami przy niepełnej informacji. Dobry ruch zmienia nie tylko pole, lecz także wiedzę przeciwnika. „Kwantowy” oznacza pomysł nierozstrzygniętych tożsamości, a nie symulację zjawisk fizycznych.',
    'Wyobraź sobie figurę, która może być gońcem, wieżą lub hetmanem. Ruch po wolnej przekątnej wyklucza wieżę. Późniejszy ruch w linii prostej wyklucza gońca: zostaje hetman. To przykład wnioskowania z ruchów; ograniczenia liczby figur mogą rozstrzygnąć tożsamość wcześniej.',
    'Zacznij od samouczka, a w treningu wybierz stronę i siłę CPU. Podpowiedź wskazuje figurę oraz pole docelowe. Graj online i oglądaj powtórki ostatnich 10 partii. Śledź, które możliwości zmieniają się po każdym ruchu.',
    'Crown Circuit to 100 etapów solo wymagających logowania. Tempo zmienia się kolejno: 10 minut, 3 minuty, 10 sekund na ruch; co trzy etapy CPU staje się silniejszy. Zdobyte plansze, figury, efekty zwycięstwa, ozdoby awatara i muzykę wybierzesz w ustawieniach. Muzyka gra podczas partii, a nagrody kosmetyczne nie zmieniają zasad ani siły figur.',
  ],
  hi: [
    'Q-Gambit शतरंज की चालों को अधूरी जानकारी के आधार पर निर्णय लेने से जोड़ता है। अच्छी चाल में केवल खाना चुनना नहीं, यह सोचना भी शामिल है कि प्रतिद्वंद्वी क्या जान पाएगा। “क्वांटम” अनिश्चित पहचान की प्रेरणा है, वास्तविक भौतिक घटनाओं का सिमुलेशन नहीं।',
    'मान लें कोई मोहरा केवल ऊँट, हाथी या रानी हो सकता है। खाली विकर्ण पर चलने से हाथी का विकल्प हटता है। बाद में सीधी चाल से ऊँट भी हटता है और रानी बचती है। यह चालों से पहचान निकालने का उदाहरण है; पूरी टीम में मोहरों की संख्या की शर्तें पहचान पहले भी तय कर सकती हैं।',
    'ट्यूटोरियल से शुरू करें, फिर अभ्यास में अपना पक्ष और CPU की ताकत चुनें। संकेत मोहरा और गंतव्य दोनों दिखाते हैं। ऑनलाइन खेलें और पिछली 10 बाज़ियों की रीप्ले देखें। हर चाल के बाद कौन-से विकल्प बदलते हैं, इस पर ध्यान दें।',
    'क्राउन सर्किट लॉगिन के बाद उपलब्ध 100 चरणों का एकल मोड है। 10 मिनट, 3 मिनट और प्रति चाल 10 सेकंड का क्रम चलता है; हर तीन चरणों के बाद CPU मजबूत होता है। अर्जित बोर्ड, मोहरे, विजय प्रभाव, अवतार सजावट और मैच संगीत सेटिंग में चुनें। संगीत बाज़ी के दौरान बजता है; सजावटी पुरस्कार चालों के नियम या मोहरों की ताकत नहीं बदलते।',
  ],
  pt: [
    'Q-Gambit combina movimentos de xadrez com decisões baseadas em informação incompleta. Uma boa jogada também muda o que o adversário consegue deduzir. “Quântico” representa identidades ainda possíveis, não uma simulação de fenômenos físicos.',
    'Imagine uma peça que só pode ser bispo, torre ou rainha. Um movimento diagonal por um caminho livre elimina a torre. Um movimento reto posterior elimina o bispo: resta a rainha. É um exemplo de dedução por movimentos; os limites de quantidade das peças podem resolver a identidade antes.',
    'Comece pelo tutorial e depois escolha seu lado e a força da CPU no treino. As dicas mostram a peça e o destino. Jogue online e reveja suas últimas 10 partidas. Observe quais possibilidades mudam a cada jogada para entender a posição.',
    'Crown Circuit oferece 100 etapas solo após o login. Os tempos alternam entre 10 minutos, 3 minutos e 10 segundos por jogada; a CPU fica mais forte a cada três etapas. Escolha tabuleiros, peças, efeitos, adornos de avatar e músicas obtidos nas configurações. A música toca durante a partida; as recompensas cosméticas não alteram regras ou força das peças.',
  ],
  ta: [
    'Q-Gambit சதுரங்க நகர்வுகளை முழுமையற்ற தகவலின் அடிப்படையிலான முடிவுகளுடன் இணைக்கிறது. நல்ல நகர்வு என்பது கட்டத்தைத் தேர்ந்தெடுப்பது மட்டுமல்ல; எதிராளி எதை அறியலாம் என்பதையும் மாற்றுகிறது. “குவாண்டம்” என்பது உறுதியாகாத அடையாளங்களின் கருத்து; உண்மையான இயற்பியல் நிகழ்வுகளின் உருவகப்படுத்தல் அல்ல.',
    'ஒரு காய் பிஷப், ரூக் அல்லது குயினாக மட்டுமே இருக்கலாம் என நினையுங்கள். தடையற்ற குறுக்குவழி நகர்வு ரூக்கை நீக்கும். பின்னர் நேரான நகர்வு பிஷப்பையும் நீக்கி குயினை மட்டும் விடும். இது நகர்வுகளிலிருந்து அறியும் எடுத்துக்காட்டு; அணியின் காய் எண்ணிக்கைக் கட்டுப்பாடுகள் அடையாளத்தை முன்னரே உறுதிசெய்யலாம்.',
    'பயிற்சி வழிகாட்டியுடன் தொடங்கி, CPU பயிற்சியில் உங்கள் பக்கத்தையும் வலிமையையும் தேர்ந்தெடுக்கவும். குறிப்புகள் காயையும் செல்லும் கட்டத்தையும் காட்டும். இணையத்தில் விளையாடி, கடைசி 10 ஆட்டங்களை மீண்டும் பார்க்கலாம். ஒவ்வொரு நகர்வும் எந்தச் சாத்தியங்களை மாற்றுகிறது என்பதைக் கவனிக்கவும்.',
    'கிரவுன் சர்க்யூட் உள்நுழைவு தேவைப்படும் 100 நிலை தனிநபர் முறை. 10 நிமிடம், 3 நிமிடம், நகர்வுக்கு 10 வினாடி என மாறும்; ஒவ்வொரு மூன்று நிலைக்கும் CPU வலுவாகும். பெற்ற பலகை, காய், வெற்றி விளைவு, அவதார் அலங்காரம், ஆட்ட இசையை அமைப்புகளில் தேர்ந்தெடுக்கவும். இசை ஆட்டத்தின்போது ஒலிக்கும்; அலங்காரப் பரிசுகள் நகர்வு விதிகளையோ காய்களின் வலிமையையோ மாற்றாது.',
  ],
};
