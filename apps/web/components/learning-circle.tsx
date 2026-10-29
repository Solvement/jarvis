import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { learningPosts, type LearningPost } from '@/lib/learning-circle';
import s from './learning-circle.module.css';
import LearningRichText from './learning-rich-text';
import { sourceColor } from '@/lib/feishu-rich-text';

export default function LearningCircle() {
  return <section className={s.circle} aria-label="学习圈">
    <header className={s.heading}><span>LEARNING IN PUBLIC / 学习圈</span><h1>看到一些东西，<br/>留下一点想法。</h1><p>读到的资料，正在形成的理解，还有没想明白的问题。按天记下来，和大家分享。</p><small>公开可读 · {learningPosts.length} 篇笔记 · 持续更新</small></header>
    <div className={s.timeline}>{learningPosts.map(post => <article key={post.slug} className={s.card}>
      <time dateTime={post.date}>{post.date}<small>{post.author} · 学习笔记</small></time>
      <div><h2><a href={`/circle/${post.slug}`}>{post.title}</a></h2><p>{post.summary}</p><a className={s.read} href={`/circle/${post.slug}`}>读这篇笔记 <span aria-hidden="true">↗</span></a></div>
    </article>)}</div>
  </section>;
}

export function LearningArticle({ post }: { post: LearningPost }) {
  return <article className={s.article}>
    <a className={s.back} href="/circle">← 所有学习笔记</a>
    <header className={s.articleHeading}><span>LEARNING IN PUBLIC / 学习圈</span><h1>{post.title}</h1><p>{post.summary}</p><div>{post.author} <span>·</span> <time dateTime={post.date}>{post.date}</time> <span>·</span> 约 {Math.max(1, Math.ceil(post.bodyMarkdown.length / 500))} 分钟</div></header>
    <aside className={s.notice}>这是一篇边读边记的学习笔记，保留当时的理解、划去的内容和疑问。资料转述与个人想法尚未逐条独立核验。</aside>
    {post.colorLegend && post.colorLegend.length > 0 && <aside className={s.colorLegend} aria-label="作者的颜色标记"><strong>颜色标记</strong>{post.colorLegend.map(item => <span key={item.color}><i aria-hidden="true" style={{ backgroundColor: sourceColor(item.color) || 'currentColor' }}/>{item.label}</span>)}</aside>}
    <div className={s.body}>{post.richNodes ? <LearningRichText nodes={post.richNodes}/> : <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
      a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
      img: ({ src, alt }) => typeof src === 'string' && src.startsWith('/learning-circle/')
        // Original document images are copied to this public site; no authenticated Feishu image URLs.
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt={alt || '笔记配图'} loading="lazy"/> : <span>{alt || '配图未发布'}</span>,
    }}>{post.bodyMarkdown}</Markdown>}</div>
    <footer className={s.articleFooter}><span>本文为发布时的快照。后续修订会重新发布。</span><a href={post.sourceUrl} target="_blank" rel="noreferrer">飞书编辑源 ↗</a><a href="/circle">回到学习圈 →</a></footer>
  </article>;
}
