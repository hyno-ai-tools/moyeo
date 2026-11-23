import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { defaultDataRoot } from './data-root.mjs';
import { serviceCommand, serviceStatus, claimService } from './service-control.mjs';

const targets = ['codex', 'claude', 'agy'];
export const updateUsage = '사용법: moyeo update <codex|claude|agy|all> [--root DIR]';
export function parseUpdateArgs(args) {
  const [target, ...rest] = args;
  if (![...targets, 'all'].includes(target)) throw new Error(updateUsage);
  if (rest.length && (rest.length !== 2 || rest[0] !== '--root' || !rest[1] || rest[1].startsWith('--'))) throw new Error(updateUsage);
  return { targets: target === 'all' ? [...targets] : [target], root: path.resolve(rest[1] || defaultDataRoot({ migrate: false })) };
}

// Only internal, fixed command/argument lists reach the Windows shell. No user input.
export function runUpdateTool(command, args, { capture = false, platform = process.platform, spawn = spawnSync } = {}) {
  const options = { windowsHide: true, timeout: capture ? 15000 : 0,
    ...(capture ? { encoding: 'utf8' } : { stdio: 'inherit' }) };
  if (platform === 'win32') {
    const quote = value => "'" + value.replaceAll("'", "''") + "'";
    const script = `$ErrorActionPreference = 'Stop'; & (Get-Command ${quote(command)} -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source ${args.map(quote).join(' ')}; exit $LASTEXITCODE`;
    return spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', script], options);
  }
  return spawn(command, args, options);
}

export async function updateClis(args, entry, {
  status = serviceStatus, service = serviceCommand, claim = claimService,
  run = runUpdateTool, log = console.log,
} = {}) {
  const options = parseUpdateArgs(args);
  const current = await status(options.root);
  if (current?.busy) throw new Error('모델이 작업 중이거나 대기 요청이 있습니다. 작업을 마친 뒤 다시 업데이트하세요.');
  if (current) await service('stop', ['--root', options.root], entry);
  let lock;
  const failures = [];
  try {
    lock = claim(options.root); // Prevent a start against this root during installation.
    for (const target of options.targets) {
      const version = () => {
        const result = run(target, ['--version'], { capture: true });
        return !result.error && result.status === 0 && result.stdout?.trim() ? result.stdout.trim() : '확인 불가';
      };
      const before = version();
      log(`[${target}] 현재 버전: ${before}`);
      try {
        const result = target === 'codex'
          ? run('npm', ['install', '--global', '@openai/codex@latest', '--no-audit', '--no-fund'])
          : run(target, ['update']);
        if (result.error || result.status !== 0) throw new Error(result.error?.message || `종료 코드 ${result.status} (위 설치기 출력을 확인하세요)`);
        const after = version();
        if (after === '확인 불가') throw new Error('업데이트 명령은 끝났지만 CLI 버전을 확인할 수 없습니다.');
        log(`[${target}] 업데이트 명령 완료: ${before} → ${after}${before === after ? ' (버전 변경 없음)' : ''}`);
      } catch (error) {
        failures.push(`${target}: ${error.message}`);
        log(`[${target}] 실패: ${error.message}`);
      }
    }
  } finally {
    lock?.release();
    if (current) {
      try { await service('start', ['--root', options.root, '--port', String(current.port), '--no-open'], entry); }
      catch (error) { failures.push(`MoYEO 재시작 실패: ${error.message}`); }
    }
  }
  if (failures.length) throw new Error(failures.join('\n'));
}