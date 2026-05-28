// ============================================================
// 植物大战僵尸 - HTML5 Canvas 实现
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// === 常量 ===
const COLS = 9;
const ROWS = 5;
const CELL_W = 80;
const CELL_H = 90;
const GRID_X = 75;
const GRID_Y = 85;
const CANVAS_W = GRID_X + COLS * CELL_W + 30;
const CANVAS_H = GRID_Y + ROWS * CELL_H + 20;
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

// === 游戏状态 ===
let game = {};

function initGame() {
    game = {
        state: 'playing',
        sun: 150,
        score: 0,
        wave: 0,
        maxWaves: 10,
        waveTimer: 0,
        waveInterval: 1200,
        zombiesSpawned: 0,
        zombiesKilled: 0,
        selectedPlant: null,
        plants: [],
        zombies: [],
        projectiles: [],
        suns: [],
        particles: [],
        lawnMowers: [],
        grid: Array.from({length: ROWS}, () => Array(COLS).fill(null)),
        cardCooldowns: {},
        time: 0,
    };

    // 初始化割草机
    for (let r = 0; r < ROWS; r++) {
        game.lawnMowers.push({ row: r, x: 15, active: false, used: false });
    }

    // 初始化卡片冷却
    PLANT_TYPES.forEach(p => { game.cardCooldowns[p.name] = 0; });
}

// === 植物定义 ===
const PLANT_TYPES = [
    { name: 'sunflower', label: '向日葵', cost: 50, hp: 300, cooldown: 450, color: '#FFD700', shootInterval: 0, sunInterval: 600 },
    { name: 'peashooter', label: '豌豆射手', cost: 100, hp: 300, cooldown: 450, color: '#4CAF50', shootInterval: 90, sunInterval: 0 },
    { name: 'snowpea', label: '寒冰射手', cost: 175, hp: 300, cooldown: 450, color: '#00BCD4', shootInterval: 90, sunInterval: 0 },
    { name: 'wallnut', label: '坚果墙', cost: 50, hp: 4000, cooldown: 900, color: '#8D6E63', shootInterval: 0, sunInterval: 0 },
];

// === 僵尸定义 ===
const ZOMBIE_TYPES = [
    { name: 'normal', label: '普通僵尸', hp: 200, speed: 0.3, damage: 1, color: '#7CB342' },
    { name: 'cone', label: '路障僵尸', hp: 560, speed: 0.3, damage: 1, color: '#FF8F00' },
    { name: 'bucket', label: '铁桶僵尸', hp: 1100, speed: 0.28, damage: 1.2, color: '#78909C' },
];

// === 波次配置 ===
const WAVES = [
    [{ type: 'normal', count: 2 }],
    [{ type: 'normal', count: 3 }],
    [{ type: 'normal', count: 3 }, { type: 'cone', count: 1 }],
    [{ type: 'normal', count: 2 }, { type: 'cone', count: 2 }],
    [{ type: 'normal', count: 3 }, { type: 'cone', count: 2 }, { type: 'bucket', count: 1 }],
    [{ type: 'normal', count: 4 }, { type: 'cone', count: 3 }],
    [{ type: 'cone', count: 3 }, { type: 'bucket', count: 2 }],
    [{ type: 'normal', count: 5 }, { type: 'cone', count: 3 }, { type: 'bucket', count: 2 }],
    [{ type: 'normal', count: 4 }, { type: 'cone', count: 4 }, { type: 'bucket', count: 3 }],
    [{ type: 'normal', count: 5 }, { type: 'cone', count: 5 }, { type: 'bucket', count: 4 }],
];

// === 辅助函数 ===
function gridToX(col) { return GRID_X + col * CELL_W; }
function gridToY(row) { return GRID_Y + row * CELL_H; }
function cellCenter(col, row) {
    return { x: gridToX(col) + CELL_W / 2, y: gridToY(row) + CELL_H / 2 };
}

// === 创建实体 ===
function createPlant(type, col, row) {
    const def = PLANT_TYPES.find(p => p.name === type);
    return {
        type, col, row,
        hp: def.hp,
        maxHp: def.hp,
        timer: 0,
        animTimer: 0,
    };
}

function createZombie(type, row) {
    const def = ZOMBIE_TYPES.find(z => z.name === type);
    return {
        type, row,
        x: CANVAS_W + Math.random() * 100,
        hp: def.hp,
        maxHp: def.hp,
        speed: def.speed + (Math.random() - 0.5) * 0.05,
        damage: def.damage,
        eating: false,
        frozen: 0,
        animFrame: 0,
        animTimer: 0,
    };
}

