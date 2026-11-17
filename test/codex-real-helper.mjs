// A temporary cwd alone does not isolate Codex history.
import { runCodexLive } from '../lib/codex-live.mjs';
export function runCodexTest(spec, options) {
  return runCodexLive(spec, { ...options, ephemeral: true });
}
