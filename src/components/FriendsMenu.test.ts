import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {isValidElement,type ReactElement,type ReactNode} from 'react';

const h=vi.hoisted(()=>({slots:[] as unknown[],cursor:0,writes:0,effects:[] as (()=>void)[],cleanups:new Map<number,()=>void>(),directory:vi.fn(),send:vi.fn()}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),
    useState(initial:unknown){const i=h.cursor++;if(!(i in h.slots))h.slots[i]=initial;return[h.slots[i],(value:unknown)=>{h.writes++;h.slots[i]=value;}];},
    useRef(initial:unknown){const i=h.cursor++;if(!(i in h.slots))h.slots[i]={current:initial};return h.slots[i];},
    useCallback(callback:unknown,deps:unknown[]){const i=h.cursor++,previous=h.slots[i] as {callback:unknown;deps:unknown[]}|undefined;if(!previous||deps.some((value,j)=>value!==previous.deps[j]))h.slots[i]={callback,deps};return(h.slots[i] as {callback:unknown}).callback;},
    useEffect(effect:()=>void|(()=>void),deps:unknown[]){const i=h.cursor++,previous=h.slots[i] as unknown[]|undefined;if(!previous||deps.some((value,j)=>value!==previous[j])){h.slots[i]=deps;h.effects.push(()=>{h.cleanups.get(i)?.();const clean=effect();if(clean)h.cleanups.set(i,clean);});}},
}));
vi.mock('../lib/gameRecordService',()=>({sendFriendRequest:h.send,acceptFriendRequest:vi.fn(),removeFriend:vi.fn()}));
vi.mock('../lib/friendDirectory',()=>({getFriendDirectory:h.directory,formatFriendRating:(value:unknown)=>String(value),validFriendId:()=>true}));
vi.mock('../hooks/useRealtimeRefresh',()=>({useRealtimeRefresh:()=>undefined}));
vi.mock('../lib/accountProfile',()=>({AccountProfileError:class extends Error{code='AUTH_REQUIRED';}}));
import {FriendsMenu} from './FriendsMenu';

type Node=ReactElement<Record<string,any>>;
const nodes=(tree:ReactNode):Node[]=>Array.isArray(tree)?tree.flatMap(nodes):isValidElement(tree)?[tree as Node,...nodes((tree.props as Record<string,ReactNode>).children)]:[];
function render(){h.cursor=0;const tree=FriendsMenu({user:{id:'Owner',name:'Owner',type:'registered'},lang:'en',onlineUsers:new Set(),onClose(){}});h.effects.splice(0).forEach(effect=>effect());return nodes(tree);}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const unmount=()=>{h.cleanups.forEach(clean=>clean());h.cleanups.clear();};
async function request(){render();await flush();render().find(node=>node.props.id==='friend-id')!.props.onChange({target:{value:'Peer'}});render().find(node=>node.type==='form')!.props.onSubmit({preventDefault(){}});}
beforeEach(()=>{vi.clearAllMocks();h.slots=[];h.cursor=0;h.writes=0;h.effects=[];h.cleanups.clear();h.directory.mockResolvedValue({friends:[],profiles:{},profilesUnavailable:false});h.send.mockResolvedValue(true);});
afterEach(unmount);

it('refreshes the current friend directory after a successful request',async()=>{
    await request();await flush();expect(h.send).toHaveBeenCalledWith('Owner','Peer');expect(h.directory).toHaveBeenCalledTimes(2);
    expect(render().find(node=>node.props.id==='friend-id')!.props.value).toBe('');
});
it.each(['success','failure'] as const)('ignores late %s after closing or account-key remount',async outcome=>{
    let resolve!:(value:boolean)=>void,reject!:(error:Error)=>void;
    h.send.mockReturnValue(new Promise<boolean>((yes,no)=>{resolve=yes;reject=no;}));
    await request();expect(h.send).toHaveBeenCalledOnce();unmount();const writes=h.writes;
    if(outcome==='success')resolve(true);else reject(new Error('expired'));
    await flush();expect(h.writes).toBe(writes);expect(h.directory).toHaveBeenCalledTimes(1);
});