function createProjectile(x, y, row, type) {
    return {
        x, y, row, type,
        speed: type === 'snow' ? 3.5 : 4,
        damage: 20,
    };
}

function createSun(x, y, targetY, fromSky) {
    return {
        x, y, targetY: targetY || y + 80,
        collected: false,
        timer: 0,
        lifetime: fromSky ? 600 : 480,
        fromSky,
        vx: 0, vy: 0,
        scale: 1,
    };
}

function createParticle(x, y, color, count) {
    for (let i = 0; i < (count || 5); i++) {
        game.particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4 - 2,
            life: 30 + Math.random() * 20,
            color,
            size: 2 + Math.random() * 3,
        });
    }
}

// === 更新逻辑 ===
function update() {
    if (game.state !== 'playing') return;
    game.time++;

    updateWaveSystem();
    updatePlants();
    updateZombies();
    updateProjectiles();
    updateSuns();
    updateParticles();
    updateLawnMowers();
    updateSkySuns();
    checkWinLose();
}

function updateWaveSystem() {
    if (game.wave >= game.maxWaves) return;
    game.waveTimer++;

    if (game.waveTimer >= game.waveInterval) {
        game.waveTimer = 0;
        spawnWave(game.wave);
        game.wave++;
        game.waveInterval = Math.max(600, 1200 - game.wave * 50);
    }
}

function spawnWave(waveIndex) {
    if (waveIndex >= WAVES.length) return;
    const wave = WAVES[waveIndex];
    wave.forEach(({ type, count }) => {
        for (let i = 0; i < count; i++) {
            const row = Math.floor(Math.random() * ROWS);
            const z = createZombie(type, row);
            z.x += i * 60;
            game.zombies.push(z);
            game.zombiesSpawned++;
        }
    });
}

function updatePlants() {
    game.plants.forEach(plant => {
        plant.animTimer++;
        const def = PLANT_TYPES.find(p => p.name === plant.type);
        plant.timer++;

        // 向日葵产阳光
        if (def.sunInterval > 0 && plant.timer >= def.sunInterval) {
            plant.timer = 0;
            const pos = cellCenter(plant.col, plant.row);
            const s = createSun(pos.x, pos.y, pos.y + 40, false);
            s.vx = (Math.random() - 0.5) * 1.5;
            game.suns.push(s);
        }

        // 射击类植物
        if (def.shootInterval > 0 && plant.timer >= def.shootInterval) {
            if (hasZombieInRow(plant.row, plant.col)) {
                plant.timer = 0;
                const pos = cellCenter(plant.col, plant.row);
                const pType = plant.type === 'snowpea' ? 'snow' : 'pea';
                game.projectiles.push(createProjectile(pos.x + 30, pos.y - 5, plant.row, pType));
            }
        }
    });

    // 更新卡片冷却
    PLANT_TYPES.forEach(p => {
        if (game.cardCooldowns[p.name] > 0) game.cardCooldowns[p.name]--;
    });
}

function hasZombieInRow(row, minCol) {
    const minX = gridToX(minCol);
    return game.zombies.some(z => z.row === row && z.x > minX);
}

function updateZombies() {
    game.zombies.forEach(z => {
        z.animTimer++;

        // 减速效果衰减
        if (z.frozen > 0) z.frozen--;

        // 查找当前格子的植物
        const col = Math.floor((z.x - GRID_X) / CELL_W);
        const plant = (col >= 0 && col < COLS) ? game.grid[z.row][col] : null;

        if (plant && z.x <= gridToX(col) + CELL_W - 10 && z.x >= gridToX(col)) {
            // 啃食植物
            z.eating = true;
            const dmg = z.damage * (z.frozen > 0 ? 0.5 : 1);
            plant.hp -= dmg;
            if (plant.hp <= 0) {
                game.grid[plant.row][plant.col] = null;
                game.plants = game.plants.filter(p => p !== plant);
                createParticle(cellCenter(plant.col, plant.row).x, cellCenter(plant.col, plant.row).y, '#4CAF50', 8);
            }
        } else {
            z.eating = false;
            const speedMult = z.frozen > 0 ? 0.4 : 1;
            z.x -= z.speed * speedMult;
        }
    });
}

