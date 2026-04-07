"auto";

auto.waitFor();

var CONFIG_PATH = "/sdcard/ocr_watch_with_skills.json";

// ===================== 状态 =====================
var steps = [];
var watchText = "确认";
var watchIntervalSec = 60;
var pressTime = 50;
var watchRegion = null;

var monitoring = false;
var dialogBusy = false;
var minimized = false;

var nextOcrRemainSec = 0;
var execRemainMs = 0;
var execStepName = "";
var statusText = "未启动";

// 防抖
var lastButtonClickTime = 0;
var BUTTON_DEBOUNCE_MS = 500;

// ===================== 技能挂机 =====================
var skillSets = [];
var activeSkillSetIndex = 0;
var showSkillMarkers = false;
var skillMarkerWindows = [];
var skillLoopRunning = false;

// ===================== 十字设置 =====================
var CROSS_SIZE = 56;
var CROSS_HALF = 28;

// ===================== 读取配置 =====================
loadConfig();
ensureDefaultSkillSet();

// ===================== 悬浮窗 =====================
var win;
try {
    win = floaty.window(
        <vertical bg="#77000000" padding="5">
            <horizontal>
                <text id="title" text="OCR助手" textColor="#ffffff" textSize="12sp" w="0" layout_weight="1"/>
                <button id="mini" text="－" w="34" h="30" textSize="10sp"/>
            </horizontal>

            <vertical id="panel">
                <text id="info"
                      text="步骤: 0\n监控词: 确认\n识别范围: 全屏\n技能方案: 默认\n状态: 未启动\nOCR倒计时: -"
                      textColor="#ffffff"
                      textSize="10sp"
                      marginTop="2"/>

                <horizontal marginTop="3">
                    <button id="add" text="添加步骤" w="78" h="32" textSize="10sp"/>
                    <button id="list" text="步骤列表" w="78" h="32" textSize="10sp" marginLeft="3"/>
                </horizontal>

                <horizontal marginTop="3">
                    <button id="setText" text="设置监控词" w="78" h="32" textSize="10sp"/>
                    <button id="skills" text="技能管理" w="78" h="32" textSize="10sp" marginLeft="3"/>
                </horizontal>

                <horizontal marginTop="3">
                    <button id="toggleMarkers" text="显示技能点" w="78" h="32" textSize="10sp"/>
                    <button id="save" text="保存配置" w="78" h="32" textSize="10sp" marginLeft="3"/>
                </horizontal>

                <horizontal marginTop="3">
                    <button id="start" text="开启监控" w="52" h="32" textSize="10sp"/>
                    <button id="stop" text="停止监控" w="52" h="32" textSize="10sp" marginLeft="3"/>
                    <button id="skillOnly" text="技能循环" w="52" h="32" textSize="10sp" marginLeft="3"/>
                </horizontal>

                <horizontal marginTop="3">
                    <button id="exitBtn" text="退出脚本" w="159" h="32" textSize="10sp"/>
                </horizontal>
            </vertical>
        </vertical>
    );
} catch (e) {
    toast("悬浮窗创建失败，请先开启悬浮窗权限");
    log("floaty.window error: " + e);
    exit();
}

win.setPosition(80, 250);
updateInfo();

// ===================== 通用防抖 =====================
function canClickNow() {
    var now = new Date().getTime();
    if (now - lastButtonClickTime < BUTTON_DEBOUNCE_MS) {
        return false;
    }
    lastButtonClickTime = now;
    return true;
}

// ===================== 拖动主悬浮窗 =====================
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
            win.setPosition(winX + (event.getRawX() - downX), winY + (event.getRawY() - downY));
            return true;
        case event.ACTION_UP:
            return true;
    }
    return true;
});

// ===================== 按钮事件 =====================
win.mini.click(function () {
    if (!canClickNow()) return;
    toggleMinimize();
});

win.add.click(function () {
    if (!canClickNow()) return;
    addStepDialog();
});

win.list.click(function () {
    if (!canClickNow()) return;
    showStepList();
});

win.setText.click(function () {
    if (!canClickNow()) return;
    setWatchTextDialog();
});

win.skills.click(function () {
    if (!canClickNow()) return;
    showSkillSetMenu();
});

win.toggleMarkers.click(function () {
    if (!canClickNow()) return;
    toggleSkillMarkers();
});

