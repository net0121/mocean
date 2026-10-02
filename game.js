(function(){
"use strict";

/* ============================= PIXI SETUP ============================= */

const app = new PIXI.Application({
  resizeTo: window,
  backgroundAlpha: 0,
  antialias: true,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2)
});
document.getElementById('pixi-root').appendChild(app.view);

const skyG = new PIXI.Graphics();
const world = new PIXI.Container();
const terrainG = new PIXI.Graphics();
const surfaceG = new PIXI.Graphics();
const bubblesG = new PIXI.Graphics();
const splashG = new PIXI.Graphics();
const creaturesLayer = new PIXI.Container();
const waterOverlayG = new PIXI.Graphics();

app.stage.addChild(skyG);
app.stage.addChild(world);
world.addChild(terrainG);
world.addChild(bubblesG);
world.addChild(creaturesLayer);
world.addChild(surfaceG);
world.addChild(splashG);
app.stage.addChild(waterOverlayG);

const playerG = new PIXI.Graphics();
app.stage.addChild(playerG);
app.stage.eventMode = 'static';

/* ============================= HELPERS ============================= */

function rand(a,b){ return a + Math.random()*(b-a); }
function randi(a,b){ return Math.floor(rand(a,b+1)); }
function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
function dist2(ax,ay,bx,by){ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; }
function lerp(a,b,t){ return a + (b-a)*t; }
function lerpAngle(a,b,t){
  let diff = ((b - a + Math.PI) % (Math.PI*2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI*2;
  return a + diff*t;
}
function hash(n){
  const x = Math.sin(n*127.1)*43758.5453123;
  return x - Math.floor(x);
}
function lerpColor(c1,c2,t){
  return [
    Math.round(lerp(c1[0],c2[0],t)),
    Math.round(lerp(c1[1],c2[1],t)),
    Math.round(lerp(c1[2],c2[2],t))
  ];
}
function rgbToHex(c){ return (c[0]<<16) + (c[1]<<8) + c[2]; }
function rgbToCss(c){ return `rgb(${c[0]},${c[1]},${c[2]})`; }

const ROUND = { cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND };

/* ============================= WORLD ============================= */

const SURFACE_Y = 0;
const WORLD_TOP_MARGIN = 40;
const AIR_HEIGHT = 600;
const AIR_TOP = SURFACE_Y - AIR_HEIGHT;
const GRAVITY = 0.15;
const FLIP_SPEED_THRESHOLD = 0.8;

const CYCLE_DURATION = 120000;
const CLOCK_START = 9/24;   // the game begins at 09:00
// 0..1 through the day, 0 = midnight, 0.5 = noon
function getCycleTime(now){
  return ((now + CYCLE_DURATION*CLOCK_START) % CYCLE_DURATION) / CYCLE_DURATION;
}
// 0 = dead of night, 1 = high noon
function getDaylight(now){
  return 0.5 - 0.5*Math.cos(getCycleTime(now)*Math.PI*2);
}

function floorY(x){
  return 8000
    + Math.sin(x*0.008)*40
    + Math.sin(x*0.021+3)*22
    + Math.sin(x*0.05+7)*9;
}

// Water is always noticeably darker than the sky above it, and gets darker quickly with depth
const DEPTH_STOPS = [
  {stop:0.00, color:[30,120,168]},
  {stop:0.06, color:[22,98,146]},
  {stop:0.15, color:[14,70,116]},
  {stop:0.32, color:[9,46,84]},
  {stop:0.55, color:[5,28,56]},
  {stop:0.80, color:[3,14,32]},
  {stop:1.00, color:[1,6,14]}
];

const SKY_DAY_TOP    = [82,168,232];
const SKY_DAY_HOR    = [176,226,247];
const SKY_DUSK_TOP   = [62,70,140];
const SKY_DUSK_HOR   = [250,160,120];
const SKY_NIGHT_TOP  = [4,8,24];
const SKY_NIGHT_HOR  = [30,42,82];
const SKY_HEIGHT     = 1400;
function colorAtDepthFraction(f){
  f = clamp(f,0,1);
  for(let i=0;i<DEPTH_STOPS.length-1;i++){
    const a = DEPTH_STOPS[i], b = DEPTH_STOPS[i+1];
    if(f>=a.stop && f<=b.stop){
      const t = (f-a.stop)/(b.stop-a.stop || 1);
      return lerpColor(a.color,b.color,t);
    }
  }
  return DEPTH_STOPS[DEPTH_STOPS.length-1].color;
}

/* ============================= DEBUG MODE ============================= */

let debugMode = false;
const debugDisplay = document.createElement('div');
debugDisplay.id = 'debug-display';
debugDisplay.style.cssText = `
  position: fixed;
  top: 190px;
  left: 14px;
  background: rgba(0,0,0,0.85);
  color: #0f0;
  font-family: 'Roboto Mono', monospace;
  font-size: 12px;
  padding: 12px;
  border: 1px solid #0f0;
  border-radius: 4px;
  pointer-events: none;
  user-select: none;
  z-index: 100;
  line-height: 1.6;
  display: none;
`;
document.body.appendChild(debugDisplay);

window.addEventListener('keydown', (e)=>{
  if(e.key === 'Tab' && gameStarted && !commandOpen){
    e.preventDefault();
    debugMode = !debugMode;
    debugDisplay.style.display = debugMode ? 'block' : 'none';
  }
});

function updateDebugDisplay(){
  if(!debugMode) return;
  const cycleTime = getCycleTime(performance.now());
  const brightness = getDaylight(performance.now());
  const timeOfDay = brightness >= 0.5 ? 'DAY' : 'NIGHT';
  debugDisplay.innerHTML = `
    X: ${Math.round(player.x)}<br>
    Y: ${Math.round(player.y)}<br>
    VX: ${player.vx.toFixed(2)}<br>
    VY: ${player.vy.toFixed(2)}<br>
    Depth: ${Math.max(0, Math.round((player.y - SURFACE_Y)/8))}m<br>
    <br>
    Time: ${timeOfDay}<br>
    Cycle: ${(cycleTime*100).toFixed(1)}%<br>
    Daylight: ${(brightness*100).toFixed(1)}%<br>
    <br>
    Level: ${progress.level}<br>
    XP: ${progress.xp} / ${xpNeeded(progress.level)}
  `;
}

/* ============================= GAME / UI STATE ============================= */

let gameStarted = false;
let commandOpen = false;

/* ============================= INPUT ============================= */

const keys = { up:false, down:false, left:false, right:false, space:false };

const instructionsEl = document.getElementById('instructions');
function hideInstructions(){ instructionsEl.classList.add('hide'); }
// After the first input, keep the hint up a little longer so it can actually be read
let hintHideTimer = null;
function scheduleHideInstructions(ms){
  if(hintHideTimer) return;
  hintHideTimer = setTimeout(hideInstructions, ms);
}

window.addEventListener('keydown', (e)=>{
  if(commandOpen) return;
  if(gameStarted && e.key === '/'){
    e.preventDefault();
    openCommandPrompt();
    return;
  }
  if(!gameStarted) return;
  if(dungeons.handleKey(e)){ e.preventDefault(); return; }
  switch(e.key){
    case 'ArrowUp': keys.up=true; e.preventDefault(); break;
    case 'ArrowDown': keys.down=true; e.preventDefault(); break;
    case 'ArrowLeft': keys.left=true; e.preventDefault(); break;
    case 'ArrowRight': keys.right=true; e.preventDefault(); break;
    case ' ': keys.space=true; if(!e.repeat) tryJump(); e.preventDefault(); break;
  }
  scheduleHideInstructions(8000);
}, {passive:false});

window.addEventListener('keyup', (e)=>{
  if(commandOpen || !gameStarted) return;
  switch(e.key){
    case 'ArrowUp': keys.up=false; break;
    case 'ArrowDown': keys.down=false; break;
    case 'ArrowLeft': keys.left=false; break;
    case 'ArrowRight': keys.right=false; break;
    case ' ': keys.space=false; break;
  }
});

/* ============================= DRAG-BASED TOUCH CONTROLS ============================= */

const touchArea = document.getElementById('touch-area');
let touchActive = false;
let touchStartX = 0, touchStartY = 0;
let touchCurrentX = 0, touchCurrentY = 0;
let touchKnob = null;

function createTouchKnob(){
  const knob = document.createElement('div');
  knob.className = 'touch-knob';
  document.body.appendChild(knob);
  return knob;
}

function updateTouchKnob(){
  if(!touchKnob) touchKnob = createTouchKnob();
  if(touchActive){
    const rect = touchArea.getBoundingClientRect();
    const centerX = rect.left + rect.width/2;
    const centerY = rect.top + rect.height/2;
    const dx = touchCurrentX - touchStartX;
    const dy = touchCurrentY - touchStartY;
    const maxDist = 60;
    const dist = Math.min(Math.hypot(dx, dy), maxDist);
    const angle = Math.atan2(dy, dx);
    const knobX = centerX + Math.cos(angle) * dist;
    const knobY = centerY + Math.sin(angle) * dist;
    touchKnob.style.left = knobX + 'px';
    touchKnob.style.top = knobY + 'px';
    touchKnob.style.opacity = '1';
  } else {
    touchKnob.style.opacity = '0';
  }
}

function handleTouchStart(e){
  if(!gameStarted) return;
  e.preventDefault();
  const touch = e.touches[0];
  touchActive = true;
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  touchCurrentX = touch.clientX;
  touchCurrentY = touch.clientY;
  scheduleHideInstructions(8000);
  updateTouchKnob();
}

function handleTouchMove(e){
  if(!touchActive) return;
  e.preventDefault();
  const touch = e.touches[0];
  touchCurrentX = touch.clientX;
  touchCurrentY = touch.clientY;
  updateTouchKnob();
}

function handleTouchEnd(e){
  touchActive = false;
  updateTouchKnob();
}

const jumpButtonEl = document.getElementById('jump-button');
if(jumpButtonEl){
  jumpButtonEl.addEventListener('pointerdown', (e)=>{ e.preventDefault(); tryJump(); });
}

touchArea.addEventListener('touchstart', handleTouchStart, {passive:false});
touchArea.addEventListener('touchmove', handleTouchMove, {passive:false});
touchArea.addEventListener('touchend', handleTouchEnd, {passive:false});
touchArea.addEventListener('touchcancel', handleTouchEnd, {passive:false});

function updateTouchInput(){
  if(!touchActive) return;
  const dx = touchCurrentX - touchStartX;
  const dy = touchCurrentY - touchStartY;
  const threshold = 12;
  keys.left = dx < -threshold;
  keys.right = dx > threshold;
  keys.up = dy < -threshold;
  keys.down = dy > threshold;
}

/* ============================= CREATURE HOVER TOOLTIP ============================= */

const tooltipEl = document.getElementById('creature-tooltip');
const mouseScreen = { x: 0, y: 0 };
let hoverLabel = null;

window.addEventListener('pointermove', (e)=>{
  mouseScreen.x = e.clientX;
  mouseScreen.y = e.clientY;
  if(hoverLabel) positionTooltip();
});

function positionTooltip(){
  tooltipEl.style.left = mouseScreen.x + 'px';
  tooltipEl.style.top = (mouseScreen.y + 20) + 'px';
}

function showHoverLabel(label){
  hoverLabel = label;
  tooltipEl.textContent = label;
  tooltipEl.style.display = 'block';
  positionTooltip();
}

function hideHoverLabel(label){
  if(hoverLabel === label || label === undefined) hoverLabel = null;
  if(!hoverLabel) tooltipEl.style.display = 'none';
}

function attachHoverLabel(g, label, hitRadius){
  g.eventMode = 'static';
  g.cursor = 'pointer';
  g.hitArea = new PIXI.Circle(0, 0, hitRadius);
  g.on('pointerover', ()=> showHoverLabel(label));
  g.on('pointerout', ()=> hideHoverLabel(label));
}


/* ============================= PLAYER ============================= */

const JUMP_POWER = 13;      // upward launch speed when pressing Space underwater
const JUMP_COOLDOWN = 55;   // frames (~0.9s)
const JUMP_BOOST_FRAMES = 22;

const player = {
  x: 300, y: 900,
  vx: 0, vy: 0,
  angle: 0, displayAngle: 0,
  tailPhase: 0,
  size: 20,
  maxSpeed: 9.0,
  accel: 0.55,
  drag: 0.94,
  bob: 0,
  bank: 0,
  inAir: false,
  flipping: false,
  flipProgress: 0,
  flipDir: 1,
  flipXP: 0,
  flipCounts: true,
  jumpCd: 0,
  boost: 0,
  chomp: 0
};
const PLAYER_COLORS = { body:0xff9d5c, fin:0xffd194 };

function tryJump(){
  if(dungeons.active){ dungeons.fire(); return; }   // inside caves the jump key shoots bubbles
  if(!gameStarted || commandOpen) return;
  if(player.y < SURFACE_Y) return;       // already airborne
  if(player.jumpCd > 0) return;
  player.vy = -JUMP_POWER;
  player.boost = JUMP_BOOST_FRAMES;
  player.jumpCd = JUMP_COOLDOWN;
  burstBubbles(player.x, player.y + player.size*0.5, 10);
  playBlip();
  scheduleHideInstructions(8000);
}

function updatePlayer(dt){
  if(dungeons.active) return dungeons.updatePlayer(dt);   // inside a cave (see dungeons.js)
  const wasUnderwater = player.y >= SURFACE_Y;

  if(player.jumpCd > 0) player.jumpCd -= dt;
  if(player.boost > 0) player.boost -= dt;
  player.chomp *= Math.pow(0.85, dt);

  let ax = 0, ay = 0;
  if(gameStarted){
    if(keys.left) ax -= player.accel;
    if(keys.right) ax += player.accel;
    if(keys.up) ay -= player.accel;
    if(keys.down) ay += player.accel;
  } else {
    const t = performance.now()*0.00006;
    const idleAccel = 0.34;
    ax = Math.sin(t)*idleAccel*0.35;
    ay = Math.cos(t*0.7)*idleAccel*0.22;
  }

  const abilitySpeed = dungeons.speedMul();   // shapeshift form + dash
  ax *= abilitySpeed; ay *= abilitySpeed;
  if(ax !== 0 && ay !== 0){ ax *= 0.78; ay *= 0.78; }

  const inAir = player.y < SURFACE_Y;

  if(inAir){
    ax *= 0.45;
    ay = ay*0.25 + GRAVITY*dungeons.gravityMul();   // Sea Wings glide
  }

  player.vx += ax * dt;
  player.vy += ay * dt;

  if(inAir){
    player.vx *= Math.pow(0.995, dt);
  } else {
    // While a jump is charging out of the water, vertical drag is almost off
    const vDrag = player.boost > 0 ? 0.985 : player.drag;
    player.vx *= Math.pow(player.drag, dt);
    player.vy *= Math.pow(vDrag, dt);
  }

  const rawSpeed = Math.hypot(player.vx, player.vy);
  let maxS = player.maxSpeed * abilitySpeed;
  if(inAir) maxS = player.maxSpeed*1.8;
  else if(player.boost > 0) maxS = Math.max(maxS, JUMP_POWER*1.05);
  if(rawSpeed > maxS){
    const k = maxS / rawSpeed;
    player.vx *= k; player.vy *= k;
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  if(player.y < AIR_TOP){ player.y = AIR_TOP; if(player.vy < 0) player.vy = 0; }

  // seafloor collision: rest on the sand and slide along slopes instead of sinking through
  const floorLimit = floorY(player.x) - player.size*dungeons.look().size*0.6;
  if(player.y > floorLimit){
    const slope = (floorY(player.x + 4) - floorY(player.x - 4)) / 8;
    player.y = floorLimit;
    if(player.vy > 0) player.vy = 0;
    if(slope * player.vx > 0) player.vx *= Math.pow(0.9, dt);   // uphill scrape slows you
  }

  const nowUnderwater = player.y >= SURFACE_Y;

  if(wasUnderwater !== nowUnderwater){
    spawnSplash(player.x, SURFACE_Y);
    if(wasUnderwater && !nowUnderwater && player.vy < -FLIP_SPEED_THRESHOLD && !player.flipping){
      player.flipping = true;
      player.flipProgress = 0;
      player.flipDir = player.vx >= 0 ? 1 : -1;
      player.flipCounts = true;
      // faster breach = bigger flip reward
      player.flipXP = 10 + Math.round(clamp(-player.vy, 0, 16));
    }
  }

  const speed = Math.hypot(player.vx, player.vy);
  if(speed > 0.08 && !player.flipping){ player.angle = Math.atan2(player.vy, player.vx); }
  player.displayAngle = lerpAngle(player.displayAngle, player.angle, 0.12*dt);

  if(player.flipping){
    const flipRate = 0.07 * (1 + Math.min(speed/player.maxSpeed, 1.4));
    player.flipProgress += dt * flipRate;
    if(player.flipProgress >= 1){
      player.flipping = false;
      player.flipProgress = 0;
      player.angle = Math.atan2(player.vy, player.vx);
      player.displayAngle = player.angle;
      if(player.flipCounts) awardFlip(player.flipXP);
      player.flipCounts = true;
    }
  }

  const angleDiff = ((player.angle - player.displayAngle + Math.PI) % (Math.PI*2)) - Math.PI;
  player.bank = clamp(angleDiff * 1.8, -1, 1);

  const moveFactor = 0.5 + Math.min(speed/player.maxSpeed, 1)*1.85;
  player.tailPhase += 0.155*dt*moveFactor*2.2;
  player.bob = inAir ? 0 : Math.sin(performance.now()*0.0025)*1.6;
  player.inAir = inAir;

  return speed;
}

/* ============================= PROGRESSION (XP / LEVELS) ============================= */

const SAVE_KEY = 'mocean.progress.v1';
const progress = { level: 1, xp: 0 };

function xpNeeded(level){ return Math.floor(30 * Math.pow(level, 1.35)); }

function applyLevelStats(){
  // The fish grows a little with every level (capped)
  player.size = 20 + Math.min(progress.level - 1, 15) * 0.8;
}

function saveProgress(){
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); }catch(err){}
}

function loadProgress(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return;
    const d = JSON.parse(raw);
    if(Number.isFinite(d.level) && d.level >= 1){
      progress.level = Math.min(99, Math.floor(d.level));
      progress.xp = clamp(Math.floor(d.xp || 0), 0, xpNeeded(progress.level) - 1);
    }
  }catch(err){}
}

const levelValEl = document.getElementById('levelVal');
const xpTextEl = document.getElementById('xpText');
const xpFillEl = document.getElementById('xpFill');
const levelBannerEl = document.getElementById('levelup-banner');
const levelBannerNumEl = document.getElementById('luLevel');

function updateXPUI(){
  const need = xpNeeded(progress.level);
  levelValEl.textContent = progress.level;
  xpTextEl.textContent = `${progress.xp} / ${need} XP`;
  xpFillEl.style.width = (progress.xp / need * 100).toFixed(1) + '%';
}

function popText(text, cls){
  const el = document.createElement('div');
  el.className = 'xp-pop' + (cls ? ' ' + cls : '');
  el.textContent = text;
  el.style.left = (app.screen.width/2 + rand(-26,26)) + 'px';
  el.style.top = (app.screen.height/2 - 46 - player.size) + 'px';
  document.body.appendChild(el);
  setTimeout(()=> el.remove(), 1200);
}

// Merge rapid-fire gains (e.g. swimming through a school) into one popup
let popAcc = 0, popLabel = '', popTimer = null;
function queueXPPop(amount, label){
  popAcc += amount;
  if(label) popLabel = label;
  if(popTimer) return;
  popTimer = setTimeout(()=>{
    popText(`+${popAcc} XP` + (popLabel ? `  ${popLabel}` : ''), popLabel ? 'flip' : '');
    popAcc = 0; popLabel = ''; popTimer = null;
  }, 200);
}

function showLevelUp(){
  levelBannerNumEl.textContent = progress.level;
  levelBannerEl.classList.remove('show');
  void levelBannerEl.offsetWidth;       // restart the animation
  levelBannerEl.classList.add('show');
  burstBubbles(player.x, player.y, 22);
  playLevelUp();
}

function addXP(amount, label){
  if(!(amount > 0)) return;
  progress.xp += amount;
  let leveled = false;
  while(progress.xp >= xpNeeded(progress.level)){
    progress.xp -= xpNeeded(progress.level);
    progress.level++;
    leveled = true;
  }
  if(leveled){ applyLevelStats(); showLevelUp(); }
  queueXPPop(amount, label);
  updateXPUI();
  saveProgress();
}

function awardFlip(xp){ addXP(xp, 'Flip!'); }

function resetProgress(){
  progress.level = 1; progress.xp = 0;
  applyLevelStats(); updateXPUI(); saveProgress();
}

/* ---- eating ---- */

// Fish the player can eat, the XP they give, and the level needed to swallow them
const EDIBLE = {
  school:     { xp: 6,  minLevel: 1 },
  parrotfish: { xp: 14, minLevel: 2 },
  seahorse:   { xp: 12, minLevel: 2 },
  lionfish:   { xp: 18, minLevel: 3 },
  pufferfish: { xp: 22, minLevel: 3 },
  blobfish:   { xp: 32, minLevel: 5 },
  oarfish:    { xp: 45, minLevel: 7 },
  swordfish:  { xp: 70, minLevel: 9 }
};

let lastTooBigMsg = 0;
function tooBigMessage(minLevel){
  const now = performance.now();
  if(now - lastTooBigMsg < 1400) return;
  lastTooBigMsg = now;
  popText(`Need level ${minLevel}`, 'warn');
}

function eatenEffect(x, y, xp){
  burstBubbles(x, y, 6);
  player.chomp = 1;
  hideHoverLabel();
  playBlip();
  addXP(xp);
}

function checkEating(){
  if(!gameStarted || player.y < SURFACE_Y + 6) return;

  const formSize = player.size * dungeons.look().size;
  const effLevel = progress.level + dungeons.levelBonus();   // shark form eats bigger fish
  const mouthX = player.x + Math.cos(player.displayAngle)*formSize*0.55;
  const mouthY = player.y + Math.sin(player.displayAngle)*formSize*0.55;
  const reach = formSize*0.85;

  // schools of small fish (each member is eaten individually)
  const school = EDIBLE.school;
  for(let si = schools.length - 1; si >= 0; si--){
    const sc = schools[si];
    const roughR = reach + 70;
    if(dist2(sc.x, sc.y, mouthX, mouthY) > roughR*roughR) continue;
    for(let mi = sc.members.length - 1; mi >= 0; mi--){
      const m = sc.members[mi];
      const rr = reach + m.size*0.8;
      if(dist2(m.g.x, m.g.y, mouthX, mouthY) < rr*rr){
        if(effLevel < school.minLevel){ tooBigMessage(school.minLevel); continue; }
        eatenEffect(m.g.x, m.g.y, school.xp);
        creaturesLayer.removeChild(m.g);
        m.g.destroy();
        sc.members.splice(mi, 1);
      }
    }
    if(sc.members.length === 0) schools.splice(si, 1);
  }

  // individual fish
  for(let i = npcs.length - 1; i >= 0; i--){
    const n = npcs[i];
    const def = EDIBLE[n.type];
    if(!def) continue;
    const rr = reach + n.size*0.7;
    if(dist2(n.x, n.y, mouthX, mouthY) < rr*rr){
      if(effLevel < def.minLevel){ tooBigMessage(def.minLevel); continue; }
      eatenEffect(n.x, n.y, def.xp);
      destroyNpc(n);
      npcs.splice(i, 1);
    }
  }
}

loadProgress();
applyLevelStats();
updateXPUI();

/* ============================= BUBBLES ============================= */

let bubbles = [];
function spawnBubble(nearPlayer){
  const x = nearPlayer
    ? player.x + rand(-app.screen.width*0.6, app.screen.width*0.6)
    : player.x + rand(-app.screen.width, app.screen.width);
  bubbles.push({
    x, y: floorY(x) - rand(0,20),
    r: rand(1.5, 5.5),
    speed: rand(0.4,1.3),
    wobble: rand(0,Math.PI*2),
    bright: nearPlayer
  });
  if(bubbles.length > 140) bubbles.shift();
}

function updateBubbles(dt){
  for(const b of bubbles){
    b.y -= b.speed*dt;
    b.x += Math.sin(performance.now()*0.001 + b.wobble)*0.15*dt;
  }
  bubbles = bubbles.filter(b => b.y > SURFACE_Y - 30);
}

function redrawBubbles(){
  bubblesG.clear();
  for(const b of bubbles){
    bubblesG.lineStyle(1.2, 0xdff6ff, b.bright ? 0.55 : 0.22);
    bubblesG.drawCircle(b.x, b.y, b.r);
  }
}

/* ============================= SURFACE SPLASHES ============================= */

let splashes = [];
function spawnSplash(x, y){
  splashes.push({ x, y, t: 0, life: 30 });
  for(let i=0;i<9;i++){
    bubbles.push({
      x: x + rand(-12,12),
      y: y - rand(0,8),
      r: rand(1,3.2),
      speed: rand(0.7,2.0),
      wobble: rand(0,Math.PI*2),
      bright: true
    });
  }
}

function burstBubbles(x, y, count){
  for(let i=0;i<count;i++){
    bubbles.push({
      x: x + rand(-14,14),
      y: y + rand(-10,10),
      r: rand(1.2,3.6),
      speed: rand(0.8,2.2),
      wobble: rand(0,Math.PI*2),
      bright: true
    });
  }
  if(bubbles.length > 200) bubbles.splice(0, bubbles.length - 200);
}

function updateSplashes(dt){
  for(const sp of splashes) sp.t += dt;
  splashes = splashes.filter(sp => sp.t < sp.life);
}

function redrawSplashes(){
  splashG.clear();
  for(const sp of splashes){
    const f = sp.t / sp.life;
    const r = 6 + f*36;
    splashG.lineStyle(2, 0xffffff, (1-f)*0.55);
    splashG.drawEllipse(sp.x, sp.y, r, r*0.32);
  }
}

/* ============================= CREATURES (see fish.js) ============================= */

const Fish = MoceanFish({
  creaturesLayer, rand, randi, clamp, lerp, lerpAngle, ROUND,
  WORLD_TOP_MARGIN, floorY, attachHoverLabel,
  get options(){ return options; }
});
const {
  drawFishShape, SHARK_COLORS, schools, spawnSchool, updateSchool, destroySchool, spawnJellyfish, updateJelly, spawnCrab, updateCrab, spawnTurtle, updateTurtle, spawnShark, updateShark, spawnOctopus, updateOctopus, spawnSeahorse, updateSeahorse, spawnStingray, updateStingray, spawnEel, updateEel, spawnStarfish, updateStarfish, spawnSeaUrchin, updateSeaUrchin, spawnPufferfish, updatePufferfish, spawnMantaRay, updateMantaRay, spawnSquid, updateSquid, spawnAnglerfish, updateAnglerfish, spawnNarwhal, updateNarwhal, spawnHammerhead, updateHammerhead, spawnIsopod, updateIsopod, spawnLionfish, updateLionfish, spawnCuttlefish, updateCuttlefish, spawnParrotfish, updateParrotfish, spawnBlobfish, updateBlobfish, spawnSeaDragon, updateSeaDragon, spawnWhale, updateWhale, spawnDolphin, updateDolphin, spawnSwordfish, updateSwordfish, spawnNautilus, updateNautilus, spawnSeaSnake, updateSeaSnake, spawnSunfish, updateSunfish, spawnDumboOctopus, updateDumboOctopus, spawnGoblinShark, updateGoblinShark, spawnOarfish, updateOarfish, spawnManatee, updateManatee
} = Fish;

/* ============================= NPC MANAGER ============================= */

let npcs = [];
const SPAWN_RADIUS_MIN = 700;
const SPAWN_RADIUS_MAX = 1300;
const DESPAWN_RADIUS = 2100;
const MAX_NPCS = 120;
const MAX_SCHOOLS = 12;

let spawnTimer = 0;

function totalCreatureCount(){
  let n = npcs.length;
  for(const s of schools) n += s.members.length;
  return n;
}

function trySpawn(dt){
  spawnTimer -= dt;
  if(spawnTimer > 0) return;
  const spawnRateMult = options.difficulty === 'hard' ? 1.4 : (options.difficulty === 'peaceful' ? 0.75 : 1);
  spawnTimer = rand(30,90) / spawnRateMult;
  if(totalCreatureCount() >= MAX_NPCS) return;

  const angle = rand(0, Math.PI*2);
  const d = rand(SPAWN_RADIUS_MIN, SPAWN_RADIUS_MAX);
  let x = player.x + Math.cos(angle)*d;
  let y = clamp(player.y + Math.sin(angle)*d, WORLD_TOP_MARGIN+40, 7500);

  const r = Math.random();
  if(r < 0.18 && schools.length < MAX_SCHOOLS){
    spawnSchool(x,y);
  } else if(r < 0.24){
    npcs.push(spawnJellyfish(x, clamp(y, WORLD_TOP_MARGIN+60, 7000)));
  } else if(r < 0.29){
    npcs.push(spawnCrab(x));
  } else if(r < 0.34){
    npcs.push(spawnTurtle(x,y));
  } else if(r < 0.39){
    npcs.push(spawnOctopus(x,y));
  } else if(r < 0.43){
    npcs.push(spawnSeahorse(x,y));
  } else if(r < 0.47){
    npcs.push(spawnStingray(x,y));
  } else if(r < 0.51){
    npcs.push(spawnEel(x, clamp(y, WORLD_TOP_MARGIN+40, 7500)));
  } else if(r < 0.55){
    npcs.push(spawnStarfish(x));
  } else if(r < 0.59){
    npcs.push(spawnSeaUrchin(x, y));
  } else if(r < 0.63){
    npcs.push(spawnPufferfish(x, y));
  } else if(r < 0.66){
    npcs.push(spawnMantaRay(x, y));
  } else if(r < 0.69){
    npcs.push(spawnSquid(x, y));
  } else if(r < 0.72){
    npcs.push(spawnAnglerfish(x, y));
  } else if(r < 0.75){
    npcs.push(spawnNarwhal(x, y));
  } else if(r < 0.78){
    npcs.push(spawnHammerhead(x, y));
  } else if(r < 0.81){
    npcs.push(spawnIsopod(x, y));
  } else if(r < 0.84){
    npcs.push(spawnLionfish(x, y));
  } else if(r < 0.87){
    npcs.push(spawnCuttlefish(x, y));
  } else if(r < 0.90){
    npcs.push(spawnParrotfish(x, y));
  } else if(r < 0.93){
    npcs.push(spawnBlobfish(x, y));
  } else if(r < 0.96){
    npcs.push(spawnSeaDragon(x, y));
  } else if(r < 0.98){
    npcs.push(spawnOarfish(x, y));
  } else if(r < 0.97){
    npcs.push(spawnManatee(x, y));
  } else if(r < 0.98){
    npcs.push(spawnWhale(x, clamp(y, WORLD_TOP_MARGIN+80, 3000)));
  } else if(r < 0.985){
    npcs.push(spawnDolphin(x, clamp(y, WORLD_TOP_MARGIN+60, 2500)));
  } else if(r < 0.989){
    npcs.push(spawnSwordfish(x, clamp(y, WORLD_TOP_MARGIN+80, 3500)));
  } else if(r < 0.992){
    npcs.push(spawnNautilus(x, clamp(y, 2000, 7500)));
  } else if(r < 0.994){
    npcs.push(spawnSeaSnake(x, clamp(y, 1500, 7500)));
  } else if(r < 0.9955){
    npcs.push(spawnSunfish(x, clamp(y, WORLD_TOP_MARGIN+80, 3000)));
  } else if(r < 0.9965){
    npcs.push(spawnDumboOctopus(x, clamp(y, 5000, 7500)));
  } else if(r < 0.9975){
    npcs.push(spawnGoblinShark(x, clamp(y, 4000, 7500)));
  } else if(options.difficulty !== 'peaceful'){
    npcs.push(spawnShark(x,y));
  }

  if(options.difficulty === 'hard' && Math.random() < 0.12 && totalCreatureCount() < MAX_NPCS){
    npcs.push(spawnShark(player.x + Math.cos(angle+1)*d, y));
  }
}

function destroyNpc(n){ creaturesLayer.removeChild(n.g); n.g.destroy(); }

function updateNPCs(dt){
  for(const n of npcs){
    if(n.type==='jelly') updateJelly(n, dt);
    else if(n.type==='crab') updateCrab(n, dt);
    else if(n.type==='turtle') updateTurtle(n, dt);
    else if(n.type==='shark') updateShark(n, dt);
    else if(n.type==='octopus') updateOctopus(n, dt);
    else if(n.type==='seahorse') updateSeahorse(n, dt);
    else if(n.type==='stingray') updateStingray(n, dt);
    else if(n.type==='eel') updateEel(n, dt);
    else if(n.type==='starfish') updateStarfish(n, dt);
    else if(n.type==='seahub') updateSeaUrchin(n, dt);
    else if(n.type==='pufferfish') updatePufferfish(n, dt);
    else if(n.type==='mantaray') updateMantaRay(n, dt);
    else if(n.type==='squid') updateSquid(n, dt);
    else if(n.type==='anglerfish') updateAnglerfish(n, dt);
    else if(n.type==='narwhal') updateNarwhal(n, dt);
    else if(n.type==='hammerhead') updateHammerhead(n, dt);
    else if(n.type==='isopod') updateIsopod(n, dt);
    else if(n.type==='lionfish') updateLionfish(n, dt);
    else if(n.type==='cuttlefish') updateCuttlefish(n, dt);
    else if(n.type==='parrotfish') updateParrotfish(n, dt);
    else if(n.type==='blobfish') updateBlobfish(n, dt);
    else if(n.type==='seadragon') updateSeaDragon(n, dt);
    else if(n.type==='oarfish') updateOarfish(n, dt);
    else if(n.type==='manatee') updateManatee(n, dt);
    else if(n.type==='whale') updateWhale(n, dt);
    else if(n.type==='dolphin') updateDolphin(n, dt);
    else if(n.type==='swordfish') updateSwordfish(n, dt);
    else if(n.type==='nautilus') updateNautilus(n, dt);
    else if(n.type==='seasnake') updateSeaSnake(n, dt);
    else if(n.type==='sunfish') updateSunfish(n, dt);
    else if(n.type==='dumbooctopus') updateDumboOctopus(n, dt);
    else if(n.type==='goblinshark') updateGoblinShark(n, dt);
  }

  npcs = npcs.filter(n=>{
    const tooFar = dist2(n.x,n.y,player.x,player.y) > DESPAWN_RADIUS*DESPAWN_RADIUS;
    const expired = n.type==='shark' && n.life <= 0;
    if(tooFar || expired){ destroyNpc(n); return false; }
    return true;
  });

  for(const s of schools) updateSchool(s, dt);
  for(let i=schools.length-1;i>=0;i--){
    if(dist2(schools[i].x,schools[i].y,player.x,player.y) > DESPAWN_RADIUS*DESPAWN_RADIUS){
      destroySchool(schools[i]);
      schools.splice(i,1);
    }
  }
}

/* ============================= SEAFLOOR & DECOR ============================= */

function drawSeafloorAndDecor(time){
  terrainG.clear();

  const left = player.x - app.screen.width/2 - 100;
  const right = player.x + app.screen.width/2 + 100;
  const cellSize = 70;
  const firstCell = Math.floor(left/cellSize) - 1;
  const lastCell = Math.floor(right/cellSize) + 1;

  terrainG.beginFill(0x5c4827);
  terrainG.moveTo(left, floorY(left));
  for(let wx = left; wx <= right; wx += 24){
    terrainG.lineTo(wx, floorY(wx));
  }
  terrainG.lineTo(right, 8500);
  terrainG.lineTo(left, 8500);
  terrainG.closePath();
  terrainG.endFill();

  terrainG.lineStyle(1.5, 0xfff0c8, 0.4);
  terrainG.moveTo(left, floorY(left));
  for(let wx = left; wx <= right; wx += 24){
    terrainG.lineTo(wx, floorY(wx));
  }

  for(let i=firstCell; i<=lastCell; i++){
    const h = hash(i*1.7+0.3);
    const wx = i*cellSize + hash(i*2.91)*30;
    const fy = floorY(wx);

    if(h < 0.30) drawSeaweed(wx, fy, hash(i*3.3), time);
    else if(h < 0.45) drawRock(wx, fy, hash(i*4.1));
    else if(h < 0.58) drawCoral(wx, fy, hash(i*5.7));
  }
}

function drawSeaweed(wx, fy, seed, time){
  const blades = 2 + Math.floor(seed*3);
  const baseHue = 140 + seed*40;
  for(let b=0; b<blades; b++){
    const bx = wx + (b - blades/2)*5;
    const height = 26 + seed*40 + b*4;
    const sway = Math.sin(time*0.0012 + seed*10 + b) * 10;
    terrainG.lineStyle(2, hslToHex(baseHue, 0.55, 0.38+b*0.04), 0.85);
    terrainG.moveTo(bx, fy);
    terrainG.quadraticCurveTo(bx + sway*0.5, fy - height*0.55, bx + sway, fy - height);
  }
}

function drawRock(wx, fy, seed){
  const s = 10 + seed*18;
  terrainG.lineStyle(1.6, 0x969aaa, 0.7);
  terrainG.moveTo(wx - s, fy);
  terrainG.lineTo(wx - s*0.6, fy - s*0.7);
  terrainG.lineTo(wx, fy - s*0.95);
  terrainG.lineTo(wx + s*0.7, fy - s*0.5);
  terrainG.lineTo(wx + s, fy);
  terrainG.closePath();
}

function drawCoral(wx, fy, seed){
  const branches = 3 + Math.floor(seed*3);
  const hue = 10 + seed*40;
  for(let i=0;i<branches;i++){
    const ang = -Math.PI/2 + (i - branches/2)*0.4 + seed;
    const len = 14 + seed*20;
    terrainG.lineStyle(2, hslToHex(hue, 0.7, 0.6), 0.8);
    terrainG.moveTo(wx, fy);
    terrainG.lineTo(wx + Math.cos(ang)*len*0.6, fy + Math.sin(ang)*len*0.6);
    terrainG.lineTo(wx + Math.cos(ang)*len, fy + Math.sin(ang)*len);
  }
}

function hslToHex(h,s,l){
  h = (h%360)/360;
  let r,g,b;
  if(s===0){ r=g=b=l; }
  else{
    const hue2rgb=(p,q,t)=>{
      if(t<0) t+=1; if(t>1) t-=1;
      if(t<1/6) return p+(q-p)*6*t;
      if(t<1/2) return q;
      if(t<2/3) return p+(q-p)*(2/3-t)*6;
      return p;
    };
    const q = l<0.5 ? l*(1+s) : l+s-l*s;
    const p = 2*l-q;
    r = hue2rgb(p,q,h+1/3);
    g = hue2rgb(p,q,h);
    b = hue2rgb(p,q,h-1/3);
  }
  return rgbToHex([Math.round(r*255),Math.round(g*255),Math.round(b*255)]);
}

/* ============================= SURFACE LINE ============================= */

function drawSurfaceLine(time){
  surfaceG.clear();
  const left = player.x - app.screen.width/2 - 50;
  const right = player.x + app.screen.width/2 + 50;
  if(SURFACE_Y < player.y - app.screen.height/2 - 50 || SURFACE_Y > player.y + app.screen.height/2 + 50) return;

  surfaceG.lineStyle(2, 0xffffff, 0.35);
  surfaceG.moveTo(left, SURFACE_Y + Math.sin(left*0.02 + time*0.002)*4);
  for(let wx=left; wx<=right; wx+=16){
    surfaceG.lineTo(wx, SURFACE_Y + Math.sin(wx*0.02 + time*0.002)*4);
  }
}

/* ============================= WATER OVERLAY EFFECTS ============================= */

function drawWaterOverlay(time){
  waterOverlayG.clear();
  const W = app.screen.width;
  const H = app.screen.height;
  const surfY = world.y;          // where the surface sits on screen
  if(surfY > H) return;           // surface is below the view: nothing to light
  const top = Math.max(0, surfY);

  // Caustic light patterns just under the surface
  if(player.y < 800){
    const causticAlpha = Math.max(0, 0.08 - Math.max(player.y,0)/10000);
    waterOverlayG.lineStyle(1, 0xffffff, causticAlpha);
    for(let i=0; i<12; i++){
      const cx = ((i*120 + time*0.02 + player.x*0.1) % (W+200)) - 100;
      const cy = top + 20 + Math.sin(time*0.001 + i)*30;
      waterOverlayG.moveTo(cx, cy);
      waterOverlayG.quadraticCurveTo(cx+40, cy+20, cx+80, cy-10);
      waterOverlayG.quadraticCurveTo(cx+120, cy-30, cx+160, cy+10);
    }
  }

  // Subtle light rays from the surface
  if(player.y < 400){
    const rayAlpha = Math.max(0, 0.035 - Math.max(player.y,0)/8000) * (0.4 + 0.6*getDaylight(time));
    waterOverlayG.beginFill(0xffffff, rayAlpha);
    for(let i=0; i<5; i++){
      const rx = ((i*200 + time*0.008) % (W+300)) - 150;
      waterOverlayG.moveTo(rx, top);
      waterOverlayG.lineTo(rx+30, top);
      waterOverlayG.lineTo(rx+80, H);
      waterOverlayG.lineTo(rx+20, H);
      waterOverlayG.closePath();
    }
    waterOverlayG.endFill();
  }
}

/* ============================= SKY + WATER BACKGROUND ============================= */

const waterBg = document.getElementById('water-bg');

// Sky is drawn in PIXI (so its lower edge can follow the wave line);
// everything below the surface is a CSS gradient that darkens with depth.
function drawSky(now){
  skyG.clear();
  const W = app.screen.width, H = app.screen.height;
  const surfY = world.y;
  if(surfY <= 0) return;                       // surface is above the screen: no sky visible

  const day = getDaylight(now);
  const br = options.brightness;
  // night -> dawn/dusk -> day
  let zenith, horizon;
  if(day < 0.5){
    const t = day/0.5;
    zenith  = lerpColor(SKY_NIGHT_TOP, SKY_DUSK_TOP, t);
    horizon = lerpColor(SKY_NIGHT_HOR, SKY_DUSK_HOR, t);
  } else {
    const t = (day - 0.5)/0.5;
    zenith  = lerpColor(SKY_DUSK_TOP, SKY_DAY_TOP, t);
    horizon = lerpColor(SKY_DUSK_HOR, SKY_DAY_HOR, t);
  }

  const scale = (c)=> rgbToHex([clamp(Math.round(c[0]*br),0,255), clamp(Math.round(c[1]*br),0,255), clamp(Math.round(c[2]*br),0,255)]);

  const cut = clamp(surfY - 8, 0, H);
  const BAND = 16;
  for(let y=0; y<cut; y+=BAND){
    const alt = clamp((surfY - (y + BAND/2)) / SKY_HEIGHT, 0, 1);
    skyG.beginFill(scale(lerpColor(horizon, zenith, Math.pow(alt, 0.75))));
    skyG.drawRect(0, y, W, Math.min(BAND, cut - y) + 1);
    skyG.endFill();
  }

  // stars at night
  if(day < 0.4 && cut > 0){
    const a = (0.4 - day)/0.4;
    for(let i=0;i<44;i++){
      const tw = 0.55 + 0.45*Math.sin(now*0.002 + i*1.7);
      skyG.beginFill(0xffffff, a*tw*0.85);
      skyG.drawCircle(hash(i*1.3)*W, hash(i*2.7+5)*cut, 0.6 + hash(i*4.1)*1.1);
      skyG.endFill();
    }
  }

  // last strip: follow the wavy surface line exactly
  if(cut < H){
    const left = player.x - W/2;
    const pts = [0, cut, W, cut];
    const steps = Math.ceil(W/16);
    for(let i=0; i<=steps; i++){
      const sx = W - W*(i/steps);
      const wy = surfY + Math.sin((left + sx)*0.02 + now*0.002)*4;
      pts.push(sx, Math.min(H+2, Math.max(cut, wy)));
    }
    skyG.beginFill(scale(horizon));
    skyG.drawPolygon(pts);
    skyG.endFill();
  }
}

function updateWaterBackground(now){
  const H = app.screen.height;
  const surfY = world.y;
  const startY = Math.max(0, surfY);            // first screen row that is water

  const day = getDaylight(now);
  const br = (0.42 + 0.58*day) * options.brightness;

  const stops = [];
  let firstColor = null;
  const N = 4;
  for(let i=0;i<=N;i++){
    const sy = startY + (H - startY)*(i/N);
    const depthFrac = clamp((player.y + (sy - H/2)) / 8000, 0, 1);
    const c = colorAtDepthFraction(depthFrac);
    const adj = [clamp(Math.round(c[0]*br),0,255), clamp(Math.round(c[1]*br),0,255), clamp(Math.round(c[2]*br),0,255)];
    if(i === 0) firstColor = rgbToCss(adj);
    stops.push(`${rgbToCss(adj)} ${sy.toFixed(1)}px`);
  }
  if(startY > 0) stops.unshift(`${firstColor} 0px`);   // solid water colour behind the sky strip

  waterBg.style.background = `linear-gradient(to bottom, ${stops.join(', ')})`;
}

/* ============================= DAY/NIGHT CLOCK ============================= */

const clockEl = document.getElementById('daynight-clock');

// Fast 24-hour clock: 120 seconds real time = 24 game hours
function updateClock(){
  const cycleTime = getCycleTime(performance.now());
  // cycleTime is 0..1, map to 0..24 hours
  const totalHours = cycleTime * 24;
  const hours = Math.floor(totalHours);
  const minutes = Math.floor((totalHours - hours) * 60);
  const timeStr = `${hours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}`;

  clockEl.textContent = timeStr;
}

/* ============================= OPTIONS ============================= */

const options = {
  volume: 1.0,
  brightness: 1.0,
  difficulty: 'normal',
  showHints: true
};

/* ============================= AUDIO ============================= */

let audioCtx = null;
let masterGain = null;
let droneNodes = null;

function ensureAudio(){
  if(audioCtx) return;
  try{
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = options.volume * 0.5;
    masterGain.connect(audioCtx.destination);
    startDrone();
  }catch(err){
    audioCtx = null;
  }
}

function startDrone(){
  if(!audioCtx || droneNodes) return;
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const droneGain = audioCtx.createGain();
  osc1.type = 'sine'; osc1.frequency.value = 55;
  osc2.type = 'sine'; osc2.frequency.value = 82.5;
  droneGain.gain.value = 0.18;
  osc1.connect(droneGain);
  osc2.connect(droneGain);
  droneGain.connect(masterGain);
  osc1.start(); osc2.start();
  droneNodes = { osc1, osc2, droneGain };
}

function playBlip(){
  if(!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(rand(500,900), t);
  osc.frequency.exponentialRampToValueAtTime(rand(900,1400), t+0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t+0.18);
  osc.connect(g); g.connect(masterGain);
  osc.start(t); osc.stop(t+0.2);
}

function playLevelUp(){
  if(!audioCtx) return;
  const t0 = audioCtx.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i)=>{
    const t = t0 + i*0.09;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.28);
    osc.connect(g); g.connect(masterGain);
    osc.start(t); osc.stop(t+0.3);
  });
}

