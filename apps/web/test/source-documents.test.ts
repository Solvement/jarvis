import { beforeAll,describe,expect,it,vi,afterEach } from 'vitest';
import { createPgliteDb,type Db } from '@/db/client';
import { sourceFetch } from '@/lib/source-network';
import { arxivId,parsePaperHtml,pdfPageChunks } from '@/lib/paper-parser';
import { fetchPaperDocument,getSourceDocument,saveSourceDocument,withSourceLock } from '@/lib/source-documents';
import { originalChatContext,selectSourceChunks } from '@/lib/source-retrieval';
import { codeChunks,repositoryName,selectInitialFiles } from '@/lib/project-source';
import { ensureGithubToday,latestBoards,saveSnapshot } from '@/lib/store';
import { sourceDay } from '@/lib/sources';
import type { SourceDocument } from '@/lib/source-types';
import type { Board,Entry,Period } from '@/lib/types';
let db:Db;
beforeAll(async()=>{db=await createPgliteDb();});
afterEach(()=>vi.unstubAllGlobals());
const text='The experiment uses a strong baseline and reports limitations. '.repeat(55);
const source:Omit<SourceDocument,'id'>={itemId:'paper:2401.12345',kind:'paper_html',title:'Paper',sourceUrl:'https://arxiv.org/html/2401.12345v1',sourceVersion:'2401.12345v1',contentHash:'h1',parserVersion:'test',fetchedAt:'2026-10-19T12:00:00Z',chunks:[{id:'p1',ordinal:0,heading:'Introduction',text,url:'https://arxiv.org/html/2401.12345v1#S1.p1'}],characters:text.length,limitations:[]};
const paper:Entry={id:source.itemId,kind:'paper',title:'Paper',summary:'ABSTRACT_ONLY',url:'https://arxiv.org/abs/2401.12345',rank:1,sourceHash:'test'};
function textPdfFixture() {
  const stream='BT /F1 9 Tf 12 TL 30 750 Td '+Array.from({length:36},(_,i)=>`(Original experiment paragraph ${i}: results baseline evaluation limitations verification.) Tj T*`).join('\n')+' ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let body='%PDF-1.4\n';const offsets=[0];
  objects.forEach((object,i)=>{offsets.push(body.length);body+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const start=body.length;body+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return body;
}
describe('原文获取边界',()=>{
  it('只接受明确的 arXiv ID 和公开 GitHub 项目标识',()=>{
    expect(arxivId('paper:2401.12345v2')).toBe('2401.12345v2');expect(arxivId('paper:cs/9901001')).toBe('cs/9901001');
    expect(()=>arxivId('paper:https://127.0.0.1/secret')).toThrow();expect(()=>repositoryName('repo:../../secret')).toThrow();
  });
  it('初始地址和每次重定向都检查白名单，限制字节数',async()=>{
    const request=vi.fn(async()=>new Response('',{status:302,headers:{location:'http://169.254.169.254/metadata'}}));vi.stubGlobal('fetch',request);
    await expect(sourceFetch('https://arxiv.org/html/1',{hosts:['arxiv.org'],maxBytes:100})).rejects.toThrow('不在允许范围');expect(request).toHaveBeenCalledTimes(1);
    request.mockImplementation(async()=>new Response('x'.repeat(200)));
    await expect(sourceFetch('https://arxiv.org/html/1',{hosts:['arxiv.org'],maxBytes:100})).rejects.toThrow('大小上限');
    await expect(sourceFetch('https://arxiv.org.evil.test/x',{hosts:['arxiv.org'],maxBytes:100})).rejects.toThrow('不在允许范围');
  });
});
describe('HTML/PDF 原文定位',()=>{
  it('保留段落锚点、章节层级、公式和表格，不执行脚本或只留摘要',()=>{
    const html=`<html><title>Paper</title><body><article class="ltx_document"><h1>Paper</h1><h2>1 Introduction</h2><p id="intro">${text}</p><h2>2 Experiments</h2><h3>2.1 Results</h3><div class="ltx_p" id="result">Important original result beyond the abstract. <math alttext="H_t = 1 - P_t"><mi>wrong duplicate</mi></math></div><table id="T1"><tr><th>Baseline</th><td>42</td></tr></table><script>UNTRUSTED_SCRIPT()</script></article></body></html>`;
    const parsed=parsePaperHtml(html,'https://arxiv.org/html/2401.12345v1');
    expect(parsed.chunks.some(c=>c.anchor==='result'&&c.heading.includes('2.1 Results')&&c.text.includes('H_t = 1 - P_t'))).toBe(true);
    expect(parsed.chunks.some(c=>c.url.endsWith('#result'))).toBe(true);expect(parsed.chunks.some(c=>c.text.includes('Baseline | 42'))).toBe(true);
    expect(JSON.stringify(parsed)).not.toContain('UNTRUSTED_SCRIPT');expect(JSON.stringify(parsed)).not.toContain('wrong duplicate');
    expect(()=>parsePaperHtml('<html><h1>Abstract only</h1></html>','https://arxiv.org/html/1')).toThrow('正文');
  });
  it('PDF 片段保留原页码与文字坐标',()=>{
    const chunks=pdfPageChunks([{str:'A real passage from the original paper.',transform:[1,0,0,1,20,700],width:260,height:12},{str:'Second line on the same page.',transform:[1,0,0,1,20,680],width:220,height:12}],7,'https://arxiv.org/pdf/2401.12345v1',12);
    expect(chunks[0]).toMatchObject({id:'p13',ordinal:12,page:7,url:'https://arxiv.org/pdf/2401.12345v1#page=7'});
    expect(chunks[0].boxes?.[0]).toEqual({x:20,y:700,width:260,height:12});
  });
  it('HTML 不可用时，实际 PDF 解析器接管并保留页码与坐标',async()=>{
    const request=vi.fn(async(url:string|URL|Request)=>String(url).includes('/html/')?new Response('not found',{status:404}):new Response(textPdfFixture(),{headers:{'content-type':'application/pdf'}}));vi.stubGlobal('fetch',request);
    const parsed=await fetchPaperDocument(paper);
    expect(request).toHaveBeenCalledTimes(2);expect(parsed.kind).toBe('paper_pdf');expect(parsed.pages).toBe(1);
    expect(parsed.chunks[0]).toMatchObject({page:1,url:'https://arxiv.org/pdf/2401.12345#page=1'});expect(parsed.chunks[0].boxes!.length).toBeGreaterThan(0);
    expect(parsed.characters).toBeGreaterThan(2000);expect(parsed.chunks.map(c=>c.text).join(' ')).toContain('Original experiment paragraph');
    expect(parsed.limitations.some(l=>l.includes('HTML 未采用'))).toBe(true);
  });
  it('两个全文来源都失败时明确失败，不返回摘要或空的成功结果',async()=>{
    const request=vi.fn(async()=>new Response('offline',{status:503}));vi.stubGlobal('fetch',request);
    await expect(fetchPaperDocument(paper)).rejects.toThrow('不会用摘要冒充全文');expect(request).toHaveBeenCalledTimes(2);
  });
});
describe('不可变原文快照和完整语料检索',()=>{
  it('修订会产生新快照；旧引用仍能读取准确原文',async()=>{
    const first=await saveSourceDocument(db,source);const second=await saveSourceDocument(db,{...source,contentHash:'h2',sourceVersion:'2401.12345v2',fetchedAt:'2026-10-19T13:00:00Z',chunks:[{...source.chunks[0],text:'A new result'}]});
    expect(first.id).not.toBe(second.id);expect((await getSourceDocument(db,source.itemId,first.id))!.chunks[0].text).toBe(text);
    expect((await getSourceDocument(db,source.itemId))!.id).toBe(second.id);
    expect(await getSourceDocument(db,'paper:other',first.id)).toBeUndefined();
  });
  it('同一条目获取串行，失败后释放锁以便重试',async()=>{
    let release!:()=>void;const work=withSourceLock(db,'paper:lock',()=>new Promise<void>(resolve=>{release=resolve;}));
    while(!release)await new Promise(resolve=>setTimeout(resolve,1));
    await expect(withSourceLock(db,'paper:lock',async()=>true)).rejects.toThrow('正在获取');release();await work;
    await expect(withSourceLock(db,'paper:lock',async()=>{throw new Error('fail');})).rejects.toThrow('fail');
    expect(await withSourceLock(db,'paper:lock',async()=>true)).toBe(true);
  });
  it('从摘要之外检索实验，返回可定位原文引用而非既有解读',()=>{
    const doc:SourceDocument={...source,id:'doc',characters:100000,chunks:Array.from({length:100},(_,i)=>({id:`p${i+1}`,ordinal:i,heading:i===85?'4 Experiments':'Background',text:i===85?'Ablation benchmark original result is 42.':'General unrelated background. '.repeat(20),url:`https://arxiv.org/html/2401.12345v1#p${i+1}`}))};
    const picked=selectSourceChunks(doc,'实验消融结果',5000);expect(picked.chunks.some(c=>c.id==='p86')).toBe(true);expect(picked.truncated).toBe(true);
    const context=originalChatContext(doc,'实验结果');expect(context.mode).toBe('paper-fulltext');expect(context.references.find(r=>r.id==='P86')).toMatchObject({documentId:'doc',chunkId:'p86'});
    expect(context.references.every(r=>r.id.startsWith('P'))).toBe(true);
  });
  it('正文指向附录时追踪章节层级，避免只取公式而遗漏设计理由',()=>{
    const chunks=Array.from({length:90},(_,i)=>({id:`p${i+1}`,ordinal:i,heading:i===70?'Appendix B / B.3 Design rationale / Aggregation':'Unrelated',text:i===1?'Health estimation formula; see Appendix B.3 for design rationale.':i===70?'A zero factor makes the geometric aggregation miss the failure.':'Background. '.repeat(100),url:`https://arxiv.org/html/2401.12345v1#p${i+1}`}));
    const result=selectSourceChunks({...source,id:'cross-ref',characters:100000,chunks},'health estimation formula',6000);
    expect(result.chunks.some(c=>c.ordinal===70)).toBe(true);
  });
});
describe('源码证据包',()=>{
  it('初始包包含实现和测试；README/多个 manifest 不能挤掉核心代码',()=>{
    const paths=['README.md','package.json','pkg/a/package.json','pkg/b/package.json','src/main.ts','src/runtime.ts','tests/runtime.test.ts','node_modules/evil/index.js'];
    const selected=selectInitialFiles(paths.map(path=>({path,size:1000})));expect(selected).toContain('src/main.ts');expect(selected).toContain('tests/runtime.test.ts');expect(selected).not.toContain('node_modules/evil/index.js');expect(selected.length).toBeLessThanOrEqual(10);
  });
  it('源码行号和链接固定到真实 commit',()=>{
    const [chunk]=codeChunks('src/main.ts','function run() {\n return 42;\n}', 'org/repo','a'.repeat(40),0);
    expect(chunk).toMatchObject({path:'src/main.ts',lineStart:1,lineEnd:3});expect(chunk.url).toContain(`/blob/${'a'.repeat(40)}/src/main.ts#L1-L3`);
  });
  it('模型、Go 后端和 Infra 的清单与实现都能进入证据包',()=>{
    const paths=['README.md','go.mod','pom.xml','cmd/main.go','model/attention.cu','infra/main.tf','tests/model_test.py'];
    const selected=selectInitialFiles(paths.map(path=>({path,size:1000})));
    for(const path of paths)expect(selected).toContain(path);
  });
});
describe('美东当日 GitHub 三榜',()=>{
  const board=(period:Period,date:string):Board=>({id:`github:${period}`,source:'github',period,sourceDate:date,fetchedAt:date+'T12:00:00Z',url:'https://github.com/trending',items:[],contentHash:date});
  it('美东日界线与冬夏令时正确',()=>{
    expect(sourceDay(new Date('2026-10-19T03:30:00Z'))).toBe('2026-10-18');expect(sourceDay(new Date('2026-10-19T04:30:00Z'))).toBe('2026-10-19');
    expect(sourceDay(new Date('2026-12-19T04:30:00Z'))).toBe('2026-12-18');
  });
  it('新的一天补取三榜，失败保留实际旧日期，不能标成今天',async()=>{
    for(const period of ['daily','weekly','monthly'] as const)await saveSnapshot(db,board(period,'2026-10-18'));
    const called:string[]=[];const result=await ensureGithubToday(db,async(_,period)=>{called.push(period);if(period==='weekly')throw new Error('offline');return board(period,'2026-10-19');},'2026-10-19',Date.parse('2026-10-19T13:00:00Z'));
    expect(called).toEqual(['daily','weekly','monthly']);expect(result.notice).toContain('1 个');
    const saved=await latestBoards(db);expect(saved.find(b=>b.id==='github:weekly')).toMatchObject({sourceDate:'2026-10-18',stale:true});expect(saved.find(b=>b.id==='github:daily')!.sourceDate).toBe('2026-10-19');
  });
});
