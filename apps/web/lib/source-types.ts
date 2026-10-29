export type SourceChunk = {
  id:string; ordinal:number; heading:string; text:string; url:string;
  anchor?:string; page?:number; boxes?:{x:number;y:number;width:number;height:number}[];
  path?:string; lineStart?:number; lineEnd?:number;
};
export type SourceDocument = {
  id:string; itemId:string; kind:'paper_html'|'paper_pdf'|'project_code'; title:string;
  sourceUrl:string; sourceVersion:string; contentHash:string; parserVersion:string; fetchedAt:string;
  chunks:SourceChunk[]; characters:number; limitations:string[];
  pages?:number; sections?:number;
  repository?:{commit:string;branch:string;owner:string;treeCount:number;treeTruncated:boolean;
    files:{path:string;size:number}[]; selected:string[]; skipped:string[]};
};
export type SourceSummary = Omit<SourceDocument,'chunks'|'repository'> & {
  chunkCount:number; repository?:Omit<NonNullable<SourceDocument['repository']>,'files'>;
};
export function sourceSummary(doc:SourceDocument):SourceSummary {
  const {chunks,repository,...rest}=doc;
  if(repository){const {files:_files,...repo}=repository;return {...rest,chunkCount:chunks.length,repository:repo};}
  return {...rest,chunkCount:chunks.length};
}
