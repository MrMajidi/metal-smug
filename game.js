"use strict";
/* ============================================================
   METAL SMUG — vanilla JS engine.
   Every sprite is an animated WebP (chroma-keyed from a GPT
   Image 2.6 GIF). The engine swaps <img> sources per state and
   moves elements; all character animation lives inside the GIFs.
   ============================================================ */

const STAGE_W = 960, STAGE_H = 540, GROUND = 536; // logical units; feet sit at GROUND
const HERO_BODY = 150;                            // hero on-screen body height

/* geometry baked from assets-keyed/assets.json (median content heights
   were normalized to the idle asset during keying) */
const SPRITES = {
  "hero-idle":     { w: 441, h: 471, med: 470.0, total: 1440 },
  "hero-run":      { w: 463, h: 489, med: 470.0, total: 720 },
  "hero-shoot":    { w: 475, h: 470, med: 470.0, total: 1000 },
  "hero-run-shoot":{ w: 513, h: 480, med: 470.0, total: 720 },
  "hero-jump":     { w: 494, h: 614, med: 470.0, total: 1100 },
  "hero-crouch":   { w: 453, h: 481, med: 470.0, total: 1100 },
  "hero-hit":      { w: 458, h: 477, med: 470.0, total: 1000 },
  "hero-death":    { w: 490, h: 511, med: 470.0, total: 1440 },
  "hero-victory":  { w: 451, h: 477, med: 470.0, total: 1320 },
  "hero-grenade":  { w: 477, h: 471, med: 470.0, total: 1100 },
  "grunt-walk":    { w: 275, h: 469, med: 466.5, total: 800 },
  "lobber":        { w: 458, h: 478, med: 410.5, total: 1200 },
  "tank-idle":     { w: 448, h: 407, med: 383.5, total: 1200 },
  "explosion":     { w: 512, h: 503, med: 461.5, total: 1000 },
  "tank-boom":     { w: 508, h: 460, med: 449.0, total: 1320 },
};
const src = n => `assets/${n}.webp`;
/* display height so the sprite's *content* renders bodyH tall */
const dispH = (n, bodyH) => bodyH * SPRITES[n].h / SPRITES[n].med;
const dispW = (n, bodyH) => dispH(n, bodyH) * SPRITES[n].w / SPRITES[n].h;

/* ---------------- DOM ---------------- */
const $ = id => document.getElementById(id);
const stage = $("stage"), layer = $("entities");
const heroImg = document.createElement("img");
heroImg.className = "sprite"; heroImg.alt = "";
let U = 1; // px per logical unit

function fit() {
  const w = Math.min(innerWidth * 0.98, innerHeight * 0.92 * 16 / 9);
  stage.style.width = w + "px";
  stage.style.height = (w * 9 / 16) + "px";
  stage.style.fontSize = (w / 60) + "px"; // 1em = 16 logical px
  U = w / STAGE_W;
}
addEventListener("resize", fit); fit();

function place(el, x, bottomY, h) { // bottomY = logical y of element's bottom edge
  el.style.width = (el._ar * h * U) + "px";
  el.style.height = (h * U) + "px";
  el.style.left = (x * U) + "px";
  el.style.top = ((bottomY - h) * U) + "px";
}
function makeSprite(name, bodyH) {
  const el = document.createElement("img");
  el.className = "sprite"; el.alt = "";
  el._ar = SPRITES[name].w / SPRITES[name].h;
  el._h = dispH(name, bodyH);
  el.src = src(name);
  layer.appendChild(el);
  return el;
}

/* ---------------- audio (tiny WebAudio bleeps) ---------------- */
let AC = null, muted = false;
function audio() { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume(); return AC; }
function tone(f0, f1, dur, type, vol) {
  if (muted || !AC) return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type || "square"; o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  g.gain.setValueAtTime(vol || 0.035, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur);
}
function noiseBurst(dur, vol) {
  if (muted || !AC) return;
  const t = AC.currentTime, len = AC.sampleRate * dur, buf = AC.createBuffer(1, len, AC.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = AC.createBufferSource(); s.buffer = buf;
  const f = AC.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
  const g = AC.createGain(); g.gain.value = vol || 0.12;
  s.connect(f).connect(g).connect(AC.destination); s.start(t);
}
const sfx = {
  shoot() { tone(760, 150, 0.06, "square", 0.02); },
  boom() { noiseBurst(0.35, 0.14); tone(120, 40, 0.3, "sawtooth", 0.05); },
  hit() { tone(210, 70, 0.18, "sawtooth", 0.05); },
  jump() { tone(280, 640, 0.13, "square", 0.025); },
  toss() { tone(500, 900, 0.1, "sine", 0.03); },
  wave() { tone(392, 392, 0.09, "square", 0.03); setTimeout(() => tone(523, 523, 0.12, "square", 0.03), 95); },
  win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, f, 0.16, "square", 0.04), i * 130)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, f * 0.94, 0.2, "triangle", 0.05), i * 150)); },
};

