(function(){
"use strict";

/* ============================= PIXI SETUP ============================= */

const app = new PIXI.Application({
  resizeTo: window,
  backgroundAlpha: 0,          // transparent - CSS draws the water gradient behind it
  antialias: true,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2)
});
document.getElementById('pixi-root').appendChild(app.view);

// Everything that scrolls with the player lives inside `world`.
// Moving this one container is our entire "camera" - no per-shape
// screen-space math needed anywhere else in the file.
const world = new PIXI.Container();
const raysLayer = new PIXI.Container();   // screen-space ambient light, parallaxed slightly
const terrainG = new PIXI.Graphics();     // seafloor + seaweed/rock/coral, redrawn each frame
const surfaceG = new PIXI.Graphics();     // wavy surface line
const bubblesG = new PIXI.Graphics();     // all bubbles, redrawn each frame
const creaturesLayer = new PIXI.Container(); // one child Graphics per creature

app.stage.addChild(raysLayer);
app.stage.addChild(world);
world.addChild(terrainG);
world.addChild(bubblesG);
world.addChild(creaturesLayer);
world.addChild(surfaceG);

const playerG = new PIXI.Graphics();
app.stage.addChild(playerG); // drawn directly on stage so it stays fixed at screen center

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
const SEAFLOOR_Y = 5200;
const WORLD_TOP_MARGIN = 40;
const WORLD_BOTTOM_MARGIN = 60;

function floorY(x){
  return SEAFLOOR_Y
    + Math.sin(x*0.008)*40
    + Math.sin(x*0.021+3)*22
    + Math.sin(x*0.05+7)*9;
}

const DEPTH_STOPS = [
  {stop:0.00, color:[133,221,235]},
  {stop:0.12, color:[72,170,205]},
  {stop:0.30, color:[34,116,170]},
  {stop:0.55, color:[18,72,122]},
  {stop:0.78, color:[10,38,72]},
  {stop:1.00, color:[3,12,26]}
];
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

/* ============================= INPUT ============================= */

const keys = { up:false, down:false, left:false, right:false };

window.addEventListener('keydown', (e)=>{
  switch(e.key){
    case 'ArrowUp': keys.up=true; e.preventDefault(); break;
    case 'ArrowDown': keys.down=true; e.preventDefault(); break;
    case 'ArrowLeft': keys.left=true; e.preventDefault(); break;
    case 'ArrowRight': keys.right=true; e.preventDefault(); break;
  }
  hideInstructions();
}, {passive:false});

window.addEventListener('keyup', (e)=>{
  switch(e.key){
    case 'ArrowUp': keys.up=false; break;
    case 'ArrowDown': keys.down=false; break;
    case 'ArrowLeft': keys.left=false; break;
    case 'ArrowRight': keys.right=false; break;
  }
});

function bindTouchBtn(id, key){
  const el = document.getElementById(id);
  const set = (v)=> (e)=>{ keys[key]=v; hideInstructions(); e.preventDefault(); };
  el.addEventListener('touchstart', set(true), {passive:false});
  el.addEventListener('touchend', set(false), {passive:false});
  el.addEventListener('touchcancel', set(false), {passive:false});
  el.addEventListener('mousedown', set(true));
  el.addEventListener('mouseup', set(false));
  el.addEventListener('mouseleave', set(false));
}
bindTouchBtn('btn-up','up');
bindTouchBtn('btn-down','down');
bindTouchBtn('btn-left','left');
bindTouchBtn('btn-right','right');

let instructionsHidden = false;
function hideInstructions(){
  if(instructionsHidden) return;
  instructionsHidden = true;
  document.getElementById('instructions').classList.add('hide');
}
setTimeout(hideInstructions, 6000);

/* ============================= FISH SHAPE (shared by player, schools, sharks) ============================= */

// Draws into a Graphics object's *local* space (origin = fish center, facing +x).
// The caller is responsible for positioning/rotating the Graphics itself.
function drawFishShape(g, size, colors, tailPhase, speedFrac, bank){
  g.clear();
  const s = size;
  const wag = Math.sin(tailPhase) * (0.35 + Math.min(speedFrac,1)*0.55);

  // tail fin
  g.lineStyle({ width: Math.max(1.4, s*0.07), color: colors.fin, ...ROUND });
  g.moveTo(-s*0.85, 0);
  g.quadraticCurveTo(-s*1.5, wag*s*0.7, -s*1.9, wag*s*1.1 - 0.4*s);
  g.moveTo(-s*0.85, 0);
  g.quadraticCurveTo(-s*1.5, wag*s*0.7, -s*1.9, wag*s*1.1 + 0.4*s);

  // body
  g.lineStyle({ width: Math.max(1.6, s*0.085), color: colors.body, ...ROUND });
  g.moveTo(s*1.0, 0);
  g.quadraticCurveTo(s*0.5, -s*0.62, -s*0.85, -s*0.30 + bank*s*0.15);
  g.quadraticCurveTo(-s*1.05, 0, -s*0.85, s*0.30 - bank*s*0.15);
  g.quadraticCurveTo(s*0.5, s*0.62, s*1.0, 0);

  // top fin
  g.lineStyle({ width: Math.max(1.2, s*0.06), color: colors.fin, ...ROUND });
  g.moveTo(-s*0.1, -s*0.32);
  g.lineTo(s*0.05, -s*0.75 + wag*s*0.2);
  g.lineTo(s*0.32, -s*0.30);

  // side fin
  g.moveTo(s*0.18, s*0.12);
  g.quadraticCurveTo(s*0.05, s*0.55, -s*0.15, s*0.42 + wag*s*0.15);

  // eye
  g.lineStyle({ width: 1.3, color: colors.eye });
  g.drawCircle(s*0.62, -s*0.08, Math.max(1.2, s*0.07));
}

/* ============================= PLAYER ============================= */

const player = {
  x: 300, y: 900,
  vx: 0, vy: 0,
  angle: 0, displayAngle: 0,
  tailPhase: 0,
  size: 20,
  maxSpeed: 5.4,
  accel: 0.34,
  drag: 0.94,
  bob: 0
};
const PLAYER_COLORS = { body:0xff9d5c, fin:0xffd194, eye:0xfff4e6 };

function updatePlayer(dt){
  let ax = 0, ay = 0;
  if(keys.left) ax -= player.accel;
  if(keys.right) ax += player.accel;
  if(keys.up) ay -= player.accel;
  if(keys.down) ay += player.accel;

  if(ax !== 0 && ay !== 0){ ax *= 0.78; ay *= 0.78; } // diagonals aren't faster than cardinals

  player.vx += ax * dt;
  player.vy += ay * dt;
  player.vx *= Math.pow(player.drag, dt);
  player.vy *= Math.pow(player.drag, dt);

  const speed = Math.hypot(player.vx, player.vy);
  if(speed > player.maxSpeed){
    const k = player.maxSpeed / speed;
    player.vx *= k; player.vy *= k;
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  const top = SURFACE_Y + WORLD_TOP_MARGIN;
  const bottom = SEAFLOOR_Y - WORLD_BOTTOM_MARGIN;
  if(player.y < top){ player.y = top; player.vy *= -0.3; }
  if(player.y > bottom){ player.y = bottom; player.vy *= -0.3; }

  if(speed > 0.08){ player.angle = Math.atan2(player.vy, player.vx); }
  player.displayAngle = lerpAngle(player.displayAngle, player.angle, 0.12*dt);

  const moveFactor = 0.6 + Math.min(speed/player.maxSpeed, 1)*1.6;
  player.tailPhase += 0.16*dt*moveFactor*6;
  player.bob = Math.sin(performance.now()*0.0025)*1.6;

  return speed;
}

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

/* ============================= SCHOOLS OF FISH ============================= */

const schools = [];
const SCHOOL_PALETTES = [
  {body:0x7fe8d4, fin:0xbdfff0, eye:0x08332b},
  {body:0xffd45e, fin:0xfff0bd, eye:0x3a2c00},
  {body:0x9ec8ff, fin:0xdceaff, eye:0x0b2347},
  {body:0xff8fa3, fin:0xffd6df, eye:0x3a0a16}
];

function spawnSchool(x,y){
  const palette = SCHOOL_PALETTES[randi(0,SCHOOL_PALETTES.length-1)];
  const count = randi(5,9);
  const members = [];
  for(let i=0;i<count;i++){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    members.push({
      offAngle: rand(0,Math.PI*2),
      offRad: rand(8,30),
      rotSpeed: rand(0.15,0.4) * (Math.random()<0.5?-1:1),
      phase: rand(0,Math.PI*2),
      size: rand(6,9),
      g
    });
  }
  schools.push({
    type:'school',
    x, y,
    vx: rand(-1,1), vy: rand(-0.3,0.3),
    targetX: x + rand(-300,300),
    targetY: clamp(y + rand(-200,200), WORLD_TOP_MARGIN+60, SEAFLOOR_Y-200),
    retarget: rand(120,260),
    speed: rand(1.0,1.8),
    palette,
    members
  });
}

function updateSchool(s, dt){
  s.retarget -= dt;
  if(s.retarget <= 0){
    s.targetX = s.x + rand(-350,350);
    s.targetY = clamp(s.y + rand(-220,220), WORLD_TOP_MARGIN+60, SEAFLOOR_Y-200);
    s.retarget = rand(140,300);
  }
  const dx = s.targetX - s.x, dy = s.targetY - s.y;
  const d = Math.hypot(dx,dy) || 1;
  s.vx = lerp(s.vx, (dx/d) * s.speed, 0.02*dt);
  s.vy = lerp(s.vy, (dy/d) * s.speed, 0.02*dt);
  s.x += s.vx*dt;
  s.y += s.vy*dt;
  s.y = clamp(s.y, WORLD_TOP_MARGIN+20, SEAFLOOR_Y-40);

  const heading = Math.atan2(s.vy, s.vx);
  for(const m of s.members){
    m.offAngle += m.rotSpeed*0.02*dt;
    m.phase += 0.18*dt;

    const mx = s.x + Math.cos(m.offAngle)*m.offRad;
    const my = s.y + Math.sin(m.offAngle)*m.offRad*0.6;
    m.g.x = mx; m.g.y = my; m.g.rotation = heading;
    drawFishShape(m.g, m.size, s.palette, m.phase, 0.8, Math.sin(m.offAngle)*0.3);
  }
}

function destroySchool(s){
  for(const m of s.members){ creaturesLayer.removeChild(m.g); m.g.destroy(); }
}

/* ============================= JELLYFISH ============================= */

const JELLY_COLORS = [0xd59bff, 0xff9bd2, 0x9bd2ff, 0xc8ffe0];

function spawnJellyfish(x,y){
  const g = new PIXI.Graphics();
  creaturesLayer.addChild(g);
  return {
    type:'jelly',
    x, y, baseY: y,
    color: JELLY_COLORS[randi(0,JELLY_COLORS.length-1)],
    phase: rand(0,Math.PI*2),
    driftPhase: rand(0,Math.PI*2),
    size: rand(14,24),
    tentacles: randi(4,6),
    g
  };
}

function updateJelly(j, dt){
  j.phase += 0.025*dt;
  j.driftPhase += 0.006*dt;
  j.y = clamp(j.baseY + Math.sin(j.driftPhase)*45, WORLD_TOP_MARGIN+40, SEAFLOOR_Y-40);
  j.x += Math.sin(j.driftPhase*1.3)*0.25*dt;

  j.g.x = j.x; j.g.y = j.y;
  redrawJelly(j);
}

function redrawJelly(j){
  const g = j.g;
  g.clear();
  const pulse = 1 + Math.sin(j.phase*3)*0.18;
  const s = j.size;

  g.lineStyle(1.6, j.color, 0.8);
  g.moveTo(-s*pulse, 0);
  g.quadraticCurveTo(-s*0.7*pulse, -s*0.95, 0, -s*0.95);
  g.quadraticCurveTo(s*0.7*pulse, -s*0.95, s*pulse, 0);
  g.quadraticCurveTo(0, s*0.35, -s*pulse, 0);

  for(let i=0;i<j.tentacles;i++){
    const tx = lerp(-s*0.8, s*0.8, i/(j.tentacles-1));
    g.lineStyle(1.6, j.color, 0.5);
    g.moveTo(tx, s*0.2);
    for(let seg=1;seg<=4;seg++){
      const ny = s*0.2 + seg*s*0.45;
      const nx = tx + Math.sin(j.phase*4 + i + seg)*s*0.22;
      g.lineTo(nx, ny);
    }
  }
}

/* ============================= CRABS ============================= */

function spawnCrab(x){
  const g = new PIXI.Graphics();
  creaturesLayer.addChild(g);
  return {
    type:'crab',
    x,
    dir: Math.random()<0.5?-1:1,
    walkPhase: rand(0,Math.PI*2),
    color: Math.random()<0.5 ? 0xff7a5c : 0xe0552f,
    size: rand(8,13),
    pauseTimer: rand(60,180),
    g
  };
}

function updateCrab(c, dt){
  c.pauseTimer -= dt;
  if(c.pauseTimer <= 0){
    if(Math.random() < 0.5) c.dir *= -1;
    c.pauseTimer = rand(60,220);
  }
  c.x += c.dir * 0.5 * dt;
  c.walkPhase += 0.25*dt;

  const fy = floorY(c.x);
  c.g.x = c.x; c.g.y = fy - c.size*0.3;
  c.g.scale.x = c.dir < 0 ? -1 : 1;
  redrawCrab(c);
}

function redrawCrab(c){
  const g = c.g;
  g.clear();
  const s = c.size;
  const legSwing = Math.sin(c.walkPhase) * 0.35;

  g.lineStyle({ width: Math.max(1.3, s*0.13), color: c.color, ...ROUND });
  g.drawEllipse(0,0, s, s*0.62);

  g.moveTo(-s*0.3, -s*0.5); g.lineTo(-s*0.4, -s*0.85);
  g.moveTo(s*0.3, -s*0.5); g.lineTo(s*0.4, -s*0.85);

  g.moveTo(-s*0.95, -s*0.1);
  g.lineTo(-s*1.5, -s*0.5 + legSwing*s*0.4);
  g.moveTo(s*0.95, -s*0.1);
  g.lineTo(s*1.5, -s*0.5 - legSwing*s*0.4);

  for(let i=0;i<3;i++){
    const lx = lerp(-s*0.7, s*0.7, i/2);
    const sw = Math.sin(c.walkPhase + i*1.3) * s*0.4;
    g.moveTo(lx, s*0.4);
    g.lineTo(lx + sw*0.4, s*0.95 + Math.abs(sw)*0.2);
  }
}

/* ============================= TURTLES ============================= */

function spawnTurtle(x,y){
  const g = new PIXI.Graphics();
  creaturesLayer.addChild(g);
  return {
    type:'turtle',
    x, y,
    vx: rand(-1,1)||0.5, vy: rand(-0.2,0.2),
    targetX: x + rand(-400,400),
    targetY: clamp(y + rand(-150,150), WORLD_TOP_MARGIN+80, SEAFLOOR_Y-150),
    retarget: rand(200,400),
    angle: 0, displayAngle:0,
    flipperPhase: rand(0,Math.PI*2),
    size: rand(22,30),
    g
  };
}

function updateTurtle(t, dt){
  t.retarget -= dt;
  if(t.retarget <= 0){
    t.targetX = t.x + rand(-500,500);
    t.targetY = clamp(t.y + rand(-200,200), WORLD_TOP_MARGIN+80, SEAFLOOR_Y-150);
    t.retarget = rand(250,450);
  }
  const dx = t.targetX-t.x, dy = t.targetY-t.y;
  const d = Math.hypot(dx,dy)||1;
  t.vx = lerp(t.vx, (dx/d)*0.9, 0.01*dt);
  t.vy = lerp(t.vy, (dy/d)*0.9, 0.01*dt);
  t.x += t.vx*dt; t.y += t.vy*dt;
  t.angle = Math.atan2(t.vy, t.vx);
  t.displayAngle = lerpAngle(t.displayAngle, t.angle, 0.03*dt);
  t.flipperPhase += 0.05*dt;

  t.g.x = t.x; t.g.y = t.y; t.g.rotation = t.displayAngle;
  redrawTurtle(t);
}

function redrawTurtle(t){
  const g = t.g;
  g.clear();
  const s = t.size;
  g.lineStyle({ width: Math.max(1.6, s*0.07), color: 0x5fd17a, ...ROUND });
  g.drawEllipse(0,0, s*0.95, s*0.65);

  g.lineStyle({ width: Math.max(1.6, s*0.07), color: 0x5fd17a, alpha:0.5, ...ROUND });
  g.moveTo(-s*0.5,-s*0.3); g.lineTo(s*0.5,-s*0.3);
  g.moveTo(-s*0.5,0); g.lineTo(s*0.5,0);
  g.moveTo(-s*0.5,s*0.3); g.lineTo(s*0.5,s*0.3);

  g.lineStyle({ width: Math.max(1.6, s*0.07), color: 0x5fd17a, ...ROUND });
  g.moveTo(s*0.85,0); g.lineTo(s*1.25, 0);

  const fw = Math.sin(t.flipperPhase)*0.5;
  g.moveTo(s*0.2, -s*0.5); g.lineTo(s*0.55, -s*0.95 + fw*s*0.3);
  g.moveTo(-s*0.5, -s*0.4); g.lineTo(-s*0.85, -s*0.8 - fw*s*0.3);
  g.moveTo(s*0.2, s*0.5); g.lineTo(s*0.55, s*0.95 - fw*s*0.3);
  g.moveTo(-s*0.5, s*0.4); g.lineTo(-s*0.85, s*0.8 + fw*s*0.3);
}

/* ============================= SHARKS (rare) ============================= */

const SHARK_COLORS = { body:0x9aa6b2, fin:0xcfd8e0, eye:0x10151a };

function spawnShark(x,y){
  const g = new PIXI.Graphics();
  creaturesLayer.addChild(g);
  return {
    type:'shark',
    x, y,
    vx: Math.random()<0.5?-1:1, vy: 0,
    targetX: x + (Math.random()<0.5?-1:1)*rand(900,1500),
    angle:0, displayAngle:0,
    tailPhase: rand(0,10),
    size: rand(34,46),
    life: rand(900,1500),
    g
  };
}

function updateShark(sh, dt){
  const dx = sh.targetX - sh.x;
  sh.vx = lerp(sh.vx, Math.sign(dx)*2.1, 0.01*dt);
  sh.vy = lerp(sh.vy, Math.sin(performance.now()*0.0006+sh.x*0.001)*0.4, 0.02*dt);
  sh.x += sh.vx*dt; sh.y += sh.vy*dt;
  sh.y = clamp(sh.y, WORLD_TOP_MARGIN+100, SEAFLOOR_Y-150);
  sh.angle = Math.atan2(sh.vy, sh.vx);
  sh.displayAngle = lerpAngle(sh.displayAngle, sh.angle, 0.05*dt);
  sh.tailPhase += 0.1*dt*3;
  sh.life -= dt;

  sh.g.x = sh.x; sh.g.y = sh.y; sh.g.rotation = sh.displayAngle;
  drawFishShape(sh.g, sh.size, SHARK_COLORS, sh.tailPhase, 1, 0);

  // dorsal fin accent, drawn in the same local space after the body shape
  const s = sh.size;
  sh.g.lineStyle(1.6, SHARK_COLORS.fin);
  sh.g.moveTo(0,-s*0.25);
  sh.g.lineTo(s*0.15, -s*0.9);
  sh.g.lineTo(s*0.4,-s*0.2);
}

/* ============================= NPC MANAGER ============================= */

let npcs = []; // jelly, crab, turtle, shark
const SPAWN_RADIUS_MIN = 700;
const SPAWN_RADIUS_MAX = 1300;
const DESPAWN_RADIUS = 2100;
const MAX_NPCS = 60;
const MAX_SCHOOLS = 9;

let spawnTimer = 0;

function totalCreatureCount(){
  let n = npcs.length;
  for(const s of schools) n += s.members.length;
  return n;
}

function trySpawn(dt){
  spawnTimer -= dt;
  if(spawnTimer > 0) return;
  spawnTimer = rand(40,110);
  if(totalCreatureCount() >= MAX_NPCS) return;

  const angle = rand(0, Math.PI*2);
  const d = rand(SPAWN_RADIUS_MIN, SPAWN_RADIUS_MAX);
  let x = player.x + Math.cos(angle)*d;
  let y = clamp(player.y + Math.sin(angle)*d, WORLD_TOP_MARGIN+40, SEAFLOOR_Y-40);

  const r = Math.random();
  if(r < 0.40 && schools.length < MAX_SCHOOLS){
    spawnSchool(x,y);
  } else if(r < 0.62){
    npcs.push(spawnJellyfish(x, clamp(y, WORLD_TOP_MARGIN+60, SEAFLOOR_Y-300)));
  } else if(r < 0.84){
    npcs.push(spawnCrab(x));
  } else if(r < 0.95){
    npcs.push(spawnTurtle(x,y));
  } else {
    npcs.push(spawnShark(x,y));
  }
}

function destroyNpc(n){ creaturesLayer.removeChild(n.g); n.g.destroy(); }

function updateNPCs(dt){
  for(const n of npcs){
    if(n.type==='jelly') updateJelly(n, dt);
    else if(n.type==='crab') updateCrab(n, dt);
    else if(n.type==='turtle') updateTurtle(n, dt);
    else if(n.type==='shark') updateShark(n, dt);
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

  // sand silhouette
  terrainG.beginFill(0x5c4827); // base fill; gradient feel comes from the outline + decor on top
  terrainG.moveTo(left, floorY(left));
  for(let wx = left; wx <= right; wx += 24){
    terrainG.lineTo(wx, floorY(wx));
  }
  terrainG.lineTo(right, SEAFLOOR_Y + 400);
  terrainG.lineTo(left, SEAFLOOR_Y + 400);
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

// small HSL->hex helper so decor can use the same hue-based color logic as before
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

/* ============================= SUN RAYS ============================= */

const rayGfx = new PIXI.Graphics();
raysLayer.addChild(rayGfx);

function drawSunRays(time){
  rayGfx.clear();
  const depthFrac = clamp(player.y / SEAFLOOR_Y, 0, 1);
  if(depthFrac > 0.5) return;
  const alpha = (1 - depthFrac/0.5) * 0.16;
  if(alpha <= 0.005) return;

  const W = app.screen.width, H = app.screen.height;
  rayGfx.beginFill(0xfff7d6, alpha);
  const count = 6;
  for(let i=0;i<count;i++){
    const baseX = ((i*260 + time*0.01) % (W+400)) - 200 - (player.x*0.05 % 260);
    const topX = baseX;
    const skew = 60;
    rayGfx.moveTo(topX, -50);
    rayGfx.lineTo(topX+60, -50);
    rayGfx.lineTo(topX+60+skew, H+150);
    rayGfx.lineTo(topX+skew, H+150);
    rayGfx.closePath();
  }
  rayGfx.endFill();
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

/* ============================= WATER BACKGROUND (CSS) ============================= */

const waterBg = document.getElementById('water-bg');
function updateWaterBackground(){
  const H = app.screen.height;
  const topFrac = clamp((player.y - H/2) / SEAFLOOR_Y, 0, 1);
  const botFrac = clamp((player.y + H/2) / SEAFLOOR_Y, 0, 1);
  const c1 = colorAtDepthFraction(topFrac);
  const c2 = colorAtDepthFraction(botFrac);
  waterBg.style.background = `linear-gradient(to bottom, ${rgbToCss(c1)} 0%, ${rgbToCss(c2)} 100%)`;
}

/* ============================= HUD ============================= */

const depthValEl = document.getElementById('depthVal');
const depthDotEl = document.getElementById('depthdot');
const depthBarEl = document.getElementById('depthbar');

function updateHUD(){
  depthValEl.textContent = Math.round((player.y - SURFACE_Y)/8);
  const frac = clamp(player.y / SEAFLOOR_Y, 0, 1);
  const barH = depthBarEl.clientHeight;
  depthDotEl.style.top = (frac*(barH-16)) + 'px';
}

/* ============================= MAIN LOOP ============================= */

let bubbleSpawnTimer = 0;

// seed the world with some initial life so it's not empty on load
(function seedWorld(){
  for(let i=0;i<6;i++){
    const x = player.x + rand(-900,900);
    const y = clamp(player.y + rand(-500,500), 200, SEAFLOOR_Y-200);
    const r = Math.random();
    if(r<0.4) spawnSchool(x,y);
    else if(r<0.7) npcs.push(spawnJellyfish(x,y));
    else npcs.push(spawnCrab(x));
  }
})();

function positionPlayerGraphic(){
  playerG.x = app.screen.width/2;
  playerG.y = app.screen.height/2;
}
window.addEventListener('resize', positionPlayerGraphic);
positionPlayerGraphic();

app.ticker.add((dt)=>{
  const speed = updatePlayer(dt);
  updateNPCs(dt);
  trySpawn(dt);

  bubbleSpawnTimer -= dt;
  if(bubbleSpawnTimer <= 0){
    bubbleSpawnTimer = rand(4,10);
    spawnBubble(false);
    if(speed > 0.5 && Math.random()<0.6) spawnBubble(true);
  }
  updateBubbles(dt);

  // camera: move the world opposite the player so the player stays centered
  world.x = -(player.x - app.screen.width/2);
  world.y = -(player.y - app.screen.height/2) - player.bob;

  const now = performance.now();
  drawSeafloorAndDecor(now);
  redrawBubbles();
  drawSurfaceLine(now);
  drawSunRays(now);

  playerG.y = app.screen.height/2 + player.bob;
  drawFishShape(playerG, player.size, PLAYER_COLORS, player.tailPhase, speed/player.maxSpeed, 0);
  playerG.rotation = player.displayAngle;

  updateWaterBackground();
  updateHUD();
});

})();
