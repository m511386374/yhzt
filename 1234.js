"auto";

auto.waitFor();

var CONFIG_PATH = "/sdcard/ocr_skill_combo_stable_v2.json";

// ===================== 全局配置 =====================
// 单OCR配置
var watchText = "基本";
var watchRegion = null;
var watchIntervalSec = 10;
var pressTime = 50;
var deathClickEnabled = true;
var deathClickPoint = null;
var deathClickWaitMs = 1000;
var pickupText = "拾取";
var pickupRegion = null;
var pickupClickEnabled = false;
var pickupClickPoint = null;
var pickupReuseWatchRegion = true;

// 多步骤场景
var stepScenes = [];
var activeStepSceneIndex = 0;

// 多角色技能
var roles = [];
var activeRoleIndex = 0;

// 运行状态
var monitoring = false;
var nextOcrRemainSec = 0;

var monitorExecRemainMs = 0;
var monitorExecStepName = "";
var skillExecRemainMs = 0;
var skillExecStepName = "";

var sceneExecuting = false;
var monitoringWorkerId = 0;

var skillLoopRunning = false;
var skillLoopWorkerId = 0;

// OCR触发控制
var lastWatchFound = false;
var screenCaptureReady = false;

// 通用
var dialogBusy = false;
var minimized = false;

var lastButtonClickTime = 0;
var BUTTON_DEBOUNCE_MS = 300;
var MINI_DRAG_THRESHOLD = 12;
var UPDATE_INFO_MIN_INTERVAL_MS = 180;

var MARKER_SIZE = 16;
var MARKER_HALF = 8;

var lastInfoText = "";
var lastInfoUpdateTime = 0;

loadConfig();
ensureDefaultStepScene();
ensureDefaultRole();

var win;
var miniWin;
var mainWinPos = { x: 80, y: 220 };
var miniWinPos = { x: 80, y: 220 };

function createMainWindow() {
    return floaty.window(
        <vertical padding="0">
            <horizontal id="titleBar" bg="#AA111111" padding="6">
                <text id="title" text="塔2挂机脚本" textColor="#ffffff" textSize="12sp" w="0" layout_weight="1"/>
                <button id="mini" text="－" w="34" h="28" textSize="9sp"/>
            </horizontal>

            <vertical id="contentWrap" bg="#77000000" padding="6">
                <text
                    id="info"
                    text="初始化中..."
                    textColor="#ffffff"
                    textSize="9sp"
                />

                <horizontal marginTop="4">
                    <button id="ocrToggle" text="开启监控" w="74" h="32" textSize="9sp"/>
                    <button id="skillToggle" text="技能循环" w="74" h="32" textSize="9sp" marginLeft="4"/>
                </horizontal>

                <horizontal marginTop="4">
                    <button id="testMenu" text="测试" w="74" h="32" textSize="9sp"/>
                    <button id="configMenu" text="配置" w="74" h="32" textSize="9sp" marginLeft="4"/>
                </horizontal>

                <horizontal marginTop="4">
                    <button id="exitBtn" text="退出脚本" w="152" h="32" textSize="9sp"/>
                </horizontal>
            </vertical>
        </vertical>
    );
}

function createMiniWindow() {
    return floaty.window(
        <frame>
            <button id="restore" text="＋" w="36" h="36" textSize="14sp" bg="#AA111111" textColor="#ffffff"/>
        </frame>
    );
}

function bindMainWindowEvents() {
    if (!win) return;

    win.mini.click(function () {
        if (!canClickNow()) return;
        toggleMinimize();
    });

    win.ocrToggle.click(function () {
        if (!canClickNow()) return;
        if (monitoring) stopMonitoring();
        else startMonitoring();
    });

    win.skillToggle.click(function () {
        if (!canClickNow()) return;
        toggleSkillLoop();
    });

    win.testMenu.click(function () {
        if (!canClickNow()) return;
        showTestMenu();
    });

    win.configMenu.click(function () {
        if (!canClickNow()) return;
        showConfigMenu();
    });

    win.exitBtn.click(function () {
        if (!canClickNow()) return;
        exitScript();
    });

    var downX = 0, downY = 0, winX = 0, winY = 0;
    win.title.setOnTouchListener(function(view, event) {
        switch (event.getAction()) {
            case event.ACTION_DOWN:
                downX = event.getRawX();
                downY = event.getRawY();
                winX = win.getX();
                winY = win.getY();
                return true;
            case event.ACTION_MOVE:
                var nextX = winX + (event.getRawX() - downX);
                var nextY = winY + (event.getRawY() - downY);
                win.setPosition(nextX, nextY);
                mainWinPos.x = parseInt(nextX);
                mainWinPos.y = parseInt(nextY);
                return true;
            case event.ACTION_UP:
                mainWinPos.x = parseInt(win.getX());
                mainWinPos.y = parseInt(win.getY());
                autoSave();
                return true;
        }
        return true;
    });
}

function bindMiniWindowEvents() {
    if (!miniWin) return;

    var downX = 0, downY = 0, winX = 0, winY = 0;
    var moved = false;
    miniWin.restore.setOnTouchListener(function(view, event) {
        switch (event.getAction()) {
            case event.ACTION_DOWN:
                downX = event.getRawX();
                downY = event.getRawY();
                winX = miniWin.getX();
                winY = miniWin.getY();
                moved = false;
                return true;
            case event.ACTION_MOVE:
                var dx = event.getRawX() - downX;
                var dy = event.getRawY() - downY;
                if (!moved && Math.abs(dx) < MINI_DRAG_THRESHOLD && Math.abs(dy) < MINI_DRAG_THRESHOLD) {
                    return true;
                }
                moved = true;
                var nextX = winX + dx;
                var nextY = winY + dy;
                miniWin.setPosition(nextX, nextY);
                miniWinPos.x = parseInt(nextX);
                miniWinPos.y = parseInt(nextY);
                return true;
            case event.ACTION_UP:
                miniWinPos.x = parseInt(miniWin.getX());
                miniWinPos.y = parseInt(miniWin.getY());
                if (!moved) {
                    if (canClickNow()) {
                        if (skillLoopRunning) {
                            stopSkillLoop(false);
                        }
                        toggleMinimize();
                    }
                } else {
                    autoSave();
                }
                return true;
        }
        return true;
    });
}

try {
    win = createMainWindow();
    miniWin = createMiniWindow();
    bindMainWindowEvents();
    bindMiniWindowEvents();
} catch (e) {
    toast("悬浮窗创建失败，请开启悬浮窗权限");
    log("floaty.window error: " + e);
    exit();
}

win.setPosition(mainWinPos.x, mainWinPos.y);
miniWin.setPosition(miniWinPos.x, miniWinPos.y);
if (minimized) {
    try { win.setSize(0, 0); } catch (e1) {}
    try { win.setPosition(-3000, -3000); } catch (e2) {}
    try { miniWin.setSize(-2, -2); } catch (e3) {}
} else {
    miniWin.setSize(0, 0);
}
updateInfo(true);

// ===================== 通用 =====================
function canClickNow() {
    var now = new Date().getTime();
    if (now - lastButtonClickTime < BUTTON_DEBOUNCE_MS) return false;
    lastButtonClickTime = now;
    return true;
}

function autoSave() {
    saveConfig();
}

function safeParseInt(v, dft) {
    var n = parseInt(v, 10);
    return isNaN(n) ? dft : n;
}

function regionText(region) {
    region = region || watchRegion;
    if (!region) return "未设置";
    return region.x + "," + region.y + "," + region.w + "," + region.h;
}

function formatExecTime(ms) {
    if (ms <= 0) return "0秒";
    if (ms >= 1000) return (ms / 1000).toFixed(1) + "秒";
    return ms + "毫秒";
}

function getDefaultMarkerPos() {
    var x = 500;
    var y = 500;
    try {
        x = parseInt(device.width / 2);
        y = parseInt(device.height / 2);
    } catch (e) {}
    return { x: x, y: y };
}

function isValidPoint(x, y) {
    if (typeof x !== "number" || typeof y !== "number") return false;
    if (isNaN(x) || isNaN(y)) return false;
    try {
        if (x < 0 || y < 0) return false;
        if (x > device.width || y > device.height) return false;
    } catch (e) {}
    return true;
}

function doTap(x, y) {
    try {
        if (!isValidPoint(x, y)) {
            log("doTap invalid point: " + x + "," + y);
            return false;
        }
        return press(x, y, pressTime);
    } catch (e) {
        log("doTap error: " + e);
        return false;
    }
}

function doTapRepeat(x, y, count, intervalMs) {
    var times = parseInt(count);
    if (isNaN(times) || times <= 0) times = 1;

    var gap = parseInt(intervalMs);
    if (isNaN(gap) || gap < 0) gap = 60;

    var ok = false;
    for (var i = 0; i < times; i++) {
        ok = doTap(x, y) || ok;
        if (i < times - 1 && gap > 0) {
            sleep(gap);
        }
    }
    return ok;
}

