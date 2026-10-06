import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
  return files.flat();
}
const files = (await walk(root)).filter(file => !['sw.js','precache.json'].includes(path.basename(file))).sort();
const hash = createHash('sha256');
for (const file of files) { hash.update(path.relative(root,file)); hash.update(await readFile(file)); }
const buildId = hash.digest('hex').slice(0,12);
const urls = files.map(file => '/' + path.relative(root,file).split(path.sep).join('/'));
urls.push('/');
await writeFile(path.join(root,'precache.json'), JSON.stringify(urls));
const serviceWorker = await readFile('public/sw.js','utf8');
await writeFile(path.join(root,'sw.js'), serviceWorker.replaceAll('__BUILD_ID__',buildId));
console.log(`Precached ${urls.length} local assets for the mobile app (${buildId}).`);
