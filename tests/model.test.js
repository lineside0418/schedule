import {TIMETABLE} from '../worker/src/timetable.js';
import {setTimetable} from '../src/model.js';
setTimetable(TIMETABLE);
import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleState,DEFAULT_TIMES,validTimes,jstParts,defaultDay,dayFromHash} from '../src/model.js';
const state=(time,date='2026-10-19') => scheduleState(new Date(`${date}T${time}+09:00`));
test('provided timetable: exact subjects, teachers and Saturday length',()=>{
 assert.equal(Object.values(TIMETABLE).flat().length,34);
 assert.equal(TIMETABLE[3][1].subject,'現／古');
 assert.equal(TIMETABLE[3][5].subject,'英Ⅰ／Ⅱ');
 assert.equal(TIMETABLE[2][5].teacher,'名／北／出（小／－／－）');
 assert.equal(TIMETABLE[6].length,4);
});
test('all 34 lessons respect inclusive start and exclusive end',()=>{
 for(let day=1;day<=6;day++) for(let i=0;i<TIMETABLE[day].length;i++) {
   const date=`2026-10-${18+day}`;
   const start=state(`${DEFAULT_TIMES[i][0]}:00`,date);
   assert.equal(start.current?.index,i,`${date} period ${i+1} start`);
   assert.equal(start.next.daysAway,i===TIMETABLE[day].length-1?(day===6?2:1):0);
   assert.equal(state(`${DEFAULT_TIMES[i][1]}:00`,date).current,null);
   const before=new Date(new Date(`${date}T${DEFAULT_TIMES[i][0]}:00+09:00`).getTime()-1);
   assert.equal(scheduleState(before).next.index,i);
 }
});
test('morning, break, lunch and end-of-day',()=>{
 assert.equal(state('08:44:59').phase,'before');
 assert.equal(state('08:44:59').next.index,0);
 assert.equal(state('08:45:00').progress,0);
 assert.equal(state('09:10:00').progress,.5);
 assert.equal(state('09:34:59').remainingSeconds,1);
 assert.equal(state('09:35:00').phase,'break');
 assert.equal(state('09:35:00').next.index,1);
 assert.equal(state('12:35:00').phase,'lunch');
 assert.equal(state('13:19:59').remainingSeconds,1);
 assert.equal(state('13:20:00').current.index,4);
 assert.equal(state('15:10:00').phase,'finished');
 assert.equal(state('15:10:00').next.day,2);
});
test('Saturday afternoon and Sunday correctly skip to Monday',()=>{
 for(const [date,time,phase] of [['2026-10-17','12:35:00','finished'],['2026-10-18','00:00:00','off'],['2026-10-18','23:59:59','off']]) {
   const s=state(time,date);assert.equal(s.phase,phase);assert.equal(s.next.day,1);assert.equal(s.next.dateKey,'2026-10-19');assert.equal(s.next.subject,'漢文');
 }
 assert.equal(state('12:34:59','2026-10-17').current.index,3);
});
test('JST independent of host timezone, month and year rollover',()=>{
 assert.equal(jstParts(new Date('2026-10-18T15:00:00Z')).key,'2026-10-19');
 assert.equal(scheduleState(new Date('2026-10-18T23:45:00Z')).current.subject,'漢文');
 assert.equal(state('23:59:59','2026-12-31').next.dateKey,'2027-01-01');
 assert.equal(state('23:59:59','2026-10-31').next.dateKey,'2026-11-02');
 assert.equal(defaultDay(new Date('2026-10-18T01:00:00+09:00')),1);
});
test('custom time validation and safe routing',()=>{
 assert.ok(validTimes(DEFAULT_TIMES));
 for(const times of [null,[],{},[['25:00','26:00'],...DEFAULT_TIMES.slice(1)],[['09:45','09:35'],...DEFAULT_TIMES.slice(1)],[['08:45','09:46'],...DEFAULT_TIMES.slice(1)]]) assert.equal(validTimes(times),false);
 const custom=structuredClone(DEFAULT_TIMES);custom[0]=['08:30','09:20'];
 assert.ok(validTimes(custom));assert.equal(scheduleState(new Date('2026-10-19T08:35:00+09:00'),custom).current.index,0);
 assert.equal(dayFromHash('#/wednesday'),3);assert.equal(dayFromHash('#/invalid'),null);assert.equal(dayFromHash('#/sunday'),null);
});
test('every second across a full week yields consistent current/next',()=>{
 const start=Date.parse('2026-10-19T00:00:00+09:00');
 for(let second=0;second<7*86400;second++) {
   const now=new Date(start+second*1000);const s=scheduleState(now);
   if(s.current){assert.ok(s.progress>=0 && s.progress<1);assert.ok(s.remainingSeconds>0);}
   assert.ok(s.next);assert.ok(s.next.daysAway>=0 && s.next.daysAway<=2);
   if(s.next.daysAway===0) assert.ok(s.minute*60+s.second < Number(DEFAULT_TIMES[s.next.index][0].slice(0,2))*3600+Number(DEFAULT_TIMES[s.next.index][0].slice(3))*60);
 }
});
