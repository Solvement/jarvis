import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class State {
  constructor(dir) {
    this.file = join(dir, 'state.json');
    this.data = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : { sessions: {}, bindings: {}, seen: [] };
  }
  save() {
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data), { mode: 0o600 });
    renameSync(`${this.file}.tmp`, this.file);
  }
  session(key) { return this.data.sessions[key]; }
  setSession(key, id) { this.data.sessions[key] = id; this.save(); }
  reset(key) { delete this.data.sessions[key]; this.save(); }
  bind(key, url) { this.data.bindings[key] = url; this.save(); }
  binding(key) { return this.data.bindings[key]; }
  seen(id) { return this.data.seen.includes(id); }
  mark(id) { this.data.seen = [...this.data.seen, id].slice(-2000); this.save(); }
  receipt(id) { return this.data.receipts?.[id]; }
  recordAnswer(id, answer) {
    this.data.receipts ||= {};
    this.data.receipts[id] = answer;
    const keys = Object.keys(this.data.receipts);
    for (const key of keys.slice(0, Math.max(0, keys.length - 2000))) delete this.data.receipts[key];
    this.save();
  }
}

export class SerialQueue {
  tails = new Map();
  run(key, action) {
    const before = this.tails.get(key) || Promise.resolve();
    const result = before.catch(() => {}).then(action);
    this.tails.set(key, result);
    result.finally(() => { if (this.tails.get(key) === result) this.tails.delete(key); }).catch(() => {});
    return result;
  }
}
