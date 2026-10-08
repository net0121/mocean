/* =============================================================================
   biomes.js — the sea biomes of mocean.

   The ocean is split into seven biomes laid out west -> east. The 20 caves sit
   along the same road, evenly spaced, so swimming east takes you through every
   biome in order:

     1 Sunlit Reef        caves  1-3     warm sand, coral, anemones
     2 Kelp Forest        caves  4-6     towering kelp, green water
     3 Sunken Ruins       caves  7-9     broken pillars, masts, ribs
     4 Volcanic Vents     caves 10-12    black sand, lava cracks, smoking vents
     5 Frozen Deep        caves 13-15    pale sand, ice spikes, cold water
     6 Glowing Abyss      caves 16-18    glowing mushrooms, tube worms, violet water
     7 Mythic Trench      caves 19-20    crystals, tentacles, the darkest water

   Everything west of the first cave is Sunlit Reef.
   Loaded before dungeons.js and game.js.
   ============================================================================= */
(function(global){
"use strict";

const FIRST_X = 3200;       // x of cave 1
const SPACING = 3400;       // distance between neighbouring caves
const BLEND   = 700;        // width of the soft transition between two biomes

const dungeonX = (id)=> FIRST_X + (id - 1)*SPACING;

/* decor: [cumulative probability, kind] — a cell rolls once, first match wins.
   The whole table sums to ~0.58 like the original ocean, so density is unchanged. */
const BIOMES = [
  { id:'reef', name:'Sunlit Reef', caves:[1,3],
    tint:[1.00,1.04,1.00], light:1.0,
    bands:[0x6a5530,0x58451f,0x45361a,0x332813,0x211a0d], sparkle:0xfff0c8, vent:0.5,
    decor:[[0.16,'seaweed'],[0.34,'coral'],[0.44,'anemone'],[0.52,'rock'],[0.58,'sponge']] },

  { id:'kelp', name:'Kelp Forest', caves:[4,6],
    tint:[0.80,1.14,0.86], light:0.92,
    bands:[0x4f5a2c,0x3f491f,0x333b19,0x272d13,0x181c0c], sparkle:0xd8ffb0, vent:0.35,
    decor:[[0.30,'kelp'],[0.42,'seaweed'],[0.50,'rock'],[0.58,'coral']] },

  { id:'ruins', name:'Sunken Ruins', caves:[7,9],
    tint:[0.90,0.98,1.10], light:0.86,
    bands:[0x57595c,0x45474b,0x38393d,0x2b2c30,0x1b1c1f], sparkle:0xdfe6ee, vent:0.3,
    decor:[[0.14,'pillar'],[0.22,'mast'],[0.30,'ribs'],[0.40,'rock'],[0.50,'seaweed'],[0.58,'coral']] },

  { id:'volcanic', name:'Volcanic Vents', caves:[10,12],
    tint:[1.38,0.86,0.70], light:0.80,
    bands:[0x2c2523,0x231d1c,0x1b1615,0x141010,0x0c0909], sparkle:0xff9d5c, vent:0.95,
    decor:[[0.16,'spire'],[0.30,'crack'],[0.40,'vent'],[0.50,'rock'],[0.58,'coral']] },

  { id:'frozen', name:'Frozen Deep', caves:[13,15],
    tint:[0.84,1.10,1.34], light:0.88,
    bands:[0xaebfc9,0x91a4b0,0x748794,0x586a77,0x3b4955], sparkle:0xffffff, vent:0.2,
    decor:[[0.24,'ice'],[0.38,'icicles'],[0.48,'rock'],[0.54,'seaweed'],[0.58,'coral']] },

  { id:'abyss', name:'Glowing Abyss', caves:[16,18],
    tint:[0.92,0.74,1.28], light:0.70,
    bands:[0x2c2447,0x231c3a,0x1b152d,0x130f20,0x0b0813], sparkle:0xd59bff, vent:0.5,
    decor:[[0.22,'mushroom'],[0.38,'tube'],[0.48,'anemone'],[0.54,'rock'],[0.58,'seaweed']] },

  { id:'mythic', name:'Mythic Trench', caves:[19,20],
    tint:[0.76,0.70,1.02], light:0.55,
    bands:[0x1e1d2e,0x17162a,0x111021,0x0b0b17,0x06060d], sparkle:0x9be8ff, vent:0.45,
    decor:[[0.20,'crystal'],[0.36,'tentacle'],[0.46,'tube'],[0.52,'rock'],[0.58,'mushroom']] }
];

// zone starts sit halfway between the last cave of one biome and the first of the next
BIOMES.forEach((b, i)=>{
  b.index = i;
  b.start = i === 0 ? -Infinity : (dungeonX(b.caves[0]) + dungeonX(BIOMES[i-1].caves[1]))/2;
});

const clamp01 = (v)=> v < 0 ? 0 : v > 1 ? 1 : v;
const mixN = (a, b, t)=> a + (b - a)*t;
function mixHex(a, b, t){
  const r = mixN(a >> 16 & 255, b >> 16 & 255, t), g = mixN(a >> 8 & 255, b >> 8 & 255, t), bl = mixN(a & 255, b & 255, t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

function indexAt(x){
  let i = 0;
  for(let k=1;k<BIOMES.length;k++) if(x >= BIOMES[k].start) i = k;
  return i;
}
const at = (x)=> BIOMES[indexAt(x)];

// soft blend with the neighbour: { a, b, t } means "t of the way from biome a to biome b"
function blendAt(x){
  const i = indexAt(x);
  const next = BIOMES[i+1];
  if(next && x > next.start - BLEND/2) return { a:BIOMES[i], b:next, t:clamp01((x - (next.start - BLEND/2))/BLEND) };
  if(i > 0 && x < BIOMES[i].start + BLEND/2) return { a:BIOMES[i-1], b:BIOMES[i], t:clamp01((x - (BIOMES[i].start - BLEND/2))/BLEND) };
  return { a:BIOMES[i], b:BIOMES[i], t:0 };
}

function tintAt(x){
  const s = blendAt(x);
  return [mixN(s.a.tint[0], s.b.tint[0], s.t), mixN(s.a.tint[1], s.b.tint[1], s.t), mixN(s.a.tint[2], s.b.tint[2], s.t)];
}
const lightAt = (x)=> { const s = blendAt(x); return mixN(s.a.light, s.b.light, s.t); };
function bandColor(x, band){ const s = blendAt(x); return mixHex(s.a.bands[band], s.b.bands[band], s.t); }
function sparkleAt(x){ const s = blendAt(x); return mixHex(s.a.sparkle, s.b.sparkle, s.t); }
function ventRate(x){ const s = blendAt(x); return mixN(s.a.vent, s.b.vent, s.t); }

function decorFor(biome, h){
  for(const [p, kind] of biome.decor) if(h < p) return kind;
  return null;
}

/* -------------------------------------------------------------------------
   decor — wireframe seafloor props, one function per kind.
   g = the terrain Graphics, (wx, fy) = base on the floor, s = 0..1 seed
   ------------------------------------------------------------------------- */

function hsl(h, s, l){
  h = ((h % 360) + 360) % 360 / 360;
  const f = (n)=>{ const k = (n + h*12) % 12, a = s*Math.min(l, 1 - l); return l - a*Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return (Math.round(f(0)*255) << 16) | (Math.round(f(8)*255) << 8) | Math.round(f(4)*255);
}

const DECOR = {
  kelp(g, wx, fy, s, t){
    const blades = 2 + Math.floor(s*2);
    for(let b=0;b<blades;b++){
      const bx = wx + (b - blades/2)*9, h = 110 + s*130 + b*18;
      g.lineStyle(2.4, hsl(95 + s*40, 0.55, 0.32 + b*0.03), 0.85);
      g.moveTo(bx, fy);
      const segs = 4;
      for(let k=1;k<=segs;k++){
        const f = k/segs, sway = Math.sin(t*0.0011 + s*9 + b + f*2.2)*16*f;
        g.lineTo(bx + sway, fy - h*f);
        if(k % 2 === 0){            // leaf blades along the stem
          g.lineStyle(1.4, hsl(110 + s*30, 0.6, 0.4), 0.75);
          g.lineTo(bx + sway + 11, fy - h*f - 9); g.moveTo(bx + sway, fy - h*f);
          g.lineStyle(2.4, hsl(95 + s*40, 0.55, 0.32 + b*0.03), 0.85);
        }
      }
    }
  },
  seaweed(g, wx, fy, s, t){
    const blades = 2 + Math.floor(s*3), hue = 140 + s*40;
    for(let b=0;b<blades;b++){
      const bx = wx + (b - blades/2)*5, height = 26 + s*40 + b*4, sway = Math.sin(t*0.0012 + s*10 + b)*10;
      g.lineStyle(2, hsl(hue, 0.55, 0.38 + b*0.04), 0.85);
      g.moveTo(bx, fy); g.quadraticCurveTo(bx + sway*0.5, fy - height*0.55, bx + sway, fy - height);
    }
  },
  coral(g, wx, fy, s){
    const br = 3 + Math.floor(s*3), hue = 10 + s*40;
    for(let i=0;i<br;i++){
      const a = -Math.PI/2 + (i - br/2)*0.4 + s, len = 14 + s*20;
      g.lineStyle(2, hsl(hue, 0.7, 0.6), 0.8);
      g.moveTo(wx, fy); g.lineTo(wx + Math.cos(a)*len*0.6, fy + Math.sin(a)*len*0.6); g.lineTo(wx + Math.cos(a)*len, fy + Math.sin(a)*len);
    }
  },
  rock(g, wx, fy, s){
    const r = 10 + s*18;
    g.lineStyle(1.6, 0x969aaa, 0.7);
    g.moveTo(wx - r, fy); g.lineTo(wx - r*0.6, fy - r*0.7); g.lineTo(wx, fy - r*0.95); g.lineTo(wx + r*0.7, fy - r*0.5); g.lineTo(wx + r, fy); g.closePath();
  },
  anemone(g, wx, fy, s, t){
    const n = 7, hue = 300 + s*60;
    for(let i=0;i<n;i++){
      const a = -Math.PI/2 + (i - (n-1)/2)*0.34, sw = Math.sin(t*0.002 + i + s*7)*0.12, len = 24 + s*14;
      g.lineStyle(1.8, hsl(hue, 0.7, 0.62), 0.85);
      g.moveTo(wx, fy); g.quadraticCurveTo(wx + Math.cos(a + sw)*len*0.5, fy + Math.sin(a + sw)*len*0.5, wx + Math.cos(a + sw*1.8)*len, fy + Math.sin(a + sw*1.8)*len);
    }
  },
  sponge(g, wx, fy, s){
    const h = 22 + s*26, w = 7 + s*5;
    g.lineStyle(1.8, hsl(40 + s*40, 0.75, 0.58), 0.85);
    g.moveTo(wx - w, fy); g.lineTo(wx - w*0.8, fy - h); g.lineTo(wx + w*0.8, fy - h); g.lineTo(wx + w, fy);
    g.lineStyle(1.2, hsl(40 + s*40, 0.75, 0.7), 0.7);
    g.drawEllipse(wx, fy - h, w*0.8, 3);
  },
  pillar(g, wx, fy, s){
    const h = 60 + s*90, w = 15, broken = s > 0.5;
    g.lineStyle(2, 0x9aa0a8, 0.8);
    g.moveTo(wx - w, fy); g.lineTo(wx - w, fy - h);
    g.lineTo(broken ? wx - w*0.1 : wx + w, fy - h - (broken ? 14 : 0));
    if(broken) g.lineTo(wx + w*0.5, fy - h*0.7);
    g.lineTo(wx + w, broken ? fy - h*0.78 : fy - h); g.lineTo(wx + w, fy);
    g.lineStyle(1.2, 0x9aa0a8, 0.5);
    for(let k=1;k<4;k++){ g.moveTo(wx - w*0.35*(k % 2 ? 1 : -1), fy); g.lineTo(wx - w*0.35*(k % 2 ? 1 : -1), fy - h*0.9); }
  },
  mast(g, wx, fy, s){
    const h = 90 + s*70, lean = (s - 0.5)*0.8;
    g.lineStyle(2.4, 0x8a6a45, 0.85);
    g.moveTo(wx, fy); g.lineTo(wx + lean*h, fy - h);
    g.lineStyle(2, 0x8a6a45, 0.8);
    g.moveTo(wx + lean*h*0.7 - 30, fy - h*0.7 - 8); g.lineTo(wx + lean*h*0.7 + 30, fy - h*0.7 + 8);
    g.lineStyle(1.2, 0xd8d0c0, 0.4);
    g.moveTo(wx + lean*h*0.7 - 30, fy - h*0.7 - 8); g.lineTo(wx + lean*h*0.7 - 22, fy - h*0.2); g.lineTo(wx + lean*h*0.7 + 30, fy - h*0.7 + 8);
  },
  ribs(g, wx, fy, s){
    const n = 5, len = 38 + s*26;
    g.lineStyle(2.2, 0xe2dccb, 0.75);
    g.moveTo(wx - 40, fy); g.lineTo(wx + 40, fy);
    for(let i=0;i<n;i++){
      const x = wx - 30 + i*15;
      g.moveTo(x, fy); g.quadraticCurveTo(x + 6, fy - len*1.1, x + 20, fy - len*0.7 + i*2);
    }
  },
  spire(g, wx, fy, s){
    const h = 50 + s*100, w = 14 + s*10;
    g.lineStyle(2, 0x4a3b38, 0.95);
    g.moveTo(wx - w, fy); g.lineTo(wx - w*0.45, fy - h*0.6); g.lineTo(wx + 2, fy - h); g.lineTo(wx + w*0.5, fy - h*0.55); g.lineTo(wx + w, fy);
    g.lineStyle(1.4, 0xff7a3a, 0.55);
    g.moveTo(wx - w*0.2, fy); g.lineTo(wx - w*0.1, fy - h*0.55); g.lineTo(wx + 2, fy - h*0.9);
  },
  crack(g, wx, fy, s, t){
    const glow = 0.45 + 0.35*Math.sin(t*0.003 + s*12);
    g.lineStyle(2.6, 0xff6a2a, glow);
    g.moveTo(wx - 38, fy + 6); g.lineTo(wx - 14, fy + 12 + s*6); g.lineTo(wx + 4, fy + 4); g.lineTo(wx + 26, fy + 14); g.lineTo(wx + 44, fy + 7);
    g.lineStyle(1.2, 0xffd194, glow*0.8);
    g.moveTo(wx - 14, fy + 12 + s*6); g.lineTo(wx - 4, fy + 24);
  },
  vent(g, wx, fy, s, t){
    const w = 16 + s*8, h = 28 + s*20;
    g.lineStyle(2, 0x5c4a45, 0.95);
    g.moveTo(wx - w, fy); g.lineTo(wx - w*0.4, fy - h); g.lineTo(wx + w*0.4, fy - h); g.lineTo(wx + w, fy);
    g.lineStyle(2, 0xff7a3a, 0.4 + 0.3*Math.sin(t*0.004 + s*9));
    g.drawEllipse(wx, fy - h, w*0.4, 3);
  },
  ice(g, wx, fy, s){
    const n = 3;
    for(let i=0;i<n;i++){
      const x = wx + (i - 1)*14 + (s - 0.5)*10, h = 40 + ((i*37 + s*100) % 60), w = 9 + i%2*3;
      g.lineStyle(1.8, 0xdff6ff, 0.85);
      g.moveTo(x - w, fy); g.lineTo(x - w*0.2, fy - h); g.lineTo(x + w*0.5, fy - h*0.9); g.lineTo(x + w, fy);
      g.lineStyle(1, 0xffffff, 0.5);
      g.moveTo(x - w*0.2, fy - h); g.lineTo(x, fy - h*0.2);
    }
  },
  icicles(g, wx, fy, s){
    g.lineStyle(1.6, 0xbfe9ff, 0.75);
    g.moveTo(wx - 34, fy);
    for(let k=0;k<5;k++){
      const x = wx - 34 + k*14;
      g.lineTo(x + 7, fy - 14 - ((k*53 + s*70) % 22)); g.lineTo(x + 14, fy);
    }
  },
  mushroom(g, wx, fy, s, t){
    const h = 26 + s*34, w = 16 + s*10, p = 0.55 + 0.35*Math.sin(t*0.003 + s*9), hue = 270 + s*70;
    g.lineStyle(2, hsl(hue, 0.6, 0.75), 0.85);
    g.moveTo(wx, fy); g.lineTo(wx, fy - h);
    g.lineStyle(2, hsl(hue, 0.9, 0.7), 0.6 + 0.3*p);
    g.moveTo(wx - w, fy - h + 2); g.quadraticCurveTo(wx, fy - h - w*1.1, wx + w, fy - h + 2); g.closePath();
    g.lineStyle(0); g.beginFill(hsl(hue, 0.9, 0.7), 0.1 + 0.1*p); g.drawCircle(wx, fy - h - 4, w*1.6); g.endFill();
  },
  tube(g, wx, fy, s, t){
    const n = 3 + Math.floor(s*3);
    for(let i=0;i<n;i++){
      const x = wx + (i - n/2)*8, h = 34 + ((i*31 + s*90) % 44), sw = Math.sin(t*0.0016 + i + s*8)*6;
      g.lineStyle(2.2, 0xcfd6ff, 0.7);
      g.moveTo(x, fy); g.quadraticCurveTo(x + sw*0.4, fy - h*0.6, x + sw, fy - h);
      g.lineStyle(0); g.beginFill(0xff7ad9, 0.5 + 0.3*Math.sin(t*0.004 + i)); g.drawCircle(x + sw, fy - h, 3.4); g.endFill();
    }
  },
  crystal(g, wx, fy, s, t){
    const n = 3, p = 0.5 + 0.3*Math.sin(t*0.0025 + s*10);
    for(let i=0;i<n;i++){
      const x = wx + (i - 1)*13, h = 40 + ((i*47 + s*110) % 70), w = 7 + i%2*3, lean = (i - 1)*0.18;
      g.lineStyle(1.8, 0x9be8ff, 0.7 + 0.25*p);
      g.moveTo(x - w, fy); g.lineTo(x - w*0.7 + lean*h, fy - h*0.8); g.lineTo(x + lean*h, fy - h); g.lineTo(x + w*0.7 + lean*h, fy - h*0.8); g.lineTo(x + w, fy);
      g.lineStyle(1, 0xdaf6ff, 0.45);
      g.moveTo(x + lean*h, fy - h); g.lineTo(x, fy);
    }
  },
  tentacle(g, wx, fy, s, t){
    const n = 2, len = 90 + s*80;
    for(let i=0;i<n;i++){
      g.lineStyle(3 - i*0.6, 0x6a4a8a, 0.85);
      g.moveTo(wx + i*18, fy);
      for(let k=1;k<=7;k++){
        const f = k/7;
        g.lineTo(wx + i*18 + Math.sin(t*0.0014 + f*3.4 + i*1.7 + s*7)*28*f, fy - len*f);
      }
      g.lineStyle(0); g.beginFill(0xd07ad8, 0.6); g.drawCircle(wx + i*18 + Math.sin(t*0.0014 + 3.4 + i*1.7 + s*7)*28, fy - len, 2.6); g.endFill();
    }
  }
};

function drawDecor(g, kind, wx, fy, seed, time){
  const fn = DECOR[kind];
  if(fn) fn(g, wx, fy, seed, time);
}

global.MoceanBiomes = {
  list: BIOMES, FIRST_X, SPACING, dungeonX,
  at, blendAt, tintAt, lightAt, bandColor, sparkleAt, ventRate, decorFor, drawDecor, mixHex,
  biomeForCave: (id)=> BIOMES.find(b => id >= b.caves[0] && id <= b.caves[1]) || BIOMES[0]
};

})(window);
