import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {prepareCodexHome} from '../lib/codex-home.mjs';
function fixture() {const dir=fs.mkdtempSync(path.join(os.tmpdir(),'moyeo-home-test-'));const source=path.join(dir,'personal');fs.mkdirSync(source);return {dir,source,root:path.join(dir,'moyeo')};}

test('separates history and DB while copying config and only referenced sessions',()=>{
 const f=fixture(),id='00000000-0000-0000-0000-000000000001';
 fs.writeFileSync(path.join(f.source,'auth.json'),'fake-login');fs.writeFileSync(path.join(f.source,'config.toml'),'model="test"');
 fs.mkdirSync(path.join(f.source,'sessions'));fs.writeFileSync(path.join(f.source,'sessions','rollout-'+id+'.jsonl'),'known room');
 fs.writeFileSync(path.join(f.source,'sessions','other.jsonl'),'private');fs.writeFileSync(path.join(f.source,'state_5.sqlite'),'private DB');
 const r=prepareCodexHome(f.root,{source:f.source,sessionRef:id,environment:{CODEX_SQLITE_HOME:f.source}});
 assert.notEqual(r.env.CODEX_HOME,f.source);assert.equal(r.env.CODEX_SQLITE_HOME,r.home);
 assert.equal(fs.readFileSync(path.join(r.home,'auth.json'),'utf8'),'fake-login');
 assert.deepEqual(fs.readdirSync(path.join(r.home,'sessions')),['rollout-'+id+'.jsonl']);
 assert.ok(!fs.existsSync(path.join(r.home,'state_5.sqlite')));
 fs.writeFileSync(path.join(r.home,'sessions','rollout-'+id+'.jsonl'),'continued');prepareCodexHome(f.root,{source:f.source,sessionRef:id});
 assert.equal(fs.readFileSync(path.join(r.home,'sessions','rollout-'+id+'.jsonl'),'utf8'),'continued');
 assert.equal(fs.readFileSync(path.join(f.source,'sessions','rollout-'+id+'.jsonl'),'utf8'),'known room');
});

test('credential refresh is not overwritten by unchanged source; logout removes imported credential',()=>{
 const f=fixture();fs.writeFileSync(path.join(f.source,'auth.json'),'initial');const r=prepareCodexHome(f.root,{source:f.source});
 fs.writeFileSync(path.join(r.home,'auth.json'),'refreshed');prepareCodexHome(f.root,{source:f.source});assert.equal(fs.readFileSync(path.join(r.home,'auth.json'),'utf8'),'refreshed');
 fs.writeFileSync(path.join(f.source,'auth.json'),'new-login');prepareCodexHome(f.root,{source:f.source});assert.equal(fs.readFileSync(path.join(r.home,'auth.json'),'utf8'),'new-login');
 fs.unlinkSync(path.join(f.source,'auth.json'));prepareCodexHome(f.root,{source:f.source});assert.ok(!fs.existsSync(path.join(r.home,'auth.json')));
});

test('rejects shared home and ambiguous last-session migration',()=>{
 const f=fixture();assert.throws(()=>prepareCodexHome(f.root,{source:path.join(f.root,'.codex-runtime')}),/must differ/);
 assert.throws(()=>prepareCodexHome(f.root,{source:f.source,sessionRef:'--last'}),/마지막 대화/);
});
