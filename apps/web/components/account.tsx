'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import type { ItemState, LibraryViewer, Reading } from '@/lib/types';

/** 顶栏：登录 / 退出。服务器未配置 GitHub OAuth 时不显示登录入口。 */
export function AccountBar({ viewer }: { viewer?: LibraryViewer }) {
  if (!viewer?.authEnabled) return null;
  if (!viewer.signedIn)
    return <button className="account-link" onClick={() => authClient.signIn.social({ provider: 'github', callbackURL: location.href })}>GitHub 登录</button>;
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
      const r = await fetch('/api/author/visibility', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: reading.itemId, generatedAt: reading.generatedAt, visibility: 'public' }) });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error || '发布失败');
      onPublished();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="notice draft-banner"><span>草稿 · 仅作者可见。讨论修订完成后再发布给其他读者。</span><button disabled={busy} onClick={publish}>{busy ? '正在发布' : '发布'}</button>{error && <span role="alert">{error}</span>}</div>;
}
