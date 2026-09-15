import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { importVideos } from './import-videos.mjs';
import { validateCatalog } from '../static/js/qualitative.mjs';

async function fixture(t) {
  const tempRoot = path.resolve(os.tmpdir());
  const root = await fs.mkdtemp(path.join(tempRoot, 'roadanchor-test-'));
  const source = path.join(root, 'source'), siteRoot = path.join(root, 'site');
  await fs.mkdir(source);
  await fs.mkdir(siteRoot);
  t.after(async () => {
    const target = path.resolve(root);
    if (path.dirname(target) !== tempRoot || !path.basename(target).startsWith('roadanchor-test-')) throw new Error('Unexpected cleanup path.');
    await fs.rm(target, { recursive: true, force: true });
  });
  return { root, source, siteRoot, manifest: path.join(siteRoot, 'static/data/scenarios.json') };
}
// Header-only fixtures exercise import validation, not browser decoding.
async function clip(file, seed = 1) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const bytes = Buffer.alloc(64, seed);
  bytes.writeUInt32BE(24, 0);
  bytes.write('ftyp', 4);
  bytes.write('isom', 8);
  await fs.writeFile(file, bytes);
}
async function catalog(f) { return JSON.parse(await fs.readFile(f.manifest, 'utf8')); }

test('empty or missing input preserves existing published data', async t => {
  const f = await fixture(t);
  await fs.mkdir(path.dirname(f.manifest), { recursive: true });
  await fs.writeFile(f.manifest, 'existing catalog');
  assert.equal((await importVideos(f)).changed, false);
  assert.equal(await fs.readFile(f.manifest, 'utf8'), 'existing catalog');
  await assert.rejects(importVideos({ ...f, source: path.join(f.root, 'missing') }));
});

test('free filenames group naturally and optional metadata stays plain text', async t => {
  const f = await fixture(t);
  const first = path.join(f.source, '01_좌회전 시나리오');
  await clip(path.join(first, 'approach.mp4'), 1);
  await clip(path.join(first, 'turn.mp4'), 2);
  await clip(path.join(f.source, '02_obstacle', 'drive.mp4'), 3);
  await clip(path.join(f.source, '03_another_scenario.mp4'), 4);
  await fs.writeFile(path.join(first, 'scenario.json'), JSON.stringify({
    title: '<script>plain title</script>', description: 'A & B', order: -1,
    author: 'ignored private metadata',
    clips: { 'turn.mp4': { title: 'Turn', caption: '<b>literal caption</b>' } }
  }));
  const result = await importVideos(f);
  assert.equal(result.scenarios, 3);
  assert.equal(result.videos, 4);
  const data = await catalog(f);
  assert.equal(validateCatalog(data).length, 3);
  assert.equal(data.scenarios[0].title, '<script>plain title</script>');
  assert.equal(data.scenarios[0].clips.length, 2);
  assert.equal(data.scenarios[0].clips[1].title, 'Turn');
  const json = JSON.stringify(data);
  assert(!json.includes(f.source));
  assert(!json.includes('ignored private metadata'));
  for (const scene of data.scenarios) {
    for (const item of scene.clips) assert.equal((await fs.stat(path.resolve(f.siteRoot, item.src))).size, 64);
  }
});

test('dry-run writes nothing; repeated import is idempotent; removed inputs do not delete media', async t => {
  const f = await fixture(t);
  await clip(path.join(f.source, 'drive.mp4'));
  assert.equal((await importVideos({ ...f, check: true })).check, true);
  assert.deepEqual(await fs.readdir(f.siteRoot), []);
  await importVideos(f);
  const before = await fs.readFile(f.manifest, 'utf8');
  assert.equal((await importVideos(f)).changed, false);
  await fs.unlink(path.join(f.source, 'drive.mp4'));
  await importVideos(f);
  assert.equal(await fs.readFile(f.manifest, 'utf8'), before);
});

test('invalid metadata or incomplete media cannot replace a previous catalog', async t => {
  const f = await fixture(t);
  await clip(path.join(f.source, 'existing.mp4'));
  await importVideos(f);
  const before = await fs.readFile(f.manifest, 'utf8');
  const dir = path.join(f.source, 'new_scenario');
  await clip(path.join(dir, 'new.mp4'), 2);
  const metadata = path.join(dir, 'scenario.json');
  await fs.writeFile(metadata, '{');
  await assert.rejects(importVideos(f), /Invalid scenario.json/);
  await fs.writeFile(metadata, '{"order":"first"}');
  await assert.rejects(importVideos(f), /finite number/);
  await fs.writeFile(metadata, '{}');
  await fs.writeFile(path.join(dir, 'new.mp4'), '');
  await assert.rejects(importVideos(f), /Empty or incomplete/);
  assert.equal(await fs.readFile(f.manifest, 'utf8'), before);
});

test('oversized and unsupported videos fail before any output is created', async t => {
  const f = await fixture(t);
  const big = path.join(f.source, 'big.mp4');
  await clip(big);
  const handle = await fs.open(big, 'r+');
  await handle.truncate(100 * 1024 * 1024 + 1);
  await handle.close();
  await assert.rejects(importVideos(f), /100 MiB/);
  await fs.unlink(big);
  await fs.writeFile(path.join(f.source, 'recording.mov'), 'movie');
  await assert.rejects(importVideos(f), /Convert/);
  assert.deepEqual(await fs.readdir(f.siteRoot), []);
});

test('junctions cannot import data outside the source', async t => {
  const f = await fixture(t);
  const outside = path.join(f.root, 'outside');
  await clip(path.join(outside, 'private.mp4'));
  try { await fs.symlink(outside, path.join(f.source, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('Symlink permission unavailable.'); throw error; }
  await assert.rejects(importVideos(f), /Symlinks and junctions/);
  assert.deepEqual(await fs.readdir(f.siteRoot), []);
});

test('catalog rejects external video URLs and duplicate scenario IDs', async t => {
  const f = await fixture(t);
  await clip(path.join(f.source, 'drive.mp4'));
  await importVideos(f);
  const data = await catalog(f);
  data.scenarios[0].clips[0].src = 'javascript:alert(1)';
  assert.throws(() => validateCatalog(data), /Invalid video/);
  const valid = await catalog(f);
  valid.scenarios.push(structuredClone(valid.scenarios[0]));
  assert.throws(() => validateCatalog(valid), /Invalid scenario/);
});

test('output junctions cannot redirect imported files outside the checkout', async t => {
  const f = await fixture(t);
  await clip(path.join(f.source, 'drive.mp4'));
  const outside = path.join(f.root, 'outside-output');
  await fs.mkdir(outside);
  await fs.mkdir(path.join(f.siteRoot, 'static'));
  try { await fs.symlink(outside, path.join(f.siteRoot, 'static/videos'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('Symlink permission unavailable.'); throw error; }
  await assert.rejects(importVideos(f), /Output symlinks and junctions/);
  assert.deepEqual(await fs.readdir(outside), []);
});
test('prepared RoadAnchOR filenames expose scenario names and retain recording identifiers', async t => {
  const f = await fixture(t);
  await clip(path.join(f.source, 'roadanchor_r11715_EnterActorFlow.mp4'));
  await importVideos(f);
  const data = await catalog(f);
  assert.equal(data.scenarios[0].title, 'Enter Actor Flow');
  assert.equal(data.scenarios[0].clips[0].title, 'RoadAnchOR · r11715');
});