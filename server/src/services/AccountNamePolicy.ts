/** Deliberately small, reviewable rules, not a claim of universal language moderation. */
export function permittedAccountName(value: string): boolean {
    const text=value.normalize('NFKC').toLowerCase();
    const compact=text.replace(/[\p{P}\p{Z}\p{Cf}]/gu,'');
    if (/^(?:qgambit|qube)(?:official|support|admin|team|運営|公式)?$/u.test(compact)) return false;
    if (/^(?:admin|administrator|moderator|official|support|運営|公式|管理者|管理员|администратор)$/u.test(compact)) return false;
    return !/(?:^|[^\p{L}])(?:fuck|shit|nazi)(?:$|[^\p{L}])/u.test(text)
        && !/^(?:fuck|shit|nazi)[0-9]*$/u.test(compact)
        && !/(?:ちんぽ|まんこ|殺してやる)/u.test(text);
}
