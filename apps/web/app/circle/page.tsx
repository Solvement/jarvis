import type { Metadata } from 'next';
import LearningCircle from '@/components/learning-circle';

export const metadata: Metadata = { title: '学习圈 · Jarvis', description: '读到的资料、正在形成的理解，还有没想明白的问题。公开分享每天的学习笔记。', alternates: { canonical: 'https://jarvisreading.com/circle' } };
export default function Page() { return <LearningCircle/>; }
