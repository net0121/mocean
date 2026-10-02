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

   Every cave ends in a boss arena. Space fires bubbles inside caves, you have
   3 hearts, and the relic only appears once the boss is beaten. Caves 2, 3 and
   5 float in open water; an edge-of-screen compass points to the nearest
   uncleared cave.

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
    { id:1, name:'Coral Hollow',   x: 2200, mw:5,  mh:4, guards:3, wall:0x2b6f78, floor:0x0a2a33, accent:0x7fe8d4, ability:'shapeshift',
      enemies:['crab','urchin'], boss:{ kind:'crab',   name:'Claw Baron',      r:60 } },
    { id:2, name:'Kelp Labyrinth', x:-3400, floatY:3000, mw:7,  mh:5, guards:4, wall:0x2f6b3a, floor:0x0b2412, accent:0xb6ff7a, ability:'dash',
      enemies:['eel','puffer'], boss:{ kind:'eel',    name:'Kelp Strangler',  r:42 } },
    { id:3, name:'Glimmer Grotto', x: 5600, floatY:5200, mw:8,  mh:6, guards:5, wall:0x5a3a8a, floor:0x150b2a, accent:0xd59bff, ability:'glow',
      enemies:['jelly','angler'], boss:{ kind:'angler', name:'Lantern King',    r:58 } },
    { id:4, name:'Abyssal Vault',  x:-8200, mw:10, mh:7, guards:6, wall:0x7a2f3f, floor:0x2a0b13, accent:0xff7a8f, ability:'shield',
      enemies:['urchin','angler','eel'], boss:{ kind:'kraken', name:'Abyss Kraken', r:62 } },
    { id:5, name:'Tidal Temple',   x:11000, floatY:1100, mw:12, mh:8, guards:8, wall:0x8a7a3a, floor:0x2a230b, accent:0xffe28a, ability:'wings',
      enemies:['jelly','crab','puffer','eel'], boss:{ kind:'shark', name:'Tidal Megalodon', r:60 } }
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

  const caveHud = document.createElement('div');
  caveHud.id = 'cave-hud'; caveHud.style.display = 'none';
  document.body.appendChild(caveHud);

  const compass = document.createElement('div');
  compass.id = 'cave-compass'; compass.style.display = 'none';
  compass.innerHTML = '<div class="cc-arrow">▲</div><div class="cc-label"></div><div class="cc-where"></div>';
  document.body.appendChild(compass);
  const ccArrow = compass.children[0], ccLabel = compass.children[1], ccWhere = compass.children[2];

  // edge-of-screen arrow pointing at the nearest cave you haven't cleared yet
  function updateCompass(){
    if(!isStarted() || active){ compass.style.display = 'none'; return; }
    let best = null, bd = Infinity;
    for(const d of DUNGEONS){
      if(save.cleared.includes(d.id)) continue;
      const dd = Math.hypot(d.x - player.x, mouthY(d) - player.y);
      if(dd < bd){ bd = dd; best = d; }
    }
    if(!best){ compass.style.display = 'none'; return; }
    const W = app.screen.width, H = app.screen.height;
    const dx = best.x - player.x, dy = mouthY(best) - player.y;
    if(Math.abs(dx) < W/2 - 110 && Math.abs(dy) < H/2 - 70){ compass.style.display = 'none'; return; }
    const k = Math.min((W/2 - 110)/Math.max(Math.abs(dx), 1), (H/2 - 70)/Math.max(Math.abs(dy), 1));
    compass.style.display = 'block';
    compass.style.left = (W/2 + dx*k) + 'px';
    compass.style.top = (H/2 + dy*k) + 'px';
    ccArrow.style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI/2}rad)`;
    ccLabel.textContent = `${best.id}. ${best.name} · ${Math.round(bd/8)} m`;
    ccWhere.textContent = best.floatY ? `floats in open water, ~${Math.round(best.floatY/8)} m deep` : 'rests on the seafloor';
  }

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
  const mouthY = (d)=> d.floatY ? d.floatY : baseY(d) - 50;          // centre of the cave mouth
  const exitPos = (d, dx)=> ({ x:d.x + dx, y: d.floatY ? d.floatY : baseY(d) - 70 });

  function drawEntrances(now){
    caveG.clear();
    DUNGEONS.forEach((d, i)=>{
      const lab = labels[i], fl = !!d.floatY, my = mouthY(d);
      if(Math.abs(player.x - d.x) > 2400 || Math.abs(player.y - my) > 2400){ lab.visible = false; return; }
      lab.visible = true;
      const by = baseY(d), done = save.cleared.includes(d.id);
      caveG.lineStyle(2, 0x1c1c22, 0.7);
      caveG.beginFill(fl ? 0x4a4458 : 0x4b4b55);
      const N = 20;
      if(!fl){
        caveG.moveTo(d.x - 190, by + 20);
        for(let k=0;k<=N;k++){
          const a = Math.PI - (k/N)*Math.PI, bump = 1 + Math.sin(k*2.7 + d.id)*0.07;
          caveG.lineTo(d.x + Math.cos(a)*190*bump, by + 10 - Math.sin(a)*210*bump);
        }
        caveG.lineTo(d.x + 190, by + 20);
      } else {
        // a floating rock with dripping stalactites underneath
        for(let k=0;k<N;k++){
          const a = (k/N)*Math.PI*2, sn = Math.sin(a), bump = 1 + Math.sin(k*2.3 + d.id)*0.08;
          const ry = sn > 0 ? (k%2 ? 150 : 100) : 105;
          const px = d.x + Math.cos(a)*175*bump, py = my + sn*ry*bump;
          k ? caveG.lineTo(px, py) : caveG.moveTo(px, py);
        }
      }
      caveG.closePath(); caveG.endFill();
      if(fl){
        caveG.lineStyle(0);
        for(let k=0;k<4;k++){          // drifting pebbles
          const a = now*0.0008*(k%2?1:-1) + k*1.6;
          caveG.beginFill(0x4a4458, 0.9); caveG.drawCircle(d.x + Math.cos(a)*(235+k*14), my + Math.sin(a)*(130+k*8), 6 + k*2); caveG.endFill();
        }
      }
      caveG.lineStyle(0);
      caveG.beginFill(0x010609);
      caveG.drawEllipse(d.x, my, 62, 56);
      caveG.endFill();
      const pulse = 0.55 + 0.35*Math.sin(now*0.003 + d.id);
      caveG.lineStyle(4, done ? 0xffe28a : d.accent, pulse);
      caveG.drawEllipse(d.x, my, 66, 60);
      lab.text = (done ? '★ ' : '') + d.id + '. ' + d.name;
      lab.x = d.x; lab.y = my - (fl ? 138 : 175);
    });
  }

  function checkEnter(){
    if(enterCd > 0 || player.y < 40) return;
    for(const d of DUNGEONS){
      const dx = player.x - d.x, dy = player.y - mouthY(d);
      if(dx*dx + dy*dy < 55*55){ enterDungeon(d); return; }
    }
  }

  /* ------------------------------------------------------------- the maze */

  let active = false;
  let M = null;

  function genMaze(mw, mh){
    const W0 = mw*2+1, H0 = mh*2+1;
    const g0 = Array.from({length:H0}, ()=> new Array(W0).fill(1));
    const open = Array.from({length:mh}, ()=> Array.from({length:mw}, ()=> []));
    const vis = Array.from({length:mh}, ()=> new Array(mw).fill(false));
    const st = [[0,0]]; vis[0][0] = true; g0[1][1] = 0;
    while(st.length){
      const [cx,cy] = st[st.length-1];
      const nb = [[1,0],[-1,0],[0,1],[0,-1]].map(d=>[cx+d[0], cy+d[1]])
        .filter(([x,y])=> x>=0 && y>=0 && x<mw && y<mh && !vis[y][x]);
      if(!nb.length){ st.pop(); continue; }
      const [nx,ny] = nb[randi(0, nb.length-1)];
      vis[ny][nx] = true;
      g0[ny*2+1][nx*2+1] = 0;
      g0[cy+ny+1][cx+nx+1] = 0;
      open[cy][cx].push([nx,ny]); open[ny][nx].push([cx,cy]);
      st.push([nx,ny]);
    }
    const dist = Array.from({length:mh}, ()=> new Array(mw).fill(-1));
    const q = [[0,0]]; dist[0][0] = 0;
    for(let i=0;i<q.length;i++){
      const [x,y] = q[i];
      for(const [nx,ny] of open[y][x]) if(dist[ny][nx] < 0){ dist[ny][nx] = dist[y][x]+1; q.push([nx,ny]); }
    }
    // the boss arena hangs off the right edge, behind the farthest cell of the last column
    let best = [mw-1, 0];
    for(let y=0;y<mh;y++) if(dist[y][mw-1] > dist[best[1]][best[0]]) best = [mw-1, y];
    const AW = 9, AH = 7, W = W0 + AW + 1, H = Math.max(H0, AH + 2);
    const g = Array.from({length:H}, ()=> new Array(W).fill(1));
    for(let y=0;y<H0;y++) for(let x=0;x<W0;x++) g[y][x] = g0[y][x];
    const doorY = best[1]*2+1, top = clamp(doorY - 3, 1, H - AH - 1);
    for(let y=top; y<top+AH; y++) for(let x=W0; x<W0+AW; x++) g[y][x] = 0;
    g[doorY][W0-1] = 0;
    return { W, H, g, open, dist, orbCell:best, door:{ x:W0-1, y:doorY }, arena:{ x0:W0, y0:top, w:AW, h:AH } };
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

  function setDoor(closed){ M.m.g[M.m.door.y][M.m.door.x] = closed ? 1 : 0; buildMazeGraphics(M.d, M.m); }

  function enterDungeon(d){
    const m = genMaze(d.mw, d.mh);
    buildMazeGraphics(d, m);

    const pearls = [], cells = [];
    for(let cy=0; cy<d.mh; cy++) for(let cx=0; cx<d.mw; cx++){
      cells.push([cx,cy]);
      const isStart = cx===0 && cy===0, isEnd = cx===m.orbCell[0] && cy===m.orbCell[1];
      if(m.open[cy][cx].length === 1 && !isStart && !isEnd){
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
      guards.push({ kind:d.enemies[randi(0, d.enemies.length-1)], hp:2, dir:0,
                    cx, cy, x:p.x, y:p.y, tx:p.x, ty:p.y, ncx:cx, ncy:cy,
                    speed: 1.3 + d.id*0.2 + rand(0,0.3), r:24, ph:rand(0,6) });
    }
    const A = m.arena, ac = { x:(A.x0 + A.w/2)*T, y:(A.y0 + A.h/2)*T };
    const hp = 18 + 8*d.id;
    const boss = Object.assign({ hp, max:hp, x:ac.x + 200, y:ac.y, vx:0, vy:0, ang:Math.PI, state:'idle',
                                 t:0, hit:0, active:false, dead:false, atk:'charge', tx:ac.x, ty:ac.y }, d.boss);
    const start = cellPos(0,0);
    const seen = Array.from({length:m.H}, ()=> new Array(m.W).fill(false));

    M = { d, m, pearls, guards, start, orb:ac, ac, orbOn:false, seen, armed:false, done:false, frame:0,
          boss, shots:[], bubs:[], php:3, fireCd:0, sealed:false };
    const cell = Math.max(4, Math.floor(Math.min(230/m.W, 170/m.H)));
    mapEl.width = m.W*cell; mapEl.height = m.H*cell; M.cell = cell;

    caveHud._key = null;
    active = true;
    player.flipping = false; player.inAir = false;
    player.x = start.x; player.y = start.y; player.vx = player.vy = 0;
    invuln = 60;
    hideWhenInside(true);
    waterBgEl.style.display = 'none';
    dungeonC.visible = true; darkS.visible = true; mapEl.style.display = 'block';
    showBanner('Entering', d.name, 'Space shoots bubbles. Beat the boss at the far end, then take the relic.');
    playBlip();
  }

  function exitDungeon(){
    if(!active) return;
    const d = M.d;
    active = false;
    dungeonC.visible = false; darkS.visible = false; mapEl.style.display = 'none'; caveHud.style.display = 'none';
    hideWhenInside(false);
    waterBgEl.style.display = '';
    const p = exitPos(d, 230);
    player.x = p.x; player.y = p.y;
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

  function defeat(){
    M.php = 3; M.shots.length = 0; M.bubs.length = 0; M.armed = false;
    player.x = M.start.x; player.y = M.start.y; player.vx = player.vy = 0;
    invuln = 120;
    const b = M.boss;
    if(!b.dead){
      b.hp = b.max; b.active = false; b.state = 'idle'; b.x = M.ac.x + 200; b.y = M.ac.y;
      if(M.sealed){ M.sealed = false; setDoor(false); }
    }
    popText('Swept back to the start!', 'warn');
  }

  function damagePlayer(fx, fy){
    M.php--; invuln = 90;
    const a = Math.atan2(player.y - fy, player.x - fx);
    player.vx += Math.cos(a)*9; player.vy += Math.sin(a)*9;
    burstBubbles(player.x, player.y, 10); playBlip();
    if(M.php <= 0) defeat(); else popText('-1 ♥', 'warn');
  }

  function fire(){
    if(!active || !M || M.fireCd > 0) return;
    M.fireCd = 16;
    const a = player.displayAngle;
    M.bubs.push({ x:player.x + Math.cos(a)*20, y:player.y + Math.sin(a)*20,
                  vx:Math.cos(a)*12 + player.vx*0.3, vy:Math.sin(a)*12 + player.vy*0.3, life:75 });
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

  const BOSS_ATK = { crab:['charge','ring'], eel:['charge','charge','fan'], angler:['fan','charge'],
                     kraken:['fan','ring'], shark:['charge','fan','ring'] };

  function shoot(x, y, a, sp){ M.shots.push({ x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:240 }); }

  function updateBoss(dt){
    const b = M.boss, A = M.m.arena;
    if(b.dead) return;
    if(b.hit > 0) b.hit -= dt;
    if(!b.active){
      if(player.x > (A.x0 + 1)*T){
        b.active = true; M.sealed = true; setDoor(true); b.state = 'rest'; b.t = 70;
        showBanner('Boss', b.name, 'Shoot it with Space!');
      }
      return;
    }
    const rage = b.hp < b.max*0.5 ? 1.35 : 1;
    const x0 = A.x0*T + b.r, x1 = (A.x0 + A.w)*T - b.r, y0 = A.y0*T + b.r, y1 = (A.y0 + A.h)*T - b.r;
    const toP = Math.atan2(player.y - b.y, player.x - b.x);
    b.t -= dt;
    if(b.state === 'rest'){
      if(Math.hypot(b.tx - b.x, b.ty - b.y) < 24){ b.tx = rand(x0, x1); b.ty = rand(y0, y1); }
      const a = Math.atan2(b.ty - b.y, b.tx - b.x);
      b.x += Math.cos(a)*1.7*rage*dt; b.y += Math.sin(a)*1.7*rage*dt;
      b.ang = lerpAngle(b.ang, toP, 0.05*dt);
      if(b.t <= 0){ const l = BOSS_ATK[b.kind]; b.atk = l[randi(0, l.length-1)]; b.state = 'wind'; b.t = b.atk === 'charge' ? 42 : 32; }
    } else if(b.state === 'wind'){
      b.ang = lerpAngle(b.ang, toP, 0.2*dt);
      if(b.t <= 0){
        if(b.atk === 'charge'){
          b.state = 'charge'; b.t = 38;
          b.vx = Math.cos(toP)*8.5*rage; b.vy = Math.sin(toP)*8.5*rage; b.ang = toP;
        } else {
          if(b.atk === 'ring'){ const n = 10; for(let i=0;i<n;i++) shoot(b.x, b.y, i/n*Math.PI*2 + b.ang, 3.2*rage); }
          else { const n = rage > 1 ? 7 : 5; for(let i=0;i<n;i++) shoot(b.x, b.y, toP + (i - (n-1)/2)*0.28, 4.6*rage); }
          b.state = 'rest'; b.t = rand(70, 110)/rage;
        }
      }
    } else if(b.state === 'charge'){
      b.x += b.vx*dt; b.y += b.vy*dt;
      const cx = clamp(b.x, x0, x1), cy = clamp(b.y, y0, y1);
      if(cx !== b.x || cy !== b.y){ b.x = cx; b.y = cy; b.t = 0; burstBubbles(b.x, b.y, 6); }
      if(b.t <= 0){ b.state = 'rest'; b.t = 60/rage; }
    }
  }

  function killBoss(){
    const b = M.boss, d = M.d;
    b.dead = true; M.orbOn = true; M.shots.length = 0;
    if(M.sealed){ M.sealed = false; setDoor(false); }
    for(let i=0;i<4;i++) burstBubbles(b.x + rand(-40,40), b.y + rand(-40,40), 12);
    addXP(60*d.id, 'Boss defeated!');
    showBanner('Boss defeated', b.name, 'Take the glowing relic!');
  }

  function updateDungeon(dt, now){
    M.frame++;
    const pr = player.size * look().size * 0.75;
    const ptx = Math.floor(player.x/T), pty = Math.floor(player.y/T);
    for(let dy=-3; dy<=3; dy++) for(let dx=-3; dx<=3; dx++){
      const x = ptx+dx, y = pty+dy;
      if(dx*dx + dy*dy <= 10 && y>=0 && x>=0 && y<M.m.H && x<M.m.W) M.seen[y][x] = true;
    }
    const safe = ()=> shieldT > 0 || invuln > 0 || M.done;

    // bubbles: hold Space to keep firing
    if(M.fireCd > 0) M.fireCd -= dt;
    if(keys.space) fire();
    const b = M.boss;
    for(let i=M.bubs.length-1;i>=0;i--){
      const p = M.bubs[i]; if(!p) continue;
      p.x += p.vx*dt; p.y += p.vy*dt; p.life -= dt;
      let dead = p.life <= 0 || isWall(Math.floor(p.x/T), Math.floor(p.y/T));
      if(!dead && b.active && !b.dead && Math.hypot(p.x - b.x, p.y - b.y) < b.r + 8){
        dead = true; b.hp--; b.hit = 6;
        if(b.hp <= 0) killBoss();
      }
      if(!dead) for(let k=M.guards.length-1;k>=0;k--){
        const e = M.guards[k];
        if(Math.hypot(p.x - e.x, p.y - e.y) < e.r + 8){
          dead = true; e.hp--;
          if(e.hp <= 0){ M.guards.splice(k,1); burstBubbles(e.x, e.y, 8); addXP(2 + M.d.id); }
          break;
        }
      }
      if(dead) M.bubs.splice(i,1);
    }

    // sea-creature guardians
    for(const e of M.guards){
      stepGuard(e, dt);
      if(!safe() && Math.hypot(player.x - e.x, player.y - e.y) < e.r + pr*0.8){ damagePlayer(e.x, e.y); break; }
    }

    // boss + its shots
    updateBoss(dt);
    if(b.active && !b.dead && !safe() && Math.hypot(player.x - b.x, player.y - b.y) < b.r + pr*0.7) damagePlayer(b.x, b.y);
    for(let i=M.shots.length-1;i>=0;i--){
      const p = M.shots[i]; if(!p) continue;
      p.x += p.vx*dt; p.y += p.vy*dt; p.life -= dt;
      let dead = p.life <= 0 || isWall(Math.floor(p.x/T), Math.floor(p.y/T));
      if(!dead && !safe() && Math.hypot(p.x - player.x, p.y - player.y) < 11 + pr*0.7){ dead = true; damagePlayer(p.x, p.y); }
      if(dead) M.shots.splice(i,1);
    }

    for(const p of M.pearls){
      if(!p.got && Math.hypot(player.x - p.x, player.y - p.y) < 42 + pr){
        p.got = true; addXP(5 + 3*M.d.id, 'Pearl'); burstBubbles(p.x, p.y, 6); playBlip();
      }
    }

    if(M.orbOn && !M.done && Math.hypot(player.x - M.orb.x, player.y - M.orb.y) < 46 + pr) completeDungeon();
    const pd = Math.hypot(player.x - M.start.x, player.y - M.start.y);
    if(pd > 180) M.armed = true;
    if(M.armed && pd < 34 && !M.done && !M.sealed){ exitDungeon(); return; }

    const target = save.glow && has('glow') ? 620 : 330;
    lightR += (target - lightR) * 0.06 * dt;
    darkS.x = app.screen.width/2; darkS.y = app.screen.height/2 + player.bob;
    darkS.width = darkS.height = lightR / 0.085;

    drawEntities(now);
    if(M.frame % 6 === 0) drawMap();
    updateCaveHud();
  }

  function updateCaveHud(){
    const b = M.boss, showBoss = b.active && !b.dead;
    const key = M.php + '|' + (showBoss ? b.hp : -1);
    if(key === caveHud._key) return;
    caveHud._key = key;
    caveHud.style.display = 'block';
    caveHud.innerHTML = '<div class="hearts">' + '♥'.repeat(Math.max(0, M.php)) + '<span>' + '♥'.repeat(3 - Math.max(0, M.php)) + '</span></div>' +
      (showBoss ? `<div class="boss-name">${b.name}</div><div class="boss-bar"><div style="width:${Math.max(0, b.hp/b.max*100)}%"></div></div>` : '');
  }

  /* ---------------- sea-creature drawing (all vector, drawn each frame) ---------------- */

  const poly = (g, pts, col, al)=>{ g.beginFill(col, al === undefined ? 1 : al); g.drawPolygon(pts.flat()); g.endFill(); };

  function drawEnemy(e, now){
    const g = entG, x = e.x, y = e.y, t = now*0.004 + e.ph;
    const dx = e.tx - e.x, dy = e.ty - e.y;
    if(dx*dx + dy*dy > 1) e.dir = Math.atan2(dy, dx);
    const c = Math.cos(e.dir), s = Math.sin(e.dir);
    const L = (u, v)=> [x + u*c - v*s, y + u*s + v*c];
    g.lineStyle(0);
    switch(e.kind){
      case 'jelly':
        g.beginFill(0xd59bff, 0.8); g.drawEllipse(x, y - 6, 24, 17); g.endFill();
        g.beginFill(0xffffff, 0.5); g.drawCircle(x - 7, y - 10, 3); g.endFill();
        g.lineStyle(3, 0xf0c8ff, 0.8);
        for(let i=-2;i<=2;i++){ g.moveTo(x + i*8, y + 6); g.lineTo(x + i*8 + Math.sin(t + i)*5, y + 20); g.lineTo(x + i*8 + Math.sin(t + i + 1)*6, y + 34); }
        break;
      case 'urchin':
        g.lineStyle(3, 0x3a1a5a);
        for(let i=0;i<12;i++){ const a = i/12*Math.PI*2 + t*0.2; g.moveTo(x + Math.cos(a)*10, y + Math.sin(a)*10); g.lineTo(x + Math.cos(a)*28, y + Math.sin(a)*28); }
        g.lineStyle(0); g.beginFill(0x6a2e9a); g.drawCircle(x, y, 15); g.endFill();
        g.beginFill(0xff6bd5); g.drawCircle(x, y, 4); g.endFill();
        break;
      case 'crab':
        g.lineStyle(3, 0xb8452e);
        for(let i=0;i<3;i++) for(const sd of [-1,1]){ const w = Math.sin(t*3 + i)*3; g.moveTo(...L(-8 + i*8, sd*10)); g.lineTo(...L(-12 + i*8, sd*(22 + w))); }
        g.moveTo(...L(16, 8)); g.lineTo(...L(26, 16)); g.moveTo(...L(16, -8)); g.lineTo(...L(26, -16));
        g.lineStyle(0); g.beginFill(0xe8573a); g.drawEllipse(x, y, 22, 16); g.endFill();
        g.beginFill(0xff7a5a); g.drawCircle(...L(28, 17), 8); g.drawCircle(...L(28, -17), 8); g.endFill();
        g.beginFill(0xffffff); g.drawCircle(...L(15, 6), 3); g.drawCircle(...L(15, -6), 3); g.endFill();
        break;
      case 'puffer':
        g.lineStyle(2, 0x9a7a1a);
        for(let i=0;i<10;i++){ const a = i/10*Math.PI*2; g.moveTo(...L(Math.cos(a)*19, Math.sin(a)*19)); g.lineTo(...L(Math.cos(a)*27, Math.sin(a)*27)); }
        g.lineStyle(0); poly(g, [L(-18, 0), L(-34, -9 + Math.sin(t*4)*3), L(-34, 9 + Math.sin(t*4)*3)], 0xffb347);
        g.beginFill(0xffd45e); g.drawCircle(x, y, 20); g.endFill();
        g.beginFill(0xfff0bd); g.drawEllipse(...L(0, 8), 14, 8); g.endFill();
        g.beginFill(0xffffff); g.drawCircle(...L(10, -6), 5); g.endFill();
        g.beginFill(0x000000); g.drawCircle(...L(11, -6), 2.4); g.endFill();
        break;
      case 'eel': {
        for(let i=0;i<9;i++){
          const p = L(-i*10, Math.sin(t*2 - i*0.7)*6);
          g.beginFill(i%2 ? 0x4fb06a : 0x6fd08a); g.drawCircle(p[0], p[1], 9 - i*0.7); g.endFill();
        }
        g.beginFill(0xffe28a); g.drawCircle(...L(5, -4), 2.5); g.endFill();
        break;
      }
      case 'angler':
        poly(g, [L(-16, 0), L(-32, -10), L(-32, 10)], 0x1a2640);
        g.beginFill(0x2a3a5a); g.drawCircle(x, y, 19); g.endFill();
        g.lineStyle(2, 0x2a3a5a); g.moveTo(...L(8, -16)); g.quadraticCurveTo(...L(16, -34), ...L(28, -28));
        g.lineStyle(0);
        g.beginFill(0xffe28a, 0.3); g.drawCircle(...L(28, -28), 12 + Math.sin(t*2)*2); g.endFill();
        g.beginFill(0xfff3b0); g.drawCircle(...L(28, -28), 5); g.endFill();
        for(let i=-1;i<=1;i++) poly(g, [L(17, i*5 - 2), L(24, i*5), L(17, i*5 + 2)], 0xffffff);
        g.beginFill(0xffffff); g.drawCircle(...L(8, -6), 4); g.endFill();
        g.beginFill(0x000000); g.drawCircle(...L(9, -6), 2); g.endFill();
        break;
    }
    g.lineStyle(0);
  }

  function drawBoss(b, now){
    const g = entG, x = b.x, y = b.y, t = now*0.004;
    const c = Math.cos(b.ang), s = Math.sin(b.ang);
    const L = (u, v)=> [x + u*c - v*s, y + u*s + v*c];
    g.lineStyle(0);
    if(b.state === 'wind'){                           // telegraph
      g.lineStyle(4, 0xff4a4a, 0.4 + 0.4*Math.sin(now*0.03));
      g.drawCircle(x, y, b.r + 14); g.lineStyle(0);
    }
    switch(b.kind){
      case 'crab':
        g.lineStyle(6, 0xa63a28);
        for(let i=0;i<3;i++) for(const sd of [-1,1]){ const w = Math.sin(t*3 + i)*6; g.moveTo(...L(-24 + i*18, sd*30)); g.lineTo(...L(-30 + i*18, sd*(62 + w))); }
        g.moveTo(...L(36, 24)); g.lineTo(...L(60, 40)); g.moveTo(...L(36, -24)); g.lineTo(...L(60, -40));
        g.lineStyle(0); g.beginFill(0xc0392b); g.drawEllipse(x, y, 58, 44); g.endFill();
        g.beginFill(0xe74c3c); g.drawEllipse(...L(-6, 0), 36, 26); g.endFill();
        for(const sd of [-1,1]){
          g.beginFill(0xe74c3c); g.drawCircle(...L(72, sd*44), 24); g.endFill();
          poly(g, [L(88, sd*44), L(110, sd*30), L(104, sd*52)], 0xe74c3c);
          g.beginFill(0xffffff); g.drawCircle(...L(44, sd*14), 7); g.endFill();
          g.beginFill(0x000000); g.drawCircle(...L(47, sd*14), 3); g.endFill();
        }
        break;
      case 'eel':
        for(let i=0;i<16;i++){
          const p = L(-i*20, Math.sin(t*2 - i*0.6)*14), r = 36 - i*1.8;
          g.beginFill(i%2 ? 0x3f9a5a : 0x58b874); g.drawCircle(p[0], p[1], r); g.endFill();
          if(i%3 === 1){ g.beginFill(0xffe28a, 0.8); g.drawCircle(p[0], p[1] - 4, r*0.25); g.endFill(); }
        }
        poly(g, [L(36, -8), L(62, -22), L(60, -2)], 0x2f7a46); poly(g, [L(36, 8), L(62, 22), L(60, 2)], 0x2f7a46);
        for(let i=0;i<3;i++){ poly(g, [L(40 + i*6, -4), L(44 + i*6, 0), L(40 + i*6, 4)], 0xffffff); }
        g.beginFill(0xffe28a); g.drawCircle(...L(16, -16), 7); g.drawCircle(...L(16, 16), 7); g.endFill();
        g.beginFill(0x000000); g.drawCircle(...L(18, -16), 3); g.drawCircle(...L(18, 16), 3); g.endFill();
        break;
      case 'angler':
        poly(g, [L(-52, 0), L(-92, -26 + Math.sin(t*3)*5), L(-92, 26 + Math.sin(t*3)*5)], 0x16223a);
        g.beginFill(0x1f2f4a); g.drawCircle(x, y, 58); g.endFill();
        g.beginFill(0x2c4468); g.drawEllipse(...L(-6, 18), 42, 24); g.endFill();
        g.lineStyle(5, 0x1f2f4a); g.moveTo(...L(10, -50)); g.quadraticCurveTo(...L(40, -96), ...L(84, -74));
        g.lineStyle(0);
        g.beginFill(0xffe28a, 0.28); g.drawCircle(...L(84, -74), 30 + Math.sin(t*2)*4); g.endFill();
        g.beginFill(0xfff3b0); g.drawCircle(...L(84, -74), 12); g.endFill();
        for(let i=-3;i<=3;i++){ poly(g, [L(44, i*9 - 4), L(62, i*9), L(44, i*9 + 4)], 0xffffff); }
        g.beginFill(0xffffff); g.drawCircle(...L(20, -24), 11); g.endFill();
        g.beginFill(0xff4a4a); g.drawCircle(...L(23, -24), 5); g.endFill();
        break;
      case 'kraken':
        for(let k=0;k<8;k++){
          const v0 = (k - 3.5)*12;
          g.lineStyle(11, k%2 ? 0x9a3f96 : 0xb350ae);
          g.moveTo(...L(-28, v0));
          for(let j=1;j<=7;j++) g.lineTo(...L(-28 - j*18, v0*(1 + j*0.25) + Math.sin(t*2 + j*0.8 + k)*12));
        }
        g.lineStyle(0); g.beginFill(0x8e3a8a); g.drawEllipse(x, y, 62, 52); g.endFill();
        g.beginFill(0xc060bd, 0.5); g.drawEllipse(...L(-14, -14), 36, 18); g.endFill();
        for(const sd of [-1,1]){
          g.beginFill(0xffe28a); g.drawCircle(...L(24, sd*24), 12); g.endFill();
          g.beginFill(0x000000); g.drawEllipse(...L(26, sd*24), 3, 9); g.endFill();
        }
        break;
      case 'shark': {
        const wag = Math.sin(t*3)*10;
        poly(g, [L(-84, 0), L(-124, -34 + wag), L(-110, 0 + wag*0.5), L(-124, 34 + wag)], 0x6a7886);
        poly(g, [L(80, 0), L(34, -30), L(-44, -26), L(-88, -7), L(-88, 7), L(-44, 26), L(34, 30)], 0x7d8b99);
        poly(g, [L(70, 4), L(30, 28), L(-44, 24), L(-80, 7), L(-20, 10)], 0xdfe6ec, 0.9);
        poly(g, [L(6, -28), L(-22, -66), L(-34, -26)], 0x6a7886);
        poly(g, [L(10, 24), L(-14, 56), L(-24, 22)], 0x6a7886);
        for(let i=0;i<5;i++) poly(g, [L(46 + i*5, 6), L(49 + i*5, 14), L(52 + i*5, 6)], 0xffffff);
        g.beginFill(0x000000); g.drawCircle(...L(52, -10), 5); g.endFill();
        g.lineStyle(2, 0x3a4552); for(let i=0;i<3;i++){ g.moveTo(...L(22 - i*4, -4 + i*5)); g.lineTo(...L(14 - i*4, -8 + i*5)); } g.lineStyle(0);
        break;
      }
    }
    if(b.hit > 0){ g.beginFill(0xffffff, 0.4); g.drawCircle(x, y, b.r + 6); g.endFill(); }
  }

  function drawEntities(now){
    const d = M.d;
    entG.clear();
    const s = M.start;
    entG.lineStyle(3, 0x9be8ff, 0.6);
    for(let i=0;i<3;i++) entG.drawCircle(s.x, s.y, 14 + i*7 + Math.sin(now*0.004 + i)*2);
    entG.lineStyle(0);
    for(const p of M.pearls){
      if(p.got) continue;
      entG.beginFill(0xffffff, 0.9); entG.drawCircle(p.x, p.y, 8); entG.endFill();
      entG.beginFill(d.accent, 0.25); entG.drawCircle(p.x, p.y, 16 + Math.sin(now*0.005 + p.x)*3); entG.endFill();
    }
    if(M.orbOn){
      const o = M.orb, pu = 0.5 + 0.5*Math.sin(now*0.004);
      for(let i=3;i>=1;i--){ entG.beginFill(d.accent, 0.08*i); entG.drawCircle(o.x, o.y, 22 + i*14 + pu*8); entG.endFill(); }
      entG.beginFill(0xffffff); entG.drawCircle(o.x, o.y, 12); entG.endFill();
      entG.lineStyle(3, d.accent, 0.9); entG.drawCircle(o.x, o.y, 26); entG.lineStyle(0);
    }
    for(const e of M.guards) drawEnemy(e, now);
    if(!M.boss.dead) drawBoss(M.boss, now);
    for(const p of M.shots){
      entG.beginFill(0x1a0f2e, 0.95); entG.drawCircle(p.x, p.y, 11); entG.endFill();
      entG.beginFill(0xff6b6b, 0.9); entG.drawCircle(p.x, p.y, 5); entG.endFill();
    }
    entG.lineStyle(2, 0xcff6ff, 0.9);
    for(const p of M.bubs){ entG.beginFill(0x9be8ff, 0.25); entG.drawCircle(p.x, p.y, 7); entG.endFill(); }
    entG.lineStyle(0);
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
    if(M.orbOn) dot(M.orb.x, M.orb.y, '#ffffff', c*0.6);
    if(M.boss.active && !M.boss.dead) dot(M.boss.x, M.boss.y, '#ff9d00', c*0.9);
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
    updateCompass();
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
      const p = exitPos(d, 260); player.x = p.x; player.y = p.y; player.vx = player.vy = 0; enterCd = 120;
      return [[`Teleported beside ${d.name}.`, 'ok']];
    }
    const lines = [['Caves (/dungeon <1-5> teleports, exit, reset, unlock):', 'info']];
    for(const d of DUNGEONS){
      const ab = ABILITIES[d.ability], dx = d.x - player.x;
      const dir = Math.abs(dx) < 100 ? 'right here' : (dx > 0 ? 'east ' : 'west ') + Math.round(Math.abs(dx)/8) + ' m';
      const where = d.floatY ? `floating at ${Math.round(d.floatY/8)} m depth` : 'on the seafloor';
      lines.push([`${d.id}. ${d.name}: ${dir}, ${where}. Boss: ${d.boss.name}. ${save.cleared.includes(d.id) ? '[cleared] ' : ''}-> ${ab.name} (${ab.key})`, 'info']);
    }
    return lines;
  }

  return {
    get active(){ return active; },
    get _state(){ return M; },
    update, updatePlayer, handleKey, fire, look, speedMul, gravityMul, levelBonus, depth, command
  };
};

})(window);
