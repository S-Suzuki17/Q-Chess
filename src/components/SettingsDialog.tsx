'use client';
import { useEffect,useRef,type ReactNode } from 'react';

/** Native modal provides focus containment, Escape and focus restoration. */
export function SettingsDialog({children,label,onClose}:{children:ReactNode;label:string;onClose:()=>void}) {
    const ref=useRef<HTMLDialogElement>(null);
    useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
    return <dialog ref={ref} aria-label={label} style={{maxWidth:'calc(100vw - 24px)'}} className="m-auto max-h-[94dvh] w-[448px] overflow-y-auto bg-transparent p-0 text-[#E8E2D7] backdrop:bg-black/80 backdrop:backdrop-blur-sm" onCancel={event=>{event.preventDefault();onClose();}}>{children}</dialog>;
}
