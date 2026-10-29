import { createHash } from 'node:crypto';
import { and,desc,eq,lt } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { refreshLocks,sourceDocuments } from '@/db/schema';
import type { Entry } from './types';
import type { SourceDocument } from './source-types';
import { arxivId,PAPER_PARSER,parsePaperHtml,parsePaperPdf } from './paper-parser';
import { sourceFetch } from './source-network';

export class SourceError extends Error {constructor(message:string,public status=422){super(message);}}
export const sha256=(body:string|Uint8Array)=>createHash('sha256').update(body).digest('hex');
function pinPaperUrl(url:string,version:string,id:string) {
  const parsed=new URL(url);
  if(version.replace(/v\d+$/,'')===id.replace(/v\d+$/,'')&&/v\d+$/.test(version))parsed.pathname=parsed.pathname.replace(/(html|pdf)\/.+$/,`$1/${version}`);
  return parsed.href;
}
export async function getSourceDocument(db:Db,itemId:string,id?:string):Promise<SourceDocument|undefined> {
  const [row]=await db.select({payload:sourceDocuments.payload}).from(sourceDocuments)
    .where(id?and(eq(sourceDocuments.itemId,itemId),eq(sourceDocuments.id,id)):eq(sourceDocuments.itemId,itemId))
    .orderBy(desc(sourceDocuments.fetchedAt)).limit(1);
  return row?.payload as SourceDocument|undefined;
}
export async function saveSourceDocument(db:Db,document:Omit<SourceDocument,'id'>):Promise<SourceDocument> {
  const id=sha256(`${document.itemId}:${document.kind}:${document.sourceVersion}:${document.contentHash}:${document.parserVersion}`);
  const doc={...document,id};
  await db.insert(sourceDocuments).values({id,itemId:doc.itemId,kind:doc.kind,fetchedAt:new Date(doc.fetchedAt),payload:doc}).onConflictDoNothing();
  return (await getSourceDocument(db,doc.itemId,id))!;
}
export async function withSourceLock<T>(db:Db,itemId:string,work:()=>Promise<T>):Promise<T> {
  const id=`source:${itemId}`,expires=Date.now()+150000;
  const rows=await db.insert(refreshLocks).values({id,expires}).onConflictDoUpdate({target:refreshLocks.id,set:{expires},setWhere:lt(refreshLocks.expires,Date.now())}).returning({id:refreshLocks.id});
  if(!rows.length)throw new SourceError('原始材料正在获取，请稍后重试。',409);
  try{return await work();}finally{await db.delete(refreshLocks).where(and(eq(refreshLocks.id,id),eq(refreshLocks.expires,expires)));}
}
export async function fetchPaperDocument(entry:Entry,signal?:AbortSignal,preferPdf=false):Promise<Omit<SourceDocument,'id'>> {
  const id=arxivId(entry.id),fetchedAt=new Date().toISOString();
  let htmlFailure='';
  if(!preferPdf){
    try{
      const fetched=await sourceFetch(`https://arxiv.org/html/${id}`,{hosts:['arxiv.org','export.arxiv.org'],maxBytes:8_000_000,signal,timeout:25000});
      const parsed=parsePaperHtml(new TextDecoder().decode(fetched.body),fetched.url);
      const sourceUrl=pinPaperUrl(fetched.url,parsed.sourceVersion,id);
      return {...parsed,chunks:parsed.chunks.map(c=>({...c,url:c.url.replace(fetched.url,sourceUrl)})),itemId:entry.id,kind:'paper_html',sourceUrl,contentHash:sha256(fetched.body),parserVersion:PAPER_PARSER,fetchedAt};
    }catch(e){if(signal?.aborted)throw e;htmlFailure=e instanceof Error?e.message:'HTML 不可用';}
  }
  try{
    const fetched=await sourceFetch(`https://arxiv.org/pdf/${id}`,{hosts:['arxiv.org','export.arxiv.org'],maxBytes:25_000_000,signal,timeout:35000});
    const parsed=await parsePaperPdf(fetched.body,fetched.url,signal);
    const sourceUrl=pinPaperUrl(fetched.url,parsed.sourceVersion,id);
    return {...parsed,chunks:parsed.chunks.map(c=>({...c,url:c.url.replace(fetched.url,sourceUrl)})),title:parsed.title||entry.title,itemId:entry.id,kind:'paper_pdf',sourceUrl,contentHash:sha256(fetched.body),parserVersion:PAPER_PARSER,fetchedAt,
      limitations:[...parsed.limitations,...(htmlFailure?[`HTML 未采用：${htmlFailure}`]:[])]};
  }catch(e){throw new SourceError(`全文获取未完成：${e instanceof Error?e.message:'来源不可用'}。${htmlFailure?' HTML 也未取得有效正文。':''}可稍后重试；不会用摘要冒充全文。`);}
}
export async function ensurePaperDocument(db:Db,entry:Entry,options:{signal?:AbortSignal;force?:boolean;preferPdf?:boolean}={}) {
  if(!options.force){const cached=await getSourceDocument(db,entry.id);if(cached?.parserVersion===PAPER_PARSER)return cached;}
  return withSourceLock(db,entry.id,async()=>{
    if(!options.force){const cached=await getSourceDocument(db,entry.id);if(cached?.parserVersion===PAPER_PARSER)return cached;}
    return saveSourceDocument(db,await fetchPaperDocument(entry,options.signal,options.preferPdf));
  });
}
