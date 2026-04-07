"auto";

auto.waitFor();

var CONFIG_PATH = "/sdcard/ocr_skill_combo_stable_v2.json";

// ===================== 全局配置 =====================
// 单OCR配置
var watchText = "确认";
var watchRegion = null;
var watchIntervalSec = 2;
var pressTime = 50;

// 多步骤场景
var stepScenes = [];
var activeStepSceneIndex = 0;

// 多角色技能
var roles = [];
var activeRoleIndex = 0;

// 运行状态
var monitoring = false;
var nextOcrRemainSec = 0;
var execRemainMs = 0;
var execStepName = "";

var skillLoopRunning = false;
var skillLoopWorkerId = 0;

// 通用
var dialogBusy = false;
var minimized = false;

var lastButtonClickTime = 0;
var BUTTON_DEBOUNCE_MS = 300;

var MARKER_SIZE = 16;
var MARKER_HALF = 8;

loadConfig();
ensureDefaultStepScene();
ensureDefaultRole();

var win;
try {
    win = floaty.window(
        <vertical padding="0">
            <horizontal id="titleBar" bg="#AA111111" padding="6">
                <text id="title" text="OCR挂机控制台" textColor="#ffffff" textSize="12sp" w="0" layout_weight="1"/>
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
} catch (e) {
    toast("悬浮窗创建失败，请开启悬浮窗权限");
    log("floaty.window error: " + e);
    exit();
}

win.setPosition(80, 220);
updateInfo();

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

function regionText() {
    if (!watchRegion) return "未设置";
    return watchRegion.x + "," + watchRegion.y + "," + watchRegion.w + "," + watchRegion.h;
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

function doTap(x, y) {
    try {
        return press(x, y, pressTime);
    } catch (e) {
        log("doTap error: " + e);
        return false;
    }
}

function normalizeDelay(v, dft) {
    var n = parseInt(v);
    if (isNaN(n) || n < 0) return dft;
    return n;
}

function updateInfo() {
    try {
        var role = getActiveRole();
        var scene = getActiveStepScene();

        var lines = [];
        lines.push("监控词: " + (watchText || "-"));
        lines.push("识别范围: " + regionText());
        lines.push("步骤场景: " + scene.name + " (" + scene.steps.length + "步)");
        lines.push("当前角色: " + role.name + " (" + role.skills.length + "技能)");
        lines.push("OCR状态: " + (monitoring ? "监控中" : "未启动"));
        lines.push("技能状态: " + (skillLoopRunning ? "循环中" : "未启动"));

        if (monitoring) {
            lines.push("OCR倒计时: " + nextOcrRemainSec + "秒");
        }

        if (execStepName) {
            lines.push("执行: " + execStepName + " 剩余" + formatExecTime(execRemainMs));
        }

        win.info.setText(lines.join("\n"));
        win.ocrToggle.setText(monitoring ? "停止监控" : "开启监控");
        win.skillToggle.setText(skillLoopRunning ? "停止技循" : "技能循环");
    } catch (e) {
        log("updateInfo error: " + e);
    }
}

function toggleMinimize() {
    try {
        minimized = !minimized;
        if (minimized) {
            win.contentWrap.setVisibility(8);
            win.mini.setText("＋");
        } else {
            win.contentWrap.setVisibility(0);
            win.mini.setText("－");
        }
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
    }
}

function rebuildSkillOrder() {
    var skills = getActiveRole().skills;
    for (var i = 0; i < skills.length; i++) {
        skills[i].order = i + 1;
    }
}

function rebuildSkillOrderFor(role) {
    if (!role || !role.skills) return;
    for (var i = 0; i < role.skills.length; i++) {
        role.skills[i].order = i + 1;
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

// ===================== 主窗拖动 =====================
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
            win.setPosition(
                winX + (event.getRawX() - downX),
                winY + (event.getRawY() - downY)
            );
            return true;
        case event.ACTION_UP:
            return true;
    }
    return true;
});

// ===================== 按钮 =====================
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

// ===================== 菜单 =====================
function showTestMenu() {
    dialogs.select(
        "测试菜单",
        [
            "手动测OCR",
            "测试当前场景步骤"
        ]
    ).then(function(op) {
        if (op == 0) {
            manualTestOcr();
        } else if (op == 1) {
            manualTestSteps();
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

function showOcrMenu() {
    dialogs.select(
        "OCR设置",
        [
            "设置监控词+识别范围",
            "修改OCR轮询间隔（秒）",
            "修改点击按压时长（毫秒）"
        ]
    ).then(function(op) {
        if (op == 0) {
            setWatchTextDialog();
        } else if (op == 1) {
            dialogs.rawInput("OCR轮询间隔（秒）", String(watchIntervalSec || 2)).then(function(v) {
                if (v == null) return;
                watchIntervalSec = normalizeDelay(v, 2);
                if (watchIntervalSec <= 0) watchIntervalSec = 1;
                autoSave();
                updateInfo();
                toast("已设置OCR间隔");
            });
        } else if (op == 2) {
            dialogs.rawInput("点击按压时长（毫秒）", String(pressTime || 50)).then(function(v) {
                if (v == null) return;
                pressTime = normalizeDelay(v, 50);
                if (pressTime <= 0) pressTime = 50;
                autoSave();
                updateInfo();
                toast("已设置按压时长");
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

        dialogs.rawInput("步骤等待时间（毫秒）", "1000").then(function(delay) {
            if (delay == null) {
                dialogBusy = false;
                return;
            }

            dialogs.confirm("执行完这一步后开启技能循环？").then(function(enableSkillLoop) {
                function finishAdd(skillStartAfterMs) {
                    var stepName = String(name).trim() || ("步骤" + (sceneSteps.length + 1));
                    var stepDelay = normalizeDelay(delay, 1000);
                    var startWait = normalizeDelay(skillStartAfterMs, 0);

                    var pos = getDefaultMarkerPos();

                    showMarkerAdjuster(
                        pos.x,
                        pos.y,
                        "拖动步骤位置",
                        function(finalX, finalY) {
                            sceneSteps.push({
                                id: "step_" + new Date().getTime() + "_" + random(1000, 9999),
                                name: stepName,
                                x: finalX,
                                y: finalY,
                                delay: stepDelay,
                                enableSkillLoop: !!enableSkillLoop,
                                skillStartAfterMs: startWait
                            });
                            rebuildStepOrder(scene);
                            autoSave();
                            updateInfo();
                            dialogBusy = false;
                            toast("已添加步骤: " + stepName);
                        },
                        function() {
                            dialogBusy = false;
                            toast("已取消添加步骤");
                        }
                    );
                }

                if (enableSkillLoop) {
                    dialogs.rawInput("开启技能前等待时间（毫秒）", "0").then(function(skillWait) {
                        if (skillWait == null) {
                            dialogBusy = false;
                            return;
                        }
                        finishAdd(skillWait);
                    });
                } else {
                    finishAdd(0);
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
        var flag = s.enableSkillLoop ? (" [开技能+" + (s.skillStartAfterMs || 0) + "ms]") : "";
        items.push((i + 1) + ". " + s.name + " (" + s.x + "," + s.y + ") 等待:" + s.delay + "ms" + flag);
    }

    dialogs.select("步骤列表 - " + scene.name, items).then(function(index) {
        if (index < 0) return;

        var step = steps[index];

        dialogs.select(
            "步骤：" + step.name + "\n当前位置：(" + step.x + ", " + step.y + ")",
            ["编辑位置", "切换开技能", "修改步骤等待时间", "修改开启技能前等待时间", "上移", "下移", "删除", "取消"]
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
                dialogs.rawInput("新的步骤等待时间(ms)", String(step.delay || 1000)).then(function(delay) {
                    if (delay == null) return;
                    step.delay = normalizeDelay(delay, 1000);
                    autoSave();
                    updateInfo();
                    toast("已修改步骤等待时间");
                });
            } else if (op == 3) {
                dialogs.rawInput("新的开启技能前等待时间(ms)", String(step.skillStartAfterMs || 0)).then(function(v) {
                    if (v == null) return;
                    step.skillStartAfterMs = normalizeDelay(v, 0);
                    if (step.skillStartAfterMs > 0) {
                        step.enableSkillLoop = true;
                    }
                    autoSave();
                    updateInfo();
                    toast("已修改开启技能前等待时间");
                });
            } else if (op == 4) {
                if (index > 0) {
                    var t = steps[index];
                    steps[index] = steps[index - 1];
                    steps[index - 1] = t;
                    rebuildStepOrder(scene);
                    autoSave();
                    updateInfo();
                    toast("已上移");
                }
            } else if (op == 5) {
                if (index < steps.length - 1) {
                    var t2 = steps[index];
                    steps[index] = steps[index + 1];
                    steps[index + 1] = t2;
                    rebuildStepOrder(scene);
                    autoSave();
                    updateInfo();
                    toast("已下移");
                }
            } else if (op == 6) {
                steps.splice(index, 1);
                rebuildStepOrder(scene);
                autoSave();
                updateInfo();
                toast("已删除");
            }
        });
    });
}

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

                autoSave();
                updateInfo();
                toast("已设置监控词和识别范围");
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

        var found = false;
        var arr = [];
        var targetNorm = normalizeOcrText(targetText);

        if (results && results.length > 0) {
            for (var i = 0; i < results.length; i++) {
                var r = results[i];
                var label = String(r.label || "");
                arr.push(label);
                if (normalizeOcrText(label).indexOf(targetNorm) >= 0) {
                    found = true;
                }
            }
        }

        var merged = normalizeOcrText(arr.join(""));
        if (!found && merged.indexOf(targetNorm) >= 0) {
            found = true;
        }

        return { found: found, debugText: arr.join(" | ") };
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

function manualTestOcr() {
    if (!watchText || !String(watchText).trim()) {
        toast("请先设置监控词");
        return;
    }
    if (!watchRegion) {
        toast("请先设置监控词并框选识别范围");
        return;
    }

    threads.start(function () {
        try {
            if (!requestScreenCapture()) {
                toast("截图权限获取失败");
                return;
            }

            var ret = checkWatchText(watchText, watchRegion);
            var msg = ret && ret.found
                ? ("OCR识别成功：命中【" + watchText + "】\n识别结果：" + (ret.debugText || "(空)"))
                : ("OCR识别失败：未命中【" + watchText + "】\n识别结果：" + ((ret && ret.debugText) || "(空)"));

            log("manualTestOcr => " + msg);
            toast(ret && ret.found ? "OCR识别成功" : "OCR识别失败");
            dialogs.alert("手动测试OCR", msg).then(function() {});
        } catch (e) {
            log("manualTestOcr error: " + e);
            toast("手动测试OCR异常: " + e);
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
        try {
            execStepName = "";
            execRemainMs = 0;
            updateInfo();

            var list = steps.slice();
            for (var i = 0; i < list.length; i++) {
                var step = list[i];
                execStepName = "[" + scene.name + "] " + step.name;
                execRemainMs = step.delay;
                updateInfo();

                doTap(step.x, step.y);

                var remain = step.delay;
                while (remain > 0) {
                    execRemainMs = remain;
                    updateInfo();
                    var slice = remain > 100 ? 100 : remain;
                    sleep(slice);
                    remain -= slice;
                }

                if (step.enableSkillLoop) {
                    var skillWait = parseInt(step.skillStartAfterMs || 0);
                    if (skillWait > 0) {
                        execStepName = "[" + scene.name + "] 等待开技能";
                        execRemainMs = skillWait;
                        updateInfo();

                        var skillRemain = skillWait;
                        while (skillRemain > 0) {
                            execRemainMs = skillRemain;
                            updateInfo();
                            var skillSlice = skillRemain > 100 ? 100 : skillRemain;
                            sleep(skillSlice);
                            skillRemain -= skillSlice;
                        }
                    }

                    toggleSkillLoop();
                    sleep(300);
                }
            }

            execStepName = "";
            execRemainMs = 0;
            updateInfo();
            toast("测试步骤完成");
        } catch (e) {
            log("manualTestSteps error: " + e);
            toast("测试步骤异常: " + e);
        }
    });
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
    nextOcrRemainSec = 0;
    execRemainMs = 0;
    execStepName = "";
    updateInfo();
    toast("已开启监控，当前场景：" + scene.name);

    threads.start(function () {
        try {
            if (!requestScreenCapture()) {
                monitoring = false;
                updateInfo();
                toast("截图权限获取失败");
                return;
            }

            while (monitoring) {
                nextOcrRemainSec = 0;
                updateInfo();

                var currentScene = getActiveStepScene();
                var ret = checkWatchText(watchText, watchRegion);
                if (!monitoring) break;

                if (ret.found) {
                    if (skillLoopRunning) {
                        skillLoopRunning = false;
                        skillLoopWorkerId += 1;
                        execStepName = "";
                        execRemainMs = 0;
                        updateInfo();
                        sleep(200);
                    }

                    toast("识别到【" + watchText + "】，执行场景：" + currentScene.name);

                    var list = currentScene.steps.slice();
                    for (var i = 0; i < list.length; i++) {
                        if (!monitoring) break;

                        var step = list[i];
                        execStepName = "[" + currentScene.name + "] " + step.name;
                        execRemainMs = step.delay;
                        updateInfo();

                        doTap(step.x, step.y);

                        var remain = step.delay;
                        while (remain > 0 && monitoring) {
                            execRemainMs = remain;
                            updateInfo();
                            var slice = remain > 100 ? 100 : remain;
                            sleep(slice);
                            remain -= slice;
                        }

                        execRemainMs = 0;
                        updateInfo();

                        if (step.enableSkillLoop) {
                            if (!skillLoopRunning) {
                                var skillWait = parseInt(step.skillStartAfterMs || 0);
                                if (skillWait > 0) {
                                    execStepName = "[" + currentScene.name + "] 等待开技能";
                                    execRemainMs = skillWait;
                                    updateInfo();

                                    var skillRemain = skillWait;
                                    while (skillRemain > 0 && monitoring) {
                                        execRemainMs = skillRemain;
                                        updateInfo();
                                        var skillSlice = skillRemain > 100 ? 100 : skillRemain;
                                        sleep(skillSlice);
                                        skillRemain -= skillSlice;
                                    }

                                    execRemainMs = 0;
                                    updateInfo();
                                    if (!monitoring) break;
                                }

                                toggleSkillLoop();
                                sleep(300);
                            }
                        }
                    }

                    execStepName = "";
                    execRemainMs = 0;
                    updateInfo();

                    for (var cd = 3; cd > 0; cd--) {
                        if (!monitoring) break;
                        nextOcrRemainSec = cd;
                        updateInfo();
                        sleep(1000);
                    }
                }

                for (var sec = watchIntervalSec; sec > 0; sec--) {
                    if (!monitoring) break;
                    nextOcrRemainSec = sec;
                    updateInfo();
                    sleep(1000);
                }
            }
        } catch (e) {
            monitoring = false;
            execStepName = "";
            execRemainMs = 0;
            nextOcrRemainSec = 0;
            updateInfo();
            toast("监控异常: " + e);
            log("startMonitoring error: " + e);
        } finally {
            monitoring = false;
            execStepName = "";
            execRemainMs = 0;
            nextOcrRemainSec = 0;
            updateInfo();
        }
    });
}

function stopMonitoring() {
    monitoring = false;
    execStepName = "";
    execRemainMs = 0;
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

function toggleSkillLoop() {
    var role = getActiveRole();
    var skills = role.skills;

    if (!skills.length) {
        toast("当前角色没有技能点");
        return;
    }

    if (skillLoopRunning) {
        skillLoopRunning = false;
        skillLoopWorkerId += 1;
        updateInfo();
        toast("已请求停止技能循环");
        return;
    }

    skillLoopRunning = true;
    skillLoopWorkerId += 1;
    var myWorkerId = skillLoopWorkerId;

    updateInfo();
    toast("已开启技能循环: " + role.name);

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
                    execStepName = "技能[" + skill.name + "]";
                    execRemainMs = skill.delay;
                    updateInfo();

                    doTap(skill.x, skill.y);

                    if (!sleepSkillDelay(skill.delay, myWorkerId)) {
                        break;
                    }
                }
            }
        } catch (e) {
            log("toggleSkillLoop error: " + e);
        } finally {
            execStepName = "";
            execRemainMs = 0;
            if (myWorkerId === skillLoopWorkerId) {
                skillLoopRunning = false;
                updateInfo();
            }
        }
    });
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
            skillLoopRunning = false;
            skillLoopWorkerId += 1;
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
            skillLoopRunning = false;
            skillLoopWorkerId += 1;
            execStepName = "";
            execRemainMs = 0;
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

        dialogs.rawInput("技能等待时间（毫秒）", "50").then(function(delay) {
            if (delay == null) {
                dialogBusy = false;
                return;
            }

            var skillName = String(name).trim() || ("技能" + (skills.length + 1));
            var skillDelay = normalizeDelay(delay, 50);

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
                        delay: skillDelay
                    });
                    rebuildSkillOrder();
                    autoSave();
                    updateInfo();
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
        items.push((i + 1) + ". " + s.name + " (" + s.x + "," + s.y + ") 等待:" + s.delay + "ms");
    }

    dialogs.select("技能点列表 - " + role.name, items).then(function(index) {
        if (index < 0) return;

        var skill = skills[index];

        dialogs.select(
            "技能：" + skill.name + "\n当前位置：(" + skill.x + ", " + skill.y + ")",
            ["编辑位置", "修改等待时间", "上移", "下移", "删除", "取消"]
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
                dialogs.rawInput("新的等待时间(ms)", String(skill.delay || 50)).then(function(delay) {
                    if (delay == null) return;
                    skill.delay = normalizeDelay(delay, 50);
                    autoSave();
                    updateInfo();
                    toast("已修改等待时间");
                });
            } else if (op == 2) {
                if (index > 0) {
                    var t = skills[index];
                    skills[index] = skills[index - 1];
                    skills[index - 1] = t;
                    rebuildSkillOrder();
                    autoSave();
                    updateInfo();
                    toast("已上移");
                }
            } else if (op == 3) {
                if (index < skills.length - 1) {
                    var t2 = skills[index];
                    skills[index] = skills[index + 1];
                    skills[index + 1] = t2;
                    rebuildSkillOrder();
                    autoSave();
                    updateInfo();
                    toast("已下移");
                }
            } else if (op == 4) {
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

            pressTime = data.pressTime || 50;
            watchText = data.watchText || "确认";
            watchRegion = data.watchRegion || null;
            watchIntervalSec = data.watchIntervalSec || 2;

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
        watchText = "确认";
        watchRegion = null;
        watchIntervalSec = 2;
        pressTime = 50;

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
        skillLoopRunning = false;
        skillLoopWorkerId += 1;
        execStepName = "";
        execRemainMs = 0;
        nextOcrRemainSec = 0;
        updateInfo();

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
    skillLoopWorkerId += 1;
});

setTimeout(function() {
    updateInfo();
}, 300);

setInterval(function(){}, 1000);
