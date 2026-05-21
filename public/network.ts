import { WsMessage } from "./types";
import { state } from "./state";
import { makeRng } from "./rng";
import { applyOppDelta, startGame } from "./game";
import { showOverlay, setStatus, doRestart } from "./ui";

// Network
export function send(obj: any) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN)
        state.ws.send(JSON.stringify(obj));
}

export function handleMsg(msg: WsMessage) {
    if (msg.type === "delta") {
        applyOppDelta(msg);
    } else if (msg.type === "died") {
        const oppId = 1 - state.myId;
        state.gameRunning = false;
        if (state.snakes[oppId]) state.snakes[oppId]!.alive = false;
        showOverlay("YOU WIN", "opponent " + (msg.reason || "crashed"), "win");
    } else if (msg.type === "restart") {
        state.oppWantRestart = true;
        if (state.wantRestart) doRestart();
        else
            document.getElementById("overlay-sub")!.textContent =
                "opponent ready — press play again";
    } else if (msg.type === "opponent_left") {
        showOverlay("DISCONNECTED", "opponent left", "neutral");
    }
}

export function connectWS(onOpen: () => void) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const WS_PORT = 8000;
    const host = location.hostname;
    state.ws = new WebSocket(`${proto}://${host}:${WS_PORT}`);

    state.ws.onopen = onOpen;
    state.ws.onmessage = (e) => {
        const msg = JSON.parse(e.data) as WsMessage;
        if (msg.type === "created") {
            state.myId = msg.pid;
            // Seed the RNG from the room code so both clients produce the
            // same fruit positions without any coordination messages.
            state.rng = makeRng(msg.code);
            document.getElementById("room-code-display")!.textContent =
                msg.code;
            const waiting = document.getElementById("waiting")!;
            waiting.classList.remove("hidden");
            waiting.style.display = "flex";
            document.getElementById("lobby-main")!.classList.add("hidden");
        } else if (msg.type === "start") {
            state.myId = msg.pid;
            // P1 (joiner) receives "start" with the room code so they can
            // seed their RNG to match P0's.
            if ("code" in msg) state.rng = makeRng((msg as any).code);
            startGame();
        } else if (msg.type === "error") {
            setStatus(msg.msg);
        } else handleMsg(msg);
    };
    state.ws.onclose = () => {
        if (state.gameRunning)
            showOverlay("DISCONNECTED", "connection lost", "neutral");
    };
}
