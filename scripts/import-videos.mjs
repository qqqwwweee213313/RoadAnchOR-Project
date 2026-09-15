import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultSite = fileURLToPath(new URL('../', import.meta.url));
const MAX_FILE = 100 * 1024 * 1024;
const MAX_SITE = 1_000_000_000;
const videoTypes = new Map([['.mp4', 'video/mp4'], ['.webm', 'video/webm']]);
const otherVideos = new Set(['.mov', '.avi', '.mkv', '.m4v', '.wmv']);
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const humanize = text => text.replace(/^roadanchor[_-]+r\d+[_-]+/i, '').replace(/^\d+[-_ ]+/, '')
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim() || text;
const digestText = text => createHash('sha256').update(text).digest('hex');
const slash = text => text.split(path.sep).join('/');
const inside = (root, target) => {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
};
const exists = async file => { try { await fs.access(file); return true; } catch { return false; } };

async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function ensureOutputPath(root, file) {
  if (!inside(root, file)) throw new Error('Invalid output path.');
  let current = root;
  for (const part of path.relative(root, file).split(path.sep)) {
    current = path.join(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Output symlinks and junctions are not supported.');
    } catch (error) { if (error.code === 'ENOENT') break; throw error; }
  }
}
async function assertUnchanged(file, expected, source) {
  const current = await regularFile(file, source);
  if (current.size !== expected.size || current.mtimeMs !== expected.mtimeMs) {
    throw new Error('A source file changed during import. Retry after the copy has finished: ' + file);
  }
}
async function regularFile(file, source) {
  const info = await fs.lstat(file);
  if (info.isSymbolicLink() || !info.isFile() || !inside(source, await fs.realpath(file))) {
    throw new Error('Only regular files inside the source folder are supported: ' + file);
  }
  return info;
}
async function checkVideo(file, source) {
  const info = await regularFile(file, source);
  if (info.size < 16) throw new Error('Empty or incomplete video: ' + file);
  if (info.size > MAX_FILE) throw new Error('Video exceeds GitHub’s 100 MiB file limit: ' + file);
  const handle = await fs.open(file, 'r');
  const header = Buffer.alloc(16);
  try { await handle.read(header, 0, 16, 0); } finally { await handle.close(); }
  const ext = path.extname(file).toLowerCase();
  const valid = ext === '.mp4'
    ? header.toString('ascii', 4, 8) === 'ftyp' && header.readUInt32BE(0) >= 16 && header.readUInt32BE(0) <= info.size
    : header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (!valid) throw new Error('The file header does not match its video extension: ' + file);
  return info;
}
function optionalText(value, fallback, label, maxLength = 2000) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > maxLength) throw new Error('Invalid ' + label);
  return value.trim();
}
async function readMetadata(dir, source) {
  const file = path.join(dir, 'scenario.json');
  if (!await exists(file)) return {};
  await regularFile(file, source);
  let value;
  try { value = JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { throw new Error('Invalid scenario.json in ' + dir); }
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('scenario.json must contain an object.');
  optionalText(value.title, '', 'scenario title', 180);
  optionalText(value.description, '', 'scenario description');
  if (value.order !== undefined && !Number.isFinite(value.order)) throw new Error('Scenario order must be a finite number.');
  if (value.clips !== undefined && (!value.clips || Array.isArray(value.clips) || typeof value.clips !== 'object')) {
    throw new Error('Scenario clips must be a filename-keyed object.');
  }
  return value;
}
async function discover(source) {
  const videos = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => collator.compare(a.name, b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlinks and junctions are not supported in the video folder: ' + file);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (videoTypes.has(ext)) videos.push(file);
        else if (otherVideos.has(ext)) throw new Error('Convert this video to MP4 (H.264) or WebM before importing: ' + file);
      }
    }
  }
  await walk(source);
  return videos;
}
async function siteBytes(root) {
  if (!await exists(root)) return 0;
  let total = 0;
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) total += await siteBytes(file);
    else if (entry.isFile()) total += (await fs.stat(file)).size;
  }
  return total;
}

