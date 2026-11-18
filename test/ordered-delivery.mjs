import test from 'node:test';
import assert from 'node:assert/strict';
import { orderedDelivery } from '../lib/ordered-delivery.mjs';
const tick = () => new Promise(r => setImmediate(r));

test('early clicks wait for readiness, preserve order and deduplicate retries', async () => {
  let ready = false, release;
  const calls = [], statuses = [];
  const q = orderedDelivery({ready: () => ready ? {} : null,
    deliver: async item => { calls.push(item.id); if(item.id === 'a') await new Promise(r => {release=r;}); },
    notify: item => statuses.push([item.id,item.status])});
  q.add({id:'a'}); q.add({id:'b'}); q.add({id:'a'});
  await tick(); assert.deepEqual(calls, []); assert.equal(q.size(),2);
  ready=true; const work=q.kick(); await tick();
  assert.deepEqual(calls,['a']); q.kick(); release(); await work;
  assert.deepEqual(calls,['a','b']); assert.equal(q.size(),0);
  assert.deepEqual(statuses,[['a','queued'],['b','queued'],['a','delivered'],['b','delivered']]);
});

test('uncertain delivery is not retried, next message remains ordered', async () => {
  const calls=[];const q=orderedDelivery({ready:()=>({}),deliver: async i=>{calls.push(i.id);if(i.id==='a')throw Error('lost acknowledgement');}});
  q.add({id:'a'});q.add({id:'b'});await q.kick();q.add({id:'a'});await q.kick();
  assert.deepEqual(calls,['a','b']);assert.equal(q.get('a').status,'failed');
});

test('stop cancels a waiting addition without writing it', async () => {
  let calls=0;const q=orderedDelivery({ready:i=>i.cancelled?{cancelled:true}:null,deliver:()=>calls++});
  q.add({id:'a'});q.cancel();await tick();assert.equal(calls,0);assert.equal(q.get('a').status,'cancelled');
});
