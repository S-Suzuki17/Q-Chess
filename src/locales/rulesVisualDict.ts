import type { Language } from './dict';

export type RulesVisualCopy = {
    movementTitle: string;
    movementHelp: string;
    pawnHelp: string;
    specialMoves: string;
    limitsTitle: string;
    limitsHelp: string;
    deductionTitle: string;
    deductionHelp: string;
    chainHelp: string;
    outcomeTitle: string;
    chessContrast: string;
    captureLabel: string;
    captureHelp: string;
    mateLabel: string;
    mateHelp: string;
    names: [string, string, string, string, string, string];
};

// Names follow the order King, Queen, Rook, Bishop, Knight, Pawn.
export const rulesVisualDict: Record<Language, RulesVisualCopy> = {
    en: {
        movementTitle: 'How each piece moves',
        movementHelp: 'The piece starts at the center. Gold squares are possible destinations on an empty board. Sliding pieces stop at blockers; only the Knight jumps over them.',
        pawnHelp: 'The Pawn diagram shows White moving upward. It moves forward one square, or two from its starting row; it captures one square diagonally forward (×). Black moves in the opposite direction.',
        specialMoves: 'The diagrams show ordinary moves. Castling, en passant and promotion require additional conditions.',
        limitsTitle: 'Identity slots per side (16 pieces)',
        limitsHelp: 'These are identity limits for the 16 starting pieces, not the number still on the board. Captured pieces remain part of the identity-constraint calculation.',
        deductionTitle: 'One move can eliminate candidates',
        deductionHelp: 'On an open board, e4 → h7 is three squares diagonally: Bishop or Queen remain. A later h7 → h5 is two squares straight: only Queen remains.',
        chainHelp: 'Because each side has just one Queen slot, a second piece with only Rook or Queen left then becomes a Rook without moving.',
        outcomeTitle: 'King capture and checkmate are different finishes',
        chessContrast: 'In ordinary chess the King is not physically captured: checkmate ends the game. In Q-Gambit, capturing the last living King candidate or checkmating a confirmed King can end it.',
        captureLabel: 'Capture the last King candidate',
        captureHelp: 'Schematic: ? is a hidden opposing piece that may be the last living King candidate. If capturing it leaves no such candidate, the game ends; if others remain, play continues.',
        mateLabel: 'Checkmate a confirmed King',
        mateHelp: 'A confirmed King also loses when it is attacked and no legal move can escape. In this simplified position, the two white Rooks cover a8, a7 and b8.',
        names: ['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'],
    },
    ja: {
        movementTitle: '駒種ごとの移動図',
        movementHelp: '中央が駒の位置。金色が空き盤で移動できるマスです。遠くへ進む駒は途中に駒があると止まり、ナイトだけが飛び越えられます。',
        pawnHelp: 'ポーンの図は白側が上へ進む向きです。前に1マス、初期位置なら2マス進めます。斜め前の×は相手の駒を取るマス。黒側は逆向きです。',
        specialMoves: '図は通常の移動です。キャスリング、アンパッサン、プロモーションには別の条件があります。',
        limitsTitle: '片側16個の正体枠',
        limitsHelp: '開始時の16個の駒に対する正体の上限で、盤上の残数ではありません。取られた駒も正体の制約計算に含まれます。',
        deductionTitle: '動きから候補を消す',
        deductionHelp: '障害物のない盤で e4→h7 と斜めに3マス進むと、ビショップかクイーンが残ります。次に h7→h5 と縦に2マス進むと、クイーンだけになります。',
        chainHelp: '片側のクイーン枠は1個。別の駒の候補が「ルーク／クイーン」だけなら、クイーン確定により、その駒は動かなくてもルークに確定します。',
        outcomeTitle: 'キング捕獲とチェックメイトの違い',
        chessContrast: '通常のチェスではキングを実際には取らず、チェックメイトで決着します。Q-Gambitでは、生きた最後のキング候補の捕獲、または確定キングへのチェックメイトでも決着します。',
        captureLabel: '最後のキング候補を取る',
        captureHelp: '概念図です。? は正体が隠れた相手の駒で、生きた最後のキング候補かもしれません。取った後に候補がゼロなら決着し、ほかに残れば続きます。',
        mateLabel: '確定キングを詰ませる',
        mateHelp: '正体が確定したキングに王手がかかり、合法的な逃げ道がなければチェックメイトです。図では白のルーク2個が a8・a7・b8 を押さえています。',
        names: ['キング', 'クイーン', 'ルーク', 'ビショップ', 'ナイト', 'ポーン'],
    },
    zh: {
        movementTitle: '各棋子的走法', movementHelp: '棋子位于中央。金色格是空棋盘上的可走位置。长距离棋子遇到阻挡会停下；只有马能跳过棋子。',
        pawnHelp: '兵图以白方朝上为例：向前一步，起始行可走两步；斜前方的×用于吃子。黑方方向相反。',
        specialMoves: '图中展示普通走法；王车易位、吃过路兵和升变另有条件。',
        limitsTitle: '每方16枚棋子的身份名额', limitsHelp: '这是开局16枚棋子的身份限制，并非当前在棋盘上的数量。被吃掉的棋子仍参与身份约束的计算。',
        deductionTitle: '移动会排除身份候选', deductionHelp: '在无阻挡的棋盘上，e4→h7 斜走三格后只剩象或后；再从 h7→h5 直走两格后只剩后。',
        chainHelp: '每方只有一个后的名额。若另一枚棋子只可能是车或后，当这枚棋子确定为后时，另一枚无需移动也会确定为车。',
        outcomeTitle: '吃王与将死的区别', chessContrast: '普通国际象棋不会实际吃掉王，而是以将死结束。在 Q-Gambit 中，吃掉最后一个存活的王候选，或将死已确定身份的王，都可以结束对局。', captureLabel: '吃掉最后一个王候选', captureHelp: '示意图：? 是身份未公开的对方棋子，可能是最后一个存活的王候选。吃掉后若没有其他王候选，对局结束；若还有则继续。',
        mateLabel: '将死已确定的王', mateHelp: '已确定身份的王被攻击且没有合法解围走法时也会输。图中白方两辆车控制 a8、a7 和 b8。',
        names: ['王', '后', '车', '象', '马', '兵'],
    },
    ru: {
        movementTitle: 'Как ходят фигуры', movementHelp: 'Фигура стоит в центре. Золотые клетки доступны на пустой доске. Дальнобойные фигуры останавливаются перед препятствием; только конь перепрыгивает фигуры.',
        pawnHelp: 'Пешка показана для белых, которые идут вверх: одна клетка вперёд или две с начальной линии; × — взятие по диагонали. Чёрные идут в обратном направлении.',
        specialMoves: 'На схемах показаны обычные ходы. Рокировка, взятие на проходе и превращение требуют особых условий.',
        limitsTitle: 'Лимиты типов на сторону (16 фигур)', limitsHelp: 'Это ограничения идентичности для 16 начальных фигур, а не число оставшихся на доске. Взятые фигуры по-прежнему учитываются при расчёте ограничений.',
        deductionTitle: 'Ход исключает возможные типы', deductionHelp: 'На свободной доске e4→h7 по диагонали на три клетки оставляет слона или ферзя. Затем h7→h5 прямо на две клетки оставляет только ферзя.',
        chainHelp: 'У каждой стороны только один ферзь. Если другая фигура могла быть лишь ладьёй или ферзём, она становится ладьёй, даже не двигаясь.',
        outcomeTitle: 'Взятие короля и мат', chessContrast: 'В обычных шахматах короля не берут: партия завершается матом. В Q-Gambit победу также приносит взятие последнего живого кандидата в короли или мат раскрытому королю.', captureLabel: 'Взять последнего кандидата в короли', captureHelp: 'Условная схема: ? — скрытая фигура соперника, которая может быть последним живым кандидатом в короли. Если после её взятия других кандидатов нет, партия окончена; иначе она продолжается.',
        mateLabel: 'Мат раскрытому королю', mateHelp: 'Раскрытый король проигрывает и при угрозе без законного спасения. На схеме две белые ладьи контролируют a8, a7 и b8.',
        names: ['Король', 'Ферзь', 'Ладья', 'Слон', 'Конь', 'Пешка'],
    },
    fr: {
        movementTitle: 'Déplacements des pièces', movementHelp: 'La pièce est au centre. Les cases dorées sont accessibles sur un échiquier vide. Les pièces à longue portée s’arrêtent devant un obstacle ; seul le cavalier saute par-dessus.',
        pawnHelp: 'Le pion blanc avance vers le haut : une case, ou deux depuis sa rangée initiale. × indique la prise en diagonale. Le pion noir avance dans l’autre sens.',
        specialMoves: 'Les schémas montrent les coups ordinaires. Roque, prise en passant et promotion ont des conditions supplémentaires.',
        limitsTitle: 'Quotas par camp (16 pièces)', limitsHelp: 'Ces limites d’identité concernent les 16 pièces initiales, pas seulement celles encore sur l’échiquier. Les pièces capturées restent prises en compte dans le calcul des contraintes.',
        deductionTitle: 'Un coup élimine des possibilités', deductionHelp: 'Sur un échiquier dégagé, e4→h7 en diagonale sur trois cases laisse fou ou dame. Puis h7→h5 sur deux cases en ligne droite ne laisse que la dame.',
        chainHelp: 'Chaque camp ne possède qu’une place de dame. Une autre pièce qui ne peut être que tour ou dame devient donc tour, même sans bouger.',
        outcomeTitle: 'Prise du roi et échec et mat', chessContrast: 'Aux échecs classiques, on ne capture pas réellement le roi : la partie s’achève par échec et mat. Dans Q-Gambit, capturer le dernier candidat roi vivant ou mater un roi révélé peut aussi conclure la partie.', captureLabel: 'Prendre le dernier roi possible', captureHelp: 'Schéma de principe : ? est une pièce adverse cachée qui peut être le dernier candidat roi vivant. Si sa prise n’en laisse aucun autre, la partie finit ; sinon elle continue.',
        mateLabel: 'Mater un roi révélé', mateHelp: 'Un roi révélé perd aussi s’il est attaqué sans coup légal pour s’échapper. Ici, les deux tours blanches couvrent a8, a7 et b8.',
        names: ['Roi', 'Dame', 'Tour', 'Fou', 'Cavalier', 'Pion'],
    },
    de: {
        movementTitle: 'Züge der Figuren', movementHelp: 'Die Figur steht in der Mitte. Goldene Felder sind auf leerem Brett erreichbar. Langzügige Figuren stoppen vor Hindernissen; nur der Springer kann darüber springen.',
        pawnHelp: 'Der weiße Bauer zieht hier nach oben: ein Feld vorwärts, vom Startfeld auch zwei. × zeigt das Schlagen schräg nach vorn. Schwarz zieht umgekehrt.',
        specialMoves: 'Die Diagramme zeigen normale Züge. Rochade, En passant und Umwandlung haben zusätzliche Bedingungen.',
        limitsTitle: 'Figurenplätze pro Seite (16)', limitsHelp: 'Diese Identitätsgrenzen gelten für die 16 Startfiguren, nicht nur für die verbliebenen Brettfiguren. Geschlagene Figuren bleiben bei der Berechnung der Identitätsregeln berücksichtigt.',
        deductionTitle: 'Ein Zug schließt Möglichkeiten aus', deductionHelp: 'Auf freiem Brett bleiben nach e4→h7 über drei Diagonalfelder Läufer oder Dame. Nach h7→h5 über zwei gerade Felder bleibt nur die Dame.',
        chainHelp: 'Jede Seite hat nur einen Damenplatz. Eine andere Figur mit den Möglichkeiten Turm oder Dame wird daher ohne eigenen Zug zum Turm.',
        outcomeTitle: 'König schlagen oder mattsetzen', chessContrast: 'Im normalen Schach wird der König nicht tatsächlich geschlagen; Matt beendet die Partie. In Q-Gambit kann auch das Schlagen des letzten lebenden Königskandidaten oder ein Matt des bestätigten Königs die Partie beenden.', captureLabel: 'Letzten Königskandidaten schlagen', captureHelp: 'Schematische Darstellung: ? ist eine verdeckte gegnerische Figur, die der letzte lebende Königskandidat sein könnte. Bleibt nach ihrem Schlag kein Kandidat, endet die Partie; sonst geht sie weiter.',
        mateLabel: 'Bestätigten König mattsetzen', mateHelp: 'Ein bestätigter König verliert auch bei Angriff ohne legalen Ausweg. Hier decken die zwei weißen Türme a8, a7 und b8.',
        names: ['König', 'Dame', 'Turm', 'Läufer', 'Springer', 'Bauer'],
    },
    es: {
        movementTitle: 'Movimiento de cada pieza', movementHelp: 'La pieza está en el centro. Las casillas doradas son destinos posibles en un tablero vacío. Las piezas deslizantes se detienen ante obstáculos; solo el caballo salta.',
        pawnHelp: 'El peón blanco avanza hacia arriba: una casilla, o dos desde su fila inicial. × marca la captura diagonal. El negro avanza en sentido contrario.',
        specialMoves: 'Los diagramas muestran movimientos normales. El enroque, la captura al paso y la promoción tienen condiciones adicionales.',
        limitsTitle: 'Cupos por bando (16 piezas)', limitsHelp: 'Estos límites de identidad corresponden a las 16 piezas iniciales, no solo a las que quedan en el tablero. Las piezas capturadas siguen incluidas en el cálculo de restricciones.',
        deductionTitle: 'Una jugada elimina candidatos', deductionHelp: 'En un tablero libre, e4→h7 son tres casillas diagonales: quedan alfil o dama. Después, h7→h5 son dos casillas rectas: solo queda dama.',
        chainHelp: 'Cada bando tiene un solo cupo de dama. Otra pieza que solo podía ser torre o dama se convierte en torre sin moverse.',
        outcomeTitle: 'Captura del rey y jaque mate', chessContrast: 'En el ajedrez normal no se captura físicamente al rey: el jaque mate acaba la partida. En Q-Gambit también puede terminar al capturar al último candidato vivo a rey o dar mate a un rey confirmado.', captureLabel: 'Capturar al último candidato a rey', captureHelp: 'Esquema: ? es una pieza rival oculta que podría ser el último candidato vivo a rey. Si al capturarla no queda otro candidato, termina la partida; si queda alguno, continúa.',
        mateLabel: 'Dar mate a un rey confirmado', mateHelp: 'Un rey confirmado también pierde si está atacado y no hay jugada legal para escapar. Aquí las dos torres blancas cubren a8, a7 y b8.',
        names: ['Rey', 'Dama', 'Torre', 'Alfil', 'Caballo', 'Peón'],
    },
    tr: {
        movementTitle: 'Taşlar nasıl hareket eder', movementHelp: 'Taş ortadadır. Altın kareler boş tahtadaki olası hedeflerdir. Uzun menzilli taşlar engelde durur; yalnızca at taşların üzerinden atlar.',
        pawnHelp: 'Beyaz piyon yukarı ilerler: bir kare, başlangıç sırasından iki kare. × çapraz öne alma karesidir. Siyah ters yöne ilerler.',
        specialMoves: 'Şemalar normal hamleleri gösterir. Rok, geçerken alma ve terfi için ek koşullar vardır.',
        limitsTitle: 'Taraf başına kimlik kotası (16 taş)', limitsHelp: 'Bu kimlik sınırları tahtada kalanlara değil, başlangıçtaki 16 taşa uygulanır. Alınan taşlar da kimlik kısıtları hesabına dâhildir.',
        deductionTitle: 'Hamle olasılıkları eler', deductionHelp: 'Açık tahtada e4→h7 üç kare çapraz gidince fil veya vezir kalır. Ardından h7→h5 iki kare düz gidince yalnızca vezir kalır.',
        chainHelp: 'Her tarafta yalnızca bir vezir vardır. Sadece kale veya vezir olabilen başka bir taş, hareket etmeden kale olur.',
        outcomeTitle: 'Şahı almak ve mat etmek', chessContrast: 'Normal satrançta şah gerçekten alınmaz; oyun mat ile biter. Q-Gambit’te son yaşayan şah adayını almak veya kimliği kesinleşmiş şahı mat etmek de oyunu bitirebilir.', captureLabel: 'Son şah adayını almak', captureHelp: 'Şematik örnek: ? kimliği gizli bir rakip taşıdır ve son yaşayan şah adayı olabilir. Alındıktan sonra başka aday kalmazsa oyun biter; kalırsa sürer.',
        mateLabel: 'Kimliği kesinleşen şahı mat etmek', mateHelp: 'Kesinleşen şah tehdit altındaysa ve yasal kaçış yoksa da kaybeder. Burada iki beyaz kale a8, a7 ve b8 karelerini kontrol eder.',
        names: ['Şah', 'Vezir', 'Kale', 'Fil', 'At', 'Piyon'],
    },
    pl: {
        movementTitle: 'Ruchy figur', movementHelp: 'Figura stoi pośrodku. Złote pola są dostępne na pustej szachownicy. Figury dalekosiężne zatrzymują się przed przeszkodą; tylko skoczek przeskakuje figury.',
        pawnHelp: 'Biały pion idzie tutaj w górę: o jedno pole lub o dwa z pola startowego. × oznacza bicie po skosie. Czarny idzie w przeciwnym kierunku.',
        specialMoves: 'Diagramy pokazują zwykłe ruchy. Roszada, bicie w przelocie i promocja wymagają dodatkowych warunków.',
        limitsTitle: 'Limity figur na stronę (16)', limitsHelp: 'Te limity tożsamości dotyczą 16 figur początkowych, a nie tylko pozostałych na szachownicy. Zbite figury nadal uwzględnia się przy obliczaniu ograniczeń.',
        deductionTitle: 'Ruch usuwa możliwości', deductionHelp: 'Na pustej szachownicy e4→h7 to trzy pola po skosie: zostaje goniec lub hetman. Następnie h7→h5 to dwa pola prosto: zostaje tylko hetman.',
        chainHelp: 'Każda strona ma tylko jedno miejsce dla hetmana. Inna figura z możliwościami wieża lub hetman staje się więc wieżą bez ruchu.',
        outcomeTitle: 'Bicie króla a mat', chessContrast: 'W zwykłych szachach króla nie zbija się fizycznie: partię kończy mat. W Q-Gambit może ją też zakończyć zbicie ostatniego żywego kandydata na króla lub mat ustalonego króla.', captureLabel: 'Zbić ostatniego kandydata na króla', captureHelp: 'Schemat: ? to ukryta figura rywala, która może być ostatnim żywym kandydatem na króla. Jeśli po jej zbiciu nie ma innych kandydatów, partia się kończy; w przeciwnym razie trwa dalej.',
        mateLabel: 'Zamatować ustalonego króla', mateHelp: 'Ustalony król przegrywa też pod atakiem bez legalnej ucieczki. Tu dwie białe wieże kontrolują a8, a7 i b8.',
        names: ['Król', 'Hetman', 'Wieża', 'Goniec', 'Skoczek', 'Pion'],
    },
    hi: {
        movementTitle: 'हर मोहरे की चाल', movementHelp: 'मोहरा बीच में है। सुनहरे खाने खाली बोर्ड पर संभव चालें हैं। दूर चलने वाले मोहरे रास्ते में रुकते हैं; केवल घोड़ा ऊपर से कूदता है।',
        pawnHelp: 'चित्र में सफ़ेद प्यादा ऊपर चलता है: एक घर, या शुरुआती पंक्ति से दो घर। × तिरछे आगे मारने का घर है। काला उलटी दिशा में चलता है।',
        specialMoves: 'चित्र सामान्य चालें दिखाते हैं। कैसलिंग, एन पसाँ और पदोन्नति की अतिरिक्त शर्तें हैं।',
        limitsTitle: 'हर पक्ष की पहचान सीमा (16 मोहरे)', limitsHelp: 'ये पहचान सीमाएँ शुरुआती 16 मोहरों पर लागू होती हैं, सिर्फ़ बोर्ड पर बचे मोहरों पर नहीं। मारे गए मोहरे भी पहचान की पाबंदियों की गणना में शामिल हैं।',
        deductionTitle: 'चाल से संभावनाएँ घटती हैं', deductionHelp: 'खाली रास्ते पर e4→h7 तीन घर तिरछा जाने पर ऊँट या वज़ीर बचते हैं। फिर h7→h5 दो घर सीधा जाने पर केवल वज़ीर बचता है।',
        chainHelp: 'हर पक्ष में केवल एक वज़ीर की जगह है। इसलिए दूसरा मोहरा, जो हाथी या वज़ीर हो सकता था, बिना चले हाथी निश्चित हो जाता है।',
        outcomeTitle: 'राजा को मारना और शह-मात', chessContrast: 'सामान्य शतरंज में राजा को वास्तव में नहीं मारा जाता; खेल शह-मात पर समाप्त होता है। Q-Gambit में आख़िरी जीवित राजा उम्मीदवार को मारने या निश्चित राजा को शह-मात देने से भी खेल समाप्त हो सकता है।', captureLabel: 'आख़िरी राजा उम्मीदवार को मारना', captureHelp: 'यह सांकेतिक चित्र है: ? प्रतिद्वंद्वी का छिपा मोहरा है, जो आख़िरी जीवित राजा उम्मीदवार हो सकता है। उसे मारने के बाद कोई उम्मीदवार न बचे तो खेल समाप्त होता है; अन्य बचे हों तो जारी रहता है।',
        mateLabel: 'निश्चित राजा को शह-मात देना', mateHelp: 'निश्चित राजा पर हमला हो और बचने की कोई वैध चाल न हो तो भी हार होती है। यहाँ दो सफ़ेद हाथी a8, a7 और b8 को नियंत्रित करते हैं।',
        names: ['राजा', 'वज़ीर', 'हाथी', 'ऊँट', 'घोड़ा', 'प्यादा'],
    },
    pt: {
        movementTitle: 'Movimento de cada peça', movementHelp: 'A peça está no centro. As casas douradas são destinos possíveis num tabuleiro vazio. Peças deslizantes param diante de obstáculos; só o cavalo salta.',
        pawnHelp: 'O peão branco avança para cima: uma casa, ou duas da fileira inicial. × marca a captura diagonal. O preto avança no sentido contrário.',
        specialMoves: 'Os diagramas mostram movimentos normais. Roque, en passant e promoção exigem condições adicionais.',
        limitsTitle: 'Limites por lado (16 peças)', limitsHelp: 'Esses limites de identidade valem para as 16 peças iniciais, não apenas para as que restam no tabuleiro. Peças capturadas continuam incluídas no cálculo das restrições.',
        deductionTitle: 'Uma jogada elimina candidatos', deductionHelp: 'Num tabuleiro livre, e4→h7 são três casas diagonais: restam bispo ou rainha. Depois, h7→h5 são duas casas retas: só resta rainha.',
        chainHelp: 'Cada lado tem só uma vaga de rainha. Outra peça que podia ser torre ou rainha passa a ser torre mesmo sem se mover.',
        outcomeTitle: 'Capturar o rei e dar xeque-mate', chessContrast: 'No xadrez comum o rei não é capturado de fato: o xeque-mate encerra a partida. Em Q-Gambit, capturar o último candidato vivo a rei ou dar mate a um rei confirmado também pode encerrá-la.', captureLabel: 'Capturar o último candidato a rei', captureHelp: 'Esquema: ? é uma peça adversária oculta que pode ser o último candidato vivo a rei. Se sua captura não deixar outro candidato, a partida termina; caso contrário, continua.',
        mateLabel: 'Dar mate a um rei confirmado', mateHelp: 'Um rei confirmado também perde se estiver sob ataque sem jogada legal para escapar. Aqui duas torres brancas controlam a8, a7 e b8.',
        names: ['Rei', 'Rainha', 'Torre', 'Bispo', 'Cavalo', 'Peão'],
    },
    ta: {
        movementTitle: 'ஒவ்வொரு காயின் நகர்வு', movementHelp: 'காய் நடுவில் உள்ளது. தங்க நிறக் கட்டங்கள் காலியான பலகையில் செல்லக்கூடியவை. நீண்ட தூரக் காய்கள் இடையூறில் நிற்கும்; குதிரை மட்டுமே தாண்டும்.',
        pawnHelp: 'வெள்ளை சிப்பாய் மேலே நகரும்: ஒரு கட்டம், தொடக்க வரிசையிலிருந்து இரண்டு கட்டம். × என்பது முன் சாய்வாக வெட்டும் கட்டம். கருப்பு எதிர்திசையில் நகரும்.',
        specialMoves: 'வரைபடங்கள் வழக்கமான நகர்வுகளைக் காட்டுகின்றன. காஸ்ட்லிங், என் பசான், பதவி உயர்வுக்கு கூடுதல் நிபந்தனைகள் உள்ளன.',
        limitsTitle: 'ஒரு தரப்பின் அடையாள வரம்பு (16 காய்கள்)', limitsHelp: 'இந்த அடையாள வரம்புகள் பலகையில் மீதமுள்ள காய்களுக்கு மட்டும் அல்ல; தொடக்க 16 காய்களுக்கும் பொருந்தும். வெட்டப்பட்ட காய்களும் அடையாளக் கட்டுப்பாடு கணக்கில் சேர்க்கப்படுகின்றன.',
        deductionTitle: 'நகர்வு சாத்தியங்களை நீக்கும்', deductionHelp: 'தடையற்ற பலகையில் e4→h7 மூன்று கட்டம் சாய்வாகச் சென்றால் பிஷப் அல்லது ராணி மீறும். பின் h7→h5 இரண்டு கட்டம் நேராகச் சென்றால் ராணி மட்டும் மீறும்.',
        chainHelp: 'ஒவ்வொரு தரப்புக்கும் ஒரு ராணி இடம் மட்டுமே. இன்னொரு காய் ரூக் அல்லது ராணி மட்டுமே ஆகக்கூடும் என்றால், நகராமலேயே அது ரூக் என்று உறுதியாகும்.',
        outcomeTitle: 'ராஜாவைப் பிடிப்பதும் செக்மேட்டும்', chessContrast: 'சாதாரண சதுரங்கத்தில் ராஜாவை உண்மையில் பிடிப்பதில்லை; செக்மேட்டில் ஆட்டம் முடிகிறது. Q-Gambit-இல் உயிருள்ள கடைசி ராஜா வாய்ப்பைக் கைப்பற்றினாலும், உறுதியான ராஜாவை செக்மேட் செய்தாலும் ஆட்டம் முடியும்.', captureLabel: 'கடைசி ராஜா வாய்ப்பைக் கைப்பற்றுதல்', captureHelp: 'விளக்கப்படம்: ? என்பது அடையாளம் மறைந்த எதிரிக் காய்; அது உயிருள்ள கடைசி ராஜா வாய்ப்பாக இருக்கலாம். அதை வெட்டிய பின் வேறு வாய்ப்பு இல்லாவிட்டால் ஆட்டம் முடியும்; இருந்தால் தொடரும்.',
        mateLabel: 'உறுதியான ராஜாவை செக்மேட் செய்தல்', mateHelp: 'உறுதியான ராஜா தாக்கப்பட்டு தப்ப சட்டபூர்வ நகர்வு இல்லாவிட்டாலும் தோல்வி. இங்கு இரண்டு வெள்ளை ரூக்குகள் a8, a7, b8 ஆகியவற்றைக் கட்டுப்படுத்துகின்றன.',
        names: ['ராஜா', 'ராணி', 'ரூக்', 'பிஷப்', 'குதிரை', 'சிப்பாய்'],
    },
};