win.start.click(function () {
    if (!canClickNow()) return;
    startMonitoring();
});

win.stop.click(function () {
    if (!canClickNow()) return;
    stopMonitoring();
});

win.skillOnly.click(function () {
    if (!canClickNow()) return;
    toggleSkillOnlyLoop();
});

win.save.click(function () {
    if (!canClickNow()) return;
    saveConfig();
    toast("已保存");
});

win.exitBtn.click(function () {
    if (!canClickNow()) return;
    exitScript();
});

// ===================== UI显示 =====================
function regionText() {
    if (!watchRegion) return "全屏";
    return watchRegion.x + "," + watchRegion.y + "," + watchRegion.w + "," + watchRegion.h;
}

function formatExecTime(ms) {
    if (ms <= 0) return "0秒";
    if (ms >= 1000) return (ms / 1000).toFixed(1) + "秒";
    return ms + "毫秒";
}

function getActiveSkillSet() {
    ensureDefaultSkillSet();
    if (activeSkillSetIndex < 0 || activeSkillSetIndex >= skillSets.length) {
        activeSkillSetIndex = 0;
    }
    return skillSets[activeSkillSetIndex];
}

function updateInfo() {
    try {
        if (win && win.info) {
            var activeSet = getActiveSkillSet();
            var lines = [];
            lines.push("步骤: " + steps.length);
            lines.push("监控词: " + (watchText || "-"));
            lines.push("识别范围: " + regionText());
            lines.push("技能方案: " + activeSet.name + "(" + activeSet.skills.length + ")");
            lines.push("状态: " + statusText);
            lines.push(monitoring ? ("OCR倒计时: " + nextOcrRemainSec + "秒") : "OCR倒计时: -");

            if (execStepName) {
                lines.push("执行倒计时: " + execStepName + " 还有 " + formatExecTime(execRemainMs));
            }

            win.info.setText(lines.join("\n"));
            win.toggleMarkers.setText(showSkillMarkers ? "隐藏技能点" : "显示技能点");
            win.skillOnly.setText(skillLoopRunning ? "停止技循" : "技能循环");
        }
    } catch (e) {
        log("updateInfo error: " + e);
    }
}

function toggleMinimize() {
    try {
        minimized = !minimized;
        if (minimized) {
            win.panel.setVisibility(8);
            win.mini.setText("＋");
        } else {
            win.panel.setVisibility(0);
            win.mini.setText("－");
        }
    } catch (e) {
        log("toggleMinimize error: " + e);
    }
}

// ===================== 默认十字位置 =====================
function getDefaultCrossPos() {
    var x = 500;
    var y = 500;
    try {
        x = parseInt(device.width / 2);
        y = parseInt(device.height / 2);
    } catch (e) {}
    return { x: x, y: y };
}

// ===================== 自动保存 =====================
function autoSave() {
    saveConfig();
}

// ===================== 顺序 =====================
function rebuildOrder() {
    for (var i = 0; i < steps.length; i++) {
        steps[i].order = i + 1;
    }
}

function rebuildSkillOrder(skillSet) {
    for (var i = 0; i < skillSet.skills.length; i++) {
        skillSet.skills[i].order = i + 1;
    }
}

function ensureDefaultSkillSet() {
    if (!skillSets || !skillSets.length) {
        skillSets = [{
            id: "default_" + new Date().getTime(),
            name: "默认",
            skills: []
        }];
    }
    if (activeSkillSetIndex >= skillSets.length) {
        activeSkillSetIndex = 0;
    }
}

// ===================== 一次性拾点（仅OCR范围保留） =====================
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

