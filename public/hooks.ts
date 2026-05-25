import { state } from "./index";
import { GameHooks } from "../shared/state";
import { send } from "./network";
import { showOverlay, updateHud, hideOverlay, resetComboDisplay } from "./ui";
import { renderLoop } from "./render";

export const hooks: GameHooks = {
    onMove(pid, dir) {
        if (pid !== state.myId) return;
        // Send every tile-step move to the server so it can relay to the opponent.
        send({ type: "move", dir, t: performance.now() });
    },

    onFruitEaten(pid, id, newFruit) {
        // Fruit scoring is now handled server-side inside the move handler.
        // The server will broadcast an authoritative fruit_eaten message to both
        // clients; no need to send anything from here.
    },

    onDied(pid, reason) {
        // Death is now detected and broadcast by the server. This hook is called
        // when the client receives a "died" message. No need to send anything back.
    },

    onResult(winner, scores) {
        if (winner === null) {
            showOverlay("DRAW", `${scores[0]} - ${scores[1]}`, "draw");
        } else if (winner === state.myId) {
            showOverlay("YOU WIN", `${scores[state.myId]} pts`, "win");
        } else {
            showOverlay("GAME OVER", `${scores[state.myId]} pts`, "lose");
        }
        updateHud();
    },

    startLoop() {
        if (!state.animFrame)
            state.animFrame = requestAnimationFrame(renderLoop);
    },

    showGame() {
        document.getElementById("lobby")?.classList.add("hidden");
        document.getElementById("game")!.style.display = "flex";
        document.getElementById("waiting")?.classList.add("hidden");
        hideOverlay();
        resetComboDisplay();
        updateHud();
    },
};
