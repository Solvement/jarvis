export type Period = 'daily'|'weekly'|'monthly';
export type Source = 'github'|'hf';
export type Entry = {
 id:string; kind:'project'|'paper'; title:string; summary:string; url:string;
 rank:number; stars?:number; forks?:number; growth?:number; language?:string;
 languageColor?:string; contributors?:{name:string;avatar:string;url:string}[];
 votes?:number; authors?:string[]; published?:string; codeUrl?:string; pdfUrl?:string;
 sourceHash:string;
 attribution?:{label:string;url:string;locator:string};
};
export type Board = { id:string; source:Source; period:Period; sourceDate:string;
 fetchedAt:string; url:string; items:Entry[]; stale?:boolean; error?:string; contentHash:string };
export type Reading = { itemId:string; sourceHash:string; entry?:Entry; level:'translation'|'brief'|'deep';
 title:string; summary:string; generatedAt:string; author:string; coverage:string;
 sections:{heading:string;body:string;citations:string[]}[];
 sources:{id:string;title:string;url:string;locator?:string}[];
 terms?:{term:string;explanation:string}[]; limitations:string[];
 format?:'skill_guide'|'mechanism'|'paper';
 skillCards?:{name:string;group:string;problem:string;when:string;boundary:string;url:string;experimental?:boolean}[];
 attribution?:{label:string;url:string;locator:string};
 study?:Study;
 /** 服务器写入；draft 只有作者可见。 */
 visibility?:Visibility;
};
export type Visibility='draft'|'public';
export type Viewer={isOwner:boolean};
export type ItemState={readAt:string|null;starred:boolean;note:string;updatedAt:string};
export type Study = {
 status:'draft'|'needs_review'|'accepted_main_text'|'accepted';scope:string;sourceSnapshot:string;
 sourceCoverage:{path:string;level:'read'|'skimmed'|'not_read';reason:string}[];
 claims:{id:string;text:string;kind:'fact'|'implementation'|'benchmark'|'inference'|'personal_application';evidence:{source:string;anchor:string;support:'direct'|'indirect'|'weak'}[]}[];
 mechanisms:{id:string;name:string;steps:string[];boundary:string;claims:string[]}[];
 connections:{title:string;body:string;itemId?:string}[];
 review:{checkedAt:string;method:string;findings:string[]};openQuestions:string[];
};
export type LibraryViewer={signedIn:boolean;isOwner:boolean;authEnabled:boolean};
export type Library = {boards:Board[];readings:Reading[]; notice?:string; viewer?:LibraryViewer};
