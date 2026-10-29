import { chooseReading,entryContent } from '@/lib/catalog';
import { assertChatAvailable,beginChat,buildChatContext,ChatError,chatSystemPrompt,completionDeltas,expandSourceQuery,finishChat,getChatHistory,historyMessages,modelConfig,modelInfo,upstreamError } from '@/lib/chat';
import { ensurePaperDocument,getSourceDocument,SourceError } from '@/lib/source-documents';
import { originalChatContext } from '@/lib/source-retrieval';
import { isSameOrigin } from '@/lib/access';
import { getDb,json,viewerOf } from '@/lib/server';

export const runtime='nodejs';
export const maxDuration=240;

export async function GET(request:Request) {
  try { return await getChat(request); }
  catch { return json({error:'私人对话暂不可用，请重试。'},503); }
}
async function getChat(request:Request) {
  const viewer=await viewerOf(request);
  if (!viewer.userId) return json({error:'请先登录后使用私人对话'},401);
  const id=new URL(request.url).searchParams.get('id');
  if (!id || id.length>300) return json({error:'需要条目编号'},400);
  return json({turns:await getChatHistory(await getDb(),viewer.userId,id),model:modelInfo()});
}
export async function POST(request:Request) {
  try { return await postChat(request); }
  catch(e) { return json({error:e instanceof SourceError||e instanceof ChatError?e.message:'对话暂不可用，请稍后重试。'},e instanceof SourceError||e instanceof ChatError?e.status:503); }
}
async function postChat(request:Request) {
  if (!isSameOrigin(request)) return json({error:'请从本站提问'},403);
  const viewer=await viewerOf(request);
  if (!viewer.userId) return json({error:'请先登录后使用私人对话'},401);
  const body=await request.json().catch(()=>null);
  if (!body || typeof body.itemId!=='string' || body.itemId.length>300 || typeof body.question!=='string' || !body.question.trim() || body.question.length>4000 || body.version!==undefined && typeof body.version!=='string' || body.mode!==undefined&&!['fulltext','reading','code'].includes(body.mode)) return json({error:'问题需要 1–4000 字，依据模式须有效'},400);
  const db=await getDb();
  const {entry,versions}=await entryContent(db,viewer,body.itemId);
  if (!entry) return json({error:'条目不存在或尚未公开'},404);
  const reading=chooseReading(versions,body.version);
  if (body.version && !reading) return json({error:'阅读版本不存在或尚未公开'},404);
  const config=modelConfig();
  if (!config.configured) return json({error:'服务器尚未配置可用模型。'},503);
  // 检索词翻译也会调用真实模型，先拒绝并发/限流请求，避免无效开销。
  await assertChatAvailable(db,viewer.userId);
  let context;
  if(entry.kind==='paper'&&body.mode!=='reading'){
    const doc=await ensurePaperDocument(db,entry,{signal:request.signal});
    context=originalChatContext(doc,await expandSourceQuery(body.question,doc,request.signal));
  }else if(entry.kind==='project'&&body.mode==='code'){
    const doc=await getSourceDocument(db,entry.id);
    if(!doc?.repository)return json({error:'请先在「源码精读」里建立源码证据包，再基于代码提问。'},422);
    context=originalChatContext(doc,await expandSourceQuery(body.question,doc,request.signal));
  }else context=buildChatContext(entry,reading,body.question);
  const previous=await getChatHistory(db,viewer.userId,entry.id);
  let turn;
  try { turn=await beginChat(db,viewer.userId,entry.id,body.question.trim(),context,config.model); }
  catch(e) { return json({error:e instanceof Error ? e.message:'提问失败'},e instanceof ChatError ? e.status:500); }
  const abort=new AbortController();
  let userStopped=false;
  const stop=()=>{userStopped=true;abort.abort();};
  request.signal.addEventListener('abort',stop,{once:true});
  const timeout=setTimeout(()=>abort.abort(),90_000);
  let answer='', connected=true;
  const encoder=new TextEncoder();
  const stream=new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit=(value:unknown)=>{if(connected)try{controller.enqueue(encoder.encode(JSON.stringify(value)+'\n'));}catch{connected=false;stop();}};
      emit({type:'start',turn});
      let status:'complete'|'stopped'|'error'='error',error='';
      try {
        const upstream=await fetch(`${config.base}/chat/completions`,{method:'POST',signal:abort.signal,
          headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.key}`},
          body:JSON.stringify({model:config.model,stream:true,messages:[{role:'system',content:chatSystemPrompt(context)},...historyMessages(previous,context),{role:'user',content:body.question.trim()}],
            ...(config.provider==='deepseek' ? {max_tokens:2400,thinking:{type:'disabled'}}:{max_completion_tokens:4000,store:false})}),
        });
        if (!upstream.ok || !upstream.body) { await upstream.body?.cancel(); throw new ChatError(upstreamError(upstream.status),502); }
        for await (const delta of completionDeltas(upstream.body)) {
          answer+=delta; emit({type:'delta',text:delta});
          if (answer.length>24000) { abort.abort(); throw new ChatError('回答超过长度上限，已保留生成部分。',502); }
        }
        if (!answer.trim()) throw new ChatError('模型未返回文字，请重试。',502);
        status='complete';
      } catch(e) {
        status=userStopped ? 'stopped':'error';
        error=e instanceof ChatError ? e.message:abort.signal.aborted ? '生成超时，已保留问题和收到的内容。':'模型连接失败，请重试。';
      } finally {
        clearTimeout(timeout); request.signal.removeEventListener('abort',stop);
        try { const saved=await finishChat(db,viewer.userId!,turn.id,answer,status); emit({type:status==='error'?'error':'done',turn:saved,...(status==='error'?{error}: {})}); }
        catch { emit({type:'error',error:'对话保存失败，请刷新确认。'}); }
        if (connected) controller.close();
      }
    },
    cancel() { connected=false;stop(); },
  });
  return new Response(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
}