function setVolume(v){
  options.volume = clamp(v, 0, 1);
  if(masterGain) masterGain.gain.value = options.volume * 0.5;
}

/* ============================= TITLE SCREEN / OPTIONS WIRING ============================= */

const titleScreenEl = document.getElementById('title-screen');
const optionsScreenEl = document.getElementById('options-screen');
const playButtonEl = document.getElementById('play-button');
const optionsButtonEl = document.getElementById('options-button');
const backButtonEl = document.getElementById('back-button');
const volumeSliderEl = document.getElementById('volume-slider');
const brightnessSliderEl = document.getElementById('brightness-slider');
const difficultySelectEl = document.getElementById('difficulty-select');
const showHintsCheckboxEl = document.getElementById('show-hints-checkbox');

const pregameHideTargets = ['hud','instructions','touch-controls'];
function setPregameVisible(visible){
  for(const id of pregameHideTargets){
    const el = document.getElementById(id);
    if(!el) continue;
    el.classList.toggle('pregame-hidden', !visible);
  }
}
setPregameVisible(false);

let optionsOpenedFromTitle = true;

function openOptions(fromTitle){
  optionsOpenedFromTitle = fromTitle;
  optionsScreenEl.classList.remove('screen-hidden');
  optionsScreenEl.classList.add('screen-active');
  if(fromTitle){
    titleScreenEl.classList.add('screen-hidden');
    titleScreenEl.classList.remove('screen-active');
  }
}

