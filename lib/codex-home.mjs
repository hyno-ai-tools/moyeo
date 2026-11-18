import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// Share configuration, never the transcript directories or SQLite databases.
export function prepareCodexHome(root, { source = process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), sessionRef, environment = process.env } = {}) {
  if (sessionRef === '--last') throw new Error('MoYEO에서는 개인 Codex의 마지막 대화를 선택할 수 없습니다. 방의 Codex 세션을 새로 시작해 주세요.');
  source = path.resolve(source);
  const home = path.resolve(root, '.codex-runtime');
  if (home === source) throw new Error('MoYEO Codex home must differ from the desktop home');
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  const manifestPath = path.join(home, '.source-files.json');
  let manifest = {}; try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch {}
  const files = ['auth.json', 'config.toml', 'AGENTS.md', 'AGENTS.override.md', 'models_cache.json'];
  for (const file of files) {
    const from = path.join(source, file), to = path.join(home, file);
    if (!fs.existsSync(from)) {
      if (manifest[file]) { fs.rmSync(to, { force: true }); delete manifest[file]; }
      continue;
    }
    const data = fs.readFileSync(from);
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    // A refreshed runtime credential must not be replaced by an unchanged older source.
    if (manifest[file] !== hash || !fs.existsSync(to)) fs.writeFileSync(to, data, { mode: 0o600 });
    manifest[file] = hash;
  }
  for (const name of ['skills', 'plugins', 'rules', 'memories']) {
    const from = path.join(source, name), to = path.join(home, name);
    if (!fs.existsSync(from) || fs.existsSync(to)) continue;
    fs.symlinkSync(from, to, process.platform === 'win32' ? 'junction' : 'dir');
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
  // Only import a session explicitly referenced by this MoYEO seat. No global DB copy.
  if (sessionRef && /^[a-f0-9-]{36}$/i.test(sessionRef)) {
    const find = dir => {
      if (!fs.existsSync(dir)) return null;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith('-' + sessionRef + '.jsonl')) return full;
        if (entry.isDirectory()) { const result = find(full); if (result) return result; }
      }
      return null;
    };
    if (!find(path.join(home, 'sessions')) && !find(path.join(home, 'archived_sessions'))) {
      const old = find(path.join(source, 'sessions')) || find(path.join(source, 'archived_sessions'));
      if (old) {
        const to = path.join(home, 'sessions', path.basename(old));
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(old, to, fs.constants.COPYFILE_EXCL);
      }
    }
  }
  return { home, env: { ...environment, CODEX_HOME: home, CODEX_SQLITE_HOME: home },
    config: { sqlite_home: home, log_dir: path.join(home, 'log') } };
}
