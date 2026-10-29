import type {Board} from './types';
import type {DeskEntry} from './desk-types';

/** A previous or failed snapshot must never be presented as today's board. */
export function todayBoard(boards:Board[],source:Board['source'],period:Board['period'],day:string){
 return boards.find(b=>b.source===source&&b.period===period&&b.sourceDate===day&&!b.stale);
}
export function discoveryPapers(entries:DeskEntry[],boards:Board[],day:string){
 const board=todayBoard(boards,'hf','daily',day);
 const order=new Map(board?.items.map((item,i)=>[item.id,i])||[]);
 return entries.filter(e=>e.kind==='paper'&&order.has(e.id)).sort((a,b)=>order.get(a.id)!-order.get(b.id)!);
}
export function dailyStudies(entries:DeskEntry[],boards:Board[],day:string){
 const ids=new Set(boards.filter(b=>b.sourceDate===day&&!b.stale).flatMap(b=>b.items.map(e=>e.id)));
 return entries.filter(e=>e.dailyStudy?.day===day&&ids.has(e.id));
}
