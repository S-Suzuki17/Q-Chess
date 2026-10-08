/** Reviewed source-ledger consumption; independent of new-purchase sales switches. */
export const CPU_HINT_ORIGIN_CONSUMPTION_RELEASE_READY = true;
export type CpuHintPurchaseRpc = 'buy_cpu_hint' | 'buy_cpu_hint_v2';
export function cpuHintPurchaseRpc(): CpuHintPurchaseRpc {
    return CPU_HINT_ORIGIN_CONSUMPTION_RELEASE_READY ? 'buy_cpu_hint_v2' : 'buy_cpu_hint';
}
