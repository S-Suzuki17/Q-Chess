import React from 'react';
import Image from 'next/image';
import type { Language } from '../locales/dict';

const copy: Record<Language, { caption: string; alt: string }> = {
    en: {
        caption: 'Sample position · Read-only game screen',
        alt: "Q-Gambit's actual 3D game screen with white and black pieces, possible-move markers and the remaining-identity panel. An illustrative sample position.",
    },
    ja: {
        caption: 'サンプル局面・実際の対局画面（操作不可）',
        alt: '白と黒の駒、移動候補、残っている正体のパネルが見えるQ-Gambitの実際の3D対局画面。説明用のサンプル局面です。',
    },
    zh: {
        caption: '示例局面 · 只读对局画面',
        alt: 'Q-Gambit的真实3D对局界面，显示黑白棋子、可走位置及剩余身份面板。这是用于展示的示例局面。',
    },
    ru: {
        caption: 'Пример позиции · просмотр без управления',
        alt: 'Настоящий 3D-интерфейс Q-Gambit: белые и чёрные фигуры, возможные ходы и панель оставшихся ролей. Демонстрационная позиция.',
    },
    fr: {
        caption: 'Position d’exemple · aperçu non interactif',
        alt: 'Véritable interface 3D de Q-Gambit avec pièces blanches et noires, coups possibles et panneau des identités restantes. Position de démonstration.',
    },
    de: {
        caption: 'Beispielstellung · Spielansicht ohne Bedienung',
        alt: 'Die echte 3D-Spieloberfläche von Q-Gambit mit weißen und schwarzen Figuren, möglichen Zügen und verbleibenden Identitäten. Eine Beispielstellung.',
    },
    es: {
        caption: 'Posición de ejemplo · vista no interactiva',
        alt: 'La interfaz 3D real de Q-Gambit con piezas blancas y negras, movimientos posibles y el panel de identidades restantes. Posición de demostración.',
    },
    tr: {
        caption: 'Örnek konum · salt okunur oyun ekranı',
        alt: "Q-Gambit’in beyaz ve siyah taşları, olası hamleleri ve kalan kimlikleri gösteren gerçek 3D oyun ekranı. Örnek bir konum.",
    },
    pl: {
        caption: 'Przykładowa pozycja · widok bez interakcji',
        alt: 'Rzeczywisty interfejs 3D Q-Gambit z białymi i czarnymi figurami, możliwymi ruchami i panelem pozostałych tożsamości. Przykładowa pozycja.',
    },
    hi: {
        caption: 'उदाहरण स्थिति · केवल देखने के लिए',
        alt: 'Q-Gambit का वास्तविक 3D खेल दृश्य: सफेद और काले मोहरे, संभावित चालें और शेष पहचान का पैनल। यह एक उदाहरण स्थिति है।',
    },
    pt: {
        caption: 'Posição de exemplo · tela sem interação',
        alt: 'A interface 3D real do Q-Gambit com peças brancas e pretas, movimentos possíveis e painel de identidades restantes. Uma posição de demonstração.',
    },
    ta: {
        caption: 'மாதிரி நிலை · பார்வைக்கு மட்டும்',
        alt: 'Q-Gambit விளையாட்டின் உண்மையான 3D திரை: வெள்ளை மற்றும் கருப்பு காய்கள், சாத்தியமான நகர்வுகள், மீதமுள்ள அடையாளங்களின் பலகம். இது ஒரு மாதிரி நிலை.',
    },
};

const fullSizeLabels: Record<Language, string> = {
    en: 'View full size', ja: '原寸で見る', zh: '查看原图', ru: 'Полный размер',
    fr: 'Voir en grand', de: 'In voller Größe', es: 'Ver tamaño completo', tr: 'Tam boyut',
    pl: 'Pełny rozmiar', hi: 'पूरा आकार देखें', pt: 'Ver tamanho completo', ta: 'முழு அளவில் காண்க',
};

// Captured from main 2be9c0e, using an illustrative position in the actual game
// UI. This is not a played match or a preview of unreleased character artwork.
export function LandingGamePreview({ lang }: { lang: Language }) {
    const text = copy[lang] ?? copy.en;
    return (
        <figure className="landing-game-preview" data-game-preview="sample-screenshot">
            <Image
                className="landing-game-preview-image"
                src="/previews/game-screen-sample.png"
                alt={text.alt}
                width={1600}
                height={1000}
                loading="eager"
                unoptimized
            />
            <figcaption>
                <span>{text.caption}</span>
                <a href="/previews/game-screen-sample.png" target="_blank" rel="noopener noreferrer">
                    {fullSizeLabels[lang] ?? fullSizeLabels.en}<span aria-hidden="true"> ↗</span>
                </a>
            </figcaption>
        </figure>
    );
}
