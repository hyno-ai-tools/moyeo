import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCodexLive } from '../lib/codex-live.mjs';
import { runCodexTest } from './codex-real-helper.mjs';
for (const ephemeral of [false, true]) {
 test(ephemeral ? 'test helper forces non-persistent thread' : 'normal rooms stay persistent', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'moyeo-history-check-'));
  const script=path.join(dir,'fake.cjs');
  fs.writeFileSync(script, `
   const fs=require('node:fs'),rl=require('node:readline');
   const out=x=>console.log(JSON.stringify(x));
   rl.createInterface({input:process.stdin}).on('line',line=>{
    const m=JSON.parse(line);
    if(m.method==='initialize')out({id:m.id,result:{}});
    if(m.method==='thread/start'){
     fs.writeFileSync('params.json',JSON.stringify(m.params));
     out({id:m.id,result:{thread:{id:'test-thread'}}});
    }
    if(m.method==='turn/start'){
     out({id:m.id,result:{turn:{id:'test-turn'}}});
     out({method:'turn/completed',params:{turn:{id:'test-turn',status:'completed'}}});
    }
   });
  `);
  let closed;
  try {
   const run=ephemeral?runCodexTest:runCodexLive;
   const result=await run({cmd:process.execPath,pre:[script]},{
    cwd:dir,input:'check',timeoutMs:5000,sandbox:'read-only',ephemeral:false,
    onChild:child=>{closed=new Promise(resolve=>child.once('close',resolve));}
   });
   assert.equal(result.code,0,result.stderr);
   const params=JSON.parse(fs.readFileSync(path.join(dir,'params.json'),'utf8'));
   assert.equal(params.ephemeral,ephemeral?true:undefined);
  } finally {
   await closed;
   fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
 });
}
test('test sessions reject durable resume and pooling before launch',()=>{
 for(const options of [{sessionRef:'real-thread'},{poolKey:'real-room'}])
  assert.throws(()=>runCodexTest({},options),/fresh, unpooled/);
});
