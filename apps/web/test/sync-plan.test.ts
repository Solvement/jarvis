import {describe,it,expect} from 'vitest';
import {selectIncoming,rowIdentityKey} from '@/lib/sync-plan';
describe('deployment insert-only sync',()=>{
 it('checks legacy rows with the same version by distinct physical IDs',()=>{
  const r={id:'first',item_id:'paper:1',level:'deep',generated_at:'2026-10-19T12:00:00Z'};
  expect(rowIdentityKey('readings',r)).not.toBe(rowIdentityKey('readings',{...r,id:'second'}));
 });
 it('preserves an existing online note and bookmark even when local state conflicts',()=>{
  const remote={user_id:'owner',item_id:'paper:1',note:'online note',starred:true,read_at:null};
  const local={...remote,note:'local note',starred:false,read_at:'2026-10-19'};
  expect(selectIncoming('item_states',[local],[remote]).selected).toEqual([]);
  expect(remote.note).toBe('online note');
 });
 it('does not duplicate or change visibility of an existing reading version with a different storage id',()=>{
  const remote={id:'old',item_id:'paper:1',level:'deep',generated_at:'2026-10-19T12:00:00Z',visibility:'public'};
  const local={...remote,id:'new',generated_at:'2026-10-19T08:00:00-04:00',visibility:'draft'};
  expect(selectIncoming('readings',[local],[remote]).selected).toEqual([]);
 });
 it('matches database Date objects to JSON timestamps without losing milliseconds',()=>{
  const remote={id:'old',item_id:'paper:1',level:'deep',generated_at:new Date('2026-10-19T12:00:00.067Z')};
  const local={...remote,id:'new',generated_at:'2026-10-19T12:00:00.067Z'};
  expect(selectIncoming('readings',[local],[remote]).selected).toEqual([]);
 });
 it('syncs the final sample revision and ordinary history, keeping its private visibility',()=>{
  const row={id:'a',item_id:'paper:2309.06180',level:'deep',generated_at:'2026-10-19T12:00:00Z',visibility:'draft',payload:{author:'Codex · 问题驱动精读样章'}};
  const latest={...row,id:'b',generated_at:'2026-10-19T13:00:00Z'};
  const history={...row,id:'c',payload:{author:'prior author'}};
  expect(selectIncoming('readings',[row,latest,history],[]).selected).toEqual([latest,history]);
 });
 it('keeps final daily drafts per item and source day without discarding another day',()=>{
  const row={id:'a',item_id:'paper:2610.18784',level:'deep',generated_at:'2026-10-19T12:00:00Z',payload:{author:'Codex · 今日问题驱动精读',discovery:{day:'2026-10-19'}}};
  const latest={...row,id:'b',generated_at:'2026-10-19T13:00:00Z'};
  const previous={...row,id:'c',generated_at:'2026-10-18T12:00:00Z',payload:{...row.payload,discovery:{day:'2026-10-18'}}};
  expect(selectIncoming('readings',[row,latest,previous],[]).selected).toEqual([latest,previous]);
 });
});
