import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { agyModelChoices } from '../lib/model-catalog.mjs';

test('CLI Hydrogen variants retain exact IDs', () => {
  const levels = ['high', 'xhigh', 'medium', 'low'];
  const rows = levels.map(level => 'gemini-4-hydrogen-' + level + '\tGemini 4 Hydrogen (' + level + ')').join('\n');
  assert.deepEqual(agyModelChoices(rows).map(m => m.value), levels.map(level => 'gemini-4-hydrogen-' + level));
});

test('catalog refresh deduplicates in-flight discovery and retries failure without losing choices', async () => {
  const source = readFileSync(new URL('../parley.mjs', import.meta.url), 'utf8');
  let resolve, calls = 0;
  const context = vm.createContext({providerIdOf: () => 'gemini', workDir: () => '.', resolveCommand: x => x,
    discoverCliModels: () => { calls++; return new Promise(r => { resolve = r; }); }});
  vm.runInContext(source.slice(source.indexOf('const cliCatalogCache ='), source.indexOf('function providerCatalog()')), context);
  const room = {cfg: {agents: {gemini: {command: 'agy'}}}};
  const first = context.seatModels(room, 'gemini');
  assert.equal(context.seatModels(room, 'gemini', true), first);
  resolve([{value: 'argon'}]); await first.pending;
  const second = context.seatModels(room, 'gemini', true);
  resolve([{value: 'hydrogen'}]); await second.pending;
  assert.equal(second.models[0].value, 'hydrogen');
  const failed = context.seatModels(room, 'gemini', true);
  resolve([]); await failed.pending;
  assert.equal(failed.models[0].value, 'hydrogen');
  const retry = context.seatModels(room, 'gemini', true);
  resolve([{value: 'new-model'}]); await retry.pending;
  assert.equal(retry.models[0].value, 'new-model');
  assert.equal(calls, 4);
});

test('open settings renders refreshed metadata while preserving draft capture', () => {
  const source = readFileSync(new URL('../ui/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('refreshSeatModels(s).then(updated => {');
  const body = source.slice(start + 'refreshSeatModels(s).then(updated => {'.length, source.indexOf('}).catch', start));
  const s = {seatInfo: {gemini: {models: []}}};
  const fresh = {gemini: {models: [{value: 'hydrogen'}]}};
  let captured = false, rendered;
  const context = vm.createContext({s, settingsContext: s, settingsCreating: false, updated: true,
    state: {summary: {seatInfo: fresh}}, $: () => ({classList: {contains: () => true}}),
    captureSeatDraftValues: () => {captured = true;}, renderSeatCards: value => {rendered = value;}});
  vm.runInContext('(function(){' + body + '})()', context);
  assert.ok(captured);
  assert.equal(rendered.seatInfo, fresh);
});