// ===================== 十字调整器（微调 + 测试并关闭） =====================
function showCrossAdjuster(initX, initY, titleText, onConfirm, onCancel) {
    try {
        var marker = floaty.window(
            <frame w={String(CROSS_SIZE)} h={String(CROSS_SIZE)}>
                <text id="cross"
                      text="✛"
                      textColor="#ff3333"
                      textSize="30sp"
                      gravity="center"
                      w="*"
                      h="*"/>
            </frame>
        );

        var ctrl = floaty.window(
            <vertical bg="#AA000000" padding="4">
                <text id="title"
                      text={titleText || "调整位置"}
                      textColor="#ffffff"
                      textSize="10sp"/>

                <horizontal marginTop="4">
                    <button id="up" text="上" w="44" h="28" textSize="10sp"/>
                    <button id="step" text="1px" w="52" h="28" textSize="10sp" marginLeft="4"/>
                    <button id="testClose" text="测试并关闭" w="84" h="28" textSize="10sp" marginLeft="4"/>
                </horizontal>

                <horizontal marginTop="4">
                    <button id="left" text="左" w="44" h="28" textSize="10sp"/>
                    <button id="down" text="下" w="44" h="28" textSize="10sp" marginLeft="4"/>
                    <button id="right" text="右" w="44" h="28" textSize="10sp" marginLeft="4"/>
                </horizontal>

                <horizontal marginTop="4">
                    <button id="ok" text="确定" w="56" h="30" textSize="10sp"/>
                    <button id="cancel" text="取消" w="56" h="30" textSize="10sp" marginLeft="4"/>
                </horizontal>
            </vertical>
        );

        var stepPx = 1;
        var busy = false;

        function getCenter() {
            return {
                x: parseInt(marker.getX() + CROSS_HALF),
                y: parseInt(marker.getY() + CROSS_HALF)
            };
        }

        function moveBy(dx, dy) {
            try {
                var nx = parseInt(marker.getX() + dx);
                var ny = parseInt(marker.getY() + dy);
                marker.setPosition(nx, ny);
            } catch (e) {
                log("moveBy error: " + e);
            }
        }

        marker.setPosition(parseInt(initX - CROSS_HALF), parseInt(initY - CROSS_HALF));
        ctrl.setPosition(60, 120);

        var startX = 0, startY = 0, windowX = 0, windowY = 0;

        marker.cross.setOnTouchListener(function(view, event) {
            if (busy) return true;
            try {
                switch (event.getAction()) {
                    case event.ACTION_DOWN:
                        startX = event.getRawX();
                        startY = event.getRawY();
                        windowX = marker.getX();
                        windowY = marker.getY();
                        return true;
                    case event.ACTION_MOVE:
                        var nx = parseInt(windowX + (event.getRawX() - startX));
                        var ny = parseInt(windowY + (event.getRawY() - startY));
                        marker.setPosition(nx, ny);
                        return true;
                    case event.ACTION_UP:
                        return true;
                }
            } catch (e) {
                log("cross touch error: " + e);
            }
            return true;
        });

        ctrl.up.click(function() {
            if (busy) return;
            moveBy(0, -stepPx);
        });

        ctrl.down.click(function() {
            if (busy) return;
            moveBy(0, stepPx);
        });

        ctrl.left.click(function() {
            if (busy) return;
            moveBy(-stepPx, 0);
        });

        ctrl.right.click(function() {
            if (busy) return;
            moveBy(stepPx, 0);
        });

        ctrl.step.click(function() {
            if (busy) return;
            stepPx = (stepPx === 1 ? 5 : 1);
            ctrl.step.setText(stepPx + "px");
        });

        ctrl.testClose.click(function() {
            if (busy) return;
            busy = true;

            try {
                var p = getCenter();

                threads.start(function () {
                    try {
                        press(p.x, p.y, pressTime);
                        sleep(150);
                    } catch (e2) {
                        log("testClose thread error: " + e2);
                    }

                    ui.run(function () {
                        try { marker.close(); } catch (e) {}
                        try { ctrl.close(); } catch (e) {}
                        toast("已测试点击并关闭: (" + p.x + "," + p.y + ")");
                        if (onCancel) onCancel();
                    });
                });
            } catch (e) {
                busy = false;
                log("testClose error: " + e);
                if (onCancel) onCancel();
            }
        });

        ctrl.ok.click(function() {
            if (busy) return;
            try {
                var p = getCenter();
                try { marker.close(); } catch (e) {}
                try { ctrl.close(); } catch (e) {}
                if (onConfirm) onConfirm(p.x, p.y);
            } catch (e) {
                log("cross ok error: " + e);
                try { marker.close(); } catch (e2) {}
                try { ctrl.close(); } catch (e2) {}
                if (onCancel) onCancel();
            }
        });

        ctrl.cancel.click(function() {
            if (busy) return;
            try { marker.close(); } catch (e) {}
            try { ctrl.close(); } catch (e) {}
            if (onCancel) onCancel();
        });

    } catch (e) {
        toast("十字调整器打开失败: " + e);
        log("showCrossAdjuster error: " + e);
        if (onCancel) onCancel();
    }
}

