import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUpdateArgs, runUpdateTool, updateClis } from '../lib/update-clis.mjs';

function fixture(current = null) {
  const events = [], logs = [];
  return { events, logs, deps: {
    status: async () => current,
    service: async (cmd, args) => events.push([cmd, args]),
    claim: () => { events.push(['lock']); return { release() { events.push(['release']); } }; },
    run: (cmd, args) => { events.push([cmd, args]); return { status: 0, stdout: '1.2.3' }; },
    log: message => logs.push(message),
  } };
}
test('requires an explicit allowlisted target, rejects extras before side effects', async () => {
  for (const args of [[], ['oops'], ['all', 'codex'], ['codex', '--root'], ['codex;echo bad']]) {
    const f = fixture();
    await assert.rejects(updateClis(args, 'entry', f.deps), /사용법/);
    assert.deepEqual(f.events, []);
  }
  assert.deepEqual(parseUpdateArgs(['all']).targets, ['codex', 'claude', 'agy']);
});
test('busy server never stops or installs', async () => {
  const f = fixture({ busy: true });
  await assert.rejects(updateClis(['all'], 'entry', f.deps), /작업 중/);
  assert.deepEqual(f.events, []);
});
test('all updates providers in order using native updaters and npm for Codex', async () => {
  const f = fixture();
  await updateClis(['all'], 'entry', f.deps);
  const updates = f.events.filter(e => Array.isArray(e[1]) && e[1][0] !== '--version');
  assert.deepEqual(updates, [
    ['npm', ['install', '--global', '@openai/codex@latest', '--no-audit', '--no-fund']],
    ['claude', ['update']], ['agy', ['update']],
  ]);
  assert.equal(f.events[0][0], 'lock');
  assert.equal(f.events.at(-1)[0], 'release');
});
test('single target leaves other providers untouched and restarts idle server on same root/port', async () => {
  const f = fixture({ busy: false, port: 4545 });
  await updateClis(['claude', '--root', './test-root'], 'entry', f.deps);
  assert.equal(f.events[0][0], 'stop');
  assert.equal(f.events.at(-2)[0], 'release');
  assert.equal(f.events.at(-1)[0], 'start');
  assert.ok(f.events.at(-1)[1].includes('4545'));
  assert.equal(f.events.some(e => ['codex', 'agy', 'npm'].includes(e[0])), false);
});
test('one install failure does not skip remaining providers or server restoration', async () => {
  const f = fixture({ busy: false, port: 4141 });
  const original = f.deps.run;
  f.deps.run = (cmd, args) => { const result = original(cmd, args); return cmd === 'npm' ? { status: 1 } : result; };
  await assert.rejects(updateClis(['all'], 'entry', f.deps), /codex.*종료 코드 1/);
  assert.ok(f.events.some(e => e[0] === 'agy' && e[1][0] === 'update'));
  assert.equal(f.events.at(-1)[0], 'start');
});
test('unknown post-update version is not reported as success', async () => {
  const f = fixture();
  f.deps.run = () => ({ status: 0, stdout: '' });
  await assert.rejects(updateClis(['agy'], 'entry', f.deps), /버전을 확인할 수 없습니다/);
});
test('stop refusal aborts installation even after idle snapshot', async () => {
  const f = fixture({ busy: false });
  f.deps.service = async () => { throw new Error('busy now'); };
  await assert.rejects(updateClis(['codex'], 'entry', f.deps), /busy now/);
  assert.deepEqual(f.events, []);
});
test('Windows resolves application shims without PowerShell script execution policy dependency', () => {
  runUpdateTool('npm', ['install'], { platform: 'win32', spawn(exe, args, options) {
    assert.match(args.at(-1), /Get-Command 'npm' -CommandType Application/);
    assert.equal(options.windowsHide, true);
    assert.equal(options.timeout, 0);
    return { status: 0 };
  } });
});