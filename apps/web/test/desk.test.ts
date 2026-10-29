import { beforeAll,describe,expect,it } from 'vitest';
import { createPgliteDb,type Db } from '@/db/client';
import { user } from '@/db/schema';
import { deleteCollection,getCollections,saveCollection } from '@/lib/personal';
import { beginChat,buildChatContext,chatSystemPrompt,completionDeltas,finishChat,getChatHistory,historyMessages } from '@/lib/chat';
import { assembleCatalog,chooseReading } from '@/lib/desk-model';
import { catalogContent } from '@/lib/catalog';
import { importReadings,saveSnapshot,setItemState,getItemStates } from '@/lib/store';
import type { Board,Entry,Reading } from '@/lib/types';
import type { ChatContext } from '@/lib/desk-types';

let db:Db;
beforeAll(async()=>{db=await createPgliteDb();await db.insert(user).values([{id:'a',name:'A',email:'a@x.test'},{id:'b',name:'B',email:'b@x.test'}]);});
const entry:Entry={id:'paper:one',kind:'paper',title:'Memory paper',summary:'Abstract only',url:'https://example.test/paper',rank:1,sourceHash:'h'};
const board=(date:string,items:Entry[]):Board=>({id:'hf:daily',source:'hf',period:'daily',sourceDate:date,fetchedAt:date+'T12:00:00Z',url:'https://example.test',contentHash:date,items});
const reading:Reading={itemId:entry.id,sourceHash:'h',entry,level:'brief',title:'已有解读',summary:'摘要',author:'作者',coverage:'abstract',generatedAt:'2026-10-01T13:00:00Z',sections:[{heading:'观察',body:'Only an abstract; no experiment was read.',citations:['S1']}],sources:[{id:'S1',title:'source',url:entry.url}],limitations:['未读全文']};
const context:ChatContext={coverage:'abstract',version:'v',truncated:false,references:[{id:'E1',title:'摘要',text:'Only abstract'}]};

