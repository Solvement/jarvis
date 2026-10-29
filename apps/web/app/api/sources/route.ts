import { entryContent } from '@/lib/catalog';
import { isSameOrigin } from '@/lib/access';
import { ensurePaperDocument,getSourceDocument,SourceError } from '@/lib/source-documents';
import { ensureProjectDocument } from '@/lib/project-source';
import { sourceSummary } from '@/lib/source-types';
import { getDb,json,viewerOf } from '@/lib/server';
export const runtime='nodejs';
export const maxDuration=120;
export async function GET(request:Request){
  try{
    const viewer=await viewerOf(request);if(!viewer.userId)return json({error:'请先登录后读取原始材料'},401);
    const p=new URL(request.url).searchParams,id=p.get('itemId');if(!id||id.length>300)return json({error:'需要有效条目'},400);
    const db=await getDb();const {entry}=await entryContent(db,viewer,id);if(!entry)return json({error:'条目不存在或尚未公开'},404);
    const doc=await getSourceDocument(db,id,p.get('documentId')||undefined);
    return json({document:doc?(p.get('summary')==='1'?sourceSummary(doc):doc):null});
  }catch{return json({error:'原始材料暂不可用，请重试'},503);}
}
export async function POST(request:Request){
  if(!isSameOrigin(request))return json({error:'请从本站获取原始材料'},403);
  try{
    const viewer=await viewerOf(request);if(!viewer.userId)return json({error:'请先登录后获取原始材料'},401);
    const body=await request.json().catch(()=>null);if(!body||typeof body.itemId!=='string'||body.itemId.length>300||body.paths!==undefined&&(!Array.isArray(body.paths)||body.paths.length>10||body.paths.some((p:unknown)=>typeof p!=='string'||p.length>300)))return json({error:'原始材料请求无效'},400);
    const db=await getDb();const {entry}=await entryContent(db,viewer,body.itemId);if(!entry)return json({error:'条目不存在或尚未公开'},404);
    const options={signal:AbortSignal.any([request.signal,AbortSignal.timeout(105_000)]),force:body.force===true};
    const document=entry.kind==='paper'?await ensurePaperDocument(db,entry,options):await ensureProjectDocument(db,entry,{...options,paths:body.paths});
    return json({document});
  }catch(e){return json({error:e instanceof SourceError?e.message:e instanceof Error?`获取未完成：${e.message}`:'原始材料获取未完成'},e instanceof SourceError?e.status:502);}
}
