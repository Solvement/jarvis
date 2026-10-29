import s from '@/components/learning-circle.module.css';

export default function CircleLayout({ children }: { children: React.ReactNode }) {
  return <div className={s.shell}><header className={s.siteHeader}><a href="/">JARVIS /</a><nav aria-label="学习圈导航"><a href="/circle">学习圈</a><a href="/">回到阅读台 ↗</a></nav></header><main>{children}</main></div>;
}
