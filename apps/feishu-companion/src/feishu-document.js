import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { feishuDocumentUrl } from './context.js';
import { root } from './config.js';

const executeFile = promisify(execFile);

export function normalizeCliDocument(url, response, now = Date.now()) {
  if (response?.ok !== true || response.identity !== 'user') throw new Error('飞书 CLI 没有返回有效的本人文档内容');
  const doc = response.data?.document;
  if (typeof doc?.content !== 'string' || !doc.content.trim()) throw new Error('飞书没有返回正文；请检查文档内容和访问权限');
  if (doc.content.length > 120_000) throw new Error('文档超过 120000 字符；请先绑定较短的文档再讨论');
  return {
    url: feishuDocumentUrl(url), title: doc.content.match(/^#\s+(.+)$/m)?.[1]?.slice(0, 250) || '飞书文档',
    text: doc.content, capturedAt: now, selection: null, coverage: 'server-document-content', truncated: false,
    source: 'official-feishu-cli', documentId: doc.document_id, revisionId: doc.revision_id ?? null,
    limitations: ['服务端正文，不含编辑器光标或选区；未读取图片像素和嵌入资源的内部内容。', ...(doc.tips ? [String(doc.tips)] : [])],
  };
}

export class FeishuDocumentReader {
  constructor({ binary, profile = 'jarvis-feishu-readonly', execute = executeFile, timeoutMs = 45_000 } = {}) {
    this.binary = binary || (process.platform === 'win32' && process.env.APPDATA
      ? join(process.env.APPDATA, 'npm', 'node_modules', '@larksuite', 'cli', 'bin', 'lark-cli.exe') : 'lark-cli');
    this.profile = profile; this.execute = execute; this.timeoutMs = timeoutMs;
  }
  async read(value) {
    const url = feishuDocumentUrl(value);
    const env = { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' };
    for (const key of ['HERMES_HOME', 'OPENCLAW_HOME', 'FEISHU_APP_SECRET', 'OPENAI_API_KEY', 'CODEX_API_KEY']) delete env[key];
    let stdout;
    try {
      ({ stdout } = await this.execute(this.binary, ['--profile', this.profile, 'docs', '+fetch', '--as', 'user',
        '--doc', url, '--doc-format', 'markdown', '--revision-id', '-1'],
      { cwd: root, env, timeout: this.timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true, encoding: 'utf8' }));
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('未找到飞书官方 CLI；请在电脑上重新安装 @larksuite/cli');
      if (error.killed || error.code === 'ETIMEDOUT') throw new Error('读取最新文档超时；请稍后再问，没有沿用旧正文');
      let detail; try { detail = JSON.parse(error.stderr || error.stdout).error; } catch {}
      if (detail?.type === 'authorization' || detail?.type === 'authentication') {
        throw new Error('飞书登录或文档权限失效；请在电脑上重新完成 CLI 授权，没有沿用旧正文');
      }
      throw new Error('读取最新飞书文档失败；请检查电脑网络和文档权限，没有沿用旧正文');
    }
    let response; try { response = JSON.parse(stdout.replace(/^\uFEFF/, '')); }
    catch { throw new Error('飞书 CLI 返回格式无效，没有沿用旧正文'); }
    return normalizeCliDocument(url, response);
  }
}