// ===================== 编辑步骤位置 =====================
function editStepPosition(step, onDone) {
    showCrossAdjuster(
        step.x,
        step.y,
        "拖动/微调步骤位置",
        function(finalX, finalY) {
            step.x = finalX;
            step.y = finalY;
            autoSave();
            toast("位置已更新并自动保存");
            if (onDone) onDone();
        },
        function() {
            if (onDone) onDone();
        }
    );
}

// ===================== 添加步骤 =====================
function addStepDialog() {
    if (dialogBusy) {
        toast("当前已有操作未完成");
        return;
    }
    dialogBusy = true;

    dialogs.rawInput("步骤名称", "步骤" + (steps.length + 1)).then(function(name) {
        if (name == null) {
            dialogBusy = false;
            return;
        }

        dialogs.rawInput("点击后等待时间（毫秒）", "1000").then(function(delay) {
            if (delay == null) {
                dialogBusy = false;
                return;
            }

            dialogs.confirm("执行完这一步后开启技能循环？").then(function(enableSkillLoop) {
                var stepName = String(name).trim() || ("步骤" + (steps.length + 1));
                var stepDelay = parseInt(delay);
                if (isNaN(stepDelay)) stepDelay = 1000;

                var pos = getDefaultCrossPos();

                showCrossAdjuster(
                    pos.x,
                    pos.y,
                    "拖动/微调新步骤位置",
                    function(finalX, finalY) {
                        steps.push({
                            id: new Date().getTime() + "_" + random(1000, 9999),
                            name: stepName,
                            x: finalX,
                            y: finalY,
                            delay: stepDelay,
                            enableSkillLoop: !!enableSkillLoop
                        });
                        rebuildOrder();
                        updateInfo();
                        autoSave();
                        dialogBusy = false;
                        toast("已添加步骤: " + stepName);
                    },
                    function() {
                        dialogBusy = false;
                        toast("已取消添加步骤");
                    }
                );
            });
        });
    });
}

// ===================== 设置监控词 + 框选识别范围 =====================
function setWatchTextDialog() {
    if (dialogBusy) {
        toast("当前已有操作未完成");
        return;
    }
    dialogBusy = true;

    dialogs.rawInput("请输入监控词", watchText || "确认").then(function(text) {
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

                updateInfo();
                autoSave();
                toast("已设置监控词和识别范围");
            }, "请点击识别范围右下角");
        }, "请点击识别范围左上角");
    });
}

// ===================== 技能方案管理 =====================
function showSkillSetMenu() {
    var activeSet = getActiveSkillSet();
    dialogs.select(
        "技能管理（当前：" + activeSet.name + "）",
        ["新增技能点", "技能点列表", "切换技能方案", "新建技能方案", "重命名当前方案", "删除当前方案"]
    ).then(function(op) {
        if (op == 0) addSkillPointDialog();
        else if (op == 1) showSkillList();
        else if (op == 2) switchSkillSetDialog();
        else if (op == 3) createSkillSetDialog();
        else if (op == 4) renameSkillSetDialog();
        else if (op == 5) deleteCurrentSkillSetDialog();
    });
}

function createSkillSetDialog() {
    dialogs.rawInput("新技能方案名称", "方案" + (skillSets.length + 1)).then(function(name) {
        if (name == null) return;
        var setName = String(name).trim() || ("方案" + (skillSets.length + 1));
        skillSets.push({
            id: "set_" + new Date().getTime() + "_" + random(1000, 9999),
            name: setName,
            skills: []
        });
        activeSkillSetIndex = skillSets.length - 1;
        autoSave();
        updateInfo();
        toast("已创建技能方案: " + setName);
    });
}

function renameSkillSetDialog() {
    var activeSet = getActiveSkillSet();
    dialogs.rawInput("重命名当前技能方案", activeSet.name).then(function(name) {
        if (name == null) return;
        activeSet.name = String(name).trim() || activeSet.name;
        autoSave();
        updateInfo();
        toast("已重命名");
    });
}

