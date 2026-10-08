/** End the native modal state before the caller restores focus outside it.
 * showModal makes the rest of the document inert until close() completes.
 * https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal
 */
export function dismissDialog(dialog: Pick<HTMLDialogElement,'open'|'close'> | null, onDismiss: () => void) {
    if(dialog?.open)dialog.close();
    onDismiss();
}
