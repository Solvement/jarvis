import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { learningPost, learningPosts } from '@/lib/learning-circle';
import { LearningArticle } from '@/components/learning-circle';

export function generateStaticParams() { return learningPosts.map(post => ({ slug: post.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = learningPost((await params).slug); if (!post) return {};
  const url = `https://jarvisreading.com/circle/${post.slug}`;
  return { title: `${post.title} · 学习圈`, description: post.summary, alternates: { canonical: url },
    openGraph: { type: 'article', title: post.title, description: post.summary, url, publishedTime: post.publishedAt, authors: [post.author] } };
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const post = learningPost((await params).slug); if (!post) notFound();
  return <LearningArticle post={post}/>;
}