function deleteCurrentSkillSetDialog() {
    if (skillSets.length <= 1) {
        toast("至少保留一套技能方案");
        return;
    }
    var activeSet = getActiveSkillSet();
    dialogs.confirm("删除技能方案", "确定删除：" + activeSet.name + " ?").then(function(ok) {
        if (!ok) return;
        skillSets.splice(activeSkillSetIndex, 1);
        if (activeSkillSetIndex >= skillSets.length) activeSkillSetIndex = skillSets.length - 1;
        autoSave();
        updateInfo();
        refreshSkillMarkers();
        toast("已删除当前技能方案");
    });
}

function switchSkillSetDialog() {
    var items = [];
    for (var i = 0; i < skillSets.length; i++) {
        items.push((i === activeSkillSetIndex ? "✓ " : "") + skillSets[i].name + " (" + skillSets[i].skills.length + ")");
    }
    dialogs.select("切换技能方案", items).then(function(index) {
        if (index < 0) return;
        activeSkillSetIndex = index;
        autoSave();
        updateInfo();
        refreshSkillMarkers();
        toast("已切换到: " + getActiveSkillSet().name);
    });
}

// ===================== 添加技能点 =====================
function addSkillPointDialog() {
    if (dialogBusy) {
        toast("当前已有操作未完成");
        return;
    }
    dialogBusy = true;

    var activeSet = getActiveSkillSet();

    dialogs.rawInput("技能名称", "技能" + (activeSet.skills.length + 1)).then(function(name) {
        if (name == null) {
            dialogBusy = false;
            return;
        }

        dialogs.rawInput("技能等待时间（毫秒）", "50").then(function(delay) {
            if (delay == null) {
                dialogBusy = false;
                return;
            }

            var skillName = String(name).trim() || ("技能" + (activeSet.skills.length + 1));
            var skillDelay = parseInt(delay);
            if (isNaN(skillDelay)) skillDelay = 50;

            var pos = getDefaultCrossPos();

            showCrossAdjuster(
                pos.x,
                pos.y,
                "拖动/微调技能位置",
                function(finalX, finalY) {
                    activeSet.skills.push({
                        id: "skill_" + new Date().getTime() + "_" + random(1000, 9999),
                        name: skillName,
                        x: finalX,
                        y: finalY,
                        delay: skillDelay
                    });
                    rebuildSkillOrder(activeSet);
                    autoSave();
                    updateInfo();
                    refreshSkillMarkers();
                    dialogBusy = false;
                    toast("已添加技能: " + skillName);
                },
                function() {
                    dialogBusy = false;
                    toast("已取消添加技能");
                }
            );
        });
    });
}

function showSkillList() {
    var activeSet = getActiveSkillSet();
    if (!activeSet.skills.length) {
        toast("当前方案没有技能点");
        return;
    }

    rebuildSkillOrder(activeSet);
    var items = [];
    for (var i = 0; i < activeSet.skills.length; i++) {
        var s = activeSet.skills[i];
        items.push((i + 1) + ". " + s.name + " (" + s.x + "," + s.y + ") 等待:" + s.delay + "ms");
    }

    dialogs.select("技能点列表 - " + activeSet.name, items).then(function(index) {
        if (index < 0) return;
        var skill = activeSet.skills[index];

        dialogs.select(
            "技能：" + skill.name + "\n当前位置：(“ + skill.x + ", " + skill.y + ")",
            ["编辑位置", "修改等待时间", "上移", "下移", "删除", "取消"]
        ).then(function(op) {
            if (op == 0) {
                showCrossAdjuster(
                    skill.x,
                    skill.y,
                    "拖动/微调技能位置",
                    function(finalX, finalY) {
                        skill.x = finalX;
                        skill.y = finalY;
                        autoSave();
                        refreshSkillMarkers();
                        toast("技能位置已更新");
                    }
                );
            } else if (op == 1) {
                dialogs.rawInput("新的等待时间(ms)", String(skill.delay || 50)).then(function(delay) {
                    if (delay == null) return;
                    var d = parseInt(delay);
                    if (isNaN(d)) {
                        toast("格式错误");
                        return;
                    }
                    skill.delay = d;
                    autoSave();
                    toast("已修改等待时间");
                });
            } else if (op == 2) {
                if (index > 0) {
                    var t = activeSet.skills[index];
                    activeSet.skills[index] = activeSet.skills[index - 1];
                    activeSet.skills[index - 1] = t;
                    rebuildSkillOrder(activeSet);
                    autoSave();
                    refreshSkillMarkers();
                    toast("已上移");
                }
            } else if (op == 3) {
                if (index < activeSet.skills.length - 1) {
                    var t2 = activeSet.skills[index];
                    activeSet.skills[index] = activeSet.skills[index + 1];
                    activeSet.skills[index + 1] = t2;
                    rebuildSkillOrder(activeSet);
                    autoSave();
                    refreshSkillMarkers();
                    toast("已下移");
                }
            } else if (op == 4) {
                activeSet.skills.splice(index, 1);
                rebuildSkillOrder(activeSet);
                autoSave();
                refreshSkillMarkers();
                updateInfo();
                toast("已删除技能点");
            }
        });
    });
}