function getDragTargetPoint(x, y, direction, distance) {
    distance = normalizeDelay(distance, 260);
    var dx = 0;
    var dy = 0;
    var dir = String(direction || 'up').toLowerCase();
    if (dir === 'down') dy = distance;
    else if (dir === 'left') dx = -distance;
    else if (dir === 'right') dx = distance;
    else dy = -distance;

    var tx = x + dx;
    var ty = y + dy;
    try {
        tx = Math.max(1, Math.min(device.width - 1, tx));
        ty = Math.max(1, Math.min(device.height - 1, ty));
    } catch (e) {}
    return { x: tx, y: ty };
}

function doStepAction(step) {
    if (!step) return false;
    var actionType = String(step.actionType || 'tap').toLowerCase();
    if (actionType === 'drag') {
        var target = getDragTargetPoint(step.x, step.y, step.dragDirection, step.dragDistance);
        var duration = normalizeDelay(step.dragDurationMs, 500);
        if (!isValidPoint(step.x, step.y) || !isValidPoint(target.x, target.y)) {
            return false;
        }
        try {
            return swipe(step.x, step.y, target.x, target.y, duration);
        } catch (e) {
            log('doStepAction swipe error: ' + e);
            return false;
        }
    }
    return doTap(step.x, step.y);
}

function getStepActionSummary(step) {
    if (!step) return '点击';
    if (String(step.actionType || 'tap').toLowerCase() === 'drag') {
        return '拖动-' + String(step.dragDirection || 'up') + '-' + normalizeDelay(step.dragDistance, 260) + 'px-' + normalizeDelay(step.dragDurationMs, 500) + 'ms';
    }
    return '点击';
}

function normalizeDelay(v, dft) {
    var n = parseInt(v);
    if (isNaN(n) || n < 0) return dft;
    return n;
}

function ensureScreenCaptureReady() {
    if (screenCaptureReady) return true;
    try {
        screenCaptureReady = !!requestScreenCapture();
    } catch (e) {
        log("requestScreenCapture error: " + e);
        screenCaptureReady = false;
    }
    return screenCaptureReady;
}

function pointText(point) {
    if (!point) return "未设置";
    return point.x + "," + point.y;
}

function updateInfo(force) {
    try {
        if (!win) return;
        var role = getActiveRole();
        var scene = getActiveStepScene();

        var lines = [];
        lines.push("死亡识别: " + (watchText || "-"));
        lines.push("死亡区域: " + regionText(watchRegion));
        lines.push("拾取识别: " + (pickupText || "-"));
        lines.push("拾取区域: " + (pickupReuseWatchRegion ? ("复用死亡区域(" + regionText(watchRegion) + ")") : regionText(pickupRegion)));
        lines.push("步骤场景: " + scene.name + " (" + scene.steps.length + "步)");
        lines.push("当前角色: " + role.name + " (" + role.skills.length + "技能)");
        lines.push("死亡点击: 默认开启(" + pointText(deathClickPoint) + ") 等待" + deathClickWaitMs + "ms");
        lines.push("拾取点击: " + (pickupClickEnabled ? ("开启(" + pointText(pickupClickPoint) + ")") : "关闭"));
        lines.push("OCR状态: " + (monitoring ? (sceneExecuting ? "执行场景中" : "监控中") : "未启动"));
        lines.push("技能状态: " + (skillLoopRunning ? "循环中" : "未启动"));

        if (monitoring && !sceneExecuting) {
            lines.push("OCR倒计时: " + nextOcrRemainSec + "秒");
        }

        if (monitorExecStepName) {
            lines.push("场景执行: " + monitorExecStepName + " 剩余" + formatExecTime(monitorExecRemainMs));
        }

        if (skillExecStepName) {
            lines.push("技能执行: " + skillExecStepName + " 剩余" + formatExecTime(skillExecRemainMs));
        }

        var nextInfoText = lines.join("\n");
        var now = new Date().getTime();
        if (!force && nextInfoText === lastInfoText && now - lastInfoUpdateTime < UPDATE_INFO_MIN_INTERVAL_MS) {
            return;
        }
        if (!force && nextInfoText !== lastInfoText && now - lastInfoUpdateTime < UPDATE_INFO_MIN_INTERVAL_MS) {
            if ((monitorExecRemainMs > 0 || skillExecRemainMs > 0 || monitoring) && now - lastInfoUpdateTime < 80) {
                return;
            }
        }

        lastInfoText = nextInfoText;
        lastInfoUpdateTime = now;
        win.info.setText(nextInfoText);
        win.ocrToggle.setText(monitoring ? "停止监控" : "开启监控");
        win.skillToggle.setText(skillLoopRunning ? "停止技能" : "技能循环");
    } catch (e) {
        log("updateInfo error: " + e);
    }
}

function toggleMinimize() {
    try {
        minimized = !minimized;
        if (minimized) {
            if (win) {
                mainWinPos.x = parseInt(win.getX());
                mainWinPos.y = parseInt(win.getY());
                miniWinPos.x = mainWinPos.x;
                miniWinPos.y = mainWinPos.y;
                try { win.setSize(0, 0); } catch (e1) {}
                try { win.setPosition(-3000, -3000); } catch (e2) {}
            }
            if (miniWin) {
                miniWin.setPosition(miniWinPos.x, miniWinPos.y);
                try { miniWin.setSize(-2, -2); } catch (e3) {}
            }
        } else {
            if (miniWin) {
                miniWinPos.x = parseInt(miniWin.getX());
                miniWinPos.y = parseInt(miniWin.getY());
                try { miniWin.setSize(0, 0); } catch (e4) {}
                try { miniWin.setPosition(-3000, -3000); } catch (e5) {}
            }
            if (win) {
                win.setPosition(mainWinPos.x, mainWinPos.y);
                try { win.setSize(-2, -2); } catch (e6) {}
            }
        }
        autoSave();
        updateInfo(true);
    } catch (e) {
        log("toggleMinimize error: " + e);
    }
}

function rebuildStepOrder(scene) {
    if (!scene || !scene.steps) return;
    for (var i = 0; i < scene.steps.length; i++) {
        scene.steps[i].order = i + 1;
        if (typeof scene.steps[i].skillStartAfterMs !== "number") {
            scene.steps[i].skillStartAfterMs = 0;
        }
        if (!scene.steps[i].actionType) {
            scene.steps[i].actionType = "tap";
        }
        if (!scene.steps[i].dragDirection) {
            scene.steps[i].dragDirection = "up";
        }
        if (typeof scene.steps[i].dragDurationMs !== "number" || scene.steps[i].dragDurationMs <= 0) {
            scene.steps[i].dragDurationMs = 500;
        }
        if (typeof scene.steps[i].dragDistance !== "number" || scene.steps[i].dragDistance <= 0) {
            scene.steps[i].dragDistance = 260;
        }
    }
}

function rebuildSkillOrder() {
    var skills = getActiveRole().skills;
    for (var i = 0; i < skills.length; i++) {
        skills[i].order = i + 1;
        if (typeof skills[i].tapCount !== "number" || skills[i].tapCount <= 0) {
            skills[i].tapCount = 1;
        }
    }
}

function rebuildSkillOrderFor(role) {
    if (!role || !role.skills) return;
    for (var i = 0; i < role.skills.length; i++) {
        role.skills[i].order = i + 1;
        if (typeof role.skills[i].tapCount !== "number" || role.skills[i].tapCount <= 0) {
            role.skills[i].tapCount = 1;
        }
    }
}

// ===================== 步骤场景 =====================
function ensureDefaultStepScene() {
    if (!stepScenes || !stepScenes.length) {
        stepScenes = [{
            id: "scene_" + new Date().getTime(),
            name: "默认场景",
            steps: []
        }];
    }

    if (activeStepSceneIndex < 0 || activeStepSceneIndex >= stepScenes.length) {
        activeStepSceneIndex = 0;
    }
}

function getActiveStepScene() {
    ensureDefaultStepScene();
    return stepScenes[activeStepSceneIndex];
}

function getActiveSteps() {
    return getActiveStepScene().steps;
}

// ===================== 角色 =====================
function ensureDefaultRole() {
    if (!roles || !roles.length) {
        roles = [{
            id: "role_" + new Date().getTime(),
            name: "默认角色",
            skills: []
        }];
    }

    if (activeRoleIndex < 0 || activeRoleIndex >= roles.length) {
        activeRoleIndex = 0;
    }
}

function getActiveRole() {
    ensureDefaultRole();
    return roles[activeRoleIndex];
}

// ===================== 菜单 =====================
function showTestMenu() {
    dialogs.select(
        "测试菜单",
        [
            "测试死亡识别",
            "测试当前场景步骤",
            "测试拾取识别"
        ]
    ).then(function(op) {
        if (op == 0) {
            manualTestOcr();
        } else if (op == 1) {
            manualTestSteps();
        } else if (op == 2) {
            manualTestOcrClick();
        }
    });
}

function showConfigMenu() {
    dialogs.select(
        "配置菜单",
        [
            "OCR设置",
            "步骤场景管理",
            "当前场景步骤",
            "角色管理",
            "当前角色技能",
            "保存配置"
        ]
    ).then(function(op) {
        if (op == 0) {
            showOcrMenu();
        } else if (op == 1) {
            showStepSceneMenu();
        } else if (op == 2) {
            showStepOpsMenu();
        } else if (op == 3) {
            showRoleMenu();
        } else if (op == 4) {
            showSkillOpsMenu();
        } else if (op == 5) {
            saveConfig();
            toast("已保存");
        }
    });
}

