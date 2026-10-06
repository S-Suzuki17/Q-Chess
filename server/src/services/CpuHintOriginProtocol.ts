/** New stock consumption requires a separate reviewed release. No env flag opens it. */
export const CPU_HINT_ORIGIN_CONSUMPTION_RELEASE_READY = false;
export type CpuHintPurchaseRpc = 'buy_cpu_hint' | 'buy_cpu_hint_v2';
export function cpuHintPurchaseRpc(): CpuHintPurchaseRpc {
    return CPU_HINT_ORIGIN_CONSUMPTION_RELEASE_READY ? 'buy_cpu_hint_v2' : 'buy_cpu_hint';
}
