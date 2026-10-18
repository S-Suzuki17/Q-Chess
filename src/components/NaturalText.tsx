'use client';
import {Fragment, useSyncExternalStore} from 'react';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** CJK prose has no spaces: keep dictionary words intact while allowing line breaks. */
export function naturalTextParts(text: string, lang: string) {
    if (lang !== 'ja' && lang !== 'zh') return [{text, keep: false}];
    return Array.from(new Intl.Segmenter(lang, {granularity: 'word'}).segment(text), part => ({
        text: part.segment, keep: !!part.isWordLike,
    }));
}

export function NaturalText({text, lang}: {text: string; lang: string}) {
    // Segment after hydration so different server/browser dictionaries cannot change SSR markup.
    const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
    if (!hydrated) return text;
    return <>{naturalTextParts(text, lang).map((part, index) => part.keep
        ? <span className="text-word" key={index}>{part.text}</span>
        : <Fragment key={index}>{part.text}</Fragment>)}</>;
}

/** Use the same words and CSS for hidden measurement and visible explanation pages. */
export function measureNaturalText(element: HTMLElement, text: string, lang: string) {
    element.replaceChildren(...naturalTextParts(text, lang).map(part => {
        if (!part.keep) return document.createTextNode(part.text);
        const word = document.createElement('span'); word.className = 'text-word'; word.textContent = part.text;
        return word;
    }));
}
