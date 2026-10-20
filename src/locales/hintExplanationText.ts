import type { Language } from './dict';

interface ExplanationCopy {
    title: string; manual: string; after: string; excluded: string; capture: string;
    chain: string; check: string; escape: string; scope: string;
}
const rows: Record<Language, readonly [string, string, string, string, string, string, string, string, string]> = {
    ja: ['この一手で変わること', 'ヒントは自動で指しません。青の駒を選び、金色のマスへ動かします。',
        '移動後の候補・昇格先', 'この動きで外れる候補', '取れる相手の駒', '他の駒の変化',
        '相手の最後のキング候補に王手をかけます。', '自分のキングへの王手を解きます。',
        '今の盤面で、この一手の直後に起きる変化です。相手の次の手や勝利を保証するものではありません。'],
    en: ['What this move changes', 'Hints do not move pieces for you. Select blue, then move to gold.',
        'Candidates or promotion after moving', 'Candidates ruled out by this move', 'Enemy pieces captured', 'Changes to other pieces',
        'This checks the opponent’s last King candidate.', 'This gets your King out of check.',
        'These are the immediate effects on this board, not a prediction of the reply or a guarantee of winning.'],
    zh: ['这一步会改变什么', '提示不会自动走棋。选择蓝色棋子，再移到金色格。',
        '移动后的候选或升变', '此走法排除的候选', '可吃掉的对方棋子', '其他棋子的变化',
        '这一步将军对方最后一个王候选。', '这一步解除己方王的被将军状态。',
        '这里只说明当前棋盘上这一步的即时变化，不预测对方的应手，也不保证获胜。'],
    ru: ['Что изменит этот ход', 'Подсказка не делает ход за вас. Выберите синюю фигуру и золотую клетку.',
        'Возможные фигуры или превращение после хода', 'Исключённые этим ходом варианты', 'Взятые фигуры соперника', 'Изменения других фигур',
        'Ход объявляет шах последнему кандидату в короли соперника.', 'Ход выводит вашего короля из-под шаха.',
        'Это непосредственные изменения на текущей доске, а не прогноз ответа или гарантия победы.'],
    fr: ['Ce que ce coup change', 'L’indice ne joue pas à votre place. Sélectionnez la pièce bleue, puis la case dorée.',
        'Identités possibles ou promotion après le coup', 'Identités exclues par ce mouvement', 'Pièces adverses capturées', 'Changements des autres pièces',
        'Ce coup met en échec le dernier Roi possible adverse.', 'Ce coup met votre Roi à l’abri de l’échec.',
        'Il s’agit des effets immédiats sur cet échiquier, pas d’une prévision de la réponse ni d’une garantie de victoire.'],
    de: ['Was dieser Zug verändert', 'Der Hinweis führt keinen Zug aus. Wähle die blaue Figur und dann das goldene Feld.',
        'Mögliche Figuren oder Umwandlung nach dem Zug', 'Durch diesen Zug ausgeschlossene Figuren', 'Geschlagene gegnerische Figuren', 'Änderungen an anderen Figuren',
        'Der Zug setzt den letzten Königskandidaten des Gegners ins Schach.', 'Der Zug befreit deinen König aus dem Schach.',
        'Dies sind die unmittelbaren Folgen auf diesem Brett, keine Vorhersage der Antwort oder Sieggarantie.'],
    es: ['Qué cambia esta jugada', 'La pista no mueve por ti. Elige la pieza azul y después la casilla dorada.',
        'Identidades posibles o promoción tras mover', 'Identidades descartadas por el movimiento', 'Piezas rivales capturadas', 'Cambios en otras piezas',
        'Esta jugada da jaque al último candidato a Rey rival.', 'Esta jugada saca a tu Rey del jaque.',
        'Son los efectos inmediatos en este tablero, no una predicción de la respuesta ni una garantía de victoria.'],
    tr: ['Bu hamle neyi değiştirir?', 'İpucu sizin yerinize oynamaz. Mavi taşı, sonra altın kareyi seçin.',
        'Hamle sonrası adaylar veya terfi', 'Bu hareketin elediği adaylar', 'Alınan rakip taşlar', 'Diğer taşlardaki değişiklikler',
        'Bu hamle rakibin son Şah adayına şah çeker.', 'Bu hamle Şahınızı tehditten kurtarır.',
        'Bunlar bu tahtadaki anlık sonuçlardır; rakibin yanıtını öngörmez veya kazanmayı garanti etmez.'],
    pl: ['Co zmienia ten ruch', 'Podpowiedź nie wykonuje ruchu za Ciebie. Wybierz niebieską figurę, potem złote pole.',
        'Możliwe figury lub promocja po ruchu', 'Możliwości wykluczone przez ruch', 'Zbite figury przeciwnika', 'Zmiany innych figur',
        'Ten ruch szachuje ostatniego kandydata na Króla przeciwnika.', 'Ten ruch uwalnia Twojego Króla od szacha.',
        'To bezpośrednie skutki na tej szachownicy, a nie przewidywanie odpowiedzi lub gwarancja wygranej.'],
    hi: ['इस चाल से क्या बदलेगा', 'संकेत अपने आप चाल नहीं चलता। नीला मोहरा चुनें, फिर सुनहरे खाने पर जाएँ।',
        'चाल के बाद संभावित पहचान या पदोन्नति', 'इस चाल से हटने वाली पहचान', 'पकड़े जाने वाले विरोधी मोहरे', 'अन्य मोहरों में बदलाव',
        'यह चाल विरोधी के अंतिम संभावित राजा को शह देती है।', 'यह चाल आपके राजा को शह से बचाती है।',
        'ये वर्तमान बोर्ड पर इस चाल के तुरंत बाद के बदलाव हैं, विरोधी की अगली चाल का अनुमान या जीत की गारंटी नहीं।'],
    pt: ['O que esta jogada muda', 'A dica não joga por você. Selecione a peça azul e depois a casa dourada.',
        'Identidades possíveis ou promoção após mover', 'Identidades excluídas pelo movimento', 'Peças adversárias capturadas', 'Mudanças em outras peças',
        'Esta jogada dá xeque ao último candidato a Rei adversário.', 'Esta jogada tira seu Rei do xeque.',
        'São os efeitos imediatos neste tabuleiro, não uma previsão da resposta nem uma garantia de vitória.'],
    ta: ['இந்த நகர்வு என்ன மாற்றும்', 'குறிப்பு தானாக நகர்த்தாது. நீலக் காயைத் தேர்ந்து, பொன் கட்டத்திற்கு நகர்த்தவும்.',
        'நகர்வுக்குப் பின் சாத்தியமான காய்கள் அல்லது பதவி உயர்வு', 'இந்த நகர்வால் நீக்கப்படும் சாத்தியங்கள்', 'பிடிக்கப்படும் எதிரிக் காய்கள்', 'பிற காய்களில் ஏற்படும் மாற்றங்கள்',
        'இந்த நகர்வு எதிரியின் கடைசி ராஜா சாத்தியத்திற்கு செக் கொடுக்கும்.', 'இந்த நகர்வு உங்கள் ராஜாவை செக்கிலிருந்து காப்பாற்றும்.',
        'இவை தற்போதைய பலகையில் உடனே ஏற்படும் மாற்றங்கள் மட்டுமே; எதிரியின் பதிலைக் கணிக்கவோ வெற்றியை உறுதி செய்யவோ இல்லை.'],
};
export function hintExplanationText(lang: string): ExplanationCopy {
    const [title, manual, after, excluded, capture, chain, check, escape, scope] = rows[lang as Language] ?? rows.en;
    return { title, manual, after, excluded, capture, chain, check, escape, scope };
}
