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

    const W = canvas.width;
    const H = canvas.height;

    const CAR_W = 46;
    const CAR_H = 78;
    const PLAYER_SPEED = 320;
    const BULLET_SPEED = 560;
    const BULLET_COOLDOWN_MS = 200;
    const ROAD_BASE_SPEED = 280;
    const ENEMY_SPAWN_MS = 850;

    const playerImg = new Image();
    let playerImgReady = false;
    playerImg.onload = () => { playerImgReady = true; };
    playerImg.onerror = () => { playerImgReady = false; };
    playerImg.src = "player.png";

    const state = {
        running: false,
        paused: false,
        lastFrame: 0,
        lastShot: 0,
        lastSpawn: 0,
        elapsed: 0,
        roadOffset: 0,
        distance: 0,
        kills: 0,
        lives: 3,
        player: { x: W / 2, y: H - 80 },
        keys: { left: false, right: false, up: false, down: false, fire: false },
        bullets: [],
        enemies: [],
        particles: [],
        rafId: null,
    };

    function reset() {
        state.elapsed = 0;
        state.roadOffset = 0;
        state.distance = 0;
        state.kills = 0;
        state.lives = 3;
        state.bullets = [];
        state.enemies = [];
        state.particles = [];
        state.lastShot = 0;
        state.lastSpawn = 0;
        state.player.x = W / 2;
        state.player.y = H - 80;
        updateHud();
    }

    function score() {
        return Math.floor(state.distance) + state.kills * 25;
    }

    function updateHud() {
        scoreEl.textContent = score();
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

    function roadSpeed() {
        return ROAD_BASE_SPEED + Math.min(320, state.elapsed * 10);
    }

    function spawnEnemy() {
        const margin = 40;
        const w = 42, h = 74;
        state.enemies.push({
            x: margin + Math.random() * (W - margin * 2),
            y: -h,
            w, h,
            vy: roadSpeed() * 0.35 + Math.random() * 60,
            wobble: Math.random() * Math.PI * 2,
            hp: 1,
        });
    }

    function fire() {
        const now = performance.now();
        if (now - state.lastShot < BULLET_COOLDOWN_MS) return;
        state.lastShot = now;
        state.bullets.push({ x: state.player.x - 10, y: state.player.y - CAR_H / 2, vy: -BULLET_SPEED });
        state.bullets.push({ x: state.player.x + 10, y: state.player.y - CAR_H / 2, vy: -BULLET_SPEED });
    }

    function explode(x, y, color) {
        for (let i = 0; i < 18; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 70 + Math.random() * 150;
            state.particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: 0.7, age: 0, color,
            });
        }
    }

    function gameOver() {
        state.running = false;
        cancelAnimationFrame(state.rafId);

        const user = window.SnakeAuth.currentUser();
        const final = score();
        let newRecord = false;
        if (user) {
            const prev = window.SnakeAuth.getBest(user);
            if (final > prev) {
                newRecord = true;
                window.SnakeAuth.setBest(user, final);
                bestEl.textContent = final;
            }
        }
        const msg = newRecord
            ? `<strong>New best!</strong> ${final} pts · ${Math.floor(state.distance)} m · ${state.kills} kills`
            : `${final} pts · ${Math.floor(state.distance)} m · ${state.kills} kills`;
        showOverlay("Crashed!", msg + "<br>Hit start to drive again.", "Drive Again");
    }

    function update(dt) {
        state.elapsed += dt;
        const rSpeed = roadSpeed();
        state.roadOffset = (state.roadOffset + rSpeed * dt) % 80;
        state.distance += rSpeed * dt * 0.05;
        updateHud();

        const p = state.player;
        if (state.keys.left) p.x -= PLAYER_SPEED * dt;
        if (state.keys.right) p.x += PLAYER_SPEED * dt;
        if (state.keys.up) p.y -= PLAYER_SPEED * dt;
        if (state.keys.down) p.y += PLAYER_SPEED * dt;
        p.x = Math.max(CAR_W / 2 + 20, Math.min(W - CAR_W / 2 - 20, p.x));
        p.y = Math.max(CAR_H / 2 + 10, Math.min(H - CAR_H / 2 - 6, p.y));

        if (state.keys.fire) fire();

        for (const b of state.bullets) b.y += b.vy * dt;
        state.bullets = state.bullets.filter((b) => b.y > -10);

        const now = performance.now();
        const spawnInterval = Math.max(280, ENEMY_SPAWN_MS - state.elapsed * 18);
        if (now - state.lastSpawn > spawnInterval) {
            state.lastSpawn = now;
            spawnEnemy();
        }

        for (const e of state.enemies) {
            e.y += e.vy * dt;
            e.wobble += dt * 2;
            e.x += Math.sin(e.wobble) * 14 * dt;
        }

        // Bullet vs enemy.
        for (let i = state.enemies.length - 1; i >= 0; i--) {
            const e = state.enemies[i];
            for (let j = state.bullets.length - 1; j >= 0; j--) {
                const b = state.bullets[j];
                if (
                    b.x > e.x - e.w / 2 &&
                    b.x < e.x + e.w / 2 &&
                    b.y > e.y - e.h / 2 &&
                    b.y < e.y + e.h / 2
                ) {
                    state.bullets.splice(j, 1);
                    e.hp -= 1;
                    if (e.hp <= 0) {
                        state.enemies.splice(i, 1);
                        state.kills += 1;
                        updateHud();
                        explode(e.x, e.y, "#ff6b7a");
                    }
                    break;
                }
            }
        }

        // Player vs enemy + escape past bottom.
        for (let i = state.enemies.length - 1; i >= 0; i--) {
            const e = state.enemies[i];
            const hit =
                Math.abs(e.x - p.x) < (e.w + CAR_W) / 2 - 8 &&
                Math.abs(e.y - p.y) < (e.h + CAR_H) / 2 - 8;
            if (hit) {
                state.enemies.splice(i, 1);
                state.lives -= 1;
                explode(p.x, p.y, "#ffd36b");
                if (state.lives <= 0) return gameOver();
            } else if (e.y - e.h / 2 > H) {
                state.enemies.splice(i, 1);
            }
        }

        for (const q of state.particles) {
            q.age += dt;
            q.x += q.vx * dt;
            q.y += q.vy * dt;
            q.vx *= 0.9;
            q.vy *= 0.9;
        }
        state.particles = state.particles.filter((q) => q.age < q.life);
    }

    function drawRoad() {
        // Grass shoulders.
        ctx.fillStyle = "#1b3a2a";
        ctx.fillRect(0, 0, W, H);
        // Asphalt.
        ctx.fillStyle = "#222733";
        ctx.fillRect(20, 0, W - 40, H);
        // Shoulder lines.
        ctx.fillStyle = "#f2f2f2";
        ctx.fillRect(20, 0, 3, H);
        ctx.fillRect(W - 23, 0, 3, H);
        // Dashed center lines (two lanes).
        ctx.fillStyle = "#f2d35a";
        const dashH = 38, dashGap = 42;
        for (let lane = 1; lane <= 2; lane++) {
            const x = 20 + ((W - 40) / 3) * lane;
            for (let y = -dashH + state.roadOffset; y < H; y += dashH + dashGap) {
                ctx.fillRect(x - 1.5, y, 3, dashH);
            }
        }
        // Subtle road edge shading.
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        ctx.fillRect(20, 0, 14, H);
        ctx.fillRect(W - 34, 0, 14, H);
    }

    function drawCharacterHead(cx, cy, r) {
        if (playerImgReady) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(playerImg, cx - r, cy - r, r * 2, r * 2);
            ctx.restore();
            ctx.strokeStyle = "#0b0f1a";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
            return;
        }
        // Face.
        ctx.fillStyle = "#e9b896";
        ctx.beginPath();
        ctx.arc(cx, cy + 1, r, 0, Math.PI * 2);
        ctx.fill();
        // Curly hair blobs around top half.
        ctx.fillStyle = "#1a1410";
        for (let i = 0; i < 7; i++) {
            const ang = Math.PI + (i / 6) * Math.PI;
            const hx = cx + Math.cos(ang) * (r - 1);
            const hy = cy - 1 + Math.sin(ang) * (r - 2);
            ctx.beginPath();
            ctx.arc(hx, hy, 3.2, 0, Math.PI * 2);
            ctx.fill();
        }
        // Eyes + smile.
        ctx.fillStyle = "#0b0f1a";
        ctx.fillRect(cx - 3, cy + 1, 1.5, 1.8);
        ctx.fillRect(cx + 1.5, cy + 1, 1.5, 1.8);
        ctx.strokeStyle = "#0b0f1a";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy + 3, 2, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.stroke();
    }

    function drawCar(x, y, w, h, color, accent, isPlayer) {
        // Shadow.
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        roundRect(ctx, x - w / 2 + 2, y - h / 2 + 6, w, h, 8);
        ctx.fill();
        // Body.
        ctx.fillStyle = color;
        roundRect(ctx, x - w / 2, y - h / 2, w, h, 8);
        ctx.fill();
        // Hood stripe.
        ctx.fillStyle = accent;
        ctx.fillRect(x - 4, y - h / 2 + 4, 8, h - 8);
        // Windows (one front, one back).
        ctx.fillStyle = "#0d1833";
        roundRect(ctx, x - w / 2 + 6, y - h / 2 + 8, w - 12, h / 2 - 12, 4);
        ctx.fill();
        roundRect(ctx, x - w / 2 + 6, y + 4, w - 12, h / 2 - 12, 4);
        ctx.fill();
        // Wheels.
        ctx.fillStyle = "#0b0f1a";
        ctx.fillRect(x - w / 2 - 3, y - h / 2 + 6, 5, 14);
        ctx.fillRect(x + w / 2 - 2, y - h / 2 + 6, 5, 14);
        ctx.fillRect(x - w / 2 - 3, y + h / 2 - 20, 5, 14);
        ctx.fillRect(x + w / 2 - 2, y + h / 2 - 20, 5, 14);
        // Headlights or taillights.
        if (isPlayer) {
            ctx.fillStyle = "#fff3a8";
            ctx.fillRect(x - w / 2 + 4, y - h / 2, 8, 3);
            ctx.fillRect(x + w / 2 - 12, y - h / 2, 8, 3);
            // Driver head visible in front window.
            drawCharacterHead(x, y - h / 2 + 16, 9);
        } else {
            ctx.fillStyle = "#ff6b7a";
            ctx.fillRect(x - w / 2 + 4, y + h / 2 - 3, 8, 3);
            ctx.fillRect(x + w / 2 - 12, y + h / 2 - 3, 8, 3);
        }
    }

    function roundRect(c, x, y, w, h, r) {
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + w, y, x + w, y + h, r);
        c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r);
        c.arcTo(x, y, x + w, y, r);
        c.closePath();
    }

    function drawPlayer() {
        const p = state.player;
        // Glow.
        const grad = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 70);
        grad.addColorStop(0, "rgba(124,245,159,0.22)");
        grad.addColorStop(1, "rgba(124,245,159,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(p.x - 70, p.y - 70, 140, 140);
        drawCar(p.x, p.y, CAR_W, CAR_H, "#2a3d6b", "#6ae0ff", true);
    }

    function drawBullets() {
        for (const b of state.bullets) {
            ctx.fillStyle = "rgba(124,245,159,0.4)";
            ctx.fillRect(b.x - 4, b.y - 4, 8, 20);
            ctx.fillStyle = "#7cf59f";
            ctx.fillRect(b.x - 2, b.y - 8, 4, 12);
        }
    }

    function drawEnemies() {
        for (const e of state.enemies) {
            drawCar(e.x, e.y, e.w, e.h, "#6b1420", "#ff6b7a", false);
        }
    }

    function drawParticles() {
        for (const q of state.particles) {
            const a = 1 - q.age / q.life;
            ctx.globalAlpha = a;
            ctx.fillStyle = q.color;
            ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
        }
        ctx.globalAlpha = 1;
    }

    function drawHud() {
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        roundRect(ctx, 8, 8, 170, 44, 10);
        ctx.fill();
        ctx.fillStyle = "#e9eefc";
        ctx.font = "bold 13px Inter, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`${Math.floor(state.distance)} m`, 18, 26);
        ctx.fillText(`Kills: ${state.kills}`, 18, 44);
        // Lives.
        ctx.fillStyle = "#ff6b7a";
        for (let i = 0; i < state.lives; i++) {
            const x = 110 + i * 18;
            const y = 18;
            ctx.beginPath();
            ctx.moveTo(x + 6, y);
            ctx.lineTo(x + 12, y + 10);
            ctx.lineTo(x + 6, y + 8);
            ctx.lineTo(x, y + 10);
            ctx.closePath();
            ctx.fill();
        }
    }

    function render() {
        drawRoad();
        drawEnemies();
        drawBullets();
        drawPlayer();
        drawParticles();
        drawHud();

        if (state.paused) {
            ctx.fillStyle = "rgba(10, 15, 30, 0.6)";
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = "#e9eefc";
            ctx.font = "bold 28px Inter, system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("Paused", W / 2, H / 2);
        }
    }

    function loop(ts) {
        if (!state.running) return;
        if (!state.lastFrame) state.lastFrame = ts;
        const dt = Math.min(0.05, (ts - state.lastFrame) / 1000);
        state.lastFrame = ts;
        if (!state.paused) update(dt);
        render();
        if (state.running) state.rafId = requestAnimationFrame(loop);
    }

    function start() {
        reset();
        hideOverlay();
        state.running = true;
        state.paused = false;
        state.lastFrame = 0;
        state.rafId = requestAnimationFrame(loop);
    }

    function togglePause() {
        if (!state.running) return;
        state.paused = !state.paused;
    }

    const KEY_MAP = {
        ArrowLeft: "left", KeyA: "left",
        ArrowRight: "right", KeyD: "right",
        ArrowUp: "up", KeyW: "up",
        ArrowDown: "down", KeyS: "down",
        Space: "fire",
    };

    window.addEventListener("keydown", function (e) {
        if (!document.getElementById("game-screen").classList.contains("active")) return;
        if (e.code === "KeyP") { e.preventDefault(); togglePause(); return; }
        if (e.code === "Enter" && !state.running) { e.preventDefault(); start(); return; }
        const k = KEY_MAP[e.code];
        if (k) {
            e.preventDefault();
            state.keys[k] = true;
            if (k === "fire" && state.running && !state.paused) fire();
        }
    });

    window.addEventListener("keyup", function (e) {
        const k = KEY_MAP[e.code];
        if (k) state.keys[k] = false;
    });

    function bindHold(btn, onDown, onUp) {
        btn.addEventListener("pointerdown", (e) => { e.preventDefault(); onDown(); });
        btn.addEventListener("pointerup", (e) => { e.preventDefault(); onUp(); });
        btn.addEventListener("pointerleave", () => onUp());
        btn.addEventListener("pointercancel", () => onUp());
    }

    document.querySelectorAll(".pad").forEach(function (btn) {
        const d = btn.dataset.dir;
        if (d === "fire") {
            btn.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                state.keys.fire = true;
                if (state.running && !state.paused) fire();
            });
            btn.addEventListener("pointerup", () => { state.keys.fire = false; });
            btn.addEventListener("pointerleave", () => { state.keys.fire = false; });
        } else if (d) {
            bindHold(btn,
                () => { state.keys[d] = true; },
                () => { state.keys[d] = false; });
        }
    });

    // Touch on canvas: drag to move car; tap to shoot.
    let dragging = false;
    canvas.addEventListener("pointerdown", function (e) {
        dragging = true;
        const r = canvas.getBoundingClientRect();
        state.player.x = ((e.clientX - r.left) / r.width) * W;
        state.player.y = ((e.clientY - r.top) / r.height) * H;
        if (state.running && !state.paused) fire();
    });
    canvas.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        const r = canvas.getBoundingClientRect();
        state.player.x = ((e.clientX - r.left) / r.width) * W;
        state.player.y = ((e.clientY - r.top) / r.height) * H;
    });
    window.addEventListener("pointerup", function () { dragging = false; });

    startBtn.addEventListener("click", start);

    window.addEventListener("auth:login", function () {
        cancelAnimationFrame(state.rafId);
        state.running = false;
        reset();
        render();
        showOverlay(
            "Ready to drive?",
            'Move: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows. Shoot: <kbd>Space</kbd>.<br>Mobile: drag on the road, tap to shoot.',
            "Drive"
        );
    });

    window.addEventListener("auth:logout", function () {
        cancelAnimationFrame(state.rafId);
        state.running = false;
    });
})();