function configureDeathDetectionDialog() {
    dialogs.select(
        "死亡识别设置",
        [
            "设置死亡识别文字+区域",
            "设置死亡后点击位置",
            "设置死亡后等待时间"
        ]
    ).then(function(op) {
        if (op == 0) {
            setWatchTextDialog();
        } else if (op == 1) {
            var pos = deathClickPoint || getDefaultMarkerPos();
            showMarkerAdjuster(pos.x, pos.y, "拖动死亡后点击位置", function(finalX, finalY) {
                deathClickPoint = { x: finalX, y: finalY };
                autoSave();
                updateInfo(true);
                toast("已设置死亡后点击位置");
            });
        } else if (op == 2) {
            dialogs.rawInput("死亡后等待时间(ms)", String(deathClickWaitMs || 1000)).then(function(v) {
                if (v == null) return;
                deathClickWaitMs = normalizeDelay(v, 1000);
                autoSave();
                updateInfo(true);
                toast("已设置死亡后等待时间");
            });
        }
    });
}

function configurePickupDetectionDialog() {
    function continuePickupRegionSetup() {
        pickupClickEnabled = true;
        if (!pickupClickPoint) {
            pickupClickPoint = getDefaultMarkerPos();
        }
        autoSave();
        updateInfo(true);

        dialogs.select(
            "拾取识别设置",
            [
                pickupReuseWatchRegion ? "改为单独设置拾取区域" : "改为复用死亡区域",
                "设置拾取点击位置",
                "设置拾取识别文字"
            ]
        ).then(function(op) {
            if (op == 0) {
                pickupReuseWatchRegion = !pickupReuseWatchRegion;
                autoSave();
                updateInfo(true);
                if (!pickupReuseWatchRegion && !pickupRegion) {
                    toast("请继续设置拾取识别区域");
                    pickPickupRegionDialog();
                } else {
                    toast(pickupReuseWatchRegion ? "已改为复用死亡区域" : "已改为单独拾取区域");
                }
            } else if (op == 1) {
                var pos = pickupClickPoint || getDefaultMarkerPos();
                showMarkerAdjuster(pos.x, pos.y, "拖动拾取点击位置", function(finalX, finalY) {
                    pickupClickPoint = { x: finalX, y: finalY };
                    autoSave();
                    updateInfo(true);
                    toast("已设置拾取点击位置");
                });
            } else if (op == 2) {
                dialogs.rawInput("拾取识别文字", pickupText || "拾取").then(function(v) {
                    if (v == null) return;
                    pickupText = String(v).trim() || "拾取";
                    autoSave();
                    updateInfo(true);
                    toast("已设置拾取识别文字");
                });
            }
        });
    }

    function pickPickupRegionDialog() {
        toast("先点击拾取识别区域左上角");
        pickOnePoint(function(x1, y1) {
            toast("再点击拾取识别区域右下角");
            pickOnePoint(function(x2, y2) {
                var left = Math.min(x1, x2);
                var top = Math.min(y1, y2);
                var width = Math.abs(x2 - x1);
                var height = Math.abs(y2 - y1);
                if (width < 5 || height < 5) {
                    toast("拾取识别区域太小，设置失败");
                    return;
                }
                pickupRegion = { x: left, y: top, w: width, h: height };
                autoSave();
                updateInfo(true);
                toast("已设置拾取识别区域");
            }, "请点击拾取识别区域右下角");
        }, "请点击拾取识别区域左上角");
    }

    dialogs.select(
        "拾取识别设置",
        [
            "设置拾取识别文字",
            pickupReuseWatchRegion ? "当前：复用死亡区域" : "当前：单独拾取区域",
            "设置拾取点击位置",
            "测试拾取识别点击"
        ]
    ).then(function(op) {
        if (op == 0) {
            dialogs.rawInput("拾取识别文字", pickupText || "拾取").then(function(v) {
                if (v == null) return;
                pickupText = String(v).trim() || "拾取";
                pickupClickEnabled = true;
                autoSave();
                updateInfo(true);
                toast("已设置拾取识别文字");
            });
        } else if (op == 1) {
            if (!watchRegion) {
                dialogs.confirm("拾取识别设置", "当前还没有设置死亡识别区域，是否先去设置？").then(function(ok) {
                    if (!ok) return;
                    setWatchTextDialog();
                });
                return;
            }
            continuePickupRegionSetup();
        } else if (op == 2) {
            var pos = pickupClickPoint || getDefaultMarkerPos();
            showMarkerAdjuster(pos.x, pos.y, "拖动拾取点击位置", function(finalX, finalY) {
                pickupClickPoint = { x: finalX, y: finalY };
                pickupClickEnabled = true;
                autoSave();
                updateInfo(true);
                toast("已设置拾取点击位置");
            });
        } else if (op == 3) {
            manualTestOcrClick();
        }
    });
}

function manualTestOcrClick() {
    var activeRegion = pickupReuseWatchRegion ? watchRegion : pickupRegion;
    if (!pickupText || !String(pickupText).trim()) {
        toast("请先设置拾取识别文字");
        return;
    }
    if (!activeRegion) {
        toast("请先设置拾取识别区域");
        return;
    }
    if (!pickupClickPoint || !isValidPoint(pickupClickPoint.x, pickupClickPoint.y)) {
        toast("请先设置拾取点击位置");
        return;
    }

    threads.start(function () {
        try {
            if (!ensureScreenCaptureReady()) {
                toast("截图权限获取失败");
                return;
            }
            var ret = checkWatchText(pickupText, activeRegion);
            if (ret && ret.found) {
                doTap(pickupClickPoint.x, pickupClickPoint.y);
                toast("拾取识别成功");
            } else {
                toast("未识别到拾取文字，未执行点击");
            }
        } catch (e) {
            log("manualTestOcrClick error: " + e);
            toast("测试拾取识别异常: " + e);
        }
    });
}

function showOcrMenu() {
    dialogs.select(
        "OCR设置",
        [
            "死亡识别设置",
            "拾取识别设置",
            "修改OCR轮询间隔（秒）"
        ]
    ).then(function(op) {
        if (op == 0) {
            configureDeathDetectionDialog();
        } else if (op == 1) {
            configurePickupDetectionDialog();
        } else if (op == 2) {
            dialogs.rawInput("OCR轮询间隔（秒）", String(watchIntervalSec || 10)).then(function(v) {
                if (v == null) return;
                watchIntervalSec = normalizeDelay(v, 10);
                if (watchIntervalSec <= 0) watchIntervalSec = 1;
                autoSave();
                updateInfo();
                toast("已设置OCR间隔");
            });
        }
    });
}

function showStepSceneMenu() {
    var scene = getActiveStepScene();
    dialogs.select(
        "步骤场景管理（当前：" + scene.name + "）",
        [
            "新建步骤场景",
            "切换步骤场景",
            "重命名当前步骤场景",
            "删除当前步骤场景"
        ]
    ).then(function(op) {
        if (op == 0) {
            createStepSceneDialog();
        } else if (op == 1) {
            switchStepSceneDialog();
        } else if (op == 2) {
            renameStepSceneDialog();
        } else if (op == 3) {
            deleteCurrentStepSceneDialog();
        }
    });
}

function showStepOpsMenu() {
    var scene = getActiveStepScene();
    dialogs.select(
        "当前场景步骤（" + scene.name + "）",
        [
            "添加步骤",
            "步骤列表"
        ]
    ).then(function(op) {
        if (op == 0) {
            addStepDialog();
        } else if (op == 1) {
            showStepList();
        }
    });
}

function showSkillOpsMenu() {
    var role = getActiveRole();
    dialogs.select(
        "当前角色技能（" + role.name + "）",
        [
            "添加技能点",
            "技能点列表",
            "切换角色"
        ]
    ).then(function(op) {
        if (op == 0) {
            addSkillPointDialog();
        } else if (op == 1) {
            showSkillList();
        } else if (op == 2) {
            switchRoleDialog();
        }
    });
}

