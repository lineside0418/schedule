export const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];
export const DAY_IDS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const DEFAULT_TIMES = [
  ['08:45', '09:35'], ['09:45', '10:35'], ['10:45', '11:35'],
  ['11:45', '12:35'], ['13:20', '14:10'], ['14:20', '15:10'],
];
// No school timetable is bundled in the public frontend.
let activeTimetable = {};
export function validTimetable(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return [1,2,3,4,5,6].every(day => Array.isArray(value[day]) && value[day].length === (day===6 ? 4 : 6) && value[day].every(row =>
    row && typeof row.subject === 'string' && row.subject.length>0 && row.subject.length<=100 && typeof row.teacher === 'string' && row.teacher.length<=200));
}
export function setTimetable(value) {
  if (!validTimetable(value)) throw new Error('Invalid timetable');
  activeTimetable = structuredClone(value);
}
export function getTimetable() { return activeTimetable; }
export function clearTimetable() { activeTimetable = {}; }
export function validTimes(times) {
  if (!Array.isArray(times) || times.length !== 6) return false;
  let end = -1;
  for (const pair of times) {
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(v => typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v))) return false;
    const [a,b] = pair.map(minutes);
    if (a >= b || a < end) return false;
    end = b;
  }
  return true;
}
export function minutes(value) { const [h,m] = value.split(':').map(Number); return h*60+m; }
export function jstParts(now) {
  // Work in a fixed UTC+9 frame so the device timezone never changes school time.
  const shifted = new Date(now.getTime() + 9*3600000);
  return { day: shifted.getUTCDay(), year: shifted.getUTCFullYear(), month: shifted.getUTCMonth()+1,
    date: shifted.getUTCDate(), minute: shifted.getUTCHours()*60+shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(), key: shifted.toISOString().slice(0,10) };
}
export function scheduleState(now, times = DEFAULT_TIMES) {
  const TIMETABLE = activeTimetable;
  const p = jstParts(now);
  const rows = TIMETABLE[p.day] || [];
  const seconds = p.minute*60+p.second;
  const currentIndex = rows.findIndex((_,i) => seconds >= minutes(times[i][0])*60 && seconds < minutes(times[i][1])*60);
  const futureIndex = rows.findIndex((_,i) => seconds < minutes(times[i][0])*60);
  let next = null;
  if (futureIndex >= 0) next = { day:p.day, index:futureIndex, dateKey:p.key, daysAway:0, ...rows[futureIndex] };
  else {
    for (let offset=1; offset<=7; offset++) {
      const day = (p.day+offset)%7;
      if (TIMETABLE[day]?.length) {
        const future = jstParts(new Date(now.getTime()+offset*86400000));
        next = { day, index:0, dateKey:future.key, daysAway:offset, ...TIMETABLE[day][0] };
        break;
      }
    }
  }
  const current = currentIndex >= 0 ? {day:p.day,index:currentIndex,...rows[currentIndex]} : null;
  let phase = 'before';
  if (!rows.length) phase = 'off';
  else if (current) phase = 'class';
  else if (futureIndex < 0) phase = 'finished';
  else if (futureIndex === 4) phase = 'lunch';
  else if (futureIndex > 0) phase = 'break';
  const progress = current ? (seconds-minutes(times[currentIndex][0])*60)/((minutes(times[currentIndex][1])-minutes(times[currentIndex][0]))*60) : 0;
  const remainingSeconds = current ? minutes(times[currentIndex][1])*60-seconds : (next?.daysAway===0 ? minutes(times[next.index][0])*60-seconds : null);
  return { ...p, current, next, phase, progress, remainingSeconds };
}
export function defaultDay(now) { return jstParts(now).day || 1; }
export function dayFromHash(hash) { const index = DAY_IDS.indexOf(hash.replace(/^#\/?/,'')); return index>=1 ? index : null; }
export function viewedDate(now, day) {
  const p = jstParts(now);
  const delta = (day-p.day+7)%7;
  return jstParts(new Date(now.getTime()+delta*86400000));
}
