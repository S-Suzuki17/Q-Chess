import {expect,it,vi} from 'vitest';
import {dismissDialog} from './dialogDismissal';

it('closes the modal before restoring focus or removing its component',()=>{
    const order:string[]=[];
    const dialog={open:true,close(){this.open=false;order.push('native-close');}};
    dismissDialog(dialog,()=>{expect(dialog.open).toBe(false);order.push('restore-focus');});
    expect(order).toEqual(['native-close','restore-focus']);
});
it('still dismisses an already closed or not-yet-mounted dialog',()=>{
    const close=vi.fn(),dismiss=vi.fn();
    dismissDialog({open:false,close},dismiss);dismissDialog(null,dismiss);
    expect(close).not.toHaveBeenCalled();expect(dismiss).toHaveBeenCalledTimes(2);
});
