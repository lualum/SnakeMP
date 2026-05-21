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
} from "./config";
import { update } from "./game";
import { state } from "./state";

export const canvas = document.getElementById(
    "gameCanvas",
) as HTMLCanvasElement;
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
export const ctx = canvas.getContext("2d")!;

// Helpers for grid-to-pixel
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

export function drawSnake(pid: number) {
    const s = state.snakes[pid];
    if (!s || !s.alive) return;
    const isMe = pid === state.myId;
    const color = isMe ? MY_COLOR.body : OPP_COLOR.body;
    ctx.fillStyle = color;

    const offset = (CELL * (1 - THICKNESS)) / 2;
    const getSegmentCornerX = (cx: number) => getX(cx) + offset;
    const getSegmentCornerY = (cy: number) => getY(cy) + offset;

    // Head tip (body[0]): ends from body[1] by spos
    const [hx, hy] = s.body[0];
    const [h2x, h2y] = s.body[1];
    const headTipX = getSegmentCornerX(hx) - (hx - h2x) * (1 - s.spos) * CELL;
    const headTipY = getSegmentCornerY(hy) - (hy - h2y) * (1 - s.spos) * CELL;

    // Tail tip (body[last]): shrinks toward body[last-1] by clampedSpos.
    const last = s.body.length - 1;
    const [tx, ty] = s.body[last]; // actual tail cell (trailing end)
    const [t2x, t2y] = s.body[last - 1]; // the cell ahead of it (direction to shrink toward)
    const tailTipX = getSegmentCornerX(tx) + (t2x - tx) * s.spos * CELL;
    const tailTipY = getSegmentCornerY(ty) + (t2y - ty) * s.spos * CELL;

    for (let i = 0; i < s.body.length - 1; i++) {
        let x1, y1, x2, y2;

        if (i === 0) {
            x1 = headTipX;
            y1 = headTipY;
        } else {
            const [cx, cy] = s.body[i];
            x1 = getSegmentCornerX(cx);
            y1 = getSegmentCornerY(cy);
        }

        if (i === s.body.length - 2) {
            x2 = tailTipX;
            y2 = tailTipY;
        } else {
            const [cx, cy] = s.body[i + 1];
            x2 = getSegmentCornerX(cx);
            y2 = getSegmentCornerY(cy);
        }

        const lx = Math.min(x1, x2);
        const ly = Math.min(y1, y2);
        const lw = Math.abs(x2 - x1) + THICKNESS * CELL;
        const lh = Math.abs(y2 - y1) + THICKNESS * CELL;
        ctx.fillRect(lx, ly, lw, lh);
    }

    // //draw head and draw tail on square
    // ctx.fillStyle = isMe ? MY_COLOR.head : OPP_COLOR.head;
    // ctx.fillRect(
    //     getSegmentCornerX(hx),
    //     getSegmentCornerY(hy),
    //     CELL * THICKNESS,
    //     CELL * THICKNESS,
    // );
    // ctx.fillRect(
    //     getSegmentCornerX(tx),
    //     getSegmentCornerY(ty),
    //     CELL * THICKNESS,
    //     CELL * THICKNESS,
    // );
}

export function renderLoop(now: number) {
    update();

    drawBackground();
    drawFruits();

    drawSnake(0);
    drawSnake(1);

    state.animFrame = requestAnimationFrame(renderLoop);
}
