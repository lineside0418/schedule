import {mkdir,rm,cp,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await rm('dist',{recursive:true,force:true});
await mkdir('dist');
for(const entry of ['index.html','privacy.html','src','icons','manifest.webmanifest']) await cp(entry,`dist/${entry}`,{recursive:true});
async function collect(dir){let files=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;files.push(...entry.isDirectory()?await collect(path):[path]);}return files.sort();}
const hash=createHash('sha256');
for(const path of await collect('dist')) {hash.update(path);hash.update(await readFile(path));}
const worker=await readFile('sw.js','utf8'); hash.update(worker);
const version=hash.digest('hex').slice(0,16);
await writeFile('dist/sw.js',worker.replace("'development-v2'",JSON.stringify(version)));
await writeFile('dist/.nojekyll','');
// Refuse a public artifact that accidentally contains the school lesson/teacher dataset.
for(const path of await collect('dist')) {
  if(/\.(?:js|html|json)$/.test(path)) {
    const text=await readFile(path,'utf8');
    if(['神保','野谷','脇濱','理理数探'].some(marker=>text.includes(marker))) throw new Error(`Protected school data leaked into ${path}`);
  }
}
console.log(`Built static PWA: dist/ (${version})`);
