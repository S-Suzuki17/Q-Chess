/** Page breaks must preserve the source and prefer complete words in every locale. */
export function textPageBreaks(text: string, lang: string) {
    const graphemes = Array.from(new Intl.Segmenter(lang, { granularity: 'grapheme' }).segment(text));
    const offsets = new Map(graphemes.map((part, index) => [part.index + part.segment.length, index + 1]));
    const boundaries: number[] = [];
    for (const part of new Intl.Segmenter(lang, { granularity: 'word' }).segment(text)) {
        const offset = part.index + part.segment.length;
        // Keep closing punctuation with the preceding word and opening marks with the next.
        if (/^[\p{Pe}\p{Pf}、。，．！？：；!?.,:;…]/u.test(text.slice(offset)) || /[\p{Ps}\p{Pi}「『]$/u.test(part.segment)) continue;
        const boundary = offsets.get(offset);
        if (boundary !== undefined) boundaries.push(boundary);
    }
    return {
        chars: graphemes.map(part => part.segment),
        pageEnd(start: number, fits: number) {
            let end = start + fits;
            if (end >= graphemes.length) return graphemes.length;
            for (const boundary of boundaries) {
                if (boundary > start + fits) break;
                if (boundary > start) end = boundary;
            }
            // Only an individual word wider than the entire page needs a grapheme fallback.
            return end;
        },
    };
}
