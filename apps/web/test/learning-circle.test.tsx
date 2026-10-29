import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import LearningCircle, { LearningArticle } from '@/components/learning-circle';
import { learningPosts } from '@/lib/learning-circle';
import { parseFeishuRichText } from '@/lib/feishu-rich-text';

describe('公开学习圈', () => {
  it('匿名可渲染独立文章链接、完整笔记和本站配图，无需飞书登录', () => {
    const list = renderToStaticMarkup(<LearningCircle/>);
    expect(list).toContain('/circle/agent-eval-2026-10-20');
    const html = renderToStaticMarkup(<LearningArticle post={learningPosts[0]}/>);
    expect(html).toContain('Agent 评测 10.20小记');
    expect(html).toContain('也没说哪里要怎么改啊');
    expect(html).toContain('/learning-circle/agent-eval-2026-10-20/reliability.png');
    expect(html).toContain('/learning-circle/agent-eval-2026-10-20/retries.png');
    expect(html).not.toContain('https://feishu.cn/file/');
    expect(html).toContain('<del>');
  });
  it('文档 Markdown 不能注入原始 HTML、脚本链接或外部追踪图片', () => {
    const post = { ...learningPosts[0], richNodes: undefined, bodyMarkdown: '<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n![tracker](https://evil.example/track.png)' };
    const html = renderToStaticMarkup(<LearningArticle post={post}/>);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('evil.example');
    expect(html).toContain('tracker');
  });
  it('保留飞书原始颜色及其准确范围，包括重点里的粗体和划去内容', () => {
    const rich = parseFeishuRichText('<title>标题</title><p>普通文字<span text-color="rgb(46, 161, 33)">我的理解</span><b><span text-color="rgb(216,57,49)">重点</span></b><del>划去</del></p>');
    expect(rich.colors).toEqual(['rgb(46,161,33)', 'rgb(216,57,49)']);
    const html = renderToStaticMarkup(<LearningArticle post={{ ...learningPosts[0], richNodes: rich.nodes }}/>);
    expect(html).toContain('普通文字<span style="color:rgb(46,161,33)">我的理解</span>');
    expect(html).toContain('<strong><span style="color:rgb(216,57,49)">重点</span></strong>');
    expect(html).toContain('<del>划去</del>');
    expect(html).not.toContain('<title>标题</title>');
  });
  it('富文本只接受安全颜色和本站图片，不透传事件、任意 CSS 或脚本', () => {
    const rich = parseFeishuRichText('<p onclick="alert(1)"><span text-color="url(https://evil.example)">内容</span><a href="javascript:alert(1)">链接</a><script>bad()</script></p>');
    const html = renderToStaticMarkup(<LearningArticle post={{ ...learningPosts[0], richNodes: rich.nodes }}/>);
    expect(html).not.toContain('onclick'); expect(html).not.toContain('javascript:');
    expect(html).not.toContain('evil.example'); expect(html).not.toContain('bad()');
    expect(() => parseFeishuRichText('<img src="external"/>', { external: 'https://evil.example/pixel' })).toThrow(/本站/);
    const linked = parseFeishuRichText('<p>资料：https://example.com/paper.pdf</p>');
    const linkedHtml = renderToStaticMarkup(<LearningArticle post={{ ...learningPosts[0], richNodes: linked.nodes }}/>);
    expect(linkedHtml).toContain('href="https://example.com/paper.pdf"');
  });
});
