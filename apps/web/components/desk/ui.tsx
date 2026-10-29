'use client';
import { useEffect,useRef } from 'react';
import s from './desk.module.css';
export function Icon({name,size=18}:{name:string;size?:number}) {
  const paths:Record<string,React.ReactNode>={
    search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
    paper:<path d="M7 3h8l4 4v14H5V3Z M14 3v5h5 M8 12h8 M8 16h6"/>,
    project:<path d="m8 6-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18"/>,
    collection:<><rect x="3" y="4" width="7" height="16" rx="1"/><path d="M13 4h5l3 15-5 1-3-16 M5 8h3"/></>,
    saved:<path d="M6 3h12v18l-6-4-6 4Z"/>,arrow:<path d="M4 12h16 M14 6l6 6-6 6"/>,
    chat:<path d="M3 4h18v13H8l-5 4V4Z M7 8h10 M7 12h6"/>,close:<path d="m6 6 12 12 M18 6 6 18"/>,
    check:<path d="m4 12 5 5L20 6"/>,note:<path d="M13 4H4v16h16v-9 M10 14l2-5 6-6 3 3-6 6-5 2Z"/>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    moon:<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>,
    sun:<><circle cx="12" cy="12" r="4"/><path d="M12 1v2 M12 21v2 M1 12h2 M21 12h2 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2"/></>,
    filter:<path d="M3 6h18 M3 12h18 M3 18h18 M8 3v6 M16 9v6 M10 15v6"/>,
    chevron:<path d="m7 9 5 5 5-5"/>,external:<path d="M14 3h7v7 M21 3l-12 12 M10 3H3v18h18v-7"/>,plus:<path d="M12 4v16 M4 12h16"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.paper}</svg>;
}
export function Modal({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const d=ref.current;d?.showModal();return()=>d?.close();},[]);
  return <dialog ref={ref} className={s.dialog} aria-label={title} onCancel={close}><div className={s.dialogHeader}><h2>{title}</h2><button className={s.iconButton} onClick={close} aria-label="关闭弹窗"><Icon name="close"/></button></div>{children}</dialog>;
}
export async function api<T>(url:string,init?:RequestInit):Promise<T> {
  const response=await fetch(url,{cache:'no-store',...init,headers:{'Content-Type':'application/json',...init?.headers}});
  const body=await response.json();
  if(!response.ok)throw new Error(body.error||'请求失败，请重试。');
  return body as T;
}