// ===================== 技能点显示/隐藏 =====================
function clearSkillMarkers() {
    for (var i = 0; i < skillMarkerWindows.length; i++) {
        try { skillMarkerWindows[i].close(); } catch (e) {}
    }
    skillMarkerWindows = [];
}

function refreshSkillMarkers() {
    clearSkillMarkers();
    if (!showSkillMarkers) return;

    var activeSet = getActiveSkillSet();
    for (var i = 0; i < activeSet.skills.length; i++) {
        (function(skill, idx) {
            try {
                var w = floaty.window(
                    <frame>
                        <text text={"✛" + (idx + 1)}
                              textColor="#00ff00"
                              bg="#66000000"
                              textSize="12sp"
                              padding="2"/>
                    </frame>
                );
                w.setPosition(skill.x, skill.y);
                skillMarkerWindows.push(w);
            } catch (e) {
                log("refreshSkillMarkers item error: " + e);
            }
        })(activeSet.skills[i], i);
    }
}

function toggleSkillMarkers() {
    showSkillMarkers = !showSkillMarkers;
    refreshSkillMarkers();
    updateInfo();
    autoSave();
    toast(showSkillMarkers ? "已显示技能点" : "已隐藏技能点");
}

// ===================== 独立技能循环（修即时停止） =====================
function toggleSkillOnlyLoop() {
    var activeSet = getActiveSkillSet();

    if (!skillLoopRunning) {
        if (!activeSet.skills.length) {
            toast("当前技能方案没有技能点");
            return;
        }

        skillLoopRunning = true;
        statusText = "仅技能循环中";
        execStepName = "";
        execRemainMs = 0;
        updateInfo();
        toast("已开启独立技能循环: " + activeSet.name);

        threads.start(function () {
            try {
                while (skillLoopRunning) {
                    var skills = getActiveSkillSet().skills.slice();
                    for (var i = 0; i < skills.length; i++) {
                        if (!skillLoopRunning) break;
                        var skill = skills[i];
                        press(skill.x, skill.y, pressTime);

                        var remain = skill.delay;
                        while (remain > 0 && skillLoopRunning) {
                            var slice = remain > 50 ? 50 : remain;
                            sleep(slice);
                            remain -= slice;
                        }
                    }
                }
            } catch (e) {
                log("toggleSkillOnlyLoop error: " + e);
            } finally {
                skillLoopRunning = false;
                execStepName = "";
                execRemainMs = 0;
                statusText = monitoring ? "监控中" : "未启动";
                updateInfo();
            }
        });

    } else {
        skillLoopRunning = false;
        execStepName = "";
        execRemainMs = 0;
        statusText = monitoring ? "监控中" : "已停止技能循环";
        updateInfo();
        toast("已停止独立技能循环");
    }
}

