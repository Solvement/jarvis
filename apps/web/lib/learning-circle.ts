import published from '@/content/learning-circle.json';
import type { SourceNode } from './feishu-rich-text';

export type LearningPost = {
  slug: string; title: string; date: string; publishedAt: string; author: string;
  summary: string; sourceUrl: string; sourceRevision: number | null; bodyMarkdown: string;
  richNodes?: SourceNode[]; colorLegend?: { color: string; label: string }[];
};

// Only explicitly published snapshots belong in this file. No Feishu credentials or private library state.
export const learningPosts = ([...published] as LearningPost[]).sort((a, b) => b.date.localeCompare(a.date) || b.publishedAt.localeCompare(a.publishedAt));
export function learningPost(slug: string) { return learningPosts.find(post => post.slug === slug); }
