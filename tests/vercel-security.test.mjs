import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../api/mandat.js', import.meta.url), 'utf8');
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('no private pages in PWA precache', () => {
  const assets = sw.slice(sw.indexOf('const ASSETS = ['), sw.indexOf('];'));
  for (const route of ['/truck', '/systeme', '/maison', '/suivi', '/agenda', '/rapport', '/truck-map']) {
    assert.doesNotMatch(assets, new RegExp('"' + route + '(?:\\.html)?"'));
  }
});
test('runtime cache excludes API, auth and private responses', () => {
  assert.match(sw, /headers\.has\("authorization"\)/);
  assert.match(sw, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(sw, /private\|no-store/);
  assert.match(sw, /headers\.has\("set-cookie"\)/);
});
test('mandat verifies signed identity using Supabase Auth', () => {
  assert.match(api, /\/auth\/v1\/user/);
  assert.match(api, /if \(!verified\?\.ok\)/);
});
test('mandat denies redirects and screens private address ranges', () => {
  assert.match(api, /redirect: 'error'/);
  assert.match(api, /adressePrivee\(v\.address\)/);
  assert.match(api, /net\.isIP\(u\.hostname\)/);
});
test('Vercel stays on static output and no production deploy in scripts', () => {
  assert.equal(vercel.outputDirectory, '.');
  assert.equal(vercel.buildCommand, '');
});
