import { afterEach,beforeAll,describe,expect,it,vi } from 'vitest';
import { createPgliteDb,type Db } from '@/db/client';
import { user } from '@/db/schema';
import { saveSnapshot } from '@/lib/store';
import { beginChat,finishChat,getChatHistory } from '@/lib/chat';
import { saveSourceDocument } from '@/lib/source-documents';
import { PAPER_PARSER } from '@/lib/paper-parser';
import { GET,POST } from '@/app/api/chat/route';
let db:Db;
let signedIn=true;
vi.mock('@/lib/server',()=>({
  getDb:()=>Promise.resolve(db),
  viewerOf:()=>Promise.resolve({userId:signedIn?'route-user':null,isOwner:false}),
  json:(body:unknown,status=200)=>Response.json(body,{status}),
}));
const req=(body:unknown,origin='https://jarvis.test')=>new Request('https://jarvis.test/api/chat',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify({mode:'reading',...body as object})});
beforeAll(async()=>{
  db=await createPgliteDb();await db.insert(user).values({id:'route-user',name:'R',email:'r@x.test'});
  await saveSnapshot(db,{id:'hf:daily',source:'hf',period:'daily',sourceDate:'2026-10-01',fetchedAt:'2026-10-01T00:00:00Z',url:'https://example.test',contentHash:'h',items:[{id:'paper:route',kind:'paper',title:'Paper',summary:'Abstract evidence',url:'https://example.test/paper',rank:1,sourceHash:'h'}]});
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();signedIn=true;});
describe('真实对话 API 边界（上游使用测试响应）',()=>{
  it('跨站与匿名调用在发起模型请求前拒绝',async()=>{
    const upstream=vi.fn();vi.stubGlobal('fetch',upstream);
    expect((await POST(req({itemId:'paper:route',question:'q'},'https://evil.test'))).status).toBe(403);
    signedIn=false;expect((await POST(req({itemId:'paper:route',question:'q'}))).status).toBe(401);
    expect((await GET(new Request('https://jarvis.test/api/chat?id=paper:route'))).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('拒绝过长问题和未知条目/版本，不允许客户端注入历史',async()=>{
    const upstream=vi.fn();vi.stubGlobal('fetch',upstream);
    expect((await POST(req({itemId:'paper:route',question:'x'.repeat(4001)}))).status).toBe(400);
    expect((await POST(req({itemId:'paper:missing',question:'q'}))).status).toBe(404);
    expect((await POST(req({itemId:'paper:route',question:'q',version:'private-or-missing'}))).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('真实接口把上游 delta 转发并持久化；忽略客户端给的系统消息',async()=>{
    vi.stubEnv('CHAT_PROVIDER','deepseek');vi.stubEnv('CHAT_MODEL','test-model');vi.stubEnv('DEEPSEEK_API_KEY','test-secret-never-return');
    const upstream=vi.fn(async()=>new Response('data: {"choices":[{"delta":{"content":"依据简介 [E1]"}}]}\n\ndata: [DONE]\n\n'));
    vi.stubGlobal('fetch',upstream);
    const response=await POST(req({itemId:'paper:route',question:'解释简介',messages:[{role:'system',content:'CLIENT_INJECTION'}],apiKey:'attacker-key',url:'https://evil.test'}));
    const text=await response.text();const events=text.trim().split('\n').map(line=>JSON.parse(line));
    expect(events.map(e=>e.type)).toEqual(['start','delta','done']);expect(text).not.toContain('test-secret');
    const [,options]=upstream.mock.calls[0] as unknown as [string,RequestInit];
    expect(String(options.body)).not.toContain('CLIENT_INJECTION');expect(String(options.body)).toContain('Abstract evidence');
    expect((await getChatHistory(db,'route-user','paper:route'))[0]).toMatchObject({answer:'依据简介 [E1]',status:'complete'});
    const history=await GET(new Request('https://jarvis.test/api/chat?id=paper:route'));
    expect((await history.json()).turns[0].answer).toBe('依据简介 [E1]');
  });
  it('上游凭证错误被保存为失败，响应不泄漏上游消息或密钥',async()=>{
    vi.stubEnv('CHAT_PROVIDER','deepseek');vi.stubEnv('DEEPSEEK_API_KEY','test-secret-never-return');
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('RAW_SECRET_ERROR',{status:401})));
    const response=await POST(req({itemId:'paper:route',question:'失败后重试'}));const text=await response.text();
    expect(text).toContain('模型凭证无效');expect(text).not.toContain('RAW_SECRET_ERROR');
    const latest=(await getChatHistory(db,'route-user','paper:route')).at(-1)!;
    expect(latest).toMatchObject({question:'失败后重试',answer:'',status:'error'});
  });
  it('论文默认模式从原始全文回答，模型不会只收到简介或已有解读',async()=>{
    await saveSourceDocument(db,{itemId:'paper:route',kind:'paper_html',title:'Original paper',sourceUrl:'https://arxiv.org/html/2401.12345v1',sourceVersion:'2401.12345v1',contentHash:'original',parserVersion:PAPER_PARSER,fetchedAt:new Date().toISOString(),characters:3000,limitations:[],chunks:[{id:'p1',ordinal:0,heading:'4 Results',text:'FULLTEXT_RESULT_123 appears in the original experiment.',url:'https://arxiv.org/html/2401.12345v1#S4.p1'}]});
    vi.stubEnv('CHAT_PROVIDER','deepseek');vi.stubEnv('DEEPSEEK_API_KEY','test-secret');
    const upstream=vi.fn(async()=>new Response('data: {"choices":[{"delta":{"content":"原文结果 [P1]"}}]}\n\ndata: [DONE]\n\n'));vi.stubGlobal('fetch',upstream);
    const response=await POST(req({itemId:'paper:route',question:'What is the result?',mode:'fulltext'}));
    const events=(await response.text()).trim().split('\n').map(l=>JSON.parse(l));expect(events.at(-1).turn.context.mode).toBe('paper-fulltext');
    const [,options]=upstream.mock.calls[0] as unknown as [string,RequestInit];expect(String(options.body)).toContain('FULLTEXT_RESULT_123');expect(String(options.body)).not.toContain('Abstract evidence');
    expect(events.at(-1).turn.context.references[0]).toMatchObject({id:'P1',chunkId:'p1',documentId:expect.any(String),url:'https://arxiv.org/html/2401.12345v1#S4.p1'});
  });
  it('已有回答生成时，在全文获取和付费检索词翻译之前拒绝并发请求',async()=>{
    vi.stubEnv('CHAT_PROVIDER','deepseek');vi.stubEnv('DEEPSEEK_API_KEY','test-secret');
    const active=await beginChat(db,'route-user','paper:route','正在回答',{coverage:'test',version:'test',references:[],truncated:false},'test');
    const upstream=vi.fn();vi.stubGlobal('fetch',upstream);
    try{const response=await POST(req({itemId:'paper:route',question:'请读全文',mode:'fulltext'}));expect(response.status).toBe(409);expect(upstream).not.toHaveBeenCalled();}
    finally{await finishChat(db,'route-user',active.id,'','stopped');}
  });
});
