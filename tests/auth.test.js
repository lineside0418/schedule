import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair, SignJWT, createLocalJWKSet, exportJWK} from 'jose';
import {verifySchoolToken,AccessError} from '../worker/src/auth.js';
import {makeHandler} from '../worker/src/index.js';
import {TIMETABLE} from '../worker/src/timetable.js';
import {ACCESS_KEY,validRecord,readOffline,saveOffline,clearOffline,configured,fetchSchoolSchedule} from '../src/access.js';
const client='test-client.apps.googleusercontent.com';
const {privateKey,publicKey}=await generateKeyPair('RS256');
const jwk=await exportJWK(publicKey);jwk.kid='test';
const keys=createLocalJWKSet({keys:[jwk]});
const now=new Date('2026-10-19T00:00:00Z');const epoch=Math.floor(now.getTime()/1000);
const base={sub:'student-id',email:'student@seiko.ac.jp',email_verified:true,hd:'seiko.ac.jp',iss:'https://accounts.google.com',aud:client,iat:epoch,exp:epoch+3600};
const sign=(changes={},key=privateKey,alg='RS256')=>new SignJWT({...base,...changes}).setProtectedHeader({alg,kid:'test'}).sign(key);
const verify=token=>verifySchoolToken(token,client,{keys,now});
test('valid school JWT verified with a real RSA signature',async()=>{assert.deepEqual(await verify(await sign()),{sub:'student-id',email:'student@seiko.ac.jp'});});
test('rejects other school domain, missing hosted domain, unverified email and suffix tricks',async()=>{
 for(const changes of [{hd:'other.ac.jp'},{hd:null},{hd:'sub.seiko.ac.jp'},{email:'student@evilseiko.ac.jp'},{email:'student@seiko.ac.jp.evil.test'},{email:'student@@seiko.ac.jp'},{email_verified:false}]) await assert.rejects(verify(await sign(changes)));
});
test('rejects wrong audience, issuer, expired token and future issuance',async()=>{
 for(const changes of [{aud:'other-client'},{iss:'https://evil.test'},{exp:epoch},{iat:epoch+300},{sub:''}]) await assert.rejects(verify(await sign(changes)));
});
test('rejects forged token, wrong signing key, none/HS256 and malformed credentials',async()=>{
 const original=await sign();const parts=original.split('.');parts[1]=Buffer.from(JSON.stringify({...base,hd:'other.ac.jp'})).toString('base64url');
 await assert.rejects(verify(parts.join('.')));
 const other=await generateKeyPair('RS256');await assert.rejects(verify(await sign({},other.privateKey)));
 const hs=await new SignJWT(base).setProtectedHeader({alg:'HS256',kid:'test'}).sign(new Uint8Array(32));await assert.rejects(verify(hs));
 for(const token of ['bad','',`e30.${Buffer.from(JSON.stringify(base)).toString('base64url')}.`,'x'.repeat(17000)])await assert.rejects(verify(token));
});
test('server fails closed when client ID is unset',async()=>{await assert.rejects(verifySchoolToken(await sign(),'',{keys,now}),e=>e.status===503);});
const env={GOOGLE_CLIENT_ID:client,ALLOWED_ORIGINS:'https://lineside0418.github.io'};
const request=(token,origin=env.ALLOWED_ORIGINS,method='POST',path='/api/schedule')=>new Request('https://api.test'+path,{method,headers:{Origin:origin,...(token?{Authorization:`Bearer ${token}`}:{})}});
const handler=makeHandler((token,id)=>verifySchoolToken(token,id,{keys,now}));
test('API gives timetable only after signature and domain verification',async()=>{
 const response=await handler(request(await sign()),env);assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.equal(response.headers.get('Access-Control-Allow-Origin'),env.ALLOWED_ORIGINS);
 const data=await response.json();assert.ok(validRecord(data));assert.deepEqual(data.timetable,TIMETABLE);
});
test('API denies anonymous, wrong domain and tampered tokens without disclosing timetable',async()=>{
 for(const token of [null,'bad',await sign({hd:'other.ac.jp'})]){const response=await handler(request(token),env);assert.ok([401,403].includes(response.status));assert.equal(JSON.stringify(await response.json()).includes('timetable'),false);}
});
test('API restricts exact origin, methods and routes; preflight contains no school data',async()=>{
 assert.equal((await handler(request(null,'https://evil.test'),env)).status,403);
 assert.equal((await handler(request(null,'https://lineside0418.github.io.evil.test'),env)).status,403);
 assert.equal((await handler(request(null,env.ALLOWED_ORIGINS,'GET'),env)).status,405);
 assert.equal((await handler(request(null,env.ALLOWED_ORIGINS,'POST','/worker/src/timetable.js'),env)).status,404);
 const preflight=await handler(request(null,env.ALLOWED_ORIGINS,'OPTIONS'),env);assert.equal(preflight.status,204);assert.equal(await preflight.text(),'');
});
function storage(){const map=new Map();return{getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};}
const record={version:2,domain:'seiko.ac.jp',account:{sub:'student-id',email:'student@seiko.ac.jp'},timetable:TIMETABLE,savedAt:now.toISOString()};
test('offline record survives reload without a Google token or network request',()=>{
 const s=storage();assert.ok(saveOffline(s,record));assert.deepEqual(readOffline(s),record);assert.equal(s.getItem(ACCESS_KEY).includes('credential'),false);assert.equal(s.getItem(ACCESS_KEY).includes('id_token'),false);assert.ok(clearOffline(s));assert.equal(readOffline(s),null);
});
test('corrupt, old, wrong-domain or incomplete offline data is rejected',()=>{
 const s=storage();for(const value of ['not json',JSON.stringify({...record,version:1}),JSON.stringify({...record,domain:'evil.test'}),JSON.stringify({...record,timetable:{}})]){s.setItem(ACCESS_KEY,value);assert.equal(readOffline(s),null);}
});
test('blocked/quota-exceeded storage does not claim persistence or successful logout',()=>{
 const blocked={getItem(){throw Error('denied');},setItem(){throw Error('quota');},removeItem(){throw Error('denied');}};
 assert.equal(readOffline(blocked),null);assert.equal(saveOffline(blocked,record),false);assert.equal(clearOffline(blocked),false);
});
const config={allowedDomain:'seiko.ac.jp',googleClientId:client,apiUrl:'https://api.test/api/schedule'};
test('client sends ID token only to configured HTTPS API, not cookies or browser storage',async()=>{
 assert.ok(configured(config));for(const change of [{apiUrl:'http://api.test/api/schedule'},{apiUrl:'https://api.test/other'},{googleClientId:''},{allowedDomain:'evil.test'}])assert.equal(configured({...config,...change}),false);
 let captured;
 const result=await fetchSchoolSchedule('one-time-token',config,async(url,options)=>{captured={url,options};return new Response(JSON.stringify(record));});
 assert.deepEqual(result,record);assert.equal(captured.options.credentials,'omit');assert.equal(captured.options.cache,'no-store');assert.equal(captured.options.redirect,'error');assert.equal(captured.options.headers.Authorization,'Bearer one-time-token');
});
test('client fails closed for server rejection, invalid data or failed network',async()=>{
 for(const fetcher of [async()=>new Response(JSON.stringify({error:'denied'}),{status:403}),async()=>new Response(JSON.stringify({...record,domain:'evil.test'})),async()=>{throw Error('offline');}])await assert.rejects(fetchSchoolSchedule('token',config,fetcher));
});
test('logout can clear the in-memory timetable as well as persisted data',async()=>{
 const {setTimetable,getTimetable,clearTimetable}=await import('../src/model.js');
 setTimetable(TIMETABLE);assert.equal(getTimetable()[1].length,6);clearTimetable();assert.deepEqual(getTimetable(),{});
});