function closeOptions(){
  optionsScreenEl.classList.add('screen-hidden');
  optionsScreenEl.classList.remove('screen-active');
  if(optionsOpenedFromTitle){
    titleScreenEl.classList.remove('screen-hidden');
    titleScreenEl.classList.add('screen-active');
  }
}

function startGame(){
  if(gameStarted) return;
  gameStarted = true;
  ensureAudio();
  titleScreenEl.classList.add('screen-hidden');
  titleScreenEl.classList.remove('screen-active');
  playerG.visible = true;
  setPregameVisible(true);
  if(options.showHints){
    setTimeout(hideInstructions, 10000);
  } else {
    hideInstructions();
  }
}

playButtonEl.addEventListener('click', startGame);
optionsButtonEl.addEventListener('click', ()=> openOptions(true));
backButtonEl.addEventListener('click', closeOptions);

volumeSliderEl.addEventListener('input', (e)=>{
  setVolume(e.target.value/100);
});
brightnessSliderEl.addEventListener('input', (e)=>{
  options.brightness = clamp(e.target.value/100, 0.5, 1.5);
});
difficultySelectEl.addEventListener('change', (e)=>{
  options.difficulty = e.target.value;
  if(options.difficulty === 'peaceful'){
    for(let i=npcs.length-1;i>=0;i--){
      if(npcs[i].type === 'shark'){ destroyNpc(npcs[i]); npcs.splice(i,1); }
    }
  }
});
showHintsCheckboxEl.addEventListener('change', (e)=>{
  options.showHints = e.target.checked;
  if(!options.showHints) hideInstructions();
});

