import type { Language } from './dict';
import { CPU_PERSONALITIES, type CPUPersonality } from '../config/cpuPersonalities';

const copy: Record<Language, readonly [string, string, string, string, string, string]> = {
    ja: ['万能型', '攻撃型', '堅実型', '陣地型', '機動型', '柔軟型'],
    en: ['Balanced', 'Attacking', 'Solid', 'Positional', 'Active', 'Flexible'],
    zh: ['均衡型', '进攻型', '稳健型', '阵地型', '机动型', '灵活型'],
    ru: ['Универсальный', 'Атакующий', 'Надёжный', 'Позиционный', 'Активный', 'Гибкий'],
    fr: ['Équilibré', 'Offensif', 'Solide', 'Positionnel', 'Actif', 'Flexible'],
    de: ['Ausgewogen', 'Angreifend', 'Solide', 'Positionell', 'Aktiv', 'Flexibel'],
    es: ['Equilibrado', 'Atacante', 'Sólido', 'Posicional', 'Activo', 'Flexible'],
    tr: ['Dengeli', 'Saldırgan', 'Sağlam', 'Konumsal', 'Aktif', 'Esnek'],
    pl: ['Wszechstronny', 'Atakujący', 'Solidny', 'Pozycyjny', 'Aktywny', 'Elastyczny'],
    hi: ['संतुलित', 'आक्रामक', 'मजबूत', 'स्थितिजन्य', 'सक्रिय', 'लचीला'],
    pt: ['Equilibrado', 'Ofensivo', 'Sólido', 'Posicional', 'Ativo', 'Flexível'],
    ta: ['சமநிலை', 'தாக்குதல்', 'நிதானம்', 'நிலைசார்', 'சுறுசுறுப்பு', 'நெகிழ்வு'],
};
export const cpuPersonalityText = (lang: Language, personality: CPUPersonality) => copy[lang][CPU_PERSONALITIES.indexOf(personality)];
