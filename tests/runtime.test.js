import {TIMETABLE} from '../worker/src/timetable.js';
import {setTimetable} from '../src/model.js';
setTimetable(TIMETABLE);
import test from 'node:test';
import assert from 'node:assert/strict';
import {startClock} from '../src/runtime.js';
import {scheduleState} from '../src/model.js';
function fixture() {
 const doc=new EventTarget();doc.visibilityState='visible';const win=new EventTarget();
 let time=new Date('2026-10-19T09:34:59+09:00');let sequence=0;let renders=[];let resumes=0;const timers=new Map();
 const stop=startClock({doc,win,now:()=>time,render:date=>renders.push(scheduleState(date)),onResume:()=>resumes++,setTimer:fn=>{timers.set(++sequence,fn);return sequence;},clearTimer:id=>timers.delete(id)});
 return {doc,win,timers,renders,stop,get resumes(){return resumes;},setTime:value=>{time=new Date(value);}};
}
test('sleep through lessons, resume immediately without waiting for a timer',()=>{
 const f=fixture();assert.equal(f.renders.at(-1).current.index,0);
 f.doc.visibilityState='hidden';f.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(f.timers.size,0);
 f.setTime('2026-10-19T13:30:00+09:00');
 f.doc.visibilityState='visible';f.doc.dispatchEvent(new Event('visibilitychange'));
 assert.equal(f.renders.at(-1).current.index,4);assert.equal(f.timers.size,1);f.stop();
});
test('home screen return, BFCache pageshow, focus, online and lifecycle resume',()=>{
 for(const [target,event] of [['doc','visibilitychange'],['win','pageshow'],['win','focus'],['win','online'],['doc','resume']]) {
   const f=fixture();f.setTime('2026-10-20T10:00:00+09:00');f[target].dispatchEvent(new Event(event));
   assert.equal(f.renders.at(-1).day,2);assert.equal(f.renders.at(-1).current.index,1);assert.equal(f.resumes,1);assert.equal(f.timers.size,1);
   f.stop();assert.equal(f.timers.size,0);
 }
});
test('multiple resume events never accumulate timers',()=>{
 const f=fixture();for(let i=0;i<100;i++){f.win.dispatchEvent(new Event('pageshow'));f.win.dispatchEvent(new Event('focus'));}
 assert.equal(f.timers.size,1);f.stop();
 const count=f.renders.length;f.win.dispatchEvent(new Event('focus'));assert.equal(f.renders.length,count);
});
test('midnight, weekend and manual clock changes recompute from wall time',()=>{
 const f=fixture();
 for(const [date,phase] of [['2026-10-17T13:00:00+09:00','finished'],['2026-10-18T00:00:00+09:00','off'],['2026-10-19T00:00:00+09:00','before'],['2026-10-19T08:45:00+09:00','class'],['2026-10-19T08:00:00+09:00','before']]){
   f.setTime(date);const callback=[...f.timers.values()][0];callback();assert.equal(f.renders.at(-1).phase,phase);assert.equal(f.timers.size,1);
 }f.stop();
});
