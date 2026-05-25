import {
    showOverlay,
    hideOverlay,
    setStatus,
    updateHud,
    showCombo,
    resetComboDisplay,
} from "./ui";
import { state } from ".";
import { WsMessage, Point } from "../shared/types";

export function send(obj: any) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN)
        state.ws.send(JSON.stringify(obj));
}

export function handleMsg(msg: WsMessage) {
    if (msg.type === "move") {
        // Apply the opponent's move directly (force=true bypasses spos gating
        // since the sending client already validated and stepped the snake).
        state.moveSnake(1 - state.myId, msg.dir, true);
    } else if (msg.type === "fruit_eaten") {
        // Apply server-authoritative score and combo.
        state.score = msg.score;
        state.combo[msg.pid] = msg.combo;
        state.combo[1 - msg.pid] = 0;
        showCombo(msg.pid, msg.combo, msg.combo);
        updateHud();
        state.fruits.delete(msg.fruitId);
        if (msg.newFruit) state.fruits.set(msg.fruitId, msg.newFruit);
        // Win check: server now broadcasts "result" directly; no result_relay needed.
    } else if (msg.type === "died") {
        // Server detected the collision and already applied the death penalty.
        state.kill(msg.pid, msg.reason);
        state.score = msg.score;
        state.combo = [0, 0];
        updateHud();
        // Server will follow up with "result" or "round_restart" as appropriate;
        // clients no longer compute or relay win conditions themselves.
    } else if (msg.type === "round_restart") {
        // Server fires this to both clients after the death animation window.
        resetComboDisplay();
        hideOverlay();
        updateHud();
        state.startRound(false, msg.fruits);
    } else if (msg.type === "result") {
        state.handleResult(msg.winner, msg.scores);
    } else if (msg.type === "restart_ack") {
        // Both players pressed play again; start a fresh match.
        hideOverlay();
        state.startRound(true, msg.fruits);
    } else if (msg.type === "restart_waiting") {
        document.getElementById("overlay-sub")!.textContent =
            "waiting for opponent...";
    } else if (msg.type === "opponent_restart") {
        document.getElementById("overlay-sub")!.textContent =
            "opponent ready — press play again";
    } else if (msg.type === "opponent_left") {
        showOverlay("DISCONNECTED", "opponent left", "neutral");
    }
}

export function connectWS(onOpen: () => void) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    state.ws = new WebSocket(`${proto}://${location.host}/ws`);

    state.ws.onopen = onOpen;
    state.ws.onmessage = (e) => {
        const msg = JSON.parse(e.data) as WsMessage;

        if (msg.type === "created") {
            document.getElementById("room-code-display")!.textContent =
                msg.code;
            const waiting = document.getElementById("waiting")!;
            waiting.classList.remove("hidden");
            waiting.style.display = "flex";
            document.getElementById("lobby-main")!.classList.add("hidden");
        } else if (msg.type === "start") {
            state.myId = msg.pid;
            state.startRound(true, msg.fruits);
        } else if (msg.type === "error") {
            setStatus(msg.msg);
        } else {
            handleMsg(msg);
        }
    };

    state.ws.onclose = () => {
        if (state.gameRunning)
            showOverlay("DISCONNECTED", "connection lost", "neutral");
    };
}