function updateProjectiles() {
    game.projectiles.forEach(p => {
        p.x += p.speed;

        // 碰撞检测
        game.zombies.forEach(z => {
            if (z.row === p.row && Math.abs(z.x - p.x) < 20 && z.hp > 0) {
                z.hp -= p.damage;
                if (p.type === 'snow') z.frozen = 180;
                p.hit = true;
                createParticle(p.x, p.y, p.type === 'snow' ? '#80DEEA' : '#81C784', 3);
                if (z.hp <= 0) {
                    game.zombiesKilled++;
                    game.score += z.type === 'bucket' ? 30 : z.type === 'cone' ? 20 : 10;
                    createParticle(z.x, gridToY(z.row) + CELL_H / 2, '#558B2F', 10);
                }
            }
        });
    });
    game.projectiles = game.projectiles.filter(p => !p.hit && p.x < CANVAS_W + 20);
    game.zombies = game.zombies.filter(z => z.hp > 0);
}

function updateSuns() {
    game.suns.forEach(s => {
        s.timer++;
        if (s.collected) {
            // 飞向计数器动画
            const tx = 45, ty = 15;
            const dx = tx - s.x, dy = ty - s.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 10) {
                s.done = true;
                game.sun += 25;
            } else {
                s.x += dx / dist * 8;
                s.y += dy / dist * 8;
                s.scale = Math.max(0.3, s.scale - 0.02);
            }
        } else if (s.fromSky) {
            s.y += 0.5;
            if (s.y >= s.targetY) s.fromSky = false;
        } else {
            s.x += s.vx;
            s.vx *= 0.98;
            if (s.timer > 30) s.y += 0.1;
        }
        if (s.timer > s.lifetime) s.done = true;
    });
    game.suns = game.suns.filter(s => !s.done);
}

function updateSkySuns() {
    if (game.time % 600 === 0) {
        const x = GRID_X + Math.random() * (COLS * CELL_W);
        game.suns.push(createSun(x, -20, GRID_Y + Math.random() * (ROWS * CELL_H), true));
    }
}

function updateParticles() {
    game.particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.life--;
    });
    game.particles = game.particles.filter(p => p.life > 0);
}

function updateLawnMowers() {
    game.lawnMowers.forEach(lm => {
        if (lm.used && !lm.active) return;
        const zInRow = game.zombies.find(z =>
            z.row === lm.row && z.x <= GRID_X - 5 && !lm.used
        );
        if (zInRow && !lm.used) {
            lm.active = true;
            lm.used = true;
        }
        if (lm.active) {
            lm.x += 4;
            game.zombies.forEach(z => {
                if (z.row === lm.row && Math.abs(z.x - lm.x) < 30) {
                    z.hp = 0;
                    game.zombiesKilled++;
                    game.score += 10;
                    createParticle(z.x, gridToY(z.row) + CELL_H / 2, '#558B2F', 10);
                }
            });
            if (lm.x > CANVAS_W + 50) lm.active = false;
        }
    });
    game.zombies = game.zombies.filter(z => z.hp > 0);
}

function checkWinLose() {
    // 失败：僵尸到达最左边且没有割草机
    const escaped = game.zombies.find(z => z.x < 0);
    if (escaped) {
        const lm = game.lawnMowers.find(l => l.row === escaped.row && !l.used);
        if (!lm) {
            game.state = 'lost';
            showEndScreen(false);
        }
    }

    // 胜利：所有波次结束，没有存活僵尸
    if (game.wave >= game.maxWaves && game.zombies.length === 0) {
        game.state = 'won';
        showEndScreen(true);
    }
}

// === 渲染 ===
function render() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    drawBackground();
    drawGrid();
    drawLawnMowers();
    drawPlants();
    drawZombies();
    drawProjectiles();
    drawSuns();
    drawParticles();
    drawHUD();
    drawPlantCards();
    drawSelectedPlantGhost();
}

function drawBackground() {
    // 天空渐变
    const skyGrad = ctx.createLinearGradient(0, 0, 0, GRID_Y);
    skyGrad.addColorStop(0, '#87CEEB');
    skyGrad.addColorStop(1, '#B2EBF2');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CANVAS_W, GRID_Y);

    // 草坪底色
    ctx.fillStyle = '#5D4037';
    ctx.fillRect(0, GRID_Y - 5, CANVAS_W, ROWS * CELL_H + 25);
}

