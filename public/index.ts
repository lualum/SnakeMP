import { createRoom, showJoin, joinRoom, requestRestart } from "./ui";
import "./network";
import "./game";

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-host")?.addEventListener("click", createRoom);
    document.getElementById("btn-connect")?.addEventListener("click", joinRoom);
    document
        .getElementById("btn-restart")
        ?.addEventListener("click", requestRestart);
});

console.log("Game initialized.");
