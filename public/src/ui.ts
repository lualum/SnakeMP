import { connectWS, send } from "./network";
import { state } from ".";
import { Direction } from "@shared/types";

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-host")?.addEventListener("click", createRoom);
    document
        .getElementById("btn-join-show")
        ?.addEventListener("click", showJoin);
    document.getElementById("btn-connect")?.addEventListener("click", joinRoom);
    document
        .getElementById("btn-restart")
        ?.addEventListener("click", requestRestart);

    const roomCode = getRoomCodeFromPath(window.location.pathname);
    if (roomCode) {
        showJoin();
        const input = document.getElementById(
            "code-input",
        ) as HTMLInputElement | null;
        if (input) input.value = roomCode;
        setStatus(`JOINING ${roomCode}...`);
        connectWS(() => send({ type: "join", code: roomCode }));
    }

    const codeDisplay = document.getElementById(
        "room-code-display",
    ) as HTMLDivElement;
    codeDisplay.addEventListener("click", () => {
        const url = new URL(
            window.location.origin + "/games/" + (state.code ?? ""),
        );
        navigator.clipboard.writeText(url.toString());
        showToast("LINK COPIED!");
        codeDisplay.blur();
    });
});

export function showToast(message: string, isError = false) {
    const container = document.getElementById("toast-container")!;
    const toast = document.createElement("div");
    toast.className = "toast" + (isError ? " toast-error" : "");
    toast.textContent = message;
    container.appendChild(toast);

    const duration = 2200;
    const fadeAt = duration - 280;

    setTimeout(() => {
        toast.classList.add("toast-out");
        setTimeout(() => toast.remove(), 280);
    }, fadeAt);
}

export function createRoom() {
    connectWS(() => send({ type: "create" }));
    showToast("CREATING ROOM...");
}

export function showJoin() {
    const main = document.getElementById("lobby-main");
    const panel = document.getElementById("join-panel");
    if (main) main.classList.add("hidden");
    if (panel) {
        panel.classList.remove("hidden");
        panel.style.display = "flex";
    }
    document.getElementById("code-input")?.focus();
}

export function joinRoom() {
    const input = document.getElementById("code-input") as HTMLInputElement;
    const code = input.value.trim().toUpperCase();
    if (code.length !== 4) {
        setStatus("NEED 4-LETTER CODE");
        showToast("ENTER A 4-LETTER CODE", true);
        return;
    }
    showToast(`JOINING ${code}...`);
    connectWS(() => send({ type: "join", code }));
}

export function setStatus(m: string) {
    document.getElementById("status")!.textContent = m;
}

function getRoomCodeFromPath(pathname: string): string | null {
    const match = pathname.match(/^\/games\/([A-Za-z0-9]{4})\/?$/);
    if (!match) return null;
    const code = match[1].toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) return null;
    return code;
}

export function updateHud() {
    const me = state.snakes[state.myId];
    const opp = state.snakes[1 - state.myId];
    document.getElementById("score-me")!.textContent = String(
        state.score[state.myId] ?? 0,
    );
    document.getElementById("score-opp")!.textContent = String(
        state.score[1 - state.myId] ?? 0,
    );
}

export function showOverlay(title: string, sub: string, tone: string) {
    const t = document.getElementById("overlay-title")!;
    t.textContent = title;
    t.className = tone || "";
    document.getElementById("overlay-sub")!.textContent = sub || "";
    const overlay = document.getElementById("overlay")!;
    overlay.classList.remove("hidden");
    overlay.classList.add("show");
}

export function hideOverlay() {
    const overlay = document.getElementById("overlay")!;
    overlay.classList.remove("show");
    overlay.classList.add("hidden");
}

export function requestRestart() {
    document.getElementById("overlay-sub")!.textContent =
        "waiting for opponent...";
    showToast("RESTART REQUESTED");
    send({ type: "restart" });
}

const KEY_DIR: Record<string, Direction> = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    w: [0, -1],
    s: [0, 1],
    a: [-1, 0],
    d: [1, 0],
    W: [0, -1],
    S: [0, 1],
    A: [-1, 0],
    D: [1, 0],
};

document.addEventListener("keydown", (e) => {
    if (
        e.key === "Enter" &&
        !document.getElementById("join-panel")?.classList.contains("hidden")
    ) {
        joinRoom();
        return;
    }

    state.update();

    const dir = KEY_DIR[e.key];
    if (!dir || !state.gameRunning) return;

    const s = state.snakes[state.myId];
    if (!s) return;

    const same = s.dir[0] === dir[0] && s.dir[1] === dir[1];
    const reversed = s.dir[0] + dir[0] === 0 && s.dir[1] + dir[1] === 0;
    if (same || reversed) return;

    state.moveSnake(state.myId, dir, true);
    s.spos = 0;

    e.preventDefault();
});

const currentCombo: [number, number] = [1, 1];

export function showCombo(pid: number, earned: number, newCombo: number) {
    const isMe = pid === state.myId;
    const badgeId = isMe ? "combo-me" : "combo-opp";
    const badge = document.getElementById(badgeId)!;

    const otherPid = 1 - pid;
    const otherId = otherPid === state.myId ? "combo-me" : "combo-opp";
    const otherBadge = document.getElementById(otherId)!;
    if (currentCombo[otherPid] > 1) {
        otherBadge.textContent = "BROKEN";
        otherBadge.className = "hud-combo combo-broken";
        setTimeout(() => {
            otherBadge.textContent = "";
            otherBadge.className = "hud-combo";
        }, 500);
    }

    currentCombo[pid] = newCombo;
    currentCombo[otherPid] = 1;

    if (newCombo > 2) {
        badge.textContent = `x${newCombo - 1} COMBO`;
        badge.className = "hud-combo combo-active";
    } else {
        badge.textContent = "";
        badge.className = "hud-combo";
    }

    const wrap = document.getElementById("overlay-wrap");
    if (!wrap) return;

    const popup = document.createElement("div");
    popup.className = `combo-popup ${isMe ? "side-me" : "side-opp"}`;
    popup.textContent =
        earned > 1 ? `+${earned} ×${earned}COMBO` : `+${earned}`;
    popup.style.top = "10px";
    wrap.appendChild(popup);
    setTimeout(() => popup.remove(), 950);
}

export function resetComboDisplay() {
    currentCombo[0] = 1;
    currentCombo[1] = 1;
    const me = document.getElementById("combo-me");
    const opp = document.getElementById("combo-opp");
    if (me) {
        me.textContent = "";
        me.className = "hud-combo";
    }
    if (opp) {
        opp.textContent = "";
        opp.className = "hud-combo";
    }
}
