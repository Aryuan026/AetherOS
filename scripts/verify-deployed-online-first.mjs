import assert from 'node:assert/strict';

const requestedBase = process.argv[2]
  || process.env.AETHEROS_PUBLIC_BASE_URL
  || 'https://lab.asherie.cloud/aetheros/';
const baseUrl = new URL(requestedBase.endsWith('/') ? requestedBase : `${requestedBase}/`);

const fetchRequired = async (url, expectedContentType) => {
  const response = await fetch(url, { cache: 'no-store', redirect: 'follow' });
  assert.equal(response.status, 200, `${url} returned ${response.status}`);
  if (expectedContentType) {
    assert.match(
      response.headers.get('content-type') || '',
      expectedContentType,
      `${url} has the wrong Content-Type`,
    );
  }
  return response;
};

const indexResponse = await fetchRequired(baseUrl, /^text\/html\b/i);
const indexHtml = await indexResponse.text();
const refs = Array.from(
  indexHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/g),
  match => match[1],
).filter(ref => !/^(?:data:|https?:|#)/i.test(ref));
assert.ok(refs.length >= 4, 'deployed index did not expose the expected startup resources');

for (const ref of refs) {
  assert.equal(ref.startsWith('/'), false, `deployed startup URL escaped the app folder: ${ref}`);
  const url = new URL(ref, baseUrl);
  assert.ok(url.pathname.startsWith(baseUrl.pathname), `deployed startup URL escaped ${baseUrl.pathname}: ${ref}`);
  await fetchRequired(url);
}

const manifestUrl = new URL('manifest.webmanifest', baseUrl);
const manifestResponse = await fetchRequired(manifestUrl, /^application\/manifest\+json\b/i);
const cacheControl = manifestResponse.headers.get('cache-control') || '';
assert.match(cacheControl, /\bno-cache\b/i, 'manifest must revalidate instead of using a stale install contract');
assert.match(cacheControl, /\bmust-revalidate\b/i, 'manifest must explicitly revalidate');
const manifest = await manifestResponse.json();
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');
assert.equal(new URL(manifest.start_url, manifestUrl).pathname, baseUrl.pathname);
assert.equal(new URL(manifest.scope, manifestUrl).pathname, baseUrl.pathname);
for (const icon of manifest.icons || []) {
  assert.equal(String(icon.src || '').startsWith('/'), false, `manifest icon escaped app scope: ${icon.src}`);
  const iconUrl = new URL(icon.src, manifestUrl);
  assert.ok(iconUrl.pathname.startsWith(baseUrl.pathname));
  await fetchRequired(iconUrl, /^image\//i);
}

const descriptorResponse = await fetchRequired(
  new URL('aetheros-release.json', baseUrl),
  /^application\/json\b/i,
);
const descriptor = await descriptorResponse.json();
assert.equal(descriptor.schemaVersion, 'aetheros_release_descriptor.v1');
assert.match(String(descriptor.buildId || ''), /^aetheros-[A-Za-z0-9._+-]+-[a-f0-9]{16}$/);
assert.equal(descriptor.shellMode, 'online-first');
assert.equal(descriptor.offlineShell, false);

const workerUrl = new URL('sw-keep-alive.js', baseUrl);
const workerResponse = await fetchRequired(workerUrl, /(?:application|text)\/javascript/i);
const workerText = await workerResponse.text();
assert.ok(workerText.includes(descriptor.buildId), 'deployed worker and release descriptor must share one build id');
for (const [label, pattern] of [
  ['CacheStorage access', /\b(?:self\.)?caches\s*\./],
  ['IndexedDB deletion', /\bindexedDB\s*\.\s*deleteDatabase\s*\(/],
  ['localStorage clearing', /\blocalStorage\s*\.\s*clear\s*\(/],
  ['automatic reload', /\b(?:window\.)?location\s*\.\s*reload\s*\(/],
]) assert.doesNotMatch(workerText, pattern, `deployed worker must not contain ${label}`);

console.log(`deployed online-first release OK: ${baseUrl}`);