playerG.visible = false;

/* ============================= COMMAND PROMPT ============================= */

const commandPromptEl = document.getElementById('command-prompt');
const commandOutputEl = document.getElementById('command-output');
const commandInputEl = document.getElementById('command-input');

function printLine(text, cls){
  const line = document.createElement('div');
  line.className = 'line' + (cls ? ' '+cls : '');
  line.textContent = text;
  commandOutputEl.appendChild(line);
  commandOutputEl.scrollTop = commandOutputEl.scrollHeight;
}

function openCommandPrompt(){
  commandOpen = true;
  commandPromptEl.classList.remove('command-hidden');
  commandInputEl.value = '';
  commandInputEl.focus();
  keys.up = keys.down = keys.left = keys.right = keys.space = false;
}

function closeCommandPrompt(){
  commandOpen = false;
  commandPromptEl.classList.add('command-hidden');
  commandInputEl.blur();
}

commandInputEl.addEventListener('keydown', (e)=>{
  e.stopPropagation();
  if(e.key === 'Enter'){
    const raw = commandInputEl.value.trim();
    commandInputEl.value = '';
    if(raw.length === 0) return;
    printLine('> ' + raw, 'echo');
    runCommand(raw);
  } else if(e.key === 'Escape'){
    closeCommandPrompt();
  }
});

