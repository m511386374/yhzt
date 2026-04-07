"ui";

// OCR识别 + 步骤执行 最小Demo
// 用途：单独验证 “OCR命中 -> 执行录制步骤” 这一条流程
// 适用：Auto.js / AutoX.js（需有截图和OCR能力）

auto.waitFor();

var CONFIG_PATH = "/sdcard/ocr_step_demo.json";
var watchText = "确认";
var watchRegion = null; // {x,y,w,h}
var watchIntervalSec = 2;
var steps = []; // [{name,x,y,delay}]
var monitoring = false;
var statusText = "未启动";
var nextRemainSec = 0;

loadConfig();

var win = floaty.window(
    <vertical bg="#AA000000" padding="6">
        <text id="title" text="OCR流程Demo" textColor="#ffffff" textSize="12sp"/>
        <text id="info" text="-" textColor="#ffffff" textSize="10sp" marginTop="4"/>

        <horizontal marginTop="6">
            <button id="setText" text="监控词" w="72" h="32" textSize="10sp"/>
            <button id="setRegion" text="识别范围" w="72" h="32" textSize="10sp" marginLeft="4"/>
        </horizontal>

        <horizontal marginTop="4">
            <button id="addStep" text="添加步骤" w="72" h="32" textSize="10sp"/>
            <button id="listStep" text="步骤列表" w="72" h="32" textSize="10sp" marginLeft="4"/>
        </horizontal>

        <horizontal marginTop="4">
            <button id="testOcr" text="测OCR" w="72" h="32" textSize="10sp"/>
            <button id="testRun" text="测步骤" w="72" h="32" textSize="10sp" marginLeft="4"/>
        </horizontal>

        <horizontal marginTop="4">
            <button id="start" text="开始监控" w="72" h="32" textSize="10sp"/>
            <button id="stop" text="停止" w="72" h="32" textSize="10sp" marginLeft="4"/>
        </horizontal>

        <horizontal marginTop="4">
            <button id="save" text="保存" w="72" h="32" textSize="10sp"/>
            <button id="exit" text="退出" w="72" h="32" textSize="10sp" marginLeft="4"/>
        </horizontal>
    </vertical>
);

setInterval(function() {}, 1000);
win.setPosition(120, 220);
updateInfo();

win.setText.click(function() {
    dialogs.rawInput("输入监控词", watchText || "").then(function(v) {
        if (v == null) return;
        v = String(v).trim();
        if (!v) {
            toast("监控词不能为空");
            return;
        }
        watchText = v;
        updateInfo();
    });
});

win.setRegion.click(function() {
    pickRegion(function(region) {
        if (!region) return;
        watchRegion = region;
        toast("已设置识别范围");
        updateInfo();
    });
});

win.addStep.click(function() {
    pickPoint("请点击要执行的步骤坐标", function(p) {
        if (!p) return;
        dialogs.rawInput("步骤名称", "步骤" + (steps.length + 1)).then(function(name) {
            if (name == null) return;
            dialogs.rawInput("点击后等待毫秒", "800").then(function(delayStr) {
                if (delayStr == null) return;
                var delay = parseInt(delayStr, 10);
                if (isNaN(delay) || delay < 0) delay = 800;
                steps.push({
                    name: String(name || ("步骤" + (steps.length + 1))),
                    x: p.x,
                    y: p.y,
                    delay: delay
                });
                toast("已添加步骤: " + p.x + "," + p.y);
                updateInfo();
            });
        });
    });
});

win.listStep.click(function() {
    showStepList();
});

win.testOcr.click(function() {
    threads.start(function() {
        if (!ensureCapture()) return;
        statusText = "单次OCR测试";
        updateInfo();
        var ret = checkWatchText(watchText, watchRegion);
        log("[OCR测试] found=" + ret.found + " text=" + (ret.debugText || ""));
        if (ret.found) {
            toast("OCR命中: " + watchText);
        } else {
            toast("未命中，日志已输出OCR文本");
        }
        statusText = "未启动";
        updateInfo();
    });
});

win.testRun.click(function() {
    threads.start(function() {
        if (steps.length === 0) {
            toast("没有步骤");
            return;
        }
        statusText = "测试执行步骤";
        updateInfo();
        runRecordedSteps();
        statusText = "未启动";
        nextRemainSec = 0;
        updateInfo();
        toast("步骤执行完成");
    });
});

win.start.click(function() {
    startMonitoring();
});

win.stop.click(function() {
    stopMonitoring();
});

win.save.click(function() {
    saveConfig();
    toast("已保存");
});

win.exit.click(function() {
    stopMonitoring();
    saveConfig();
    try { win.close(); } catch (e) {}
    exit();
});

