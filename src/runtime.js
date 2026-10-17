// All paths re-read wall-clock time. Never advance a saved clock by timer ticks.
export function startClock({ render, onResume = () => {}, doc = document, win = window,
  now = () => new Date(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer;
  let stopped = false;
  const tick = () => {
    clearTimer(timer);
    if (stopped || doc.visibilityState === 'hidden') return;
    const date = now();
    render(date);
    timer = setTimer(tick, 1000-(date.getTime()%1000));
  };
  const resume = () => {
    if (stopped || doc.visibilityState === 'hidden') { clearTimer(timer); return; }
    tick();
    onResume();
  };
  const visibility = () => doc.visibilityState === 'hidden' ? clearTimer(timer) : resume();
  doc.addEventListener('visibilitychange', visibility);
  win.addEventListener('pageshow', resume);
  win.addEventListener('focus', resume);
  win.addEventListener('online', resume);
  doc.addEventListener('resume', resume);
  tick();
  return () => {
    stopped = true; clearTimer(timer);
    doc.removeEventListener('visibilitychange',visibility);
    win.removeEventListener('pageshow',resume); win.removeEventListener('focus',resume);
    win.removeEventListener('online',resume); doc.removeEventListener('resume',resume);
  };
}
