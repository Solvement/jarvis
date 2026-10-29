// Run the official CLI in this Codex project's explicit mainland-Feishu profile.
// Unrelated agent variables inherited by Codex must not select another app binding.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const cli = join(process.env.APPDATA, 'npm', 'node_modules', '@larksuite', 'cli', 'scripts', 'run.js');
if (!existsSync(cli)) throw new Error('Install the official @larksuite/cli first.');
const env = { ...process.env };
delete env.HERMES_HOME;
delete env.OPENCLAW_HOME;
const child = spawn(process.execPath, [cli, '--profile', 'jarvis-feishu-readonly', ...process.argv.slice(2)], {
  env, stdio: 'inherit', windowsHide: true,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
