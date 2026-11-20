const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const config = JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf8'));
  assert.equal(config.name, 'autumn-hill-2d59');
  assert.equal(config.main, './worker.mjs');
  assert.equal(config.assets.directory, './assets');
  assert.equal(config.assets.binding, 'ASSETS');
  assert.deepEqual(config.assets.run_worker_first, ['/api/*']);
  assert.ok(!config.vars && !config.secrets?.required,
    'Initial deployment must work before the director saves a runtime secret');
  const worker = (await import('./worker.mjs')).default;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Unexpected outbound request'); };
  try {
    let assetRequest;
    const env = {
      ASSETS: { fetch: async request => {
        assetRequest = request;
        return new Response('existing application', { headers: { 'Content-Type': 'text/html' } });
      } },
    };
    const root = new Request('https://test.invalid/');
    assert.equal(await (await worker.fetch(root, env)).text(), 'existing application');
    assert.equal(assetRequest, root);
    for (const key of [undefined, 'fictional-private-test-value']) {
      const response = await worker.fetch(new Request('https://test.invalid/api/health'),
        { ...env, GOOGLE_MAPS_API_KEY: key });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      const text = await response.text();
      assert.ok(!text.includes('fictional-private-test-value'));
      assert.deepEqual(JSON.parse(text), {
        service: 'Serenity Dispatch', version: 'runtime-foundation-v1', runtime: 'worker',
        googleRoutesKeyConfigured: Boolean(key), routingConnected: false,
      });
    }
    const head = await worker.fetch(new Request('https://test.invalid/api/health', { method: 'HEAD' }), env);
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    const post = await worker.fetch(new Request('https://test.invalid/api/health', { method: 'POST' }), env);
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('Allow'), 'GET, HEAD');
    for (const method of ['GET', 'POST']) {
      const response = await worker.fetch(new Request('https://test.invalid/api/routes', { method }),
        { ...env, GOOGLE_MAPS_API_KEY: 'fictional-private-test-value' });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).routingConnected, false);
    }
    assetRequest = null;
    assert.equal((await worker.fetch(new Request('https://test.invalid/api/missing'), env)).status, 404);
    assert.equal(assetRequest, null, 'API errors cannot fall through to the HTML app');
    console.log('Worker runtime serves existing assets, supports private secret bindings, reveals no secret values, and makes no outbound or billable routing requests.');
  } finally {
    globalThis.fetch = originalFetch;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