function drawGrid() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const x = gridToX(c), y = gridToY(r);
            const light = (r + c) % 2 === 0;
            ctx.fillStyle = light ? '#4CAF50' : '#43A047';
            ctx.fillRect(x, y, CELL_W, CELL_H);
            ctx.strokeStyle = 'rgba(0,0,0,0.08)';
            ctx.strokeRect(x, y, CELL_W, CELL_H);
        }
    }
}

function drawPlants() {
    game.plants.forEach(plant => {
        const pos = cellCenter(plant.col, plant.row);
        const bounce = Math.sin(plant.animTimer * 0.05) * 2;

        drawPlantSprite(plant.type, pos.x, pos.y + bounce, plant.hp, plant.maxHp);

        // 血条
        if (plant.hp < plant.maxHp) {
            const bw = 40, bh = 4;
            const bx = pos.x - bw / 2, by = pos.y - 35;
            ctx.fillStyle = '#333';
            ctx.fillRect(bx, by, bw, bh);
            const ratio = Math.max(0, plant.hp / plant.maxHp);
            ctx.fillStyle = ratio > 0.5 ? '#4CAF50' : ratio > 0.25 ? '#FF9800' : '#F44336';
            ctx.fillRect(bx, by, bw * ratio, bh);
        }
    });
}