// ===================== 方块定位器 =====================
function showMarkerAdjuster(initX, initY, titleText, onConfirm, onCancel) {
    try {
        var marker = floaty.window(
            <frame id="box" w="16" h="16" bg="#55ff0000"/>
        );

        var ctrl = floaty.window(
            <vertical id="root" bg="#AA000000" padding="5">
                <text id="title" text="调整位置" textColor="#ffffff" textSize="8sp"/>

                <horizontal marginTop="3">
                    <button id="ok" text="确定" w="70" h="28" textSize="8sp"/>
                    <button id="cancel" text="取消" w="70" h="28" textSize="8sp" marginLeft="4"/>
                </horizontal>
            </vertical>
        );

        ctrl.title.setText(titleText || "调整位置");

        function getCenter() {
            return {
                x: parseInt(marker.getX() + MARKER_HALF),
                y: parseInt(marker.getY() + MARKER_HALF)
            };
        }

        marker.setPosition(parseInt(initX - MARKER_HALF), parseInt(initY - MARKER_HALF));
        ctrl.setPosition(60, 120);

        var startX = 0, startY = 0, windowX = 0, windowY = 0;

        marker.box.setOnTouchListener(function(view, event) {
            try {
                switch (event.getAction()) {
                    case event.ACTION_DOWN:
                        startX = event.getRawX();
                        startY = event.getRawY();
                        windowX = marker.getX();
                        windowY = marker.getY();
                        return true;
                    case event.ACTION_MOVE:
                        marker.setPosition(
                            parseInt(windowX + (event.getRawX() - startX)),
                            parseInt(windowY + (event.getRawY() - startY))
                        );
                        return true;
                    case event.ACTION_UP:
                        return true;
                }
            } catch (e) {
                log("marker touch error: " + e);
            }
            return true;
        });

        var ctrlDownX = 0, ctrlDownY = 0, ctrlWinX = 0, ctrlWinY = 0;

        ctrl.title.setOnTouchListener(function(view, event) {
            try {
                switch (event.getAction()) {
                    case event.ACTION_DOWN:
                        ctrlDownX = event.getRawX();
                        ctrlDownY = event.getRawY();
                        ctrlWinX = ctrl.getX();
                        ctrlWinY = ctrl.getY();
                        return true;
                    case event.ACTION_MOVE:
                        ctrl.setPosition(
                            parseInt(ctrlWinX + (event.getRawX() - ctrlDownX)),
                            parseInt(ctrlWinY + (event.getRawY() - ctrlDownY))
                        );
                        return true;
                    case event.ACTION_UP:
                        return true;
                }
            } catch (e) {
                log("ctrl drag error: " + e);
            }
            return true;
        });

        ctrl.ok.click(function() {
            try {
                var p = getCenter();
                try { marker.close(); } catch (e) {}
                try { ctrl.close(); } catch (e) {}
                if (onConfirm) onConfirm(p.x, p.y);
            } catch (e) {
                log("marker ok error: " + e);
                try { marker.close(); } catch (e2) {}
                try { ctrl.close(); } catch (e2) {}
                if (onCancel) onCancel();
            }
        });

        ctrl.cancel.click(function() {
            try { marker.close(); } catch (e) {}
            try { ctrl.close(); } catch (e) {}
            if (onCancel) onCancel();
        });

    } catch (e) {
        toast("定位器打开失败: " + e);
        log("showMarkerAdjuster error: " + e);
        if (onCancel) onCancel();
    }
}

// ===================== OCR选区取点 =====================
function pickOnePoint(callback, tipText) {
    try {
        var done = false;
        var cover = floaty.rawWindow(
            <frame id="root" bg="#2200ff00">
                <text text={tipText || "请点击目标位置"} textColor="#ffffff" bg="#88000000" padding="8"/>
            </frame>
        );
        cover.setSize(-1, -1);
        cover.setTouchable(true);

        cover.root.setOnTouchListener(function(view, event) {
            if (done) return true;

            if (event.getAction() == event.ACTION_UP) {
                done = true;

                var x = parseInt(event.getRawX());
                var y = parseInt(event.getRawY());

                try { cover.setTouchable(false); } catch (e) {}

                setTimeout(function () {
                    try { cover.close(); } catch (e) {}
                }, 120);

                if (callback) callback(x, y);
            }
            return true;
        });
    } catch (e) {
        dialogBusy = false;
        toast("拾取失败: " + e);
        log("pickOnePoint error: " + e);
    }
}

// ===================== 步骤场景管理 =====================
function createStepSceneDialog() {
    dialogs.rawInput("新步骤场景名称", "场景" + (stepScenes.length + 1)).then(function(name) {
        if (name == null) return;

        var sceneName = String(name).trim() || ("场景" + (stepScenes.length + 1));
        stepScenes.push({
            id: "scene_" + new Date().getTime() + "_" + random(1000, 9999),
            name: sceneName,
            steps: []
        });

        activeStepSceneIndex = stepScenes.length - 1;
        autoSave();
        updateInfo();
        toast("已创建步骤场景: " + sceneName);
    });
}

function switchStepSceneDialog() {
    ensureDefaultStepScene();

    var items = [];
    for (var i = 0; i < stepScenes.length; i++) {
        items.push((i === activeStepSceneIndex ? "✓ " : "") + stepScenes[i].name + " (" + stepScenes[i].steps.length + "步)");
    }

    dialogs.select("切换步骤场景", items).then(function(index) {
        if (index < 0) return;

        activeStepSceneIndex = index;
        autoSave();
        updateInfo();
        toast("已切换到步骤场景: " + getActiveStepScene().name);
    });
}

function renameStepSceneDialog() {
    var scene = getActiveStepScene();
    dialogs.rawInput("重命名当前步骤场景", scene.name).then(function(name) {
        if (name == null) return;
        scene.name = String(name).trim() || scene.name;
        autoSave();
        updateInfo();
        toast("已重命名步骤场景");
    });
}

function deleteCurrentStepSceneDialog() {
    if (stepScenes.length <= 1) {
        toast("至少保留一个步骤场景");
        return;
    }

    var scene = getActiveStepScene();
    dialogs.confirm("删除步骤场景", "确定删除【" + scene.name + "】吗？").then(function(ok) {
        if (!ok) return;

        stepScenes.splice(activeStepSceneIndex, 1);
        if (activeStepSceneIndex >= stepScenes.length) activeStepSceneIndex = stepScenes.length - 1;
        ensureDefaultStepScene();
        autoSave();
        updateInfo();
        toast("已删除步骤场景");
    });
}// ===================== OCR + 步骤 =====================
function addStepDialog() {
    if (dialogBusy) {
        toast("当前已有操作未完成");
        return;
    }
    dialogBusy = true;

    var scene = getActiveStepScene();
    var sceneSteps = scene.steps;

    dialogs.rawInput("步骤名称", "步骤" + (sceneSteps.length + 1)).then(function(name) {
        if (name == null) {
            dialogBusy = false;
            return;
        }

        dialogs.rawInput("点击步骤后等待（毫秒）", "2000").then(function(delay) {
            if (delay == null) {
                dialogBusy = false;
                return;
            }

            dialogs.confirm("执行完这一步后开启技能循环？").then(function(enableSkillLoop) {
                function finishAdd(skillStartAfterMs, actionType, dragDirection, dragDurationMs, dragDistance) {
                    var stepName = String(name).trim() || ("步骤" + (sceneSteps.length + 1));
                    var stepDelay = normalizeDelay(delay, 1000);
                    var startWait = normalizeDelay(skillStartAfterMs, 0);

                    var pos = getDefaultMarkerPos();

                    showMarkerAdjuster(
                        pos.x,
                        pos.y,
                        "拖动步骤位置",
                        function(finalX, finalY) {
                            var newStep = {
                                id: "step_" + new Date().getTime() + "_" + random(1000, 9999),
                                name: stepName,
                                x: finalX,
                                y: finalY,
                                delay: stepDelay,
                                enableSkillLoop: !!enableSkillLoop,
                                skillStartAfterMs: startWait,
                                validation: null,
                                actionType: actionType || 'tap',
                                dragDirection: dragDirection || 'up',
                                dragDurationMs: normalizeDelay(dragDurationMs, 500),
                                dragDistance: normalizeDelay(dragDistance, 260)
                            };
                            dialogs.confirm("步骤校验", "这个步骤执行后，是否需要等待指定文字出现/消失再继续？").then(function(needValidation) {
                                if (!needValidation) {
                                    sceneSteps.push(newStep);
                                    rebuildStepOrder(scene);
                                    autoSave();
                                    updateInfo(true);
                                    dialogBusy = false;
                                    toast("已添加步骤: " + stepName);
                                    return;
                                }
                                configureStepValidationDialog(newStep, function() {
                                    sceneSteps.push(newStep);
                                    rebuildStepOrder(scene);
                                    autoSave();
                                    updateInfo(true);
                                    dialogBusy = false;
                                    toast("已添加步骤: " + stepName);
                                });
                            });
                        },
                        function() {
                            dialogBusy = false;
                            toast("已取消添加步骤");
                        }
                    );
                }

                function askStepAction(skillStartAfterMs) {
                    dialogs.select("步骤动作", ["点击", "拖动"]).then(function(actionIndex) {
                        if (actionIndex == null || actionIndex < 0) {
                            dialogBusy = false;
                            return;
                        }
                        if (actionIndex === 0) {
                            finishAdd(skillStartAfterMs, 'tap', 'up', 500, 260);
                            return;
                        }
                        dialogs.select("拖动方向", ["上", "下", "左", "右"]).then(function(dirIndex) {
                            if (dirIndex == null || dirIndex < 0) {
                                dialogBusy = false;
                                return;
                            }
                            var directionMap = ['up', 'down', 'left', 'right'];
                            dialogs.rawInput("拖动多少毫秒", "500").then(function(dragDurationMs) {
                                if (dragDurationMs == null) {
                                    dialogBusy = false;
                                    return;
                                }
                                dialogs.rawInput("拖动距离(px)", "260").then(function(dragDistance) {
                                    if (dragDistance == null) {
                                        dialogBusy = false;
                                        return;
                                    }
                                    finishAdd(skillStartAfterMs, 'drag', directionMap[dirIndex], dragDurationMs, dragDistance);
                                });
                            });
                        });
                    });
                }

                if (enableSkillLoop) {
                    dialogs.rawInput("开始技能循环前等待（毫秒）", "0").then(function(skillWait) {
                        if (skillWait == null) {
                            dialogBusy = false;
                            return;
                        }
                        askStepAction(skillWait);
                    });
                } else {
                    askStepAction(0);
                }
            });
        });
    });
}

