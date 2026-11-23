import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestionContext, suggestionInvocation, suggestionResult, cleanSuggestion, createSuggestionCache } from '../lib/message-suggestions.mjs';
const room = () => ({ name: 'demo', cfg: { defaultAgent: 'lead', agents: { lead: { model: 'selected-model' } } }, entries: [{ n: 1, kind: 'user', text: '설명해줘' }, { n: 2, kind: 'agent', text: '설명입니다' }] });
test('uses configured main seat; context is bounded and excludes tools', () => {
  const value = room(); value.lastAddressed = 'other';
  value.entries.unshift({ n: 0, kind: 'tool', text: 'SECRET TOOL OUTPUT' });
  const context = suggestionContext(value);
  assert.equal(context.seat, 'lead'); assert.equal(context.config.model, 'selected-model');
  assert.ok(!context.prompt.includes('SECRET TOOL OUTPUT'));
  value.entries.push({ n: 3, kind: 'user', text: 'new request' }); assert.equal(suggestionContext(value), null);
});
test('new context and changed main model invalidate cache identity', () => {
  const a = room(), key = suggestionContext(a).key;
  a.cfg.agents.lead.model = 'other'; assert.notEqual(suggestionContext(a).key, key);
});
test('provider arguments do not resume conversations or grant full access', () => {
  for (const provider of ['codex', 'claude', 'gemini']) {
    const args = suggestionInvocation(provider, 'chosen', 'output.txt');
    assert.equal(args[args.indexOf('--model') + 1], 'chosen');
    assert.ok(!args.includes('--resume')); assert.ok(!args.includes('--conversation'));
    assert.ok(!args.includes('--dangerously-skip-permissions'));
  }
  assert.ok(suggestionInvocation('codex').includes('--ephemeral'));
  assert.ok(suggestionInvocation('claude').includes('--no-session-persistence'));
});
test('extracts only explicit successful public results across all providers', () => {
  assert.equal(suggestionResult('codex', 'private logs', '더 설명해줘'), '더 설명해줘');
  assert.equal(suggestionResult('claude', '{"result":"예시 보여줘"}'), '예시 보여줘');
  assert.equal(suggestionResult('claude', '{"result":"error","is_error":true}'), '');
  assert.equal(suggestionResult('gemini', JSON.stringify({ event:'result', result:{ status:'SUCCESS', response:'다음은?' } })), '다음은?');
  assert.equal(suggestionResult('gemini', '{"event":"thinking","text":"private"}'), '');
});
test('rejects malformed, lengthy and unavailable suggestions', () => {
  for (const value of ['NONE', '<script>', 'a\nb', 'a'.repeat(161), null]) assert.equal(cleanSuggestion(value), '');
});
test('coalesces concurrent tabs and caches failure without retries', async () => {
  const cache = createSuggestionCache(); let count = 0;
  const generate = async () => { count++; await new Promise(r => setTimeout(r, 10)); return '예시 보여줘'; };
  const a = cache.get('key', generate), b = cache.get('key', generate);
  assert.equal(cache.busy, true); assert.equal(await cache.get('other', generate), '');
  assert.deepEqual(await Promise.all([a,b]), ['예시 보여줘','예시 보여줘']); assert.equal(count, 1); assert.equal(cache.busy, false);
  await cache.get('fail', () => { throw Error('fail'); });
  assert.equal(await cache.get('fail', generate), ''); assert.equal(count, 1);
});
