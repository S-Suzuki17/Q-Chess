'use client';

interface ModalCloseButtonProps {
    onClose: () => void;
    lang?: string;
}

/** Keep dismissal reachable even when the dialog content scrolls. */
export function ModalCloseButton({ onClose, lang = 'ja' }: ModalCloseButtonProps) {
    const label = lang === 'ja' ? '閉じる' : 'Close';
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClose}
            className="fixed z-[210] flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#B39A62]/50 bg-[#161513] text-2xl text-[#E8E2D7] shadow-lg hover:bg-[#2A2621] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4B872]"
            style={{ top: 'max(12px, env(safe-area-inset-top))', right: 'max(12px, env(safe-area-inset-right))' }}
        >
            <span aria-hidden="true">×</span>
        </button>
    );
}
