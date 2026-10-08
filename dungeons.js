/* =============================================================================
   dungeons.js — 20 seafloor caves with randomly generated mazes, 20 bosses
   (9 of them Mythical Sea Legends) and the abilities you earn by clearing them.

   The caves sit in a line heading east, evenly spaced and in order of difficulty
   (see biomes.js for the biome each one lives in). Swim into the dark mouth to
   enter. Inside: a fresh random maze every visit, patrolling guardians, pearls
   in the dead ends (XP) and a glowing relic behind the boss. Space fires bubbles,
   you have 5 hearts, and the relic only appears once the boss is beaten.
   The first clear of each cave unlocks an ability:

     #  Cave                  Boss                              Ability (key)
     1  Coral Hollow          Claw Baron                        Shapeshift (F)
     2  Anemone Maze          Captain Bloat                     Rapid Bubbles (Q)
     3  Glimmer Grotto        Lantern King                      Biolight (G)
     4  Kelp Labyrinth        Kelp Strangler                    Tidal Dash (Shift)
     5  Sargasso Tangle       Sargasso Queen                    Triple Shot (E)
     6  Siren's Cove          * Lorelei, the Siren Queen        Tide Heal (T)
     7  Drowned Citadel       Iron Lobster Warlord              Pearl Magnet (U)
     8  Shipwreck Graveyard   * The Flying Dutchman             Camouflage (C)
     9  Tidal Temple          Tidal Megalodon                   Sea Wings (hold Space)
    10  Ember Vents           Magma Manta                       Ink Cloud (Y)
    11  Obsidian Forge        * Ryujin, the Dragon King         Whirlpool (V)
    12  Thunder Spire         Thunder Eel Tyrant                Chain Lightning (Z)
    13  Frostbite Cavern      Great White Frostjaw              Piercing Bubbles (R)
    14  Glacier Gullet        * Aspidochelone, Island Turtle    Sonar Ping (O)
    15  Midgard Deep          * Jormungandr, World Serpent      Time Ripple (I)
    16  Twilight Bloom        * The Sea Hydra                   Riptide (P)
    17  Lantern Warren        Deepglow Matriarch                Ghost Current (N)
    18  Abyssal Vault         * Abyss Kraken                    Bubble Shield (B)
    19  Charybdis Maw         * Charybdis, the Devouring Maw    Pearl Cannon (X)
    20  Leviathan's Throne    * Leviathan, the Sea Serpent King Tsunami (M)

   (* = Mythical Sea Legend: a bigger arena, a longer health bar, spiral attacks
   and a boss that gets steadily angrier as it loses health.)

   Caves grow in every way as you head east: each maze is strictly bigger than the last, with more
   (and tougher) guardians - from cave 5 on some of them spit shots - and each boss has more health.
   Bosses from cave 10 up are ELITES: they circle and lead their shots, blink around the arena, fire
   homing orbs and sweeping streams, wear armor, and raise a bubble shield (that you can only get
   past by waiting it out) every third of their health. They also get the longest health bars.

   Every 3 character levels you pick an upgrade: +1 heart, faster bubbles or more strength.

   Every ability that is not a toggle has a duration and a cooldown; its chip in
   the ability bar fills as the cooldown recovers. An edge-of-screen compass
   points to the next uncleared cave in order.

   Loaded after biomes.js and fish.js, before game.js. game.js calls MoceanDungeons(ctx).
   ============================================================================= */
