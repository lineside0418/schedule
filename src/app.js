import {DAY_NAMES, DAY_IDS, DEFAULT_TIMES, getTimetable, setTimetable, clearTimetable, validTimes, scheduleState, defaultDay, dayFromHash, viewedDate} from './model.js';
import {startClock} from './runtime.js';
import {AUTH_CONFIG} from './config.js';
import {ACCESS_KEY, readOffline, saveOffline, clearOffline, configured, fetchSchoolSchedule} from './access.js';
const escapeHTML = value => String(value).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let accessRecord = null;
let authBusy = false;
let authGeneration = 0;
let googleReady = false;
let googleLoading;
let authMode = 'login';
function browserStorage() { try {return localStorage;} catch {return null;} }

const $ = s => document.querySelector(s);
const STORAGE_KEY = 'schedule.settings.v1';
let settings = { times: structuredClone(DEFAULT_TIMES), theme:'system' };
try {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (stored && validTimes(stored.times)) settings.times = stored.times;
  if (['system','light','dark'].includes(stored?.theme)) settings.theme = stored.theme;
} catch { /* Denied storage and malformed data fall back to defaults. */ }
let selectedDay = dayFromHash(location.hash) ?? defaultDay(new Date());
let autoDay = !dayFromHash(location.hash);
let lastRowsKey = '';
let registration;
let lastUpdateCheck = 0;
let installPrompt;
const phaseNames = {before:'始業前', class:'授業中', break:'休み時間', lunch:'昼休み', finished:'本日の授業終了', off:'本日は授業なし'};
function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
  const dark = settings.theme==='dark' || (settings.theme==='system' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name="theme-color"]').content = dark ? '#171a19' : '#f4f3ee';
}
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);
function notify(message) {
  $('#toast').textContent = message;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { $('#toast').textContent=''; },4500);
}
function nextLabel(next) {
  return next.daysAway===0 ? 'NEXT' : `${Number(next.dateKey.slice(5,7))}/${Number(next.dateKey.slice(8,10))}（${DAY_NAMES[next.day]}）`;
}
function render(now) {
  if(!accessRecord) return;
  const TIMETABLE = getTimetable();
  const state = scheduleState(now,settings.times);
  if (autoDay) selectedDay = defaultDay(now);
  const h = String(Math.floor(state.minute/60)).padStart(2,'0');
  const m = String(state.minute%60).padStart(2,'0');
  $('#clock').textContent = `${h}:${m}:${String(state.second).padStart(2,'0')}`;
  $('#clock').dateTime = now.toISOString();
  $('#phase-label').textContent = phaseNames[state.phase];
  $('.live-panel').dataset.phase = state.phase;
  const live = $('#live-content');
  // Only replace summary when its text changes, preserving accessibility and DOM state.
  const summary = state.current
    ? `<div class="live-main"><span class="live-period">${state.current.index+1}<small>限</small></span><div><h2>${escapeHTML(state.current.subject)}</h2><p>終了まで ${Math.ceil(state.remainingSeconds/60)}分</p></div></div><div class="up-next"><span>NEXT</span><strong>${escapeHTML(state.next.subject)}</strong><small>${state.next.daysAway ? nextLabel(state.next) : settings.times[state.next.index][0]+'〜'}</small></div>`
    : `<div class="live-main upcoming"><div><span class="summary-kicker">${state.next.daysAway===0 ? '次の授業' : '次の授業日'}</span><h2>${escapeHTML(state.next.subject)}</h2><p>${state.next.daysAway ? nextLabel(state.next)+' ' : ''}${state.next.index+1}限 · ${settings.times[state.next.index][0]}〜${state.remainingSeconds!==null ? ' · あと'+Math.ceil(state.remainingSeconds/60)+'分' : ''}</p></div><span class="next-arrow" aria-hidden="true">↗</span></div>`;
  if (live.innerHTML !== summary) live.innerHTML = summary;
  $('#progress').style.width = `${state.progress*100}%`;
  const date = viewedDate(now,selectedDay);
  $('#day-date').textContent = `${date.year} / ${String(date.month).padStart(2,'0')} / ${String(date.date).padStart(2,'0')}${selectedDay===state.day ? ' · TODAY' : ''}`;
  $('#day-title').textContent = DAY_NAMES[selectedDay]+'曜日';
  $('#today').disabled = autoDay && selectedDay===defaultDay(now);
  document.querySelectorAll('.day-tab').forEach(a => {
    a.setAttribute('aria-current',Number(a.dataset.day)===selectedDay ? 'page' : 'false');
    a.classList.toggle('is-today',Number(a.dataset.day)===state.day);
  });
  const key = JSON.stringify([selectedDay,state.key,state.current?.index,state.next?.day,state.next?.index,state.next?.dateKey,settings.times]);
  if (key!==lastRowsKey) {
    lastRowsKey = key;
    $('#lessons').replaceChildren();
    TIMETABLE[selectedDay].forEach((row,i) => {
      const isCurrent = state.current?.day===selectedDay && state.current.index===i;
      const isNext = state.next?.day===selectedDay && state.next.index===i && date.key===state.next.dateKey;
      const done = selectedDay===state.day && settings.times[i][1] <= `${h}:${m}`;
      if(i===4) {
        const lunch = document.createElement('div'); lunch.className='lunch-divider';
        lunch.textContent = `昼休み  ${settings.times[3][1]} — ${settings.times[4][0]}`;
        $('#lessons').append(lunch);
      }
      const article = document.createElement('article');
      article.className=`lesson ${isCurrent ? 'current' : isNext ? 'next' : done ? 'done' : ''}`;
      article.innerHTML = `<div class="period">${String(i+1).padStart(2,'0')}</div><div class="lesson-body"><div class="lesson-title"><h2>${escapeHTML(row.subject)}</h2>${isCurrent ? '<span class="badge">授業中</span>' : isNext ? '<span class="badge">次</span>' : ''}</div><p>${escapeHTML(row.teacher)}</p></div><div class="lesson-time"><span>${settings.times[i][0]}</span><span>${settings.times[i][1]}</span></div>`;
      if(isCurrent) article.setAttribute('aria-label',`${i+1}限 ${escapeHTML(row.subject)} 授業中`);
      $('#lessons').append(article);
    });
    $('#day-note').textContent = selectedDay===6 ? '4 LESSONS · 午前授業' : '6 LESSONS';
  }
  $('#connection').textContent = navigator.onLine ? '端末の時刻で自動更新' : 'オフライン · 自動更新中';
}
for(let day=1; day<=6; day++) {
  const link=document.createElement('a'); link.href=`#/${DAY_IDS[day]}`; link.className='day-tab'; link.dataset.day=day;
  link.innerHTML=`<span>${DAY_NAMES[day]}</span><small>${['','MON','TUE','WED','THU','FRI','SAT'][day]}</small>`;
  $('.day-tabs').append(link);
}
window.addEventListener('hashchange',() => {
  selectedDay=dayFromHash(location.hash) ?? defaultDay(new Date());
  autoDay=!dayFromHash(location.hash); render(new Date());
});
function goToday(e) {
  e?.preventDefault(); autoDay=true; selectedDay=defaultDay(new Date());
  history.replaceState(null,'',location.pathname+location.search); render(new Date());
}
$('#today').addEventListener('click',goToday); $('.brand').addEventListener('click',goToday);
window.addEventListener('offline',() => render(new Date()));
const dialog=$('#settings');
function fillTimes(times) {
  $('#time-inputs').replaceChildren();
  times.forEach(([start,end],i) => {
    const row=document.createElement('div'); row.className='time-row';
    row.innerHTML=`<span>${i+1}限</span><input type="time" required name="start-${i}" aria-label="${i+1}限の開始" value="${start}"><span>—</span><input type="time" required name="end-${i}" aria-label="${i+1}限の終了" value="${end}">`;
    $('#time-inputs').append(row);
  });
}
$('#settings-open').addEventListener('click',() => {
  fillTimes(settings.times); $('#theme').value=settings.theme; $('#settings-error').textContent=''; dialog.showModal();
});
$('#settings-close').addEventListener('click',() => dialog.close());
$('#reset-times').addEventListener('click',() => fillTimes(DEFAULT_TIMES));
$('#settings-form').addEventListener('submit',e => {
  e.preventDefault();
  const data=new FormData(e.target);
  const times=DEFAULT_TIMES.map((_,i) => [data.get(`start-${i}`),data.get(`end-${i}`)]);
  if(!validTimes(times)) { $('#settings-error').textContent='開始より後に終了時刻を設定し、授業同士が重ならないようにしてください。'; return; }
  settings={times,theme:$('#theme').value};
  let saved=true;
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(settings)); } catch { saved=false; }
  applyTheme(); lastRowsKey=''; render(new Date()); dialog.close();
  notify(saved ? '設定を保存しました' : '設定を適用しました。この環境では保存できないため、再起動すると初期値に戻ります。');
});
window.addEventListener('storage',e => {
  if(e.key===ACCESS_KEY) {
    const record=readOffline(browserStorage());
    if(record) activateAccess(record); else lockAccess();
    return;
  }
  if(e.key!==STORAGE_KEY) return;
  try { const other=JSON.parse(e.newValue); if(validTimes(other?.times) && ['system','light','dark'].includes(other.theme)) {settings=other; applyTheme(); lastRowsKey=''; render(new Date());} } catch { /* Ignore invalid changes. */ }
});
async function checkUpdate() {
  if(!registration || !navigator.onLine || Date.now()-lastUpdateCheck<60000) return;
  lastUpdateCheck=Date.now();
  try { await registration.update(); } catch { /* Offline does not interrupt the timetable. */ }
}
startClock({render,onResume:() => {
  checkUpdate();
  if(!accessRecord && navigator.onLine) prepareGoogle();
}});
window.addEventListener('beforeinstallprompt',e => { e.preventDefault(); installPrompt=e; $('#install').hidden=false; });
$('#install').addEventListener('click',async () => {
  if(!installPrompt) return;
  await installPrompt.prompt(); installPrompt=null; $('#install').hidden=true;
});
window.addEventListener('appinstalled',() => { installPrompt=null; $('#install').hidden=true; });
if('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('../sw.js',import.meta.url),{scope:new URL('../',import.meta.url).pathname,updateViaCache:'none'})
    .then(reg => {
      registration=reg;
      const offerUpdate=() => { $('#update-banner').hidden=!reg.waiting; };
      offerUpdate();
      reg.addEventListener('updatefound',() => {
        const worker=reg.installing;
        worker?.addEventListener('statechange',() => {
          if(worker.state==='installed') {
            offerUpdate();
            $('#offline-status').textContent='オフライン利用の準備ができています。';
          }
        });
      });
      navigator.serviceWorker.ready.then(() => {$('#offline-status').textContent='オフライン利用の準備ができています。';});
      checkUpdate();
    }).catch(() => { $('#offline-status').textContent='オフライン準備に失敗しました。オンラインで再度開いてください。'; });
  let refreshing=false;
  navigator.serviceWorker.addEventListener('controllerchange',() => {
    if(refreshing) return;
    // First installation claims the page without an unnecessary reload.
    if(!sessionStorageSafe('schedule.update-requested')) return;
    refreshing=true; location.reload();
  });
  $('#update-apply').addEventListener('click',() => {
    if(!registration?.waiting) return;
    try {sessionStorage.setItem('schedule.update-requested','1');} catch {}
    // Reload after worker activation, also when sessionStorage is unavailable.
    const worker=registration.waiting;
    worker.addEventListener('statechange',() => {if(worker.state==='activated' && !refreshing){refreshing=true; location.reload();}});
    worker.postMessage({type:'SKIP_WAITING'});
  });
} else $('#offline-status').textContent='このブラウザではオフライン機能を利用できません。';
function sessionStorageSafe(key) {
  try {const value=sessionStorage.getItem(key); sessionStorage.removeItem(key); return value;} catch {return null;}
}

