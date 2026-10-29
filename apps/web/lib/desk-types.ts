import type { Board, Entry, ItemState, LibraryViewer, Reading } from './types';

export type DeskEntry = Entry & {
  dailyStudy?:{day:string;board:string;rank:number};
  displayTitle: string; description: string; topics: string[];
  editions: string[]; latestSeen: string; levels: Reading['level'][]; coverage: string;
  introduction?:{summary:string;example:string;version:string;generatedAt:string;sourceUrl?:string;coverage:string};
};
export type DeskCatalog = {
  entries: DeskEntry[]; boards: Board[]; editions: string[]; projectArchives?:Board[];
  viewer: LibraryViewer & { local: boolean }; featured: string[]; projectDay?:string; notice?: string;
};
export type PersonalCollection = { id: string; title: string; items: string[]; updatedAt: string };
export type DeskPersonal = { states: Record<string, ItemState>; collections: PersonalCollection[] };
export type ChatReference = { id: string; title: string; text: string; url?: string; section?: number;
  documentId?:string;chunkId?:string;page?:number;path?:string;lineStart?:number;lineEnd?:number };
export type ChatContext = { coverage: string; version: string; references: ChatReference[]; truncated: boolean;
  mode?:'paper-fulltext'|'project-code'|'reading';
  document?:{id:string;kind:string;sourceUrl:string;sourceVersion:string;fetchedAt:string;totalChunks:number;selectedChunks:number;limitations:string[];outline:string[];commit?:string;files?:string[];treeCount?:number};
};
export type ChatTurn = {
  id: string; question: string; answer: string; status: 'streaming'|'complete'|'stopped'|'error';
  model: string; version: string; context: ChatContext; createdAt: string;
};
export type ModelInfo = { configured: boolean; provider: string; model: string };
