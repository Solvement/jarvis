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
 sections:{heading:string;body:string;citations:string[];figure?:Figure}[];
 sources:{id:string;title:string;url:string;locator?:string}[];
 terms?:{term:string;explanation:string}[]; limitations:string[];
 format?:'skill_guide'|'mechanism'|'paper'|'research';
 /** 研究简报的下一步建议：精读 / 写摘要 / 会用即可 / 不读 / 已有精读。 */
 nextStep?:{kind:'deep'|'brief'|'use'|'skip'|'done';label:string};
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
export type Library = {boards:Board[];readings:Reading[]; notice?:string; viewer?:LibraryViewer; edition?:Edition|null};
/** 看点卡（D-018）。core=内核值得精读；tool=会用即可（写使用指南）；paper=论文。 */
export type PickKind='core'|'tool'|'paper';
export type PickPlan='deep'|'guide'|'brief';
export type PickStatus='queued'|'reading'|'published';
export type Pick={itemId:string;rank:number;kind:PickKind;plan:PickPlan;board:string;
 headline:string;highlight:string;why:string;
 /** 写卡时实际读到的范围，例如 readme+tree；不等于读过源码。 */
 coverage:string;status:PickStatus;entry?:Entry};
export type Edition={edition:string;picks:Pick[]};
/** 章节图示：自包含 HTML/SVG，在无同源权限的沙箱 iframe 中渲染（D-021）。 */
export type Figure={title:string;caption:string;html:string;height:number};