// ===================== OCR监控 =====================
function startMonitoring() {
    if (monitoring) {
        monitoring = false;
        statusText = "重新开始OCR";
        nextOcrRemainSec = 0;
        execRemainMs = 0;
        execStepName = "";
        updateInfo();
        sleep(200);
    }

    if (!watchText || !String(watchText).trim()) {
        toast("请先设置监控词");
        return;
    }

    if (!watchRegion) {
        toast("请先设置监控词并框选识别范围");
        return;
    }

    if (steps.length === 0) {
        toast("请先录制点击步骤");
        return;
    }

    monitoring = true;
    statusText = "监控中";
    nextOcrRemainSec = 0;
    execRemainMs = 0;
    execStepName = "";
    updateInfo();
    toast("已开启监控");

    threads.start(function () {
        try {
            if (!requestScreenCapture()) {
                monitoring = false;
                statusText = "截图失败";
                updateInfo();
                toast("截图权限获取失败");
                return;
            }

            while (monitoring) {
                statusText = "OCR识别中";
                nextOcrRemainSec = 0;
                updateInfo();

                var found = checkWatchText(watchText, watchRegion);
                if (!monitoring) break;

                if (found.found) {
                    toast("识别到【" + watchText + "】，开始执行");
                    statusText = "执行步骤中";
                    updateInfo();

                    runRecordedSteps();

                    execStepName = "";
                    execRemainMs = 0;
                    updateInfo();

                    for (var c = 3; c > 0; c--) {
                        if (!monitoring) break;
                        statusText = "执行后冷却";
                        nextOcrRemainSec = c;
                        updateInfo();
                        sleep(1000);
                    }
                }

                for (var sec = watchIntervalSec; sec > 0; sec--) {
                    if (!monitoring) break;
                    statusText = "等待下次OCR";
                    nextOcrRemainSec = sec;
                    updateInfo();
                    sleep(1000);
                }
            }
        } catch (e) {
            monitoring = false;
            statusText = "监控异常";
            updateInfo();
            toast("监控异常: " + e);
            log("startMonitoring error: " + e);
        }

        if (!monitoring) {
            statusText = skillLoopRunning ? "仅技能循环中" : "未启动";
            nextOcrRemainSec = 0;
            if (!skillLoopRunning) {
                execRemainMs = 0;
                execStepName = "";
            }
            updateInfo();
        }
    });
}

function stopMonitoring() {
    monitoring = false;
    skillLoopRunning = false;
    statusText = "已停止";
    nextOcrRemainSec = 0;
    execRemainMs = 0;
    execStepName = "";
    updateInfo();
    toast("已停止监控");
}

// ===================== 执行普通步骤（保留倒计时） =====================
function runRecordedSteps() {
    var list = steps.slice();

    for (var i = 0; i < list.length; i++) {
        if (!monitoring) break;

        var step = list[i];
        execStepName = "第" + (i + 1) + "步[" + step.name + "]";
        execRemainMs = step.delay;
        updateInfo();

        press(step.x, step.y, pressTime);

        var remain = step.delay;
        while (remain > 0 && monitoring) {
            execRemainMs = remain;
            updateInfo();

            var slice = remain >= 1000 ? 200 : 100;
            sleep(slice);
            remain -= slice;
        }

        execRemainMs = 0;
        updateInfo();

        if (step.enableSkillLoop) {
            startSkillLoop();
        }
    }

    execStepName = "";
    execRemainMs = 0;
    updateInfo();
}

// ===================== 普通步骤触发的技能循环（修即时停止） =====================
function startSkillLoop() {
    var activeSet = getActiveSkillSet();
    if (!activeSet.skills.length) {
        toast("当前技能方案没有技能点");
        return;
    }

    if (skillLoopRunning) {
        return;
    }

    skillLoopRunning = true;
    toast("已开启技能循环: " + activeSet.name);

    threads.start(function () {
        try {
            while (monitoring && skillLoopRunning) {
                var skills = activeSet.skills.slice();
                for (var i = 0; i < skills.length; i++) {
                    if (!monitoring || !skillLoopRunning) break;
                    var skill = skills[i];
                    press(skill.x, skill.y, pressTime);

                    var remain = skill.delay;
                    while (remain > 0 && monitoring && skillLoopRunning) {
                        var slice = remain > 50 ? 50 : remain;
                        sleep(slice);
                        remain -= slice;
                    }
                }
            }
        } catch (e) {
            log("startSkillLoop error: " + e);
        } finally {
            skillLoopRunning = false;
            execStepName = "";
            execRemainMs = 0;
            updateInfo();
        }
    });
}

// ===================== OCR =====================
function checkWatchText(targetText, region) {
    var img = null;
    var detectImg = null;

    try {
        img = captureScreen();
        if (!img) return { found: false };

        detectImg = img;
        if (region) {
            detectImg = images.clip(img, region.x, region.y, region.w, region.h);
        }

        var results = ocr.paddle.detect(detectImg, {
            useSlim: false,
            cpuThreadNum: 4
        });

        var found = false;
        if (results && results.length > 0) {
            for (var i = 0; i < results.length; i++) {
                var r = results[i];
                var label = String(r.label || "");
                if (label.indexOf(targetText) >= 0) {
                    found = true;
                    break;
                }
            }
        }

        return { found: found };
    } catch (e) {
        log("checkWatchText error: " + e);
        return { found: false };
    } finally {
        try {
            if (detectImg && detectImg !== img) detectImg.recycle();
        } catch (e) {}
        try {
            if (img) img.recycle();
        } catch (e) {}
    }
}

