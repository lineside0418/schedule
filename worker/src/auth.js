import {createRemoteJWKSet, jwtVerify} from 'jose';
export const ALLOWED_DOMAIN = 'seiko.ac.jp';
const GOOGLE_KEYS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
  timeoutDuration:5000, cooldownDuration:30000, cacheMaxAge:600000,
});
export class AccessError extends Error {
  constructor(status, message) { super(message); this.status=status; }
}
export async function verifySchoolToken(token, clientId, {keys=GOOGLE_KEYS, now=new Date()}={}) {
  if(!clientId || !clientId.endsWith('.apps.googleusercontent.com')) throw new AccessError(503,'認証サーバーの設定が完了していません。');
  if(typeof token!=='string' || token.length>16384 || token.split('.').length!==3) throw new AccessError(401,'Googleログインをやり直してください。');
  let payload;
  try {
    ({payload}=await jwtVerify(token,keys,{
      issuer:['https://accounts.google.com','accounts.google.com'], audience:clientId,
      algorithms:['RS256'], requiredClaims:['sub','iat','exp','email','email_verified','hd'],
      currentDate:now,
    }));
  } catch(error) {
    if(error.code==='ERR_JWKS_TIMEOUT' || error instanceof TypeError) throw new AccessError(503,'Googleの認証情報を確認できませんでした。通信環境を確認して再試行してください。');
    throw new AccessError(401,'Googleの認証情報が無効または期限切れです。再度ログインしてください。');
  }
  if(typeof payload.sub!=='string' || !payload.sub || typeof payload.iat!=='number' || payload.iat>Math.floor(now.getTime()/1000)+60) throw new AccessError(401,'Googleの認証情報が無効です。');
  if(payload.email_verified!==true || payload.hd!==ALLOWED_DOMAIN || typeof payload.email!=='string' || payload.email.toLowerCase().split('@').length!==2 || payload.email.toLowerCase().split('@')[1]!==ALLOWED_DOMAIN) {
    throw new AccessError(403,`@${ALLOWED_DOMAIN} の学校Googleアカウントでログインしてください。`);
  }
  return {sub:payload.sub,email:payload.email};
}
