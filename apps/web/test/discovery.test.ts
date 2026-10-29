import {describe,expect,it} from 'vitest';
import {dailyStudies,discoveryPapers,todayBoard} from '@/lib/discovery';
import {assembleCatalog} from '@/lib/desk-model';
import {sourceDay,sourceUrl} from '@/lib/sources';
import type {Board,Entry,Reading} from '@/lib/types';
import {createPgliteDb} from '@/db/client';
import {ensureDiscoveryToday,saveSnapshot,latestBoards} from '@/lib/store';

const day='2026-10-19';
const entry=(id:string):Entry=>({id,kind:'paper',title:id,summary:id,url:'https://example.test',rank:1,sourceHash:id});
const board=(date:string,items:Entry[]):Board=>({id:'hf:daily',source:'hf',period:'daily',sourceDate:date,fetchedAt:date+'T12:00:00Z',url:'https://example.test',items,contentHash:date});
describe('美东今日发现与历史分离',()=>{
 it('按今日原榜顺序展示，不把旧精读或离榜经典塞回今日',()=>{
  const a=entry('paper:a'),b=entry('paper:b'),classic=entry('paper:2309.06180');
  const boards=[board(day,[b,a]),board('2026-10-18',[a,classic])];
  const entries=assembleCatalog(boards,[]);
  expect(discoveryPapers(entries,boards,day).map(e=>e.id)).toEqual([b.id,a.id]);
  expect(entries.some(e=>e.id===classic.id)).toBe(true);
 });
 it('昨天或失败的快照不能冒充今日；资料仍保留在归档目录',()=>{
  const b=board('2026-10-18',[entry('paper:old')]);
  expect(todayBoard([b],'hf','daily',day)).toBeUndefined();
  expect(discoveryPapers(assembleCatalog([b],[]),[b],day)).toEqual([]);
  expect(todayBoard([{...b,sourceDate:day,stale:true}],'hf','daily',day)).toBeUndefined();
 });
 it('今日精读必须有当天选题记录且仍在当天榜中，次日不沿用',()=>{
  const e=entry('paper:new'),b=board(day,[e]);
  const r={itemId:e.id,level:'deep',title:'new',summary:'study',generatedAt:day+'T20:00:00Z',author:'a',sections:[],discovery:{day,board:'hf:daily',rank:1}} as unknown as Reading;
  const entries=assembleCatalog([b],[r]);
  expect(dailyStudies(entries,[b],day)).toHaveLength(1);
  expect(dailyStudies(entries,[b],'2026-10-20')).toEqual([]);
  expect(dailyStudies(entries,[board(day,[])],day)).toEqual([]);
 });
 it('UTC已跨日而美东未跨日时，HF请求仍指定美东日期',()=>{
  const date=sourceDay(new Date('2026-10-20T01:00:00Z'));
  expect(date).toBe(day);
  expect(sourceUrl('hf','daily',date)).toBe('https://huggingface.co/papers/date/'+day);
 });
 it('自动检查四榜，拒绝把来源旧日期改成今日，成功后在一小时内复用',async()=>{
  const db=await createPgliteDb();const now=Date.parse(day+'T12:00:00Z');
  await saveSnapshot(db,board('2026-10-18',[entry('paper:old')]));
  const calls:string[]=[];
  const fetcher=async(source:Board['source'],period:Board['period'])=>{calls.push(source+':'+period);return {...board(source==='hf'?'2026-10-18':day,[]),id:source+':'+period,source,period,fetchedAt:new Date(now).toISOString()};};
  expect((await ensureDiscoveryToday(db,fetcher,day,now)).notice).toContain('hf:daily');
  expect(calls).toEqual(['hf:daily','github:daily','github:weekly','github:monthly']);
  expect(todayBoard(await latestBoards(db),'hf','daily',day)).toBeUndefined();
  const success=async(source:Board['source'],period:Board['period'])=>{calls.push(source+':'+period);return {...board(day,[]),id:source+':'+period,source,period,fetchedAt:new Date(now+180_000).toISOString()};};
  expect((await ensureDiscoveryToday(db,success,day,now+180_000)).notice).toBe('');
  expect(calls).toHaveLength(5);
  await ensureDiscoveryToday(db,success,day,now+200_000);expect(calls).toHaveLength(5);
 });
});