describe('真实内容目录',()=>{
  it('保留离榜条目、去重、真实归档日期及实际阅读层级',()=>{
    const entries=assembleCatalog([board('2026-10-02',[{...entry,id:'paper:new'}]),board('2026-10-01',[entry]),board('2026-09-30',[entry])],[reading]);
    expect(entries.map(e=>e.id)).toEqual(['paper:new','paper:one']);
    expect(entries[1]).toMatchObject({displayTitle:'已有解读',editions:['2026-10-01','2026-09-30'],levels:['brief'],topics:['Memory']});
  });
  it('公开目录不把私人草稿的标题/内容带给访客',async()=>{
    await saveSnapshot(db,board('2026-10-01',[entry]));
    await importReadings(db,[{...reading,title:'PRIVATE DRAFT'}],{visibility:'draft'});
    expect(JSON.stringify(await catalogContent(db,{isOwner:false}))).not.toContain('PRIVATE DRAFT');
    expect(JSON.stringify(await catalogContent(db,{isOwner:true}))).toContain('PRIVATE DRAFT');
    expect(chooseReading([reading],'missing')).toBeUndefined();
  });
  it('项目列表优先白话介绍，历史精读与论文的默认阅读保持独立',()=>{
    const project:Entry={...entry,id:'repo:org/project',kind:'project',title:'org/project'};
    const prior:Reading={...reading,itemId:project.id,level:'deep',title:'旧精读',summary:'旧判断'};
    const intro:Reading={...reading,itemId:project.id,generatedAt:'2026-10-19T18:00:00Z',level:'translation',format:'project_intro',title:'项目用途',summary:'这是做什么的',coverage:'readme',sections:[{heading:'举个例子',body:'一个用途例子',citations:['S1']}]};
    const entries=assembleCatalog([board('2026-10-19',[project,entry])],[intro,prior,reading]);
    expect(entries.find(e=>e.id===project.id)).toMatchObject({description:'这是做什么的',introduction:{example:'一个用途例子',version:`${intro.generatedAt}:translation`}});
    expect(chooseReading([intro,prior])).toBe(prior);expect(entries.find(e=>e.id===entry.id)!.description).toBe(reading.summary);
  });
});
describe('数据库里的私人沉淀',()=>{
  it('收藏和笔记独立更新，重新读取后仍在，其他用户不可见',async()=>{
    await setItemState(db,'a',entry.id,{starred:true,note:'我自己的理解'});
    await setItemState(db,'a',entry.id,{read:true});
    expect((await getItemStates(db,'a'))[entry.id]).toMatchObject({starred:true,note:'我自己的理解',readAt:expect.any(String)});
    expect(await getItemStates(db,'b')).toEqual({});
  });
  it('合集增删和改名保留；不能越权改别人的合集',async()=>{
    const [c]=await saveCollection(db,'a',{title:'路径',items:[entry.id,entry.id]});
    expect((await getCollections(db,'a'))[0].items).toEqual([entry.id]);
    await expect(saveCollection(db,'b',{id:c.id,title:'偷改',items:[]})).rejects.toThrow('不存在');
    await deleteCollection(db,'b',c.id);
    await saveCollection(db,'a',{...c,title:'新标题',items:[]});
    expect((await getCollections(db,'a'))[0]).toMatchObject({title:'新标题',items:[]});
    await deleteCollection(db,'a',c.id);expect(await getCollections(db,'a')).toEqual([]);
    expect((await getItemStates(db,'a'))[entry.id].note).toBe('我自己的理解');
  });
  it('对话按用户和条目隔离；数据库限制同时只生成一条',async()=>{
    const turn=await beginChat(db,'a',entry.id,'第一个问题',context,'model');
    await expect(beginChat(db,'a',entry.id,'重复发送',context,'model')).rejects.toThrow('正在生成');
    await finishChat(db,'a',turn.id,'答案 [E1]','complete');
    expect((await getChatHistory(db,'a',entry.id))[0]).toMatchObject({question:'第一个问题',answer:'答案 [E1]',status:'complete'});
    expect(await getChatHistory(db,'b',entry.id)).toEqual([]);
    expect(await getChatHistory(db,'a','other')).toEqual([]);
    const next=await beginChat(db,'a',entry.id,'停止的问题',context,'model');
    await finishChat(db,'a',next.id,'部分回答','stopped');
    const messages=historyMessages(await getChatHistory(db,'a',entry.id),{...context,references:[{id:'E7',title:'摘要',text:'Only abstract'}]});
    expect(messages).toHaveLength(2);expect(messages[1].content).toBe('答案 [E7]');
    expect(historyMessages(await getChatHistory(db,'a',entry.id),{...context,version:'other-version'})).toEqual([]);
  });
});
describe('实际证据上下文与流',()=>{
  it('简介不会冒充全文；只发送当前条目的文本，不发送 iframe 脚本',()=>{
    const [e]=assembleCatalog([board('2026-10-01',[entry])],[]);
    const c=buildChatContext(e,undefined,'解释');
    expect(c.coverage).toContain('未获取全文');expect(c.references).toHaveLength(1);
    const r={...reading,sections:[{...reading.sections[0],figure:{title:'图',caption:'说明',html:'<script>PRIVATE_SCRIPT</script>',height:300}}]};
    const full=buildChatContext(e,r,'解释');
    expect(JSON.stringify(full)).not.toContain('PRIVATE_SCRIPT');expect(full.references.some(ref=>ref.section===0)).toBe(true);
    expect(chatSystemPrompt(full)).toMatch(/链接不.*读过/);
  });
  it('过长材料明确标记截取',()=>{
    const [e]=assembleCatalog([board('2026-10-01',[entry])],[reading]);
    const c=buildChatContext(e,{...reading,sections:[{...reading.sections[0],body:'内容'.repeat(10000)}]},'解释');
    expect(c.truncated).toBe(true);expect(c.references.find(ref=>ref.section===0)!.text.length).toBeLessThanOrEqual(5000);
  });
  it('换一个问题的相关度排序不会改变同一章节的引用编号',()=>{
    const [e]=assembleCatalog([board('2026-10-01',[entry])],[reading]);
    const r={...reading,sections:[{...reading.sections[0],body:'memory mechanism'},{...reading.sections[0],body:'evaluation benchmark'}]};
    const first=buildChatContext(e,r,'memory'),second=buildChatContext(e,r,'evaluation');
    expect(first.references.find(x=>x.section===0)?.id).toBe('E3');
    expect(second.references.find(x=>x.section===0)?.id).toBe('E3');
    expect(second.references.find(x=>x.section===1)?.id).toBe('E4');
  });
  it('处理跨 UTF8 分块、CRLF 和保活；只取正文 delta',async()=>{
    const encoded=new TextEncoder().encode(': keepalive\r\ndata: {"choices":[{"delta":{"reasoning_content":"hidden"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"真实中文"}}]}\n\ndata: [DONE]');
    const stream=new ReadableStream<Uint8Array>({start(c){for(let i=0;i<encoded.length;i+=3)c.enqueue(encoded.slice(i,i+3));c.close();}});
    const answer=[];for await(const delta of completionDeltas(stream))answer.push(delta);
    expect(answer.join('')).toBe('真实中文');
  });
  it('连接未完成不能被当成成功回答',async()=>{
    const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'));c.close();}});
    await expect((async()=>{for await(const _ of completionDeltas(stream)){/* consume */}})()).rejects.toThrow('提前结束');
  });
});