const COMMAND_LIST = [
  'help','clear','depth','teleport','tp','speed','spawn','clearcreatures',
  'time','weather','flip','coords','fact','8ball','roll','coinflip','rename',
  'level','xp','resetprogress','dungeon','cave'
];

const FUN_FACTS = [
  'The blue whale\'s heart alone can weigh as much as a small car.',
  'Octopuses have three hearts and blue blood.',
  'The deepest part of the ocean is the Mariana Trench, nearly 11,000m down.',
  'A group of jellyfish is called a smack.',
  'Sharks have been around longer than trees.',
  'Some fish can change sex during their lifetime.',
  'The ocean produces over half of the world\'s oxygen.',
  'Seahorses are famously the species where males carry the young.',
  'Pufferfish can inflate to several times their normal size in seconds.',
  'Starfish don\'t have brains or blood.'
];

const MAGIC_8BALL = [
  'It is certain.','Without a doubt.','Yes, definitely.','You may rely on it.',
  'Ask again later.','Cannot predict now.','Concentrate and ask again.',
  'Don\'t count on it.','My reply is no.','Outlook not so good.','Very doubtful.'
];

const SPAWNABLE = {
  jellyfish: (x,y)=> spawnJellyfish(x,y),
  crab: (x)=> spawnCrab(x),
  turtle: (x,y)=> spawnTurtle(x,y),
  octopus: (x,y)=> spawnOctopus(x,y),
  seahorse: (x,y)=> spawnSeahorse(x,y),
  stingray: (x,y)=> spawnStingray(x,y),
  eel: (x,y)=> spawnEel(x,y),
  starfish: (x)=> spawnStarfish(x),
  seahub: (x,y)=> spawnSeaUrchin(x,y),
  pufferfish: (x,y)=> spawnPufferfish(x,y),
  shark: (x,y)=> spawnShark(x,y),
  school: (x,y)=> { spawnSchool(x,y); return null; },
  mantaray: (x,y)=> spawnMantaRay(x,y),
  squid: (x,y)=> spawnSquid(x,y),
  anglerfish: (x,y)=> spawnAnglerfish(x,y),
  narwhal: (x,y)=> spawnNarwhal(x,y),
  hammerhead: (x,y)=> spawnHammerhead(x,y),
  isopod: (x,y)=> spawnIsopod(x,y),
  lionfish: (x,y)=> spawnLionfish(x,y),
  cuttlefish: (x,y)=> spawnCuttlefish(x,y),
  parrotfish: (x,y)=> spawnParrotfish(x,y),
  blobfish: (x,y)=> spawnBlobfish(x,y),
  seadragon: (x,y)=> spawnSeaDragon(x,y),
  oarfish: (x,y)=> spawnOarfish(x,y),
  manatee: (x,y)=> spawnManatee(x,y),
  whale: (x,y)=> spawnWhale(x,y),
  dolphin: (x,y)=> spawnDolphin(x,y),
  swordfish: (x,y)=> spawnSwordfish(x,y),
  nautilus: (x,y)=> spawnNautilus(x,y),
  seasnake: (x,y)=> spawnSeaSnake(x,y),
  sunfish: (x,y)=> spawnSunfish(x,y),
  dumbooctopus: (x,y)=> spawnDumboOctopus(x,y),
  goblinshark: (x,y)=> spawnGoblinShark(x,y)
};

