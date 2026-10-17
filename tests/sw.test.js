import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../sw.js',import.meta.url),'utf8');
function fixture(scope='https://example.github.io/schedule/') {
 const handlers=new Map(), stores=new Map();let online=true, skipped=false,claimed=false;
 const fetches=[];
 const fetch=async request=>{fetches.push(request.url||request);if(!online)throw Error('offline');return new Response('network:'+ (request.url||request));};
 const caches={
   async open(name){if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name);return {
     async addAll(requests){const responses=await Promise.all(requests.map(fetch));requests.forEach((r,i)=>data.set(r.url,responses[i]));},
     async match(key){return data.get(key.url||key)?.clone();},
   };},
   async keys(){return [...stores.keys()];},async delete(key){return stores.delete(key);}
 };
 vm.runInNewContext(source,{self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn),clients:{claim:async()=>{claimed=true;}},skipWaiting:()=>{skipped=true;}},URL,Request,Response,caches,fetch});
 async function event(name,props={}){let wait;handlers.get(name)({...props,waitUntil:p=>{wait=p;}});await wait;}
 function request(url,mode='cors',method='GET'){let response;handlers.get('fetch')({request:{url,mode,method},respondWith:p=>response=p});return response;}
 return {handlers,stores,fetches,event,request,setOnline:v=>online=v,get skipped(){return skipped;},get claimed(){return claimed;}};
}
test('precache includes every asset under the GitHub Pages subdirectory',async()=>{
 const f=fixture();await f.event('install');assert.equal(f.fetches.length,15);assert.ok(f.fetches.every(url=>url.startsWith('https://example.github.io/schedule/')));
});
test('offline deep-link navigation and assets use installed cache',async()=>{
 const f=fixture();await f.event('install');f.setOnline(false);
 assert.match(await (await f.request('https://example.github.io/schedule/?source=homescreen','navigate')).text(),/schedule\//);
 assert.match(await (await f.request('https://example.github.io/schedule/privacy.html','navigate')).text(),/privacy.html/);
 assert.match(await (await f.request('https://example.github.io/schedule/src/app.js')).text(),/app.js/);
});
test('does not intercept other apps, cross-origin, writes or unknown resources',()=>{
 const f=fixture();for(const [url,mode,method] of [['https://example.github.io/other/','navigate','GET'],['https://other.test/schedule/src/app.js','cors','GET'],['https://example.github.io/schedule/src/app.js','cors','POST'],['https://example.github.io/schedule/unknown','cors','GET']]) assert.equal(f.request(url,mode,method),undefined);
});
test('activation only removes this app’s old caches',async()=>{
 const f=fixture();f.stores.set('schedule:/schedule/:old',new Map());f.stores.set('schedule:/other/:old',new Map());f.stores.set('unrelated-cache',new Map());
 await f.event('install');await f.event('activate');assert.equal(f.stores.has('schedule:/schedule/:old'),false);assert.ok(f.stores.has('schedule:/other/:old'));assert.ok(f.stores.has('unrelated-cache'));assert.equal(f.claimed,true);
});
test('new worker waits for explicit update acceptance',()=>{
 const f=fixture();assert.equal(f.skipped,false);f.handlers.get('message')({data:{type:'unknown'}});assert.equal(f.skipped,false);f.handlers.get('message')({data:{type:'SKIP_WAITING'}});assert.equal(f.skipped,true);
});
test('failed offline install leaves the old cache untouched',async()=>{
 const f=fixture();f.stores.set('schedule:/schedule/:old',new Map([['working','old version']]));f.setOnline(false);await assert.rejects(f.event('install'));assert.equal(f.stores.get('schedule:/schedule/:old').get('working'),'old version');
});
