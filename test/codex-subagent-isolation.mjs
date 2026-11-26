import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCodexLive } from '../lib/codex-live.mjs';
import { createPublicSpeech } from '../lib/public-speech.mjs';

test('interleaved children cannot fragment parent speech or finish its turn', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moyeo-child-isolation-'));
  const script = path.join(dir, 'fake.cjs');
  fs.writeFileSync(script, `const out=x=>console.log(JSON.stringify(x));
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 if(m.method==='initialize') out({id:m.id,result:{}});
 if(m.method==='thread/start') out({id:m.id,result:{thread:{id:'parent'}}});
 if(m.method==='turn/start'){
  out({id:m.id,result:{turn:{id:'turn-parent'}}});
  out({method:'turn/started',params:{threadId:'parent',turn:{id:'turn-parent'}}});
  const delta=(threadId,itemId,delta)=>out({method:'item/agentMessage/delta',params:{threadId,itemId,delta,turnId:threadId==='parent'?'turn-parent':'child-turn'}});
  delta('parent','answer','검토를 ');
  for(const id of ['child-a','child-b']) {
   out({method:'thread/started',params:{thread:{id,agentNickname:'검토자-'+id}}});
   out({method:'turn/started',params:{threadId:id,turn:{id:'child-turn'}}});
   delta(id,'answer','하위 조각');
   out({method:'rawResponseItem/completed',params:{threadId:id,item:{type:'function_call',call_id:'child-tool',name:'exec_command',arguments:'{}'}}});
   const complete={method:'item/completed',params:{threadId:id,item:{type:'agentMessage',id:'answer',text:'하위 검토 결과'}}};
   out(complete);out(complete);
   out({method:'thread/tokenUsage/updated',params:{threadId:id,tokenUsage:{total:{inputTokens:999}}}});
   out({method:'turn/completed',params:{threadId:id,turn:{id:'child-turn',status:'completed'}}});
  }
  out({method:'item/agentMessage/delta',params:{threadId:'parent',turnId:'old-turn',itemId:'stale',delta:'지난 응답'}});
  delta('parent','answer','마쳤어.');
  out({method:'item/completed',params:{threadId:'parent',turnId:'turn-parent',item:{type:'agentMessage',id:'answer',text:'검토를 마쳤어.'}}});
  out({method:'turn/completed',params:{threadId:'parent',turn:{id:'turn-parent',status:'completed'}}});
 }
});`);
  const events=[], utterances=[];let child, item=null;
  const speech=createPublicSpeech({onActivity:t=>utterances.push(t)});
  try {
    const result=await runCodexLive({cmd:process.execPath,pre:[script]}, {
      cwd:dir, timeoutMs:5000, sandbox:'read-only', input:'검토', kill:p=>p?.kill(), onChild:p=>child=p,
      onLine:line=>{const e=JSON.parse(line);events.push(e);if(e.item?.type==='agent_message') {if(item&&item!==e.item.id)speech.archive();item=e.item.id;speech.update(e.item.text,e.item.id);}},
    });
    assert.equal(result.code,0);
    assert.equal(speech.finalText('검토를 마쳤어.'),'검토를 마쳤어.');
    assert.deepEqual(utterances,[]);
    assert.equal(events.filter(e=>e.type==='subagent.activity'&&e.text).length,2);
    assert.ok(events.some(e=>e.subagent?.label==='검토자-child-a'));
    assert.ok(!events.some(e=>e.item?.text?.includes('하위')));
    assert.ok(!events.some(e=>e.item?.id==='stale'||e.item?.id==='raw:child-tool'||e.usage?.input_tokens===999));
  } finally {
    if(child&&child.exitCode===null) {const closed=new Promise(r=>child.once('close',r));child.kill();await closed;}
    await fs.promises.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
});
