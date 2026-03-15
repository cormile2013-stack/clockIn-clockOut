const LUNCH_START = 12 * 60; // 12:00
const LUNCH_END = 13 * 60;   // 13:00
const BASE_IN = 9 * 60 + 30; // 09:30
const FLEX_EARLY_IN = 8 * 60 + 30; // 08:30
const FLEX_LATE_IN = 10 * 60 + 30; // 10:30
const WORK_MINS = 8 * 60;    // 8 hours

document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    const tabs = document.querySelectorAll('.tab-btn');
    let currentMode = 'normal';

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.input-section').forEach(sec => sec.classList.remove('active'));
            currentMode = tab.dataset.target;
            document.getElementById(`section-${currentMode}`).classList.add('active');
            
            // Hide result when switching tabs
            document.getElementById('resultCard').classList.add('hidden');
        });
    });

    document.getElementById('calcBtn').addEventListener('click', calculate);
});

function timeToMins(tStr) {
    if (!tStr) return null;
    const [h, m] = tStr.split(':').map(Number);
    return h * 60 + m;
}

function minsToTime(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function calcLeave(leaveStart, leaveEnd) {
    let leaveLen = leaveEnd - leaveStart;
    let overlapS = Math.max(leaveStart, LUNCH_START);
    let overlapE = Math.min(leaveEnd, LUNCH_END);
    let overlap = Math.max(0, overlapE - overlapS);
    return leaveLen - overlap;
}

// Calculate max flexible clock-in time based on leave end
function getLatestClockIn(leaveEnd) {
    if (leaveEnd < LUNCH_START) {
        let maxTime = leaveEnd + 60;
        return maxTime > LUNCH_START ? LUNCH_START : maxTime;
    } else if (leaveEnd >= LUNCH_START && leaveEnd < LUNCH_END) {
        return LUNCH_END; // Clock in right after lunch
    } else {
        return leaveEnd + 60;
    }
}

// In is actual clock-in min, leaveMins is total leave taken in net minutes
function calcOutTime(clockIn, leaveMins) {
    let reqWork = WORK_MINS - leaveMins;
    if (reqWork <= 0) return clockIn;

    let current = clockIn;
    let worked = 0;
    while(worked < reqWork) {
        if (current < LUNCH_START || current >= LUNCH_END) {
            worked++;
        }
        current++;
    }
    return current;
}

function formatResult(html) {
    const res = document.getElementById('resultContent');
    res.innerHTML = html;
    document.getElementById('resultCard').classList.remove('hidden');
}

function calculate() {
    let html = '';
    const mode = document.querySelector('.tab-btn.active').dataset.target;

    const clockInStr = document.getElementById(`clockIn-${mode}`).value;
    const clockIn = clockInStr ? timeToMins(clockInStr) : null;

    if (mode === 'normal') {
        if (clockIn === null) {
            formatResult('<div class="res-box res-danger">請輸入上班打卡時間</div>');
            return;
        }

        if (clockIn > FLEX_LATE_IN) {
            html += `<div class="res-box res-danger">
                <div>⚠️ <strong>遲到警告</strong></div>
                您已超過最晚彈性上班時間(10:30)。<br>
                建議補請假單 <strong>09:30 - ${minsToTime(Math.ceil((clockIn - BASE_IN)/30)*30 + BASE_IN > clockIn ? minsToTime(Math.ceil((clockIn - BASE_IN)/30)*30 + BASE_IN) : (() => {
                    let minsLate = clockIn - BASE_IN;
                    let roundedMins = Math.ceil(minsLate / 30) * 30;
                    return minsToTime(BASE_IN + roundedMins);
                })() )}</strong>，以免系統視為遲到！
            </div>`;
        }

        let effectiveIn = clockIn < FLEX_EARLY_IN ? FLEX_EARLY_IN : clockIn;
        let outTime = calcOutTime(effectiveIn, 0);

        html += `<div class="res-box res-success">
            🎯 建議下班打卡時間： <br>
            <span class="time-highlight">${minsToTime(outTime)}</span> 之後
        </div>`;

        if (clockIn < FLEX_EARLY_IN) {
            html += `<div class="res-box res-info">💡 提醒：最早彈性時間為 08:30，提早打卡恕無法提前下班時間。</div>`;
        }

    } else if (mode === 'leave') {
        const lsStr = document.getElementById('leaveStart').value;
        const leStr = document.getElementById('leaveEnd').value;
        
        if (!lsStr || !leStr) {
            formatResult('<div class="res-box res-danger">請輸入請假起訖時間</div>');
            return;
        }

        const ls = timeToMins(lsStr);
        const le = timeToMins(leStr);

        if (le <= ls) {
            formatResult('<div class="res-box res-danger">結束時間必須大於開始時間</div>');
            return;
        }

        let netLeave = calcLeave(ls, le);
        html += `<div class="res-box res-info">
            📋 本次假單扣除時數： <strong>${(netLeave/60).toFixed(1)}</strong> 小時
        </div>`;

        const overlapS = Math.max(ls, LUNCH_START);
        const overlapE = Math.min(le, LUNCH_END);
        if (overlapE > overlapS) {
            html += `<div class="res-box res-warning">
                💡 跨午休提醒：假單重疊午休時間 (${minsToTime(overlapS)}-${minsToTime(overlapE)})，此時段系統會自動忽略，不計入扣除時數。
            </div>`;
        }

        let latestClockIn = getLatestClockIn(le);
        let warningNote = '';
        if (le < LUNCH_START && (le + 60) > LUNCH_START) {
            warningNote = `<br><small style="opacity:0.8">因為遇到午休，打卡彈性最高只到 12:00</small>`;
        } else if (le >= LUNCH_START && le < LUNCH_END) {
             warningNote = `<br><small style="opacity:0.8">因為遇到午休，請於午休後 13:00 打卡</small>`;
        }

        html += `<div class="res-box res-warning">
            ⏰ 最晚進公司打卡時限： <strong>${minsToTime(latestClockIn)}</strong> ${warningNote}
        </div>`;

        if (clockIn !== null) {
            if (clockIn > latestClockIn) {
                 html += `<div class="res-box res-danger">
                 ⚠️ <strong>警告</strong><br>
                 您實際上班時間(${minsToTime(clockIn)})已超過請假賦予的彈性時限(${minsToTime(latestClockIn)})！請再補請假單。
                 </div>`;
            }
            let effectiveIn = clockIn < FLEX_EARLY_IN ? FLEX_EARLY_IN : clockIn;
            let outTime = calcOutTime(effectiveIn, netLeave);
            
            // Check if they came in later than allowed flex based on leave
            // For example, if morning leave ends at 12:00, they have 1 hr flex until 13:00?
            // Actually, the rules imply flex still exists after leave. But usually they arrive promptly.
            // Let's just calculate outTime.
            if (outTime <= clockIn) {
                html += `<div class="res-box res-success">🎯 您的工作時數已達標，無需再上班！</div>`;
            } else {
                html += `<div class="res-box res-success">
                    🎯 建議下班打卡時間： <br>
                    <span class="time-highlight">${minsToTime(outTime)}</span> 之後
                </div>`;
            }
        } else {
             html += `<div class="res-box res-warning">
                若要試算下班時間，請填寫「進辦公室打卡時間」。
            </div>`;
        }

    } else if (mode === 'remote') {
        const remoteHours = parseFloat(document.getElementById('remoteHours').value);
        if (isNaN(remoteHours) || remoteHours <= 0) return;

        const remoteEnd = BASE_IN + (remoteHours * 60);
        
        html += `<div class="res-box res-info">
            📋 系統請假申請： <br>
            請申請 <strong>09:30 - ${minsToTime(remoteEnd)}</strong> 的「遠端會議假」。
        </div>`;

        let latestClockIn = getLatestClockIn(remoteEnd);
        let warningNote = '';
        if (remoteEnd < LUNCH_START && (remoteEnd + 60) > LUNCH_START) {
            warningNote = `<br><small style="opacity:0.8">因為遇到午休，打卡彈性最高只到 12:00</small>`;
        } else if (remoteEnd >= LUNCH_START && remoteEnd < LUNCH_END) {
             warningNote = `<br><small style="opacity:0.8">因為遇到午休，請於午休後 13:00 打卡</small>`;
        }

        html += `<div class="res-box res-warning">
            ⏰ 最晚進公司打卡時限： <strong>${minsToTime(latestClockIn)}</strong> ${warningNote}
        </div>`;

        if (clockIn !== null) {
            if (clockIn > latestClockIn) {
                 html += `<div class="res-box res-danger">
                 ⚠️ <strong>警告</strong><br>
                 您實際上班時間(${minsToTime(clockIn)})已超過遠端會議賦予的彈性時限(${minsToTime(latestClockIn)})！請補請一般假。
                 </div>`;
            }
            let effectiveIn = clockIn < FLEX_EARLY_IN ? FLEX_EARLY_IN : clockIn;
            let outTime = calcOutTime(effectiveIn, remoteHours * 60);
            
             html += `<div class="res-box res-success">
                🎯 建議下班打卡時間： <br>
                <span class="time-highlight">${minsToTime(outTime)}</span> 之後
            </div>`;
        }
    }

    formatResult(html);
}