/* ---------------- input ---------------- */
const keys = {};
const KEYMAP = {
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  ArrowDown: "crouch", KeyS: "crouch", ArrowUp: "jump", KeyW: "jump", Space: "jump",
  KeyJ: "fire", KeyZ: "fire", KeyK: "bomb", KeyX: "bomb",
};
addEventListener("keydown", e => {
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === "KeyM") toggleMute();
  if ((e.code === "Enter" || e.code === "Space") && state === "title") startGame();
});
addEventListener("keyup", e => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
document.querySelectorAll("#touch button").forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); keys[k] = true; };
  const off = e => { e.preventDefault(); keys[k] = false; };
  b.addEventListener("pointerdown", on);
  b.addEventListener("pointerup", off);
  b.addEventListener("pointerleave", off);
  b.addEventListener("pointercancel", off);
});
if ("ontouchstart" in window) $("touch").classList.remove("hidden");
function toggleMute() { muted = !muted; $("mute-btn").classList.toggle("muted", muted); }
$("mute-btn").addEventListener("click", () => { audio(); toggleMute(); });

/* ---------------- game state ---------------- */
let state = "title"; // title | playing | over | won
let hero, enemies, bullets, projs, fx, parts;
let score, hearts, bombs, waveIdx, spawnQueue, spawnTimer, boss, raf, lastT;
let heroStateName = "";

const WAVES = [
  { grunts: 5, lobbers: 0 },
  { grunts: 7, lobbers: 1 },
  { grunts: 9, lobbers: 2 },
];

function setHeroSprite(name) {
  if (name === heroStateName) return;
  heroStateName = name;
  heroImg.src = src(name);
  heroImg._ar = SPRITES[name].w / SPRITES[name].h;
  heroImg._h = dispH(name, HERO_BODY);
}
function heroW() { return heroImg._h * heroImg._ar; }

function reset() {
  layer.innerHTML = "";
  layer.appendChild(heroImg);
  hero = { x: 60, vx: 0, jumpT: 0, hitT: 0, invulnT: 0, fireT: 0, bombCd: 0, tossT: 0 };
  enemies = []; bullets = []; projs = []; fx = []; parts = [];
  score = 0; hearts = 3; bombs = 5; waveIdx = 0; boss = null;
  spawnQueue = []; spawnTimer = 0; heroStateName = "";
  setHeroSprite("hero-idle");
  updateHUD();
}

function updateHUD() {
  $("hearts").innerHTML = [0, 1, 2].map(i => `<span class="${i < hearts ? "" : "off"}">♥</span>`).join("");
  $("bombs").textContent = "💣 × " + bombs;
  $("score").textContent = score.toLocaleString("en-US");
  $("wave-label").textContent = boss ? "" : (state === "playing" ? "WAVE " + (waveIdx + 1) + " / 3" : "");
  $("bossbar").classList.toggle("hidden", !boss);
  if (boss) $("bossbar-fill").style.width = Math.max(0, boss.hp / boss.maxHp * 100) + "%";
}
function banner(text, ms) {
  const b = $("banner");
  b.textContent = text; b.classList.remove("hidden");
  b.style.animation = "none"; void b.offsetWidth; b.style.animation = "";
  clearTimeout(banner._t);
  banner._t = setTimeout(() => b.classList.add("hidden"), ms || 1600);
}
function popScore(x, y, txt) {
  const d = document.createElement("div");
  d.className = "pop"; d.textContent = txt;
  d.style.left = (x * U) + "px"; d.style.top = (y * U) + "px"; d.style.fontSize = (20 * U) + "px";
  layer.appendChild(d); setTimeout(() => d.remove(), 820);
}
function explode(x, y, size, sound) {
  const el = makeSprite("explosion", 999); // bodyH unused; set explicit height below
  el._h = size; el._ar = SPRITES["explosion"].w / SPRITES["explosion"].h;
  el.style.zIndex = 20;
  fx.push({ el, x: x - size * el._ar / 2, bottom: y + size / 2, t: SPRITES["explosion"].total });
  if (sound !== false) sfx.boom();
}

