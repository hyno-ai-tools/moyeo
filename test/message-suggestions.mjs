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
  for (const value of ['NONE', '<script>', 'a\nb', 'a'.repeat(2001), null]) assert.equal(cleanSuggestion(value), '');
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


test('keeps useful longer suggestions without truncating their intent', () => {
  const text = '앞에서 정한 기준대로 추천 기능을 수정하고 이미 끝난 작업은 반복하지 않게 해줘. '.repeat(5).trim();
  assert.ok(text.length > 160);
  assert.equal(cleanSuggestion(text), text);
});

test('supplies earlier user habits separately from recent completion evidence', () => {
  const value = room();
  value.entries = [{ n: 1, kind: 'user', text: '끝나면 커밋하고 양쪽에 푸시해줘' },
    ...Array.from({ length: 24 }, (_, i) => ({ n: i + 2, kind: i % 2 ? 'agent' : 'user', text: '최근 대화 ' + i }))];
  value.entries.at(-1).text = '수정하고 커밋과 양쪽 푸시까지 완료했어. 화면 검증은 아직 하지 않았어.';
  const context = suggestionContext(value);
  const data = JSON.parse(context.prompt.slice(context.prompt.indexOf('\n{')));
  assert.deepEqual(data.earlierUserMessages, ['끝나면 커밋하고 양쪽에 푸시해줘']);
  assert.equal(data.conversation.at(-1).text, value.entries.at(-1).text);
  value.entries[0].text = '커밋은 내가 할게';
  assert.notEqual(suggestionContext(value).key, context.key);
});

test('bounds large histories while retaining the final completion report', () => {
  const value = room();
  value.entries = Array.from({ length: 400 }, (_, i) => ({ n: i, kind: i % 2 ? 'agent' : 'user', text: 'x'.repeat(10000) + ' 완료: 푸시까지 끝남' }));
  const context = suggestionContext(value);
  const data = JSON.parse(context.prompt.slice(context.prompt.indexOf('\n{')));
  assert.ok(data.conversation.length <= 24);
  assert.ok(data.conversation.reduce((sum, e) => sum + e.text.length, 0) <= 24000);
  assert.ok(data.earlierUserMessages.length <= 12);
  assert.match(data.conversation.at(-1).text, /완료: 푸시까지 끝남$/);
});
