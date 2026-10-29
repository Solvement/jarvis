/** 只访问代码内构造的公开来源；逐跳检查重定向、流式限制体积。 */
export async function sourceFetch(url:string, options:{hosts:string[];maxBytes:number;signal?:AbortSignal;headers?:Record<string,string>;timeout?:number}) {
  const signal=AbortSignal.any([AbortSignal.timeout(options.timeout||30000),...(options.signal?[options.signal]:[])]);
  let current=new URL(url);
  for(let redirects=0;redirects<=4;redirects++) {
    if(current.protocol!=='https:'||current.port||current.username||current.password||!options.hosts.includes(current.hostname)) throw new Error('来源地址不在允许范围');
    const response=await fetch(current,{redirect:'manual',signal,headers:{'User-Agent':'JarvisPersonalResearch/1.0','Accept':'*/*',...options.headers}});
    if([301,302,303,307,308].includes(response.status)) {
      await response.body?.cancel();
      const location=response.headers.get('location');if(!location)throw new Error('来源重定向缺少目标');
      current=new URL(location,current);continue;
    }
    if(!response.ok){await response.body?.cancel();throw new Error(`来源返回 HTTP ${response.status}${response.status===429?'，请稍后重试':''}`);}
    if(Number(response.headers.get('content-length'))>options.maxBytes){await response.body?.cancel();throw new Error('来源文件超过大小上限');}
    if(!response.body)throw new Error('来源没有返回内容');
    const reader=response.body.getReader();const parts:Uint8Array[]=[];let bytes=0;
    try {while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>options.maxBytes)throw new Error('来源文件超过大小上限');parts.push(value);}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    const body=new Uint8Array(bytes);let at=0;for(const part of parts){body.set(part,at);at+=part.length;}
    return {body,url:current.href,contentType:response.headers.get('content-type')||''};
  }
  throw new Error('来源重定向次数过多');
}
