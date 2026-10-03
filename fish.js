/* =============================================================================
   fish.js — every creature in mocean: the fish-shape polygons (drawFishShape),
   schools, and all spawn / update / redraw code for each species.
   Loaded before game.js. game.js calls MoceanFish(ctx) and gets the API back.
   ============================================================================= */
(function(global){
"use strict";

global.MoceanFish = function(ctx){
  const { creaturesLayer, rand, randi, clamp, lerp, lerpAngle, ROUND,
          WORLD_TOP_MARGIN, floorY, attachHoverLabel } = ctx;
  // ctx.options is read lazily (it is a live getter) so difficulty changes apply instantly

  /* ============================= FISH SHAPE ============================= */

  /* Smooth curve through a list of points (quadratic midpoints) */
  function smoothThrough(g, pts){
    g.moveTo(pts[0].x, pts[0].y);
    for(let i=1;i<pts.length-1;i++){
      g.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x+pts[i+1].x)/2, (pts[i].y+pts[i+1].y)/2);
    }
    const l = pts[pts.length-1];
    g.lineTo(l.x, l.y);
  }

  /* Faces a creature along `angle` without ever swimming upside-down:
     when heading left the sprite is mirrored vertically (eased, so turns look smooth). */
  function orient(g, angle){
    g.rotation = angle;
    const target = Math.cos(angle) < 0 ? -1 : 1;
    g.scale.y += (target - g.scale.y) * 0.16;
  }

  /* Wireframe fish. Nose points along +x, tail along -x.
     A travelling wave runs down a spine (small at the head, large at the tail), so the whole
     body S-curves while swimming. opts (all optional):
       len, thick, nose        body proportions
       dorsal (0..), pectoral  fin scale (0 hides)
       tail: 'fork' | 'lunate' | 'fluke' | 'round',  tailLen, tailSpread
       snout: {len}            bill / tusk / beak
       hammer: true            hammerhead crossbar                                     */
  function drawFishShape(g, size, colors, tailPhase, speedFrac, bank, heading, opts){
    g.clear();
    const o = opts || {};
    const s = size;
    const sp = clamp(speedFrac, 0, 1);
    const amp = 0.35 + sp*0.65;
    const len = o.len || 1, th = o.thick || 1, noseK = o.nose || 0.65;
    const dorsalK = o.dorsal === undefined ? 1 : o.dorsal;
    const pectK = o.pectoral === undefined ? 1 : o.pectoral;
    const N = 16;
    const xHead = s*1.0*len, xTail = -s*0.85*len;
    const bodyW = Math.max(1.6, s*0.075), finW = Math.max(1.2, s*0.06);
    const line = (w, c, a) => g.lineStyle({ width:w, color:c, alpha:a === undefined ? 1 : a, ...ROUND });

    const spine = [], up = [], lo = [];
    for(let i=0;i<=N;i++){
      const t = i/N;
      const x = xHead + (xTail - xHead)*t;
      const h = s*th*(0.5*Math.sin(Math.PI*Math.pow(t, noseK)) + 0.09*t*t);
      const cy = Math.sin(tailPhase - t*3.4) * amp * s*0.32 * Math.pow(t, 1.7) + (bank||0)*s*0.12*t*t;
      spine.push({ x, y:cy, h });
      up.push({ x, y:cy - h });
      lo.push({ x, y:cy + h });
    }
    const P = spine[N];

    /* ---- tail ---- */
    const swing = Math.sin(tailPhase - 3.4 - 0.55) * amp * 0.5;
    const cs = Math.cos(swing), sn = Math.sin(swing);
    const T = (lx, ly) => ({ x:P.x + lx*cs - ly*sn, y:P.y + lx*sn + ly*cs });
    const tl = s*0.8*(o.tailLen || 1), spread = s*0.55*(o.tailSpread || 1);
    const kind = o.tail || 'fork';
    let tipU, tipL, notch, ctrlU, ctrlL;
    if(kind === 'round'){
      tipU = T(-tl*0.9, -spread*0.6); tipL = T(-tl*0.9, spread*0.6); notch = T(-tl*0.8, 0);
      ctrlU = T(-tl*0.5, -spread*0.9); ctrlL = T(-tl*0.5, spread*0.9);
    } else if(kind === 'fluke'){
      tipU = T(-tl*0.9, -spread*1.0); tipL = T(-tl*0.9, spread*1.0); notch = T(-tl*0.55, 0);
      ctrlU = T(-tl*0.2, -spread*0.5); ctrlL = T(-tl*0.2, spread*0.5);
    } else if(kind === 'lunate'){
      tipU = T(-tl*1.05, -spread*1.15); tipL = T(-tl*1.05, spread*1.15); notch = T(-tl*0.4, 0);
      ctrlU = T(-tl*0.35, -spread*0.35); ctrlL = T(-tl*0.35, spread*0.35);
    } else {
      tipU = T(-tl, -spread); tipL = T(-tl, spread); notch = T(-tl*0.62, 0);
      ctrlU = T(-tl*0.4, -spread*0.55); ctrlL = T(-tl*0.4, spread*0.55);
    }
    const peduncle = Math.max(s*0.06, P.h);
    line(finW*1.15, colors.fin, 0.95);
    g.moveTo(P.x, P.y - peduncle);
    g.quadraticCurveTo(ctrlU.x, ctrlU.y, tipU.x, tipU.y);
    g.quadraticCurveTo((tipU.x+notch.x)/2 + (kind==='lunate'?s*0.05:0), (tipU.y+notch.y)/2, notch.x, notch.y);
    g.quadraticCurveTo((tipL.x+notch.x)/2 + (kind==='lunate'?s*0.05:0), (tipL.y+notch.y)/2, tipL.x, tipL.y);
    g.quadraticCurveTo(ctrlL.x, ctrlL.y, P.x, P.y + peduncle);
    line(Math.max(1, finW*0.6), colors.fin, 0.4);                       // fin rays
    for(let k=-1;k<=1;k++){
      const r = T(-tl*(0.78 + (k===0?0.08:0)), k*spread*0.55);
      g.moveTo(P.x, P.y); g.lineTo(r.x, r.y);
    }

    /* ---- body outline (open at the tail, so the fin joins cleanly) ---- */
    const outline = up.slice().reverse().concat(lo.slice(1));
    line(bodyW, colors.body, 1);
    smoothThrough(g, outline);

    /* ---- snout / bill / hammer ---- */
    const noseP = spine[0];
    if(o.snout){
      const sl = s*o.snout.len;
      const wob = Math.sin(tailPhase)*s*0.02;
      line(Math.max(1.2, s*0.05), o.snout.color || colors.fin, 1);
      g.moveTo(spine[1].x, spine[1].y - spine[1].h*0.6);
      g.lineTo(noseP.x + sl, noseP.y + wob);
      g.lineTo(spine[1].x, spine[1].y + spine[1].h*0.6);
    }
    if(o.hammer){
      line(bodyW, colors.body, 1);
      const hx = xHead - s*0.18;
      smoothThrough(g, [{x:hx, y:-s*0.44}, {x:xHead + s*0.1, y:-s*0.36}, {x:xHead + s*0.14, y:0}, {x:xHead + s*0.1, y:s*0.36}, {x:hx, y:s*0.44}]);
    }

    /* ---- dorsal fin ---- */
    if(dorsalK > 0){
      const a = up[5], b = up[9];
      const flutter = Math.sin(tailPhase*1.3)*s*0.05;
      const rise = s*0.38*dorsalK;
      line(finW, colors.fin, 0.95);
      g.moveTo(a.x, a.y);
      g.quadraticCurveTo(a.x - s*0.12, a.y - rise*0.9 + flutter, (a.x+b.x)/2 - s*0.1 + flutter*0.6, a.y - rise);
      g.quadraticCurveTo(b.x + s*0.02, b.y - rise*0.25, b.x, b.y);
      line(Math.max(1, finW*0.55), colors.fin, 0.4);
      g.moveTo(up[7].x, up[7].y); g.lineTo(up[7].x - s*0.08 + flutter*0.4, up[7].y - rise*0.8);
    }

    /* ---- pectoral + pelvic fins ---- */
    if(pectK > 0){
      const c = spine[5];
      const ax = c.x, ay = c.y + c.h*0.35;
      const flap = Math.sin(tailPhase*0.9 + 1.2)*s*0.12;
      line(finW, colors.fin, 0.95);
      g.moveTo(ax, ay);
      g.quadraticCurveTo(ax - s*0.1, ay + s*0.4*pectK + flap, ax - s*0.5*pectK, ay + s*0.36*pectK + flap*1.3);
      g.quadraticCurveTo(ax - s*0.3*pectK, ay + s*0.1, ax, ay);
      const pv = lo[10];
      line(Math.max(1, finW*0.8), colors.fin, 0.7);
      g.moveTo(pv.x, pv.y);
      g.lineTo(pv.x - s*0.22*pectK, pv.y + s*0.24*pectK + flap*0.4);
      g.lineTo(pv.x - s*0.34*pectK, pv.y + s*0.04);
    }

    /* ---- gill, lateral line, mouth, eye ---- */
    const gi = spine[4];
    line(Math.max(1, s*0.045), colors.body, 0.55);
    g.moveTo(gi.x + s*0.02, gi.y - gi.h*0.62);
    g.quadraticCurveTo(gi.x - s*0.14, gi.y, gi.x + s*0.02, gi.y + gi.h*0.62);

    line(1, colors.body, 0.28);
    const lat = [];
    for(let i=5;i<=13;i++) lat.push({ x:spine[i].x, y:spine[i].y - spine[i].h*0.12 });
    smoothThrough(g, lat);

    if(!o.snout && !o.hammer){
      line(Math.max(1, s*0.04), colors.body, 0.7);
      g.moveTo(noseP.x - s*0.02, noseP.y + s*0.03);
      g.lineTo(noseP.x - s*0.16, noseP.y + s*0.06);
    }

    const ex = spine[2].x, ey = spine[2].y - spine[2].h*0.28;
    const er = Math.max(1.6, s*0.085);
    line(Math.max(1, s*0.035), 0xffffff, 0.9);
    g.drawCircle(ex, ey, er);
    g.lineStyle(0);
    g.beginFill(0xffffff, 0.95);
    g.drawCircle(ex + er*0.18, ey, Math.max(0.8, er*0.45));
    g.endFill();
  }

  const SHARK_COLORS = { body:0x9aa6b2, fin:0xcfd8e0 };

  /* ============================= SCHOOLS OF FISH ============================= */

  const schools = [];
  const SCHOOL_PALETTES = [
    {name:'Green Chromis', body:0x7fe8d4, fin:0xbdfff0},
    {name:'Yellow Tang', body:0xffd45e, fin:0xfff0bd},
    {name:'Blue Cardinalfish', body:0x9ec8ff, fin:0xdceaff},
    {name:'Pink Anthias', body:0xff8fa3, fin:0xffd6df},
    {name:'Angelfish', body:0xffe566, fin:0xffeb99},
    {name:'Clownfish', body:0xff6b35, fin:0xffa366}
  ];

  function spawnSchool(x,y){
    const palette = SCHOOL_PALETTES[randi(0,SCHOOL_PALETTES.length-1)];
    const count = randi(5,9);
    const members = [];
    for(let i=0;i<count;i++){
      const g = new PIXI.Graphics();
      creaturesLayer.addChild(g);
      attachHoverLabel(g, palette.name, 15);
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
      targetY: clamp(y + rand(-200,200), WORLD_TOP_MARGIN+60, 7500),
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
      s.targetY = clamp(s.y + rand(-220,220), WORLD_TOP_MARGIN+60, 7500);
      s.retarget = rand(140,300);
    }
    const dx = s.targetX - s.x, dy = s.targetY - s.y;
    const d = Math.hypot(dx,dy) || 1;
    s.vx = lerp(s.vx, (dx/d) * s.speed, 0.02*dt);
    s.vy = lerp(s.vy, (dy/d) * s.speed, 0.02*dt);
    s.x += s.vx*dt;
    s.y += s.vy*dt;
    s.y = clamp(s.y, WORLD_TOP_MARGIN+20, 7500);

    const heading = Math.atan2(s.vy, s.vx);
    for(const m of s.members){
      m.offAngle += m.rotSpeed*0.02*dt;
      m.phase += 0.18*dt;

      const mx = s.x + Math.cos(m.offAngle)*m.offRad;
      const my = s.y + Math.sin(m.offAngle)*m.offRad*0.6;
      m.g.x = mx; m.g.y = my; orient(m.g, heading);
      drawFishShape(m.g, m.size, s.palette, m.phase, 0.8, Math.sin(m.offAngle)*0.3, 0, { thick:0.95 });
    }
  }

  function destroySchool(s){
    for(const m of s.members){ creaturesLayer.removeChild(m.g); m.g.destroy(); }
  }

  /* ============================= JELLYFISH ============================= */

  const JELLY_COLORS = [0xd59bff, 0xff9bd2, 0x9bd2ff, 0xc8ffe0, 0xffc8ff, 0xb3d9ff];

  function spawnJellyfish(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Jellyfish', 26);
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
    j.y = clamp(j.baseY + Math.sin(j.driftPhase)*45, WORLD_TOP_MARGIN+40, 7500);
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
    attachHoverLabel(g, 'Crab', 18);
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
    attachHoverLabel(g, 'Sea Turtle', 32);
    return {
      type:'turtle',
      x, y,
      vx: rand(-1,1)||0.5, vy: rand(-0.2,0.2),
      targetX: x + rand(-400,400),
      targetY: clamp(y + rand(-150,150), WORLD_TOP_MARGIN+80, 7500),
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
      t.targetY = clamp(t.y + rand(-200,200), WORLD_TOP_MARGIN+80, 7500);
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

    t.g.x = t.x; t.g.y = t.y; orient(t.g, t.displayAngle);
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

  /* ============================= SHARKS ============================= */

  function spawnShark(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Shark', 42);
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
    const speedMult = ctx.options.difficulty === 'hard' ? 1.35 : (ctx.options.difficulty === 'peaceful' ? 0.8 : 1);
    sh.vx = lerp(sh.vx, Math.sign(dx)*2.1*speedMult, 0.01*dt);
    sh.vy = lerp(sh.vy, Math.sin(performance.now()*0.0006+sh.x*0.001)*0.4, 0.02*dt);
    sh.x += sh.vx*dt; sh.y += sh.vy*dt;
    sh.y = clamp(sh.y, WORLD_TOP_MARGIN+100, 7500);
    sh.angle = Math.atan2(sh.vy, sh.vx);
    sh.displayAngle = lerpAngle(sh.displayAngle, sh.angle, 0.05*dt);
    const sharkAngleDiff = ((sh.angle - sh.displayAngle + Math.PI) % (Math.PI*2)) - Math.PI;
    sh.bank = clamp(sharkAngleDiff * 1.6, -1, 1);
    sh.tailPhase += 0.1*dt*3;
    sh.life -= dt;

    sh.g.x = sh.x; sh.g.y = sh.y; orient(sh.g, sh.displayAngle);
    drawFishShape(sh.g, sh.size, SHARK_COLORS, sh.tailPhase, 1, sh.bank, 0, { thick:0.78, len:1.1, dorsal:1.5, tail:'lunate', tailLen:1.05 });
  }

  /* ============================= OCTOPUS ============================= */

  function spawnOctopus(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Octopus', 28);
    return {
      type:'octopus',
      x, y,
      vx:0, vy:0,
      angle:0, displayAngle:0,
      targetX: x + rand(-300,300),
      targetY: clamp(y + rand(-150,150), WORLD_TOP_MARGIN+60, 7500),
      retarget: rand(150,300),
      jetTimer: rand(60,160),
      jetPower: 0,
      tentaclePhase: rand(0,Math.PI*2),
      size: rand(14,20),
      color: Math.random()<0.5 ? 0xb46fd1 : 0xd16f9e,
      g
    };
  }

  function updateOctopus(o, dt){
    o.retarget -= dt;
    o.jetTimer -= dt;
    if(o.retarget <= 0){
      o.targetX = o.x + rand(-350,350);
      o.targetY = clamp(o.y + rand(-180,180), WORLD_TOP_MARGIN+60, 7500);
      o.retarget = rand(180,360);
    }
    if(o.jetTimer <= 0){
      const dx = o.targetX-o.x, dy = o.targetY-o.y, d = Math.hypot(dx,dy)||1;
      o.vx += (dx/d)*2.2;
      o.vy += (dy/d)*2.2;
      o.jetPower = 1;
      o.jetTimer = rand(70,150);
    }
    o.vx *= Math.pow(0.9, dt);
    o.vy *= Math.pow(0.9, dt);
    o.x += o.vx*dt; o.y += o.vy*dt;
    o.y = clamp(o.y, WORLD_TOP_MARGIN+40, 7500);
    o.jetPower = lerp(o.jetPower, 0, 0.05*dt);

    const speed = Math.hypot(o.vx,o.vy);
    if(speed > 0.05){ o.angle = Math.atan2(o.vy,o.vx); }
    o.displayAngle = lerpAngle(o.displayAngle, o.angle, 0.04*dt);
    o.tentaclePhase += 0.08*dt*(1+o.jetPower);

    o.g.x = o.x; o.g.y = o.y; orient(o.g, o.displayAngle);
    redrawOctopus(o);
  }

  function redrawOctopus(o){
    const g = o.g;
    g.clear();
    const s = o.size;
    const squish = 1 - o.jetPower*0.25;

    const n = 6;
    for(let i=0;i<n;i++){
      const by = lerp(-s*0.55, s*0.55, i/(n-1));
      g.lineStyle({ width: Math.max(1.2, s*0.06), color: o.color, alpha:0.85, ...ROUND });
      g.moveTo(-s*0.3, by*0.5);
      for(let seg=1; seg<=3; seg++){
        const t = seg/3;
        const wob = Math.sin(o.tentaclePhase + i*0.7 + seg) * s*0.25*(1+o.jetPower);
        g.lineTo(-s*(0.5+t*0.9), by + wob);
      }
    }

    g.lineStyle({ width: Math.max(1.6, s*0.09), color: o.color, ...ROUND });
    g.drawEllipse(0, 0, s*squish, s*0.85);

  }

  /* ============================= SEAHORSE ============================= */

  function spawnSeahorse(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Seahorse', 18);
    return {
      type:'seahorse',
      x, y, baseY:y,
      phase: rand(0,Math.PI*2),
      driftPhase: rand(0,Math.PI*2),
      dir: Math.random()<0.5 ? -1 : 1,
      size: rand(10,15),
      color: [0xffb347,0xffd76b,0xff8c69,0xc9a0ff][randi(0,3)],
      g
    };
  }

  function updateSeahorse(h, dt){
    h.phase += 0.05*dt;
    h.driftPhase += 0.008*dt;
    h.y = clamp(h.baseY + Math.sin(h.driftPhase)*30, WORLD_TOP_MARGIN+40, 7500);
    h.x += Math.sin(h.phase*0.3)*0.12*dt*h.dir;
    if(Math.random() < 0.002) h.dir *= -1;

    h.g.x = h.x; h.g.y = h.y;
    h.g.scale.x = h.dir < 0 ? -1 : 1;
    redrawSeahorse(h);
  }

  function redrawSeahorse(h){
    const g = h.g;
    g.clear();
    const s = h.size;
    const bob = Math.sin(h.phase*2)*s*0.06;

    g.lineStyle({ width: Math.max(1.5, s*0.13), color: h.color, ...ROUND });
    g.moveTo(0, s*0.9+bob);
    g.quadraticCurveTo(-s*0.5, s*0.3+bob, -s*0.1, -s*0.2+bob);
    g.quadraticCurveTo(s*0.45, -s*0.6+bob, s*0.05, -s*1.0+bob);
    g.lineTo(s*0.55, -s*1.15+bob);
    g.moveTo(0, s*0.9+bob);
    g.quadraticCurveTo(s*0.35, s*1.15+bob, s*0.15, s*1.4+bob);

    const finWag = Math.sin(h.phase*5)*0.3;
    g.lineStyle({ width:1.2, color: h.color, alpha:0.6 });
    g.moveTo(-s*0.15, -s*0.1+bob);
    g.lineTo(-s*0.4+finWag*s*0.2, s*0.05+bob);

  }

  /* ============================= STINGRAY ============================= */

  function spawnStingray(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Stingray', 34);
    return {
      type:'stingray',
      x, y,
      vx: rand(-1,1)||0.6, vy:0,
      targetX: x + rand(-500,500),
      targetY: clamp(y + rand(-100,100), WORLD_TOP_MARGIN+80, 7500),
      retarget: rand(200,400),
      angle:0, displayAngle:0,
      wingPhase: rand(0,Math.PI*2),
      size: rand(20,30),
      color: 0x6f7fae,
      g
    };
  }

  function updateStingray(r, dt){
    r.retarget -= dt;
    if(r.retarget <= 0){
      r.targetX = r.x + rand(-600,600);
      r.targetY = clamp(r.y + rand(-150,150), WORLD_TOP_MARGIN+80, 7500);
      r.retarget = rand(220,420);
    }
    const dx = r.targetX-r.x, dy = r.targetY-r.y, d = Math.hypot(dx,dy)||1;
    r.vx = lerp(r.vx, (dx/d)*1.1, 0.008*dt);
    r.vy = lerp(r.vy, (dy/d)*1.1, 0.008*dt);
    r.x += r.vx*dt; r.y += r.vy*dt;
    r.angle = Math.atan2(r.vy, r.vx);
    r.displayAngle = lerpAngle(r.displayAngle, r.angle, 0.02*dt);
    r.wingPhase += 0.07*dt;

    r.g.x = r.x; r.g.y = r.y; orient(r.g, r.displayAngle);
    redrawStingray(r);
  }

  function redrawStingray(r){
    const g = r.g;
    g.clear();
    const s = r.size;
    const wing = Math.sin(r.wingPhase)*s*0.3;

    g.lineStyle({ width: Math.max(1.6, s*0.08), color: r.color, ...ROUND });
    g.moveTo(s*0.9, 0);
    g.quadraticCurveTo(s*0.2, -s*0.9+wing, -s*0.7, -s*0.15);
    g.quadraticCurveTo(-s*0.3, 0, -s*0.7, s*0.15);
    g.quadraticCurveTo(s*0.2, s*0.9-wing, s*0.9, 0);

    g.lineStyle({ width: Math.max(1, s*0.04), color: r.color, alpha:0.8 });
    g.moveTo(-s*0.5, 0);
    g.lineTo(-s*1.6, Math.sin(r.wingPhase*1.5)*s*0.2);

  }

  /* ============================= MORAY EEL ============================= */

  function spawnEel(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Moray Eel', 28);
    return {
      type:'eel',
      x, y,
      vx: Math.random()<0.5 ? -1 : 1,
      targetX: x + rand(-300,300),
      phase: rand(0,Math.PI*2),
      size: rand(16,22),
      segments: 7,
      floorOffset: rand(20,55),
      color: 0x5a8a4a,
      g
    };
  }

  function updateEel(e, dt){
    const dx = e.targetX - e.x;
    if(Math.abs(dx) < 20){ e.targetX = e.x + rand(150,300) * (Math.random()<0.5?-1:1); }
    e.vx = lerp(e.vx, Math.sign(dx)*0.7, 0.01*dt);
    e.x += e.vx*dt;
    const desiredY = clamp(floorY(e.x) - e.floorOffset, WORLD_TOP_MARGIN+60, 7500);
    e.y = lerp(e.y, desiredY, 0.02*dt);
    e.phase += 0.1*dt;

    e.g.x = e.x; e.g.y = e.y;
    e.g.scale.x = e.vx < 0 ? -1 : 1;
    redrawEel(e);
  }

  function redrawEel(e){
    const g = e.g;
    g.clear();
    const s = e.size;
    const segs = e.segments;

    g.lineStyle({ width: Math.max(1.6, s*0.16), color: e.color, ...ROUND });
    g.moveTo(s*1.1, 0);
    for(let i=1;i<=segs;i++){
      const t = i/segs;
      const nx = s*1.1 - t*s*2.4;
      const ny = Math.sin(e.phase*3 - t*5) * s*0.35*t;
      g.lineTo(nx, ny);
    }

  }

  /* ============================= STARFISH ============================= */

  function spawnStarfish(x){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Starfish', 16);
    return {
      type:'starfish',
      x, y: floorY(x),
      size: rand(8,13),
      color: [0xff7a5c,0xffa55c,0xc75cff][randi(0,2)],
      rot: rand(0,Math.PI*2),
      pulsePhase: rand(0,Math.PI*2),
      g
    };
  }

  function updateStarfish(st, dt){
    st.pulsePhase += 0.02*dt;
    st.y = floorY(st.x) - st.size*0.25;
    st.g.x = st.x; st.g.y = st.y; st.g.rotation = st.rot;
    redrawStarfish(st);
  }

  function redrawStarfish(st){
    const g = st.g;
    g.clear();
    const s = st.size * (1 + Math.sin(st.pulsePhase)*0.04);
    const arms = 5;

    g.lineStyle({ width: Math.max(1.4, s*0.16), color: st.color, ...ROUND });
    g.moveTo(s, 0);
    for(let i=1;i<=arms;i++){
      const a = (i/arms)*Math.PI*2 - Math.PI/2;
      const aMid = ((i-0.5)/arms)*Math.PI*2 - Math.PI/2;
      g.lineTo(Math.cos(aMid)*s*0.35, Math.sin(aMid)*s*0.35);
      g.lineTo(Math.cos(a)*s, Math.sin(a)*s);
    }
  }

  /* ============================= SEA URCHIN ============================= */

  function spawnSeaUrchin(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Sea Urchin', 20);
    return {
      type:'seahub',
      x, y: floorY(x),
      size: rand(10,16),
      phase: rand(0,Math.PI*2),
      color: [0xff6b6b, 0xffa06b, 0x9b6bff][randi(0,2)],
      g
    };
  }

  function updateSeaUrchin(h, dt){
    h.phase += 0.03*dt;
    h.y = floorY(h.x) - h.size*0.2;
    h.g.x = h.x; h.g.y = h.y;
    redrawSeaUrchin(h);
  }

  function redrawSeaUrchin(h){
    const g = h.g;
    g.clear();
    const s = h.size;
    const spike = 8;

    g.lineStyle({ width: Math.max(1.2, s*0.12), color: h.color, ...ROUND });
    g.drawCircle(0, 0, s*0.5);

    for(let i=0;i<spike;i++){
      const ang = (i/spike)*Math.PI*2;
      const wobble = Math.sin(h.phase + i)*s*0.15;
      g.moveTo(0, 0);
      g.lineTo(Math.cos(ang)*(s*0.5 + wobble), Math.sin(ang)*(s*0.5 + wobble));
    }
  }

  /* ============================= PUFFERFISH ============================= */

  function spawnPufferfish(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Pufferfish', 22);
    return {
      type:'pufferfish',
      x, y,
      vx: rand(-0.8,0.8), vy: rand(-0.5,0.5),
      targetX: x + rand(-300,300),
      targetY: clamp(y + rand(-150,150), WORLD_TOP_MARGIN+60, 7500),
      retarget: rand(120,250),
      puffPhase: 0,
      size: rand(12,18),
      color: 0xffd700,
      g
    };
  }

  function updatePufferfish(p, dt){
    p.retarget -= dt;
    if(p.retarget <= 0){
      p.targetX = p.x + rand(-300,300);
      p.targetY = clamp(p.y + rand(-150,150), WORLD_TOP_MARGIN+60, 7500);
      p.retarget = rand(140,280);
    }

    const dx = p.targetX - p.x, dy = p.targetY - p.y;
    const d = Math.hypot(dx, dy) || 1;
    p.vx = lerp(p.vx, (dx/d)*0.8, 0.02*dt);
    p.vy = lerp(p.vy, (dy/d)*0.8, 0.02*dt);
    p.x += p.vx*dt;
    p.y += p.vy*dt;
    p.puffPhase += 0.04*dt;

    p.g.x = p.x; p.g.y = p.y;
    redrawPufferfish(p);
  }

  function redrawPufferfish(p){
    const g = p.g, s = p.size;
    g.clear();
    const face = p.vx < -0.05 ? -1 : (p.vx > 0.05 ? 1 : (p.face || 1));
    p.face = face;
    g.scale.x += (face - g.scale.x)*0.2;
    const puff = 1 + Math.sin(p.puffPhase*2)*0.22;
    const R = s*puff;
    const wag = Math.sin(p.puffPhase*6)*s*0.18;
    const line = (w,c,a)=> g.lineStyle({ width:w, color:c, alpha:a===undefined?1:a, ...ROUND });

    // round tail
    line(Math.max(1.2, s*0.09), 0xffe680, 0.9);
    g.moveTo(-R*0.92, -s*0.12);
    g.quadraticCurveTo(-R*1.5, -s*0.55 + wag, -R*1.55, wag);
    g.quadraticCurveTo(-R*1.5, s*0.55 + wag, -R*0.92, s*0.12);
    // body
    line(Math.max(1.5, s*0.11), p.color, 1);
    g.drawEllipse(0, 0, R, R*0.9);
    // belly arc + spots
    line(1, p.color, 0.35);
    g.arc(0, 0, R*0.72, 0.5, Math.PI - 0.5);
    for(let i=0;i<4;i++) g.drawCircle(-R*0.35 + i*R*0.28, -R*0.35 + (i%2)*R*0.2, 1.1);
    // spikes (stand a bit prouder when puffed)
    line(Math.max(1, s*0.06), 0xfff0a8, 0.8);
    for(let i=0;i<14;i++){
      const a = (i/14)*Math.PI*2 + 0.2;
      const rr = R*(i%2 ? 1.0 : 0.98);
      g.moveTo(Math.cos(a)*rr, Math.sin(a)*rr*0.9);
      g.lineTo(Math.cos(a)*(rr + s*(0.2 + (puff-0.78)*0.35)), Math.sin(a)*(rr + s*(0.2 + (puff-0.78)*0.35))*0.9);
    }
    // pectoral flutter
    const fl = Math.sin(p.puffPhase*9)*s*0.14;
    line(Math.max(1, s*0.07), 0xffe680, 0.9);
    g.moveTo(R*0.05, s*0.2); g.quadraticCurveTo(-R*0.2, s*0.5 + fl, -R*0.45, s*0.3 + fl);
    // eye + mouth
    line(Math.max(1, s*0.06), 0xffffff, 0.95);
    g.drawCircle(R*0.5, -R*0.2, Math.max(2, s*0.2));
    g.lineStyle(0); g.beginFill(0xffffff, 0.95); g.drawCircle(R*0.55, -R*0.2, Math.max(1, s*0.09)); g.endFill();
    line(Math.max(1, s*0.06), p.color, 0.9);
    g.moveTo(R*0.92, s*0.06); g.lineTo(R*0.74, s*0.14);
  }

  /* ============================= NEW CREATURES ============================= */

  /* ---- MANTA RAY ---- */
  function spawnMantaRay(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Manta Ray', 50);
    return {
      type:'mantaray',
      x, y,
      vx: rand(-1,1)||0.5, vy:0,
      targetX: x + rand(-800,800),
      targetY: clamp(y + rand(-200,200), WORLD_TOP_MARGIN+100, 7000),
      retarget: rand(300,500),
      angle:0, displayAngle:0,
      wingPhase: rand(0,Math.PI*2),
      size: rand(40,55),
      g
    };
  }

  function updateMantaRay(m, dt){
    m.retarget -= dt;
    if(m.retarget <= 0){
      m.targetX = m.x + rand(-900,900);
      m.targetY = clamp(m.y + rand(-250,250), WORLD_TOP_MARGIN+100, 7000);
      m.retarget = rand(350,550);
    }
    const dx = m.targetX-m.x, dy = m.targetY-m.y, d = Math.hypot(dx,dy)||1;
    m.vx = lerp(m.vx, (dx/d)*1.3, 0.006*dt);
    m.vy = lerp(m.vy, (dy/d)*1.3, 0.006*dt);
    m.x += m.vx*dt; m.y += m.vy*dt;
    m.angle = Math.atan2(m.vy, m.vx);
    m.displayAngle = lerpAngle(m.displayAngle, m.angle, 0.015*dt);
    m.wingPhase += 0.04*dt;

    m.g.x = m.x; m.g.y = m.y; orient(m.g, m.displayAngle);
    redrawMantaRay(m);
  }

  function redrawMantaRay(m){
    const g = m.g;
    g.clear();
    const s = m.size;
    const wing = Math.sin(m.wingPhase)*s*0.25;

    g.lineStyle({ width: Math.max(2, s*0.06), color: 0x2a3a5a, ...ROUND });
    g.moveTo(s*0.3, 0);
    g.quadraticCurveTo(s*0.1, -s*0.7+wing, -s*0.8, -s*0.35);
    g.quadraticCurveTo(-s*1.2, 0, -s*0.8, s*0.35);
    g.quadraticCurveTo(s*0.1, s*0.7-wing, s*0.3, 0);

    g.lineStyle({ width: Math.max(1, s*0.03), color: 0x3a4a6a, alpha:0.6 });
    g.moveTo(-s*0.3, 0);
    g.lineTo(-s*1.0, Math.sin(m.wingPhase*1.3)*s*0.15);

  }

  /* ---- SQUID ---- */
  function spawnSquid(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Squid', 24);
    return {
      type:'squid',
      x, y,
      vx:0, vy:0,
      targetX: x + rand(-400,400),
      targetY: clamp(y + rand(-200,200), WORLD_TOP_MARGIN+60, 7500),
      retarget: rand(200,350),
      jetTimer: rand(80,180),
      tentaclePhase: rand(0,Math.PI*2),
      size: rand(16,24),
      color: 0x8a9ab0,
      g
    };
  }

  function updateSquid(sq, dt){
    sq.retarget -= dt;
    sq.jetTimer -= dt;
    if(sq.retarget <= 0){
      sq.targetX = sq.x + rand(-450,450);
      sq.targetY = clamp(sq.y + rand(-220,220), WORLD_TOP_MARGIN+60, 7500);
      sq.retarget = rand(220,380);
    }
    if(sq.jetTimer <= 0){
      const dx = sq.targetX-sq.x, dy = sq.targetY-sq.y, d = Math.hypot(dx,dy)||1;
      sq.vx += (dx/d)*3.0;
      sq.vy += (dy/d)*3.0;
      sq.jetTimer = rand(90,170);
    }
    sq.vx *= Math.pow(0.88, dt);
    sq.vy *= Math.pow(0.88, dt);
    sq.x += sq.vx*dt; sq.y += sq.vy*dt;
    sq.tentaclePhase += 0.1*dt;

    sq.g.x = sq.x; sq.g.y = sq.y;
    redrawSquid(sq);
  }

  function redrawSquid(sq){
    const g = sq.g;
    g.clear();
    const s = sq.size;

    g.lineStyle({ width: Math.max(1.4, s*0.08), color: sq.color, ...ROUND });
    g.drawEllipse(0, -s*0.2, s*0.55, s*0.7);

    for(let i=0;i<8;i++){
      const tx = lerp(-s*0.4, s*0.4, i/7);
      g.lineStyle({ width: Math.max(0.8, s*0.04), color: sq.color, alpha:0.7 });
      g.moveTo(tx, s*0.3);
      for(let seg=1; seg<=4; seg++){
        const t = seg/4;
        const wob = Math.sin(sq.tentaclePhase + i*0.5 + seg)*s*0.2;
        g.lineTo(tx + wob, s*0.3 + seg*s*0.5);
      }
    }

  }

  /* ---- ANGLERFISH ---- */
  function spawnAnglerfish(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Anglerfish', 28);
    return {
      type:'anglerfish',
      x, y,
      vx: rand(-0.5,0.5), vy: rand(-0.3,0.3),
      targetX: x + rand(-200,200),
      targetY: clamp(y + rand(-100,100), 4000, 7500),
      retarget: rand(250,450),
      angle:0, displayAngle:0,
      lurePhase: rand(0,Math.PI*2),
      size: rand(18,26),
      g
    };
  }

  function updateAnglerfish(a, dt){
    a.retarget -= dt;
    if(a.retarget <= 0){
      a.targetX = a.x + rand(-250,250);
      a.targetY = clamp(a.y + rand(-120,120), 4000, 7500);
      a.retarget = rand(280,500);
    }
    const dx = a.targetX-a.x, dy = a.targetY-a.y, d = Math.hypot(dx,dy)||1;
    a.vx = lerp(a.vx, (dx/d)*0.5, 0.008*dt);
    a.vy = lerp(a.vy, (dy/d)*0.5, 0.008*dt);
    a.x += a.vx*dt; a.y += a.vy*dt;
    a.angle = Math.atan2(a.vy, a.vx);
    a.displayAngle = lerpAngle(a.displayAngle, a.angle, 0.025*dt);
    a.lurePhase += 0.06*dt;

    a.g.x = a.x; a.g.y = a.y; orient(a.g, a.displayAngle);
    redrawAnglerfish(a);
  }

  function redrawAnglerfish(a){
    const s = a.size, g = a.g;
    drawFishShape(g, s*0.9, { body:0x9a7550, fin:0xc49a68 }, a.lurePhase*1.4, Math.hypot(a.vx, a.vy)/0.5, 0, 0,
      { thick:1.5, len:0.85, nose:0.45, dorsal:0.4, pectoral:0.7, tail:'round', tailLen:0.8 });
    // jagged teeth
    g.lineStyle({ width:Math.max(1, s*0.04), color:0xf4f0e0, alpha:0.9, ...ROUND });
    for(let i=0;i<5;i++){
      const tx = s*0.74 - i*s*0.1;
      g.moveTo(tx, s*0.1); g.lineTo(tx - s*0.04, s*0.26);
    }
    // lure on a swaying stalk
    const sway = Math.sin(a.lurePhase)*s*0.18;
    const bx = s*0.75 + sway, by = -s*1.45;
    g.lineStyle({ width:Math.max(1, s*0.06), color:0xc49a68, ...ROUND });
    g.moveTo(s*0.35, -s*0.55);
    g.quadraticCurveTo(s*0.55, -s*1.5, bx, by);
    const glow = 0.65 + 0.35*Math.sin(a.lurePhase*2.3);
    g.lineStyle(0);
    g.beginFill(0x88ff44, 0.18*glow); g.drawCircle(bx, by, Math.max(7, s*0.5)); g.endFill();
    g.beginFill(0x88ff44, 0.95); g.drawCircle(bx, by, Math.max(2.2, s*0.11)); g.endFill();
    g.lineStyle(1.2, 0xbaff88, 0.5*glow); g.drawCircle(bx, by, Math.max(4, s*0.2));
  }

  /* ---- NARWHAL ---- */
  function spawnNarwhal(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Narwhal', 45);
    return {
      type:'narwhal',
      x, y,
      vx: rand(-1,1)||0.8, vy:0,
      targetX: x + rand(-600,600),
      targetY: clamp(y + rand(-150,150), WORLD_TOP_MARGIN+60, 3000),
      retarget: rand(300,500),
      angle:0, displayAngle:0,
      tailPhase: rand(0,Math.PI*2),
      size: rand(35,48),
      g
    };
  }

  function updateNarwhal(n, dt){
    n.retarget -= dt;
    if(n.retarget <= 0){
      n.targetX = n.x + rand(-700,700);
      n.targetY = clamp(n.y + rand(-180,180), WORLD_TOP_MARGIN+60, 3000);
      n.retarget = rand(350,550);
    }
    const dx = n.targetX-n.x, dy = n.targetY-n.y, d = Math.hypot(dx,dy)||1;
    n.vx = lerp(n.vx, (dx/d)*1.4, 0.008*dt);
    n.vy = lerp(n.vy, (dy/d)*1.4, 0.008*dt);
    n.x += n.vx*dt; n.y += n.vy*dt;
    n.angle = Math.atan2(n.vy, n.vx);
    n.displayAngle = lerpAngle(n.displayAngle, n.angle, 0.02*dt);
    n.tailPhase += 0.08*dt;

    n.g.x = n.x; n.g.y = n.y; orient(n.g, n.displayAngle);
    redrawNarwhal(n);
  }

  function redrawNarwhal(n){
    const s = n.size;
    drawFishShape(n.g, s*0.9, { body:0xc8d8e8, fin:0xe2ecf5 }, n.tailPhase, Math.hypot(n.vx, n.vy)/1.4, 0, 0,
      { thick:0.9, len:1.0, dorsal:0, pectoral:0.8, tail:'fluke', tailSpread:1.15 });
    // spiral tusk
    const g = n.g, x0 = s*0.9, x1 = s*2.1;
    g.lineStyle({ width:Math.max(1.4, s*0.05), color:0xfff2d6, ...ROUND });
    g.moveTo(x0, 0); g.lineTo(x1, -s*0.04);
    g.lineStyle({ width:1, color:0xfff2d6, alpha:0.55 });
    for(let i=1;i<7;i++){
      const x = x0 + (x1-x0)*i/7;
      g.moveTo(x, -s*0.06); g.lineTo(x + s*0.08, s*0.05);
    }
  }

  /* ---- HAMMERHEAD SHARK ---- */
  function spawnHammerhead(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Hammerhead', 48);
    return {
      type:'hammerhead',
      x, y,
      vx: rand(-1,1)||1, vy:0,
      targetX: x + rand(-700,700),
      targetY: clamp(y + rand(-150,150), WORLD_TOP_MARGIN+80, 7500),
      retarget: rand(280,480),
      angle:0, displayAngle:0,
      tailPhase: rand(0,Math.PI*2),
      size: rand(38,52),
      g
    };
  }

  function updateHammerhead(h, dt){
    h.retarget -= dt;
    if(h.retarget <= 0){
      h.targetX = h.x + rand(-800,800);
      h.targetY = clamp(h.y + rand(-180,180), WORLD_TOP_MARGIN+80, 7500);
      h.retarget = rand(320,520);
    }
    const dx = h.targetX-h.x, dy = h.targetY-h.y, d = Math.hypot(dx,dy)||1;
    h.vx = lerp(h.vx, (dx/d)*1.6, 0.007*dt);
    h.vy = lerp(h.vy, (dy/d)*1.6, 0.007*dt);
    h.x += h.vx*dt; h.y += h.vy*dt;
    h.angle = Math.atan2(h.vy, h.vx);
    h.displayAngle = lerpAngle(h.displayAngle, h.angle, 0.025*dt);
    h.tailPhase += 0.09*dt;

    h.g.x = h.x; h.g.y = h.y; orient(h.g, h.displayAngle);
    redrawHammerhead(h);
  }

  function redrawHammerhead(h){
    drawFishShape(h.g, h.size, { body:0x9db0c2, fin:0xc9d8e6 }, h.tailPhase, Math.hypot(h.vx, h.vy)/1.6, 0, 0,
      { thick:0.68, len:0.92, hammer:true, dorsal:1.5, tail:'lunate', tailLen:1.1 });
  }

  /* ---- GIANT ISOPOD ---- */
  function spawnIsopod(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Giant Isopod', 22);
    return {
      type:'isopod',
      x, y: floorY(x) - 20,
      dir: Math.random()<0.5 ? -1 : 1,
      walkPhase: rand(0,Math.PI*2),
      size: rand(14,20),
      color: 0x6a5a4a,
      g
    };
  }

  function updateIsopod(i, dt){
    i.walkPhase += 0.2*dt;
    i.x += i.dir * 0.3 * dt;
    i.y = floorY(i.x) - i.size*0.4;
    i.g.x = i.x; i.g.y = i.y;
    i.g.scale.x = i.dir < 0 ? -1 : 1;
    redrawIsopod(i);
  }

  function redrawIsopod(i){
    const g = i.g;
    g.clear();
    const s = i.size;

    g.lineStyle({ width: Math.max(1.6, s*0.14), color: i.color, ...ROUND });
    g.drawEllipse(0, 0, s*0.9, s*0.65);

    for(let seg=0; seg<5; seg++){
      const sx = lerp(-s*0.7, s*0.7, seg/4);
      g.lineStyle({ width: Math.max(1, s*0.08), color: i.color, alpha:0.7 });
      g.moveTo(sx, -s*0.5);
      g.lineTo(sx + Math.sin(i.walkPhase + seg)*s*0.15, -s*0.9);
      g.moveTo(sx, s*0.5);
      g.lineTo(sx + Math.sin(i.walkPhase + seg + Math.PI)*s*0.15, s*0.9);
    }

  }

  /* ---- LIONFISH ---- */
  function spawnLionfish(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Lionfish', 22);
    return {
      type:'lionfish',
      x, y,
      vx: rand(-0.6,0.6), vy: rand(-0.4,0.4),
      targetX: x + rand(-250,250),
      targetY: clamp(y + rand(-120,120), WORLD_TOP_MARGIN+60, 7500),
      retarget: rand(180,320),
      angle:0, displayAngle:0,
      finPhase: rand(0,Math.PI*2),
      size: rand(14,20),
      g
    };
  }

  function updateLionfish(lf, dt){
    lf.retarget -= dt;
    if(lf.retarget <= 0){
      lf.targetX = lf.x + rand(-280,280);
      lf.targetY = clamp(lf.y + rand(-140,140), WORLD_TOP_MARGIN+60, 7500);
      lf.retarget = rand(200,350);
    }
    const dx = lf.targetX-lf.x, dy = lf.targetY-lf.y, d = Math.hypot(dx,dy)||1;
    lf.vx = lerp(lf.vx, (dx/d)*0.6, 0.015*dt);
    lf.vy = lerp(lf.vy, (dy/d)*0.6, 0.015*dt);
    lf.x += lf.vx*dt; lf.y += lf.vy*dt;
    lf.angle = Math.atan2(lf.vy, lf.vx);
    lf.displayAngle = lerpAngle(lf.displayAngle, lf.angle, 0.03*dt);
    lf.finPhase += 0.08*dt;

    lf.g.x = lf.x; lf.g.y = lf.y; orient(lf.g, lf.displayAngle);
    redrawLionfish(lf);
  }

  function redrawLionfish(lf){
    const sp = Math.hypot(lf.vx, lf.vy)/0.6;
    drawFishShape(lf.g, lf.size, { body:0xff6b6b, fin:0xffa0a0 }, lf.finPhase*1.2, sp, 0, 0, { thick:0.95, dorsal:0, pectoral:0.6, tail:'round' });
    const g = lf.g, s = lf.size;
    // venomous dorsal spines fanning up and back
    for(let i=0;i<7;i++){
      const t = 0.16 + i*0.075;
      const bx = s*1.0 - t*s*1.85;
      const by = -s*0.46*Math.sin(Math.PI*Math.pow(t,0.65));
      const sway = Math.sin(lf.finPhase + i*0.7)*s*0.1;
      g.lineStyle({ width:Math.max(0.9, s*0.05), color:0xffb0b0, alpha:0.85, ...ROUND });
      g.moveTo(bx, by);
      g.lineTo(bx - s*0.28 + sway, by - s*0.72 - (i%2)*s*0.12);
    }
    // long streaming pectoral rays
    for(let i=0;i<6;i++){
      const sway = Math.sin(lf.finPhase*1.1 + i*0.6)*s*0.12;
      g.lineStyle({ width:Math.max(0.8, s*0.04), color:0xff9a9a, alpha:0.6, ...ROUND });
      g.moveTo(s*0.25, s*0.12);
      g.lineTo(-s*(0.35 + i*0.1), s*(0.5 + i*0.1) + sway);
    }
  }

  /* ---- CUTTLEFISH ---- */
  function spawnCuttlefish(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Cuttlefish', 22);
    return {
      type:'cuttlefish',
      x, y,
      vx:0, vy:0,
      targetX: x + rand(-350,350),
      targetY: clamp(y + rand(-180,180), WORLD_TOP_MARGIN+60, 7500),
      retarget: rand(200,380),
      finPhase: rand(0,Math.PI*2),
      size: rand(16,24),
      color: 0xffa06b,
      g
    };
  }

  function updateCuttlefish(c, dt){
    c.retarget -= dt;
    if(c.retarget <= 0){
      c.targetX = c.x + rand(-400,400);
      c.targetY = clamp(c.y + rand(-200,200), WORLD_TOP_MARGIN+60, 7500);
      c.retarget = rand(240,420);
    }
    const dx = c.targetX-c.x, dy = c.targetY-c.y, d = Math.hypot(dx,dy)||1;
    c.vx = lerp(c.vx, (dx/d)*0.9, 0.012*dt);
    c.vy = lerp(c.vy, (dy/d)*0.9, 0.012*dt);
    c.x += c.vx*dt; c.y += c.vy*dt;
    c.finPhase += 0.1*dt;

    c.g.x = c.x; c.g.y = c.y;
    redrawCuttlefish(c);
  }

  function redrawCuttlefish(c){
    const g = c.g;
    g.clear();
    const s = c.size;

    g.lineStyle({ width: Math.max(1.6, s*0.1), color: c.color, ...ROUND });
    g.drawEllipse(0, 0, s*0.75, s*0.55);

    const finWave = Math.sin(c.finPhase)*s*0.15;
    g.lineStyle({ width: Math.max(1, s*0.06), color: 0xffc08f, alpha:0.8 });
    g.moveTo(-s*0.5, -s*0.4);
    g.quadraticCurveTo(-s*0.3, -s*0.7+finWave, s*0.1, -s*0.45);
    g.moveTo(-s*0.5, s*0.4);
    g.quadraticCurveTo(-s*0.3, s*0.7-finWave, s*0.1, s*0.45);

    for(let i=0;i<6;i++){
      const tx = lerp(-s*0.3, s*0.4, i/5);
      g.lineStyle({ width: Math.max(0.8, s*0.04), color: c.color, alpha:0.7 });
      g.moveTo(tx, s*0.3);
      g.lineTo(tx + Math.sin(c.finPhase + i)*s*0.15, s*0.8);
    }

  }

  /* ---- PARROTFISH ---- */
  function spawnParrotfish(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Parrotfish', 20);
    return {
      type:'parrotfish',
      x, y,
      vx: rand(-1,1)||0.7, vy: rand(-0.3,0.3),
      targetX: x + rand(-350,350),
      targetY: clamp(y + rand(-150,150), WORLD_TOP_MARGIN+60, 7500),
      retarget: rand(200,380),
      angle:0, displayAngle:0,
      tailPhase: rand(0,Math.PI*2),
      size: rand(16,24),
      color: 0x4ecdc4,
      g
    };
  }

  function updateParrotfish(pf, dt){
    pf.retarget -= dt;
    if(pf.retarget <= 0){
      pf.targetX = pf.x + rand(-400,400);
      pf.targetY = clamp(pf.y + rand(-180,180), WORLD_TOP_MARGIN+60, 7500);
      pf.retarget = rand(240,420);
    }
    const dx = pf.targetX-pf.x, dy = pf.targetY-pf.y, d = Math.hypot(dx,dy)||1;
    pf.vx = lerp(pf.vx, (dx/d)*1.0, 0.012*dt);
    pf.vy = lerp(pf.vy, (dy/d)*1.0, 0.012*dt);
    pf.x += pf.vx*dt; pf.y += pf.vy*dt;
    pf.angle = Math.atan2(pf.vy, pf.vx);
    pf.displayAngle = lerpAngle(pf.displayAngle, pf.angle, 0.03*dt);
    pf.tailPhase += 0.12*dt;

    pf.g.x = pf.x; pf.g.y = pf.y; orient(pf.g, pf.displayAngle);
    redrawParrotfish(pf);
  }

  function redrawParrotfish(pf){
    const sp = Math.hypot(pf.vx, pf.vy)/1.0;
    drawFishShape(pf.g, pf.size*0.95, { body:pf.color, fin:0x9ff2e4 }, pf.tailPhase, sp, 0, 0, { thick:1.12, nose:0.5, len:0.95, tail:'round', dorsal:1.25 });
    // beak-like mouth plate
    const g = pf.g, s = pf.size*0.95;
    g.lineStyle({ width:Math.max(1.2, s*0.06), color:0xffe9a8, ...ROUND });
    g.moveTo(s*0.95, -s*0.05); g.lineTo(s*1.05, s*0.06); g.lineTo(s*0.9, s*0.12);
  }

  /* ---- BLOBFISH ---- */
  function spawnBlobfish(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Blobfish', 20);
    return {
      type:'blobfish',
      x, y,
      vx:0, vy:0,
      targetX: x + rand(-150,150),
      targetY: clamp(y + rand(-80,80), 5000, 7500),
      retarget: rand(300,500),
      phase: rand(0,Math.PI*2),
      size: rand(14,20),
      g
    };
  }

  function updateBlobfish(b, dt){
    b.retarget -= dt;
    if(b.retarget <= 0){
      b.targetX = b.x + rand(-180,180);
      b.targetY = clamp(b.y + rand(-100,100), 5000, 7500);
      b.retarget = rand(350,550);
    }
    const dx = b.targetX-b.x, dy = b.targetY-b.y, d = Math.hypot(dx,dy)||1;
    b.vx = lerp(b.vx, (dx/d)*0.3, 0.005*dt);
    b.vy = lerp(b.vy, (dy/d)*0.3, 0.005*dt);
    b.x += b.vx*dt; b.y += b.vy*dt;
    b.phase += 0.03*dt;

    b.g.x = b.x; b.g.y = b.y;
    redrawBlobfish(b);
  }

  function redrawBlobfish(b){
    const g = b.g;
    g.clear();
    const s = b.size;
    const squish = 1 + Math.sin(b.phase)*0.08;

    g.lineStyle({ width: Math.max(1.6, s*0.12), color: 0xffb8b8, ...ROUND });
    g.drawEllipse(0, 0, s*0.7*squish, s*0.85);

    g.lineStyle({ width: Math.max(1, s*0.06), color: 0xffc8c8, alpha:0.6 });
    g.moveTo(-s*0.3, -s*0.5);
    g.lineTo(-s*0.5, -s*0.8);
    g.lineTo(-s*0.1, -s*0.6);
    g.moveTo(s*0.3, -s*0.5);
    g.lineTo(s*0.5, -s*0.8);
    g.lineTo(s*0.1, -s*0.6);


    g.lineStyle(1, 0xff9090);
    g.moveTo(-s*0.1, s*0.1);
    g.quadraticCurveTo(0, s*0.2, s*0.1, s*0.1);
  }

  /* ---- SEA DRAGON ---- */
  function spawnSeaDragon(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Sea Dragon', 22);
    return {
      type:'seadragon',
      x, y,
      vx: rand(-0.4,0.4), vy: rand(-0.2,0.2),
      targetX: x + rand(-200,200),
      targetY: clamp(y + rand(-100,100), WORLD_TOP_MARGIN+60, 7500),
      retarget: rand(250,450),
      phase: rand(0,Math.PI*2),
      size: rand(14,20),
      g
    };
  }

  function updateSeaDragon(sd, dt){
    sd.retarget -= dt;
    if(sd.retarget <= 0){
      sd.targetX = sd.x + rand(-250,250);
      sd.targetY = clamp(sd.y + rand(-120,120), WORLD_TOP_MARGIN+60, 7500);
      sd.retarget = rand(280,500);
    }
    const dx = sd.targetX-sd.x, dy = sd.targetY-sd.y, d = Math.hypot(dx,dy)||1;
    sd.vx = lerp(sd.vx, (dx/d)*0.5, 0.008*dt);
    sd.vy = lerp(sd.vy, (dy/d)*0.5, 0.008*dt);
    sd.x += sd.vx*dt; sd.y += sd.vy*dt;
    sd.phase += 0.05*dt;

    sd.g.x = sd.x; sd.g.y = sd.y;
    redrawSeaDragon(sd);
  }

  function redrawSeaDragon(sd){
    const g = sd.g;
    g.clear();
    const s = sd.size;

    g.lineStyle({ width: Math.max(1.4, s*0.1), color: 0xffd700, ...ROUND });
    g.drawEllipse(0, 0, s*0.5, s*0.7);

    for(let i=0;i<4;i++){
      const fy = lerp(-s*0.5, s*0.5, i/3);
      const finSway = Math.sin(sd.phase + i)*s*0.2;
      g.lineStyle({ width: Math.max(0.8, s*0.05), color: 0xffe44d, alpha:0.7 });
      g.moveTo(-s*0.3, fy);
      g.lineTo(-s*0.6, fy - s*0.3 + finSway);
      g.lineTo(-s*0.4, fy - s*0.5 + finSway);
      g.lineTo(-s*0.1, fy - s*0.1);
    }

  }

  /* ---- WHALE ---- */
  function spawnWhale(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Whale', 55);
    return {
      type:'whale',
      x, y,
      vx: rand(-0.6,0.6), vy: rand(-0.2,0.2),
      targetX: x + rand(-800,800),
      targetY: clamp(y + rand(-200,200), WORLD_TOP_MARGIN+80, 5000),
      retarget: rand(400,600),
      angle:0, displayAngle:0,
      tailPhase: rand(0,Math.PI*2),
      spoutTimer: rand(200,400),
      size: rand(55,75),
      g
    };
  }

  function updateWhale(w, dt){
    w.retarget -= dt;
    w.spoutTimer -= dt;
    if(w.retarget <= 0){
      w.targetX = w.x + rand(-900,900);
      w.targetY = clamp(w.y + rand(-250,250), WORLD_TOP_MARGIN+80, 5000);
      w.retarget = rand(450,650);
    }
    const dx = w.targetX-w.x, dy = w.targetY-w.y, d = Math.hypot(dx,dy)||1;
    w.vx = lerp(w.vx, (dx/d)*0.6, 0.004*dt);
    w.vy = lerp(w.vy, (dy/d)*0.6, 0.004*dt);
    w.x += w.vx*dt; w.y += w.vy*dt;
    w.angle = Math.atan2(w.vy, w.vx);
    w.displayAngle = lerpAngle(w.displayAngle, w.angle, 0.012*dt);
    w.tailPhase += 0.04*dt;

    w.g.x = w.x; w.g.y = w.y; orient(w.g, w.displayAngle);
    redrawWhale(w);
  }

  function redrawWhale(w){
    const s = w.size;
    drawFishShape(w.g, s*0.95, { body:0x6f95bb, fin:0x93b4d4 }, w.tailPhase, Math.hypot(w.vx, w.vy)/0.6, 0, 0,
      { thick:0.82, len:1.1, nose:0.55, dorsal:0.25, pectoral:0.9, tail:'fluke', tailLen:0.9, tailSpread:1.25 });
    // throat grooves
    const g = w.g;
    g.lineStyle({ width:1, color:0x93b4d4, alpha:0.4 });
    for(let i=0;i<5;i++){
      const x = s*(0.75 - i*0.17);
      g.moveTo(x, s*0.2); g.lineTo(x - s*0.1, s*0.44 - i*0.02*s);
    }
  }

  /* ---- DOLPHIN ---- */
  function spawnDolphin(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Dolphin', 32);
    return {
      type:'dolphin',
      x, y,
      vx: rand(-1.2,1.2), vy: rand(-0.5,0.5),
      targetX: x + rand(-500,500),
      targetY: clamp(y + rand(-200,200), WORLD_TOP_MARGIN+60, 4000),
      retarget: rand(200,380),
      angle:0, displayAngle:0,
      tailPhase: rand(0,Math.PI*2),
      jumpTimer: rand(300,600),
      size: rand(22,30),
      g
    };
  }

  function updateDolphin(d, dt){
    d.retarget -= dt;
    d.jumpTimer -= dt;
    if(d.retarget <= 0){
      d.targetX = d.x + rand(-600,600);
      d.targetY = clamp(d.y + rand(-250,250), WORLD_TOP_MARGIN+60, 4000);
      d.retarget = rand(250,420);
    }
    const dx = d.targetX-d.x, dy = d.targetY-d.y, dmag = Math.hypot(dx,dy)||1;
    d.vx = lerp(d.vx, (dx/dmag)*1.6, 0.012*dt);
    d.vy = lerp(d.vy, (dy/dmag)*1.6, 0.012*dt);
    d.x += d.vx*dt; d.y += d.vy*dt;
    d.angle = Math.atan2(d.vy, d.vx);
    d.displayAngle = lerpAngle(d.displayAngle, d.angle, 0.04*dt);
    d.tailPhase += 0.14*dt;

    d.g.x = d.x; d.g.y = d.y; orient(d.g, d.displayAngle);
    redrawDolphin(d);
  }

  function redrawDolphin(d){
    drawFishShape(d.g, d.size, { body:0x8fa6bc, fin:0xb9cbdb }, d.tailPhase, Math.hypot(d.vx, d.vy)/1.6, 0, 0,
      { thick:0.74, len:1.05, nose:0.7, snout:{ len:0.32, color:0x8fa6bc }, dorsal:1.0, tail:'fluke', tailSpread:1.15 });
  }

  /* ---- SWORDFISH ---- */
  function spawnSwordfish(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Swordfish', 36);
    return {
      type:'swordfish',
      x, y,
      vx: rand(-1.5,1.5), vy: rand(-0.4,0.4),
      targetX: x + rand(-700,700),
      targetY: clamp(y + rand(-200,200), WORLD_TOP_MARGIN+80, 6000),
      retarget: rand(180,320),
      angle:0, displayAngle:0,
      tailPhase: rand(0,Math.PI*2),
      size: rand(28,38),
      g
    };
  }

  function updateSwordfish(sf, dt){
    sf.retarget -= dt;
    if(sf.retarget <= 0){
      sf.targetX = sf.x + rand(-800,800);
      sf.targetY = clamp(sf.y + rand(-250,250), WORLD_TOP_MARGIN+80, 6000);
      sf.retarget = rand(220,380);
    }
    const dx = sf.targetX-sf.x, dy = sf.targetY-sf.y, d = Math.hypot(dx,dy)||1;
    sf.vx = lerp(sf.vx, (dx/d)*2.2, 0.015*dt);
    sf.vy = lerp(sf.vy, (dy/d)*2.2, 0.015*dt);
    sf.x += sf.vx*dt; sf.y += sf.vy*dt;
    sf.angle = Math.atan2(sf.vy, sf.vx);
    sf.displayAngle = lerpAngle(sf.displayAngle, sf.angle, 0.035*dt);
    sf.tailPhase += 0.16*dt;

    sf.g.x = sf.x; sf.g.y = sf.y; orient(sf.g, sf.displayAngle);
    redrawSwordfish(sf);
  }

  function redrawSwordfish(sf){
    drawFishShape(sf.g, sf.size, { body:0x6f86b8, fin:0x9cb2dc }, sf.tailPhase, Math.hypot(sf.vx, sf.vy)/2.2, 0, 0,
      { thick:0.62, len:1.05, nose:0.8, snout:{ len:1.15, color:0xc8d8f0 }, dorsal:1.35, tail:'lunate', tailSpread:1.0 });
  }

  /* ---- NAUTILUS ---- */
  function spawnNautilus(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Nautilus', 22);
    return {
      type:'nautilus',
      x, y,
      vx: rand(-0.3,0.3), vy: rand(-0.15,0.15),
      targetX: x + rand(-200,200),
      targetY: clamp(y + rand(-100,100), WORLD_TOP_MARGIN+80, 7500),
      retarget: rand(300,500),
      angle:0, displayAngle:0,
      shellPhase: rand(0,Math.PI*2),
      size: rand(14,20),
      g
    };
  }

  function updateNautilus(n, dt){
    n.retarget -= dt;
    if(n.retarget <= 0){
      n.targetX = n.x + rand(-250,250);
      n.targetY = clamp(n.y + rand(-120,120), WORLD_TOP_MARGIN+80, 7500);
      n.retarget = rand(350,550);
    }
    const dx = n.targetX-n.x, dy = n.targetY-n.y, d = Math.hypot(dx,dy)||1;
    n.vx = lerp(n.vx, (dx/d)*0.4, 0.008*dt);
    n.vy = lerp(n.vy, (dy/d)*0.4, 0.008*dt);
    n.x += n.vx*dt; n.y += n.vy*dt;
    n.angle = Math.atan2(n.vy, n.vx);
    n.displayAngle = lerpAngle(n.displayAngle, n.angle, 0.02*dt);
    n.shellPhase += 0.06*dt;

    n.g.x = n.x; n.g.y = n.y; orient(n.g, n.displayAngle);
    redrawNautilus(n);
  }

  function redrawNautilus(n){
    const g = n.g;
    g.clear();
    const s = n.size;

    g.lineStyle({ width: Math.max(1.6, s*0.12), color: 0xc8a882, ...ROUND });
    g.drawCircle(0, 0, s*0.7);

    for(let i=1;i<=3;i++){
      g.lineStyle({ width: Math.max(1, s*0.06), color: 0xd8b892, alpha:0.7 });
      g.drawCircle(0, 0, s*0.7 * (i/3));
    }

    const tentSway = Math.sin(n.shellPhase)*s*0.15;
    g.lineStyle({ width: Math.max(0.8, s*0.05), color: 0xb89872, alpha:0.8 });
    g.moveTo(-s*0.4, 0);
    g.lineTo(-s*0.7, -s*0.3 + tentSway);
    g.lineTo(-s*0.6, s*0.1 + tentSway);
    g.lineTo(-s*0.35, s*0.05);

  }

  /* ---- SEA SNAKE ---- */
  function spawnSeaSnake(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Sea Snake', 24);
    return {
      type:'seasnake',
      x, y,
      vx: rand(-0.8,0.8), vy: rand(-0.3,0.3),
      targetX: x + rand(-400,400),
      targetY: clamp(y + rand(-150,150), WORLD_TOP_MARGIN+80, 7500),
      retarget: rand(250,420),
      phase: rand(0,Math.PI*2),
      size: rand(16,24),
      g
    };
  }

  function updateSeaSnake(sn, dt){
    sn.retarget -= dt;
    if(sn.retarget <= 0){
      sn.targetX = sn.x + rand(-500,500);
      sn.targetY = clamp(sn.y + rand(-180,180), WORLD_TOP_MARGIN+80, 7500);
      sn.retarget = rand(280,480);
    }
    const dx = sn.targetX-sn.x, dy = sn.targetY-sn.y, d = Math.hypot(dx,dy)||1;
    sn.vx = lerp(sn.vx, (dx/d)*0.9, 0.01*dt);
    sn.vy = lerp(sn.vy, (dy/d)*0.9, 0.01*dt);
    sn.x += sn.vx*dt; sn.y += sn.vy*dt;
    sn.phase += 0.08*dt;

    sn.g.x = sn.x; sn.g.y = sn.y;
    redrawSeaSnake(sn);
  }

  function redrawSeaSnake(sn){
    const g = sn.g;
    g.clear();
    const s = sn.size;

    g.lineStyle({ width: Math.max(1.6, s*0.1), color: 0x5a8a5a, ...ROUND });
    for(let seg=0; seg<8; seg++){
      const t = seg/7;
      const sx = lerp(-s*1.2, s*1.2, t);
      const sy = Math.sin(sn.phase + seg*0.9)*s*0.25;
      if(seg===0) g.moveTo(sx, sy);
      else g.lineTo(sx, sy);
    }

    for(let i=0;i<3;i++){
      const bx = lerp(-s*0.8, s*0.8, i/2);
      const by = Math.sin(sn.phase + i*1.2)*s*0.25;
      g.lineStyle({ width: Math.max(0.8, s*0.05), color: 0xffd700, alpha:0.8 });
      g.moveTo(bx, by);
      g.lineTo(bx + s*0.15, by - s*0.25);
    }

  }

  /* ---- SUNFISH ---- */
  function spawnSunfish(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Sunfish', 45);
    return {
      type:'sunfish',
      x, y,
      vx: rand(-0.5,0.5), vy: rand(-0.3,0.3),
      targetX: x + rand(-500,500),
      targetY: clamp(y + rand(-200,200), WORLD_TOP_MARGIN+80, 5000),
      retarget: rand(300,500),
      angle:0, displayAngle:0,
      finPhase: rand(0,Math.PI*2),
      size: rand(35,48),
      g
    };
  }

  function updateSunfish(sf, dt){
    sf.retarget -= dt;
    if(sf.retarget <= 0){
      sf.targetX = sf.x + rand(-600,600);
      sf.targetY = clamp(sf.y + rand(-250,250), WORLD_TOP_MARGIN+80, 5000);
      sf.retarget = rand(350,550);
    }
    const dx = sf.targetX-sf.x, dy = sf.targetY-sf.y, d = Math.hypot(dx,dy)||1;
    sf.vx = lerp(sf.vx, (dx/d)*0.7, 0.006*dt);
    sf.vy = lerp(sf.vy, (dy/d)*0.7, 0.006*dt);
    sf.x += sf.vx*dt; sf.y += sf.vy*dt;
    sf.angle = Math.atan2(sf.vy, sf.vx);
    sf.displayAngle = lerpAngle(sf.displayAngle, sf.angle, 0.015*dt);
    sf.finPhase += 0.06*dt;

    sf.g.x = sf.x; sf.g.y = sf.y; orient(sf.g, sf.displayAngle);
    redrawSunfish(sf);
  }

  function redrawSunfish(sf){
    const g = sf.g;
    g.clear();
    const s = sf.size;

    g.lineStyle({ width: Math.max(2, s*0.06), color: 0x7a8a7a, ...ROUND });
    g.drawEllipse(0, 0, s*0.7, s*0.9);

    const finWave = Math.sin(sf.finPhase)*s*0.25;
    g.lineStyle({ width: Math.max(1.5, s*0.05), color: 0x8a9a8a, ...ROUND });
    g.moveTo(s*0.3, -s*0.5);
    g.lineTo(s*0.6, -s*0.9 + finWave);
    g.lineTo(s*0.2, -s*0.7 + finWave);
    g.moveTo(s*0.3, s*0.5);
    g.lineTo(s*0.6, s*0.9 - finWave);
    g.lineTo(s*0.2, s*0.7 - finWave);

    g.lineStyle({ width: Math.max(1, s*0.04), color: 0x6a7a6a, alpha:0.6 });
    g.moveTo(-s*0.3, -s*0.3);
    g.lineTo(s*0.3, 0);
    g.lineTo(-s*0.3, s*0.3);

  }

  /* ---- DUMBO OCTOPUS ---- */
  function spawnDumboOctopus(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Dumbo Octopus', 26);
    return {
      type:'dumbooctopus',
      x, y,
      vx:0, vy:0,
      targetX: x + rand(-250,250),
      targetY: clamp(y + rand(-120,120), 5000, 7500),
      retarget: rand(250,420),
      earPhase: rand(0,Math.PI*2),
      size: rand(14,20),
      color: 0xffa0b0,
      g
    };
  }

  function updateDumboOctopus(do_, dt){
    do_.retarget -= dt;
    if(do_.retarget <= 0){
      do_.targetX = do_.x + rand(-300,300);
      do_.targetY = clamp(do_.y + rand(-140,140), 5000, 7500);
      do_.retarget = rand(280,480);
    }
    const dx = do_.targetX-do_.x, dy = do_.targetY-do_.y, d = Math.hypot(dx,dy)||1;
    do_.vx = lerp(do_.vx, (dx/d)*0.5, 0.008*dt);
    do_.vy = lerp(do_.vy, (dy/d)*0.5, 0.008*dt);
    do_.x += do_.vx*dt; do_.y += do_.vy*dt;
    do_.earPhase += 0.07*dt;

    do_.g.x = do_.x; do_.g.y = do_.y;
    redrawDumboOctopus(do_);
  }

  function redrawDumboOctopus(do_){
    const g = do_.g;
    g.clear();
    const s = do_.size;

    g.lineStyle({ width: Math.max(1.6, s*0.12), color: do_.color, ...ROUND });
    g.drawEllipse(0, 0, s*0.6, s*0.5);

    const earFlap = Math.sin(do_.earPhase)*s*0.15;
    g.lineStyle({ width: Math.max(1.2, s*0.08), color: 0xffb8c8, alpha:0.8, ...ROUND });
    g.moveTo(-s*0.3, -s*0.2);
    g.quadraticCurveTo(-s*0.7, -s*0.5 + earFlap, -s*0.4, -s*0.1);
    g.moveTo(s*0.3, -s*0.2);
    g.quadraticCurveTo(s*0.7, -s*0.5 + earFlap, s*0.4, -s*0.1);

    for(let i=0;i<6;i++){
      const tx = lerp(-s*0.3, s*0.3, i/5);
      g.lineStyle({ width: Math.max(0.8, s*0.05), color: do_.color, alpha:0.7 });
      g.moveTo(tx, s*0.2);
      g.lineTo(tx + Math.sin(do_.earPhase + i)*s*0.1, s*0.7);
    }

  }

  /* ---- GOBLIN SHARK ---- */
  function spawnGoblinShark(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Goblin Shark', 38);
    return {
      type:'goblinshark',
      x, y,
      vx: rand(-0.8,0.8), vy: rand(-0.3,0.3),
      targetX: x + rand(-500,500),
      targetY: clamp(y + rand(-150,150), 4000, 7500),
      retarget: rand(300,500),
      angle:0, displayAngle:0,
      jawPhase: rand(0,Math.PI*2),
      size: rand(28,38),
      g
    };
  }

  function updateGoblinShark(gs, dt){
    gs.retarget -= dt;
    if(gs.retarget <= 0){
      gs.targetX = gs.x + rand(-600,600);
      gs.targetY = clamp(gs.y + rand(-180,180), 4000, 7500);
      gs.retarget = rand(350,550);
    }
    const dx = gs.targetX-gs.x, dy = gs.targetY-gs.y, d = Math.hypot(dx,dy)||1;
    gs.vx = lerp(gs.vx, (dx/d)*1.0, 0.008*dt);
    gs.vy = lerp(gs.vy, (dy/d)*1.0, 0.008*dt);
    gs.x += gs.vx*dt; gs.y += gs.vy*dt;
    gs.angle = Math.atan2(gs.vy, gs.vx);
    gs.displayAngle = lerpAngle(gs.displayAngle, gs.angle, 0.02*dt);
    gs.jawPhase += 0.05*dt;

    gs.g.x = gs.x; gs.g.y = gs.y; orient(gs.g, gs.displayAngle);
    redrawGoblinShark(gs);
  }

  function redrawGoblinShark(gs){
    const s = gs.size;
    drawFishShape(gs.g, s, { body:0xb09ac4, fin:0xd3c4e2 }, gs.jawPhase*1.6, Math.hypot(gs.vx, gs.vy)/1.0, 0, 0,
      { thick:0.66, len:0.9, snout:{ len:0.8, color:0xe0d0f0 }, dorsal:1.0, tail:'fork', tailLen:1.15 });
    // protruding jaw
    const g = gs.g, open = (Math.sin(gs.jawPhase)*0.5 + 0.5)*s*0.18;
    g.lineStyle({ width:Math.max(1.2, s*0.05), color:0xff9aa8, alpha:0.85, ...ROUND });
    g.moveTo(s*0.75, s*0.12); g.lineTo(s*0.95, s*0.2 + open); g.lineTo(s*0.55, s*0.2 + open*0.6);
  }

  /* ---- OARFISH ---- */
  function spawnOarfish(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Oarfish', 30);
    return {
      type:'oarfish',
      x, y,
      vx: rand(-0.8,0.8), vy: rand(-0.3,0.3),
      targetX: x + rand(-500,500),
      targetY: clamp(y + rand(-200,200), WORLD_TOP_MARGIN+80, 7000),
      retarget: rand(300,500),
      phase: rand(0,Math.PI*2),
      size: rand(20,30),
      g
    };
  }

  function updateOarfish(o, dt){
    o.retarget -= dt;
    if(o.retarget <= 0){
      o.targetX = o.x + rand(-600,600);
      o.targetY = clamp(o.y + rand(-250,250), WORLD_TOP_MARGIN+80, 7000);
      o.retarget = rand(350,550);
    }
    const dx = o.targetX-o.x, dy = o.targetY-o.y, d = Math.hypot(dx,dy)||1;
    o.vx = lerp(o.vx, (dx/d)*0.8, 0.006*dt);
    o.vy = lerp(o.vy, (dy/d)*0.8, 0.006*dt);
    o.x += o.vx*dt; o.y += o.vy*dt;
    o.phase += 0.04*dt;

    o.g.x = o.x; o.g.y = o.y;
    redrawOarfish(o);
  }

  function redrawOarfish(o){
    const g = o.g;
    g.clear();
    const s = o.size;

    g.lineStyle({ width: Math.max(1.6, s*0.1), color: 0xffd700, ...ROUND });
    g.drawEllipse(0, 0, s*0.4, s*0.6);

    for(let seg=0; seg<6; seg++){
      const sy = lerp(s*0.5, s*2.2, seg/5);
      const sway = Math.sin(o.phase + seg*0.8)*s*0.15;
      g.lineStyle({ width: Math.max(1, s*0.06), color: 0xffe44d, alpha:0.8 });
      g.moveTo(0, sy - s*0.3);
      g.lineTo(sway, sy);
      g.lineTo(-sway*0.5, sy + s*0.2);
    }

    const crestSway = Math.sin(o.phase*2)*s*0.3;
    g.lineStyle({ width: Math.max(1.2, s*0.08), color: 0xff4444, ...ROUND });
    g.moveTo(0, -s*0.5);
    g.lineTo(crestSway, -s*1.2);
    g.lineTo(-crestSway*0.3, -s*0.9);
    g.lineTo(0, -s*0.5);

  }

  /* ---- MANATEE ---- */
  function spawnManatee(x,y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Manatee', 40);
    return {
      type:'manatee',
      x, y,
      vx: rand(-0.6,0.6), vy: rand(-0.2,0.2),
      targetX: x + rand(-400,400),
      targetY: clamp(y + rand(-150,150), WORLD_TOP_MARGIN+80, 4000),
      retarget: rand(350,550),
      angle:0, displayAngle:0,
      tailPhase: rand(0,Math.PI*2),
      size: rand(32,44),
      g
    };
  }

  function updateManatee(m, dt){
    m.retarget -= dt;
    if(m.retarget <= 0){
      m.targetX = m.x + rand(-500,500);
      m.targetY = clamp(m.y + rand(-180,180), WORLD_TOP_MARGIN+80, 4000);
      m.retarget = rand(400,600);
    }
    const dx = m.targetX-m.x, dy = m.targetY-m.y, d = Math.hypot(dx,dy)||1;
    m.vx = lerp(m.vx, (dx/d)*0.7, 0.005*dt);
    m.vy = lerp(m.vy, (dy/d)*0.7, 0.005*dt);
    m.x += m.vx*dt; m.y += m.vy*dt;
    m.angle = Math.atan2(m.vy, m.vx);
    m.displayAngle = lerpAngle(m.displayAngle, m.angle, 0.015*dt);
    m.tailPhase += 0.05*dt;

    m.g.x = m.x; m.g.y = m.y; orient(m.g, m.displayAngle);
    redrawManatee(m);
  }

  function redrawManatee(m){
    const g = m.g;
    g.clear();
    const s = m.size;

    g.lineStyle({ width: Math.max(2, s*0.08), color: 0x8a7a6a, ...ROUND });
    g.drawEllipse(0, 0, s, s*0.55);

    g.lineStyle({ width: Math.max(1.5, s*0.06), color: 0x7a6a5a, ...ROUND });
    g.moveTo(s*0.3, -s*0.35);
    g.quadraticCurveTo(s*0.5, -s*0.6, s*0.2, -s*0.5);

    const tailWag = Math.sin(m.tailPhase)*s*0.2;
    g.moveTo(-s*0.8, 0);
    g.lineTo(-s*1.4, -s*0.3 + tailWag);
    g.lineTo(-s*1.5, s*0.1 + tailWag);
    g.lineTo(-s*0.85, s*0.2);

  }


  return {
    drawFishShape,
    orient,
    SHARK_COLORS,
    schools,
    spawnSchool,
    updateSchool,
    destroySchool,
    spawnJellyfish,
    updateJelly,
    spawnCrab,
    updateCrab,
    spawnTurtle,
    updateTurtle,
    spawnShark,
    updateShark,
    spawnOctopus,
    updateOctopus,
    spawnSeahorse,
    updateSeahorse,
    spawnStingray,
    updateStingray,
    spawnEel,
    updateEel,
    spawnStarfish,
    updateStarfish,
    spawnSeaUrchin,
    updateSeaUrchin,
    spawnPufferfish,
    updatePufferfish,
    spawnMantaRay,
    updateMantaRay,
    spawnSquid,
    updateSquid,
    spawnAnglerfish,
    updateAnglerfish,
    spawnNarwhal,
    updateNarwhal,
    spawnHammerhead,
    updateHammerhead,
    spawnIsopod,
    updateIsopod,
    spawnLionfish,
    updateLionfish,
    spawnCuttlefish,
    updateCuttlefish,
    spawnParrotfish,
    updateParrotfish,
    spawnBlobfish,
    updateBlobfish,
    spawnSeaDragon,
    updateSeaDragon,
    spawnWhale,
    updateWhale,
    spawnDolphin,
    updateDolphin,
    spawnSwordfish,
    updateSwordfish,
    spawnNautilus,
    updateNautilus,
    spawnSeaSnake,
    updateSeaSnake,
    spawnSunfish,
    updateSunfish,
    spawnDumboOctopus,
    updateDumboOctopus,
    spawnGoblinShark,
    updateGoblinShark,
    spawnOarfish,
    updateOarfish,
    spawnManatee,
    updateManatee
  };
};

})(window);
