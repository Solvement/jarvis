'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import s from './email-login.module.css';

function loginError(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === 'OTP_EXPIRED') return '验证码已过期，请重新获取。';
  if (error.code === 'INVALID_OTP') return '验证码不正确或已使用，请检查最新一封邮件。';
  if (error.code === 'TOO_MANY_ATTEMPTS') return '验证次数已用完，请重新获取验证码。';
  if (error.message && /[\u4e00-\u9fff]/.test(error.message)) return error.message;
  if (error.code === 'TOO_MANY_REQUESTS' || /too many/i.test(error.message || '')) return '请求过于频繁，请稍后重试。';
  return fallback;
}

export function EmailLogin({ close, github }: { close: () => void; github?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function send() {
    setBusy(true); setError('');
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({ email: email.trim().toLowerCase(), type: 'sign-in' });
      if (result.error) { setError(loginError(result.error, '验证码发送失败，请稍后重试。')); return; }
      setEmail(email.trim().toLowerCase()); setSent(true); setOtp(''); setCooldown(60);
    } catch { setError('网络连接失败，请检查网络后重试。'); }
    finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true); setError('');
    try {
      const result = await authClient.signIn.emailOtp({ email, otp });
      if (result.error) { setError(loginError(result.error, '登录失败，请稍后重试。')); return; }
      location.reload();
    } catch { setError('网络连接失败，请检查网络后重试。'); }
    finally { setBusy(false); }
  }
  return <dialog ref={ref} className={s.dialog} aria-labelledby={title} onCancel={close}>
    <div className={s.top}><span>JARVIS / YOUR READING DESK</span><button type="button" onClick={close} aria-label="关闭登录">×</button></div>
    <h2 id={title}>邮箱验证码登录</h2>
    <p className={s.description}>保存你的收藏、笔记和私人对话。无需 GitHub 账号。</p>
    <form onSubmit={event => { event.preventDefault(); if (!busy) void (sent ? verify() : send()); }}>
      <label htmlFor={`${title}-email`}>邮箱地址</label>
      <input id={`${title}-email`} type="email" autoComplete="email" required maxLength={320} autoFocus value={email} readOnly={sent} onChange={event => setEmail(event.target.value)} placeholder="你的常用邮箱" />
      {sent && <>
        <p className={s.delivered} role="status">验证码已发送，请查看收件箱或垃圾邮件。5 分钟内有效。</p>
        <label htmlFor={`${title}-otp`}>6 位验证码</label>
        <input id={`${title}-otp`} className={s.code} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ''))} placeholder="000000" />
      </>}
      {error && <p className={s.error} role="alert">{error}</p>}
      <button className={s.primary} type="submit" disabled={busy || (sent && otp.length !== 6)}>{busy ? (sent ? '正在验证…' : '正在发送…') : sent ? '验证并登录' : '获取验证码'}</button>
      {sent && <div className={s.secondary}><button type="button" disabled={busy || cooldown > 0} onClick={() => void send()}>{cooldown ? `${cooldown} 秒后可重新发送` : '重新发送验证码'}</button><button type="button" disabled={busy} onClick={() => { setSent(false); setOtp(''); setError(''); }}>更换邮箱</button></div>}
    </form>
    <p className={s.footnote}>首次验证会创建账户。使用与原 GitHub 账户相同的邮箱，可继续访问原有资料。</p>
    {github && <button type="button" className={s.github} disabled={busy} onClick={github}>使用 GitHub 登录</button>}
  </dialog>;
}
