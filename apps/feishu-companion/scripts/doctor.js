import { getConfig } from '../src/config.js';
import { CodexClient } from '../src/codex.js';
const config = getConfig(); const client = new CodexClient(config);
try {
  await client.start();
  const catalog = await client.request('model/list', {});
  console.log(JSON.stringify({ codex: await client.account(), models: catalog.data.map(m => ({ model: m.model, isDefault: m.isDefault })), feishu: {
    appIdConfigured: Boolean(config.appId), appSecretConfigured: Boolean(config.appSecret), ownerConfigured: Boolean(config.ownerId),
  }, server: `http://127.0.0.1:${config.port}` }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { client.close(); }
