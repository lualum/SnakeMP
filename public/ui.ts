import { state } from "./state";
import { connectWS, send } from "./network";
import { Direction } from "./types";
import { COLS, ROWS } from "./config";
import { startGame, update, moveMe } from "./game";

// Initialize UI Listeners
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-host")?.addEventListener("click", createRoom);
    document
        .getElementById("btn-join-show")
        ?.addEventListener("click", showJoin);
    document.getElementById("btn-connect")?.addEventListener("click", joinRoom);
    document
        .getElementById("btn-restart")
        ?.addEventListener("click", requestRestart);
});

// UI Logic
export function createRoom() {
    connectWS(() => send({ type: "create" }));
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
        return;
    }
    connectWS(() => send({ type: "join", code }));
}

export function setStatus(m: string) {
    document.getElementById("status")!.textContent = m;
}

export function updateHud() {
    const me = state.snakes[state.myId];
    const opp = state.snakes[1 - state.myId];
    document.getElementById("score-me")!.textContent = String(me?.score ?? 0);
    document.getElementById("score-opp")!.textContent = String(opp?.score ?? 0);
}

export function showOverlay(title: string, sub: string, tone: string) {
    const t = document.getElementById("overlay-title")!;
    t.textContent = title;
    t.className = tone || "";
    document.getElementById("overlay-sub")!.textContent = sub || "";
    const overlay = document.getElementById("overlay")!;
    overlay.classList.remove("hidden");
    overlay.classList.add("show");
    state.wantRestart = false;
    state.oppWantRestart = false;
}

export function requestRestart() {
    state.wantRestart = true;
    send({ type: "restart" });
    document.getElementById("overlay-sub")!.textContent =
        "waiting for opponent...";
    if (state.oppWantRestart) doRestart();
}

export function doRestart() {
    state.wantRestart = false;
    state.oppWantRestart = false;
    document.getElementById("overlay")!.classList.remove("show");
    startGame();
}

// Input Logic
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

    update();

    const dir = KEY_DIR[e.key];
    if (!dir || !state.gameRunning) return;

    const s = state.snakes[state.myId];
    if (!s || !s.alive) return;

    const same = s.dir[0] === dir[0] && s.dir[1] === dir[1];
    const reversed = s.dir[0] + dir[0] === 0 && s.dir[1] + dir[1] === 0;
    if (same || reversed) return;

    moveMe(dir, true);
    s.spos = 0; // reset movement progress on direction change

    e.preventDefault();
});
