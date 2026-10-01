/* =============================================================================
   dungeons.js — 5 seafloor caves with randomly generated mazes, plus the
   abilities you earn by clearing them.

   Each cave entrance sits on the seafloor. Swim into the dark mouth to enter.
   Inside: a fresh random maze every visit, patrolling guardians, pearls in the
   dead ends (XP) and a glowing relic at the farthest point. Grab the relic
   to clear the cave. The first clear of each cave unlocks an ability:

     1 Coral Hollow    -> Shapeshift   (F)      fish / shark / glass minnow
     2 Kelp Labyrinth  -> Tidal Dash   (Shift)  burst of speed
     3 Glimmer Grotto  -> Biolight     (G)      glow, see further in caves
     4 Abyssal Vault   -> Bubble Shield(B)      guardians pass through you
     5 Tidal Temple    -> Sea Wings    (hold Space in the air) glide

   Loaded after fish.js, before game.js. game.js calls MoceanDungeons(ctx).
   ============================================================================= */
(function(global){
"use strict";

global.MoceanDungeons = function(ctx){
  const { app, world, player, keys, rand, randi, clamp, lerpAngle, floorY,
          PLAYER_COLORS, SHARK_COLORS, hideWhenInside, addXP, popText,
          burstBubbles, playBlip, isStarted } = ctx;

  const SAVE_KEY = 'mocean.dungeons.v1';
  const T = 110; // maze tile size in world units

  /* ---------------------------------------------------------------- data */

  const DUNGEONS = [
    { id:1, name:'Coral Hollow',   x: 2200, mw:5,  mh:4, guards:2, wall:0x2b6f78, floor:0x0a2a33, accent:0x7fe8d4, ability:'shapeshift' },
    { id:2, name:'Kelp Labyrinth', x:-3400, mw:7,  mh:5, guards:3, wall:0x2f6b3a, floor:0x0b2412, accent:0xb6ff7a, ability:'dash' },
    { id:3, name:'Glimmer Grotto', x: 5600, mw:8,  mh:6, guards:4, wall:0x5a3a8a, floor:0x150b2a, accent:0xd59bff, ability:'glow' },
    { id:4, name:'Abyssal Vault',  x:-8200, mw:10, mh:7, guards:5, wall:0x7a2f3f, floor:0x2a0b13, accent:0xff7a8f, ability:'shield' },
    { id:5, name:'Tidal Temple',   x:11000, mw:12, mh:8, guards:7, wall:0x8a7a3a, floor:0x2a230b, accent:0xffe28a, ability:'wings' }
  ];

  const ABILITIES = {
    shapeshift: { name:'Shapeshift',    key:'F',     desc:'Morph into a shark or a glass minnow' },
    dash:       { name:'Tidal Dash',    key:'Shift', desc:'Burst of speed' },
    glow:       { name:'Biolight',      key:'G',     desc:'Glow to light up dark caves' },
    shield:     { name:'Bubble Shield', key:'B',     desc:'Guardians pass right through you' },
    wings:      { name:'Sea Wings',     key:'Space', desc:'Hold Space in the air to glide' }
  };

  const FORMS = {
    fish:   { name:'Reef Fish',    colors:PLAYER_COLORS,                    size:1.0,  speed:1.0,  level:0 },
    shark:  { name:'Shark',        colors:SHARK_COLORS,                     size:1.55, speed:1.12, level:3 },
    minnow: { name:'Glass Minnow', colors:{ body:0xbff5ff, fin:0xffffff },  size:0.55, speed:1.4,  level:0 }
  };
  const FORM_ORDER = ['fish','shark','minnow'];

  /* ---------------------------------------------------------------- save */

  const save = { cleared:[], form:'fish', glow:false };
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(raw) Object.assign(save, JSON.parse(raw));
  }catch(err){}
  function persist(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }catch(err){} }

  const has = (id)=> save.cleared.some(n=> DUNGEONS[n-1].ability === id);
  const unlockedList = ()=> Object.keys(ABILITIES).filter(has);
  if(!has('shapeshift')) save.form = 'fish';

  /* ---------------------------------------------------------- scene layers */

  const caveC = new PIXI.Container();           // entrances on the seafloor
  const caveG = new PIXI.Graphics();
  caveC.addChild(caveG);
  const dungeonC = new PIXI.Container();        // the maze itself
  dungeonC.visible = false;
  const mazeG = new PIXI.Graphics();
  const entG  = new PIXI.Graphics();
  dungeonC.addChild(mazeG, entG);

  const labels = DUNGEONS.map(d=>{
    const t = new PIXI.Text('', { fontFamily:'Roboto Mono, monospace', fontSize:15, fill:0xdff6ff,
                                  stroke:0x000000, strokeThickness:3 });
    t.anchor.set(0.5, 1);
    caveC.addChild(t);
    return t;
  });

  // insert right above the seafloor, and the maze right below bubbles
  world.addChildAt(caveC, world.getChildIndex(ctx.terrainG) + 1);
  world.addChildAt(dungeonC, world.getChildIndex(ctx.bubblesG));

  const auraG = new PIXI.Graphics();
  app.stage.addChildAt(auraG, app.stage.getChildIndex(ctx.playerG));

  // darkness: a big texture with a clear hole in the middle, scaled to the light radius
  const darkCanvas = document.createElement('canvas');
  darkCanvas.width = darkCanvas.height = 512;
  {
    const c = darkCanvas.getContext('2d');
    const gr = c.createRadialGradient(256,256,0, 256,256,256);
    gr.addColorStop(0,    'rgba(1,6,10,0)');
    gr.addColorStop(0.10, 'rgba(1,6,10,0)');
    gr.addColorStop(0.19, 'rgba(1,6,10,0.9)');
    gr.addColorStop(0.26, 'rgba(1,6,10,1)');
    gr.addColorStop(1,    'rgba(1,6,10,1)');
    c.fillStyle = gr; c.fillRect(0,0,512,512);
  }
  const darkS = new PIXI.Sprite(PIXI.Texture.from(darkCanvas));
  darkS.anchor.set(0.5);
  darkS.visible = false;
  app.stage.addChild(darkS);

  /* ------------------------------------------------------------------ DOM */

  const bar = document.createElement('div');
  bar.id = 'ability-bar';
  document.body.appendChild(bar);
  const chips = {};
  for(const id of Object.keys(ABILITIES)){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ability-chip';
    b.addEventListener('pointerdown', (e)=>{ e.preventDefault(); e.stopPropagation(); activate(id); });
    bar.appendChild(b);
    chips[id] = b;
  }

  const mapEl = document.createElement('canvas');
  mapEl.id = 'dungeon-map';
  document.body.appendChild(mapEl);
  const mapCtx = mapEl.getContext('2d');

  const banner = document.createElement('div');
  banner.id = 'ability-banner';
  banner.innerHTML = '<div class="ab-small"></div><div class="ab-big"></div><div class="ab-desc"></div>';
  document.body.appendChild(banner);
  function showBanner(small, big, desc){
    banner.children[0].textContent = small;
    banner.children[1].textContent = big;
    banner.children[2].textContent = desc || '';
    banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show');
  }

  const waterBgEl = document.getElementById('water-bg');

  /* ----------------------------------------------------------- abilities */

  let dashT = 0, dashCd = 0, shieldT = 0, shieldCd = 0, formCd = 0, invuln = 0, enterCd = 0;
  let lightR = 330;

  function activate(id){
    if(!isStarted() || !has(id)) return;
    if(id === 'shapeshift'){
      if(formCd > 0) return;
      formCd = 25;
      save.form = FORM_ORDER[(FORM_ORDER.indexOf(save.form) + 1) % FORM_ORDER.length];
      persist();
      burstBubbles(player.x, player.y, 14);
      popText(FORMS[save.form].name, 'flip');
      playBlip();
    } else if(id === 'dash'){
      if(dashCd > 0) return;
      const a = player.displayAngle;
      dashT = 14; dashCd = 110;
      player.vx += Math.cos(a) * 12; player.vy += Math.sin(a) * 12;
      burstBubbles(player.x, player.y, 12);
      playBlip();
    } else if(id === 'glow'){
      save.glow = !save.glow; persist();
      popText(save.glow ? 'Biolight on' : 'Biolight off', 'flip');
    } else if(id === 'shield'){
      if(shieldCd > 0 || shieldT > 0) return;
      shieldT = 300; shieldCd = 720;
      burstBubbles(player.x, player.y, 16);
      popText('Bubble Shield!', 'flip');
      playBlip();
    } else if(id === 'wings'){
      popText('Hold Space in the air to glide', 'flip');
    }
  }

  function handleKey(e){
    if(!isStarted()) return false;
    if(e.key === 'Escape' && active){ exitDungeon(false); return true; }
    if(e.repeat) return false;
    let id = null;
    if(e.key === 'f' || e.key === 'F') id = 'shapeshift';
    else if(e.key === 'Shift') id = 'dash';
    else if(e.key === 'g' || e.key === 'G') id = 'glow';
    else if(e.key === 'b' || e.key === 'B') id = 'shield';
    if(!id || !has(id)) return false;
    activate(id);
    return true;
  }

  const look = ()=> FORMS[save.form] || FORMS.fish;

  function refreshBar(){
    const list = unlockedList();
    bar.style.display = (isStarted() && list.length) ? 'flex' : 'none';
    if(!list.length) return;
    for(const id of Object.keys(ABILITIES)){
      const el = chips[id], ab = ABILITIES[id];
      if(!has(id)){ el.style.display = 'none'; continue; }
      el.style.display = '';
      let extra = '', cls = 'ability-chip';
      if(id === 'shapeshift') extra = ' · ' + look().name;
      if(id === 'glow' && save.glow) cls += ' on';
      if(id === 'shield' && shieldT > 0) cls += ' on';
      if((id === 'dash' && dashCd > 0) || (id === 'shield' && shieldCd > 0 && shieldT <= 0)) cls += ' cd';
      if(el.className !== cls) el.className = cls;
      const txt = `[${ab.key}] ${ab.name}${extra}`;
      if(el.textContent !== txt) el.textContent = txt;
    }
  }

  function drawAura(now){
    auraG.clear();
    auraG.x = app.screen.width/2;
    auraG.y = app.screen.height/2 + player.bob;
    const s = player.size * look().size;
    if(save.glow && has('glow')){
      const p = 0.5 + 0.5*Math.sin(now*0.004);
      for(let i=4;i>=1;i--){
        auraG.beginFill(0x9be8ff, 0.05 + 0.02*p);
        auraG.drawCircle(0, 0, s*(1.2 + i*0.9 + p*0.25));
        auraG.endFill();
      }
    }
    if(shieldT > 0){
      const flick = shieldT < 70 && Math.floor(shieldT/5)%2 === 0 ? 0.4 : 1;
      auraG.lineStyle(2.5, 0xcff6ff, 0.8*flick);
      auraG.beginFill(0x9be8ff, 0.12*flick);
      auraG.drawCircle(0, 0, s*2.1);
      auraG.endFill();
    }
    if(dashT > 0){
      auraG.lineStyle(0);
      auraG.beginFill(0xffffff, 0.18);
      auraG.drawCircle(-Math.cos(player.displayAngle)*s, -Math.sin(player.displayAngle)*s, s*0.9);
      auraG.endFill();
    }
  }

  /* ------------------------------------------------------- overworld caves */

  const baseY = (d)=> floorY(d.x);

  function drawEntrances(now){
    caveG.clear();
    DUNGEONS.forEach((d, i)=>{
      const lab = labels[i];
      if(Math.abs(player.x - d.x) > 2400){ lab.visible = false; return; }
      lab.visible = true;
      const by = baseY(d), done = save.cleared.includes(d.id);
      // rocky dome
      caveG.lineStyle(2, 0x1c1c22, 0.7);
      caveG.beginFill(0x4b4b55);
      caveG.moveTo(d.x - 190, by + 20);
      const N = 16;
      for(let k=0;k<=N;k++){
        const a = Math.PI - (k/N)*Math.PI;
        const bump = 1 + Math.sin(k*2.7 + d.id)*0.07;
        caveG.lineTo(d.x + Math.cos(a)*190*bump, by + 10 - Math.sin(a)*210*bump);
      }
      caveG.lineTo(d.x + 190, by + 20);
      caveG.closePath(); caveG.endFill();
      // mouth
      caveG.lineStyle(0);
      caveG.beginFill(0x010609);
      caveG.drawEllipse(d.x, by - 50, 62, 56);
      caveG.endFill();
      const pulse = 0.55 + 0.35*Math.sin(now*0.003 + d.id);
      caveG.lineStyle(4, done ? 0xffe28a : d.accent, pulse);
      caveG.drawEllipse(d.x, by - 50, 66, 60);
      lab.text = (done ? '★ ' : '') + d.id + '. ' + d.name;
      lab.x = d.x; lab.y = by - 225;
    });
  }

  function checkEnter(){
    if(enterCd > 0 || player.y < 40) return;
    for(const d of DUNGEONS){
      const dx = player.x - d.x, dy = player.y - (baseY(d) - 50);
      if(dx*dx + dy*dy < 55*55){ enterDungeon(d); return; }
    }
  }

  /* ------------------------------------------------------------- the maze */

  let active = false;
  let M = null;

  function genMaze(mw, mh){
    const W = mw*2+1, H = mh*2+1;
    const g = Array.from({length:H}, ()=> new Array(W).fill(1));
    const open = Array.from({length:mh}, ()=> Array.from({length:mw}, ()=> []));
    const vis = Array.from({length:mh}, ()=> new Array(mw).fill(false));
    const st = [[0,0]]; vis[0][0] = true; g[1][1] = 0;
    while(st.length){
      const [cx,cy] = st[st.length-1];
      const nb = [[1,0],[-1,0],[0,1],[0,-1]].map(d=>[cx+d[0], cy+d[1]])
        .filter(([x,y])=> x>=0 && y>=0 && x<mw && y<mh && !vis[y][x]);
      if(!nb.length){ st.pop(); continue; }
      const [nx,ny] = nb[randi(0, nb.length-1)];
      vis[ny][nx] = true;
      g[ny*2+1][nx*2+1] = 0;
      g[cy+ny+1][cx+nx+1] = 0;      // knock out the wall between the two cells
      open[cy][cx].push([nx,ny]); open[ny][nx].push([cx,cy]);
      st.push([nx,ny]);
    }
    // distances from the start (BFS); the last cell reached is a farthest one
    const dist = Array.from({length:mh}, ()=> new Array(mw).fill(-1));
    const q = [[0,0]]; dist[0][0] = 0;
    for(let i=0;i<q.length;i++){
      const [x,y] = q[i];
      for(const [nx,ny] of open[y][x]) if(dist[ny][nx] < 0){ dist[ny][nx] = dist[y][x]+1; q.push([nx,ny]); }
    }
    return { W, H, g, open, dist, orbCell: q[q.length-1] };
  }

  const cellPos = (cx,cy)=> ({ x:(cx*2+1.5)*T, y:(cy*2+1.5)*T });

  function buildMazeGraphics(d, m){
    mazeG.clear();
    mazeG.beginFill(d.floor); mazeG.drawRect(0,0,m.W*T,m.H*T); mazeG.endFill();
    const wall = (x,y)=> y<0||x<0||y>=m.H||x>=m.W|| m.g[y][x]===1;
    for(let y=0;y<m.H;y++) for(let x=0;x<m.W;x++){
      if(m.g[y][x] === 1){
        mazeG.beginFill(d.wall); mazeG.drawRect(x*T, y*T, T, T); mazeG.endFill();
      } else if((x+y)%2 === 0){
        mazeG.beginFill(0xffffff, 0.03); mazeG.drawRect(x*T, y*T, T, T); mazeG.endFill();
      }
    }
    mazeG.lineStyle(3, d.accent, 0.4);
    for(let y=0;y<m.H;y++) for(let x=0;x<m.W;x++){
      if(m.g[y][x] !== 1) continue;
      if(!wall(x,y-1)){ mazeG.moveTo(x*T, y*T);       mazeG.lineTo((x+1)*T, y*T); }
      if(!wall(x,y+1)){ mazeG.moveTo(x*T, (y+1)*T);   mazeG.lineTo((x+1)*T, (y+1)*T); }
      if(!wall(x-1,y)){ mazeG.moveTo(x*T, y*T);       mazeG.lineTo(x*T, (y+1)*T); }
      if(!wall(x+1,y)){ mazeG.moveTo((x+1)*T, y*T);   mazeG.lineTo((x+1)*T, (y+1)*T); }
    }
  }

  function enterDungeon(d){
    const m = genMaze(d.mw, d.mh);
    buildMazeGraphics(d, m);

    // pearls in dead ends, guardians far from the start
    const pearls = [], cells = [];
    for(let cy=0; cy<d.mh; cy++) for(let cx=0; cx<d.mw; cx++){
      cells.push([cx,cy]);
      const isStart = cx===0 && cy===0, isOrb = cx===m.orbCell[0] && cy===m.orbCell[1];
      if(m.open[cy][cx].length === 1 && !isStart && !isOrb){
        const p = cellPos(cx,cy); pearls.push({ x:p.x, y:p.y, got:false });
      }
    }
    const minDist = Math.min(6, Math.floor(m.dist[m.orbCell[1]][m.orbCell[0]] * 0.6));
    let far = cells.filter(([x,y])=> m.dist[y][x] >= minDist);
    if(!far.length) far = cells;
    const guards = [];
    for(let i=0;i<d.guards;i++){
      const [cx,cy] = far[randi(0, far.length-1)];
      const p = cellPos(cx,cy);
      guards.push({ cx, cy, px:-1, py:-1, x:p.x, y:p.y, tx:p.x, ty:p.y, ncx:cx, ncy:cy,
                    speed: 1.5 + d.id*0.22 + rand(0,0.3), r:24, ph:rand(0,6) });
    }
    const start = cellPos(0,0), orb = cellPos(m.orbCell[0], m.orbCell[1]);
    const seen = Array.from({length:m.H}, ()=> new Array(m.W).fill(false));

    M = { d, m, pearls, guards, start, orb, seen, armed:false, done:false, frame:0 };
    const cell = Math.max(4, Math.floor(Math.min(230/m.W, 170/m.H)));
    mapEl.width = m.W*cell; mapEl.height = m.H*cell; M.cell = cell;

    active = true;
    player.flipping = false; player.inAir = false;
    player.x = start.x; player.y = start.y; player.vx = player.vy = 0;
    invuln = 60;
    hideWhenInside(true);
    waterBgEl.style.display = 'none';
    dungeonC.visible = true; darkS.visible = true; mapEl.style.display = 'block';
    showBanner('Entering', d.name, 'Find the relic at the end of the maze. Esc leaves.');
    playBlip();
  }

  function exitDungeon(){
    if(!active) return;
    const d = M.d;
    active = false;
    dungeonC.visible = false; darkS.visible = false; mapEl.style.display = 'none';
    hideWhenInside(false);
    waterBgEl.style.display = '';
    player.x = d.x + 230; player.y = baseY(d) - 60;
    player.vx = player.vy = 0;
    enterCd = 180;
    M = null;
  }

  /* --------------------------------------------------------- dungeon tick */

  const isWall = (tx,ty)=> !M || ty<0 || tx<0 || ty>=M.m.H || tx>=M.m.W || M.m.g[ty][tx] === 1;

  function collide(r){
    const tx0 = Math.floor((player.x - r)/T), tx1 = Math.floor((player.x + r)/T);
    const ty0 = Math.floor((player.y - r)/T), ty1 = Math.floor((player.y + r)/T);
    for(let ty=ty0; ty<=ty1; ty++) for(let tx=tx0; tx<=tx1; tx++){
      if(!isWall(tx,ty)) continue;
      const nx = clamp(player.x, tx*T, tx*T+T), ny = clamp(player.y, ty*T, ty*T+T);
      const dx = player.x - nx, dy = player.y - ny, d2 = dx*dx + dy*dy;
      if(d2 >= r*r || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), push = (r - d)/d;
      player.x += dx*push; player.y += dy*push;
      const ux = dx/d, uy = dy/d, vn = player.vx*ux + player.vy*uy;
      if(vn < 0){ player.vx -= vn*ux; player.vy -= vn*uy; }
    }
  }

  function updatePlayer(dt){
    if(player.jumpCd > 0) player.jumpCd -= dt;
    player.chomp *= Math.pow(0.85, dt);
    const sm = speedMul(), acc = player.accel * sm;
    let ax = 0, ay = 0;
    if(keys.left) ax -= acc;  if(keys.right) ax += acc;
    if(keys.up) ay -= acc;    if(keys.down) ay += acc;
    if(ax !== 0 && ay !== 0){ ax *= 0.78; ay *= 0.78; }
    player.vx += ax*dt; player.vy += ay*dt;
    const dr = Math.pow(player.drag, dt);
    player.vx *= dr; player.vy *= dr;
    const maxS = player.maxSpeed * sm, raw = Math.hypot(player.vx, player.vy);
    if(raw > maxS){ const k = maxS/raw; player.vx *= k; player.vy *= k; }

    const r = player.size * look().size * 0.75;
    const steps = Math.max(1, Math.ceil(raw*dt/18));
    for(let i=0;i<steps;i++){
      player.x += player.vx*dt/steps; player.y += player.vy*dt/steps;
      collide(r);
    }

    const speed = Math.hypot(player.vx, player.vy);
    if(speed > 0.08) player.angle = Math.atan2(player.vy, player.vx);
    player.displayAngle = lerpAngle(player.displayAngle, player.angle, 0.12*dt);
    const diff = ((player.angle - player.displayAngle + Math.PI) % (Math.PI*2)) - Math.PI;
    player.bank = clamp(diff*1.8, -1, 1);
    player.tailPhase += 0.155*dt*(0.5 + Math.min(speed/player.maxSpeed,1)*1.85)*2.2;
    player.bob = Math.sin(performance.now()*0.0025)*1.6;
    player.inAir = false;
    return speed;
  }

  function hitPlayer(){
    player.x = M.start.x; player.y = M.start.y; player.vx = player.vy = 0;
    invuln = 120;
    burstBubbles(player.x, player.y, 14);
    popText('Swept back to the start!', 'warn');
  }

  function stepGuard(e, dt){
    const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy), step = e.speed*dt;
    if(d > step){ e.x += dx/d*step; e.y += dy/d*step; return; }
    e.x = e.tx; e.y = e.ty;
    const from = [e.cx, e.cy];
    e.cx = e.ncx; e.cy = e.ncy;
    let opts = M.m.open[e.cy][e.cx];
    const fwd = opts.filter(([x,y])=> !(x === from[0] && y === from[1]));
    if(fwd.length) opts = fwd;
    let pick;
    if(Math.hypot(player.x - e.x, player.y - e.y) < 330 && Math.random() < 0.8){
      pick = opts.reduce((best, c)=>{
        const p = cellPos(c[0], c[1]);
        const dd = Math.hypot(p.x - player.x, p.y - player.y);
        return (!best || dd < best.dd) ? { c, dd } : best;
      }, null).c;
    } else pick = opts[randi(0, opts.length-1)];
    const p = cellPos(pick[0], pick[1]);
    e.ncx = pick[0]; e.ncy = pick[1]; e.tx = p.x; e.ty = p.y;
  }

  function completeDungeon(){
    if(M.done) return;
    M.done = true;
    const d = M.d, first = !save.cleared.includes(d.id);
    burstBubbles(player.x, player.y, 24);
    playBlip();
    if(first){
      save.cleared.push(d.id); persist();
      const ab = ABILITIES[d.ability];
      showBanner('Ability unlocked', ab.name, `${ab.desc}  ·  press ${ab.key}`);
      addXP(120*d.id, 'Cave cleared!');
    } else {
      showBanner('Cave cleared', d.name, 'The relic hums softly.');
      addXP(25*d.id, 'Relic');
    }
    setTimeout(()=>{ if(active && M && M.d === d) exitDungeon(); }, 3200);
  }

  function updateDungeon(dt, now){
    M.frame++;
    const pr = player.size * look().size * 0.75;
    // exploration memory for the minimap
    const ptx = Math.floor(player.x/T), pty = Math.floor(player.y/T);
    for(let dy=-3; dy<=3; dy++) for(let dx=-3; dx<=3; dx++){
      const x = ptx+dx, y = pty+dy;
      if(dx*dx + dy*dy <= 10 && y>=0 && x>=0 && y<M.m.H && x<M.m.W) M.seen[y][x] = true;
    }

    // guardians
    const protectedNow = shieldT > 0 || invuln > 0 || M.done;
    for(const e of M.guards){
      stepGuard(e, dt);
      if(!protectedNow && Math.hypot(player.x - e.x, player.y - e.y) < e.r + pr*0.8){ hitPlayer(); break; }
    }

    // pearls
    for(const p of M.pearls){
      if(!p.got && Math.hypot(player.x - p.x, player.y - p.y) < 42 + pr){
        p.got = true; addXP(5 + 3*M.d.id, 'Pearl'); burstBubbles(p.x, p.y, 6); playBlip();
      }
    }

    // relic + exit portal
    if(!M.done && Math.hypot(player.x - M.orb.x, player.y - M.orb.y) < 46 + pr) completeDungeon();
    const pd = Math.hypot(player.x - M.start.x, player.y - M.start.y);
    if(pd > 180) M.armed = true;
    if(M.armed && pd < 34 && !M.done){ exitDungeon(); return; }

    // light
    const target = save.glow && has('glow') ? 620 : 330;
    lightR += (target - lightR) * 0.06 * dt;
    darkS.x = app.screen.width/2; darkS.y = app.screen.height/2 + player.bob;
    darkS.width = darkS.height = lightR / 0.085;

    drawEntities(now);
    if(M.frame % 6 === 0) drawMap();
  }

  function drawEntities(now){
    const d = M.d;
    entG.clear();
    // exit portal
    const s = M.start;
    entG.lineStyle(3, 0x9be8ff, 0.6);
    for(let i=0;i<3;i++) entG.drawCircle(s.x, s.y, 14 + i*7 + Math.sin(now*0.004 + i)*2);
    entG.lineStyle(0);
    // pearls
    for(const p of M.pearls){
      if(p.got) continue;
      entG.beginFill(0xffffff, 0.9); entG.drawCircle(p.x, p.y, 8); entG.endFill();
      entG.beginFill(d.accent, 0.25); entG.drawCircle(p.x, p.y, 16 + Math.sin(now*0.005 + p.x)*3); entG.endFill();
    }
    // relic
    const o = M.orb, pu = 0.5 + 0.5*Math.sin(now*0.004);
    for(let i=3;i>=1;i--){ entG.beginFill(d.accent, 0.08*i); entG.drawCircle(o.x, o.y, 22 + i*14 + pu*8); entG.endFill(); }
    entG.beginFill(0xffffff); entG.drawCircle(o.x, o.y, 12); entG.endFill();
    entG.lineStyle(3, d.accent, 0.9); entG.drawCircle(o.x, o.y, 26); entG.lineStyle(0);
    // guardians: spiky shades with glaring eyes
    for(const e of M.guards){
      const a = now*0.002 + e.ph;
      entG.beginFill(0x1a0f2e, 0.95);
      entG.moveTo(e.x + Math.cos(a)*40, e.y + Math.sin(a)*40);
      for(let k=1;k<=16;k++){
        const rr = k%2 ? 26 : 40, aa = a + k*Math.PI/8;
        entG.lineTo(e.x + Math.cos(aa)*rr, e.y + Math.sin(aa)*rr);
      }
      entG.closePath(); entG.endFill();
      entG.beginFill(0xff4a4a); entG.drawCircle(e.x - 8, e.y - 4, 5); entG.drawCircle(e.x + 8, e.y - 4, 5); entG.endFill();
      entG.beginFill(0x000000);
      const lx = clamp((player.x - e.x)/60, -2, 2), ly = clamp((player.y - e.y)/60, -2, 2);
      entG.drawCircle(e.x - 8 + lx, e.y - 4 + ly, 2); entG.drawCircle(e.x + 8 + lx, e.y - 4 + ly, 2); entG.endFill();
    }
  }

  function drawMap(){
    const c = M.cell, m = M.m, d = M.d, x = mapCtx;
    x.clearRect(0,0,mapEl.width,mapEl.height);
    for(let ty=0; ty<m.H; ty++) for(let tx=0; tx<m.W; tx++){
      if(!M.seen[ty][tx]) continue;
      x.fillStyle = m.g[ty][tx] === 1 ? '#' + d.wall.toString(16).padStart(6,'0') : 'rgba(223,246,255,0.22)';
      x.fillRect(tx*c, ty*c, c, c);
    }
    const dot = (wx, wy, col, rr)=>{
      const tx = Math.floor(wx/T), ty = Math.floor(wy/T);
      if(!M.seen[ty] || !M.seen[ty][tx]) return;
      x.fillStyle = col; x.beginPath(); x.arc(wx/T*c, wy/T*c, rr, 0, Math.PI*2); x.fill();
    };
    dot(M.start.x, M.start.y, '#9be8ff', c*0.5);
    dot(M.orb.x, M.orb.y, '#ffffff', c*0.6);
    for(const e of M.guards) dot(e.x, e.y, '#ff4a4a', c*0.45);
    x.fillStyle = '#ffb36b'; x.beginPath(); x.arc(player.x/T*c, player.y/T*c, c*0.55, 0, Math.PI*2); x.fill();
  }

  /* ------------------------------------------------------------- per frame */

  function update(dt){
    const now = performance.now();
    if(dashT > 0) dashT -= dt;
    if(dashCd > 0) dashCd -= dt;
    if(shieldT > 0) shieldT -= dt;
    if(shieldCd > 0) shieldCd -= dt;
    if(formCd > 0) formCd -= dt;
    if(invuln > 0) invuln -= dt;
    if(enterCd > 0) enterCd -= dt;

    refreshBar();
    drawAura(now);
    if(!isStarted() && !active){ caveG.clear(); return; }
    if(active) updateDungeon(dt, now);
    else { drawEntrances(now); checkEnter(); }
  }

  /* ----------------------------------------------- hooks used by game.js */

  function speedMul(){ return look().speed * (dashT > 0 ? 2.4 : 1); }
  function gravityMul(){ return (has('wings') && keys.space) ? 0.2 : 1; }
  function levelBonus(){ return look().level; }
  function depth(){ return M ? Math.round(baseY(M.d)/8) : 0; }

  /* ---------------------------------------------------- /dungeon command */

  function command(args){
    const sub = (args[0] || 'list').toLowerCase();
    if(sub === 'exit'){
      if(!active) return [['Not inside a cave.', 'err']];
      exitDungeon(); return [['Left the cave.', 'ok']];
    }
    if(sub === 'reset'){
      save.cleared = []; save.form = 'fish'; save.glow = false; persist();
      return [['Cave progress and abilities reset.', 'ok']];
    }
    if(sub === 'unlock'){
      save.cleared = DUNGEONS.map(d=>d.id); persist();
      return [['All abilities unlocked.', 'ok']];
    }
    const n = parseInt(sub, 10);
    if(n >= 1 && n <= 5){
      if(active) exitDungeon();
      const d = DUNGEONS[n-1];
      player.x = d.x + 260; player.y = baseY(d) - 80; player.vx = player.vy = 0; enterCd = 120;
      return [[`Teleported beside ${d.name}.`, 'ok']];
    }
    const lines = [['Caves (/dungeon <1-5> teleports, exit, reset, unlock):', 'info']];
    for(const d of DUNGEONS){
      const ab = ABILITIES[d.ability];
      lines.push([`${d.id}. ${d.name} x=${d.x}  ${save.cleared.includes(d.id) ? '[cleared] ' : ''}-> ${ab.name} (${ab.key})`, 'info']);
    }
    return lines;
  }

  return {
    get active(){ return active; },
    update, updatePlayer, handleKey, look, speedMul, gravityMul, levelBonus, depth, command
  };
};

})(window);
