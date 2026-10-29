import { getConfig } from '../src/config.js';
import { CodexClient } from '../src/codex.js';
const client = new CodexClient(getConfig());
try {
  await client.start();
  const thread = await client.newThread();
  const answer = await client.turn(thread, 'Connectivity test with no private data. Reply exactly CONNECTION_OK.');
  console.log(JSON.stringify({ ok: answer.trim() === 'CONNECTION_OK', answer, subscription: await client.account() }));
  if (answer.trim() !== 'CONNECTION_OK') process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { client.close(); }