function updateInfo() {
    ui.run(function() {
        var regionText = watchRegion
            ? (watchRegion.x + "," + watchRegion.y + " " + watchRegion.w + "x" + watchRegion.h)
            : "未设置";
        var lines = [];
        lines.push("监控词: " + (watchText || "-"));
        lines.push("识别范围: " + regionText);
        lines.push("步骤数: " + steps.length);
        lines.push("状态: " + statusText);
        lines.push("倒计时: " + (monitoring ? nextRemainSec + "秒" : "-"));
        win.info.setText(lines.join("\n"));
    });
}

function normalizeText(s) {
    return String(s || "")
        .replace(/\s+/g, "")
        .replace(/[“”"'`]/g, "")
        .trim()
        .toLowerCase();
}

function ensureCapture() {
    if (!requestScreenCapture()) {
        toast("截图权限获取失败");
        return false;
    }
    return true;
}

function checkWatchText(targetText, region) {
    var img = null;
    var detectImg = null;
    try {
        img = captureScreen();
        if (!img) return { found: false, debugText: "" };

        detectImg = img;
        if (region) {
            detectImg = images.clip(img, region.x, region.y, region.w, region.h);
        }

        var results = ocr.paddle.detect(detectImg, {
            useSlim: false,
            cpuThreadNum: 4
        });

        var targetNorm = normalizeText(targetText);
        var arr = [];
        var found = false;

        if (results && results.length > 0) {
            for (var i = 0; i < results.length; i++) {
                var label = String(results[i].label || "");
                arr.push(label);
                if (normalizeText(label).indexOf(targetNorm) >= 0) {
                    found = true;
                }
            }
        }

        var merged = normalizeText(arr.join(""));
        if (!found && merged.indexOf(targetNorm) >= 0) {
            found = true;
        }

        return {
            found: found,
            debugText: arr.join(" | ")
        };
    } catch (e) {
        log("checkWatchText error: " + e);
        return { found: false, debugText: "ERR: " + e };
    } finally {
        try {
            if (detectImg && detectImg !== img) detectImg.recycle();
        } catch (e) {}
        try {
            if (img) img.recycle();
        } catch (e) {}
    }
}

function runRecordedSteps() {
    for (var i = 0; i < steps.length; i++) {
        if (!monitoring && threads.currentThread() == null) break;
        var s = steps[i];
        statusText = "执行: " + s.name;
        updateInfo();
        press(s.x, s.y, 50);
        sleep(s.delay || 800);
    }
}

function startMonitoring() {
    if (monitoring) {
        toast("已经在监控中了");
        return;
    }
    if (!watchText || !String(watchText).trim()) {
        toast("请先设置监控词");
        return;
    }
    if (!watchRegion) {
        toast("请先设置识别范围");
        return;
    }
    if (steps.length === 0) {
        toast("请先添加步骤");
        return;
    }

    monitoring = true;
    statusText = "启动中";
    nextRemainSec = 0;
    updateInfo();

    threads.start(function() {
        try {
            if (!ensureCapture()) {
                monitoring = false;
                statusText = "截图失败";
                updateInfo();
                return;
            }

            toast("开始监控");
            while (monitoring) {
                statusText = "OCR识别中";
                nextRemainSec = 0;
                updateInfo();

                var ret = checkWatchText(watchText, watchRegion);
                log("[监控OCR] found=" + ret.found + " text=" + (ret.debugText || ""));

                if (!monitoring) break;

                if (ret.found) {
                    toast("识别到【" + watchText + "】");
                    statusText = "命中，执行步骤";
                    updateInfo();
                    runRecordedSteps();

                    for (var cd = 3; cd > 0; cd--) {
                        if (!monitoring) break;
                        statusText = "命中后冷却";
                        nextRemainSec = cd;
                        updateInfo();
                        sleep(1000);
                    }
                }

                for (var sec = watchIntervalSec; sec > 0; sec--) {
                    if (!monitoring) break;
                    statusText = "等待下次OCR";
                    nextRemainSec = sec;
                    updateInfo();
                    sleep(1000);
                }
            }
        } catch (e) {
            log("startMonitoring error: " + e);
            toast("监控异常: " + e);
        } finally {
            monitoring = false;
            statusText = "未启动";
            nextRemainSec = 0;
            updateInfo();
        }
    });
}

function stopMonitoring() {
    monitoring = false;
    statusText = "已停止";
    nextRemainSec = 0;
    updateInfo();
    toast("已停止");
}

function showStepList() {
    if (steps.length === 0) {
        toast("没有步骤");
        return;
    }
    var items = [];
    for (var i = 0; i < steps.length; i++) {
        var s = steps[i];
        items.push((i + 1) + ". " + s.name + " (" + s.x + "," + s.y + ") 等待" + s.delay + "ms");
    }

    dialogs.select("步骤列表", items).then(function(index) {
        if (index < 0) return;
        dialogs.select("选择操作", ["删除该步骤", "清空全部步骤", "取消"]).then(function(op) {
            if (op === 0) {
                steps.splice(index, 1);
                updateInfo();
                toast("已删除");
            } else if (op === 1) {
                steps = [];
                updateInfo();
                toast("已清空");
            }
        });
    });
}

function pickPoint(tip, callback) {
    var marker = floaty.rawWindow(
        <frame w="60" h="60">
            <text text="✛" textColor="#ff3333" textSize="32sp" gravity="center" w="*" h="*"/>
        </frame>
    );
    marker.setTouchable(false);
    marker.setPosition(device.width / 2 - 30, device.height / 2 - 30);

    var ctrl = floaty.window(
        <vertical bg="#CC000000" padding="6">
            <text id="tip" text={tip || "移动十字后确定"} textColor="#ffffff" textSize="10sp"/>
            <horizontal marginTop="4">
                <button id="left" text="左" w="42" h="30" textSize="10sp"/>
                <button id="right" text="右" w="42" h="30" textSize="10sp" marginLeft="4"/>
                <button id="up" text="上" w="42" h="30" textSize="10sp" marginLeft="4"/>
                <button id="down" text="下" w="42" h="30" textSize="10sp" marginLeft="4"/>
            </horizontal>
            <horizontal marginTop="4">
                <button id="p1" text="1px" w="46" h="30" textSize="10sp"/>
                <button id="p5" text="5px" w="46" h="30" textSize="10sp" marginLeft="4"/>
                <button id="p10" text="10px" w="46" h="30" textSize="10sp" marginLeft="4"/>
            </horizontal>
            <horizontal marginTop="4">
                <button id="ok" text="确定" w="72" h="32" textSize="10sp"/>
                <button id="cancel" text="取消" w="72" h="32" textSize="10sp" marginLeft="4"/>
            </horizontal>
        </vertical>
    );

    var stepPx = 5;
    ctrl.setPosition(80, 80);

    function move(dx, dy) {
        var x = marker.getX() + dx;
        var y = marker.getY() + dy;
        marker.setPosition(x, y);
    }

    ctrl.left.click(function() { move(-stepPx, 0); });
    ctrl.right.click(function() { move(stepPx, 0); });
    ctrl.up.click(function() { move(0, -stepPx); });
    ctrl.down.click(function() { move(0, stepPx); });
    ctrl.p1.click(function() { stepPx = 1; toast("步长=1"); });
    ctrl.p5.click(function() { stepPx = 5; toast("步长=5"); });
    ctrl.p10.click(function() { stepPx = 10; toast("步长=10"); });
    ctrl.ok.click(function() {
        var x = marker.getX() + 30;
        var y = marker.getY() + 30;
        try { ctrl.close(); } catch (e) {}
        try { marker.close(); } catch (e) {}
        callback && callback({ x: x, y: y });
    });
    ctrl.cancel.click(function() {
        try { ctrl.close(); } catch (e) {}
        try { marker.close(); } catch (e) {}
        callback && callback(null);
    });
}

function pickRegion(callback) {
    toast("先选左上角");
    pickPoint("把十字移到识别区域左上角", function(p1) {
        if (!p1) return callback && callback(null);
        toast("再选右下角");
        pickPoint("把十字移到识别区域右下角", function(p2) {
            if (!p2) return callback && callback(null);
            var x1 = Math.min(p1.x, p2.x);
            var y1 = Math.min(p1.y, p2.y);
            var x2 = Math.max(p1.x, p2.x);
            var y2 = Math.max(p1.y, p2.y);
            var w = x2 - x1;
            var h = y2 - y1;
            if (w < 10 || h < 10) {
                toast("范围太小");
                return callback && callback(null);
            }
            callback && callback({ x: x1, y: y1, w: w, h: h });
        });
    });
}

function loadConfig() {
    try {
        if (!files.exists(CONFIG_PATH)) return;
        var txt = files.read(CONFIG_PATH);
        if (!txt) return;
        var cfg = JSON.parse(txt);
        watchText = cfg.watchText || watchText;
        watchRegion = cfg.watchRegion || watchRegion;
        watchIntervalSec = cfg.watchIntervalSec || watchIntervalSec;
        steps = Array.isArray(cfg.steps) ? cfg.steps : steps;
    } catch (e) {
        log("loadConfig error: " + e);
    }
}

function saveConfig() {
    try {
        var cfg = {
            watchText: watchText,
            watchRegion: watchRegion,
            watchIntervalSec: watchIntervalSec,
            steps: steps
        };
        files.write(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    } catch (e) {
        log("saveConfig error: " + e);
    }
}
