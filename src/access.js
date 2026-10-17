import {validTimetable} from './model.js';
export const ACCESS_KEY = 'schedule.access.v2';
export const DOMAIN = 'seiko.ac.jp';
export function validRecord(record) {
  return record?.version===2 && record.domain===DOMAIN && typeof record.account?.sub==='string' && record.account.sub.length>0
    && typeof record.account.email==='string' && record.account.email.toLowerCase().split('@').length===2 && record.account.email.toLowerCase().split('@')[1]===DOMAIN
    && typeof record.savedAt==='string' && Number.isFinite(Date.parse(record.savedAt)) && validTimetable(record.timetable);
}
export function readOffline(storage) {
  try { const record=JSON.parse(storage.getItem(ACCESS_KEY)); return validRecord(record)?record:null; } catch { return null; }
}
export function saveOffline(storage,record) {
  if(!validRecord(record)) return false;
  try {storage.setItem(ACCESS_KEY,JSON.stringify(record));return true;} catch{return false;}
}
export function clearOffline(storage) {
  try {storage.removeItem(ACCESS_KEY);return storage.getItem(ACCESS_KEY)===null;} catch{return false;}
}
export function configured(config) {
  try {
    const url=new URL(config.apiUrl);
    return config.allowedDomain===DOMAIN && typeof config.googleClientId==='string' && config.googleClientId.endsWith('.apps.googleusercontent.com')
      && url.pathname==='/api/schedule' && !url.username && !url.password && (url.protocol==='https:' || (url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname)));
  } catch{return false;}
}
export async function fetchSchoolSchedule(credential,config,fetcher=fetch) {
  if(!configured(config)) throw new Error('運営者による認証設定がまだ完了していません。');
  const response=await fetcher(config.apiUrl,{method:'POST',headers:{Authorization:`Bearer ${credential}`},cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});
  let data;
  try {data=await response.json();} catch {throw new Error('認証サーバーから正しい応答を受信できませんでした。');}
  if(!response.ok) throw new Error(typeof data.error==='string'?data.error:'認証に失敗しました。');
  if(!validRecord(data)) throw new Error('受信した時間割データが不正です。');
  return data;
}
