import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {isValidElement,type ReactElement,type ReactNode} from 'react';
const h=vi.hoisted(()=>({slots:[] as unknown[],cursor:0,effects:[] as (()=>void)[],cleanups:new Map<number,()=>void>(),available:vi.fn(),start:vi.fn(),complete:vi.fn()}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),
    useState(initial:unknown){const i=h.cursor++;if(!(i in h.slots))h.slots[i]=initial;return[h.slots[i],(value:unknown)=>{h.slots[i]=value;}];},
    useRef(initial:unknown){const i=h.cursor++;if(!(i in h.slots))h.slots[i]={current:initial};return h.slots[i];},
    useEffect(effect:()=>void|(()=>void),deps:unknown[]){const i=h.cursor++,previous=h.slots[i] as unknown[]|undefined;if(!previous||deps.some((value,j)=>value!==previous[j])){h.slots[i]=deps;h.effects.push(()=>{h.cleanups.get(i)?.();const clean=effect();if(clean)h.cleanups.set(i,clean);});}},
}));
vi.mock('../lib/accountRecovery',()=>({recoveryAvailable:h.available,startRecovery:h.start,completeRecovery:h.complete}));
import {AccountRecoveryPanel} from './AccountRecoveryPanel';
type Node=ReactElement<Record<string,any>>;
const nodes=(tree:ReactNode):Node[]=>Array.isArray(tree)?tree.flatMap(nodes):isValidElement(tree)?[tree as Node,...nodes((tree.props as Record<string,ReactNode>).children)]:[];
function render(userId?:string){h.cursor=0;const tree=AccountRecoveryPanel({lang:'ja',userId});h.effects.splice(0).forEach(effect=>effect());return nodes(tree);}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
async function open(userId?:string){render(userId).find(node=>node.type==='button')!.props.onClick();render(userId);await flush();return render(userId);}
const fill=(tree:Node[],index:number,value:string)=>tree.filter(node=>node.type==='input')[index].props.onChange({target:{value}});
async function submit(tree:Node[]){tree.find(node=>node.type==='form')!.props.onSubmit({preventDefault(){}});await flush();}
beforeEach(()=>{vi.clearAllMocks();h.slots=[];h.cursor=0;h.effects=[];h.cleanups.clear();h.available.mockResolvedValue(true);h.start.mockResolvedValue('a'.repeat(64));h.complete.mockResolvedValue(undefined);});
afterEach(()=>h.cleanups.forEach(clean=>clean()));
it('takes the reset flow through code entry to the saved state without persisting secrets',async()=>{
    let tree=await open();fill(tree,0,'Alice');fill(tree,1,'alice@example.test');await submit(render());
    expect(h.start).toHaveBeenCalledWith('Alice','alice@example.test',undefined);tree=render();
    fill(tree,0,'123456');fill(tree,1,'new-password-123');fill(tree,2,'new-password-123');await submit(render());
    expect(h.complete).toHaveBeenCalledWith('a'.repeat(64),'123456','new-password-123',undefined);
    tree=render();expect(tree.some(node=>node.props.role==='status'&&String(node.props.children).startsWith('保存しました'))).toBe(true);
    expect(tree.filter(node=>node.type==='input')).toHaveLength(0);expect(h.slots).not.toContain('new-password-123');
});
it('enrollment verifies current password then clears it before OTP confirmation',async()=>{
    const userId='Alice';let tree=await open(userId);fill(tree,0,'alice@example.test');fill(tree,1,'old-password');await submit(render(userId));
    expect(h.start).toHaveBeenCalledWith(userId,'alice@example.test','old-password');expect(h.slots).not.toContain('old-password');
    tree=render(userId);fill(tree,0,'123456');await submit(render(userId));expect(h.complete).toHaveBeenCalledWith('a'.repeat(64),'123456',undefined,userId);
});
it('rejects mismatched passwords and expired-server responses without showing success',async()=>{
    let tree=await open();fill(tree,0,'Alice');fill(tree,1,'alice@example.test');await submit(render());tree=render();
    fill(tree,0,'123456');fill(tree,1,'new-password-123');fill(tree,2,'different-password');await submit(render());expect(h.complete).not.toHaveBeenCalled();
    expect(render().some(node=>node.props.role==='alert')).toBe(true);
    fill(render(),2,'new-password-123');h.complete.mockRejectedValue(new Error('expired'));await submit(render());
    expect(render().some(node=>node.props.role==='alert')).toBe(true);expect(render().some(node=>node.props.role==='status'&&String(node.props.children).startsWith('保存しました'))).toBe(false);
});
it('does not submit to an unavailable server',async()=>{
    h.available.mockResolvedValue(false);await open();await submit(render());expect(h.start).not.toHaveBeenCalled();
    expect(render().find(node=>node.type==='button'&&node.props.type==='submit')!.props.disabled).toBe(true);
});