function editStepPosition(step, onDone) {
    showMarkerAdjuster(
        step.x,
        step.y,
        "拖动步骤位置",
        function(finalX, finalY) {
            step.x = finalX;
            step.y = finalY;
            autoSave();
            updateInfo();
            toast("位置已更新");
            if (onDone) onDone();
        },
        function() {
            if (onDone) onDone();
        }
    );
}

function normalizeStepValidation(step) {
    if (!step || !step.validation) return null;
    var validation = step.validation;
    var text = String(validation.text || "").trim();
    var mode = String(validation.mode || "").trim();
    if (!text || (mode !== "appear" && mode !== "disappear")) return null;
    return {
        text: text,
        mode: mode,
        timeoutMs: normalizeDelay(validation.timeoutMs, 3000)
    };
}

function getStepValidationText(step) {
    var validation = normalizeStepValidation(step);
    if (!validation) return "";
    return validation.mode === "appear"
        ? (" [等待“" + validation.text + "”出现 " + validation.timeoutMs + "ms]")
        : (" [等待“" + validation.text + "”消失 " + validation.timeoutMs + "ms]");
}

function configureStepValidationDialog(step, onDone) {
    dialogs.select(
        "步骤校验",
        ["不校验", "等待文字出现", "等待文字消失"]
    ).then(function(op) {
        if (op == null || op < 0) {
            if (onDone) onDone(false);
            return;
        }
        if (op === 0) {
            step.validation = null;
            autoSave();
            if (onDone) onDone(true);
            return;
        }

        dialogs.rawInput("校验文字", step.validation && step.validation.text ? String(step.validation.text) : watchText || "确认").then(function(text) {
            if (text == null) {
                if (onDone) onDone(false);
                return;
            }
            var finalText = String(text).trim();
            if (!finalText) {
                toast("校验文字不能为空");
                if (onDone) onDone(false);
                return;
            }
            dialogs.rawInput("最长等待时间(ms)", String(step.validation && step.validation.timeoutMs ? step.validation.timeoutMs : 3000)).then(function(timeoutMs) {
                if (timeoutMs == null) {
                    if (onDone) onDone(false);
                    return;
                }
                step.validation = {
                    text: finalText,
                    mode: op === 1 ? "appear" : "disappear",
                    timeoutMs: normalizeDelay(timeoutMs, 3000)
                };
                autoSave();
                if (onDone) onDone(true);
            });
        });
    });
}

function waitForStepValidation(step, monitoringId) {
    var validation = normalizeStepValidation(step);
    if (!validation) return true;
    if (!ensureScreenCaptureReady()) return false;

    monitorExecStepName = "[" + getActiveStepScene().name + "] 校验: " + validation.text;
    monitorExecRemainMs = validation.timeoutMs;
    updateInfo();

    var remain = validation.timeoutMs;
    while (remain > 0) {
        if (!monitoring || monitoringId !== monitoringWorkerId) return false;
        var ret = checkWatchText(validation.text, watchRegion);
        var ok = validation.mode === "appear" ? !!ret.found : !ret.found;
        if (ok) {
            monitorExecRemainMs = 0;
            updateInfo();
            return true;
        }
        monitorExecRemainMs = remain;
        updateInfo();
        var slice = remain > 250 ? 250 : remain;
        sleep(slice);
        remain -= slice;
    }
    return false;
}

function showStepList() {
    var scene = getActiveStepScene();
    var steps = scene.steps;

    if (!steps.length) {
        toast("当前场景没有步骤");
        return;
    }

    rebuildStepOrder(scene);
    var items = [];
    for (var i = 0; i < steps.length; i++) {
        var s = steps[i];
        var flag = " [动作:" + getStepActionSummary(s) + "]";
        if (s.enableSkillLoop) {
            flag += (" [开技能+" + (s.skillStartAfterMs || 0) + "ms]");
        }
        flag += getStepValidationText(s);
        items.push((i + 1) + ". " + s.name + " (" + s.x + "," + s.y + ") 点击后等:" + s.delay + "ms" + flag);
    }

    dialogs.select("步骤列表 - " + scene.name, items).then(function(index) {
        if (index < 0) return;

        var step = steps[index];

        dialogs.select(
            "步骤：" + step.name + "\n当前位置：(" + step.x + ", " + step.y + ")\n动作：" + getStepActionSummary(step) + getStepValidationText(step),
            ["编辑位置", "切换开技能", "修改点击步骤后等待", "修改开始技能循环前等待", "修改步骤动作", "修改步骤校验", "上移", "下移", "删除", "取消"]
        ).then(function(op) {
            if (op == 0) {
                editStepPosition(step, function() {
                    rebuildStepOrder(scene);
                    updateInfo();
                });
            } else if (op == 1) {
                step.enableSkillLoop = !step.enableSkillLoop;
                if (!step.enableSkillLoop) {
                    step.skillStartAfterMs = 0;
                }
                autoSave();
                updateInfo();
                toast("开技能已" + (step.enableSkillLoop ? "开启" : "关闭"));
            } else if (op == 2) {
                dialogs.rawInput("新的点击步骤后等待(ms)", String(step.delay || 1000)).then(function(delay) {
                    if (delay == null) return;
                    step.delay = normalizeDelay(delay, 1000);
                    autoSave();
                    updateInfo();
                    toast("已修改点击步骤后等待");
                });
            } else if (op == 3) {
                dialogs.rawInput("新的开始技能循环前等待(ms)", String(step.skillStartAfterMs || 0)).then(function(v) {
                    if (v == null) return;
                    step.skillStartAfterMs = normalizeDelay(v, 0);
                    if (step.skillStartAfterMs > 0) {
                        step.enableSkillLoop = true;
                    }
                    autoSave();
                    updateInfo();
                    toast("已修改开始技能循环前等待");
                });
            } else if (op == 4) {
                dialogs.select("步骤动作", ["点击", "拖动"]).then(function(actionIndex) {
                    if (actionIndex == null || actionIndex < 0) return;
                    if (actionIndex === 0) {
                        step.actionType = 'tap';
                        autoSave();
                        updateInfo(true);
                        toast('已修改步骤动作');
                        return;
                    }
                    dialogs.select("拖动方向", ["上", "下", "左", "右"]).then(function(dirIndex) {
                        if (dirIndex == null || dirIndex < 0) return;
                        var directionMap = ['up', 'down', 'left', 'right'];
                        dialogs.rawInput("拖动多少毫秒", String(step.dragDurationMs || 500)).then(function(v) {
                            if (v == null) return;
                            dialogs.rawInput("拖动距离(px)", String(step.dragDistance || 260)).then(function(distance) {
                                if (distance == null) return;
                                step.actionType = 'drag';
                                step.dragDirection = directionMap[dirIndex];
                                step.dragDurationMs = normalizeDelay(v, 500);
                                step.dragDistance = normalizeDelay(distance, 260);
                                autoSave();
                                updateInfo(true);
                                toast('已修改步骤动作');
                            });
                        });
                    });
                });
            } else if (op == 5) {
                configureStepValidationDialog(step, function(changed) {
                    if (!changed) return;
                    updateInfo(true);
                    toast("已更新步骤校验");
                });
            } else if (op == 6) {
                if (index > 0) {
                    var t = steps[index];
                    steps[index] = steps[index - 1];
                    steps[index - 1] = t;
                    rebuildStepOrder(scene);
                    autoSave();
                    updateInfo();
                    toast("已上移");
                }
            } else if (op == 7) {
                if (index < steps.length - 1) {
                    var t2 = steps[index];
                    steps[index] = steps[index + 1];
                    steps[index + 1] = t2;
                    rebuildStepOrder(scene);
                    autoSave();
                    updateInfo();
                    toast("已下移");
                }
            } else if (op == 8) {
                steps.splice(index, 1);
                rebuildStepOrder(scene);
                autoSave();
                updateInfo();
                toast("已删除");
            }
        });
    });
}

