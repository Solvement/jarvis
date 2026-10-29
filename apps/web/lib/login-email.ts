import { createHash } from 'node:crypto';
import { Resend } from 'resend';

export function isEmailLoginConfigured(env = process.env) {
  return Boolean(env.RESEND_API_KEY && env.RESEND_EMAIL_DOMAIN);
}

/** 只在服务端发送；错误不暴露收件人、验证码或服务凭据。 */
export async function sendLoginEmail({ email, otp }: { email: string; otp: string }) {
  if (!isEmailLoginConfigured() || !/^\d{6}$/.test(otp)) throw new Error('邮箱登录暂不可用，请稍后重试。');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const fingerprint = createHash('sha256').update(`${email}:${otp}:${Date.now()}`).digest('hex');
  const { error } = await resend.emails.send({
    from: `Jarvis <login@${process.env.RESEND_EMAIL_DOMAIN}>`,
    to: email,
    subject: 'Jarvis 登录验证码（5 分钟内有效）',
    text: `你的 Jarvis 登录验证码是：${otp}\n\n5 分钟内有效，仅可使用一次。请返回发起登录的页面填写。\n若非你本人操作，请忽略此邮件，不要向任何人提供验证码。\n\nJarvis · https://jarvisreading.com`,
    html: `<!doctype html><html lang="zh-CN"><body style="margin:0;background:#f8f7f4;font:16px/1.7 Arial,sans-serif;color:#171717"><main style="max-width:480px;margin:32px auto;padding:32px;background:#fff"><h1 style="font-size:24px">登录 Jarvis</h1><p>请在发起登录的页面填写验证码：</p><p style="font:32px/1.5 monospace;letter-spacing:8px">${otp}</p><p>5 分钟内有效，仅可使用一次。</p><p>若非你本人操作，请忽略此邮件，不要向任何人提供验证码。</p><p style="color:#777">Jarvis · jarvisreading.com</p></main></body></html>`,
  }, { idempotencyKey: `login-otp/${fingerprint}` });
  if (error) {
    console.error('email-otp delivery', error.name);
    throw new Error('验证码发送失败，请稍后重试。');
  }
}
