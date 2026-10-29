// Run from apps/web. Credentials are injected by `vercel env run`; never printed.
// export-local requires the local dev server to be stopped (PGlite single process).
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {selectIncoming,rowIdentityKey,type SyncRow} from '../lib/sync-plan.ts';

const tables=['snapshots','readings','picks','source_documents','item_states','personal_collections','chat_turns'] as const;
type Table=typeof tables[number];
type Dump={format:'jarvis-library-sync-v1';createdAt:string;fingerprint:string;tables:Record<Table,SyncRow[]>;users:SyncRow[]};
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
function canonical(value:unknown):string {
 if(value instanceof Date)return JSON.stringify(value.toISOString());
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value);
}
const stamp=()=>new Date().toISOString();
async function read(file:string):Promise<Dump>{const d=JSON.parse(await fs.readFile(file,'utf8'));if(d.format!=='jarvis-library-sync-v1')throw Error('Invalid backup format');return d;}
async function write(file:string,value:unknown){await fs.mkdir(path.dirname(path.resolve(file)),{recursive:true});await fs.writeFile(file,JSON.stringify(value,null,2),{mode:0o600});}
const [mode,file,backupFile,reportFile]=process.argv.slice(2);
if(!mode||!file)throw Error('Usage: library-sync.ts export-local|backup|plan|apply|verify <file> [backup] [report]');
const local=mode==='export-local';
if(!local&&!process.env.DATABASE_URL)throw Error('DATABASE_URL must be injected for the existing production database');
const target=local?null:new URL(process.env.DATABASE_URL!);
const fingerprint=local?'local-pglite':sha(target!.hostname+target!.pathname);
let close=async()=>{};
let sql:ReturnType<typeof neon>|undefined;
let query:(sql:string,params?:unknown[])=>Promise<SyncRow[]>;
if(local){const {PGlite}=await import('@electric-sql/pglite');const p=new PGlite('.pglite');query=async(q,params)=>((await p.query(q,params)).rows as SyncRow[]);close=()=>p.close();}
else {sql=neon(process.env.DATABASE_URL!);query=async(q,params)=>(await sql!.query(q,params)) as SyncRow[];}
async function dump():Promise<Dump>{
 const present=new Set((await query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).map(r=>r.table_name));
 const content={} as Record<Table,SyncRow[]>;
 for(const table of tables)content[table]=present.has(table)?await query(`SELECT * FROM "${table}"`):[];
 const users=await query('SELECT id,email FROM "user"');
 return {format:'jarvis-library-sync-v1',createdAt:stamp(),fingerprint,tables:content,users};
}
function counts(d:Dump){return Object.fromEntries(tables.map(t=>[t,d.tables[t].length]));}
function assertTarget(d:Dump){if(d.fingerprint!==fingerprint)throw Error('Production target differs from the saved backup; refusing to write');}
function assertPreserved(before:Dump,after:Dump){
 const preserved:Record<string,number>={};
 for(const table of tables){
  const current=new Map(after.tables[table].map(r=>[rowIdentityKey(table,r),r]));
  for(const old of before.tables[table]){const now=current.get(rowIdentityKey(table,old));if(!now||canonical(now)!==canonical(old))throw Error(`Existing remote row changed in ${table}; no automatic overwrite or restore attempted`);}
  preserved[table]=before.tables[table].length;
 }
 return preserved;
}
try{
 if(local||mode==='backup'){
  const data=await dump();await write(file,data);
  console.log(JSON.stringify({ok:true,operation:mode,counts:counts(data),fingerprint,dataHash:sha(canonical(data))}));
 }else if(mode==='verify'){
  const before=await read(file);assertTarget(before);const after=await dump();const preserved=assertPreserved(before,after);
  const report={ok:true,checkedAt:stamp(),preserved,before:counts(before),after:counts(after),fingerprint};
  if(backupFile)await write(backupFile,report);console.log(JSON.stringify(report));
 }else if(mode==='plan'||mode==='apply'){
  if(!backupFile)throw Error('A saved production backup is required');
  const incoming=await read(file),before=await read(backupFile);assertTarget(before);
  const current=await dump();assertPreserved(before,current);
  const allowed=new Set((process.env.OWNER_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));
  const owners=current.users.filter(u=>allowed.has(String(u.email).toLowerCase()));
  const personal=tables.filter(t=>['item_states','personal_collections','chat_turns'].includes(t));
  if(personal.some(t=>incoming.tables[t].some(r=>r.user_id==='local-owner'))&&owners.length!==1)throw Error('Exactly one existing owner account is required to map local personal records');
  const userIds=new Set(current.users.map(u=>u.id));
  const plan={} as Record<Table,ReturnType<typeof selectIncoming>>;
  for(const table of tables){
   const rows=incoming.tables[table].map(r=>{
    if(!personal.includes(table))return r;
    const id=r.user_id==='local-owner'?owners[0].id:r.user_id;
    if(!userIds.has(id))throw Error('Unknown existing user; refusing to create or merge identities');
    return {...r,user_id:id,...table==='chat_turns'&&r.status==='streaming'?{status:'stopped'}:{}};
   });
   plan[table]=selectIncoming(table,rows,current.tables[table]);
  }
  const report={operation:mode,createdAt:stamp(),fingerprint,insert:Object.fromEntries(tables.map(t=>[t,plan[t].selected.length])),skipped:Object.fromEntries(tables.map(t=>[t,plan[t].skipped])),personalPolicy:'INSERT ONLY: every existing online state, note, collection and conversation remains unchanged; conflicts retained in local export'};
  if(mode==='apply'){
   // No DELETE/UPDATE/UPSERT. Primary-key races are ignored, never overwritten.
   for(const table of tables){
    let batch:ReturnType<NonNullable<typeof sql>['query']>[]=[],bytes=0;
    async function flush(){if(batch.length)await sql!.transaction(batch);batch=[];bytes=0;}
    for(const row of plan[table].selected){
     const size=Buffer.byteLength(JSON.stringify(row));if(batch.length&&(batch.length>=40||bytes+size>2_500_000))await flush();
     const columns=Object.keys(row);if(columns.some(c=>!/^[a-z_]+$/.test(c)))throw Error('Invalid column');
     const values=columns.map(c=>row[c]&&typeof row[c]==='object'?JSON.stringify(row[c]):row[c]);
     batch.push(sql!.query(`INSERT INTO "${table}" (${columns.map(c=>'"'+c+'"').join(',')}) VALUES (${columns.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT DO NOTHING`,values));bytes+=size;
    }
    await flush();
   }
   const after=await dump();assertPreserved(before,after);await write(backupFile+'.after.json',after);
  }
  if(reportFile)await write(reportFile,report);console.log(JSON.stringify({ok:true,...report}));
 }else throw Error('Unknown operation');
}finally{await close();}
