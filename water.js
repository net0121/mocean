/* =============================================================================
   water.js — everything that makes the water feel alive:
     • current(x, y, t)   slow, swirling ocean currents (nudges player, fish, plankton)
     • light shafts       animated sun rays that fade with depth and daylight
     • marine snow        parallax plankton that drifts with the current
     • swim wake          a fading ribbon behind the fish when it moves fast
     • sand kicks         puffs of sand when you scrape the seafloor
     • depth vignette     the view closes in and darkens as you dive
   Loaded before game.js. game.js calls MoceanWater(ctx).
   ============================================================================= */
(function(global){
"use strict";

global.MoceanWater = function(ctx){
  const { app, world, player, view, creaturesLayer, getDaylight, rand, clamp, inCave } = ctx;
  // optional hooks so the upturned sea (see sky.js) gets the same underwater treatment
  const isWet = ctx.isWet || (()=> player.y > 0);
  const waterDepth = ctx.waterDepth || (()=> player.y);
  const isInverted = ctx.isInverted || (()=> false);
  const invSurfaceY = ctx.invSurfaceY || 0;

  /* ------------------------------------------------------------ currents */

  function current(x, y, t){
    const depthK = clamp(y/1500, 0, 1) * (1 - clamp((y - 6500)/1500, 0, 1)) * 0.8 + 0.2;   // strongest mid-water
    return {
      x: (Math.sin(y*0.0007 + t*0.00025) * 0.34 + Math.sin(x*0.0004 - t*0.00018 + 1.7) * 0.2) * depthK,
      y: Math.cos(x*0.0009 + t*0.0003) * 0.1 * depthK
    };
  }

  /* -------------------------------------------------------------- layers */

  const raysG = new PIXI.Graphics();
  raysG.blendMode = PIXI.BLEND_MODES.ADD;
  const motesG = new PIXI.Graphics();
  const trailG = new PIXI.Graphics();
  const sandG = new PIXI.Graphics();
  world.addChildAt(trailG, world.getChildIndex(creaturesLayer));
  world.addChild(sandG);
  const above = app.stage.getChildIndex(world) + 1;      // draw over the world, under the HUD-ish overlays
  app.stage.addChildAt(raysG, above);
  app.stage.addChildAt(motesG, above + 1);

  const vc = document.createElement('canvas');
  vc.width = vc.height = 256;
  {
    const c = vc.getContext('2d'), g = c.createRadialGradient(128,128,50, 128,128,181);
    g.addColorStop(0, 'rgba(0,6,14,0)');
    g.addColorStop(0.6, 'rgba(0,6,14,0.35)');
    g.addColorStop(1, 'rgba(0,6,14,1)');
    c.fillStyle = g; c.fillRect(0,0,256,256);
  }
  const vignette = new PIXI.Sprite(PIXI.Texture.from(vc));
  app.stage.addChild(vignette);

  /* -------------------------------------------------------- marine snow */

  const motes = [];
  for(let i=0;i<110;i++) motes.push({ u:Math.random(), v:Math.random(), z:0.25 + Math.random()*0.75, ph:rand(0,6.3), r:rand(0.6,1.8) });

  function drawMotes(now, W, H, underCam){
    motesG.clear();
    if(!underCam) return;
    const surfScreen = world.y;                         // screen-y of the surface
    const inv = isInverted(), invSurfScreen = world.y + invSurfaceY;
    const cur = current(player.x, player.y, now);
    for(const m of motes){
      const sx = (((m.u*(W+80) - player.x*m.z*0.55 + now*0.012*cur.x*m.z*6 + Math.sin(now*0.0006 + m.ph)*12) % (W+80)) + (W+80)) % (W+80) - 40;
      const sy = (((m.v*(H+80) - player.y*m.z*0.55 + now*0.004*m.z*(1 + cur.y*4) + Math.cos(now*0.0005 + m.ph)*8) % (H+80)) + (H+80)) % (H+80) - 40;
      if(inv ? sy > invSurfScreen - 6 : sy < surfScreen + 6) continue;
      motesG.beginFill(0xdff6ff, (0.10 + 0.26*m.z) * (0.6 + 0.4*Math.sin(now*0.002 + m.ph)));
      motesG.drawCircle(sx, sy, m.r*(0.6 + m.z*0.8));
      motesG.endFill();
    }
  }

  /* --------------------------------------------------------- light rays */

  function drawRays(now, W, H){
    raysG.clear();
    if(player.y > 2200) return;
    const day = getDaylight(now);
    const base = 0.06 * (0.25 + 0.75*day) * (1 - clamp(player.y/2200, 0, 1));
    if(base < 0.004) return;
    const top = Math.max(-40, world.y);
    if(top > H) return;
    for(let i=0;i<8;i++){
      const sway = Math.sin(now*0.0002 + i*1.9)*60;
      const x0 = ((i*(W/6) - player.x*0.12 + sway) % (W+300) + (W+300)) % (W+300) - 150;
      const pulse = 0.55 + 0.45*Math.sin(now*0.0007 + i*2.3);
      const w0 = 22 + (i%3)*14, slope = 0.34, len = 1200;
      for(let k=0;k<5;k++){
        const y0 = top + k*len/5, y1 = top + (k+1)*len/5;
        raysG.beginFill(0xcdeeff, base*pulse*(1 - k/5));
        raysG.drawPolygon([x0 + slope*(y0-top), y0, x0 + w0 + slope*(y0-top), y0,
                           x0 + w0*2.6 + slope*(y1-top), y1, x0 + slope*(y1-top) - w0*0.4, y1]);
        raysG.endFill();
      }
    }
  }

  /* ---------------------------------------------------------- swim wake */

  const trail = [];
  let sandP = [];

  function updateTrail(now, speed, swimming){
    if(swimming && speed > 2.2){
      const a = player.displayAngle, back = player.size*1.5;
      trail.push({ x:player.x - Math.cos(a)*back, y:player.y - Math.sin(a)*back, t:now, k:clamp(speed/9, 0, 1.4) });
    }
    while(trail.length && now - trail[0].t > 520) trail.shift();
    trailG.clear();
    for(let i=1;i<trail.length;i++){
      const a = trail[i-1], b = trail[i], age = (now - b.t)/520;
      trailG.lineStyle({ width:Math.max(0.6, (1 - age)*5*b.k), color:0xdff6ff, alpha:(1 - age)*0.35, cap:PIXI.LINE_CAP.ROUND });
      trailG.moveTo(a.x, a.y); trailG.lineTo(b.x, b.y);
    }
  }

  function kick(x, y, power){
    for(let i=0;i<Math.min(6, 2 + power|0);i++)
      sandP.push({ x:x + rand(-14,14), y:y + rand(-3,3), vx:rand(-1.2,1.2) + player.vx*0.2, vy:-rand(0.4,1.6)*Math.min(power,3), life:rand(24,46), max:46 });
    if(sandP.length > 90) sandP.splice(0, sandP.length - 90);
  }

  function drawSand(dt){
    sandG.clear();
    for(const p of sandP){
      p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 0.03*dt; p.vx *= Math.pow(0.97, dt); p.life -= dt;
      sandG.beginFill(0xcdb68a, clamp(p.life/p.max, 0, 1)*0.5);
      sandG.drawCircle(p.x, p.y, 1.2 + (1 - p.life/p.max)*1.8);
      sandG.endFill();
    }
    sandP = sandP.filter(p => p.life > 0);
  }

  /* ---------------------------------------------------------------- tick */

  function update(dt, now, speed){
    const W = app.screen.width, H = app.screen.height;
    const under = isWet();
    const cave = inCave();
    drawRays(now, W, H);
    if(cave) raysG.clear();
    drawMotes(now, W, H, under || cave);
    updateTrail(now, speed, under || cave);
    drawSand(dt);

    vignette.width = W; vignette.height = H;
    const d = waterDepth();
    vignette.alpha = cave ? 0.5 : clamp(d/260, 0, 1) * (0.14 + clamp(d/6000, 0, 1)*0.4);
  }

  return { current, kick, update };
};

})(window);
