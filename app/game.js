(function () {
    "use strict";

    const canvas = document.getElementById("board");
    const ctx = canvas.getContext("2d");
    const scoreEl = document.getElementById("score");
    const bestEl = document.getElementById("best");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayText = document.getElementById("overlay-text");
    const startBtn = document.getElementById("start-btn");

    const GRID = 24;
    const CELL = canvas.width / GRID;
    const BASE_TICK_MS = 120;
    const MIN_TICK_MS = 55;

    const state = {
        snake: [],
        dir: { x: 1, y: 0 },
        pendingDir: { x: 1, y: 0 },
        food: null,
        score: 0,
        running: false,
        paused: false,
        lastTick: 0,
        tickMs: BASE_TICK_MS,
        rafId: null,
    };

    function reset() {
        state.snake = [
            { x: 8, y: 12 },
            { x: 7, y: 12 },
            { x: 6, y: 12 },
        ];
        state.dir = { x: 1, y: 0 };
        state.pendingDir = { x: 1, y: 0 };
        state.score = 0;
        state.tickMs = BASE_TICK_MS;
        placeFood();
        updateHud();
    }

    function placeFood() {
        while (true) {
            const f = {
                x: Math.floor(Math.random() * GRID),
                y: Math.floor(Math.random() * GRID),
            };
            if (!state.snake.some((s) => s.x === f.x && s.y === f.y)) {
                state.food = f;
                return;
            }
        }
    }

    function updateHud() {
        scoreEl.textContent = state.score;
    }

    function showOverlay(title, text, btn = "Start") {
        overlayTitle.textContent = title;
        overlayText.innerHTML = text;
        startBtn.textContent = btn;
        overlay.classList.remove("hidden");
    }

    function hideOverlay() {
        overlay.classList.add("hidden");
    }

    function gameOver() {
        state.running = false;
        cancelAnimationFrame(state.rafId);

        const user = window.SnakeAuth.currentUser();
        let newRecord = false;
        if (user) {
            const prev = window.SnakeAuth.getBest(user);
            if (state.score > prev) {
                newRecord = true;
                window.SnakeAuth.setBest(user, state.score);
                bestEl.textContent = state.score;
            }
        }

        const line = newRecord
            ? `<strong>New best!</strong> Score: ${state.score}`
            : `Score: ${state.score}`;
        showOverlay("Game Over", line + "<br>Press Start to play again.", "Play Again");
    }

    function step() {
        // Apply queued direction (prevents 180° turn into self).
        state.dir = state.pendingDir;

        const head = state.snake[0];
        const next = { x: head.x + state.dir.x, y: head.y + state.dir.y };

        // Wall collision.
        if (next.x < 0 || next.x >= GRID || next.y < 0 || next.y >= GRID) {
            return gameOver();
        }

        // Self collision.
        if (state.snake.some((s) => s.x === next.x && s.y === next.y)) {
            return gameOver();
        }

        state.snake.unshift(next);

        if (next.x === state.food.x && next.y === state.food.y) {
            state.score += 10;
            updateHud();
            // Speed up slightly, with a floor.
            state.tickMs = Math.max(MIN_TICK_MS, state.tickMs - 2);
            placeFood();
        } else {
            state.snake.pop();
        }
    }

    function drawGrid() {
        ctx.fillStyle = "#0a1226";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = "rgba(255,255,255,0.03)";
        ctx.lineWidth = 1;
        for (let i = 1; i < GRID; i++) {
            ctx.beginPath();
            ctx.moveTo(i * CELL, 0);
            ctx.lineTo(i * CELL, canvas.height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * CELL);
            ctx.lineTo(canvas.width, i * CELL);
            ctx.stroke();
        }
    }

    function drawFood() {
        const f = state.food;
        const cx = f.x * CELL + CELL / 2;
        const cy = f.y * CELL + CELL / 2;
        const r = CELL * 0.35;

        const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, r * 2);
        grad.addColorStop(0, "#ffd36b");
        grad.addColorStop(1, "rgba(255, 107, 122, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ff6b7a";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawSnake() {
        for (let i = state.snake.length - 1; i >= 0; i--) {
            const s = state.snake[i];
            const t = i / Math.max(1, state.snake.length - 1);
            // Head bright, tail fades toward accent-2.
            const rC = Math.round(124 + (106 - 124) * t);
            const gC = Math.round(245 + (224 - 245) * t);
            const bC = Math.round(159 + (255 - 159) * t);

            ctx.fillStyle = `rgb(${rC}, ${gC}, ${bC})`;
            const pad = i === 0 ? 1 : 2;
            roundRect(
                ctx,
                s.x * CELL + pad,
                s.y * CELL + pad,
                CELL - pad * 2,
                CELL - pad * 2,
                5
            );
            ctx.fill();
        }

        // Head eye highlight.
        const head = state.snake[0];
        ctx.fillStyle = "#0b0f1a";
        const ex = head.x * CELL + CELL / 2 + state.dir.x * 4;
        const ey = head.y * CELL + CELL / 2 + state.dir.y * 4;
        ctx.beginPath();
        ctx.arc(ex, ey, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function render() {
        drawGrid();
        drawFood();
        drawSnake();

        if (state.paused) {
            ctx.fillStyle = "rgba(10, 15, 30, 0.6)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#e9eefc";
            ctx.font = "bold 28px Inter, system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("Paused", canvas.width / 2, canvas.height / 2);
        }
    }

    function loop(ts) {
        if (!state.running) return;
        if (!state.lastTick) state.lastTick = ts;

        if (!state.paused && ts - state.lastTick >= state.tickMs) {
            state.lastTick = ts;
            step();
        }

        render();
        if (state.running) state.rafId = requestAnimationFrame(loop);
    }

    function start() {
        reset();
        hideOverlay();
        state.running = true;
        state.paused = false;
        state.lastTick = 0;
        state.rafId = requestAnimationFrame(loop);
    }

    function togglePause() {
        if (!state.running) return;
        state.paused = !state.paused;
        render();
    }

    function setDir(dx, dy) {
        // Prevent reversing into the neck.
        if (state.dir.x === -dx && state.dir.y === -dy) return;
        // Prevent setting a redundant same-axis direction mid-tick.
        if (dx === state.dir.x && dy === state.dir.y) return;
        state.pendingDir = { x: dx, y: dy };
    }

    const KEY_MAP = {
        ArrowUp: [0, -1], KeyW: [0, -1],
        ArrowDown: [0, 1], KeyS: [0, 1],
        ArrowLeft: [-1, 0], KeyA: [-1, 0],
        ArrowRight: [1, 0], KeyD: [1, 0],
    };

    window.addEventListener("keydown", function (e) {
        // Only react when game screen is visible.
        if (!document.getElementById("game-screen").classList.contains("active")) return;

        if (e.code === "Space") {
            e.preventDefault();
            if (!state.running) start();
            else togglePause();
            return;
        }

        const mapped = KEY_MAP[e.code];
        if (mapped) {
            e.preventDefault();
            setDir(mapped[0], mapped[1]);
        }
    });

    // On-screen d-pad.
    document.querySelectorAll(".pad").forEach(function (btn) {
        btn.addEventListener("click", function () {
            const d = btn.dataset.dir;
            if (d === "up") setDir(0, -1);
            else if (d === "down") setDir(0, 1);
            else if (d === "left") setDir(-1, 0);
            else if (d === "right") setDir(1, 0);
        });
    });

    // Touch swipe support on the board.
    let touchStart = null;
    canvas.addEventListener("touchstart", function (e) {
        const t = e.touches[0];
        touchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    canvas.addEventListener("touchend", function (e) {
        if (!touchStart) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStart.x;
        const dy = t.clientY - touchStart.y;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (Math.max(absX, absY) < 20) return;
        if (absX > absY) setDir(dx > 0 ? 1 : -1, 0);
        else setDir(0, dy > 0 ? 1 : -1);
        touchStart = null;
    });

    startBtn.addEventListener("click", start);

    // Initial render — empty board with overlay.
    window.addEventListener("auth:login", function () {
        cancelAnimationFrame(state.rafId);
        state.running = false;
        reset();
        render();
        showOverlay(
            "Ready?",
            'Use <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrow keys. <kbd>Space</kbd> to pause.',
            "Start"
        );
    });

    window.addEventListener("auth:logout", function () {
        cancelAnimationFrame(state.rafId);
        state.running = false;
    });
})();