function drawPlantSprite(type, x, y, hp, maxHp) {
    ctx.save();
    switch (type) {
        case 'sunflower':
            // 茎
            ctx.fillStyle = '#2E7D32';
            ctx.fillRect(x - 3, y, 6, 25);
            // 花瓣
            ctx.fillStyle = '#FFD700';
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const px = x + Math.cos(angle) * 14;
                const py = y - 8 + Math.sin(angle) * 14;
                ctx.beginPath();
                ctx.ellipse(px, py, 8, 5, angle, 0, Math.PI * 2);
                ctx.fill();
            }
            // 花心
            ctx.fillStyle = '#5D4037';
            ctx.beginPath();
            ctx.arc(x, y - 8, 10, 0, Math.PI * 2);
            ctx.fill();
            // 笑脸
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(x - 3, y - 10, 2, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(x + 3, y - 10, 2, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(x, y - 5, 4, 0, Math.PI); ctx.stroke();
            break;

        case 'peashooter':
            // 茎
            ctx.fillStyle = '#2E7D32';
            ctx.fillRect(x - 3, y + 5, 6, 20);
            // 叶子
            ctx.fillStyle = '#388E3C';
            ctx.beginPath();
            ctx.ellipse(x - 12, y + 12, 10, 5, -0.3, 0, Math.PI * 2);
            ctx.fill();
            // 头
            ctx.fillStyle = '#4CAF50';
            ctx.beginPath();
            ctx.arc(x, y - 5, 16, 0, Math.PI * 2);
            ctx.fill();
            // 嘴巴（炮管）
            ctx.fillStyle = '#388E3C';
            ctx.fillRect(x + 10, y - 10, 14, 10);
            ctx.fillStyle = '#2E7D32';
            ctx.fillRect(x + 10, y - 8, 12, 6);
            // 眼睛
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(x + 2, y - 9, 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(x + 4, y - 9, 2.5, 0, Math.PI * 2); ctx.fill();
            break;

        case 'snowpea':
            // 茎
            ctx.fillStyle = '#006064';
            ctx.fillRect(x - 3, y + 5, 6, 20);
            // 叶子
            ctx.fillStyle = '#00838F';
            ctx.beginPath();
            ctx.ellipse(x - 12, y + 12, 10, 5, -0.3, 0, Math.PI * 2);
            ctx.fill();
            // 头
            ctx.fillStyle = '#00ACC1';
            ctx.beginPath();
            ctx.arc(x, y - 5, 16, 0, Math.PI * 2);
            ctx.fill();
            // 炮管
            ctx.fillStyle = '#00838F';
            ctx.fillRect(x + 10, y - 10, 14, 10);
            ctx.fillStyle = '#006064';
            ctx.fillRect(x + 10, y - 8, 12, 6);
            // 冰晶效果
            ctx.strokeStyle = '#E0F7FA';
            ctx.lineWidth = 1;
            for (let i = 0; i < 3; i++) {
                const ix = x - 8 + i * 8, iy = y - 18;
                ctx.beginPath();
                ctx.moveTo(ix, iy); ctx.lineTo(ix, iy - 6);
                ctx.moveTo(ix - 3, iy - 3); ctx.lineTo(ix + 3, iy - 3);
                ctx.stroke();
            }
            // 眼睛
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(x + 2, y - 9, 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#0277BD';
            ctx.beginPath(); ctx.arc(x + 4, y - 9, 2.5, 0, Math.PI * 2); ctx.fill();
            break;

        case 'wallnut':
            const dmgRatio = hp / maxHp;
            // 主体
            ctx.fillStyle = '#8D6E63';
            ctx.beginPath();
            ctx.ellipse(x, y, 22, 28, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#A1887F';
            ctx.beginPath();
            ctx.ellipse(x, y - 3, 18, 22, 0, 0, Math.PI * 2);
            ctx.fill();
            // 裂纹（受伤时）
            if (dmgRatio < 0.66) {
                ctx.strokeStyle = '#5D4037';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x - 5, y - 10); ctx.lineTo(x - 2, y); ctx.lineTo(x - 8, y + 8);
                ctx.stroke();
            }
            if (dmgRatio < 0.33) {
                ctx.beginPath();
                ctx.moveTo(x + 6, y - 8); ctx.lineTo(x + 3, y + 2); ctx.lineTo(x + 8, y + 10);
                ctx.stroke();
            }
            // 眼睛
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(x - 6, y - 6, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(x + 6, y - 6, 3, 0, Math.PI * 2); ctx.fill();
            // 嘴巴
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y + 4, 6, 0.1, Math.PI - 0.1);
            ctx.stroke();
            break;
    }
    ctx.restore();
}

function drawZombies() {
    game.zombies.forEach(z => {
        const baseY = gridToY(z.row);
        const y = baseY + CELL_H / 2;
        const walkBob = z.eating ? 0 : Math.sin(z.animTimer * 0.15) * 3;
        const frozen = z.frozen > 0;

        ctx.save();
        if (frozen) ctx.globalAlpha = 0.85;

        // 身体
        ctx.fillStyle = frozen ? '#80CBC4' : '#558B2F';
        ctx.fillRect(z.x - 10, y - 25 + walkBob, 20, 35);

        // 手臂
        const armAngle = z.eating ? Math.sin(z.animTimer * 0.2) * 0.3 : 0;
        ctx.fillStyle = frozen ? '#A5D6A7' : '#689F38';
        ctx.save();
        ctx.translate(z.x - 10, y - 15 + walkBob);
        ctx.rotate(-0.3 + armAngle);
        ctx.fillRect(-12, 0, 12, 5);
        ctx.restore();
        ctx.save();
        ctx.translate(z.x + 10, y - 15 + walkBob);
        ctx.rotate(0.3 - armAngle);
        ctx.fillRect(0, 0, 12, 5);
        ctx.restore();

        // 头
        ctx.fillStyle = frozen ? '#B2DFDB' : '#7CB342';
        ctx.beginPath();
        ctx.arc(z.x, y - 30 + walkBob, 14, 0, Math.PI * 2);
        ctx.fill();

        // 眼睛
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(z.x - 4, y - 33 + walkBob, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(z.x + 4, y - 33 + walkBob, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = frozen ? '#00695C' : '#B71C1C';
        ctx.beginPath(); ctx.arc(z.x - 3, y - 33 + walkBob, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(z.x + 5, y - 33 + walkBob, 2, 0, Math.PI * 2); ctx.fill();

        // 路障/铁桶
        if (z.type === 'cone') {
            ctx.fillStyle = frozen ? '#80CBC4' : '#FF8F00';
            ctx.beginPath();
            ctx.moveTo(z.x, y - 55 + walkBob);
            ctx.lineTo(z.x - 12, y - 35 + walkBob);
            ctx.lineTo(z.x + 12, y - 35 + walkBob);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#E65100';
            ctx.lineWidth = 1;
            ctx.stroke();
        } else if (z.type === 'bucket') {
            ctx.fillStyle = frozen ? '#B0BEC5' : '#78909C';
            ctx.fillRect(z.x - 12, y - 48 + walkBob, 24, 18);
            ctx.fillStyle = frozen ? '#90A4AE' : '#546E7A';
            ctx.fillRect(z.x - 14, y - 32 + walkBob, 28, 4);
            // 金属光泽
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.fillRect(z.x - 8, y - 46 + walkBob, 4, 14);
        }

        // 腿
        ctx.fillStyle = frozen ? '#80CBC4' : '#33691E';
        const legPhase = z.eating ? 0 : Math.sin(z.animTimer * 0.15) * 5;
        ctx.fillRect(z.x - 8, y + 10 + walkBob, 7, 15 - legPhase);
        ctx.fillRect(z.x + 1, y + 10 + walkBob, 7, 15 + legPhase);

        ctx.restore();

        // 血条
        if (z.hp < z.maxHp) {
            const bw = 30, bh = 3;
            ctx.fillStyle = '#333';
            ctx.fillRect(z.x - bw / 2, y - 50 + walkBob, bw, bh);
            const ratio = Math.max(0, z.hp / z.maxHp);
            ctx.fillStyle = ratio > 0.5 ? '#F44336' : '#B71C1C';
            ctx.fillRect(z.x - bw / 2, y - 50 + walkBob, bw * ratio, bh);
        }
    });
}

function drawProjectiles() {
    game.projectiles.forEach(p => {
        if (p.type === 'snow') {
            ctx.fillStyle = '#4DD0E1';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#E0F7FA';
            ctx.beginPath();
            ctx.arc(p.x - 1, p.y - 1, 3, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = '#66BB6A';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#A5D6A7';
            ctx.beginPath();
            ctx.arc(p.x - 1, p.y - 1, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function drawSuns() {
    game.suns.forEach(s => {
        if (s.collected && s.scale < 0.4) return;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.scale(s.scale, s.scale);
        const glow = Math.sin(s.timer * 0.1) * 2;

        // 光晕
        ctx.fillStyle = 'rgba(255,235,59,0.3)';
        ctx.beginPath();
        ctx.arc(0, 0, 18 + glow, 0, Math.PI * 2);
        ctx.fill();

        // 主体
        ctx.fillStyle = '#FFD600';
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.fill();

        // 光线
        ctx.strokeStyle = '#FFC107';
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + s.timer * 0.03;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
            ctx.lineTo(Math.cos(a) * (18 + glow), Math.sin(a) * (18 + glow));
            ctx.stroke();
        }

        // 内圈
        ctx.fillStyle = '#FFEB3B';
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    });
}

function drawParticles() {
    game.particles.forEach(p => {
        ctx.globalAlpha = p.life / 50;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });
    ctx.globalAlpha = 1;
}

function drawLawnMowers() {
    game.lawnMowers.forEach(lm => {
        if (lm.used && !lm.active) return;
        const y = gridToY(lm.row) + CELL_H / 2;
        ctx.fillStyle = '#D32F2F';
        ctx.fillRect(lm.x, y - 10, 25, 20);
        ctx.fillStyle = '#B71C1C';
        ctx.fillRect(lm.x + 25, y - 6, 8, 12);
        // 轮子
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.arc(lm.x + 8, y + 10, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(lm.x + 20, y + 10, 5, 0, Math.PI * 2); ctx.fill();
    });
}

function drawHUD() {
    // 顶部背景
    ctx.fillStyle = 'rgba(33,33,33,0.9)';
    ctx.fillRect(0, 0, CANVAS_W, GRID_Y - 5);

    // 阳光计数
    ctx.fillStyle = '#FFD600';
    ctx.beginPath();
    ctx.arc(25, 18, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFEB3B';
    ctx.beginPath();
    ctx.arc(25, 18, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(game.sun, 42, 23);

    // 波次信息
    ctx.fillStyle = '#aaa';
    ctx.font = '13px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`波次 ${Math.min(game.wave + 1, game.maxWaves)} / ${game.maxWaves}`, CANVAS_W - 15, 18);
    ctx.fillText(`得分: ${game.score}`, CANVAS_W - 15, 38);

    // 选中植物提示
    if (game.selectedPlant) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = '13px Arial';
        ctx.textAlign = 'center';
        const def = PLANT_TYPES.find(p => p.name === game.selectedPlant);
        ctx.fillText(`点击草坪种植${def.label}`, CANVAS_W / 2, 60);
    }
}

function drawPlantCards() {
    const startX = 75;
    const cardW = 55, cardH = 65;
    const y = 8;

    PLANT_TYPES.forEach((p, i) => {
        const x = startX + i * (cardW + 5);
        const canAfford = game.sun >= p.cost;
        const cooldownDone = game.cardCooldowns[p.name] <= 0;
        const available = canAfford && cooldownDone;
        const selected = game.selectedPlant === p.name;

        // 卡片背景
        ctx.fillStyle = selected ? 'rgba(255,255,255,0.3)' : 'rgba(50,50,50,0.9)';
        ctx.strokeStyle = selected ? '#FFD600' : available ? '#666' : '#333';
        ctx.lineWidth = selected ? 2 : 1;
        roundRect(ctx, x, y, cardW, cardH, 6, true, true);

        // 植物小图标
        ctx.save();
        ctx.translate(x + cardW / 2, y + 28);
        ctx.scale(0.6, 0.6);
        drawPlantSprite(p.name, 0, 0, p.hp, p.hp);
        ctx.restore();

        // 费用
        ctx.fillStyle = canAfford ? '#FFD600' : '#F44336';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(p.cost, x + cardW / 2, y + 58);

        // 冷却遮罩
        if (!cooldownDone) {
            const cdRatio = game.cardCooldowns[p.name] / p.cooldown;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(x, y, cardW, cardH * cdRatio);
        }

        // 不可用遮罩
        if (!canAfford && cooldownDone) {
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(x, y, cardW, cardH);
        }
    });
}

function drawSelectedPlantGhost() {
    if (!game.selectedPlant || !game.mouseCol || !game.mouseRow) return;
    const col = game.mouseCol, row = game.mouseRow;
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
    if (game.grid[row][col]) return;

    const pos = cellCenter(col, row);
    ctx.globalAlpha = 0.5;
    drawPlantSprite(game.selectedPlant, pos.x, pos.y, 999, 999);
    ctx.globalAlpha = 1;
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

// === 输入处理 ===
game.mouseCol = -1;
game.mouseRow = -1;

canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    game.mouseCol = Math.floor((mx - GRID_X) / CELL_W);
    game.mouseRow = Math.floor((my - GRID_Y) / CELL_H);
});

canvas.addEventListener('click', e => {
    if (game.state !== 'playing') return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    // 点击阳光
    for (let i = game.suns.length - 1; i >= 0; i--) {
        const s = game.suns[i];
        if (s.collected) continue;
        const dx = mx - s.x, dy = my - s.y;
        if (dx * dx + dy * dy < 400) {
            s.collected = true;
            return;
        }
    }

    // 点击卡片
    const cardStartX = 75;
    const cardW = 55, cardH = 65;
    const cardY = 8;
    for (let i = 0; i < PLANT_TYPES.length; i++) {
        const cx = cardStartX + i * (cardW + 5);
        if (mx >= cx && mx <= cx + cardW && my >= cardY && my <= cardY + cardH) {
            const p = PLANT_TYPES[i];
            if (game.sun >= p.cost && game.cardCooldowns[p.name] <= 0) {
                game.selectedPlant = game.selectedPlant === p.name ? null : p.name;
            }
            return;
        }
    }

    // 点击草坪种植
    const col = Math.floor((mx - GRID_X) / CELL_W);
    const row = Math.floor((my - GRID_Y) / CELL_H);
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS && game.selectedPlant) {
        if (!game.grid[row][col]) {
            const def = PLANT_TYPES.find(p => p.name === game.selectedPlant);
            if (game.sun >= def.cost) {
                game.sun -= def.cost;
                const plant = createPlant(game.selectedPlant, col, row);
                game.grid[row][col] = plant;
                game.plants.push(plant);
                game.cardCooldowns[game.selectedPlant] = def.cooldown;
                game.selectedPlant = null;
                createParticle(cellCenter(col, row).x, cellCenter(col, row).y, '#81C784', 5);
            }
        }
    } else {
        // 点击空白处取消选择
        game.selectedPlant = null;
    }
});

// 右键取消选择
canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    game.selectedPlant = null;
});

// === 游戏流程 ===
function showEndScreen(won) {
    const endScreen = document.getElementById('endScreen');
    const endMsg = document.getElementById('endMsg');
    const scoreMsg = document.getElementById('scoreMsg');
    endScreen.style.display = 'flex';
    endMsg.textContent = won ? '恭喜你赢了！' : '僵尸入侵了你的花园！';
    endMsg.style.color = won ? '#4CAF50' : '#F44336';
    scoreMsg.textContent = `得分: ${game.score} | 击杀: ${game.zombiesKilled} | 波次: ${game.wave}/${game.maxWaves}`;
}

function startGame() {
    document.getElementById('startScreen').style.display = 'none';
    document.getElementById('endScreen').style.display = 'none';
    initGame();
}

// === 主循环 ===
function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

initGame();
gameLoop();