(function(global){
"use strict";

global.MoceanDungeons = function(ctx){
  const { app, world, player, keys, rand, randi, clamp, lerpAngle, floorY,
          PLAYER_COLORS, SHARK_COLORS, drawFishShape, view, hideWhenInside, addXP, popText,
          burstBubbles, playBlip, isStarted, getLevel, mouseScreen, showHoverLabel, hideHoverLabel } = ctx;

  const SAVE_KEY = 'mocean.dungeons.v2';
  const OLD_SAVE_KEY = 'mocean.dungeons.v1';
  const OLD_TO_NEW = { 1:1, 2:4, 3:3, 4:18, 5:9 };   // v1 cave numbers -> their place in the new order
  const BIO = MoceanBiomes;
  const T = 110; // maze tile size in world units
  const BASE_HP = 5;
  const ROUND = { cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND };

  /* ---------------------------------------------------------------- data */

  // one row per cave, in the order you meet them heading east. x comes from biomes.js (even spacing).
  // legend:true  -> Mythical Sea Legend (bigger arena, more health, spiral attacks)
  const RAW = [
    [ 1,'Coral Hollow',        5,4,3, 0x2b6f78,0x0a2a33,0x7fe8d4, 0,    'shapeshift', ['crab','urchin'],
      { kind:'crab',   name:'Claw Baron',                      r:60 } ],
    [ 2,'Anemone Maze',        5,4,3, 0x8a3a6f,0x2a0b22,0xff9bd2, 0,    'rapid',      ['puffer','urchin'],
      { kind:'puffer', name:'Captain Bloat',                   r:54 } ],
    [ 3,'Glimmer Grotto',      6,5,4, 0x5a3a8a,0x150b2a,0xd59bff, 5200, 'glow',       ['jelly','angler'],
      { kind:'angler', name:'Lantern King',                    r:58 } ],
    [ 4,'Kelp Labyrinth',      7,5,4, 0x2f6b3a,0x0b2412,0xb6ff7a, 3000, 'dash',       ['eel','puffer'],
      { kind:'eel',    name:'Kelp Strangler',                  r:44 } ],
    [ 5,'Sargasso Tangle',     7,5,5, 0x4a6a2a,0x141f0b,0xe0ff7a, 0,    'triple',     ['jelly','eel'],
      { kind:'jelly',  name:'Sargasso Queen',                  r:58, pal:[0x7fe8a8,0xd5ff9b] } ],
    [ 6,"Siren's Cove",        8,6,5, 0x3a7a9a,0x0b2330,0xa8f0ff, 2400, 'heal',       ['jelly','puffer','eel'],
      { kind:'siren',  name:'Lorelei, the Siren Queen',        r:70, legend:true } ],
    [ 7,'Drowned Citadel',     8,6,5, 0x5a6068,0x14171c,0xcfd8e4, 0,    'magnet',     ['crab','eel','urchin'],
      { kind:'crab',   name:'Iron Lobster Warlord',            r:68, pal:[0x9aa8b8,0xe6f0ff] } ],
    [ 8,'Shipwreck Graveyard', 9,6,6, 0x6a4e33,0x1f150b,0xe8c88a, 0,    'camo',       ['eel','crab','angler'],
      { kind:'ghostship', name:'The Flying Dutchman',          r:84, legend:true } ],
    [ 9,'Tidal Temple',        9,7,6, 0x8a7a3a,0x2a230b,0xffe28a, 1100, 'wings',      ['jelly','crab','puffer','eel'],
      { kind:'shark',  name:'Tidal Megalodon',                 r:60 } ],
    [10,'Ember Vents',        10,7,6, 0x7a3a22,0x2a0f08,0xff9d5c, 0,    'ink',        ['urchin','puffer','crab'],
      { kind:'ray',    name:'Magma Manta',                     r:62 } ],
    [11,'Obsidian Forge',     10,7,7, 0x5a2a2a,0x1f0a0a,0xff6a3a, 0,    'whirl',      ['crab','eel','urchin'],
      { kind:'dragon', name:'Ryujin, the Dragon King',         r:76, legend:true } ],
    [12,'Thunder Spire',      11,7,7, 0x6a5a1f,0x241f08,0xffe14d, 3800, 'chain',      ['eel','jelly','puffer'],
      { kind:'eel',    name:'Thunder Eel Tyrant',              r:56, pal:[0xffe14d,0xffffff] } ],
    [13,'Frostbite Cavern',   11,8,7, 0x5a8aa8,0x0e2230,0xdff6ff, 0,    'pierce',     ['puffer','urchin','jelly'],
      { kind:'shark',  name:'Great White Frostjaw',            r:66, cols:{ body:0xe8f4ff, fin:0xffffff } } ],
    [14,'Glacier Gullet',     12,8,8, 0x4a7a9a,0x0b1f30,0xbfe9ff, 1700, 'sonar',      ['jelly','angler','eel'],
      { kind:'turtle', name:'Aspidochelone, the Island Turtle', r:88, legend:true } ],
    [15,'Midgard Deep',       12,8,8, 0x3a4a8a,0x0a0f2a,0x9bb8ff, 0,    'ripple',     ['eel','crab','angler'],
      { kind:'serpent', name:'Jormungandr, the World Serpent', r:80, legend:true, pal:[0x7aa8ff,0xdff6ff] } ],
    [16,'Twilight Bloom',     13,8,8, 0x6a3a8a,0x1a0b2a,0xff7ad9, 0,    'riptide',    ['jelly','urchin','angler'],
      { kind:'hydra',  name:'The Sea Hydra',                   r:78, legend:true } ],
    [17,'Lantern Warren',     13,9,9, 0x2a7a6a,0x082420,0x58ffd8, 6300, 'ghost',      ['angler','jelly','eel'],
      { kind:'angler', name:'Deepglow Matriarch',              r:70, pal:[0x58e0d0,0xa8ffe8] } ],
    [18,'Abyssal Vault',      14,9,9, 0x7a2f3f,0x2a0b13,0xff7a8f, 0,    'shield',     ['urchin','angler','eel'],
      { kind:'kraken', name:'Abyss Kraken',                    r:72, legend:true } ],
    [19,'Charybdis Maw',      14,9,10, 0x2a2a5a,0x0b0b1f,0x7a9bff, 4600, 'cannon',    ['jelly','angler','crab','eel'],
      { kind:'charybdis', name:'Charybdis, the Devouring Maw', r:84, legend:true } ],
    [20,"Leviathan's Throne", 15,10,10, 0x3a2a6a,0x0e0a22,0xffd36a, 0,   'tsunami',    ['eel','angler','jelly','crab','puffer'],
      { kind:'leviathan', name:'Leviathan, the Sea Serpent King', r:92, legend:true } ]
  ];

  /* Every cave is strictly bigger than the one before it (maze area), has more guardians, and its boss has
     more health. The sizes/guard counts in RAW are only a starting point; this pass makes the growth steady. */
  let prevArea = 0, prevBossHp = 0;
  const DUNGEONS = RAW.map(([id, name, _mw, _mh, _guards, wall, floor, accent, floatY, ability, enemies, boss])=>{
    const mh = 4 + Math.floor(id*0.4);
    let mw = 5 + Math.floor(id*0.6);
    while(mw*mh <= prevArea) mw++;                         // never smaller than the cave before
    prevArea = mw*mh;
    const guards = 3 + id + Math.floor(id/3);              // 4 in cave 1 ... 29 in cave 20
    // boss health: caves 10+ ramp much harder (longer bars); never lower than the previous boss
    let bossHp = (id < 10 ? 12 + 3*id : (12 + 4*id)*(1 + 0.08*(id - 9))) * (boss.legend ? (id < 10 ? 1.4 : 1.12) : 1);
    bossHp = Math.max(Math.round(bossHp), prevBossHp + 2);
    prevBossHp = bossHp;
    const d = { id, name, x:BIO.dungeonX(id), mw, mh, guards, wall, floor, accent, ability, enemies, boss, bossHp };
    if(floatY) d.floatY = floatY;
    d.rock = BIO.mixHex(wall, 0x202028, 0.45);          // entrance rock colour
    d.biome = BIO.biomeForCave(id);
    d.legend = !!boss.legend;
    boss.legend = d.legend;
    return d;
  });

  /* Abilities. dur/cd are in frames (60 = 1 s). caveOnly abilities do nothing in the open ocean,
     so they don't spend their cooldown there. Entries without dur/cd are the original toggles / passives. */
  const ABILITIES = {
    shapeshift: { name:'Shapeshift',       key:'F',     desc:'Morph into a shark or a glass minnow' },
    dash:       { name:'Tidal Dash',       key:'Shift', desc:'Burst of speed' },
    glow:       { name:'Biolight',         key:'G',     desc:'Glow to light up dark caves' },
    shield:     { name:'Bubble Shield',    key:'B',     desc:'Guardians pass right through you' },
    wings:      { name:'Sea Wings',        key:'Space', desc:'Hold Space in the air to glide' },

    rapid:   { name:'Rapid Bubbles',    key:'Q', dur:360, cd:900,  caveOnly:true,  desc:'Fire bubbles 2.6x faster for 6 s' },
    triple:  { name:'Triple Shot',      key:'E', dur:480, cd:1080, caveOnly:true,  desc:'Bubbles fly in a 3-way fan for 8 s' },
    heal:    { name:'Tide Heal',        key:'T',          cd:2700, caveOnly:true,  desc:'Restore 2 hearts' },
    magnet:  { name:'Pearl Magnet',     key:'U', dur:600, cd:1500,                desc:'Pearls fly to you and you eat from further away for 10 s' },
    camo:    { name:'Camouflage',       key:'C', dur:360, cd:1680, caveOnly:true,  desc:'Guardians and bosses lose track of you for 6 s' },
    ink:     { name:'Ink Cloud',        key:'Y', dur:360, cd:1320, caveOnly:true,  desc:'A cloud that blinds and slows guardians and eats enemy shots' },
    whirl:   { name:'Whirlpool',        key:'V', dur:240, cd:1800, caveOnly:true,  desc:'A vortex that drags guardians in and shreds them' },
    chain:   { name:'Chain Lightning',  key:'Z',          cd:1200, caveOnly:true,  desc:'Zap up to 4 enemies for 2 damage each' },
    pierce:  { name:'Piercing Bubbles', key:'R', dur:420, cd:1200, caveOnly:true,  desc:'Bubbles punch through enemies and hit twice as hard for 7 s' },
    sonar:   { name:'Sonar Ping',       key:'O',          cd:1500,                desc:'Reveal the whole cave map (or point to the next cave)' },
    ripple:  { name:'Time Ripple',      key:'I', dur:240, cd:1800, caveOnly:true,  desc:'Everything hostile slows to 40% for 4 s' },
    riptide: { name:'Riptide',          key:'P',          cd:1500, caveOnly:true,  desc:'Shockwave: 2 damage and a big shove to everything near you' },
    ghost:   { name:'Ghost Current',    key:'N', dur:150, cd:2400, caveOnly:true,  desc:'Swim through cave walls for 2.5 s (not during a boss fight)' },
    cannon:  { name:'Pearl Cannon',     key:'X',          cd:1320, caveOnly:true,  desc:'One giant piercing bubble: 6 damage' },
    tsunami: { name:'Tsunami',          key:'M',          cd:3600, caveOnly:true,  desc:'A wave wipes enemy shots and hits everything hard' }
  };
  const TIMED = Object.keys(ABILITIES).filter(id => ABILITIES[id].cd);   // the 15 new cooldown abilities

  const FORMS = {
    fish:   { name:'Reef Fish',    colors:PLAYER_COLORS,                    size:1.0,  speed:1.0,  level:0 },
    shark:  { name:'Shark',        colors:SHARK_COLORS,                     size:1.55, speed:1.12, level:3 },
    minnow: { name:'Glass Minnow', colors:{ body:0xbff5ff, fin:0xffffff },  size:0.55, speed:1.4,  level:0 }
  };
  const FORM_ORDER = ['fish','shark','minnow'];

  /* ---------------------------------------------------------------- save */

  const save = { cleared:[], form:'fish', glow:false, up:{ hearts:0, rate:0, str:0 } };
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(raw) Object.assign(save, JSON.parse(raw));
    else {
      const old = JSON.parse(localStorage.getItem(OLD_SAVE_KEY) || 'null');     // carry over a v1 save
      if(old){
        save.cleared = (old.cleared || []).map(n => OLD_TO_NEW[n]).filter(Boolean);
        save.form = old.form || 'fish'; save.glow = !!old.glow;
      }
    }
  }catch(err){}
  save.up = Object.assign({ hearts:0, rate:0, str:0 }, save.up);
  function persist(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }catch(err){} }

  /* --------------------------------------------- level-up upgrades (every 3 levels) */

  const UP_CAP = { hearts:7, rate:8, str:10 };
  const UP_KEYS = ['hearts', 'rate', 'str'];
  const maxHp   = ()=> BASE_HP + save.up.hearts;
  const rateMul = ()=> 1 + 0.12*save.up.rate;          // bubble fire rate
  const strMul  = ()=> 1 + 0.25*save.up.str;           // damage to guardians and bosses
  const upUsed  = ()=> save.up.hearts + save.up.rate + save.up.str;
  const upOwed  = ()=> Math.max(0, Math.floor(getLevel()/3) - upUsed());
  const upOpen  = (k)=> save.up[k] < UP_CAP[k];
  const UPGRADES = {
    hearts:{ name:'Bigger Heart',  icon:'♥', desc:'+1 max heart in caves, and heal 1 now',
             now:()=> `${maxHp()} hearts`,                           next:()=> `${maxHp() + 1} hearts` },
    rate:  { name:'Bubble Rate',   icon:'○', desc:'Fire bubbles 12% faster',
             now:()=> `${Math.round(rateMul()*100)}% fire rate`,     next:()=> `${Math.round((rateMul() + 0.12)*100)}% fire rate` },
    str:   { name:'Strength',      icon:'✦', desc:'+25% damage to guardians and bosses',
             now:()=> `${Math.round(strMul()*100)}% damage`,         next:()=> `${Math.round((strMul() + 0.25)*100)}% damage` }
  };

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
  const bossG = new PIXI.Graphics();          // the megalodon reuses the original wireframe fish
  dungeonC.addChild(mazeG, entG, bossG);

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
  for(const id of DUNGEONS.map(d => d.ability)){
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

  const upMenu = document.createElement('div');
  upMenu.id = 'upgrade-menu'; upMenu.style.display = 'none';
  upMenu.innerHTML = '<div class="up-box"><div class="up-small"></div><div class="up-big">Choose an upgrade</div><div class="up-cards"></div><div class="up-note">Click a card or press 1, 2 or 3</div></div>';
  document.body.appendChild(upMenu);
  const upSmall = upMenu.querySelector('.up-small'), upCards = upMenu.querySelector('.up-cards');
  let menuOpen = false, menuDelay = -1;

  function openUpgradeMenu(){
    menuOpen = true;
    hideHoverLabel();
    keys.left = keys.right = keys.up = keys.down = keys.space = false;
    const n = upOwed();
    upSmall.textContent = `Level ${getLevel()} · ${n} upgrade${n > 1 ? 's' : ''} to pick`;
    upCards.innerHTML = '';
    UP_KEYS.forEach((k, i)=>{
      const u = UPGRADES[k], open = upOpen(k), btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'up-card' + (open ? '' : ' maxed'); btn.disabled = !open;
      btn.innerHTML = `<div class="up-key">${i + 1}</div><div class="up-icon">${u.icon}</div><div class="up-name">${u.name}</div>` +
        `<div class="up-desc">${u.desc}</div><div class="up-stat">${open ? `${u.now()} → ${u.next()}` : 'MAXED'}</div>` +
        `<div class="up-lvl">${save.up[k]} / ${UP_CAP[k]}</div>`;
      btn.addEventListener('click', ()=> chooseUpgrade(k));
      upCards.appendChild(btn);
    });
    upMenu.style.display = 'flex';
  }

  function chooseUpgrade(k){
    if(!menuOpen || !upOpen(k)) return;
    save.up[k]++;
    if(k === 'hearts' && M){ M.php = Math.min(maxHp(), M.php + 1); caveHud._key = null; }
    persist();
    menuOpen = false; upMenu.style.display = 'none';
    menuDelay = upOwed() > 0 ? 15 : -1;                   // another pick waiting? show it right after
    burstBubbles(player.x, player.y, 16); playBlip();
    popText(UPGRADES[k].name + '!', 'flip');
  }

  function resetUpgrades(){ save.up = { hearts:0, rate:0, str:0 }; persist(); if(M) caveHud._key = null; }

  function updateUpgradeOffer(dt){
    if(menuOpen || !isStarted()) return;
    if(upOwed() > 0 && UP_KEYS.some(upOpen)){
      if(menuDelay < 0) menuDelay = 100;                  // let the level-up banner play first
      menuDelay -= dt;
      if(menuDelay <= 0){ menuDelay = -1; openUpgradeMenu(); }
    } else menuDelay = -1;
  }

  const compass = document.createElement('div');
  compass.id = 'cave-compass'; compass.style.display = 'none';
  compass.innerHTML = '<div class="cc-arrow">▲</div><div class="cc-label"></div><div class="cc-where"></div>';
  document.body.appendChild(compass);
  const ccArrow = compass.children[0], ccLabel = compass.children[1], ccWhere = compass.children[2];

  // edge-of-screen arrow pointing at the nearest cave you haven't cleared yet
  function updateCompass(){
    if(!isStarted() || active){ compass.style.display = 'none'; return; }
    const best = nextCave();                              // the lowest-numbered cave you haven't cleared
    if(!best){ compass.style.display = 'none'; return; }
    const bd = Math.hypot(best.x - player.x, mouthY(best) - player.y);
    const W = app.screen.width, H = app.screen.height;
    const dx = best.x - player.x, dy = mouthY(best) - player.y;
    if(Math.abs(dx) < W/2 - 110 && Math.abs(dy) < H/2 - 70){ compass.style.display = 'none'; return; }
    const k = Math.min((W/2 - 110)/Math.max(Math.abs(dx), 1), (H/2 - 70)/Math.max(Math.abs(dy), 1));
    compass.style.display = 'block';
    compass.style.left = (W/2 + dx*k) + 'px';
    compass.style.top = (H/2 + dy*k) + 'px';
    ccArrow.style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI/2}rad)`;
    ccLabel.textContent = `Next: ${best.id}. ${best.name} · ${Math.round(bd/8)} m`;
    ccWhere.textContent = best.biome.name + ' · ' + (best.floatY ? `floats ~${Math.round(best.floatY/8)} m deep` : 'on the seafloor');
  }

  /* ----------------------------------------------------------- abilities */

  let dashT = 0, dashCd = 0, shieldT = 0, shieldCd = 0, formCd = 0, invuln = 0, enterCd = 0;
  let lightR = 330;
  const TM = {}, CD = {};                                     // active time left / cooldown left for the 15 timed abilities
  TIMED.forEach(id => { TM[id] = 0; CD[id] = 0; });
  const KEYMAP = {};
  for(const id of Object.keys(ABILITIES)){
    const k = ABILITIES[id].key;
    if(k !== 'Space') KEYMAP[k.length === 1 ? k.toUpperCase() : k] = id;
  }
  const nextCave = ()=> DUNGEONS.find(d => !save.cleared.includes(d.id)) || null;

  function activate(id){
    if(!isStarted() || !has(id)) return;
    if(TIMED.includes(id)){ useTimed(id); return; }
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

  /* ---- the 15 cooldown abilities ---- */

  function useTimed(id){
    const ab = ABILITIES[id];
    if(ab.caveOnly && !(active && M)){ popText(ab.name + ' only works inside caves', 'warn'); return; }
    if(CD[id] > 0) return;
    if(!EFFECTS[id]()) return;                    // an effect may refuse (full health, no target) without spending its cooldown
    CD[id] = ab.cd; TM[id] = ab.dur || 0;
    burstBubbles(player.x, player.y, 12);
    if(!(id === 'sonar' && !active)) popText(ab.name + '!', 'flip');       // open-water sonar prints its own message
    playBlip();
  }

  function damageBoss(n){
    const b = M.boss;
    if(!b.active || b.dead) return;
    if(b.shieldT > 0) return;                                    // shield phase: nothing gets through
    b.hp -= n*strMul()*(1 - (b.armor || 0)); b.hit = 6;          // Strength upgrade adds, elite armor subtracts
    if(b.hp <= 0) killBoss();
  }
  function hurtGuard(k, n){
    const e = M.guards[k];
    e.hp -= n*strMul();
    if(e.hp > 0) return false;
    M.guards.splice(k, 1); burstBubbles(e.x, e.y, 8); addXP(2 + M.d.id);
    return true;
  }
  function openAhead(dist){                       // the farthest open point in front of the player, up to dist
    const a = player.displayAngle;
    for(let d = dist; d > 0; d -= 30){
      const x = player.x + Math.cos(a)*d, y = player.y + Math.sin(a)*d;
      if(!isWall(Math.floor(x/T), Math.floor(y/T))) return { x, y };
    }
    return { x:player.x, y:player.y };
  }
  const ringFx = (x, y, r1, col, life)=> M.fx.push({ type:'ring', x, y, r1, col, life:life || 30, max:life || 30 });

  const EFFECTS = {
    rapid:  ()=> true,
    triple: ()=> true,
    pierce: ()=> true,
    camo:   ()=> true,
    magnet: ()=> true,
    ripple: ()=> { ringFx(player.x, player.y, 460, 0x9be8ff); return true; },
    heal:   ()=> {
      if(M.php >= maxHp()){ popText('Already at full health', 'warn'); return false; }
      M.php = Math.min(maxHp(), M.php + 2); caveHud._key = null;
      ringFx(player.x, player.y, 200, 0x7dff9e);
      return true;
    },
    ink:    ()=> { M.ink = { x:player.x, y:player.y, r:230, life:360 }; return true; },
    whirl:  ()=> { const p = openAhead(240); M.vortex = { x:p.x, y:p.y, life:240, tick:0 }; return true; },
    chain:  ()=> {
      const near = M.guards.map(e => ({ e, d:Math.hypot(e.x - player.x, e.y - player.y) }))
                           .filter(o => o.d < 560).sort((a, b) => a.d - b.d).slice(0, 4);
      const b = M.boss;
      if(b.active && !b.dead && Math.hypot(b.x - player.x, b.y - player.y) < 720) near.push({ boss:true, e:b });
      if(!near.length){ popText('Nothing in range', 'warn'); return false; }
      let px = player.x, py = player.y;
      for(const o of near){
        M.fx.push({ type:'bolt', x0:px, y0:py, x1:o.e.x, y1:o.e.y, life:16, max:16 });
        px = o.e.x; py = o.e.y;
      }
      for(const o of near){
        if(o.boss) damageBoss(2);
        else { const k = M.guards.indexOf(o.e); if(k >= 0) hurtGuard(k, 2); }
      }
      return true;
    },
    sonar:  ()=> {
      if(active && M){
        for(const row of M.seen) row.fill(true);
        M.sonarT = 420; ringFx(player.x, player.y, 600, 0x9be8ff, 40);
      } else {
        const n = nextCave();
        if(!n) popText('Sonar: every cave is cleared!', 'flip');
        else {
          const dx = n.x - player.x;
          popText(`Sonar: ${n.name} is ${Math.round(Math.abs(dx)/8)} m ${dx > 0 ? 'east' : 'west'}`, 'flip');
        }
      }
      return true;
    },
    riptide: ()=> {
      ringFx(player.x, player.y, 360, 0xcff6ff, 24);
      for(let k = M.guards.length - 1; k >= 0; k--){
        const e = M.guards[k];
        if(Math.hypot(e.x - player.x, e.y - player.y) > 360) continue;
        const a = Math.atan2(e.y - player.y, e.x - player.x);
        if(!hurtGuard(k, 2)){ e.vx += Math.cos(a)*7; e.vy += Math.sin(a)*7; }
      }
      const b = M.boss;
      if(b.active && !b.dead && Math.hypot(b.x - player.x, b.y - player.y) < 360 + b.r) damageBoss(2);
      for(let i = M.shots.length - 1; i >= 0; i--) if(Math.hypot(M.shots[i].x - player.x, M.shots[i].y - player.y) < 360) M.shots.splice(i, 1);
      return true;
    },
    ghost:  ()=> {
      if(M.sealed){ popText('The boss has sealed the walls', 'warn'); return false; }
      return true;
    },
    cannon: ()=> {
      const a = player.displayAngle;
      M.bubs.push({ x:player.x + Math.cos(a)*26, y:player.y + Math.sin(a)*26, vx:Math.cos(a)*11, vy:Math.sin(a)*11,
                    life:100, r:24, dmg:6, pierce:true, hits:[], big:true });
      return true;
    },
    tsunami: ()=> {
      M.fx.push({ type:'wave', x:player.x, y:player.y, r1:1100, life:50, max:50 });
      M.shots.length = 0;
      for(let k = M.guards.length - 1; k >= 0; k--) hurtGuard(k, 4);
      damageBoss(Math.max(4, Math.ceil(M.boss.max*0.1)));
      return true;
    }
  };

  function handleKey(e){
    if(!isStarted()) return false;
    if(menuOpen){                                                // the upgrade menu eats every key
      const i = ['1', '2', '3'].indexOf(e.key);
      if(i >= 0) chooseUpgrade(UP_KEYS[i]);
      return true;
    }
    if(e.key === 'Escape' && active){ exitDungeon(false); return true; }
    if(e.repeat || e.ctrlKey || e.metaKey || e.altKey) return false;
    const id = KEYMAP[e.key.length === 1 ? e.key.toUpperCase() : e.key];
    if(!id || id === 'wings' || !has(id)) return false;
    activate(id);
    return true;
  }

  const look = ()=> FORMS[save.form] || FORMS.fish;

  // [time left, full cooldown] and "is it running right now" for every chip
  const cdOf = (id)=> id === 'dash' ? [dashCd, 110] : id === 'shield' ? [shieldCd, 720] : TIMED.includes(id) ? [CD[id], ABILITIES[id].cd] : [0, 1];
  const onOf = (id)=> id === 'glow' ? save.glow : id === 'shield' ? shieldT > 0 : id === 'dash' ? dashT > 0 : TIMED.includes(id) ? TM[id] > 0 : false;

  function refreshBar(){
    const list = unlockedList();
    bar.style.display = (isStarted() && list.length) ? 'flex' : 'none';
    if(!list.length) return;
    for(const id of Object.keys(ABILITIES)){
      const el = chips[id], ab = ABILITIES[id];
      if(!has(id)){ el.style.display = 'none'; continue; }
      el.style.display = '';
      const [left, full] = cdOf(id);
      const waiting = left > 0 && !(id === 'shield' && shieldT > 0);
      let cls = 'ability-chip';
      if(onOf(id)) cls += ' on';
      else if(waiting) cls += ' cd';
      if(el.className !== cls) el.className = cls;
      const pct = waiting ? Math.round(100*(1 - left/full)) : 100;
      if(el._pct !== pct){ el._pct = pct; el.style.setProperty('--cd', pct + '%'); }
      let txt = `[${ab.key}] ${ab.name}`;
      if(id === 'shapeshift') txt += ' · ' + look().name;
      if(waiting && full > 60) txt += ' · ' + Math.ceil(left/60) + 's';
      if(el.textContent !== txt){ el.textContent = txt; el.title = ab.desc; }
    }
  }

  function drawAura(now){
    auraG.clear();
    auraG.x = app.screen.width/2 + view.ox;
    auraG.y = app.screen.height/2 + player.bob + view.oy;
    const s = player.size * look().size;
    const fade = (TM.camo > 0 || TM.ghost > 0) ? 0.4 : 1;           // camouflage / ghost current make you see-through
    if(ctx.playerG.alpha !== fade) ctx.playerG.alpha = fade;
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
    auraG.lineStyle(0);
    if(TM.ripple > 0){
      auraG.lineStyle(2, 0x9be8ff, 0.35);
      auraG.drawCircle(0, 0, s*(2.6 + 0.4*Math.sin(now*0.01)));
    }
    if(TM.magnet > 0){
      auraG.lineStyle(1.5, 0xffe28a, 0.4);
      auraG.drawCircle(0, 0, s*(3.2 - 0.6*((now*0.004) % 1)));
    }
    if(TM.rapid > 0 || TM.triple > 0 || TM.pierce > 0){
      auraG.lineStyle(2, TM.pierce > 0 ? 0xffd36a : 0xcff6ff, 0.5);
      auraG.drawCircle(Math.cos(player.displayAngle)*s*1.5, Math.sin(player.displayAngle)*s*1.5, s*0.35);
    }
    auraG.lineStyle(0);
    if(dashT > 0){
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
      caveG.beginFill(d.rock);
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
      if(d.legend){ caveG.lineStyle(2, 0xffd36a, 0.35 + 0.3*Math.sin(now*0.004 + d.id)); caveG.drawEllipse(d.x, my, 78, 72); }   // legends get a golden second ring
      lab.text = (done ? '★ ' : '') + (d.legend ? '✦ ' : '') + d.id + '. ' + d.name;
      lab.style.fill = d.legend ? 0xffd36a : 0xdff6ff;
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

  function genMaze(mw, mh, big, id){
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
    const AW = (big ? 12 : 9) + Math.floor(id/5), AH = (big ? 9 : 7) + Math.floor(id/8), W = W0 + AW + 1, H = Math.max(H0, AH + 2);   // legends get a bigger arena
    const g = Array.from({length:H}, ()=> new Array(W).fill(1));
    for(let y=0;y<H0;y++) for(let x=0;x<W0;x++) g[y][x] = g0[y][x];
    const doorY = best[1]*2+1, top = clamp(doorY - (AH >> 1), 1, H - AH - 1);
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
    const m = genMaze(d.mw, d.mh, d.legend, d.id);
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
      guards.push({ kind:d.enemies[randi(0, d.enemies.length-1)], hp:2 + Math.floor(d.id/4), dir:0,
                    cx, cy, x:p.x, y:p.y, tx:p.x, ty:p.y, ncx:cx, ncy:cy,
                    speed: 0.85 + d.id*0.075 + rand(0,0.25), r:22, ph:rand(0,6), vx:0, vy:0,
                    shooter: d.id >= 5 && Math.random() < Math.min(0.6, 0.06*(d.id - 3)),   // deeper guardians spit shots
                    cd: rand(60, 160) });
    }
    const A = m.arena, ac = { x:(A.x0 + A.w/2)*T, y:(A.y0 + A.h/2)*T };
    const hp = d.bossHp, elite = d.id >= 10, tier = Math.max(0, d.id - 9);
    const boss = Object.assign({ hp, max:hp, x:ac.x + 200, y:ac.y, vx:0, vy:0, ang:Math.PI, state:'idle',
                                 t:0, hit:0, active:false, dead:false, atk:'charge', tx:ac.x, ty:ac.y,
                                 elite, tier, armor: elite ? Math.min(0.25, 0.025*tier) : 0,
                                 phase:1, shieldT:0, lastAtk:'', orb:rand(0, 6.28), orbDir:Math.random() < 0.5 ? 1 : -1,
                                 lkx:player.x, lky:player.y }, d.boss);
    const start = cellPos(0,0);
    const seen = Array.from({length:m.H}, ()=> new Array(m.W).fill(false));

    M = { d, m, pearls, guards, start, orb:ac, ac, orbOn:false, seen, armed:false, done:false, frame:0,
          boss, shots:[], bubs:[], php:maxHp(), fireCd:0, sealed:false, fx:[], vortex:null, ink:null, sonarT:0 };
    const cell = Math.max(4, Math.floor(Math.min(230/m.W, 170/m.H)));
    mapEl.width = m.W*cell; mapEl.height = m.H*cell; M.cell = cell;

    caveHud._key = null;
    active = true;
    player.flipping = false; player.inAir = false;
    player.x = start.x; player.y = start.y; player.vx = player.vy = 0;
    invuln = 60;
    hideWhenInside(true);
    hideHoverLabel();
    waterBgEl.style.display = 'none';
    dungeonC.visible = true; darkS.visible = true; mapEl.style.display = 'block';
    showBanner('Entering', d.name, d.biome.name + ' · ' + (d.legend ? 'A Mythical Sea Legend waits at the far end.' : 'Space shoots bubbles. Beat the boss, then take the relic.'));
    playBlip();
  }

  function exitDungeon(){
    if(!active) return;
    const d = M.d;
    active = false;
    dungeonC.visible = false; darkS.visible = false; mapEl.style.display = 'none'; caveHud.style.display = 'none';
    if(caveHover){ hideHoverLabel(caveHover); caveHover = null; }
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
      if(vn < 0){ player.vx -= vn*ux*1.2; player.vy -= vn*uy*1.2; }
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
      if(TM.ghost <= 0) collide(r);
      else { player.x = clamp(player.x, r, M.m.W*T - r); player.y = clamp(player.y, r, M.m.H*T - r); }   // Ghost Current: walls ignored
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

  // when Ghost Current ends inside solid rock, slide to the nearest open tile
  function unstick(){
    if(!isWall(Math.floor(player.x/T), Math.floor(player.y/T))) return;
    const tx = Math.floor(player.x/T), ty = Math.floor(player.y/T);
    let best = null, bd = Infinity;
    for(let dy=-8; dy<=8; dy++) for(let dx=-8; dx<=8; dx++){
      if(isWall(tx+dx, ty+dy)) continue;
      const d = dx*dx + dy*dy;
      if(d < bd){ bd = d; best = [tx+dx, ty+dy]; }
    }
    if(best){ player.x = (best[0] + 0.5)*T; player.y = (best[1] + 0.5)*T; player.vx = player.vy = 0; burstBubbles(player.x, player.y, 10); }
  }

  function defeat(){
    M.fx.length = 0; M.vortex = null; M.ink = null; TM.ghost = 0;
    M.php = maxHp(); M.shots.length = 0; M.bubs.length = 0; M.armed = false;
    player.x = M.start.x; player.y = M.start.y; player.vx = player.vy = 0;
    invuln = 120;
    const b = M.boss;
    if(!b.dead){
      b.hp = b.max; b.active = false; b.state = 'idle'; b.x = M.ac.x + 200; b.y = M.ac.y;
      b.phase = 1; b.shieldT = 0; b.lastAtk = '';
      if(M.sealed){ M.sealed = false; setDoor(false); }
    }
    popText('Swept back to the start!', 'warn');
  }

  function damagePlayer(fx, fy, n){
    n = n || 1;
    M.php -= n; invuln = 110;
    const a = Math.atan2(player.y - fy, player.x - fx);
    player.vx += Math.cos(a)*9; player.vy += Math.sin(a)*9;
    burstBubbles(player.x, player.y, 10); playBlip();
    if(M.php <= 0) defeat(); else popText(`-${n} ♥`, 'warn');
  }

  function fire(){
    if(!active || !M || M.fireCd > 0) return;
    M.fireCd = 11 / (TM.rapid > 0 ? 2.6 : 1) / rateMul();         // Rapid Bubbles x the Bubble Rate upgrade
    const a = player.displayAngle, pierce = TM.pierce > 0;       // Piercing Bubbles
    const spread = TM.triple > 0 ? [-0.3, 0, 0.3] : [0];         // Triple Shot
    for(const o of spread){
      const aa = a + o;
      M.bubs.push({ x:player.x + Math.cos(aa)*20, y:player.y + Math.sin(aa)*20,
                    vx:Math.cos(aa)*13 + player.vx*0.3, vy:Math.sin(aa)*13 + player.vy*0.3, life:80,
                    dmg:pierce ? 2 : 1, pierce, hits:[] });
    }
  }

  function stepGuard(e, dt, blind){
    const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy);
    if(d >= 16){
      const ease = 1 - Math.pow(0.9, dt);                 // steer, don't snap: corners become gentle curves
      e.vx += (dx/d*e.speed - e.vx)*ease; e.vy += (dy/d*e.speed - e.vy)*ease;
      e.x += e.vx*dt; e.y += e.vy*dt;
      return;
    }
    const from = [e.cx, e.cy];
    e.cx = e.ncx; e.cy = e.ncy;
    let opts = M.m.open[e.cy][e.cx];
    const fwd = opts.filter(([x,y])=> !(x === from[0] && y === from[1]));
    if(fwd.length) opts = fwd;
    let pick;
    if(!blind && Math.hypot(player.x - e.x, player.y - e.y) < 330 && Math.random() < 0.8){
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

  const BOSS_ATK = {
    crab:['charge','ring'], eel:['charge','fan'], angler:['fan','charge'], shark:['charge','fan','fan','ring'],
    puffer:['ring','charge','ring'], jelly:['ring','fan','spiral'], ray:['charge','fan','charge'],
    kraken:['fan','ring','spiral'],
    siren:['spiral','fan','ring'], ghostship:['charge','fan','spiral','ring'], dragon:['fan','charge','spiral','ring'],
    turtle:['ring','charge','spiral'], serpent:['charge','fan','spiral','charge'],
    hydra:['fan','fan','spiral','ring'], charybdis:['spiral','ring','spiral','fan'],
    leviathan:['charge','spiral','fan','ring','spiral']
  };
  // Elite bosses (caves 10+) learn extra tricks as the caves get deeper: [attack, first tier that has it]
  const ELITE_EXTRA = [['aimed', 1], ['homing', 2], ['sweep', 4], ['blink', 6], ['barrage', 8]];
  function atkList(b){
    const base = BOSS_ATK[b.kind];
    if(!b.elite) return base;
    const extra = ELITE_EXTRA.filter(([, t]) => b.tier >= t).map(([a]) => a);
    return base.concat(extra, extra);                   // they lean on the new tricks
  }

  function shoot(x, y, a, sp, extra){ M.shots.push(Object.assign({ x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:240 }, extra)); }

  // where to aim so a shot of speed sp meets the player: elites lead their target instead of firing at where you were
  function leadAngle(b, sp, k){
    const dx = player.x - b.x, dy = player.y - b.y, t = Math.hypot(dx, dy)/sp*(k === undefined ? 0.85 : k);
    return Math.atan2(dy + player.vy*t, dx + player.vx*t);
  }

  function updateBoss(dt){
    const b = M.boss, A = M.m.arena;
    if(b.dead) return;
    if(b.hit > 0) b.hit -= dt;
    if(b.shieldT > 0) b.shieldT -= dt;
    if(!b.active){
      if(player.x > (A.x0 + 1)*T){
        b.active = true; M.sealed = true; setDoor(true); b.state = 'rest'; b.t = 70;
        showBanner(b.legend ? 'Mythical Sea Legend' : (b.elite ? 'Elite Boss' : 'Boss'), b.name, b.elite ? 'It leads its shots, blinks and raises shields. Pop its orbs!' : 'Shoot it with Space!');
      }
      return;
    }
    const frac = b.hp/b.max, tier = b.tier, camo = TM.camo > 0;
    let rage;
    if(b.elite) rage = 1 + (1 - frac)*(0.35 + 0.025*tier) + (b.legend ? 0.08 : 0);       // elites ramp up as they bleed
    else rage = b.legend ? 1 + (1 - frac)*0.5 : (frac < 0.5 ? 1.15 : 1);                  // legends get angrier as they bleed
    const rt = b.elite ? 0.72 : 1;                                                         // elites rest less between attacks
    const x0 = A.x0*T + b.r, x1 = (A.x0 + A.w)*T - b.r, y0 = A.y0*T + b.r, y1 = (A.y0 + A.h)*T - b.r;
    if(!camo){ b.lkx = player.x; b.lky = player.y; }                                       // Camouflage: it can't find you
    const toP = camo ? b.ang : Math.atan2(player.y - b.y, player.x - b.x);
    const aimAt = (sp, k)=> camo ? b.ang : leadAngle(b, sp, k);

    // elite defence: every third of its health it raises a shield and releases homing orbs. Pop the orbs, wait it out.
    if(b.elite){
      const ph = frac < 0.34 ? 3 : frac < 0.67 ? 2 : 1;
      if(ph > b.phase){
        b.phase = ph; b.shieldT = 150 + tier*6; b.state = 'rest'; b.t = 100;
        M.fx.push({ type:'ring', x:b.x, y:b.y, r1:b.r*3.2, col:0x9be8ff, life:36, max:36 });
        const n = 4 + ph*2 + (b.legend ? 2 : 0);
        for(let i=0;i<n;i++) shoot(b.x, b.y, i/n*Math.PI*2 + b.ang, 2.1, { home:true, life:420 });
        popText(ph === 3 ? 'ENRAGED! Shield up!' : 'Shield up! Pop the orbs!', 'warn');
      }
    }

    b.t -= dt;
    if(b.state === 'rest'){
      if(b.elite){
        // circle the player at a distance, changing direction now and then, instead of drifting at random
        b.orb += 0.011*dt*rage*b.orbDir;
        if(Math.random() < 0.002*dt) b.orbDir = -b.orbDir;
        const dd = 250 + 50*Math.sin(b.orb*2.3);
        b.tx = clamp(b.lkx + Math.cos(b.orb)*dd, x0, x1); b.ty = clamp(b.lky + Math.sin(b.orb)*dd, y0, y1);
      } else if(Math.hypot(b.tx - b.x, b.ty - b.y) < 24){ b.tx = rand(x0, x1); b.ty = rand(y0, y1); }
      const a = Math.atan2(b.ty - b.y, b.tx - b.x), ease = 1 - Math.pow(0.96, dt), sp = (b.elite ? 2.1 : 1.5)*rage;
      b.vx += (Math.cos(a)*sp - b.vx)*ease; b.vy += (Math.sin(a)*sp - b.vy)*ease;
      b.x += b.vx*dt; b.y += b.vy*dt;
      if(b.elite){ b.x = clamp(b.x, x0, x1); b.y = clamp(b.y, y0, y1); }
      b.ang = lerpAngle(b.ang, toP, 0.05*dt);
      if(b.t <= 0){
        const l = atkList(b);
        let pick = l[randi(0, l.length-1)];
        if(b.elite) for(let k=0;k<5 && pick === b.lastAtk;k++) pick = l[randi(0, l.length-1)];   // never the same trick twice
        b.lastAtk = b.atk = pick; b.state = 'wind';
        const base = b.atk === 'charge' ? 62 : 45;
        b.t = b.elite ? Math.max(26, base - tier*2.5) : base;
      }
    } else if(b.state === 'wind'){
      b.ang = lerpAngle(b.ang, toP, 0.2*dt);
      b.vx *= Math.pow(0.9, dt); b.vy *= Math.pow(0.9, dt); b.x += b.vx*dt; b.y += b.vy*dt;
      if(b.t <= 0){
        if(b.atk === 'charge'){
          const sp = (b.elite ? 7.5 : 6.5)*rage, a = b.elite ? aimAt(sp, 0.55) : toP;
          b.state = 'charge'; b.t = 34;
          b.vx = Math.cos(a)*sp; b.vy = Math.sin(a)*sp; b.ang = a;
        } else if(b.atk === 'spiral'){
          b.state = 'spiral'; b.t = b.elite ? 130 : 110; b.cd = 0; b.spA = b.ang;
        } else if(b.atk === 'sweep'){
          b.state = 'sweep'; b.t = 100; b.cd = 0; b.swDir = Math.random() < 0.5 ? 1 : -1; b.spA = toP - b.swDir*0.95;
        } else if(b.atk === 'barrage'){
          b.state = 'barrage'; b.t = 96; b.cd = 0;
        } else if(b.atk === 'blink'){
          let spot = null;                                      // vanish and reappear a fair distance from the player
          for(let k=0;k<12 && !spot;k++){
            const a = rand(0, Math.PI*2), d = rand(240, 380);
            const nx = clamp(player.x + Math.cos(a)*d, x0, x1), ny = clamp(player.y + Math.sin(a)*d, y0, y1);
            if(Math.hypot(nx - player.x, ny - player.y) > 210) spot = { x:nx, y:ny };
          }
          burstBubbles(b.x, b.y, 10);
          if(spot){ b.x = spot.x; b.y = spot.y; b.vx = b.vy = 0; }
          burstBubbles(b.x, b.y, 10);
          M.fx.push({ type:'ring', x:b.x, y:b.y, r1:130, col:0xd59bff, life:22, max:22 });
          const a = aimAt(4.4*rage), n = tier >= 8 ? 7 : 5;
          for(let i=0;i<n;i++) shoot(b.x, b.y, a + (i - (n-1)/2)*0.2, 4.4*rage);
          b.state = 'rest'; b.t = 70/rage;
        } else {
          if(b.atk === 'ring'){
            const n = b.elite ? Math.min(20, 10 + tier) : (b.legend ? 12 : 8);
            for(let i=0;i<n;i++) shoot(b.x, b.y, i/n*Math.PI*2 + b.ang, 2.4*rage);
            if(b.elite && tier >= 6) for(let i=0;i<n;i++) shoot(b.x, b.y, (i + 0.5)/n*Math.PI*2 + b.ang, 1.6*rage);   // a slower second ring in the gaps
          } else if(b.atk === 'aimed'){
            const sp = 4.4*rage, a = aimAt(sp), n = 3 + (tier >= 5 ? 2 : 0);
            for(let i=0;i<n;i++) shoot(b.x, b.y, a + (i - (n-1)/2)*0.12, sp);
          } else if(b.atk === 'homing'){
            const n = 2 + Math.floor(tier/4);
            for(let i=0;i<n;i++) shoot(b.x, b.y, toP + (i - (n-1)/2)*0.7, 2.0, { home:true, life:420 });
          } else {
            const n = b.elite ? 5 + (tier >= 6 ? 2 : 0) + (tier >= 10 ? 2 : 0) : (rage > 1 ? 5 : 3);
            const a = b.elite ? aimAt(3.4*rage, 0.6) : toP;
            for(let i=0;i<n;i++) shoot(b.x, b.y, a + (i - (n-1)/2)*(b.elite ? 0.26 : 0.3), 3.4*rage);
          }
          b.state = 'rest'; b.t = rand(110, 170)/rage*rt;
        }
      }
    } else if(b.state === 'charge'){
      b.x += b.vx*dt; b.y += b.vy*dt;
      const cx = clamp(b.x, x0, x1), cy = clamp(b.y, y0, y1);
      if(cx !== b.x || cy !== b.y){
        b.x = cx; b.y = cy; b.t = 0; burstBubbles(b.x, b.y, 6);
        if(b.elite){                                            // slamming into the wall throws out a ring of shots
          const n = 8 + Math.floor(tier/2);
          for(let i=0;i<n;i++) shoot(b.x, b.y, i/n*Math.PI*2 + b.ang, 2.7*rage);
        }
      }
      if(b.t <= 0){ b.state = 'rest'; b.t = 100/rage*rt; }
    } else if(b.state === 'spiral'){
      b.vx *= Math.pow(0.9, dt); b.vy *= Math.pow(0.9, dt); b.x += b.vx*dt; b.y += b.vy*dt;
      b.spA += 0.16*dt*rage; b.ang = b.spA; b.cd -= dt;
      const arms = b.elite && tier >= 5 ? 4 : 3;
      if(b.cd <= 0){ b.cd = 6/rage; for(let k=0;k<arms;k++) shoot(b.x, b.y, b.spA + k*Math.PI*2/arms, 2.6*rage); }
      if(b.t <= 0){ b.state = 'rest'; b.t = 100/rage*rt; }
    } else if(b.state === 'sweep'){                              // a rotating stream: stand in the gap, or strafe against it
      b.vx *= Math.pow(0.9, dt); b.vy *= Math.pow(0.9, dt); b.x += b.vx*dt; b.y += b.vy*dt;
      b.spA += b.swDir*0.019*dt*rage; b.ang = b.spA; b.cd -= dt;
      if(b.cd <= 0){ b.cd = 3.5/rage; shoot(b.x, b.y, b.spA, 3.3*rage); if(tier >= 7) shoot(b.x, b.y, b.spA + Math.PI, 3.3*rage); }
      if(b.t <= 0){ b.state = 'rest'; b.t = 90/rage*rt; }
    } else if(b.state === 'barrage'){                            // three quick, well-aimed volleys
      b.vx *= Math.pow(0.9, dt); b.vy *= Math.pow(0.9, dt); b.x += b.vx*dt; b.y += b.vy*dt;
      b.ang = lerpAngle(b.ang, toP, 0.25*dt); b.cd -= dt;
      if(b.cd <= 0){
        b.cd = 26/rage;
        const sp = 4.8*rage, a = aimAt(sp);
        for(let i=-1;i<=1;i++) shoot(b.x, b.y, a + i*0.1, sp);
      }
      if(b.t <= 0){ b.state = 'rest'; b.t = 90/rage*rt; }
    }
  }

  function killBoss(){
    const b = M.boss, d = M.d;
    b.dead = true; M.orbOn = true; M.shots.length = 0;
    if(M.sealed){ M.sealed = false; setDoor(false); }
    for(let i=0;i<4;i++) burstBubbles(b.x + rand(-40,40), b.y + rand(-40,40), 12);
    addXP((d.legend ? 100 : 60)*d.id, d.legend ? 'Sea Legend slain!' : 'Boss defeated!');
    showBanner(d.legend ? 'Sea Legend defeated' : 'Boss defeated', b.name, 'Take the glowing relic!');
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

    const eDt = dt * (TM.ripple > 0 ? 0.4 : 1);                 // Time Ripple slows everything hostile
    const b = M.boss;

    // bubbles: hold Space to keep firing
    if(M.fireCd > 0) M.fireCd -= dt;
    if(keys.space) fire();
    for(let i=M.bubs.length-1;i>=0;i--){
      const p = M.bubs[i]; if(!p) continue;
      p.x += p.vx*dt; p.y += p.vy*dt; p.life -= dt;
      const rad = p.r || 7;
      let dead = p.life <= 0 || isWall(Math.floor(p.x/T), Math.floor(p.y/T));
      if(!dead && b.active && !b.dead && Math.hypot(p.x - b.x, p.y - b.y) < b.r + rad + 5){
        if(!p.pierce){ dead = true; damageBoss(p.dmg || 1); }
        else if(!p.hitBoss){ p.hitBoss = true; damageBoss(p.dmg || 1); }
      }
      if(!dead && b.shieldT > 0 && b.active && !b.dead && Math.hypot(p.x - b.x, p.y - b.y) < b.r + rad + 26) dead = true;   // the shield pops stray bubbles
      if(!dead) for(let k=M.shots.length-1;k>=0;k--){              // bubbles pop homing orbs
        const sh = M.shots[k];
        if(sh.home && Math.hypot(p.x - sh.x, p.y - sh.y) < rad + 13){
          M.shots.splice(k, 1); burstBubbles(sh.x, sh.y, 3);
          if(!p.pierce) dead = true;
          break;
        }
      }
      if(!dead) for(let k=M.guards.length-1;k>=0;k--){
        const e = M.guards[k];
        if(Math.hypot(p.x - e.x, p.y - e.y) < e.r + rad + 1){
          if(p.pierce){ if(p.hits.includes(e)) continue; p.hits.push(e); hurtGuard(k, p.dmg || 1); }
          else { dead = true; hurtGuard(k, p.dmg || 1); break; }
        }
      }
      if(dead) M.bubs.splice(i,1);
    }

    // sea-creature guardians (Ink Cloud blinds + slows them, Whirlpool drags them in)
    const V = M.vortex, I = M.ink;
    for(const e of M.guards){
      let gdt = eDt, blind = TM.camo > 0;
      if(I && Math.hypot(e.x - I.x, e.y - I.y) < I.r){ gdt *= 0.35; blind = true; }
      if(V){
        const vx = V.x - e.x, vy = V.y - e.y, vd = Math.hypot(vx, vy);
        if(vd < 380 && vd > 8){ const pull = (1.1 + (380 - vd)/380*2.2)*dt; e.x += vx/vd*pull; e.y += vy/vd*pull; }
      }
      stepGuard(e, gdt, blind);
      if(e.shooter){                                            // deeper guardians spit a shot when you are close
        e.cd -= gdt;
        if(e.cd <= 0 && !blind){
          const dd = Math.hypot(player.x - e.x, player.y - e.y);
          if(dd < 480){ e.cd = Math.max(70, rand(120, 190) - M.d.id*3); shoot(e.x, e.y, Math.atan2(player.y - e.y, player.x - e.x), 2.6 + M.d.id*0.04); }
          else e.cd = 20;
        }
      }
      if(!safe() && Math.hypot(player.x - e.x, player.y - e.y) < e.r + pr*0.8){ damagePlayer(e.x, e.y); break; }
    }
    if(V){
      V.life -= dt; V.tick -= dt;
      if(V.tick <= 0){
        V.tick = 28;
        for(let k=M.guards.length-1;k>=0;k--) if(Math.hypot(M.guards[k].x - V.x, M.guards[k].y - V.y) < 140) hurtGuard(k, 1);
        if(b.active && !b.dead && Math.hypot(b.x - V.x, b.y - V.y) < b.r + 150) damageBoss(1);
      }
      if(V.life <= 0) M.vortex = null;
    }
    if(I){ I.life -= dt; if(I.life <= 0) M.ink = null; }

    // boss + its shots
    updateBoss(eDt);
    if(b.active && !b.dead && !safe() && Math.hypot(player.x - b.x, player.y - b.y) < b.r + pr*0.7)
      damagePlayer(b.x, b.y, (b.elite && b.tier >= 6 && b.state === 'charge') ? 2 : 1);      // late elites hit hard when they ram you
    for(let i=M.shots.length-1;i>=0;i--){
      const p = M.shots[i]; if(!p) continue;
      if(p.home && TM.camo <= 0){                                  // homing orbs curve toward you (slowly)
        const sp = Math.hypot(p.vx, p.vy), na = lerpAngle(Math.atan2(p.vy, p.vx), Math.atan2(player.y - p.y, player.x - p.x), 0.035*eDt);
        p.vx = Math.cos(na)*sp; p.vy = Math.sin(na)*sp;
      }
      p.x += p.vx*eDt; p.y += p.vy*eDt; p.life -= eDt;
      let dead = p.life <= 0 || isWall(Math.floor(p.x/T), Math.floor(p.y/T));
      if(!dead && M.ink && Math.hypot(p.x - M.ink.x, p.y - M.ink.y) < M.ink.r) dead = true;        // the ink eats shots
      if(!dead && !safe() && Math.hypot(p.x - player.x, p.y - player.y) < 11 + pr*0.7){ dead = true; damagePlayer(p.x, p.y); }
      if(dead) M.shots.splice(i,1);
    }

    const mag = TM.magnet > 0;                                    // Pearl Magnet
    for(const p of M.pearls){
      if(p.got) continue;
      if(mag){
        const dx = player.x - p.x, dy = player.y - p.y, dd = Math.hypot(dx, dy);
        if(dd < 520 && dd > 1){ const st = Math.min(dd, 7)*dt; p.x += dx/dd*st; p.y += dy/dd*st; }
      }
      if(Math.hypot(player.x - p.x, player.y - p.y) < 42 + pr){
        p.got = true; addXP(5 + 3*M.d.id, 'Pearl'); burstBubbles(p.x, p.y, 6); playBlip();
      }
    }

    for(let i=M.fx.length-1;i>=0;i--){ M.fx[i].life -= dt; if(M.fx[i].life <= 0) M.fx.splice(i,1); }
    if(M.sonarT > 0) M.sonarT -= dt;

    if(M.orbOn && !M.done && Math.hypot(player.x - M.orb.x, player.y - M.orb.y) < 46 + pr) completeDungeon();
    const pd = Math.hypot(player.x - M.start.x, player.y - M.start.y);
    if(pd > 180) M.armed = true;
    if(M.armed && pd < 34 && !M.done && !M.sealed){ exitDungeon(); return; }

    const target = save.glow && has('glow') ? 620 : 330;
    lightR += (target - lightR) * 0.06 * dt;
    darkS.x = app.screen.width/2 + view.ox; darkS.y = app.screen.height/2 + player.bob + view.oy;
    darkS.width = darkS.height = lightR / 0.085;

    drawEntities(now);
    updateCaveHover();
    if(M.frame % 6 === 0) drawMap();
    updateCaveHud();
  }

  function updateCaveHud(){
    const b = M.boss, showBoss = b.active && !b.dead;
    const shielded = showBoss && b.shieldT > 0;
    const key = M.php + '|' + maxHp() + '|' + (showBoss ? Math.ceil(b.hp) : -1) + '|' + shielded;
    if(key === caveHud._key) return;
    caveHud._key = key;
    caveHud.style.display = 'block';
    const cls = (b.legend ? ' legend' : '') + (b.elite ? ' elite' : '') + (shielded ? ' shielded' : '');
    const tag = b.elite ? `<span class="boss-tag">ELITE · ARMOR ${Math.round(b.armor*100)}%${shielded ? ' · SHIELDED' : ''}</span>` : '';
    caveHud.innerHTML = '<div class="hearts">' + '♥'.repeat(Math.max(0, M.php)) + '<span>' + '♥'.repeat(Math.max(0, maxHp() - Math.max(0, M.php))) + '</span></div>' +
      (showBoss ? `<div class="boss-name${cls}">${b.legend ? '✦ ' : ''}${b.name}${tag}</div><div class="boss-bar${cls}"><div style="width:${Math.max(0, b.hp/b.max*100)}%"></div></div>` : '');
  }

  /* ---------------- hover labels for guardians and bosses ---------------- */

  const SPECIES = { crab:'Crab', urchin:'Sea Urchin', eel:'Moray Eel', puffer:'Pufferfish', jelly:'Jellyfish', angler:'Anglerfish',
                    kraken:'Kraken', ray:'Manta Ray', siren:'Siren', ghostship:'Ghost Ship', dragon:'Sea Dragon', turtle:'Giant Sea Turtle',
                    serpent:'Sea Serpent', leviathan:'Leviathan', hydra:'Hydra', charybdis:'Maw', shark:'Shark' };
  let caveHover = null;

  function updateCaveHover(){
    let label = null;
    if(mouseScreen && !menuOpen){
      const r = app.view.getBoundingClientRect();
      if(mouseScreen.x >= r.left && mouseScreen.x <= r.right && mouseScreen.y >= r.top && mouseScreen.y <= r.bottom){
        const wx = (mouseScreen.x - r.left)*app.screen.width/r.width - world.x;
        const wy = (mouseScreen.y - r.top)*app.screen.height/r.height - world.y;
        const seen = (o)=> Math.hypot(o.x - player.x, o.y - player.y) < lightR*1.05;         // only what the light reveals
        let bestD = Infinity;
        for(const e of M.guards){
          const d = Math.hypot(wx - e.x, wy - e.y) - (e.r + 12);
          if(d < 0 && d < bestD && seen(e)){ bestD = d; label = (SPECIES[e.kind] || e.kind) + (e.shooter ? ' · spits shots' : ''); }
        }
        const b = M.boss;
        if(b.active && !b.dead){
          const d = Math.hypot(wx - b.x, wy - b.y) - (b.r + 12);
          if(d < 0 && d < bestD && seen(b)) label = `${b.name} · ${SPECIES[b.kind] || b.kind} ${b.legend ? 'Legend' : 'Boss'}${b.elite ? ' (Elite)' : ''}`;
        }
      }
    }
    if(label !== caveHover){
      if(caveHover) hideHoverLabel(caveHover);
      if(label) showHoverLabel(label);
      caveHover = label;
    }
  }

  /* ---------------- sea-creature drawing (all vector, drawn each frame) ---------------- */

  /* ---------- wireframe sea creatures: stroked outlines only, like the open-ocean fish ---------- */

  const PAL = {
    crab:[0xff8a5c,0xffd0a8], urchin:[0xb07aff,0xff9bd2], eel:[0x6fe0a0,0xd5ff9b], puffer:[0xffd45e,0xfff0bd],
    jelly:[0xd59bff,0xffc8ff], angler:[0x8fa8d8,0x88ff44], kraken:[0xd07ad8,0xffc8ff],
    ray:[0x6fa8ff,0xdff6ff], siren:[0x6fe0d0,0xffc8ff], ghostship:[0x8fe8d8,0xe0fff8], dragon:[0xff5a4a,0xffd36a],
    turtle:[0x6fbf8a,0xe8e0a8], serpent:[0x6fd0a0,0xd5ff9b], leviathan:[0x7a7aff,0xffd36a], hydra:[0x5fd08a,0xff9bd2],
    charybdis:[0x5a6aff,0xcfd8ff]
  };
  const BOSS_SCALE = { crab:0.8, eel:1.05, angler:0.95, kraken:0.95, puffer:0.8, jelly:0.9, ray:0.7, siren:0.8, ghostship:0.6,
                       dragon:0.72, turtle:0.8, serpent:0.85, leviathan:0.85, hydra:0.8, charybdis:0.9 };

  // One definition per species, in unit coordinates (+u = forward). S scales it: ~20 for guardians, ~55 for bosses.
  function drawCreature(g, kind, x, y, ang, S, t, flash, palOv){
    const c = Math.cos(ang), sn = Math.sin(ang), pal = palOv || PAL[kind];
    const body = flash ? 0xffffff : pal[0], acc = flash ? 0xffffff : pal[1];
    const P = (u, v)=> [x + (u*c - v*sn)*S, y + (u*sn + v*c)*S];
    const W = Math.max(1.7, S*0.085);
    const line = (w, col, al)=> g.lineStyle({ width:w, color:col, alpha: al === undefined ? 1 : al, ...ROUND });
    const path = (pts)=> pts.forEach((p, i)=> i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
    const loop = (pts)=> { path(pts); g.lineTo(pts[0][0], pts[0][1]); };
    const oval = (u0, v0, rx, ry, n)=> { const pts = []; n = n || 22;
      for(let i=0;i<n;i++){ const a = i/n*Math.PI*2; pts.push(P(u0 + Math.cos(a)*rx, v0 + Math.sin(a)*ry)); } loop(pts); };
    const quad = (a, b)=> g.quadraticCurveTo(a[0], a[1], b[0], b[1]);
    const dot = (u, v, r, col, al)=> { const p = P(u, v); g.lineStyle(0); g.beginFill(col, al === undefined ? 1 : al); g.drawCircle(p[0], p[1], r); g.endFill(); };
    const eye = (u, v, r)=> { const p = P(u, v); line(Math.max(1.2, W*0.55), acc); g.drawCircle(p[0], p[1], r); dot(u + 0.03, v, Math.max(1.2, r*0.45), acc); };

    switch(kind){
      case 'crab': {
        line(W, body); oval(0, 0, 0.9, 0.6);
        line(W*0.7, body);
        for(let i=0;i<3;i++) for(const sd of [-1,1]){
          const sw = Math.sin(t*3 + i*1.3 + (sd > 0 ? 0 : Math.PI))*0.16, u = -0.5 + i*0.4;
          path([P(u, sd*0.55), P(u + sw - 0.1, sd*1.0), P(u + sw*1.6 - 0.2, sd*1.38)]);
        }
        for(const sd of [-1,1]){
          const open = 0.22 + (Math.sin(t*2 + (sd > 0 ? 0 : 1.6)) + 1)*0.12;
          line(W*0.9, body); path([P(0.7, sd*0.42), P(1.15, sd*0.78)]);
          line(W, acc);
          path([P(1.15, sd*0.78), P(1.6, sd*(0.78 - open)), P(1.9, sd*(0.62 - open*0.5))]);
          path([P(1.15, sd*0.78), P(1.5, sd*(0.78 + open)), P(1.82, sd*(0.95 + open*0.4))]);
          line(W*0.6, body); path([P(0.78, sd*0.2), P(0.92, sd*0.32)]); dot(0.95, sd*0.34, Math.max(1.5, S*0.07), acc);
        }
        break;
      }
      case 'urchin': {
        const rot = t*0.15;
        line(W, body); oval(0, 0, 0.5, 0.5, 16);
        for(let i=0;i<14;i++){
          const a = rot + i/14*Math.PI*2, l2 = (i%2 ? 0.85 : 1.2) + Math.sin(t*2 + i)*0.05;
          line(W*0.6, i%2 ? acc : body);
          path([P(Math.cos(a)*0.5, Math.sin(a)*0.5), P(Math.cos(a)*l2, Math.sin(a)*l2)]);
        }
        dot(0, 0, Math.max(2, S*0.11), acc, 0.9);
        break;
      }
      case 'eel': {
        const N = S > 30 ? 16 : 10, seg = S > 30 ? 0.26 : 0.3, top = [], bot = [], fin = [];
        for(let i=0;i<=N;i++){
          const f = i/N, u = 0.55 - i*seg, v = Math.sin(t*2 - i*0.55)*0.2*(0.3 + f), w = 0.28*(1 - f*0.85) + 0.02;
          top.push(P(u, v - w)); bot.push(P(u, v + w)); fin.push(P(u - 0.06, v - w - 0.16));
        }
        line(W, body); path(top); path(bot);
        g.moveTo(top[0][0], top[0][1]); quad(P(1.1, 0), bot[0]);
        line(W*0.55, acc, 0.8);
        for(let i=1;i<N;i+=2) path([top[i], fin[i]]);
        line(W*0.6, acc); path([P(0.55, -0.1), P(0.95, -0.03)]); path([P(0.55, 0.1), P(0.95, 0.03)]);
        eye(0.3, -0.12, Math.max(1.8, S*0.075));
        break;
      }
      case 'puffer': {
        line(W, body); oval(0, 0, 0.95, 0.8, 20);
        for(let i=0;i<10;i++){
          const a = i/10*Math.PI*2 + 0.15;
          line(W*0.55, acc); path([P(Math.cos(a)*0.95, Math.sin(a)*0.8), P(Math.cos(a)*1.3, Math.sin(a)*1.1)]);
        }
        const wag = Math.sin(t*4)*0.2;
        line(W, body); path([P(-0.95, 0), P(-1.5, -0.4 + wag), P(-1.28, wag*0.5), P(-1.5, 0.4 + wag), P(-0.95, 0)]);
        line(W*0.7, acc); path([P(0.1, 0.5), P(-0.2, 0.95 + Math.sin(t*5)*0.1), P(-0.32, 0.45)]);
        path([P(0.95, 0.12), P(0.78, 0.14)]);
        eye(0.5, -0.25, Math.max(2, S*0.15));
        break;
      }
      case 'jelly': {
        const p = 1 + Math.sin(t*2.5)*0.15;
        line(W, body, 0.95);
        g.moveTo(...P(0, -p)); quad(P(1.0, -0.8*p), P(1.0, 0)); quad(P(1.0, 0.8*p), P(0, p)); quad(P(0.2, 0), P(0, -p));
        line(W*0.5, acc, 0.5); g.moveTo(...P(0.1, -0.55*p)); quad(P(0.55, 0), P(0.1, 0.55*p));
        for(let i=0;i<5;i++){
          const v0 = -0.7 + i*0.35;
          line(W*0.7, body, 0.65); g.moveTo(...P(0.05, v0));
          for(let j=1;j<=4;j++) g.lineTo(...P(0.05 - j*0.5, v0 + Math.sin(t*3 + i + j)*0.12*j));
        }
        line(W*1.0, acc, 0.6);
        for(const sd of [-1,1]){ g.moveTo(...P(0, sd*0.18)); for(let j=1;j<=3;j++) g.lineTo(...P(-j*0.5, sd*0.18 + Math.sin(t*2.4 + j + sd)*0.14*j)); }
        break;
      }
      case 'angler': {
        line(W, body);
        g.moveTo(...P(1.0, 0.15)); quad(P(0.9, -0.9), P(-0.2, -0.85)); quad(P(-1, -0.6), P(-1, 0)); quad(P(-1, 0.6), P(-0.1, 0.8)); quad(P(0.65, 0.8), P(0.95, 0.4));
        const wag = Math.sin(t*3)*0.18;
        path([P(-1, 0), P(-1.6, -0.45 + wag), P(-1.38, wag*0.4), P(-1.6, 0.45 + wag), P(-1, 0)]);
        line(W*0.7, acc); path([P(1.0, 0.15), P(0.3, 0.3)]);
        for(let k=0;k<5;k++) path([P(0.95 - k*0.14, 0.16 + k*0.017), P(0.9 - k*0.14, 0.33 + k*0.017)]);
        line(W*0.6, body); g.moveTo(...P(0.35, -0.75)); quad(P(0.7, -1.5 + Math.sin(t*2)*0.1), P(1.2, -1.1));
        const lp = P(1.2, -1.1), halo = Math.max(3, S*0.2) + Math.sin(t*3)*S*0.03;
        line(1.3, 0x88ff44, 0.5); g.drawCircle(lp[0], lp[1], halo);
        dot(1.2, -1.1, Math.max(2.2, S*0.1), 0x88ff44, 0.95);
        eye(0.5, -0.3, Math.max(2, S*0.16));
        break;
      }
      case 'kraken': {
        line(W, body); oval(0.05, 0, 1, 0.85, 26);
        for(const sd of [-1,1]){ path([P(-0.6, sd*0.7), P(-1.1, sd*1.15), P(-0.95, sd*0.4)]); }
        line(W*0.5, acc, 0.6); g.moveTo(...P(0.7, -0.55)); quad(P(-0.2, 0), P(0.7, 0.55));
        for(let k=0;k<8;k++){
          const v0 = (k - 3.5)*0.2;
          line(W*(k%3 === 0 ? 0.95 : 0.65), k%2 ? body : acc, 0.9);
          g.moveTo(...P(-0.9, v0));
          for(let j=1;j<=8;j++) g.lineTo(...P(-0.9 - j*0.34, v0*(1 + j*0.2) + Math.sin(t*2 + j*0.7 + k)*0.16));
        }
        for(const sd of [-1,1]){ eye(0.5, sd*0.42, Math.max(2.5, S*0.2)); }
        break;
      }

      case 'ray': {
        const fl = Math.sin(t*2.4)*0.28;
        line(W, body);
        g.moveTo(...P(1.25, 0));
        quad(P(0.5, -0.9 - fl*0.4), P(-0.3, -1.9 - fl));
        quad(P(-0.7, -0.7), P(-1.0, 0));
        quad(P(-0.7, 0.7), P(-0.3, 1.9 + fl));
        quad(P(0.5, 0.9 + fl*0.4), P(1.25, 0));
        line(W*0.6, acc, 0.7);
        g.moveTo(...P(0.9, 0)); quad(P(0.1, -0.5 - fl*0.3), P(-0.5, -1.15 - fl*0.6));
        g.moveTo(...P(0.9, 0)); quad(P(0.1, 0.5 + fl*0.3), P(-0.5, 1.15 + fl*0.6));
        line(W*0.8, body);
        path([P(-1.0, 0), P(-1.8, Math.sin(t*3)*0.2), P(-2.6, Math.sin(t*3 + 1)*0.35)]);
        line(W*0.7, acc); path([P(1.2, -0.12), P(1.55, -0.3)]); path([P(1.2, 0.12), P(1.55, 0.3)]);
        eye(0.75, -0.25, Math.max(1.8, S*0.07)); eye(0.75, 0.25, Math.max(1.8, S*0.07));
        break;
      }
      case 'siren': {
        const N = 9, top = [], bot = [];
        for(let i=0;i<=N;i++){
          const f = i/N, u = -0.35 - i*0.2, v = Math.sin(t*2.2 - i*0.55)*0.28*(0.25 + f), w = 0.3*(1 - f*0.9) + 0.03;
          top.push(P(u, v - w)); bot.push(P(u, v + w));
        }
        line(W, body); path(top); path(bot);
        const eu = -0.35 - N*0.2, ev = Math.sin(t*2.2 - N*0.55)*0.28*1.25;
        line(W*0.9, acc); path([P(eu, ev), P(eu - 0.45, ev - 0.5), P(eu - 0.2, ev), P(eu - 0.45, ev + 0.5), P(eu, ev)]);
        line(W*0.5, acc, 0.5); for(let i=1;i<N;i+=2) path([top[i], bot[i]]);
        line(W, body); loop([P(0.6,-0.3), P(0.0,-0.42), P(-0.35,-0.2), P(-0.35,0.2), P(0.0,0.42), P(0.6,0.3)]);
        oval(0.95, 0, 0.27, 0.27, 14);
        const arm = Math.sin(t*2)*0.12;
        line(W*0.8, body);
        path([P(0.35,-0.36), P(0.75,-0.85 + arm), P(1.25,-0.75 + arm)]);
        path([P(0.35, 0.36), P(0.75, 0.85 - arm), P(1.25, 0.75 - arm)]);
        line(W*0.6, acc, 0.85);                                           // flowing hair
        for(let k=0;k<5;k++){
          const v0 = (-0.2 + k*0.1)*1.3;
          g.moveTo(...P(0.9, v0));
          for(let j=1;j<=4;j++) g.lineTo(...P(0.9 - j*0.35, v0 + (k - 2)*0.1*j + Math.sin(t*2.6 + j + k)*0.12*j));
        }
        const ph = (t*0.5) % 1, hp = P(0.95, 0);                          // her song, as ripples
        g.lineStyle({ width:Math.max(1.2, W*0.5), color:acc, alpha:0.5*(1 - ph), ...ROUND });
        g.drawCircle(hp[0], hp[1], S*(0.4 + ph*1.4));
        eye(1.02, -0.09, Math.max(1.4, S*0.045));
        break;
      }
      case 'ghostship': {
        const dir = Math.cos(ang) >= 0 ? 1 : -1;                          // side view; only flips left/right
        const bob = Math.sin(t*1.3)*S*0.06;
        const Q = (u, v)=> [x + u*dir*S, y + v*S + bob];
        const ql = (u, v)=> g.lineTo(...Q(u, v)), qm = (u, v)=> g.moveTo(...Q(u, v));
        line(W, body, 0.85);
        qm(1.7,-0.15); ql(1.2,0.5); ql(-1.3,0.5); ql(-1.7,-0.25); ql(-1.3,-0.1); ql(1.0,-0.1); ql(1.7,-0.15);
        line(W*0.8, body, 0.85);
        qm(0.55,-0.1); ql(0.55,-1.9); qm(-0.7,-0.1); ql(-0.7,-1.65);
        const sw = Math.sin(t*2)*0.12, sw2 = Math.sin(t*2 + 1.3)*0.1;
        line(W*0.7, acc, 0.75);
        qm(0.55,-1.75); ql(1.25 + sw,-1.45); ql(1.15 + sw2,-0.95); ql(1.3 + sw,-0.45); ql(0.55,-0.3);     // tattered sails
        qm(-0.7,-1.55); ql(-1.3 + sw2,-1.25); ql(-1.2 + sw,-0.8); ql(-1.35 + sw2,-0.35); ql(-0.7,-0.25);
        qm(0.55,-1.9); ql(1.0 + sw,-1.8); ql(0.55,-1.7);                                                  // flag
        line(W*0.5, acc, 0.35);                                                                           // ghostly wake
        for(let k=0;k<3;k++){ qm(-1.7, -0.1 + k*0.2); for(let j=1;j<=4;j++) ql(-1.7 - j*0.35, -0.1 + k*0.2 + Math.sin(t*3 + j + k)*0.1*j); }
        const lp = Q(-1.45,-0.45);
        g.lineStyle(0); g.beginFill(acc, 0.85); g.drawCircle(lp[0], lp[1], Math.max(2.2, S*0.07)); g.endFill();
        g.beginFill(acc, 0.14); g.drawCircle(lp[0], lp[1], S*0.28); g.endFill();
        break;
      }
      case 'dragon': {
        const N = 15, seg = 0.36, top = [], bot = [], pts = [];
        for(let i=0;i<=N;i++){
          const f = i/N, u = 0.35 - i*seg, v = Math.sin(t*2 - i*0.5)*0.34*(0.3 + f), w = 0.3*(1 - f*0.82) + 0.035;
          top.push(P(u, v - w)); bot.push(P(u, v + w)); pts.push([u, v, w]);
        }
        line(W, body); path(top); path(bot);
        line(W*0.5, acc, 0.45); for(let i=1;i<N;i+=2) path([top[i], bot[i]]);
        line(W*0.6, acc, 0.9);                                                                        // mane
        for(let i=0;i<N;i++){ const [u, v, w] = pts[i]; path([P(u + 0.1, v - w), P(u - 0.02, v - w - 0.22 - (i%2)*0.1 + Math.sin(t*4 + i)*0.04), P(u - 0.12, v - w)]); }
        line(W*0.8, body);                                                                            // clawed legs
        for(const i of [3, 8]){
          const [u, v, w] = pts[i];
          path([P(u, v + w), P(u + 0.05, v + w + 0.28), P(u + 0.22, v + w + 0.38)]);
          path([P(u, v - w), P(u + 0.05, v - w - 0.28), P(u + 0.22, v - w - 0.38)]);
        }
        line(W, body);
        g.moveTo(...top[0]); g.lineTo(...P(0.9,-0.28)); g.lineTo(...P(1.35,-0.14)); g.lineTo(...P(1.4,0)); g.lineTo(...P(1.1,0.12)); g.lineTo(...P(0.9,0.3)); g.lineTo(...bot[0]);
        line(W*0.6, acc);
        const wh = Math.sin(t*2.4)*0.2;                                                               // whiskers
        for(const sd of [-1,1]){ g.moveTo(...P(1.3, sd*0.05)); quad(P(1.9, sd*0.5 + wh*sd), P(2.5, sd*0.2 + wh)); }
        path([P(0.55,-0.3), P(0.25,-0.8), P(0.05,-0.74)]); path([P(0.55,0.3), P(0.25,0.8), P(0.05,0.74)]);   // horns
        eye(0.7, -0.14, Math.max(2, S*0.07));
        const pp = P(2.3, 0.9 + wh), glow = 0.5 + 0.5*Math.sin(t*3);                                  // the dragon pearl
        g.lineStyle(0); g.beginFill(0xffffff, 0.95); g.drawCircle(pp[0], pp[1], Math.max(3, S*0.12)); g.endFill();
        g.beginFill(acc, 0.12 + 0.1*glow); g.drawCircle(pp[0], pp[1], S*0.4); g.endFill();
        break;
      }
      case 'turtle': {
        const fl = Math.sin(t*1.6)*0.25;
        line(W, body); oval(0, 0, 1.15, 0.9, 26);
        line(W*0.6, acc, 0.6); oval(0, 0, 0.72, 0.55, 18);
        for(let k=0;k<6;k++){ const a = k/6*Math.PI*2 + 0.3; path([P(Math.cos(a)*0.72, Math.sin(a)*0.55), P(Math.cos(a)*1.15, Math.sin(a)*0.9)]); }
        line(W*0.9, body);
        g.moveTo(...P(1.1,-0.2)); quad(P(1.5,-0.25), P(1.7,0)); quad(P(1.5,0.25), P(1.1,0.2));
        eye(1.5, -0.1, Math.max(1.6, S*0.05));
        for(const sd of [-1,1]){
          line(W*0.9, body);
          path([P(0.55, sd*0.8), P(0.9, sd*(1.5 + fl)), P(0.25, sd*(2.0 + fl))]);
          path([P(-0.7, sd*0.7), P(-0.95, sd*(1.2 - fl*0.5)), P(-0.55, sd*1.4)]);
        }
        line(W*0.7, body); path([P(-1.15, 0), P(-1.6, Math.sin(t*2)*0.12)]);
        line(W*0.7, 0x6fd08a);                                                                        // a little island grows on its back
        path([P(0.0,0.05), P(-0.45,0.05)]); path([P(-0.45,0.05), P(-0.6,0.3)]); path([P(-0.45,0.05), P(-0.6,-0.2)]); path([P(-0.45,0.05), P(-0.72,0.05)]);
        break;
      }
      case 'serpent':
      case 'leviathan': {
        const lev = kind === 'leviathan';
        const N = lev ? 20 : 18, seg = 0.42, top = [], bot = [], pts = [];
        for(let i=0;i<=N;i++){
          const f = i/N, u = 0.2 - i*seg, v = Math.sin(t*1.8 - i*0.45)*0.42*(0.35 + f), w = 0.42*(1 - f*0.88) + 0.04;
          top.push(P(u, v - w)); bot.push(P(u, v + w)); pts.push([u, v, w]);
        }
        line(W, body); path(top); path(bot);
        line(W*0.45, acc, 0.4); for(let i=1;i<=N;i++) path([top[i], bot[i]]);
        line(W*0.7, acc, 0.9);
        for(let i=1;i<N;i++){
          const [u, v, w] = pts[i], l = (i%2 ? 0.28 : 0.4)*(lev ? 1.3 : 1)*(1 - i/N*0.6);
          path([P(u + 0.12, v - w), P(u - 0.04, v - w - l), P(u - 0.2, v - w)]);
        }
        const open = 0.08 + (Math.sin(t*2.2) + 1)*0.1;
        line(W, body);
        g.moveTo(...top[0]); g.lineTo(...P(0.55,-0.42)); g.lineTo(...P(1.2,-0.28)); g.lineTo(...P(1.65,-0.08)); g.lineTo(...P(1.55,0));
        g.moveTo(...bot[0]); g.lineTo(...P(0.5, 0.42 + open)); g.lineTo(...P(1.1, 0.3 + open)); g.lineTo(...P(1.5, 0.08 + open*1.4));
        line(W*0.7, acc);
        for(let k=0;k<4;k++) path([P(1.5 - k*0.2, -0.05 - k*0.01), P(1.46 - k*0.2, 0.1 + open*0.4)]);
        path([P(1.5, 0.08 + open*1.4), P(1.7, 0.12 + open*1.6), P(1.9, 0.02 + open*0.8)]);
        eye(0.75, -0.2, Math.max(2, S*0.07));
        if(lev){ for(let k=0;k<3;k++) path([P(0.5 - k*0.16,-0.4), P(0.35 - k*0.2,-0.95 - k*0.1), P(0.2 - k*0.2,-0.42)]); }
        else path([P(0.55,-0.4), P(0.2,-0.8), P(0.05,-0.62)]);
        break;
      }
      case 'hydra': {
        line(W, body); oval(-0.8, 0, 0.95, 0.7, 22);
        line(W*0.6, acc, 0.5); for(let k=0;k<4;k++) path([P(-1.1 + k*0.2,-0.45), P(-1.0 + k*0.2,-0.75)]);
        line(W*0.8, body);
        g.moveTo(...P(-1.7, 0)); for(let j=1;j<=6;j++) g.lineTo(...P(-1.7 - j*0.3, Math.sin(t*2 + j*0.7)*0.15*j));
        for(let k=0;k<3;k++){
          const v0 = (k - 1)*0.36, ph = k*2.1, neck = [];
          for(let j=0;j<=8;j++){ const f = j/8; neck.push([f*1.9, v0*(1 + f*2.1) + Math.sin(t*2.2 + ph + f*3)*0.2*f]); }
          line(W*1.7, k === 1 ? body : acc, 0.9); path(neck.map(p => P(p[0], p[1])));
          const hu = neck[8][0], hv = neck[8][1], dr = Math.atan2(hv - neck[7][1], hu - neck[7][0]), cd = Math.cos(dr), sd = Math.sin(dr);
          const R = (a, b)=> P(hu + a*cd - b*sd, hv + a*sd + b*cd), op = 0.05 + (Math.sin(t*3 + ph) + 1)*0.07;
          line(W, body);
          path([R(-0.05,-0.2), R(0.4,-0.15), R(0.62,-0.02)]); path([R(-0.05,0.2), R(0.35,0.15 + op), R(0.6,0.04 + op)]);
          const ep = R(0.18,-0.09); g.lineStyle(0); g.beginFill(acc); g.drawCircle(ep[0], ep[1], Math.max(1.6, S*0.045)); g.endFill();
        }
        break;
      }
      case 'charybdis': {
        const rot = t*0.5;
        for(let k=0;k<4;k++){
          line(W*0.8, k%2 ? body : acc, 0.7);
          for(let j=0;j<=26;j++){
            const a = rot*1.6 + k*Math.PI/2 + j*0.24, r = 1.55 - j*0.05;
            if(j) g.lineTo(...P(Math.cos(a)*r, Math.sin(a)*r)); else g.moveTo(...P(Math.cos(a)*r, Math.sin(a)*r));
          }
        }
        const ring = (r0, wob, n)=>{ const pts = []; for(let i=0;i<n;i++){ const a = i/n*Math.PI*2, r = r0 + Math.sin(a*5 + t*2)*wob; pts.push(P(Math.cos(a)*r, Math.sin(a)*r)); } loop(pts); };
        line(W, body); ring(1.05, 0.05, 36);
        line(W*0.7, acc); ring(0.62, 0.04, 28);
        line(W*0.9, acc);
        for(let i=0;i<14;i++){ const a = rot*0.25 + i/14*Math.PI*2; path([P(Math.cos(a - 0.1)*1.02, Math.sin(a - 0.1)*1.02), P(Math.cos(a)*0.6, Math.sin(a)*0.6), P(Math.cos(a + 0.1)*1.02, Math.sin(a + 0.1)*1.02)]); }
        dot(0, 0, S*0.38, 0x000000, 0.85);
        break;
      }
    }
    g.lineStyle(0);
  }

  function drawEnemy(e, now){
    const t = now*0.004 + e.ph;
    const pal = e.shooter ? [0xff5a5a, 0xffd0d0] : undefined;      // red guardians spit shots
    if(e.kind === 'jelly'){
      drawCreature(entG, 'jelly', e.x, e.y + Math.sin(t*1.5)*3, -Math.PI/2 + Math.sin(t)*0.12, 22, t, false, pal);
      return;
    }
    const sp = Math.hypot(e.vx, e.vy);
    if(sp > 0.05) e.dir = (e.dirSet ? lerpAngle(e.dir, Math.atan2(e.vy, e.vx), 0.15) : Math.atan2(e.vy, e.vx));
    e.dirSet = true;
    drawCreature(entG, e.kind, e.x, e.y + Math.sin(t*1.5)*2, e.dir || 0, 20, t, false, pal);
  }

  function drawBoss(b, now){
    const t = now*0.004, flash = b.hit > 0;
    if(b.state === 'wind'){                                     // telegraph ring (purple = it is about to blink)
      entG.lineStyle(3, b.atk === 'blink' ? 0xd59bff : 0xff4a4a, 0.35 + 0.35*Math.sin(now*0.03));
      entG.drawCircle(b.x, b.y, b.r + 16); entG.lineStyle(0);
    }
    if(b.elite && b.phase === 3){                               // enraged: a slow red pulse
      entG.lineStyle(2, 0xff3a3a, 0.2 + 0.15*Math.sin(now*0.01));
      entG.drawCircle(b.x, b.y, b.r + 8 + Math.sin(now*0.01)*4); entG.lineStyle(0);
    }
    if(b.shieldT > 0){                                          // bubble shield: nothing damages it
      const k = clamp(b.shieldT/30, 0, 1), fl = 0.5 + 0.5*Math.sin(now*0.02);
      entG.lineStyle(4, 0x9be8ff, (0.45 + 0.25*fl)*k); entG.drawCircle(b.x, b.y, b.r + 28);
      entG.lineStyle(2, 0xffffff, 0.3*k); entG.drawCircle(b.x, b.y, b.r + 38 + fl*3);
      entG.lineStyle(0); entG.beginFill(0x9be8ff, 0.06*k); entG.drawCircle(b.x, b.y, b.r + 28); entG.endFill();
    }
    if(b.kind === 'shark'){
      bossG.visible = true; bossG.x = b.x; bossG.y = b.y; bossG.rotation = b.ang;
      const cols = flash ? { body:0xffffff, fin:0xffffff } : (b.cols || SHARK_COLORS);
      drawFishShape(bossG, b.r*0.9, cols, t*3.2, b.state === 'charge' ? 1 : 0.45, Math.sin(t)*0.2);
      return;
    }
    bossG.visible = false;
    const S = (BOSS_SCALE[b.kind] || 0.9)*b.r;
    let ang = b.ang;
    if(b.kind === 'ghostship'){ if(Math.abs(b.vx) > 0.25) b.face = b.vx > 0 ? 1 : -1; else if(!b.face) b.face = -1; ang = b.face > 0 ? 0 : Math.PI; }
    else if(b.kind === 'jelly') ang = -Math.PI/2 + Math.sin(t)*0.12;
    drawCreature(entG, b.kind, b.x, b.y, ang, S, t, flash, b.pal);
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
      entG.beginFill(0xffffff, 0.9); entG.drawCircle(p.x, p.y, 6); entG.endFill();
      entG.beginFill(d.accent, 0.25); entG.drawCircle(p.x, p.y, 16 + Math.sin(now*0.005 + p.x)*3); entG.endFill();
    }
    if(M.orbOn){
      const o = M.orb, pu = 0.5 + 0.5*Math.sin(now*0.004);
      for(let i=3;i>=1;i--){ entG.beginFill(d.accent, 0.08*i); entG.drawCircle(o.x, o.y, 22 + i*14 + pu*8); entG.endFill(); }
      entG.beginFill(0xffffff); entG.drawCircle(o.x, o.y, 12); entG.endFill();
      entG.lineStyle(3, d.accent, 0.9); entG.drawCircle(o.x, o.y, 26); entG.lineStyle(0);
    }
    if(M.ink){
      const k = clamp(M.ink.life/60, 0, 1);
      for(let i=0;i<7;i++){
        const a = i*0.9 + now*0.0004*(i%2 ? 1 : -1), rr = i === 0 ? 0 : M.ink.r*0.5;
        entG.beginFill(0x1a0f2e, 0.22*k); entG.drawCircle(M.ink.x + Math.cos(a)*rr, M.ink.y + Math.sin(a)*rr, M.ink.r*(i === 0 ? 0.8 : 0.55)); entG.endFill();
      }
      entG.lineStyle(2, 0x8a6aff, 0.25*k); entG.drawCircle(M.ink.x, M.ink.y, M.ink.r); entG.lineStyle(0);
    }
    if(M.vortex){
      const V = M.vortex, k = clamp(V.life/40, 0, 1);
      for(let j=0;j<3;j++){
        entG.lineStyle(2.5, 0xcff6ff, 0.55*k);
        for(let i=0;i<=30;i++){
          const a = now*0.008 + j*2.1 + i*0.3, r = 8 + i*5, px = V.x + Math.cos(a)*r, py = V.y + Math.sin(a)*r;
          if(i) entG.lineTo(px, py); else entG.moveTo(px, py);
        }
      }
      entG.lineStyle(0);
    }
    for(const e of M.guards) drawEnemy(e, now);
    if(!M.boss.dead) drawBoss(M.boss, now); else bossG.visible = false;
    for(const p of M.shots){
      entG.lineStyle({ width:2.5, color:p.home ? 0xff7ad9 : 0xff6b6b, alpha:0.95, ...ROUND }); entG.drawCircle(p.x, p.y, p.home ? 12 : 10);
      entG.lineStyle(0); entG.beginFill(p.home ? 0xffd0f2 : 0xffb3b3, 0.9); entG.drawCircle(p.x, p.y, 3.5); entG.endFill();
    }
    for(const p of M.bubs){
      entG.lineStyle(p.big ? 4 : 2, p.pierce ? 0xffd36a : 0xcff6ff, 0.9);
      entG.drawCircle(p.x, p.y, p.r || 7);
    }
    for(const f of M.fx){
      const k = 1 - f.life/f.max;
      if(f.type === 'ring'){ entG.lineStyle(4*(1 - k) + 1, f.col, 0.8*(1 - k)); entG.drawCircle(f.x, f.y, f.r1*k); }
      else if(f.type === 'wave'){
        entG.lineStyle(10*(1 - k) + 2, 0x9be8ff, 0.7*(1 - k)); entG.drawCircle(f.x, f.y, f.r1*k);
        entG.lineStyle(4, 0xffffff, 0.5*(1 - k)); entG.drawCircle(f.x, f.y, f.r1*k*0.92);
      } else if(f.type === 'bolt'){
        entG.lineStyle(3, 0xfff6a0, 0.95*(1 - k)); entG.moveTo(f.x0, f.y0);
        const n = 8, dx = f.x1 - f.x0, dy = f.y1 - f.y0, len = Math.hypot(dx, dy) || 1;
        for(let i=1;i<n;i++){ const j = (Math.random() - 0.5)*30; entG.lineTo(f.x0 + dx*i/n - dy/len*j, f.y0 + dy*i/n + dx/len*j); }
        entG.lineTo(f.x1, f.y1);
      }
    }
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
    const wasGhost = TM.ghost > 0;
    for(const id of TIMED){ if(TM[id] > 0) TM[id] -= dt; if(CD[id] > 0) CD[id] -= dt; }
    if(wasGhost && TM.ghost <= 0 && active && M) unstick();

    updateUpgradeOffer(dt);
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
  function eatMul(){ return TM.magnet > 0 ? 1.7 : 1; }          // Pearl Magnet widens your bite in open water too
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
      TIMED.forEach(id => { TM[id] = 0; CD[id] = 0; });
      return [['Cave progress and abilities reset.', 'ok']];
    }
    if(sub === 'unlock'){
      save.cleared = DUNGEONS.map(d=>d.id); persist();
      return [['All abilities unlocked.', 'ok']];
    }
    if(sub === 'upgrades'){
      return [[`Upgrades: ${save.up.hearts}/${UP_CAP.hearts} hearts (${maxHp()} total), ${save.up.rate}/${UP_CAP.rate} bubble rate (${Math.round(rateMul()*100)}%), ${save.up.str}/${UP_CAP.str} strength (${Math.round(strMul()*100)}%). ${upOwed()} pick(s) waiting. One pick every 3 levels.`, 'info']];
    }
    if(sub === 'ready'){
      TIMED.forEach(id => { CD[id] = 0; }); dashCd = shieldCd = 0;
      return [['All ability cooldowns refreshed.', 'ok']];
    }
    const n = parseInt(sub, 10);
    if(n >= 1 && n <= DUNGEONS.length){
      if(active) exitDungeon();
      const d = DUNGEONS[n-1];
      const p = exitPos(d, 260); player.x = p.x; player.y = p.y; player.vx = player.vy = 0; enterCd = 120;
      return [[`Teleported beside ${d.name}.`, 'ok']];
    }
    const lines = [['Caves in order (/dungeon <1-20> teleports, exit, reset, unlock, ready, upgrades):', 'info']];
    for(const d of DUNGEONS){
      const ab = ABILITIES[d.ability], dx = d.x - player.x;
      const dir = Math.abs(dx) < 100 ? 'right here' : (dx > 0 ? 'east ' : 'west ') + Math.round(Math.abs(dx)/8) + ' m';
      const where = d.floatY ? `floating at ${Math.round(d.floatY/8)} m depth` : 'on the seafloor';
      lines.push([`${d.id}. ${d.legend ? '✦ ' : ''}${d.name} [${d.biome.name}]: ${dir}, ${where}. Boss: ${d.boss.name}. ${save.cleared.includes(d.id) ? '[cleared] ' : ''}-> ${ab.name} (${ab.key})`, 'info']);
    }
    return lines;
  }

  return {
    get active(){ return active; },
    get _state(){ return M; },
    get menuOpen(){ return menuOpen; },
    resetUpgrades,
    update, updatePlayer, handleKey, fire, look, speedMul, gravityMul, levelBonus, eatMul, depth, command, DUNGEONS
  };
};

})(window);
