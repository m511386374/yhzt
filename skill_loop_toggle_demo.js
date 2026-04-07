"auto";

auto.waitFor();

// 最小可复现：技能循环开启 / 关闭 / 再开启
// 目标：验证 loop flag 是否即时生效、是否存在残留状态

var pressTime = 50;
var loopRunning = false;
var loopWorkerId = 0;
var roundCount = 0;
var statusText = "未启动";
var lastButtonClickTime = 0;
var BUTTON_DEBOUNCE_MS = 300;

// 固定两个测试点位，避免依赖复杂配置
var demoSkills = [
    { name: "技能1", x: 520, y: 900, delay: 800 },
    { name: "技能2", x: 650, y: 900, delay: 1200 }
];

var win = floaty.window(
    <vertical bg="#AA000000" padding="8">
        <text text="技能循环开关 Demo" textColor="#ffffff" textSize="14sp"/>
        <text id="info"
              text="状态: 未启动"
              textColor="#ffffff"
              textSize="11sp"
              marginTop="6"/>

        <horizontal marginTop="8">
            <button id="toggle" text="开启循环" w="78" h="38" textSize="11sp"/>
            <button id="stop" text="强制停止" w="78" h="38" textSize="11sp" marginLeft="6"/>
        </horizontal>

        <horizontal marginTop="6">
            <button id="reset" text="计数归零" w="78" h="38" textSize="11sp"/>
            <button id="testOnce" text="单次测试" w="78" h="38" textSize="11sp" marginLeft="6"/>
        </horizontal>

        <horizontal marginTop="6">
            <button id="logBtn" text="打印状态" w="78" h="38" textSize="11sp"/>
            <button id="exitBtn" text="退出" w="78" h="38" textSize="11sp" marginLeft="6"/>
        </horizontal>
    </vertical>
);

win.setPosition(80, 220);
updateInfo();

function canClickNow() {
    var now = new Date().getTime();
    if (now - lastButtonClickTime < BUTTON_DEBOUNCE_MS) return false;
    lastButtonClickTime = now;
    return true;
}

function nowText() {
    var d = new Date();
    function pad(n) { return n < 10 ? "0" + n : String(n); }
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

function setStatus(text) {
    statusText = text;
    updateInfo();
}

function updateInfo() {
    try {
        var lines = [];
        lines.push("状态: " + statusText);
        lines.push("loopRunning: " + loopRunning);
        lines.push("workerId: " + loopWorkerId);
        lines.push("轮次: " + roundCount);
        lines.push("技能数: " + demoSkills.length);
        win.info.setText(lines.join("\n"));
        win.toggle.setText(loopRunning ? "关闭循环" : "开启循环");
    } catch (e) {
        log("updateInfo error: " + e);
    }
}

function logState(reason) {
    log("[DEMO][" + nowText() + "] " + reason +
        " | running=" + loopRunning +
        " workerId=" + loopWorkerId +
        " round=" + roundCount);
}

function sleepWithStopCheck(totalMs, myWorkerId) {
    var remain = totalMs;
    while (remain > 0) {
        if (!loopRunning) {
            logState("sleep阶段检测到 loopRunning=false，立即退出");
            return false;
        }
        if (myWorkerId !== loopWorkerId) {
            logState("sleep阶段检测到 workerId 已过期，立即退出");
            return false;
        }
        var slice = remain > 50 ? 50 : remain;
        sleep(slice);
        remain -= slice;
    }
    return true;
}

function startLoop() {
    if (loopRunning) {
        toast("循环已经在运行");
        logState("重复 start 被忽略");
        return;
    }

    loopRunning = true;
    loopWorkerId += 1;
    var myWorkerId = loopWorkerId;
    setStatus("循环中");
    logState("收到开启请求");
    toast("已开启循环，workerId=" + myWorkerId);

    threads.start(function () {
        try {
            logState("线程启动");

            while (true) {
                if (!loopRunning) {
                    logState("主循环检测到关闭标记，退出");
                    break;
                }
                if (myWorkerId !== loopWorkerId) {
                    logState("主循环检测到自己过期，退出");
                    break;
                }

                roundCount += 1;
                setStatus("循环中 - 第" + roundCount + "轮");
                logState("开始第" + roundCount + "轮");

                for (var i = 0; i < demoSkills.length; i++) {
                    if (!loopRunning) {
                        logState("技能前检测到关闭标记，退出");
                        break;
                    }
                    if (myWorkerId !== loopWorkerId) {
                        logState("技能前检测到自己过期，退出");
                        break;
                    }

                    var skill = demoSkills[i];
                    log("[DEMO][" + nowText() + "] 点击 " + skill.name +
                        " @(" + skill.x + "," + skill.y + ") delay=" + skill.delay);

                    try {
                        press(skill.x, skill.y, pressTime);
                    } catch (e1) {
                        log("[DEMO] press error: " + e1);
                    }

                    if (!sleepWithStopCheck(skill.delay, myWorkerId)) {
                        break;
                    }
                }
            }
        } catch (e) {
            log("[DEMO] loop thread error: " + e);
        } finally {
            // 只有当前 worker 才能负责善后，避免旧线程把新状态覆盖掉
            if (myWorkerId === loopWorkerId) {
                loopRunning = false;
                setStatus("已停止");
                logState("线程结束并完成善后");
            } else {
                log("[DEMO][" + nowText() + "] 旧线程退出，不覆盖新状态 | myWorkerId=" + myWorkerId + " current=" + loopWorkerId);
            }
        }
    });
}

function stopLoop(reason) {
    if (!loopRunning) {
        setStatus("未启动");
        logState("stopLoop(" + reason + ") 时本来就没在跑");
        toast("当前没有运行中的循环");
        return;
    }

    loopRunning = false;
    setStatus("停止中");
    logState("收到关闭请求: " + reason);
    toast("已请求停止: " + reason);
}

function runOneRoundOnly() {
    threads.start(function () {
        try {
            setStatus("单次测试中");
            logState("开始单次测试");
            for (var i = 0; i < demoSkills.length; i++) {
                var skill = demoSkills[i];
                log("[DEMO][" + nowText() + "] 单次点击 " + skill.name +
                    " @(" + skill.x + "," + skill.y + ") delay=" + skill.delay);
                press(skill.x, skill.y, pressTime);
                sleep(skill.delay);
            }
            logState("单次测试完成");
        } catch (e) {
            log("[DEMO] runOneRoundOnly error: " + e);
        } finally {
            if (!loopRunning) setStatus("未启动");
            else setStatus("循环中");
        }
    });
}

win.toggle.click(function () {
    if (!canClickNow()) return;
    if (loopRunning) stopLoop("手动点击关闭");
    else startLoop();
});

win.stop.click(function () {
    if (!canClickNow()) return;
    stopLoop("强制停止按钮");
});

win.reset.click(function () {
    if (!canClickNow()) return;
    roundCount = 0;
    logState("轮次已归零");
    updateInfo();
    toast("计数已归零");
});

win.testOnce.click(function () {
    if (!canClickNow()) return;
    runOneRoundOnly();
});

win.logBtn.click(function () {
    if (!canClickNow()) return;
    logState("手动打印状态");
    toast("已打印状态到日志");
});

win.exitBtn.click(function () {
    if (!canClickNow()) return;
    loopRunning = false;
    logState("脚本退出");
    try { win.close(); } catch (e) {}
    exit();
});

events.on("exit", function () {
    loopRunning = false;
    logState("events.on(exit)");
});

setInterval(function(){}, 1000);
