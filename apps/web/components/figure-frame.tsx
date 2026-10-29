'use client';
import {useEffect,useRef,useState} from 'react';
import type { Figure } from '@/lib/types';

/** 沙箱渲染作者提供的图示：允许脚本（交互演示需要），不给同源权限，读不到本站 cookie 与存储。 */
export default function FigureFrame({ f }: { f: Figure }) {
  const frame=useRef<HTMLIFrameElement>(null);
  const [measured,setMeasured]=useState<{html:string;height:number}|null>(null);
  useEffect(()=>{
    const receive=(event:MessageEvent)=>{
      if(event.source!==frame.current?.contentWindow||event.data?.type!=='jarvis:figure-height')return;
      const height=event.data.height;
      if(Number.isInteger(height)&&height>=120&&height<=1600)setMeasured({html:f.html,height});
    };
    window.addEventListener('message',receive);
    return()=>window.removeEventListener('message',receive);
  },[f.html]);
  return <figure className="reading-figure">
    <figcaption className="figure-title">{f.title}</figcaption>
    <iframe ref={frame} title={f.title} srcDoc={f.html} sandbox="allow-scripts" loading="lazy" onLoad={()=>frame.current?.contentWindow?.postMessage({type:'jarvis:measure-figure'},'*')} style={{ height: measured?.html===f.html?measured.height:f.height }} />
    <p className="figure-caption">{f.caption}</p>
  </figure>;
}