/* ---------------- spawning ---------------- */
function startWave(i) {
  waveIdx = i;
  banner("WAVE " + (i + 1)); sfx.wave();
  const w = WAVES[i];
  spawnQueue = [];
  for (let g = 0; g < w.grunts; g++) spawnQueue.push({ type: "grunt", at: 0.6 + g * 1.25 + Math.random() * 0.5 });
  for (let l = 0; l < w.lobbers; l++) spawnQueue.push({ type: "lobber", at: 1.2 + l * 2.2 });
  spawnTimer = 0;
  updateHUD();
}
function spawnGrunt() {
  const bodyH = 140;
  const el = makeSprite("grunt-walk", bodyH);
  const e = { kind: "grunt", el, x: STAGE_W + 20, w: dispW("grunt-walk", bodyH), h: dispH("grunt-walk", bodyH), hp: 1, speed: 52 + Math.random() * 26, dead: 0 };
  el.style.zIndex = 5; enemies.push(e);
}
function spawnLobber(x) {
  const el = makeSprite("lobber", 999);
  el._h = 192; el._ar = SPRITES["lobber"].w / SPRITES["lobber"].h;
  el.style.zIndex = 4;
  const e = { kind: "lobber", el, x, w: 192 * el._ar, h: 192, hp: 2, lobT: 1.4 + Math.random() * 1.2, dead: 0 };
  enemies.push(e);
}
function spawnBoss() {
  banner("⚠ FINAL BOSS ⚠"); sfx.wave();
  const el = makeSprite("tank-idle", 999);
  el._h = 238; el._ar = SPRITES["tank-idle"].w / SPRITES["tank-idle"].h;
  el.style.zIndex = 4;
  boss = { kind: "tank", el, x: STAGE_W + 30, w: 238 * el._ar, h: 238, hp: 30, maxHp: 30, lobT: 2.2, dead: 0 };
  enemies.push(boss);
  updateHUD();
}
function lob(fromX, fromY, shell) {
  const targetX = hero.x + heroW() / 2 + (Math.random() * 70 - 35);
  const T = 1.05 + Math.random() * 0.25, g = 850;
  const el = document.createElement("div");
  el.className = "proj" + (shell ? " shell" : "");
  layer.appendChild(el);
  projs.push({
    el, foe: true, x: fromX, y: fromY,
    vx: (targetX - fromX) / T, vy: (GROUND - 6 - fromY - 0.5 * g * T * T) / T, g,
  });
}

/* ---------------- combat ---------------- */
function killEnemy(e, award) {
  e.dead = 0.45;
  score += award;
  popScore(e.x + e.w / 2 - 16, GROUND - e.h - 8, "+" + award);
  explode(e.x + e.w / 2, GROUND - e.h * 0.45, e.kind === "tank" ? 300 : 130);
  e.el.style.transformOrigin = "50% 92%";
  updateHUD();
}
function heroHit() {
  if (hero.invulnT > 0 || hero.jumpT > 0 || state !== "playing") return;
  hearts--; sfx.hit(); updateHUD();
  if (hearts <= 0) { gameOver(); return; }
  hero.hitT = 0.6; hero.invulnT = 1.3; hero.vx = -190;
  setHeroSprite("hero-hit");
}
function gameOver() {
  state = "over"; setHeroSprite("hero-death"); sfx.lose();
  setTimeout(() => {
    $("end-sprite").src = src("hero-death");
    $("end-title").textContent = "GAME OVER";
    $("end-score").textContent = "Sarge Smug has been humbled. Score: " + score.toLocaleString("en-US");
    $("end-screen").classList.remove("hidden");
  }, 1500);
}
function victory() {
  state = "won"; setHeroSprite("hero-victory"); sfx.win();
  setTimeout(() => {
    $("end-sprite").src = src("hero-victory");
    $("end-title").textContent = "MISSION COMPLETE!";
    $("end-score").textContent = "Still smug. Final score: " + score.toLocaleString("en-US");
    $("end-screen").classList.remove("hidden");
  }, 1450);
}

