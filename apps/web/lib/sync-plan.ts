/** Insert-only deployment sync. Existing remote rows always win. */
export type SyncRow=Record<string,unknown>;
const sampleIds=new Set(['paper:2309.06180','repo:mksglu/context-mode']);
function sampleGroup(r:SyncRow){
 const p=r.payload as {author?:string;discovery?:{day?:string}};
 if(sampleIds.has(String(r.item_id))&&p?.author==='Codex · 问题驱动精读样章')return `sample:${r.item_id}`;
 if(r.level==='deep'&&p?.author==='Codex · 今日问题驱动精读'&&/^\d{4}-\d{2}-\d{2}$/.test(p.discovery?.day||''))return `daily:${r.item_id}:${p.discovery!.day}`;
 return '';
}
const iso=(value:unknown)=>(value instanceof Date?value:new Date(String(value))).toISOString();
export function rowKey(table:string,r:SyncRow):string {
 if(table==='readings')return JSON.stringify([r.item_id,r.level,iso(r.generated_at)]);
 if(table==='item_states')return JSON.stringify([r.user_id,r.item_id]);
 if(table==='picks')return JSON.stringify([r.edition,r.item_id]);
 return String(r.id);
}
/** Preservation checks use physical IDs, including legacy duplicate versions. */
export function rowIdentityKey(table:string,r:SyncRow):string {
 return table==='readings'?String(r.id):rowKey(table,r);
}
export function selectIncoming(table:string,rows:SyncRow[],existing:SyncRow[]){
 const latest=new Map<string,string>();
 if(table==='readings')for(const r of rows){const group=sampleGroup(r);if(group)latest.set(group,[latest.get(group)||'',iso(r.generated_at)].sort().at(-1)!);}
 const seen=new Set(existing.map(r=>rowKey(table,r)));
 const selected:SyncRow[]=[],skipped={existing:0,intermediateSample:0};
 for(const r of rows){
  if(table==='readings'&&sampleGroup(r)&&iso(r.generated_at)!==latest.get(sampleGroup(r))){skipped.intermediateSample++;continue;}
  const key=rowKey(table,r);
  if(seen.has(key)){skipped.existing++;continue;}
  seen.add(key);selected.push(r);
 }
 return {selected,skipped};
}
