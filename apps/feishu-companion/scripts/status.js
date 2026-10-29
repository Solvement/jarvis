import { getConfig } from '../src/config.js';
const config = getConfig();
try {
  const response = await fetch(`http://127.0.0.1:${config.port}/api/status`, { headers: { Authorization: `Bearer ${config.token}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  console.log(JSON.stringify({ codex: data.codex, bot: { enabled: data.bot.enabled, connection: data.bot.connection,
    paired: data.bot.enabled && !data.bot.pairing, missing: data.bot.missing } }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