export async function importVideos({ source, siteRoot = defaultSite, check = false } = {}) {
  if (!source) throw new Error('Provide --source with your local videos folder.');
  source = await fs.realpath(source);
  siteRoot = await fs.realpath(siteRoot);
  if (!(await fs.stat(source)).isDirectory()) throw new Error('The video source must be a folder.');
  if (inside(siteRoot, source) || inside(source, siteRoot)) throw new Error('Keep the source videos folder separate from the website checkout.');
  const files = await discover(source);
  if (!files.length) return { changed: false, scenarios: 0, videos: 0, message: 'No videos found. Existing catalog and media were preserved.', warnings: [] };

  const groups = new Map();
  const assets = new Map();
  const warnings = [];
  for (const file of files) {
    const info = await checkVideo(file, source);
    if (info.size > 50 * 1024 * 1024) warnings.push('Large video (over 50 MiB): ' + path.basename(file));
    const dir = path.dirname(file);
    const relative = slash(path.relative(source, dir));
    const key = relative || slash(path.relative(source, file));
    if (!groups.has(key)) {
      const meta = await readMetadata(dir, source);
      const fallback = relative ? humanize(path.basename(dir)) : humanize(path.parse(file).name);
      groups.set(key, { id: 'scenario-' + digestText(key).slice(0, 12), key, meta,
        title: optionalText(meta.title, fallback, 'scenario title', 180) || fallback,
        description: optionalText(meta.description, '', 'scenario description'), clips: [] });
    }
    const group = groups.get(key);
    const name = path.basename(file);
    const clipMeta = group.meta.clips?.[name] ?? {};
    if (!clipMeta || Array.isArray(clipMeta) || typeof clipMeta !== 'object') throw new Error('Invalid clip metadata: ' + name);
    const ext = path.extname(file).toLowerCase();
    const hash = await hashFile(file);
    await assertUnchanged(file, info, source);
    const assetDir = './static/videos/scenarios/' + group.id + '/';
    const src = assetDir + 'clip-' + hash.slice(0, 16) + ext;
    assets.set(src, { file, size: info.size, hash });
    const routeTag = name.match(/^roadanchor[_-]+(r\d+)[_-]+/i)?.[1];
    const defaultClipTitle = routeTag ? 'RoadAnchOR · ' + routeTag : humanize(path.parse(name).name);
    const clip = { title: optionalText(clipMeta.title, defaultClipTitle, 'clip title', 180) || 'RoadAnchOR',
      caption: optionalText(clipMeta.caption, '', 'clip caption'), src, type: videoTypes.get(ext) };
    for (const posterExt of ['.jpg', '.jpeg', '.png', '.webp']) {
      const poster = path.join(dir, path.parse(file).name + posterExt);
      if (!await exists(poster)) continue;
      const posterInfo = await regularFile(poster, source);
      if (posterInfo.size === 0 || posterInfo.size > MAX_FILE) throw new Error('Empty or oversized poster: ' + poster);
      const posterHash = await hashFile(poster);
      await assertUnchanged(poster, posterInfo, source);
      clip.poster = assetDir + 'poster-' + posterHash.slice(0, 16) + posterExt;
      assets.set(clip.poster, { file: poster, size: posterInfo.size, hash: posterHash });
      break;
    }
    if (group.clips.some(item => item.src === clip.src)) {
      throw new Error('Duplicate video content within a scenario: ' + name);
    }
    group.clips.push(clip);
  }
  const scenarios = [...groups.values()]
    .sort((a, b) => (a.meta.order ?? 0) - (b.meta.order ?? 0) || collator.compare(a.key, b.key))
    .map(({ id, title, description, clips }) => ({ id, title, description, clips }));
  if (new Set(scenarios.map(item => item.id)).size !== scenarios.length) throw new Error('Scenario identifier collision.');
  const catalog = { version: 1, scenarios };
  const serialized = JSON.stringify(catalog, null, 2) + '\n';
  const manifest = path.join(siteRoot, 'static', 'data', 'scenarios.json');
  await ensureOutputPath(siteRoot, manifest);
  const old = await exists(manifest) ? await fs.readFile(manifest, 'utf8') : '';
  let extraBytes = Buffer.byteLength(serialized) - Buffer.byteLength(old);
  for (const [url, asset] of assets) {
    const destination = path.resolve(siteRoot, url.slice(2));
    await ensureOutputPath(siteRoot, destination);
    asset.destination = destination;
    if (await exists(destination)) {
      if (await hashFile(destination) !== asset.hash) throw new Error('Existing media file has unexpected contents: ' + url);
      asset.present = true;
    } else extraBytes += asset.size;
  }
  const total = await siteBytes(siteRoot) + extraBytes;
  if (total > MAX_SITE) throw new Error('The resulting website exceeds the GitHub Pages 1 GB site limit. Use smaller videos.');
  if (total > 900_000_000) warnings.push('The website is above the 900 MB preparation threshold and close to the Pages size limit.');
  const result = { changed: old !== serialized || [...assets.values()].some(item => !item.present),
    scenarios: scenarios.length, videos: files.length, warnings, check };
  if (check) return result;

  // Validate every input before writing. Existing published media are never deleted.
  for (const asset of assets.values()) {
    if (asset.present) continue;
    await ensureOutputPath(siteRoot, asset.destination);
    await fs.mkdir(path.dirname(asset.destination), { recursive: true });
    const temp = asset.destination + '.' + randomUUID() + '.tmp';
    try {
      await fs.copyFile(asset.file, temp);
      if ((await fs.stat(temp)).size !== asset.size) throw new Error('A source file changed size during import. Retry after the copy has finished.');
      if (await hashFile(temp) !== asset.hash) throw new Error('A source file changed during import. Retry after the copy has finished.');
      await fs.rename(temp, asset.destination);
    } finally { await fs.unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  if (old !== serialized) {
    await ensureOutputPath(siteRoot, manifest);
    await fs.mkdir(path.dirname(manifest), { recursive: true });
    const temp = manifest + '.' + randomUUID() + '.tmp';
    try { await fs.writeFile(temp, serialized, 'utf8'); await fs.rename(temp, manifest); }
    finally { await fs.unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  return result;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const index = args.indexOf('--source');
  if (args.includes('--help')) {
    console.log('node scripts/import-videos.mjs --source "path/to/videos" [--check]\nGroups MP4/WebM files by scenario folder. Root-level files become individual scenarios.\nThis imports local files only; it does not commit or publish.');
  } else {
    try {
      if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Usage: node scripts/import-videos.mjs --source "path/to/videos" [--check]');
      console.log(JSON.stringify(await importVideos({ source: args[index + 1], check: args.includes('--check') }), null, 2));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
