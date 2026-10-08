'use client';
import { useEffect,useRef,type ReactNode } from 'react';

/** Native modal provides focus containment, Escape and focus restoration. */
export function SettingsDialog({children,label,onClose}:{children:ReactNode;label:string;onClose:()=>void}) {
    const ref=useRef<HTMLDialogElement>(null);
    useEffect(()=>{
        const dialog=ref.current,previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
        dialog?.showModal();
        return()=>{
            dialog?.close();
            // React may remove the dialog before passive cleanup, so native
            // focus restoration alone does not reliably return to its opener.
            if(previous?.isConnected)previous.focus({preventScroll:true});
        };
    },[]);
    return <dialog ref={ref} aria-label={label} style={{maxWidth:'calc(100vw - 24px)'}} className="game-scroll m-auto max-h-[94dvh] w-[448px] overflow-y-auto bg-transparent p-0 text-[#E8E2D7] backdrop:bg-black/80 backdrop:backdrop-blur-sm" onCancel={event=>{event.preventDefault();onClose();}}>{children}</dialog>;
}
