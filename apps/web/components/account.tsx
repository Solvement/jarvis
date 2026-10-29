'use client';
import { useCallback, useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import type { ItemState, LibraryViewer, Reading } from '@/lib/types';
import { EmailLogin } from './email-login';

/** 邮箱为主入口；GitHub 保留原回调域名，避免跨域丢失 OAuth state cookie。 */
export function AccountBar({ viewer }: { viewer?: LibraryViewer }) {
  const [open, setOpen] = useState(false), [error, setError] = useState('');
  const githubLogin = useCallback(async (callbackURL = location.href) => {
    setError('');
    const origin = viewer?.githubLoginOrigin;
    if (origin && new URL(origin).origin !== location.origin) {
      const target = new URL(`${location.pathname}${location.search}${location.hash}`, origin);
      target.searchParams.set('login', 'github');
      location.assign(target.href);
      return;
    }
    try {
      const result = await authClient.signIn.social({ provider: 'github', callbackURL });
      if (result.error) setError('GitHub 登录暂不可用，请使用邮箱验证码。');
    } catch { setError('登录连接失败，请重试。'); }
  }, [viewer?.githubLoginOrigin]);
  useEffect(() => {
    if (!viewer?.authEnabled || viewer.signedIn || !viewer.githubEnabled) return;
    const current = new URL(location.href);
    if (current.searchParams.get('login') !== 'github') return;
    current.searchParams.delete('login');
    history.replaceState(null, '', current.href);
    void githubLogin(current.href);
    // 只处理跨域入口携带的一次性登录意图。
  }, [viewer?.authEnabled, viewer?.signedIn, viewer?.githubEnabled, githubLogin]);
  if (!viewer?.authEnabled) return null;
  if (!viewer.signedIn)
    return <><button className="account-link" onClick={() => viewer.emailEnabled ? setOpen(true) : void githubLogin()}>{viewer.emailEnabled ? '邮箱登录' : 'GitHub 登录'}</button>{open && <EmailLogin close={() => setOpen(false)} github={viewer.githubEnabled ? () => void githubLogin() : undefined}/>} {error && <span role="alert">{error}</span>}</>;
  return <button className="account-link" onClick={() => authClient.signOut().then(() => location.reload())}>{viewer.isOwner ? '作者 · ' : ''}退出</button>;
}

async function put(itemId: string, patch: Partial<{ read: boolean; starred: boolean; note: string }>) {
  const r = await fetch('/api/me/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId, ...patch }) });
  const d = (await r.json()) as { states?: Record<string, ItemState>; error?: string };
  if (!r.ok) throw new Error(d.error || '保存失败');
  return d.states?.[itemId];
}

/** 已读与收藏只由用户显式点击写入；打开文章不算已读。 */
export function ItemActions({ itemId, viewer, state, onChange }: { itemId: string; viewer?: LibraryViewer; state?: ItemState; onChange: (s: ItemState | undefined) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!viewer?.signedIn) return null;
  const run = (patch: Parameters<typeof put>[1]) => {
    setBusy(true); setError('');
    put(itemId, patch).then(onChange).catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
  };
  return <span className="item-actions">
    <button disabled={busy} aria-pressed={!!state?.readAt} onClick={() => run({ read: !state?.readAt })}>{state?.readAt ? '已读 ✓' : '标为已读'}</button>
    <button disabled={busy} aria-pressed={!!state?.starred} onClick={() => run({ starred: !state?.starred })}>{state?.starred ? '已收藏 ★' : '收藏'}</button>
    {error && <span role="alert" className="item-error">{error}</span>}
  </span>;
}

/** 草稿横幅：只有作者看得到草稿；讨论修订后在此发布。 */
export function DraftBanner({ reading, viewer, onPublished }: { reading: Reading; viewer?: LibraryViewer; onPublished: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (reading.visibility !== 'draft' || !viewer?.isOwner) return null;
  const publish = async () => {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/author/visibility', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: reading.itemId, generatedAt: reading.generatedAt, level: reading.level, visibility: 'public' }) });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error || '发布失败');
      onPublished();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="notice draft-banner"><span>草稿 · 仅作者可见。讨论修订完成后再发布给其他读者。</span><button disabled={busy} onClick={publish}>{busy ? '正在发布' : '发布'}</button>{error && <span role="alert">{error}</span>}</div>;
}