function activateAccess(record) {
  setTimetable(record.timetable); accessRecord=record; lastRowsKey='';
  $('#auth-cancel').hidden=true;
  $('#access-gate').hidden=true; $('#schedule-content').hidden=false;
  $('#account-email').textContent=record.account.email;
  $('#data-saved-at').textContent='データ取得日：'+new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'short'}).format(new Date(record.savedAt));
  $('#sign-out').hidden=false; $('#refresh-data').hidden=false;
  $('#today').hidden=false; render(new Date());
}
function lockAccess() {
  clearTimetable();
  $('#auth-cancel').hidden=true;
  accessRecord=null; lastRowsKey=''; authGeneration++; authMode='login';
  $('#schedule-content').hidden=true; $('#access-gate').hidden=false;
  $('#lessons').replaceChildren(); $('#live-content').replaceChildren();
  $('#account-email').textContent='未ログイン'; $('#data-saved-at').textContent='';
  $('#sign-out').hidden=true; $('#refresh-data').hidden=true;
  if(navigator.onLine) prepareGoogle();
  else {$('#auth-message').textContent='初回利用にはインターネット接続と学校Googleアカウントでのログインが必要です。';$('#auth-retry').hidden=false;}
}
function loadGoogle() {
  if(window.google?.accounts?.id) return Promise.resolve();
  if(googleLoading) return googleLoading;
  googleLoading=new Promise((resolve,reject) => {
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
    const timeout=setTimeout(() => {script.remove();googleLoading=null;reject(new Error('Googleログインを読み込めませんでした。通信環境を確認してください。'));},15000);
    script.onload=()=>{clearTimeout(timeout);if(window.google?.accounts?.id)resolve();else{googleLoading=null;reject(new Error('このブラウザではGoogleログインを開始できませんでした。'));}};
    script.onerror=()=>{clearTimeout(timeout);script.remove();googleLoading=null;reject(new Error('Googleログインの読み込みに失敗しました。'));};
    document.head.append(script);
  });
  return googleLoading;
}
async function prepareGoogle() {
  if(authBusy) return;
  if(!configured(AUTH_CONFIG)) {$('#auth-message').textContent='運営者による認証設定がまだ完了していません。';$('#auth-retry').hidden=true;return;}
  if(!navigator.onLine){$('#auth-message').textContent='Googleログインにはインターネット接続が必要です。';$('#auth-retry').hidden=false;return;}
  try {
    $('#auth-message').textContent='Googleログインを準備しています…';
    await loadGoogle();
    if(accessRecord && authMode!=='refresh') return;
    if(!googleReady) {
      google.accounts.id.initialize({client_id:AUTH_CONFIG.googleClientId,hd:AUTH_CONFIG.allowedDomain,auto_select:false,callback:onGoogleCredential});
      googleReady=true;
    }
    $('#google-button').replaceChildren();
    google.accounts.id.renderButton($('#google-button'),{type:'standard',theme:'outline',size:'large',text:'signin_with',shape:'rectangular',locale:'ja'});
    $('#auth-message').textContent='@seiko.ac.jp の学校Googleアカウントを選択してください。';
    $('#auth-retry').hidden=true;
  } catch(error){$('#auth-message').textContent=error.message;$('#auth-retry').hidden=false;}
}
async function onGoogleCredential(response) {
  if(authBusy || !response.credential) return;
  authBusy=true;
  const generation=authGeneration;
  $('#google-button').inert=true;
  $('#auth-message').textContent='学校アカウントを確認しています…';
  try {
    const record=await fetchSchoolSchedule(response.credential,AUTH_CONFIG);
    if(generation!==authGeneration) return;
    const stored=saveOffline(browserStorage(),record);
    activateAccess(record); authMode='login';
    notify(stored?'学校アカウントを確認し、時間割を保存しました':'時間割を読み込みましたが、端末に保存できませんでした。再起動するとログインが必要です。');
  } catch(error) {
    if(generation===authGeneration){$('#auth-message').textContent=error.name==='TimeoutError'?'認証サーバーへの接続がタイムアウトしました。再度ログインしてください。':error.message;$('#auth-retry').hidden=false;}
  } finally {authBusy=false;$('#google-button').inert=false;}
}
$('#auth-cancel').addEventListener('click',()=>{authGeneration++;authMode='login';if(accessRecord) activateAccess(accessRecord);});
$('#auth-retry').addEventListener('click',()=>prepareGoogle());
$('#refresh-data').addEventListener('click',()=>{
  if(!navigator.onLine){notify('時間割の更新にはインターネット接続が必要です。');return;}
  dialog.close();$('#auth-cancel').hidden=false;authMode='refresh';$('#access-gate').hidden=false;$('#schedule-content').hidden=true;prepareGoogle();
});
$('#sign-out').addEventListener('click',()=>{
  if(!clearOffline(browserStorage())) {notify('保存データを削除できませんでした。ブラウザのサイトデータを削除してください。');return;}
  window.google?.accounts?.id.disableAutoSelect();dialog.close();lockAccess();notify('ログアウトし、このブラウザの時間割データを削除しました。');
});
// Offline records contain no Google ID token. An expired Google session never blocks saved data.
const storedAccess=readOffline(browserStorage());
if(storedAccess) activateAccess(storedAccess); else lockAccess();
