/* =============================================================================
   sky.js — everything above the waves:

     • sun & moon         sprites loaded from IMAGE LINKS (see CONFIG just below)
     • the sky            four altitude zones, clouds, gulls, stars, aurora
     • thermals           rising wind columns that carry you up out of the sea
     • the upturned sea   an upside-down ocean floating at the top of the sky:
                          its surface faces down, its seafloor is a ceiling,
                          and its water gets darker the further UP you swim

   Altitude map (world y, 0 = sea surface, negative = up):

        y = -11700 - …   inverted seafloor (a rocky ceiling, decor hangs down)
        y =  -6500       surface of the upturned sea  (swim up into it)
        y =  -4800       Starlit Heights
        y =  -2800       High Winds
        y =   -900       Cloud Deck
        y =      0       sea surface      (Sea Breeze above it)

   Loaded after water.js / dungeons.js, before game.js. game.js calls MoceanSky(ctx).
   ============================================================================= */
(function(global){
"use strict";

/* ------------------------------------------------------------------ CONFIG
   Paste your own image links here. Tips:
     • the host must allow cross-origin loading (Wikimedia, Imgur, GitHub raw and
       most CDNs do) — otherwise the image silently falls back to the built-in one
     • images with a BLACK background work best with 'screen' or 'add' (the black
       disappears); images with a TRANSPARENT background work with any mode
     • leave a link empty ('') to use the built-in drawn sun / moon
   You can also change them while playing:  /sun <url>   /moon <url>   (saved)  */
const SUN_IMAGE_URL  = '';          // e.g. 'https://example.com/sun.png'
const MOON_IMAGE_URL = '';          // e.g. 'https://example.com/moon.png'
const SUN_BLEND  = 'screen';        // 'screen' | 'add' | 'normal'
const MOON_BLEND = 'screen';
const SUN_SIZE   = 1;               // 1 = default, 1.5 = a third bigger, …
const MOON_SIZE  = 1;
const SUN_KEY = 'mocean.sunImage', MOON_KEY = 'mocean.moonImage';

/* ------------------------------------------------------------- world map */

const C = {
  INV_SURFACE_Y: -6500,                  // surface of the upturned sea
  INV_DEPTH: 5200                        // how far "up" it goes before the rocky ceiling
};
C.INV_FLOOR_Y = C.INV_SURFACE_Y - C.INV_DEPTH;
C.INV_MID = C.INV_SURFACE_Y / 2;

const ZONES = [
  { name:'Sea Breeze',      top:-900 },
  { name:'Cloud Deck',      top:-2800 },
  { name:'High Winds',      top:-4800 },
  { name:'Starlit Heights', top:C.INV_SURFACE_Y }
];

const hash = (n)=>{ const x = Math.sin(n*127.1)*43758.5453123; return x - Math.floor(x); };

/* thermals: tall columns of rising wind, one every ~1900 px along the sea */
const T_SPACING = 1900, T_HALF = 190;
const thermalCenter = (k)=> k*T_SPACING + 900 + (hash(k*3.17 + 1.3) - 0.5)*500;
function thermal(x){                      // 0..1 strength at x
  const k0 = Math.round((x - 900)/T_SPACING);
  let best = 0;
  for(let k=k0-1;k<=k0+1;k++){
    const d = Math.abs(x - thermalCenter(k));
    if(d < T_HALF){ const f = 1 - d/T_HALF; best = Math.max(best, f*f*(3 - 2*f)); }
  }
  return best;
}
function nearestThermalX(x){
  const k0 = Math.round((x - 900)/T_SPACING);
  let bx = thermalCenter(k0), bd = Math.abs(bx - x);
  for(let k=k0-1;k<=k0+1;k++){ const c = thermalCenter(k), d = Math.abs(c - x); if(d < bd){ bd = d; bx = c; } }
  return bx;
}
const windX = (y, t)=> Math.sin(y*0.0005 + t*0.00015)*0.6 + 0.4;     // mostly blowing east

/* ============================================================== the module */

global.MoceanSky = function(ctx){
  const { app, world, player, creaturesLayer, skyG, Bio, getDaylight, getCycleTime, rand, randi, clamp, lerp, lerpAngle,
          floorY, inCave, drawFishShape, attachHoverLabel, burstBubbles, eaten, getMouth, getBrightness,
          isStarted, ROUND } = ctx;

  const BLEND = { screen: PIXI.BLEND_MODES.SCREEN, add: PIXI.BLEND_MODES.ADD, normal: PIXI.BLEND_MODES.NORMAL };
  const rgbHex = (c)=> (clamp(Math.round(c[0]),0,255) << 16) | (clamp(Math.round(c[1]),0,255) << 8) | clamp(Math.round(c[2]),0,255);
  const mix3 = (a, b, t)=> [lerp(a[0],b[0],t), lerp(a[1],b[1],t), lerp(a[2],b[2],t)];
  const smooth = (a, b, v)=>{ const t = clamp((v - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };

  const invFloorY = (x)=> C.INV_FLOOR_Y - (floorY(x) - 8000);     // the ceiling mirrors the seafloor's shape
  const isInverted = ()=> player.y <= C.INV_SURFACE_Y;

  function zoneAt(y, x){
    if(y >= 0) return null;
    if(y <= C.INV_SURFACE_Y) return 'Upturned ' + Bio.at(x).name;
    for(const z of ZONES) if(y > z.top) return z.name;
    return ZONES[ZONES.length-1].name;
  }

  /* ----------------------------------------------------------- layers */

  const highG = new PIXI.Graphics();          // deep-sky darkening, stars, aurora   (screen space)
  const cel = new PIXI.Container();           // sun + moon                           (screen space)
  const celMask = new PIXI.Graphics();        // keeps them above the horizon
  const invSeaG = new PIXI.Graphics();        // water of the upturned sea            (screen space)
  const cloudG = new PIXI.Graphics();         // clouds + gulls                       (world space)
  const windG = new PIXI.Graphics();          // thermal streaks                      (world space)
  const invFloorG = new PIXI.Graphics();      // ceiling terrain, drawn mirrored      (world space)
  const invSurfG = new PIXI.Graphics();       // underside of the surface + drips     (world space)

  const skyIdx = app.stage.getChildIndex(skyG);
  app.stage.addChildAt(highG, skyIdx + 1);
  app.stage.addChildAt(cel, skyIdx + 2);
  app.stage.addChildAt(celMask, skyIdx + 3);
  app.stage.addChildAt(invSeaG, skyIdx + 4);
  cel.mask = celMask;

  world.addChildAt(cloudG, 0);                              // behind everything in the world
  world.addChildAt(windG, 1);
  world.addChildAt(invFloorG, 2);
  world.addChildAt(invSurfG, 3);
  invFloorG.scale.y = -1;                                   // mirror: local y grows "up" from the ceiling
  invFloorG.y = C.INV_FLOOR_Y;

  const allLayers = [highG, cel, invSeaG, cloudG, windG, invFloorG, invSurfG];

  /* --------------------------------------------------- sun & moon art */

  function canvasTex(S, draw){
    const c = document.createElement('canvas'); c.width = c.height = S;
    draw(c.getContext('2d'), S);
    return PIXI.Texture.from(c);
  }
  const glowTex = canvasTex(256, (g, S)=>{
    const gr = g.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.35)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  });
  const sunFallback = canvasTex(256, (g, S)=>{
    const gr = g.createRadialGradient(S/2, S/2, S*0.04, S/2, S/2, S/2);
    gr.addColorStop(0, 'rgba(255,252,230,1)'); gr.addColorStop(0.36, 'rgba(255,224,130,1)');
    gr.addColorStop(0.42, 'rgba(255,190,80,0.55)'); gr.addColorStop(1, 'rgba(255,150,50,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  });
  const moonFallback = canvasTex(256, (g, S)=>{
    g.fillStyle = '#e9eefc'; g.beginPath(); g.arc(S/2, S/2, S*0.36, 0, Math.PI*2); g.fill();
    g.fillStyle = 'rgba(150,162,196,0.45)';
    [[0.42,0.40,0.07],[0.60,0.52,0.095],[0.47,0.63,0.05],[0.58,0.36,0.04],[0.36,0.54,0.035]].forEach(([x,y,r])=>{
      g.beginPath(); g.arc(S*x, S*y, S*r, 0, Math.PI*2); g.fill();
    });
  });

  function makeBody(blend){
    const glow = new PIXI.Sprite(glowTex), body = new PIXI.Sprite(sunFallback);
    glow.anchor.set(0.5); body.anchor.set(0.5);
    glow.blendMode = PIXI.BLEND_MODES.ADD;
    body.blendMode = blend;
    cel.addChild(glow, body);
    return { glow, body };
  }
  const sun  = makeBody(BLEND[SUN_BLEND]  ?? BLEND.screen);
  const moon = makeBody(BLEND[MOON_BLEND] ?? BLEND.screen);
  moon.body.texture = moonFallback;

  // loads an image link into a sprite; the built-in art stays up until (and unless) the image arrives
  function setImage(body, url, fallback, label){
    body.texture = fallback;
    if(!url) return;
    let tex;
    try{ tex = PIXI.Texture.from(url, { resourceOptions: { crossorigin: 'anonymous' } }); }
    catch(err){ console.warn(`[mocean] could not start loading the ${label} image`, err); return; }
    const bt = tex.baseTexture;
    if(bt.valid){ body.texture = tex; return; }
    bt.once('loaded', ()=>{ body.texture = tex; });
    bt.once('error', ()=>{ console.warn(`[mocean] the ${label} image failed to load (bad link, or the host blocks cross-origin use): ${url}`); body.texture = fallback; });
  }
  const saved = (key)=>{ try{ return localStorage.getItem(key) || ''; }catch(e){ return ''; } };
  const store = (key, v)=>{ try{ v ? localStorage.setItem(key, v) : localStorage.removeItem(key); }catch(e){} };
  function setSunImage(url){ store(SUN_KEY, url); setImage(sun.body, url || SUN_IMAGE_URL, sunFallback, 'sun'); }
  function setMoonImage(url){ store(MOON_KEY, url); setImage(moon.body, url || MOON_IMAGE_URL, moonFallback, 'moon'); }
  setImage(sun.body,  saved(SUN_KEY)  || SUN_IMAGE_URL,  sunFallback,  'sun');
  setImage(moon.body, saved(MOON_KEY) || MOON_IMAGE_URL, moonFallback, 'moon');

  function placeBody(b, x, y, size, alpha, tint, glowTint, glowMul){
    const tw = b.body.texture.width || 256, th = b.body.texture.height || 256;
    b.body.width = size; b.body.height = size*th/tw;
    b.body.position.set(x, y); b.body.alpha = alpha; b.body.tint = tint;
    b.glow.width = b.glow.height = size*glowMul;
    b.glow.position.set(x, y); b.glow.alpha = alpha*0.55; b.glow.tint = glowTint;
    b.body.visible = b.glow.visible = alpha > 0.01;
  }

  function drawCelestial(now, W, H){
    const horizon = world.y;
    cel.visible = horizon > 4;
    if(!cel.visible) return;
    celMask.clear(); celMask.beginFill(0xffffff); celMask.drawRect(0, 0, W, horizon - 2); celMask.endFill();

    const c = getCycleTime(now);
    const hy = Math.min(horizon, H*0.8);                  // when you climb, the sun keeps its own horizon
    const peak = hy*0.8;
    const base = clamp(Math.min(W, H)*0.24, 120, 230);

    const su = (c - 0.25)/0.5;                            // 06:00 -> 18:00
    if(su > 0 && su < 1){
      const e = Math.sin(su*Math.PI);
      const col = rgbHex(mix3([255,140,74], [255,255,255], clamp(e*2.2, 0, 1)));
      placeBody(sun, W*(0.12 + 0.76*su), hy - e*peak, base*SUN_SIZE*(1 + 0.25*(1 - e)), clamp(e*4, 0, 1), col, 0xffc070, 3.6);
    } else sun.body.visible = sun.glow.visible = false;

    const mu = (((c - 0.75) % 1) + 1) % 1/0.5;            // 18:00 -> 06:00
    if(mu > 0 && mu < 1){
      const e = Math.sin(mu*Math.PI);
      placeBody(moon, W*(0.12 + 0.76*mu), hy - e*peak, base*0.8*MOON_SIZE, clamp(e*4, 0, 1), 0xdfe8ff, 0x9fb8ff, 3.0);
      moon.body.rotation = -0.3 + mu*0.4;
    } else moon.body.visible = moon.glow.visible = false;
  }

  /* ------------------------------------------- high sky: dusk, stars, aurora */

  const STAR_N = 120;
  function drawHighSky(now, W, H){
    highG.clear();
    const sy = world.y;
    if(sy <= 0) return;
    const cut = Math.min(H, sy);
    const BAND = 32;
    for(let y=0; y<cut; y+=BAND){                         // darker the higher the row is above the sea
      const alt = sy - (y + BAND/2);
      const a = clamp((alt - 1200)/4400, 0, 1);
      if(a < 0.004) continue;
      highG.beginFill(0x0a0d34, a*0.82);
      highG.drawRect(0, y, W, Math.min(BAND, cut - y) + 1);
      highG.endFill();
    }
    const altC = sy - H*0.4;
    const starA = clamp((altC - 1800)/2600, 0, 1);     // (the night sky near the sea already has its own stars)
    if(starA > 0.01){
      for(let i=0;i<STAR_N;i++){
        const y = hash(i*3.9 + 1)*cut;
        const tw = 0.55 + 0.45*Math.sin(now*0.002 + i*1.7);
        highG.beginFill(i % 9 === 0 ? 0xcfe8ff : 0xffffff, starA*tw*0.9*clamp((sy - y - 1500)/2200, 0, 1));
        highG.drawCircle(hash(i*1.9)*W, y, 0.6 + hash(i*5.3)*1.3);
        highG.endFill();
      }
    }
    const auA = clamp((altC - 3800)/1800, 0, 1);          // aurora in the Starlit Heights
    if(auA > 0.02){
      const cols = [0x6dffb8, 0x9d8bff, 0x5de1ff];
      for(let k=0;k<3;k++){
        highG.lineStyle(30 - k*6, cols[k], auA*0.10);
        const base = H*(0.18 + k*0.11);
        for(let x=0;x<=W+24;x+=24){
          const y = base + Math.sin(x*0.004 + now*0.0003 + k*2.1)*38 + Math.sin(x*0.011 - now*0.0005)*10;
          x === 0 ? highG.moveTo(x, y) : highG.lineTo(x, y);
        }
      }
    }
  }

  /* ---------------------------------------------------------- clouds + gulls */

  function drawCloud(g, cx, cy, sz, seed, main, shade){
    const n = 5;
    g.lineStyle(0);
    for(let pass=0; pass<2; pass++){
      g.beginFill(pass === 0 ? shade : main, pass === 0 ? 0.55 : 0.8);
      const oy = pass === 0 ? sz*0.12 : 0;
      for(let j=0;j<n;j++){
        const bump = Math.sin(Math.PI*(j + 0.5)/n);
        const pr = sz*(0.42 + 0.36*bump)*(0.8 + 0.4*hash(seed + j*1.7));
        g.drawCircle(cx + (j - (n-1)/2)*sz*0.55, cy - bump*sz*0.22 + oy, pr);
      }
      g.drawEllipse(cx, cy + sz*0.14 + oy, sz*1.55, sz*0.3);
      g.endFill();
    }
    g.beginFill(0xffffff, 0.22); g.drawCircle(cx - sz*0.3, cy - sz*0.5, sz*0.28); g.endFill();
  }

  function drawClouds(now, W, H){
    cloudG.clear();
    const viewTop = -world.y, viewBot = viewTop + H;
    if(viewBot < C.INV_SURFACE_Y - 100 || viewTop > -150) return;

    const day = getDaylight(now), dusk = Math.max(0, 1 - Math.abs(day - 0.5)/0.25);
    let main = mix3([84,98,142], [255,255,255], smooth(0.25, 0.7, day));
    main = mix3(main, [255,196,170], dusk*0.45);
    const shade = mix3(main, [70,84,128], 0.45);
    const mainHex = rgbHex(main), shadeHex = rgbHex(shade);

    const ROW = 340, COL = 560;
    const rMin = Math.floor(Math.max(viewTop - 200, C.INV_SURFACE_Y + 160)/ROW);
    const rMax = Math.floor(Math.min(viewBot + 200, -220)/ROW);
    const left = -world.x - 320, right = -world.x + W + 320;
    for(let r=rMin; r<=rMax; r++){
      const rowY = r*ROW;
      if(rowY > -220 || rowY < C.INV_SURFACE_Y + 160) continue;
      const dens = (rowY < -900 && rowY > -2800) ? 0.52 : 0.2;     // the Cloud Deck is packed
      const drift = now*(0.006 + 0.012*hash(r*5.1))*(0.6 + windX(rowY, now)*0.5);
      const c0 = Math.floor((left - drift)/COL) - 1, c1 = Math.floor((right - drift)/COL) + 1;
      for(let c=c0; c<=c1; c++){
        if(hash(c*12.9898 + r*78.233) > dens) continue;
        const cx = c*COL + hash(c*3.3 + r*1.1)*COL*0.6 + drift;
        const cy = rowY + hash(c*7.7 + r*2.9)*ROW*0.6;
        drawCloud(cloudG, cx, cy, 58 + hash(c*5.5 + r*9.1)*92, c*1.3 + r*9.7, mainHex, shadeHex);
      }
    }
  }

  function drawGulls(now, W, H){
    if(player.y > 700 || player.y < -1800) return;
    const day = getDaylight(now);
    if(day < 0.3) return;
    for(let i=0;i<9;i++){
      const v = 0.04 + hash(i*2.1)*0.04;
      const bx = 1400*i + now*v;
      const x = ((bx - player.x + 1800) % 3600 + 3600) % 3600 - 1800 + player.x;
      const y = -140 - hash(i*7.3)*820 + Math.sin(now*0.0007 + i*2)*18;
      const flap = Math.sin(now*0.009*(0.8 + hash(i)) + i*3)*7;
      cloudG.lineStyle({ width:2, color:0xffffff, alpha:0.8, ...ROUND });
      cloudG.moveTo(x - 14, y + flap*0.4); cloudG.quadraticCurveTo(x - 7, y - flap, x, y);
      cloudG.quadraticCurveTo(x + 7, y - flap, x + 14, y + flap*0.4);
    }
  }

  /* ------------------------------------------------------------ thermals */

  function drawThermals(now, W, H){
    windG.clear();
    const viewTop = -world.y, viewBot = viewTop + H;
    const yTop = Math.max(viewTop - 120, C.INV_SURFACE_Y), yBot = Math.min(viewBot + 120, 0);
    if(yBot <= yTop) return;
    const left = -world.x - 240, right = -world.x + W + 240;
    const k0 = Math.floor((left - 900)/T_SPACING) - 1, k1 = Math.ceil((right - 900)/T_SPACING) + 1;
    const SLOT = 90;
    for(let k=k0;k<=k1;k++){
      const cx = thermalCenter(k);
      if(cx < left || cx > right) continue;
      // faint column edges
      windG.lineStyle(1, 0xdff6ff, 0.07);
      windG.moveTo(cx - T_HALF*0.8, yBot); windG.lineTo(cx - T_HALF*0.8, yTop);
      windG.moveTo(cx + T_HALF*0.8, yBot); windG.lineTo(cx + T_HALF*0.8, yTop);
      for(let s=Math.floor(yTop/SLOT); s<=Math.ceil(yBot/SLOT) + 1; s++){
        for(let q=0;q<2;q++){
          const seed = k*31.7 + s*7.13 + q*3.3, v = 0.12 + hash(seed)*0.14;
          const f = ((now*v/SLOT) + hash(seed*1.9)) % 1;
          const y = s*SLOT - f*SLOT*1.0;
          if(y < yTop || y > yBot) continue;
          const x = cx + (hash(seed*2.7) - 0.5)*T_HALF*1.5 + Math.sin(y*0.012 + seed)*9;
          const len = 26 + hash(seed*5.1)*40, a = Math.sin(Math.PI*f)*0.28;
          windG.lineStyle({ width:1.6, color:0xe8f8ff, alpha:a, ...ROUND });
          windG.moveTo(x, y); windG.quadraticCurveTo(x + 5, y - len*0.5, x - 2, y - len);
          if(q === 0 && hash(seed*8.1) > 0.6){            // a rising droplet
            windG.lineStyle(0); windG.beginFill(0xbfe9ff, a*1.3); windG.drawCircle(x + 8, y - len*0.3, 2.2); windG.endFill();
          }
        }
      }
    }
  }

  let hintT = 0;
  function thermalBubbles(dt){                            // under the waves, bubble streams point toward the sky
    if(player.y < 60 || player.y > 2400) return;
    const cx = nearestThermalX(player.x);
    if(Math.abs(cx - player.x) > 1100) return;
    hintT -= dt;
    if(hintT > 0) return;
    hintT = rand(6, 14);
    const y = player.y + rand(60, 340);
    const x = cx + rand(-T_HALF*0.7, T_HALF*0.7);
    if(y < floorY(x) - 20) burstBubbles(x, y, 1);
  }

  /* ----------------------------------------------------------- the upturned sea */

  const INV_STOPS = [
    [0.00,[78,160,196]], [0.08,[46,110,176]], [0.25,[30,64,146]], [0.55,[18,26,86]], [1.00,[7,5,30]]
  ];
  function invColor(f){
    f = clamp(f, 0, 1);
    for(let i=0;i<INV_STOPS.length-1;i++){
      const a = INV_STOPS[i], b = INV_STOPS[i+1];
      if(f >= a[0] && f <= b[0]) return mix3(a[1], b[1], (f - a[0])/(b[0] - a[0] || 1));
    }
    return INV_STOPS[INV_STOPS.length-1][1];
  }

  function drawInvSea(now, W, H){
    invSeaG.clear();
    const surfScreen = world.y + C.INV_SURFACE_Y;           // where its surface is on screen; water is ABOVE it
    if(surfScreen <= 0) return;
    const br = getBrightness();
    const tint = Bio.tintAt(player.x).map(v => 1 + (v - 1)*0.55);   // mirrors the biome you are under
    const shade = (c)=> rgbHex([c[0]*br*tint[0], c[1]*br*tint[1], c[2]*br*tint[2]]);
    const cut = Math.min(H, surfScreen - 8);
    const BAND = 16;
    for(let y=0; y<cut; y+=BAND){
      const depth = C.INV_SURFACE_Y - ((y + BAND/2) - world.y);
      invSeaG.beginFill(shade(invColor(depth/C.INV_DEPTH)));
      invSeaG.drawRect(0, y, W, Math.min(BAND, cut - y) + 1);
      invSeaG.endFill();
    }
    if(cut < H){                                            // last strip hugs the wavy surface
      const left = player.x - W/2;
      const pts = [0, Math.max(0, cut), W, Math.max(0, cut)];
      const steps = Math.ceil(W/16);
      for(let i=0;i<=steps;i++){
        const sx = W - W*(i/steps);
        const wy = surfScreen + Math.sin((left + sx)*0.02 - now*0.002)*4;
        pts.push(sx, Math.min(H + 2, Math.max(cut, wy)));
      }
      invSeaG.beginFill(shade(invColor(0)));
      invSeaG.drawPolygon(pts);
      invSeaG.endFill();
    }
    // light climbing out of the surface, up through the water
    if(surfScreen > 0 && surfScreen < H + 700){
      for(let i=0;i<6;i++){
        const x0 = ((i*(W/4) - player.x*0.1 + Math.sin(now*0.00022 + i*1.7)*70) % (W + 300) + (W + 300)) % (W + 300) - 150;
        const w0 = 24 + (i % 3)*14, pulse = 0.5 + 0.5*Math.sin(now*0.0008 + i*2.1);
        for(let k=0;k<5;k++){
          const y0 = surfScreen - k*150, y1 = surfScreen - (k+1)*150;
          if(y1 > H) continue;
          invSeaG.beginFill(0xcdeeff, 0.05*pulse*(1 - k/5));
          invSeaG.drawPolygon([x0 - 0.3*(surfScreen - y0), y0, x0 + w0 - 0.3*(surfScreen - y0), y0,
                               x0 + w0*2.4 - 0.3*(surfScreen - y1), y1, x0 - 0.3*(surfScreen - y1) - w0*0.4, y1]);
          invSeaG.endFill();
        }
      }
    }
  }

  function drawInvSurface(now, W, H){
    invSurfG.clear();
    const viewTop = -world.y, viewBot = viewTop + H;
    if(C.INV_SURFACE_Y < viewTop - 60 || C.INV_SURFACE_Y > viewBot + 460) return;
    const left = -world.x - 50, right = -world.x + W + 50;
    const wave = (x)=> C.INV_SURFACE_Y + Math.sin(x*0.02 - now*0.002)*4;
    invSurfG.lineStyle(2, 0xffffff, 0.4);
    invSurfG.moveTo(left, wave(left));
    for(let x=left;x<=right;x+=16) invSurfG.lineTo(x, wave(x));
    invSurfG.lineStyle(1, 0xdff6ff, 0.13);                  // ripple lines inside the water
    for(let r=1;r<=3;r++){
      invSurfG.moveTo(left, wave(left) - r*14);
      for(let x=left;x<=right;x+=24) invSurfG.lineTo(x, wave(x) - r*14 - Math.sin(x*0.03 + r)*2.5);
    }
    // water drips off the underside and falls toward the real sea
    const CELL = 150;
    for(let k=Math.floor(left/CELL); k<=Math.ceil(right/CELL); k++){
      if(hash(k*2.37) > 0.45) continue;
      const period = 2600 + hash(k*5.1)*2400;
      const f = ((now + hash(k*9.7)*period) % period)/period;
      const x = k*CELL + hash(k*1.3)*CELL;
      const y = wave(x) + 8 + f*f*520;
      const stretch = 3 + f*14;
      invSurfG.lineStyle({ width:2, color:0xbfe9ff, alpha:(1 - f)*0.7, ...ROUND });
      invSurfG.moveTo(x, y - stretch); invSurfG.lineTo(x, y);
    }
  }

  function drawInvFloor(now, W, H){
    invFloorG.clear();
    const g = invFloorG;
    const localTop = C.INV_FLOOR_Y + world.y + 200;        // local y (grows away from the ceiling) at the top of the view
    if(localTop < -160) return;                            // the view hasn't reached the ceiling yet
    const wf = (x)=> floorY(x) - 8000;
    const left = -world.x - 100, right = -world.x + W + 100;
    const bottom = Math.max(localTop, 700);

    const BAND_OFFS = [0, 34, 96, 210, 420], STRIP = 24;
    const edge = (x, off)=> wf(x) + off + Math.sin(x*0.013 + off)*off*0.06;
    BAND_OFFS.forEach((off, bi)=>{
      for(let x=left; x<right; x+=STRIP){
        const x2 = x + STRIP;
        g.beginFill(Bio.mixHex(Bio.bandColor(x + STRIP/2, bi), 0x05060e, 0.4));
        g.drawPolygon([x, edge(x, off), x2 + 1, edge(x2, off), x2 + 1, bottom, x, bottom]);
        g.endFill();
      }
    });
    const spark = Bio.sparkleAt(player.x);
    g.lineStyle(1, spark, 0.12);
    for(let r=1;r<=3;r++){
      g.moveTo(left, wf(left) + r*14);
      for(let x=left;x<=right;x+=24) g.lineTo(x, wf(x) + r*14 + Math.sin(x*0.045 + r*2.1)*2.5);
    }
    g.lineStyle(1.5, spark, 0.4);
    g.moveTo(left, wf(left));
    for(let x=left;x<=right;x+=24) g.lineTo(x, wf(x));

    const cell = 70;
    for(let i=Math.floor(left/cell)-1; i<=Math.floor(right/cell)+1; i++){      // the same props, hanging like stalactites
      const h = hash(i*1.7 + 55.3);
      const wx = i*cell + hash(i*2.91 + 9)*30;
      const kind = Bio.decorFor(Bio.at(wx), h);
      if(kind) Bio.drawDecor(g, kind, wx, wf(wx), hash(i*3.3 + 31.7), now);
    }
  }

  /* ------------------------------------------------------ upturned-sea life */

  const SKYFIN = [
    { name:'Skyfin',       body:0xb9f2ff, fin:0xeaffff },
    { name:'Moonlit Darter', body:0xd9c8ff, fin:0xf1e9ff },
    { name:'Cloudscale',   body:0xfff0b8, fin:0xfffbe0 }
  ];
  const schools = [], jellies = [];
  const yRange = (x)=> [invFloorY(x) + 130, C.INV_SURFACE_Y - 70];
  const orient = (g, a)=>{ g.rotation = a; g.scale.y += ((Math.cos(a) < 0 ? -1 : 1) - g.scale.y)*0.16; };

  function spawnSchool(x, y){
    const pal = SKYFIN[randi(0, SKYFIN.length-1)];
    const members = [];
    for(let i=0, n=randi(5,9); i<n; i++){
      const g = new PIXI.Graphics();
      creaturesLayer.addChild(g);
      attachHoverLabel(g, pal.name, 15);
      members.push({ off:rand(0,6.28), rad:rand(8,30), rot:rand(0.15,0.4)*(Math.random()<0.5?-1:1), phase:rand(0,6.28), size:rand(6,9), g });
    }
    schools.push({ x, y, vx:rand(-1,1), vy:rand(-0.3,0.3), tx:x, ty:y, retarget:0, speed:rand(1,1.8), pal, members });
  }
  function updateSchool(s, dt){
    s.retarget -= dt;
    if(s.retarget <= 0){
      const [lo, hi] = yRange(s.x);
      s.tx = s.x + rand(-350,350); s.ty = clamp(s.y + rand(-220,220), lo, hi);
      s.retarget = rand(140,300);
    }
    const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx,dy) || 1;
    s.vx = lerp(s.vx, dx/d*s.speed, 0.02*dt); s.vy = lerp(s.vy, dy/d*s.speed, 0.02*dt);
    s.x += s.vx*dt; s.y += s.vy*dt;
    const [lo, hi] = yRange(s.x); s.y = clamp(s.y, lo, hi);
    const heading = Math.atan2(s.vy, s.vx);
    for(const m of s.members){
      m.off += m.rot*0.02*dt; m.phase += 0.18*dt;
      m.g.x = s.x + Math.cos(m.off)*m.rad; m.g.y = s.y + Math.sin(m.off)*m.rad*0.6;
      orient(m.g, heading);
      drawFishShape(m.g, m.size, s.pal, m.phase, 0.8, Math.sin(m.off)*0.3);
    }
  }
  function killSchool(s){ for(const m of s.members){ creaturesLayer.removeChild(m.g); m.g.destroy(); } }

  const JELLY_COLORS = [0xfff0b8, 0xbfe9ff, 0xe3c9ff, 0xc8ffe0];
  function spawnJelly(x, y){
    const g = new PIXI.Graphics();
    creaturesLayer.addChild(g);
    attachHoverLabel(g, 'Star Jelly', 26);
    jellies.push({ x, y, baseY:y, g, color:JELLY_COLORS[randi(0,JELLY_COLORS.length-1)], phase:rand(0,6.28), drift:rand(0,6.28), size:rand(14,24), tent:randi(4,6) });
  }
  function updateJelly(j, dt){
    j.phase += 0.025*dt; j.drift += 0.006*dt;
    const [lo, hi] = yRange(j.x);
    j.y = clamp(j.baseY + Math.sin(j.drift)*45, lo, hi);
    j.x += Math.sin(j.drift*1.3)*0.25*dt;
    j.g.x = j.x; j.g.y = j.y;
    const g = j.g, s = j.size, pulse = 1 + Math.sin(j.phase*3)*0.18;
    g.clear();
    g.beginFill(j.color, 0.1); g.drawCircle(0, 0, s*1.9); g.endFill();          // soft glow
    g.lineStyle(1.6, j.color, 0.85);                                             // upside-down: bell faces the real sea, tentacles trail up
    g.moveTo(-s*pulse, 0); g.quadraticCurveTo(-s*0.7*pulse, s*0.95, 0, s*0.95);
    g.quadraticCurveTo(s*0.7*pulse, s*0.95, s*pulse, 0); g.quadraticCurveTo(0, -s*0.35, -s*pulse, 0);
    for(let i=0;i<j.tent;i++){
      const tx = lerp(-s*0.8, s*0.8, i/(j.tent-1));
      g.lineStyle(1.6, j.color, 0.5); g.moveTo(tx, -s*0.2);
      for(let seg=1;seg<=4;seg++) g.lineTo(tx + Math.sin(j.phase*4 + i + seg)*s*0.22, -s*0.2 - seg*s*0.45);
    }
  }

  let spawnT = 0;
  function updateLife(dt){
    const near = player.y <= C.INV_SURFACE_Y + 500;
    if(near){
      spawnT -= dt;
      if(spawnT <= 0){
        spawnT = rand(40, 100);
        const a = rand(0, Math.PI*2), d = rand(650, 1150);
        const x = player.x + Math.cos(a)*d;
        const [lo, hi] = yRange(x);
        const y = clamp(player.y + Math.sin(a)*d, lo, hi);
        if(Math.random() < 0.6){ if(schools.length < 7) spawnSchool(x, y); }
        else if(jellies.length < 8) spawnJelly(x, y);
      }
    }
    const R2 = 2100*2100;
    for(let i=schools.length-1;i>=0;i--){
      const s = schools[i];
      updateSchool(s, dt);
      if((s.x-player.x)**2 + (s.y-player.y)**2 > R2 || s.members.length === 0){ killSchool(s); schools.splice(i,1); }
    }
    for(let i=jellies.length-1;i>=0;i--){
      const j = jellies[i];
      updateJelly(j, dt);
      if((j.x-player.x)**2 + (j.y-player.y)**2 > R2){ creaturesLayer.removeChild(j.g); j.g.destroy(); jellies.splice(i,1); }
    }
    // eating (same bite as the real sea; Skyfin are a tasty little snack)
    if(isStarted() && isInverted() && !inCave()){
      const m = getMouth();
      for(const s of schools){
        for(let mi=s.members.length-1; mi>=0; mi--){
          const mem = s.members[mi], rr = m.reach + mem.size*0.8;
          if((mem.g.x - m.x)**2 + (mem.g.y - m.y)**2 < rr*rr){
            eaten(mem.g.x, mem.g.y, 9);
            creaturesLayer.removeChild(mem.g); mem.g.destroy();
            s.members.splice(mi, 1);
          }
        }
      }
    }
  }

  /* ----------------------------------------------------------------- tick */

  function update(dt, now){
    const W = app.screen.width, H = app.screen.height;
    const cave = inCave();
    for(const l of allLayers) l.visible = !cave;
    if(cave) return;
    drawHighSky(now, W, H);
    drawCelestial(now, W, H);
    drawInvSea(now, W, H);
    drawClouds(now, W, H);
    drawGulls(now, W, H);
    drawThermals(now, W, H);
    drawInvFloor(now, W, H);
    drawInvSurface(now, W, H);
    updateLife(dt);
    thermalBubbles(dt);
  }

  /* ------------------------------------------------------------- commands */

  function command(cmd, args){
    const out = [];
    if(cmd === 'sky'){
      const what = (args[0] || '').toLowerCase();
      if(what === 'thermal'){ player.x = nearestThermalX(player.x); player.y = -40; player.vx = 0; player.vy = -4; out.push(['Standing in a thermal. Hold on.', 'ok']); }
      else if(what === 'top'){ player.y = C.INV_SURFACE_Y + 300; player.vx = player.vy = 0; out.push(['Teleported to the Starlit Heights, just under the upturned sea.', 'ok']); }
      else { player.y = -1500; player.vx = player.vy = 0; out.push(['Teleported into the Cloud Deck.  (/sky thermal | /sky top | /inverted)', 'ok']); }
    } else if(cmd === 'inverted'){
      player.y = C.INV_SURFACE_Y - 400; player.vx = player.vy = 0;
      out.push(['Teleported into the upturned sea. Swim down to reach its surface.', 'ok']);
    } else if(cmd === 'sun' || cmd === 'moon'){
      const url = args.join(' ').trim();
      const apply = cmd === 'sun' ? setSunImage : setMoonImage;
      if(!url) out.push([`Usage: /${cmd} <image link>   or   /${cmd} reset`, 'err']);
      else if(url === 'reset'){ apply(''); out.push([`${cmd === 'sun' ? 'Sun' : 'Moon'} image reset.`, 'ok']); }
      else { apply(url); out.push([`Loading the ${cmd} from that link… (built-in art shows until it arrives)`, 'ok']); }
    }
    return out;
  }

  return { update, command, thermal, nearestThermalX, windX, invFloorY, zoneAt, isInverted, setSunImage, setMoonImage, C };
};

global.MoceanSky.C = C;
global.MoceanSky.thermal = thermal;
global.MoceanSky.windX = windX;

})(window);
