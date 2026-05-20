let scheduleData = null;
let currentWeek = ''; // 'weekA' or 'weekB'
let selectedDay = ''; // 'Mon', 'Tue', etc.
let currentTheme = 'light';

// 時間割のスケジュール定義
const PERIOD_SCHEDULE = [
    { start: '00:00', end: '09:35', highlight: 0 },
    { start: '09:35', end: '10:35', highlight: 1 },
    { start: '10:35', end: '11:35', highlight: 2 },
    { start: '11:35', end: '12:35', highlight: 3 },
    { start: '12:35', end: '14:10', highlight: 4 },
    { start: '14:10', end: '15:10', highlight: 5 },
    { start: '15:10', end: '23:59', highlight: null, nextDay: true } // 放課後はハイライトなし、翌日表示
];

// ISO週番号を取得
function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// 現在時刻に基づいてハイライト情報を取得
function getHighlightInfo() {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    for (const period of PERIOD_SCHEDULE) {
        if (currentTime >= period.start && currentTime < period.end) {
            return period;
        }
    }
    return PERIOD_SCHEDULE[0];
}

// 初期化
async function init() {
    try {
        const response = await fetch('schedule.json');
        scheduleData = await response.json();
        
        setupTheme();
        determineInitialState();
        renderWeekDisplay();
        renderDayButtons();
        renderSchedule(true); // 初回はアニメーションあり
        setupEventListeners();
        
        startClock();
    } catch (error) {
        console.error('Failed to load schedule:', error);
        document.getElementById('schedule-container').innerHTML = '<div class="no-classes">データの読み込みに失敗しました</div>';
    }
}

function startClock() {
    const display = document.getElementById('current-day-display');
    const daysJP = ['日', '月', '火', '水', '木', '金', '土'];
    
    function update() {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const date = String(now.getDate()).padStart(2, '0');
        const day = daysJP[now.getDay()];
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        display.textContent = `${month}/${date}(${day}) ${hours}:${minutes}:${seconds}`;
        
        // 00秒に状態を再チェックして、必要なら翌日表示に切り替え
        if (now.getSeconds() === 0) {
            const oldSelectedDay = selectedDay;
            determineInitialState();
            if (oldSelectedDay !== selectedDay) {
                renderDayButtons();
                renderSchedule(true);
            } else {
                updateHighlightsOnly();
            }
        }
    }
    
    setInterval(update, 1000);
    update();
}

function setupTheme() {
    const savedTheme = localStorage.getItem('theme');
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    currentTheme = savedTheme || systemTheme;
    applyTheme(currentTheme);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const metaThemeColor = document.getElementById('theme-color-meta');
    metaThemeColor.setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff');
    localStorage.setItem('theme', theme);
}

// 初期状態
function determineInitialState() {
    const now = new Date();
    const info = getHighlightInfo();
    const targetDate = new Date(now);
    
    if (info.nextDay) targetDate.setDate(targetDate.getDate() + 1);
    
    // 週判定
    const weekNum = getISOWeek(targetDate);
    currentWeek = (weekNum % 2 !== 0) ? scheduleData.settings.oddWeek : scheduleData.settings.evenWeek;
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let dayIdx = targetDate.getDay();
    
    // 日曜なら月曜へ
    if (dayIdx === 0) {
        dayIdx = 1;
    }
    
    selectedDay = days[dayIdx];
}

function renderWeekDisplay() {
    const display = document.getElementById('week-display');
    display.textContent = currentWeek === 'weekA' ? 'A週' : 'B週';
}

function renderDayButtons() {
    const dayBtns = document.querySelectorAll('.day-btn');
    dayBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.day === selectedDay);
    });
}

function renderSchedule(withAnimation = false) {
    const container = document.getElementById('schedule-container');
    const daySchedule = scheduleData[currentWeek][selectedDay];
    
    if (!daySchedule || daySchedule.length === 0) {
        container.innerHTML = `<div class="no-classes">授業はありません</div>`;
        return;
    }
    
    const info = getHighlightInfo();
    const now = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    const targetDate = new Date(now);
    if (info.nextDay) targetDate.setDate(targetDate.getDate() + 1);
    let targetDayIdx = targetDate.getDay();
    if (targetDayIdx === 0) targetDayIdx = 1;
    const isTargetDay = days[targetDayIdx] === selectedDay;

    let html = '<div class="schedule-list">';
    daySchedule.forEach((item, index) => {
        const isNext = isTargetDay && index === info.highlight;
        const animStyle = withAnimation ? `style="animation-delay: ${index * 0.04}s"` : 'style="animation: none; opacity: 1; transform: none;"';
        
        html += `
            <div class="card ${isNext ? 'highlight' : ''}" ${animStyle}>
                <div class="card-num">${index + 1}</div>
                <div class="card-content">
                    <div class="card-title">${item.title}</div>
                    <div class="card-teacher">${item.teacher}</div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function updateHighlightsOnly() {
    const info = getHighlightInfo();
    const now = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    const targetDate = new Date(now);
    if (info.nextDay) targetDate.setDate(targetDate.getDate() + 1);
    let targetDayIdx = targetDate.getDay();
    if (targetDayIdx === 0) targetDayIdx = 1;
    const isTargetDay = days[targetDayIdx] === selectedDay;

    const cards = document.querySelectorAll('.card');
    cards.forEach((card, index) => {
        const isNext = isTargetDay && index === info.highlight;
        card.classList.toggle('highlight', !!isNext);
    });
}

function setupEventListeners() {
    document.getElementById('theme-toggle').addEventListener('click', () => {
        currentTheme = currentTheme === 'light' ? 'dark' : 'light';
        applyTheme(currentTheme);
    });
    
    const dayBtns = document.querySelectorAll('.day-btn');
    dayBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (selectedDay === btn.dataset.day) return;
            selectedDay = btn.dataset.day;
            renderDayButtons();
            renderSchedule(true);
        });
    });
}

init();