// ===================== 普通步骤列表 =====================
function showStepList() {
    if (steps.length === 0) {
        toast("没有步骤");
        return;
    }

    rebuildOrder();

    var items = [];
    for (var i = 0; i < steps.length; i++) {
        var s = steps[i];
        var flag = s.enableSkillLoop ? " [开技能]" : "";
        items.push(
            (i + 1) + ". " + s.name +
            " (" + s.x + "," + s.y + ")" +
            " 等待:" + s.delay + "ms" + flag
        );
    }

    dialogs.select("步骤列表", items).then(function(index) {
        if (index < 0) return;

        var step = steps[index];

        dialogs.select(
            "步骤：" + step.name + "\n当前位置：(“ + step.x + ", " + step.y + ")",
            ["编辑位置", "切换开技能", "删除该步骤", "上移", "下移", "修改延迟", "取消"]
        ).then(function(op) {
            if (op == 0) {
                editStepPosition(step, function() {
                    rebuildOrder();
                    updateInfo();
                });
            } else if (op == 1) {
                step.enableSkillLoop = !step.enableSkillLoop;
                autoSave();
                updateInfo();
                toast("开技能已" + (step.enableSkillLoop ? "开启" : "关闭"));
            } else if (op == 2) {
                steps.splice(index, 1);
                rebuildOrder();
                updateInfo();
                autoSave();
                toast("已删除");
            } else if (op == 3) {
                if (index > 0) {
                    var t = steps[index];
                    steps[index] = steps[index - 1];
                    steps[index - 1] = t;
                    rebuildOrder();
                    updateInfo();
                    autoSave();
                    toast("已上移");
                }
            } else if (op == 4) {
                if (index < steps.length - 1) {
                    var t2 = steps[index];
                    steps[index] = steps[index + 1];
                    steps[index + 1] = t2;
                    rebuildOrder();
                    updateInfo();
                    autoSave();
                    toast("已下移");
                }
            } else if (op == 5) {
                dialogs.rawInput("新的延迟(ms)", String(step.delay || 1000)).then(function(delay) {
                    if (delay == null) return;
                    var d = parseInt(delay);
                    if (isNaN(d)) {
                        toast("延迟格式错误");
                        return;
                    }
                    step.delay = d;
                    rebuildOrder();
                    updateInfo();
                    autoSave();
                    toast("已修改延迟");
                });
            }
        });
    });
}

// ===================== 保存 / 读取 =====================
function saveConfig() {
    try {
        var data = {
            watchText: watchText,
            watchIntervalSec: watchIntervalSec,
            pressTime: pressTime,
            watchRegion: watchRegion,
            steps: steps,
            skillSets: skillSets,
            activeSkillSetIndex: activeSkillSetIndex,
            showSkillMarkers: showSkillMarkers
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

            watchText = data.watchText || "确认";
            watchIntervalSec = data.watchIntervalSec || 60;
            pressTime = data.pressTime || 50;
            watchRegion = data.watchRegion || null;
            steps = data.steps || [];
            skillSets = data.skillSets || [];
            activeSkillSetIndex = typeof data.activeSkillSetIndex === "number" ? data.activeSkillSetIndex : 0;
            showSkillMarkers = !!data.showSkillMarkers;

            rebuildOrder();
            ensureDefaultSkillSet();
            rebuildSkillOrder(getActiveSkillSet());
        }
    } catch (e) {
        log("loadConfig error: " + e);
        steps = [];
        watchRegion = null;
        skillSets = [];
        activeSkillSetIndex = 0;
        showSkillMarkers = false;
    }
}

// ===================== 退出 =====================
function exitScript() {
    try {
        monitoring = false;
        skillLoopRunning = false;
        statusText = "已退出";
        nextOcrRemainSec = 0;
        execRemainMs = 0;
        execStepName = "";

        clearSkillMarkers();

        if (win) {
            try { win.close(); } catch (e) {}
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
    skillLoopRunning = false;
    clearSkillMarkers();
});

setTimeout(function() {
    refreshSkillMarkers();
    updateInfo();
}, 300);

setInterval(function(){}, 1000);
