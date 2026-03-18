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

// We work backwards from the time they leave work.
// If they take an afternoon leave that ends their day early, we work backward from leaveStart.
// Otherwise (e.g. morning leave), their day ends at the global maximum of 19:30.
function getLatestClockIn(netLeaveMins, leaveStart = 19 * 60 + 30) {
    let reqWork = WORK_MINS - netLeaveMins;
    if (reqWork <= 0) return 19 * 60 + 30; // 19:30
    
    // If leave starts in the afternoon/evening, we assume they are leaving work at leaveStart
    // so we must finish reqWork before leaveStart.
    let isAfternoonLeave = leaveStart > LUNCH_END;
    let maxOutTime = isAfternoonLeave ? Math.min(19 * 60 + 30, leaveStart) : (19 * 60 + 30);
    
    let current = maxOutTime;
    let worked = 0;
    
    while(worked < reqWork) {
        current--;
        if (current < LUNCH_START || current >= LUNCH_END) {
            worked++;
        }
    }
    return current;
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

        let implicitLeave = 0;
        let effectiveClockIn = clockIn;

        if (clockIn > FLEX_LATE_IN) {
            // Find necessary leave end time
            // To be allowed to clock in at `clockIn`, the leave must give enough flex time.
            // A leave ending at `leaveEnd` allows clock-in up to `leaveEnd + 60` (if before lunch).
            // So leaveEnd + 60 >= clockIn  =>  leaveEnd >= clockIn - 60
            // We round `clockIn - 60` UP to the nearest 30 mins.
            let requiredLeaveEnd = Math.ceil((clockIn - 60) / 30) * 30;
            // Leave cannot end before BASE_IN (09:30) and cannot exceed 19:30
            requiredLeaveEnd = Math.max(BASE_IN, requiredLeaveEnd);
            requiredLeaveEnd = Math.min(19 * 60 + 30, requiredLeaveEnd);
            
            implicitLeave = calcLeave(BASE_IN, requiredLeaveEnd);
            let latestClockIn = getLatestClockIn(implicitLeave, BASE_IN); // BASE_IN since morning start
            effectiveClockIn = Math.min(clockIn, latestClockIn);

            let maxLeaveHours = implicitLeave / 60;

            html += `<div class="res-box res-danger">
                <div>⚠️ <strong>遲到警告</strong></div>
                您已超過最晚彈性上班時間(10:30)。<br>
                建議補請假單最多共 <strong style="color: #ef4444;">${maxLeaveHours.toFixed(1)}</strong> 小時<br>
                最晚為 <strong>09:30 - ${minsToTime(requiredLeaveEnd)}</strong>，以免系統視為遲到！
            </div>`;
        }

        let effectiveIn = effectiveClockIn < FLEX_EARLY_IN ? FLEX_EARLY_IN : effectiveClockIn;
        let outTime = calcOutTime(effectiveIn, implicitLeave);
        if (outTime > 19 * 60 + 30) outTime = 19 * 60 + 30;

        html += `<div class="res-box res-success">
            🎯 建議下班打卡時間： <br>
            <span class="time-highlight">${minsToTime(outTime)}</span>
        </div>`;

        if (clockIn < FLEX_EARLY_IN) {
            html += `<div class="res-box res-info">💡 提醒：最早彈性時間為 08:30，提早打卡恕無法提前下班時間。</div>`;
        }

    } else if (mode === 'leave') {
        const inStr = document.getElementById('clockIn-leave').value;
        const outStr = document.getElementById('clockOut-leave').value;
        
        if (!inStr || !outStr) {
            formatResult('<div class="res-box res-danger">請輸入進辦公室與預計下班打卡時間</div>');
            return;
        }

        const cIn = timeToMins(inStr);
        let cOut = timeToMins(outStr);

        if (cOut <= cIn) {
            formatResult('<div class="res-box res-danger">下班時間必須晚於上班時間</div>');
            return;
        }

        // Apply flex rules to actual working period
        let effectiveIn = cIn < FLEX_EARLY_IN ? FLEX_EARLY_IN : cIn;
        let effectiveOut = cOut > (19 * 60 + 30) ? (19 * 60 + 30) : cOut;

        // Calculate actual worked minutes
        let workedMins = 0;
        let current = effectiveIn;
        while (current < effectiveOut) {
            if (current < LUNCH_START || current >= LUNCH_END) {
                workedMins++;
            }
            current++;
        }

        let neededLeaveMins = WORK_MINS - workedMins;
        if (neededLeaveMins <= 0) {
            html += `<div class="res-box res-success">🎯 您的工作時數已達標(滿8小時)，不需請假！</div>`;
            if (cIn > FLEX_LATE_IN) {
                html += `<div class="res-box res-warning">
                    ⚠️ 雖然總工時達標，但您早上(${minsToTime(cIn)})打卡已超過最晚彈性時間(10:30)，仍可能被系統記為遲到。
                </div>`;
            }
        } else {
            // Round needed leave up to nearest 0.5 hours
            let neededLeaveHours = Math.ceil(neededLeaveMins / 30) * 0.5;

            // Generate suggested leave slots
            let leaveSuggestions = '';

            // If clock-in is late (after 10:30), they MUST cover from 09:30 to their flexible needed start.
            if (cIn > FLEX_LATE_IN) {
                // Must leave morning
                let morningEnd = Math.max(BASE_IN, Math.ceil((cIn - 60) / 30) * 30);
                if (morningEnd > LUNCH_START) morningEnd = LUNCH_START;
                
                let morningLeaveMins = morningEnd - BASE_IN;
                
                let remainingLeaveMins = (neededLeaveHours * 60) - morningLeaveMins;
                if (remainingLeaveMins > 0) {
                    let eveningStart = effectiveOut;
                    let eveningEnd = eveningStart + remainingLeaveMins;
                    
                    if (eveningEnd > (19 * 60 + 30)) {
                        let overflow = eveningEnd - (19 * 60 + 30);
                        eveningEnd = 19 * 60 + 30;
                        eveningStart -= overflow;
                        // Avoid pushing start before lunch end if it shouldn't
                        if (eveningStart < LUNCH_END && eveningStart > LUNCH_START) {
                            eveningStart = LUNCH_START - (LUNCH_END - eveningStart);
                        }
                    }
                    
                    leaveSuggestions = `建議請假填寫時段：<br>
                        <strong>09:30 - ${minsToTime(morningEnd)}</strong><br>
                        <strong>${minsToTime(eveningStart)} - ${minsToTime(eveningEnd)}</strong><br>
                        <small style="opacity:0.8">(若跨越12:00-13:00系統會自動扣除午休)</small>`;
                } else {
                    leaveSuggestions = `建議請假填寫時段： <strong>09:30 - ${minsToTime(morningEnd)}</strong>`;
                }
            } else {
                // Normal clock in, missing time is at the end of the day or inside
                let eveningStart = effectiveOut;
                let eveningEnd = eveningStart;
                let neededToFill = neededLeaveHours * 60;
                while (neededToFill > 0) {
                    eveningEnd++;
                    if (eveningEnd <= LUNCH_START || eveningEnd > LUNCH_END) {
                        neededToFill--;
                    }
                }
                
                if (eveningEnd > (19 * 60 + 30)) {
                    let overflow = eveningEnd - (19 * 60 + 30);
                    eveningEnd = 19 * 60 + 30;
                    
                    neededToFill = overflow;
                    while (neededToFill > 0) {
                        eveningStart--;
                        if (eveningStart < LUNCH_START || eveningStart >= LUNCH_END) {
                            neededToFill--;
                        }
                    }
                }
                
                leaveSuggestions = `建議請假填寫時段： <strong>${minsToTime(eveningStart)} - ${minsToTime(eveningEnd)}</strong>`;
            }

            html += `<div class="res-box res-warning">
                ${leaveSuggestions}
            </div>`;

            html += `<div class="res-box res-info">
                📋 預計請假扣除時數： <strong>${neededLeaveHours.toFixed(1)}</strong> 小時
            </div>`;
        }
    }

    formatResult(html);
}