/* ---------------- main loop ---------------- */
function step(now) {
  raf = requestAnimationFrame(step);
  const dt = Math.min((now - lastT) / 1000, 0.033); lastT = now;
  if (state !== "playing") return;

  /* --- hero timers --- */
  hero.jumpT = Math.max(0, hero.jumpT - dt);
  hero.hitT = Math.max(0, hero.hitT - dt);
  hero.invulnT = Math.max(0, hero.invulnT - dt);
  hero.bombCd = Math.max(0, hero.bombCd - dt);
  hero.tossT = Math.max(0, hero.tossT - dt);

  /* --- movement --- */
  const SPEED = 265;
  let mv = 0;
  if (hero.hitT <= 0 && hero.jumpT <= 0) {
    if (keys.left) mv -= 1;
    if (keys.right) mv += 1;
  }
  hero.x += mv * SPEED * dt + hero.vx * dt;
  hero.vx *= Math.pow(0.0001, dt); // knockback decay
  if (Math.abs(hero.vx) < 2) hero.vx = 0;
  hero.x = Math.max(4, Math.min(STAGE_W - heroW() - 4, hero.x));

  /* --- actions --- */
  const firing = !!keys.fire && hero.hitT <= 0;
  if (keys.jump && hero.jumpT <= 0 && hero.hitT <= 0 && !keys.crouch) {
    hero.jumpT = SPRITES["hero-jump"].total / 1000; sfx.jump();
  }
  if (keys.bomb && bombs > 0 && hero.bombCd <= 0 && hero.hitT <= 0 && hero.jumpT <= 0) {
    bombs--; hero.bombCd = 0.55; hero.tossT = 0.5; sfx.toss(); updateHUD();
    const el = document.createElement("div");
    el.className = "proj"; layer.appendChild(el);
    projs.push({ el, foe: false, x: hero.x + heroW() * 0.55, y: GROUND - 112, vx: 305, vy: -465, g: 920 });
  }
  hero.fireT -= dt;
  if (firing && hero.jumpT <= 0) {
    if (hero.fireT <= 0) {
      hero.fireT = 0.125; sfx.shoot();
      const b = document.createElement("div");
      b.className = "bullet"; layer.appendChild(b);
      bullets.push({ el: b, x: hero.x + heroW() * 0.86, y: GROUND - (keys.crouch ? 62 : 88), vx: 760 });
    }
  }

  /* --- hero sprite state --- */
  if (hero.hitT > 0) setHeroSprite("hero-hit");
  else if (hero.jumpT > 0) setHeroSprite("hero-jump");
  else if (hero.tossT > 0) setHeroSprite("hero-grenade");
  else if (keys.crouch && hero.jumpT <= 0) setHeroSprite("hero-crouch");
  else if (firing) setHeroSprite(mv !== 0 ? "hero-run-shoot" : "hero-shoot");
  else if (mv !== 0) setHeroSprite("hero-run");
  else setHeroSprite("hero-idle");

  heroImg.style.opacity = hero.invulnT > 0 && Math.floor(now / 90) % 2 ? 0.35 : 1;
  place(heroImg, hero.x, GROUND, heroImg._h);

  /* --- spawner / wave flow --- */
  spawnTimer += dt;
  for (let i = spawnQueue.length - 1; i >= 0; i--) {
    if (spawnTimer >= spawnQueue[i].at) {
      const s = spawnQueue.splice(i, 1)[0];
      if (s.type === "grunt") spawnGrunt(); else spawnLobber(838 + Math.random() * 60);
    }
  }
  const fieldClear = enemies.length === 0 && spawnQueue.length === 0;
  if (fieldClear && state === "playing") {
    if (waveIdx < WAVES.length - 1) { bombs += 3; startWave(waveIdx + 1); }
    else if (!boss) spawnBoss();
  }

  /* --- enemies --- */
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead > 0) {
      e.dead -= dt;
      const p = 1 - Math.max(e.dead, 0) / 0.45;
      e.el.style.transform = `rotate(${-82 * p}deg)`;
      e.el.style.opacity = 1 - p;
      if (e.dead <= 0) { e.el.remove(); enemies.splice(i, 1); if (e === boss) boss = null; }
      continue;
    }
    if (e.kind === "grunt") {
      e.x -= e.speed * dt;
      if (e.x < -90) { e.el.remove(); enemies.splice(i, 1); continue; }
      // contact
      if (hero.jumpT <= 0 && e.x < hero.x + heroW() * 0.72 && e.x + e.w > hero.x + heroW() * 0.2) heroHit();
    } else if (e.kind === "lobber") {
      e.lobT -= dt;
      if (e.lobT <= 0) { e.lobT = 2.6 + Math.random() * 0.9; lob(e.x + 26, GROUND - 168, false); }
    } else if (e.kind === "tank") {
      if (e.x > 578) e.x -= 13 * dt;
      e.lobT -= dt;
      if (e.lobT <= 0 && e.x < STAGE_W) { e.lobT = 2.3; lob(e.x + 40, GROUND - 205, true); }
      if (hero.jumpT <= 0 && e.x < hero.x + heroW() * 0.8 && e.x + e.w > hero.x + heroW() * 0.15) heroHit();
    }
    place(e.el, e.x, GROUND, e.h);
  }

  /* --- bullets --- */
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    let hit = null;
    for (const e of enemies) {
      if (e.dead > 0) continue;
      if (b.x > e.x + 6 && b.x < e.x + e.w - 2 && b.y > GROUND - e.h && b.y < GROUND - 6) { hit = e; break; }
    }
    if (hit) {
      hit.hp--;
      if (hit.hp <= 0) {
        if (hit.kind === "tank") {
          score += 1000; popScore(hit.x + hit.w / 2 - 30, GROUND - hit.h - 14, "+1000");
          const boom = makeSprite("tank-boom", 999);
          boom._h = 305; boom._ar = SPRITES["tank-boom"].w / SPRITES["tank-boom"].h;
          boom.style.zIndex = 22;
          fx.push({ el: boom, x: hit.x + hit.w / 2 - 305 * boom._ar / 2, bottom: GROUND + 128, t: SPRITES["tank-boom"].total });
          sfx.boom();
          hit.el.remove(); enemies.splice(enemies.indexOf(hit), 1); boss = null;
          updateHUD(); victory();
        } else killEnemy(hit, hit.kind === "lobber" ? 150 : 100);
      } else if (hit.kind === "tank") updateHUD();
      b.el.remove(); bullets.splice(i, 1); continue;
    }
    if (b.x > STAGE_W + 30) { b.el.remove(); bullets.splice(i, 1); continue; }
    b.el.style.left = (b.x * U) + "px"; b.el.style.top = (b.y * U) + "px"; b.el.style.width = (13 * U) + "px";
  }

  /* --- projectiles --- */
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i];
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    let boomAt = null;
    if (p.y >= GROUND - 8) boomAt = { x: p.x, y: GROUND };
    if (!p.foe) { // hero grenade: proximity fuse
      for (const e of enemies) {
        if (e.dead > 0) continue;
        const cx = e.x + e.w / 2, cy = GROUND - e.h / 2;
        if (Math.hypot(p.x - cx, p.y - cy) < 58) { boomAt = { x: p.x, y: p.y + 20 }; break; }
      }
    }
    if (boomAt) {
      explode(boomAt.x, boomAt.y - 8, p.foe ? 118 : 185);
      if (p.foe) {
        if (Math.abs(hero.x + heroW() / 2 - boomAt.x) < 64) heroHit();
      } else {
        for (const e of [...enemies]) {
          if (e.dead > 0) continue;
          if (Math.abs(e.x + e.w / 2 - boomAt.x) < 108) {
            if (e.kind === "tank") {
              e.hp -= 5; updateHUD();
              if (e.hp <= 0) { // route through the same death as bullets
                score += 1000; updateHUD();
                const boomEl = makeSprite("tank-boom", 999);
                boomEl._h = 305; boomEl._ar = SPRITES["tank-boom"].w / SPRITES["tank-boom"].h;
                boomEl.style.zIndex = 22;
                fx.push({ el: boomEl, x: e.x + e.w / 2 - 305 * boomEl._ar / 2, bottom: GROUND + 128, t: SPRITES["tank-boom"].total });
                e.el.remove(); enemies.splice(enemies.indexOf(e), 1); boss = null; victory();
              }
            } else killEnemy(e, e.kind === "lobber" ? 150 : 100);
          }
        }
      }
      p.el.remove(); projs.splice(i, 1); continue;
    }
    const s = (p.foe ? 15 : 16) * U;
    p.el.style.width = s + "px"; p.el.style.height = s + "px";
    p.el.style.left = ((p.x - 8) * U) + "px"; p.el.style.top = ((p.y - 8) * U) + "px";
  }

  /* --- fx --- */
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.t -= dt * 1000;
    place(f.el, f.x, f.bottom, f.el._h);
    if (f.t <= 0) { f.el.remove(); fx.splice(i, 1); }
  }
}

/* ---------------- flow ---------------- */
function startGame() {
  audio();
  $("title-screen").classList.add("hidden");
  $("end-screen").classList.add("hidden");
  $("hud").classList.remove("hidden");
  reset();
  state = "playing";
  startWave(0);
}
$("start-btn").addEventListener("click", startGame);
$("restart-btn").addEventListener("click", startGame);

/* preload sprites, then enable start */
(function preload() {
  const names = Object.keys(SPRITES).concat(["hero-master"]);
  let done = 0;
  names.forEach(n => {
    const im = new Image();
    im.onload = im.onerror = () => {
      if (++done === names.length) {
        $("load-note").textContent = "sprites loaded — good to go";
        $("start-btn").disabled = false;
      }
    };
    im.src = src(n);
  });
  $("start-btn").disabled = true;
})();

reset(); // sets up the title-screen hero behind the overlay
lastT = performance.now();
raf = requestAnimationFrame(step);
