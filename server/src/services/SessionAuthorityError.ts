/** Safe public classification; provider errors may contain credentials. */
export class SessionAuthorityUnavailable extends Error {
    constructor() { super('Session authority unavailable'); this.name = 'SessionAuthorityUnavailable'; }
}
