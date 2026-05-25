import {
    COLS,
    ROWS,
    CELL,
    BORDER,
    CANVAS_W,
    CANVAS_H,
    BG1,
    BG2,
    BGBORD,
    MY_COLOR,
    OPP_COLOR,
    FRUIT_COLOR,
    THICKNESS,
    BLINK_DURATION,
    DEATH_ANIM_MS,
} from "../shared/config";
import { state } from "./index";

export const canvas = document.getElementById(
    "gameCanvas",
) as HTMLCanvasElement;
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
export const ctx = canvas.getContext("2d")!;

export function getX(col: number): number {
    return col * CELL + BORDER;
}
export function getY(row: number): number {
    return row * CELL + BORDER;
}

export function drawBackground() {
    ctx.fillStyle = BGBORD;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            ctx.fillStyle = (row + col) % 2 === 0 ? BG1 : BG2;
            ctx.fillRect(getX(col), getY(row), CELL, CELL);
        }
    }
}

export function drawFruits() {
    for (const [fx, fy] of state.fruits.values()) {
        ctx.fillStyle = FRUIT_COLOR;
        ctx.fillRect(
            getX(fx) + CELL * 0.1,
            getY(fy) + CELL * 0.1,
            CELL * 0.8,
            CELL * 0.8,
        );
    }
}

// One offscreen canvas per snake, reused every frame.
const offscreen = [0, 1].map(() => {
    const oc = document.createElement("canvas");
    oc.width = CANVAS_W;
    oc.height = CANVAS_H;
    return oc;
});
const offCtx = offscreen.map((oc) => oc.getContext("2d")!);

export function drawSnake(pid: number, now: number) {
    const s = state.snakes[pid];
    if (!s) return;

    const isMe = pid === state.myId;
    const color = isMe ? MY_COLOR.body : OPP_COLOR.body;

    let alpha = 1;

    if (state.blinkStart > 0 && !state.gameRunning) {
        const elapsed = now - state.blinkStart;
        if (elapsed < BLINK_DURATION) {
            const ramp = Math.min(elapsed / 2000, 1);
            const sine =
                0.5 +
                0.5 * Math.sin((elapsed / 1000) * Math.PI * 3 - Math.PI / 2);
            alpha = Math.min(ramp * (sine + 0.15), 1);
        }
    }

    // Death dissolve animation
    if (s.deathStart) {
        const elapsed = now - s.deathStart;
        if (elapsed >= DEATH_ANIM_MS) return;

        const t = elapsed / DEATH_ANIM_MS;
        alpha = 1 - t;

        const oc = offCtx[pid];
        oc.clearRect(0, 0, CANVAS_W, CANVAS_H);

        const flashT = Math.max(0, 1 - t * 5);
        const r = Math.round(
            255 * flashT + parseInt(color.slice(1, 3), 16) * (1 - flashT),
        );
        const g = Math.round(
            255 * flashT + parseInt(color.slice(3, 5), 16) * (1 - flashT),
        );
        const b = Math.round(
            255 * flashT + parseInt(color.slice(5, 7), 16) * (1 - flashT),
        );
        oc.fillStyle = `rgb(${r},${g},${b})`;

        const offset = (CELL * (1 - THICKNESS)) / 2;
        const expandPx = t * CELL * 0.4;

        for (const [cx, cy] of s.body) {
            oc.fillRect(
                getX(cx) + offset - expandPx,
                getY(cy) + offset - expandPx,
                CELL * THICKNESS + expandPx * 2,
                CELL * THICKNESS + expandPx * 2,
            );
        }

        ctx.globalAlpha = alpha;
        ctx.drawImage(offscreen[pid], 0, 0);
        ctx.globalAlpha = 1;
    }

    // Normal draw
    const oc = offCtx[pid];
    oc.clearRect(0, 0, CANVAS_W, CANVAS_H);
    oc.fillStyle = color;

    const offset = (CELL * (1 - THICKNESS)) / 2;
    const segX = (cx: number) => getX(cx) + offset;
    const segY = (cy: number) => getY(cy) + offset;

    if (s.body.length < 2) {
        const [hx, hy] = s.body[0];
        oc.fillRect(segX(hx), segY(hy), CELL * THICKNESS, CELL * THICKNESS);
    } else {
        const [hx, hy] = s.body[0];
        const [h2x, h2y] = s.body[1];
        const headTipX = segX(hx) - (hx - h2x) * (1 - s.spos) * CELL;
        const headTipY = segY(hy) - (hy - h2y) * (1 - s.spos) * CELL;

        const last = s.body.length - 1;
        const [tx, ty] = s.body[last];
        const [t2x, t2y] = s.body[last - 1];
        const tailTipX = segX(tx) + (t2x - tx) * s.spos * CELL;
        const tailTipY = segY(ty) + (t2y - ty) * s.spos * CELL;

        for (let i = 0; i < s.body.length - 1; i++) {
            let x1, y1, x2, y2;
            if (i === 0) {
                x1 = headTipX;
                y1 = headTipY;
            } else {
                [x1, y1] = [segX(s.body[i][0]), segY(s.body[i][1])];
            }

            if (i === s.body.length - 2) {
                x2 = tailTipX;
                y2 = tailTipY;
            } else {
                [x2, y2] = [segX(s.body[i + 1][0]), segY(s.body[i + 1][1])];
            }

            const lx = Math.min(x1, x2);
            const ly = Math.min(y1, y2);
            const lw = Math.abs(x2 - x1) + THICKNESS * CELL;
            const lh = Math.abs(y2 - y1) + THICKNESS * CELL;
            oc.fillRect(lx, ly, lw, lh);
        }
    }

    ctx.globalAlpha = alpha;
    ctx.drawImage(offscreen[pid], 0, 0);
    ctx.globalAlpha = 1;
}

export function renderLoop(now: number) {
    state.update();

    drawBackground();
    drawFruits();
    drawSnake(0, now);
    drawSnake(1, now);

    state.animFrame = requestAnimationFrame(renderLoop);
}
