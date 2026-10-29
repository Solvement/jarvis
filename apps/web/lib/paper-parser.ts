import { load } from 'cheerio';
import { createRequire } from 'node:module';
import { dirname,join } from 'node:path';
import type { SourceChunk } from './source-types';

export const PAPER_PARSER='paper-text-v3';
export function arxivId(itemId:string):string {
  const id=itemId.replace(/^paper:/,'');
  if(!/^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/.test(id))throw new Error('当前支持 arXiv 论文；条目标识无法识别');
  return id;
}
const clean=(text:string)=>text.replace(/[\t\f\v ]+/g,' ').replace(/\s*\n\s*/g,' ').trim();
function splitText(text:string,max=1800):string[] {
  if(text.length<=max)return[text];
  const parts:string[]=[];let rest=text;
  while(rest.length>max){let cut=rest.lastIndexOf('. ',max);if(cut<max*.5)cut=rest.lastIndexOf(' ',max);if(cut<max*.5)cut=max;else cut++;parts.push(rest.slice(0,cut).trim());rest=rest.slice(cut).trim();}
  if(rest)parts.push(rest);return parts;
}
export function parsePaperHtml(html:string,sourceUrl:string) {
  const $=load(html);
  const article=$('article.ltx_document,.ltx_document').first();
  if(!article.length)throw new Error('没有找到可解析的论文 HTML 正文');
  article.find('script,style,nav,button,.ltx_page_header,.ltx_page_footer,.ltx_ERROR').remove();
  // MathML 保持为文本；不运行原文脚本，也不向客户端发送原始 HTML。
  article.find('math').each((_,node)=>{const math=$(node);const text=math.attr('alttext')||math.find('annotation[encoding="application/x-tex"]').text();if(text)math.text(text);});
  const chunks:SourceChunk[]=[];let heading='论文正文';let headings=0;const headingStack:string[]=[];
  const title=clean(article.find('h1.ltx_title,h1').first().text()||$('title').text());
  article.find('h1,h2,h3,h4,h5,h6,p,.ltx_p,figcaption,li,table,pre,.ltx_listing,.ltx_equation,.ltx_equationgroup').each((_,node)=>{
    const el=$(node),tag=node.tagName.toLowerCase();
    if(/^h[1-6]$/.test(tag)){const depth=Number(tag[1])-1;headingStack.length=depth;headingStack[depth]=clean(el.text());heading=headingStack.filter(Boolean).slice(-4).join(' / ');headings++;return;}
    if(el.parents('p,.ltx_p,li,table,figcaption,pre,.ltx_listing,.ltx_equation,.ltx_equationgroup').length)return;
    let text=tag==='table'?el.find('tr').map((_,row)=>$(row).find('th,td').map((_,cell)=>clean($(cell).text())).get().join(' | ')).get().join('\n'):clean(el.text());
    if(text.length<3)return;
    const anchor=el.attr('id')||el.closest('[id]').attr('id');
    for(const part of splitText(text)){const ordinal=chunks.length;chunks.push({id:`p${ordinal+1}`,ordinal,heading,text:part,url:sourceUrl.split('#')[0]+(anchor?'#'+encodeURIComponent(anchor):''),...(anchor?{anchor}:{})});}
  });
  const characters=chunks.reduce((n,c)=>n+c.text.length,0);
  if(characters<3000||headings<2)throw new Error('论文 HTML 正文不完整，改用 PDF');
  if(characters>1_000_000||chunks.length>3000)throw new Error('论文超过当前解析上限，未保存不完整正文');
  const version=html.match(/arXiv:\s*([a-z\d./-]+v\d+)/i)?.[1]||new URL(sourceUrl).pathname.split('/').at(-1)!;
  return {title,chunks,characters,sections:headings,sourceVersion:version,limitations:['已解析 HTML 正文、公式文字、图表说明；未对图片像素做视觉理解。','表格已转换为文本，复杂合并单元格与公式排版请回原文核查。']};
}

type PdfTextItem={str:string;transform:number[];width:number;height:number;hasEOL?:boolean};
export function pdfPageChunks(items:PdfTextItem[],page:number,sourceUrl:string,startOrdinal:number):SourceChunk[] {
  const chunks:SourceChunk[]=[];let text='',boxes:NonNullable<SourceChunk['boxes']>=[],last:PdfTextItem|undefined;
  const flush=()=>{const body=clean(text);if(body){const ordinal=startOrdinal+chunks.length;chunks.push({id:`p${ordinal+1}`,ordinal,heading:`PDF 第 ${page} 页`,text:body,url:`${sourceUrl.split('#')[0]}#page=${page}`,page,boxes});}text='';boxes=[];};
  for(const item of items){if(!item.str.trim())continue;const x=item.transform[4],y=item.transform[5];
    const lineBreak=last&&(Math.abs(y-last.transform[5])>Math.max(item.height,last.height)*1.7||x<last.transform[4]-80&&Math.abs(y-last.transform[5])>3);
    if(text.length>1500||lineBreak&&text.length>200)flush();
    text+=(text?' ':'')+item.str;boxes.push({x,y,width:item.width,height:item.height});last=item;
  }
  flush();return chunks;
}
export async function parsePaperPdf(bytes:Uint8Array,sourceUrl:string,signal?:AbortSignal) {
  if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw new Error('来源没有返回有效 PDF');
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const assets=dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
  const assetPath=(folder:string)=>join(assets,folder).replaceAll('\\','/')+'/';
  const task=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true,useWorkerFetch:false,verbosity:0,
    cMapUrl:assetPath('cmaps'),standardFontDataUrl:assetPath('standard_fonts'),wasmUrl:assetPath('wasm')});
  const timeout=setTimeout(()=>{void task.destroy();},45000);
  const cancel=()=>{void task.destroy();};signal?.addEventListener('abort',cancel,{once:true});
  try {
    const pdf=await task.promise;
    if(pdf.numPages>150)throw new Error('PDF 超过 150 页，未保存部分正文');
    const chunks:SourceChunk[]=[];let emptyPages=0;
    for(let page=1;page<=pdf.numPages;page++){
      signal?.throwIfAborted();const p=await pdf.getPage(page);const content=await p.getTextContent();
      const part=pdfPageChunks(content.items.filter((x):x is typeof x & PdfTextItem=>'str'in x),page,sourceUrl,chunks.length);if(!part.length)emptyPages++;
      chunks.push(...part);p.cleanup();
    }
    const characters=chunks.reduce((n,c)=>n+c.text.length,0);
    if(characters<2000)throw new Error('PDF 未提取到足够文字，可能为扫描件；当前未启用 OCR');
    if(characters>1_000_000)throw new Error('PDF 文本超过解析上限，未保存不完整正文');
    const meta=await pdf.getMetadata().catch(()=>null);
    const version=chunks.filter(c=>c.page===1).map(c=>c.text).join(' ').match(/arXiv:\s*([a-z\d./-]+v\d+)/i)?.[1]||new URL(sourceUrl).pathname.split('/').at(-1)!;
    return {title:(meta?.info as {Title?:string})?.Title||'',chunks,characters,pages:pdf.numPages,sourceVersion:version,limitations:[`已逐页解析 ${pdf.numPages} 页可提取文字，${emptyPages} 页没有足够文本。`,'未进行 OCR 或图像理解；双栏顺序、表格和公式可能出现解析误差，请结合原 PDF 页核查。']};
  } finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);await task.destroy();}
}
