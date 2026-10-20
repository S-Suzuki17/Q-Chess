import type { Language } from './dict';

export const learningEntryText: Record<Language, { title: string; detail: string }> = {
    ja: { title: 'チュートリアル', detail: 'チェス初心者向け · 時間制限なしで一手ずつ練習' },
    en: { title: 'Tutorial', detail: 'New to chess? Practice one move at a time, without a clock.' },
    zh: { title: '教程', detail: '适合国际象棋新手 · 无计时，逐步练习' },
    ru: { title: 'Обучение', detail: 'Для новичков в шахматах · По одному ходу, без таймера' },
    fr: { title: 'Tutoriel', detail: 'Débutant aux échecs ? Entraînez-vous pas à pas, sans chrono.' },
    de: { title: 'Tutorial', detail: 'Neu beim Schach? Übe Zug für Zug, ohne Zeitdruck.' },
    es: { title: 'Tutorial', detail: '¿Nuevo en ajedrez? Practica paso a paso, sin reloj.' },
    tr: { title: 'Eğitim', detail: 'Satranca yeni misiniz? Süre sınırı olmadan adım adım çalışın.' },
    pl: { title: 'Samouczek', detail: 'Początkujesz w szachach? Ćwicz ruch po ruchu, bez zegara.' },
    hi: { title: 'ट्यूटोरियल', detail: 'शतरंज में नए हैं? बिना समय सीमा के एक-एक चाल का अभ्यास करें।' },
    pt: { title: 'Tutorial', detail: 'Novo no xadrez? Pratique passo a passo, sem relógio.' },
    ta: { title: 'பயிற்சி', detail: 'சதுரங்கத்திற்குப் புதியவரா? நேர வரம்பின்றி ஒவ்வொரு நகர்வாகப் பயிலுங்கள்.' },
};
