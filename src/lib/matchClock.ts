/** Display snapshots must not make the entire board render at the clock's polling rate.
 * Deadlines and submitted remaining time are still calculated from the monotonic clock. */
export function clockDisplaySnapshot(previous: number, remaining: number): number {
    const next = Math.max(0, remaining);
    return Math.ceil(previous) === Math.ceil(next) ? previous : next;
}
