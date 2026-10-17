import {verifySchoolToken,AccessError,ALLOWED_DOMAIN} from './auth.js';
import {TIMETABLE} from './timetable.js';
export function makeHandler(verify=verifySchoolToken) {
  return async function handle(request,env) {
    const url=new URL(request.url);
    const origin=request.headers.get('Origin');
    const allowed=(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','Vary':'Origin','X-Content-Type-Options':'nosniff'};
    const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
    if(!origin || !allowed.includes(origin)) return respond({error:'このアクセス元は許可されていません。'},403);
    headers['Access-Control-Allow-Origin']=origin;
    if(url.pathname!=='/api/schedule') return respond({error:'Not found'},404);
    if(request.method==='OPTIONS') {
      headers['Access-Control-Allow-Methods']='POST, OPTIONS';
      headers['Access-Control-Allow-Headers']='Authorization';
      headers['Access-Control-Max-Age']='600';
      return new Response(null,{status:204,headers});
    }
    if(request.method!=='POST') {headers.Allow='POST, OPTIONS';return respond({error:'Method not allowed'},405);}
    const authorization=request.headers.get('Authorization')||'';
    if(!authorization.startsWith('Bearer ')) return respond({error:'Googleログインが必要です。'},401);
    try {
      const account=await verify(authorization.slice(7),env.GOOGLE_CLIENT_ID);
      return respond({version:2,domain:ALLOWED_DOMAIN,account,timetable:TIMETABLE,savedAt:new Date().toISOString()});
    } catch(error) {
      // Never log or return tokens, personal claims, or verifier internals.
      return respond({error:error instanceof AccessError?error.message:'認証の確認に失敗しました。少し待って再試行してください。'},error instanceof AccessError?error.status:503);
    }
  };
}
export default {fetch:makeHandler()};