function runCommand(raw){
  const parts = raw.split(/\s+/);
  const cmd = parts[0].toLowerCase().replace(/^\//,'');
  const args = parts.slice(1);
  playBlip();

  switch(cmd){
    case 'help': {
      printLine('Available commands:', 'info');
      printLine(COMMAND_LIST.join(', '), 'info');
      break;
    }
    case 'dungeon':
    case 'cave': {
      for(const [text, cls] of dungeons.command(args)) printLine(text, cls);
      break;
    }
    case 'clear': {
      commandOutputEl.innerHTML = '';
      break;
    }
    case 'depth': {
      const m = Math.max(0, Math.round((player.y - SURFACE_Y)/8));
      printLine(`Current depth: ${m}m`, 'ok');
      break;
    }
    case 'coords': {
      printLine(`x=${Math.round(player.x)} y=${Math.round(player.y)}`, 'ok');
      break;
    }
    case 'teleport': case 'tp': {
      if(args[0]==='surface'){
        player.y = SURFACE_Y + 10; player.vy = 0;
        printLine('Teleported to the surface.', 'ok');
      } else if(args[0]==='seafloor' || args[0]==='floor'){
        player.y = floorY(player.x) - 60; player.vy = 0;
        printLine('Teleported to the seafloor.', 'ok');
      } else if(args.length>=2 && !isNaN(+args[0]) && !isNaN(+args[1])){
        player.x = +args[0]; player.y = +args[1]; player.vx=0; player.vy=0;
        printLine(`Teleported to (${args[0]}, ${args[1]}).`, 'ok');
      } else {
        printLine('Usage: /tp surface | /tp seafloor | /tp <x> <y>', 'err');
      }
      break;
    }
    case 'speed': {
      const v = parseFloat(args[0]);
      if(isNaN(v) || v<=0){ printLine('Usage: /speed <number, e.g. 9>', 'err'); break; }
      player.maxSpeed = clamp(v, 1, 40);
      printLine(`Max speed set to ${player.maxSpeed}.`, 'ok');
      break;
    }
    case 'spawn': {
      const what = (args[0]||'').toLowerCase();
      const fn = SPAWNABLE[what];
      if(!fn){
        printLine('Spawnable: ' + Object.keys(SPAWNABLE).join(', '), 'err');
        break;
      }
      const sx = player.x + rand(-160,160);
      const sy = clamp(player.y + rand(-100,100), WORLD_TOP_MARGIN+40, 7500);
      const n = fn(sx, sy);
      if(n) npcs.push(n);
      printLine(`Spawned a ${what} nearby.`, 'fun');
      break;
    }
    case 'clearcreatures': {
      for(const n of npcs) destroyNpc(n);
      npcs = [];
      for(const s of schools) destroySchool(s);
      schools.length = 0;
      printLine('Cleared all creatures.', 'ok');
      break;
    }
    case 'time': {
      printLine(getDaylight(performance.now()) >= 0.5 ? 'It is currently day.' : 'It is currently night.', 'info');
      break;
    }
    case 'weather': {
      const opts = ['Calm currents.','A gentle drift today.','Sun rays piercing the surface.','Murky and still.','Bubbles rising steadily.'];
      printLine(opts[randi(0,opts.length-1)], 'fun');
      break;
    }
    case 'flip': {
      player.flipping = true;
      player.flipProgress = 0;
      player.flipDir = Math.random()<0.5 ? 1 : -1;
      player.flipCounts = false;      // debug flips don't award XP
      printLine('Flip!', 'fun');
      break;
    }
    case 'fact': {
      printLine(FUN_FACTS[randi(0,FUN_FACTS.length-1)], 'fun');
      break;
    }
    case '8ball': {
      if(args.length===0){ printLine('Ask the 8-ball a question, e.g. /8ball will I find a shark?', 'err'); break; }
      printLine(MAGIC_8BALL[randi(0,MAGIC_8BALL.length-1)], 'fun');
      break;
    }
    case 'roll': {
      const sides = parseInt(args[0]) || 6;
      printLine(`You rolled a ${randi(1,Math.max(2,sides))} (d${sides}).`, 'fun');
      break;
    }
    case 'coinflip': {
      printLine(Math.random()<0.5 ? 'Heads!' : 'Tails!', 'fun');
      break;
    }
    case 'level': {
      printLine(`Level ${progress.level} - ${progress.xp} / ${xpNeeded(progress.level)} XP`, 'ok');
      break;
    }
    case 'xp': {
      const v = parseInt(args[0]);
      if(isNaN(v) || v <= 0){ printLine('Usage: /xp <amount>', 'err'); break; }
      addXP(v);
      printLine(`Gave ${v} XP.`, 'ok');
      break;
    }
    case 'resetprogress': {
      resetProgress();
      printLine('Level and XP reset.', 'ok');
      break;
    }
    case 'rename': {
      if(args.length===0){ printLine('Usage: /rename <new name>', 'err'); break; }
      const name = args.join(' ').slice(0,24);
      document.getElementById('title-text').textContent = name;
      document.getElementById('title-text').setAttribute('data-text', name);
      printLine(`Renamed the game to "${name}". (cosmetic, title screen only)`, 'fun');
      break;
    }
    default: {
      printLine(`Unknown command: ${cmd}. Type /help for a list.`, 'err');
    }
  }
}

window.addEventListener('keydown', (e)=>{
  if(commandOpen && e.key === 'Escape'){
    closeCommandPrompt();
  }
});

/* ============================= HUD ============================= */

const depthValEl = document.getElementById('depthVal');

function updateHUD(){
  depthValEl.textContent = dungeons.active ? dungeons.depth() : Math.max(0, Math.round((player.y - SURFACE_Y)/8));
}

/* ============================= CAVES & ABILITIES (see dungeons.js) ============================= */

const dungeons = MoceanDungeons({
  app, world, player, keys, rand, randi, clamp, lerpAngle, floorY,
  terrainG, bubblesG, playerG, PLAYER_COLORS, SHARK_COLORS, drawFishShape,
  addXP, popText, burstBubbles, playBlip,
  isStarted: ()=> gameStarted,
  // hide / show the open-ocean layers while the player is inside a cave
  hideWhenInside(inside){
    for(const o of [skyG, terrainG, creaturesLayer, surfaceG, waterOverlayG]) o.visible = !inside;
  }
});

/* ============================= MAIN LOOP ============================= */

let bubbleSpawnTimer = 0;

(function seedWorld(){
  for(let i=0;i<12;i++){
    const x = player.x + rand(-900,900);
    const y = clamp(player.y + rand(-500,500), 200, 7500);
    const r = Math.random();
    if(r<0.25) spawnSchool(x,y);
    else if(r<0.38) npcs.push(spawnJellyfish(x,y));
    else if(r<0.48) npcs.push(spawnCrab(x));
    else if(r<0.58) npcs.push(spawnOctopus(x,y));
    else if(r<0.66) npcs.push(spawnSeahorse(x,y));
    else if(r<0.74) npcs.push(spawnStingray(x,y));
    else if(r<0.82) npcs.push(spawnStarfish(x));
    else if(r<0.90) npcs.push(spawnSeaUrchin(x,y));
    else npcs.push(spawnPufferfish(x,y));
  }
  for(let i=0;i<2;i++) npcs.push(spawnWhale(player.x + rand(-900,900), clamp(player.y + rand(-500,500), 800, 3000)));
  for(let i=0;i<3;i++) npcs.push(spawnDolphin(player.x + rand(-900,900), clamp(player.y + rand(-500,500), 400, 2500)));
  for(let i=0;i<2;i++) npcs.push(spawnSwordfish(player.x + rand(-900,900), clamp(player.y + rand(-500,500), 600, 3500)));
  for(let i=0;i<2;i++) npcs.push(spawnNautilus(player.x + rand(-900,900), clamp(player.y + rand(-500,500), 2000, 7500)));
  for(let i=0;i<2;i++) npcs.push(spawnSeaSnake(player.x + rand(-900,900), clamp(player.y + rand(-500,500), 1500, 7500)));
  for(let i=0;i<2;i++) npcs.push(spawnSunfish(player.x + rand(-900,900), clamp(player.y + rand(-500,500), 600, 3000)));
  for(let i=0;i<2;i++) npcs.push(spawnDumboOctopus(player.x + rand(-900,900), clamp(player.y + rand(-500,500), 5000, 7500)));
  for(let i=0;i<2;i++) npcs.push(spawnGoblinShark(player.x + rand(-900,900), clamp(player.y + rand(-500,500), 4000, 7500)));
})();

function positionPlayerGraphic(){
  playerG.x = app.screen.width/2;
  playerG.y = app.screen.height/2;
}
window.addEventListener('resize', positionPlayerGraphic);
positionPlayerGraphic();

app.ticker.add((dt)=>{
  updateTouchInput();
  const speed = updatePlayer(dt);
  if(!dungeons.active){
    updateNPCs(dt);
    trySpawn(dt);
    checkEating();
  }
  dungeons.update(dt);

  bubbleSpawnTimer -= dt;
  if(bubbleSpawnTimer <= 0){
    bubbleSpawnTimer = rand(4,10);
    spawnBubble(false);
    if(speed > 0.5 && Math.random()<0.6) spawnBubble(true);
  }
  updateBubbles(dt);
  updateSplashes(dt);

  world.x = -(player.x - app.screen.width/2);
  world.y = -(player.y - app.screen.height/2) - player.bob;

  const now = performance.now();
  if(!dungeons.active) drawSeafloorAndDecor(now);
  redrawBubbles();
  redrawSplashes();
  if(!dungeons.active){
    drawSurfaceLine(now);
    drawWaterOverlay(now);
  }

  playerG.y = app.screen.height/2 + player.bob;
  playerG.rotation = player.flipping
    ? player.displayAngle + player.flipProgress*Math.PI*2*player.flipDir
    : player.displayAngle;
  const look = dungeons.look();
  drawFishShape(playerG, player.size*look.size*(1 + player.chomp*0.18), look.colors, player.tailPhase, speed/player.maxSpeed, player.bank, player.displayAngle);

  if(!dungeons.active){
    drawSky(now);
    updateWaterBackground(now);
  }
  updateHUD();
  updateDebugDisplay();
  updateClock();
});

})();
