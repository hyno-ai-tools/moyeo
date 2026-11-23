import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { isolatedServer } from './server-fixture.mjs';
test('suggestion route uses main CLI and does not change transcripts or session references', async () => {
  const server = await isolatedServer();
  try {
    const html = await fetch(server.url).then(r => r.text());
    const assetPath = html.match(/src="([^"]*message-suggestions\.js[^"]*)"/)[1];
    const asset = await fetch(server.url+assetPath);
    assert.equal(asset.status, 200);
    assert.match(await asset.text(), /MoyeoMessageSuggestions/);
    const command = fileURLToPath(new URL('./fake-suggestion-cli.mjs', import.meta.url));
    const configured = await server.api('POST','/api/config',{ room:'default', config:{ defaultAgent:'codex', agents:{ codex:{ command } } } });
    assert.equal(configured.status,200);
    assert.equal((await server.api('POST','/api/message-suggestion',{room:'default'})).data.text,'');
    await server.api('POST','/api/message',{room:'default',target:'codex',text:'설명해줘'});
    let before;
    for (let i=0;i<100;i++) {
      before = await server.room('default');
      if (!before.room.busy.length && before.entries.some(e=>e.kind==='agent')) break;
      await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(before.entries.some(e=>e.kind==='agent'));
    const response = await server.api('POST','/api/message-suggestion',{room:'default'});
    assert.equal(response.status,200); assert.equal(response.data.seat,'codex');
    assert.equal(response.data.text,'예시 하나로 더 설명해줘.');
    const after = await server.room('default');
    assert.deepEqual(after.entries,before.entries); assert.deepEqual(after.room.agents,before.room.agents);
    await server.api('POST','/api/config',{room:'default',config:{defaultAgent:'claude',agents:{claude:{command}}}});
    const claude = await server.api('POST','/api/message-suggestion',{room:'default'});
    assert.equal(claude.data.seat, 'claude'); assert.equal(claude.data.text,'예시 하나로 더 설명해줘.');
    const unauthorized = await fetch(server.url+'/api/message-suggestion',{method:'POST',body:'{}'});
    assert.notEqual(unauthorized.status,200);
  } finally { await server.close(); }
});