function setWatchTextDialog(onDone) {
    if (dialogBusy) {
        toast("当前已有操作未完成");
        return;
    }
    dialogBusy = true;

    dialogs.rawInput("请输入死亡识别文字", watchText || "基本").then(function(text) {
        if (text == null) {
            dialogBusy = false;
            return;
        }

        var newText = String(text).trim();
        if (!newText) {
            dialogBusy = false;
            toast("监控词不能为空");
            return;
        }

        watchText = newText;

        toast("先点击识别范围左上角");
        pickOnePoint(function(x1, y1) {
            toast("再点击识别范围右下角");
            pickOnePoint(function(x2, y2) {
                dialogBusy = false;

                var left = Math.min(x1, x2);
                var top = Math.min(y1, y2);
                var width = Math.abs(x2 - x1);
                var height = Math.abs(y2 - y1);

                if (width < 5 || height < 5) {
                    toast("识别范围太小，设置失败");
                    return;
                }

                watchRegion = {
                    x: left,
                    y: top,
                    w: width,
                    h: height
                };

                autoSave();
                updateInfo();
                toast("已设置死亡识别文字和区域");
                if (onDone) onDone();
            }, "请点击识别范围右下角");
        }, "请点击识别范围左上角");
    });
}

function normalizeOcrText(s) {
    return String(s || "")
        .replace(/\s+/g, "")
        .replace(/[“”"'`]/g, "")
        .trim()
        .toLowerCase();
}

function getOcrResultCenter(r, region) {
    try {
        var points = r && (r.bounds || r.box || r.points);
        if (points && points.length >= 4) {
            var sumX = 0, sumY = 0;
            for (var i = 0; i < points.length; i++) {
                sumX += safeParseInt(points[i].x, 0);
                sumY += safeParseInt(points[i].y, 0);
            }
            var cx = parseInt(sumX / points.length);
            var cy = parseInt(sumY / points.length);
            if (region) {
                cx += region.x;
                cy += region.y;
            }
            return { x: cx, y: cy };
        }
    } catch (e) {}
    return null;
}

function checkWatchText(targetText, region) {
    var img = null;
    var detectImg = null;

    try {
        img = captureScreen();
        if (!img) return { found: false, debugText: "", clickPoint: null };

        detectImg = img;
        if (region) {
            detectImg = images.clip(img, region.x, region.y, region.w, region.h);
        }

        var results = ocr.paddle.detect(detectImg, {
            useSlim: false,
            cpuThreadNum: 4
        });

        var found = false;
        var arr = [];
        var targetNorm = normalizeOcrText(targetText);
        var firstHitCenter = null;

        if (results && results.length > 0) {
            for (var i = 0; i < results.length; i++) {
                var r = results[i];
                var label = String(r.label || "");
                arr.push(label);
                if (normalizeOcrText(label).indexOf(targetNorm) >= 0) {
                    found = true;
                    if (!firstHitCenter) {
                        firstHitCenter = getOcrResultCenter(r, region);
                    }
                }
            }
        }

        var merged = normalizeOcrText(arr.join(""));
        if (!found && merged.indexOf(targetNorm) >= 0) {
            found = true;
        }

        return { found: found, debugText: arr.join(" | "), clickPoint: firstHitCenter };
    } catch (e) {
        log("checkWatchText error: " + e);
        return { found: false, debugText: "ERR: " + e, clickPoint: null };
    } finally {
        try {
            if (detectImg && detectImg !== img) detectImg.recycle();
        } catch (e) {}
        try {
            if (img) img.recycle();
        } catch (e) {}
    }
}

function manualTestOcr() {
    if (!watchText || !String(watchText).trim()) {
        toast("请先设置死亡识别文字");
        return;
    }
    if (!watchRegion) {
        toast("请先设置死亡识别文字并框选识别区域");
        return;
    }

    threads.start(function () {
        try {
            if (!ensureScreenCaptureReady()) {
                toast("截图权限获取失败");
                return;
            }

            var ret = checkWatchText(watchText, watchRegion);
            var msg = ret && ret.found
                ? ("OCR识别成功：命中【" + watchText + "】\n识别结果：" + (ret.debugText || "(空)"))
                : ("OCR识别失败：未命中【" + watchText + "】\n识别结果：" + ((ret && ret.debugText) || "(空)"));

            log("manualTestOcr => " + msg);
            toast(ret && ret.found ? "死亡识别成功" : "死亡识别失败");
            dialogs.alert("测试死亡识别", msg).then(function() {});
        } catch (e) {
            log("manualTestOcr error: " + e);
            toast("测试死亡识别异常: " + e);
        }
    });
}


function manualTestSteps() {
    var scene = getActiveStepScene();
    var steps = scene.steps;

    if (!steps.length) {
        toast("当前场景没有步骤");
        return;
    }

    threads.start(function () {
        var startedSkillLoopInTest = false;
        try {
            monitorExecStepName = "";
            monitorExecRemainMs = 0;
            updateInfo();

            var list = steps.slice();
            for (var i = 0; i < list.length; i++) {
                var step = list[i];
                monitorExecStepName = "[" + scene.name + "] " + step.name;
                monitorExecRemainMs = step.delay;
                updateInfo();

                doStepAction(step);

                var remain = step.delay;
                while (remain > 0) {
                    monitorExecRemainMs = remain;
                    updateInfo();
                    var slice = remain > 100 ? 100 : remain;
                    sleep(slice);
                    remain -= slice;
                }

                if (step.enableSkillLoop) {
                    var skillWait = parseInt(step.skillStartAfterMs || 0);
                    if (skillWait > 0) {
                        monitorExecStepName = "[" + scene.name + "] 等待开技能";
                        monitorExecRemainMs = skillWait;
                        updateInfo();

                        var skillRemain = skillWait;
                        while (skillRemain > 0) {
                            monitorExecRemainMs = skillRemain;
                            updateInfo();
                            var skillSlice = skillRemain > 100 ? 100 : skillRemain;
                            sleep(skillSlice);
                            skillRemain -= skillSlice;
                        }
                    }

                    if (!skillLoopRunning) {
                        startSkillLoop(true);
                        startedSkillLoopInTest = true;
                        sleep(300);
                    }
                }
            }

            monitorExecStepName = "";
            monitorExecRemainMs = 0;
            updateInfo();
            toast("测试步骤完成");
        } catch (e) {
            log("manualTestSteps error: " + e);
            toast("测试步骤异常: " + e);
        } finally {
            if (startedSkillLoopInTest && skillLoopRunning) {
                stopSkillLoop(false);
            }
            monitorExecStepName = "";
            monitorExecRemainMs = 0;
            updateInfo();
        }
    });
}

function waitForSkillLoopStop(timeoutMs) {
    var remain = timeoutMs || 1200;
    while (remain > 0) {
        if (!skillLoopRunning) return true;
        sleep(50);
        remain -= 50;
    }
    return !skillLoopRunning;
}

function startMonitoring() {
    var scene = getActiveStepScene();
    var steps = scene.steps;

    if (monitoring) {
        toast("已经在监控中");
        return;
    }

    if (!watchText || !String(watchText).trim()) {
        toast("请先设置监控词");
        return;
    }

    if (!watchRegion) {
        toast("请先设置监控词并框选识别范围");
        return;
    }

    if (!steps.length) {
        toast("当前步骤场景没有步骤");
        return;
    }

    monitoring = true;
    monitoringWorkerId += 1;
    var myMonitoringWorkerId = monitoringWorkerId;
    sceneExecuting = false;
    lastWatchFound = false;
    nextOcrRemainSec = 0;
    monitorExecRemainMs = 0;
    monitorExecStepName = "";
    updateInfo();
    toast("已开启监控，当前场景：" + scene.name);

    threads.start(function () {
        try {
            if (!ensureScreenCaptureReady()) {
                monitoring = false;
                updateInfo();
                toast("截图权限获取失败");
                return;
            }

            while (monitoring && myMonitoringWorkerId === monitoringWorkerId) {
                nextOcrRemainSec = 0;
                updateInfo();

                var currentScene = getActiveStepScene();
                var pickupActiveRegion = pickupReuseWatchRegion ? watchRegion : pickupRegion;
                var deathRet = checkWatchText(watchText, watchRegion);
                var pickupRet = pickupClickEnabled && pickupText && pickupActiveRegion ? checkWatchText(pickupText, pickupActiveRegion) : { found: false };
                if (!monitoring || myMonitoringWorkerId !== monitoringWorkerId) break;

                if (pickupRet.found && pickupClickEnabled && pickupClickPoint && isValidPoint(pickupClickPoint.x, pickupClickPoint.y)) {
                    doTap(pickupClickPoint.x, pickupClickPoint.y);
                    sleep(200);
                    sceneExecuting = false;
                    monitorExecStepName = "";
                    monitorExecRemainMs = 0;
                    updateInfo(true);
                    for (var pickupCd = 3; pickupCd > 0; pickupCd--) {
                        if (!monitoring || myMonitoringWorkerId !== monitoringWorkerId) break;
                        nextOcrRemainSec = pickupCd;
                        updateInfo();
                        sleep(1000);
                    }
                    continue;
                }

                var triggeredNow = deathRet.found && !lastWatchFound && !sceneExecuting;
                lastWatchFound = !!deathRet.found;

                if (triggeredNow) {
                    sceneExecuting = true;
                    if (deathClickEnabled && deathClickPoint && isValidPoint(deathClickPoint.x, deathClickPoint.y)) {
                        doTap(deathClickPoint.x, deathClickPoint.y);
                        var deathWait = normalizeDelay(deathClickWaitMs, 1000);
                        if (deathWait > 0) sleep(deathWait);
                    }
                    if (skillLoopRunning) {
                        stopSkillLoop(false);
                        waitForSkillLoopStop(1500);
                    }

                    toast("识别到【" + watchText + "】，执行场景：" + currentScene.name);

                    var list = currentScene.steps.slice();
                    for (var i = 0; i < list.length; i++) {
                        if (!monitoring || myMonitoringWorkerId !== monitoringWorkerId) break;

                        var step = list[i];
                        monitorExecStepName = "[" + currentScene.name + "] " + step.name;
                        monitorExecRemainMs = step.delay;
                        updateInfo();

                        doStepAction(step);

                        var remain = step.delay;
                        while (remain > 0 && monitoring && myMonitoringWorkerId === monitoringWorkerId) {
                            monitorExecRemainMs = remain;
                            updateInfo();
                            var slice = remain > 100 ? 100 : remain;
                            sleep(slice);
                            remain -= slice;
                        }

                        monitorExecRemainMs = 0;
                        updateInfo();

                        var validationPassed = waitForStepValidation(step, myMonitoringWorkerId);
                        if (!validationPassed) {
                            toast("步骤校验未通过，停止当前场景：" + step.name);
                            break;
                        }

                        if (step.enableSkillLoop) {
                            if (!skillLoopRunning) {
                                var skillWait = parseInt(step.skillStartAfterMs || 0);
                                if (skillWait > 0) {
                                    monitorExecStepName = "[" + currentScene.name + "] 等待开技能";
                                    monitorExecRemainMs = skillWait;
                                    updateInfo();

                                    var skillRemain = skillWait;
                                    while (skillRemain > 0 && monitoring && myMonitoringWorkerId === monitoringWorkerId) {
                                        monitorExecRemainMs = skillRemain;
                                        updateInfo();
                                        var skillSlice = skillRemain > 100 ? 100 : skillRemain;
                                        sleep(skillSlice);
                                        skillRemain -= skillSlice;
                                    }

                                    monitorExecRemainMs = 0;
                                    updateInfo();
                                    if (!monitoring || myMonitoringWorkerId !== monitoringWorkerId) break;
                                }

                                startSkillLoop(true);
                                sleep(300);
                            }
                        }
                    }

                    sceneExecuting = false;
                    monitorExecStepName = "";
                    monitorExecRemainMs = 0;
                    updateInfo();

                    for (var cd = 3; cd > 0; cd--) {
                        if (!monitoring || myMonitoringWorkerId !== monitoringWorkerId) break;
                        nextOcrRemainSec = cd;
                        updateInfo();
                        sleep(1000);
                    }
                }

                for (var sec = watchIntervalSec; sec > 0; sec--) {
                    if (!monitoring || myMonitoringWorkerId !== monitoringWorkerId) break;
                    nextOcrRemainSec = sec;
                    updateInfo();
                    sleep(1000);
                }
            }
        } catch (e) {
            monitoring = false;
            sceneExecuting = false;
            monitorExecStepName = "";
            monitorExecRemainMs = 0;
            nextOcrRemainSec = 0;
            lastWatchFound = false;
            updateInfo();
            toast("监控异常: " + e);
            log("startMonitoring error: " + e);
        } finally {
            if (myMonitoringWorkerId === monitoringWorkerId) {
                monitoring = false;
            }
            sceneExecuting = false;
            monitorExecStepName = "";
            monitorExecRemainMs = 0;
            nextOcrRemainSec = 0;
            lastWatchFound = false;
            updateInfo();
        }
    });
}

function stopMonitoring() {
    monitoring = false;
    monitoringWorkerId += 1;
    sceneExecuting = false;
    lastWatchFound = false;
    monitorExecStepName = "";
    monitorExecRemainMs = 0;
    nextOcrRemainSec = 0;
    updateInfo();
    toast("已停止监控");
}

// ===================== 多角色技能循环 =====================
function sleepSkillDelay(totalMs, myWorkerId) {
    var remain = totalMs;
    while (remain > 0) {
        if (!skillLoopRunning) return false;
        if (myWorkerId !== skillLoopWorkerId) return false;
        var slice = remain > 50 ? 50 : remain;
        sleep(slice);
        remain -= slice;
    }
    return true;
}

function stopSkillLoop(notify) {
    if (!skillLoopRunning) return false;
    skillLoopRunning = false;
    skillLoopWorkerId += 1;
    skillExecStepName = "";
    skillExecRemainMs = 0;
    updateInfo();
    if (notify) toast("已请求停止技能循环");
    return true;
}

function startSkillLoop(notify) {
    var role = getActiveRole();
    var skills = role.skills;

    if (!skills.length) {
        toast("当前角色没有技能点");
        return false;
    }

    if (skillLoopRunning) {
        return true;
    }

    skillLoopRunning = true;
    skillLoopWorkerId += 1;
    var myWorkerId = skillLoopWorkerId;

    updateInfo();
    if (notify) toast("已开启技能循环: " + role.name);

    threads.start(function () {
        try {
            while (true) {
                if (!skillLoopRunning) break;
                if (myWorkerId !== skillLoopWorkerId) break;

                var currentRole = getActiveRole();
                var list = currentRole.skills.slice();

                for (var i = 0; i < list.length; i++) {
                    if (!skillLoopRunning) break;
                    if (myWorkerId !== skillLoopWorkerId) break;

                    var skill = list[i];
                    var tapCount = parseInt(skill.tapCount || 1);
                    if (isNaN(tapCount) || tapCount <= 0) tapCount = 1;

                    skillExecStepName = "技能[" + skill.name + "] x" + tapCount;
                    skillExecRemainMs = skill.delay;
                    updateInfo();

                    doTapRepeat(skill.x, skill.y, tapCount, 60);

                    if (!sleepSkillDelay(skill.delay, myWorkerId)) {
                        break;
                    }
                }
            }
        } catch (e) {
            log("startSkillLoop error: " + e);
        } finally {
            skillExecStepName = "";
            skillExecRemainMs = 0;
            if (myWorkerId === skillLoopWorkerId) {
                skillLoopRunning = false;
                updateInfo();
            }
        }
    });

    return true;
}

function toggleSkillLoop() {
    if (skillLoopRunning) return stopSkillLoop(true);
    return startSkillLoop(true);
}

// ===================== 角色管理 =====================
function showRoleMenu() {
    var role = getActiveRole();
    dialogs.select(
        "角色管理（当前：" + role.name + "）",
        ["新建角色", "重命名当前角色", "删除当前角色", "切换角色"]
    ).then(function(op) {
        if (op == 0) {
            createRoleDialog();
        } else if (op == 1) {
            renameRoleDialog();
        } else if (op == 2) {
            deleteCurrentRoleDialog();
        } else if (op == 3) {
            switchRoleDialog();
        }
    });
}

function createRoleDialog() {
    dialogs.rawInput("新角色名称", "角色" + (roles.length + 1)).then(function(name) {
        if (name == null) return;
        var roleName = String(name).trim() || ("角色" + (roles.length + 1));

        roles.push({
            id: "role_" + new Date().getTime() + "_" + random(1000, 9999),
            name: roleName,
            skills: []
        });

        activeRoleIndex = roles.length - 1;
        autoSave();
        updateInfo();
        toast("已创建角色: " + roleName);
    });
}

function renameRoleDialog() {
    var role = getActiveRole();
    dialogs.rawInput("重命名当前角色", role.name).then(function(name) {
        if (name == null) return;
        role.name = String(name).trim() || role.name;
        autoSave();
        updateInfo();
        toast("已重命名");
    });
}

function deleteCurrentRoleDialog() {
    if (roles.length <= 1) {
        toast("至少保留一个角色");
        return;
    }

    var role = getActiveRole();
    dialogs.confirm("删除角色", "确定删除角色【" + role.name + "】吗？").then(function(ok) {
        if (!ok) return;

        if (skillLoopRunning) {
            stopSkillLoop(false);
        }

        roles.splice(activeRoleIndex, 1);
        if (activeRoleIndex >= roles.length) activeRoleIndex = roles.length - 1;
        ensureDefaultRole();
        autoSave();
        updateInfo();
        toast("已删除角色");
    });
}

function switchRoleDialog() {
    ensureDefaultRole();

    var items = [];
    for (var i = 0; i < roles.length; i++) {
        items.push((i === activeRoleIndex ? "✓ " : "") + roles[i].name + " (" + roles[i].skills.length + ")");
    }

    dialogs.select("切换角色", items).then(function(index) {
        if (index < 0) return;

        if (skillLoopRunning) {
            stopSkillLoop(false);
            toast("已停止旧角色循环，切换到新角色");
        }

        activeRoleIndex = index;
        autoSave();
        updateInfo();
        toast("已切换到: " + getActiveRole().name);
    });
}

// ===================== 技能点 =====================
function addSkillPointDialog() {
    if (dialogBusy) {
        toast("当前已有操作未完成");
        return;
    }
    dialogBusy = true;

    var role = getActiveRole();
    var skills = role.skills;

    dialogs.rawInput("技能名称", "技能" + (skills.length + 1)).then(function(name) {
        if (name == null) {
            dialogBusy = false;
            return;
        }

        dialogs.rawInput("释放技能后等待（毫秒）", "30").then(function(delay) {
            if (delay == null) {
                dialogBusy = false;
                return;
            }

            dialogs.rawInput("连续释放次数", "1").then(function(tapCountInput) {
                if (tapCountInput == null) {
                    dialogBusy = false;
                    return;
                }

                var skillName = String(name).trim() || ("技能" + (skills.length + 1));
                var skillDelay = normalizeDelay(delay, 50);
                var tapCount = normalizeDelay(tapCountInput, 1);
                if (tapCount <= 0) tapCount = 1;

                var pos = getDefaultMarkerPos();

                showMarkerAdjuster(
                    pos.x,
                    pos.y,
                    "拖动技能位置",
                    function(finalX, finalY) {
                        skills.push({
                            id: "skill_" + new Date().getTime() + "_" + random(1000, 9999),
                            name: skillName,
                            x: finalX,
                            y: finalY,
                            delay: skillDelay,
                            tapCount: tapCount
                        });
                        rebuildSkillOrder();
                        autoSave();
                        updateInfo();
                        dialogBusy = false;
                        toast("已添加技能: " + skillName + " x" + tapCount);
                    },
                    function() {
                        dialogBusy = false;
                        toast("已取消添加技能");
                    }
                );
            });
        });
    });
}

function showSkillList() {
    var role = getActiveRole();
    var skills = role.skills;

    if (!skills.length) {
        toast("当前角色没有技能点");
        return;
    }

    rebuildSkillOrder();
    var items = [];
    for (var i = 0; i < skills.length; i++) {
        var s = skills[i];
        items.push((i + 1) + ". " + s.name + " (" + s.x + "," + s.y + ") 点击:" + (s.tapCount || 1) + "次 释放后等:" + s.delay + "ms");
    }

    dialogs.select("技能点列表 - " + role.name, items).then(function(index) {
        if (index < 0) return;

        var skill = skills[index];

        dialogs.select(
            "技能：" + skill.name + "\n当前位置：(" + skill.x + ", " + skill.y + ")",
            ["编辑位置", "修改等待时间", "修改点击次数", "上移", "下移", "删除", "取消"]
        ).then(function(op) {
            if (op == 0) {
                showMarkerAdjuster(
                    skill.x,
                    skill.y,
                    "拖动技能位置",
                    function(finalX, finalY) {
                        skill.x = finalX;
                        skill.y = finalY;
                        autoSave();
                        updateInfo();
                        toast("技能位置已更新");
                    }
                );
            } else if (op == 1) {
                dialogs.rawInput("新的释放技能后等待(ms)", String(skill.delay || 50)).then(function(delay) {
                    if (delay == null) return;
                    skill.delay = normalizeDelay(delay, 50);
                    autoSave();
                    updateInfo();
                    toast("已修改等待时间");
                });
            } else if (op == 2) {
                dialogs.rawInput("新的点击次数", String(skill.tapCount || 1)).then(function(v) {
                    if (v == null) return;
                    skill.tapCount = normalizeDelay(v, 1);
                    if (skill.tapCount <= 0) skill.tapCount = 1;
                    autoSave();
                    updateInfo();
                    toast("已修改点击次数");
                });
            } else if (op == 3) {
                if (index > 0) {
                    var t = skills[index];
                    skills[index] = skills[index - 1];
                    skills[index - 1] = t;
                    rebuildSkillOrder();
                    autoSave();
                    updateInfo();
                    toast("已上移");
                }
            } else if (op == 4) {
                if (index < skills.length - 1) {
                    var t2 = skills[index];
                    skills[index] = skills[index + 1];
                    skills[index + 1] = t2;
                    rebuildSkillOrder();
                    autoSave();
                    updateInfo();
                    toast("已下移");
                }
            } else if (op == 5) {
                skills.splice(index, 1);
                rebuildSkillOrder();
                autoSave();
                updateInfo();
                toast("已删除技能点");
            }
        });
    });
}

// ===================== 保存 / 读取 =====================
function saveConfig() {
    try {
        var data = {
            pressTime: pressTime,
            watchText: watchText,
            watchRegion: watchRegion,
            watchIntervalSec: watchIntervalSec,
            deathClickEnabled: deathClickEnabled,
            deathClickPoint: deathClickPoint,
            deathClickWaitMs: deathClickWaitMs,
            pickupText: pickupText,
            pickupRegion: pickupRegion,
            pickupClickEnabled: pickupClickEnabled,
            pickupClickPoint: pickupClickPoint,
            pickupReuseWatchRegion: pickupReuseWatchRegion,
            mainWinPos: mainWinPos,
            miniWinPos: miniWinPos,
            minimized: minimized,

            stepScenes: stepScenes,
            activeStepSceneIndex: activeStepSceneIndex,

            roles: roles,
            activeRoleIndex: activeRoleIndex
        };
        files.write(CONFIG_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
        toast("保存失败: " + e);
        log("saveConfig error: " + e);
    }
}

function loadConfig() {
    try {
        if (files.exists(CONFIG_PATH)) {
            var txt = files.read(CONFIG_PATH);
            var data = JSON.parse(txt);

            pressTime = typeof data.pressTime === "number" ? data.pressTime : 50;
            watchText = data.watchText || "基本";
            watchRegion = data.watchRegion || null;
            watchIntervalSec = typeof data.watchIntervalSec === "number" ? data.watchIntervalSec : 10;
            deathClickEnabled = typeof data.deathClickEnabled === "boolean" ? data.deathClickEnabled : true;
            deathClickPoint = data.deathClickPoint || null;
            deathClickWaitMs = typeof data.deathClickWaitMs === "number" ? data.deathClickWaitMs : 1000;
            pickupText = data.pickupText || "拾取";
            pickupRegion = data.pickupRegion || null;
            pickupClickEnabled = !!data.pickupClickEnabled;
            pickupClickPoint = data.pickupClickPoint || null;
            pickupReuseWatchRegion = typeof data.pickupReuseWatchRegion === "boolean" ? data.pickupReuseWatchRegion : true;
            mainWinPos = data.mainWinPos || mainWinPos;
            miniWinPos = data.miniWinPos || miniWinPos;
            minimized = !!data.minimized;
            if (!mainWinPos || typeof mainWinPos.x !== "number" || typeof mainWinPos.y !== "number") {
                mainWinPos = { x: 80, y: 220 };
            }
            if (!miniWinPos || typeof miniWinPos.x !== "number" || typeof miniWinPos.y !== "number") {
                miniWinPos = { x: mainWinPos.x, y: mainWinPos.y };
            }

            stepScenes = data.stepScenes || [];
            activeStepSceneIndex = typeof data.activeStepSceneIndex === "number" ? data.activeStepSceneIndex : 0;

            if ((!stepScenes || !stepScenes.length) && data.steps && data.steps.length >= 0) {
                stepScenes = [{
                    id: "scene_legacy_" + new Date().getTime(),
                    name: "默认场景",
                    steps: data.steps || []
                }];
                activeStepSceneIndex = 0;
            }

            roles = data.roles || [];
            activeRoleIndex = typeof data.activeRoleIndex === "number" ? data.activeRoleIndex : 0;

            ensureDefaultStepScene();
            for (var i = 0; i < stepScenes.length; i++) {
                rebuildStepOrder(stepScenes[i]);
            }

            ensureDefaultRole();
            for (var j = 0; j < roles.length; j++) {
                rebuildSkillOrderFor(roles[j]);
            }
        }
    } catch (e) {
        log("loadConfig error: " + e);
        watchText = "基本";
        watchRegion = null;
        watchIntervalSec = 10;
        pressTime = 50;
        deathClickEnabled = true;
        deathClickPoint = null;
        deathClickWaitMs = 1000;
        pickupText = "拾取";
        pickupRegion = null;
        pickupClickEnabled = false;
        pickupClickPoint = null;
        pickupReuseWatchRegion = true;
        mainWinPos = { x: 80, y: 220 };
        miniWinPos = { x: 80, y: 220 };
        minimized = false;

        stepScenes = [];
        activeStepSceneIndex = 0;
        ensureDefaultStepScene();

        roles = [];
        activeRoleIndex = 0;
        ensureDefaultRole();
    }
}

// ===================== 退出 =====================
function exitScript() {
    try {
        monitoring = false;
        monitoringWorkerId += 1;
        sceneExecuting = false;
        stopSkillLoop(false);
        monitorExecStepName = "";
        monitorExecRemainMs = 0;
        skillExecStepName = "";
        skillExecRemainMs = 0;
        nextOcrRemainSec = 0;
        updateInfo();

        if (win) {
            try { win.close(); } catch (e) {}
        }
        if (miniWin) {
            try { miniWin.close(); } catch (e) {}
        }

        toast("脚本已退出");
        exit();
    } catch (e) {
        log("exitScript error: " + e);
        exit();
    }
}

events.on("exit", function () {
    monitoring = false;
    monitoringWorkerId += 1;
    sceneExecuting = false;
    stopSkillLoop(false);
});

setTimeout(function() {
    updateInfo();
}, 300);

setInterval(function(){}, 1000);
