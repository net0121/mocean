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

const world = new PIXI.Container();
const terrainG = new PIXI.Graphics();
const surfaceG = new PIXI.Graphics();
const bubblesG = new PIXI.Graphics();
const splashG = new PIXI.Graphics();
const creaturesLayer = new PIXI.Container();
const waterOverlayG = new PIXI.Graphics();

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
function hexToInt(hex){ return parseInt(hex.replace('#',''), 16); }

const ROUND = { cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND };

/* ============================= WORLD ============================= */

const SURFACE_Y = 0;
const WORLD_TOP_MARGIN = 40;
const AIR_HEIGHT = 600;
const AIR_TOP = SURFACE_Y - AIR_HEIGHT;
const GRAVITY = 0.15;
const FLIP_SPEED_THRESHOLD = 0.8;

const CYCLE_DURATION = 120000;
function getCycleTime(now){
  return (now % CYCLE_DURATION) / CYCLE_DURATION;
}

function floorY(x){
  return 8000
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

/* ============================= DYNAMIC CREATURE LOADER ============================= */

let dynamicCreatures = [];
let dynamicCreaturesLoaded = false;

async function loadDynamicCreatures(){
  try {
    const SUPABASE_URL = window.location.origin.includes('localhost') 
      ? '' 
      : (window.SUPABASE_URL || '');
    
    // Try to fetch from edge function
    let response = null;
    try {
      const funcUrl = `${SUPABASE_URL}/functions/v1/wikipedia-creatures?count=15`;
      response = await fetch(funcUrl, { 
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch(e) {
      // Fallback: generate locally
    }
    
    if (response && response.ok) {
      const data = await response.json();
      if (data.creatures && data.creatures.length > 0) {
        dynamicCreatures = data.creatures.map(c => ({
          name: c.name,
          type: c.type || 'swim',
          bodyColor: hexToInt(c.body_color || '#7fe8d4'),
          finColor: hexToInt(c.fin_color || '#bdfff0'),
          eyeColor: hexToInt(c.eye_color || '#08332b'),
          sizeMin: c.size_min || 10,
          sizeMax: c.size_max || 30,
          behavior: c.behavior || 'swim',
          depthMin: c.depth_min || 0,
          depthMax: c.depth_max || 7500,
          rarity: c.rarity || 1
        }));
        dynamicCreaturesLoaded = true;
        return;
      }
    }
  } catch(err) {
    console.log('Dynamic creature load failed, using fallback:', err);
  }
  
  // Fallback: generate from built-in extended list
  generateFallbackCreatures();
}

function generateFallbackCreatures(){
  const CREATURE_NAMES = [
    'Great white shark','Hammerhead shark','Whale shark','Manta ray','Stingray',
    'Green sea turtle','Leatherback sea turtle','Giant Pacific octopus','Blue-ringed octopus',
    'Box jellyfish','Moon jellyfish','Leafy seadragon','Weedy seadragon','Pygmy seahorse',
    'Clownfish','Angelfish','Parrotfish','Triggerfish','Pufferfish','Moray eel',
    'Electric eel','Garden eel','Cuttlefish','Giant squid','Colossal squid',
    'Lobster','King crab','Hermit crab','Fiddler crab','Starfish','Sea urchin',
    'Sea cucumber','Brain coral','Staghorn coral','Manatee','Dugong','Narwhal',
    'Beluga whale','Humpback whale','Blue whale','Sperm whale','Orca','Bottlenose dolphin',
    'Sea lion','Walrus','Salmon','Tuna','Swordfish','Marlin','Sailfish',
    'Barracuda','Coelacanth','Anglerfish','Viperfish','Fangtooth','Gulper eel',
    'Oarfish','Sunfish','Lionfish','Stonefish','Scorpionfish','Nudibranch',
    'Portuguese man o war','Giant isopod','Japanese spider crab','Coconut crab',
    'Blue crab','Ghost crab','Decorator crab','Yeti crab','Hoff crab',
    'Giant tube worm','Riftia','Dumbo octopus','Vampire squid','Firefly squid',
    'Blanket octopus','Chambered nautilus','Ram horn squid','Bobtail squid',
    'Flamboyant cuttlefish','Giant cuttlefish','Painted frogfish','Hairy frogfish',
    'Red-lipped batfish','Handfish','Sea moth','Trumpetfish','Seahorse',
    'Dwarf seahorse','Lined seahorse','Tiger tail seahorse','Crowned seahorse',
    'Bargibant pygmy seahorse','Satomi pygmy seahorse','Japanese spider crab',
    'Tasmanian giant crab','Snow crab','Red king crab','Dungeness crab',
    'European green crab','Horseshoe crab','Limulus','Terrestrial hermit crab',
    'Soft-shell crab','Sand bubbler crab','Soldier crab','Box crab',
    'Spider crab','Majidae','Great Barrier Reef coral','Kelp forest fish',
    'Sargasso Sea creature','Mariana Trench dweller','Hydrothermal vent worm',
    'Cold seep mussel','Whale fall scavenger','Seagrass meadow fish',
    'Mangrove forest crab','Tide pool sculpin','Rocky shore starfish',
    'Sandy beach clam','Pelagic zone jelly','Benthic zone snailfish',
    'Abyssal plain holothurian','Bathyal zone rattail','Hadal zone amphipod',
    'Mesopelagic zone lanternfish','Epipelagic zone tuna','Bioluminescent plankton',
    'Cleaner wrasse','Remora','Pilot fish','Mandarinfish','Discus fish',
    'Arowana','Arapaima','Wels catfish','Mekong giant catfish',
    'Electric ray','Torpedo ray','Skate','Sawfish','Sawshark',
    'Thresher shark','Basking shark','Megamouth shark','Greenland shark',
    'Sixgill shark','Porbeagle','Mako shark','Silky shark',
    'Oceanic whitetip shark','Blacktip reef shark','Epaulette shark',
    'Bamboo shark','Zebra shark','Leopard shark','Port Jackson shark',
    'Spotted ratfish','Chimaera','Rabbitfish','Foxface','Leafy seadragon',
    'Ribboned pipefish','Ghost pipefish','Big-belly seahorse',
    'Great seahorse','Pacific seahorse','Spiny seahorse',
    'Short-snouted seahorse','Long-snouted seahorse',
    'Northern seahorse','Southern seahorse','Denise pygmy seahorse',
    'Walea pygmy seahorse','Pontoh pygmy seahorse','Severnsi pygmy seahorse',
    'Hippocampus nalu','Queen crab','Golden king crab','Scarlet king crab',
    'Rock crab','Jonah crab','Peekytoe crab','Atlantic rock crab',
    'Shore crab','Carcinus','Tachypleus','Birgus latro',
    'Giant hermit crab','Callinectes','Chesapeake blue crab',
    'Peeler crab','Uca','Ocypode','Calappa','Mola mola',
    'Flying fish','Opah','Lancetfish','Hatchetfish','Dragonfish',
    'Loosejaw','Stoplight loosejaw','Marine hatchetfish',
    'Giant oarfish','Regalecus','Pelican eel','Umbrella mouth gulper',
    'Humpback anglerfish','Deep sea anglerfish','Atolla jellyfish',
    'Deepstaria','Crown jellyfish','Cosmic jellyfish','Dinochelus',
    'Kiwa','Lamellibrachia','Cirroteuthis','Grimpoteuthis',
    'Vampyroteuthis','Cock-eyed squid','Japetella','Bolitaena',
    'Glass octopus','Tremoctopus','Argonaut','Paper nautilus',
    'Allonautilus','Spirula','Sepiola','Euprymna','Watasenia',
    'Sparkling enope squid','Jumbo squid','Humboldt squid',
    'Dosidicus','Architeuthis','Mesonychoteuthis',
    'Longfin inshore squid','Shortfin squid','Caribbean reef squid',
    'Bigfin reef squid','Dumpling squid','Southern bobtail squid',
    'Pfeffer flamboyant cuttlefish','European common cuttlefish',
    'Pharaoh cuttlefish','Sepia apama','Striped pyjama squid',
    'Stumpy-spined cuttlefish','Mourning cuttlefish','Sargassum frogfish',
    'Giant frogfish','Warty frogfish','Clown frogfish',
    'Psychedelic frogfish','Striated frogfish','Longlure frogfish',
    'Ocellated frogfish','Rosy-lipped batfish','Spotted handfish',
    'Red handfish','Warty prowfish','Australian prowfish',
    'Pegasus','Little dragonfish','Cornetfish','Flute mouth',
    'Sea pony','Knysna seahorse','Three-spot seahorse',
    'Japanese seahorse','Kellogg seahorse','Hedgehog seahorse',
    'Hippocampus nalu','Macrocheira','Queen crab','Snow crab',
    'Red king crab','Blue king crab','Golden king crab',
    'Scarlet king crab','Dungeness crab','Rock crab','Jonah crab',
    'Peekytoe crab','Atlantic rock crab','European green crab',
    'Shore crab','Carcinus','Limulus','Tachypleus','Birgus latro',
    'Giant hermit crab','Terrestrial hermit crab','Callinectes',
    'Chesapeake blue crab','Soft-shell crab','Peeler crab',
    'Uca','Ocypode','Sand bubbler crab','Soldier crab',
    'Calappa','Majidae','Great Barrier Reef','Coral reef fish',
    'Kelp forest dweller','Sargasso Sea creature',
    'Mariana Trench fish','Challenger Deep amphipod',
    'Hydrothermal vent creature','Cold seep tubeworm',
    'Brine pool shrimp','Whale fall hagfish','Wood fall bivalve',
    'Kelp holdfast isopod','Seagrass meadow pipefish',
    'Mangrove forest juvenile','Salt marsh killifish',
    'Tide pool blenny','Rocky shore chiton','Sandy beach mole crab',
    'Pelagic zone sunfish','Benthic zone sea pen',
    'Abyssal plain sea cucumber','Bathyal zone grenadier',
    'Hadal zone snailfish','Mesopelagic zone bristlemouth',
    'Epipelagic zone mahi-mahi','Photic zone reef fish',
    'Aphotic zone tripod fish','Oceanic trench cusk-eel',
    'Submarine canyon rockfish','Seamount coral','Guyot sponge',
    'Atoll parrotfish','Coral island reef shark'
  ];
  
  // Shuffle and pick 20
  const shuffled = CREATURE_NAMES.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 20);
  
  dynamicCreatures = selected.map((name, idx) => {
    const hash = Math.abs(name.split('').reduce((a,c) => ((a<<5)-a)+c.charCodeAt(0), 0));
    const behaviors = ['swim','hover','crawl','jet','glide','wiggle','pulse','drift','dash','school'];
    const hue1 = hash % 360;
    const hue2 = (hash * 7) % 360;
    const hue3 = (hash * 13) % 360;
    const sat = 50 + (hash % 40);
    const l1 = 40 + (hash % 30);
    const l2 = 60 + (hash % 25);
    const l3 = 80 + (hash % 15);
    
    const hslToHex = (h,s,l) => {
      h = h % 360; s = Math.min(100, Math.max(0, s)); l = Math.min(100, Math.max(0, l));
      const c = (1 - Math.abs(2*l/100 - 1)) * s/100;
      const x = c * (1 - Math.abs((h/60)%2 - 1));
      const m = l/100 - c/2;
      let r=0,g=0,b=0;
      if(h<60){r=c;g=x;}else if(h<120){r=x;g=c;}else if(h<180){g=c;b=x;}
      else if(h<240){g=x;b=c;}else if(h<300){r=x;b=c;}else{r=c;b=x;}
      const toHex = (n) => Math.round((n+m)*255).toString(16).padStart(2,'0');
      return parseInt(`${toHex(r)}${toHex(g)}${toHex(b)}`, 16);
    };
    
    const sizeBase = 10 + (hash % 25);
    const depthBase = (hash % 8) * 1000;
    
    return {
      name: name,
      type: behaviors[hash % behaviors.length],
      bodyColor: hslToHex(hue1, sat, l1),
      finColor: hslToHex(hue2, sat, l2),
      eyeColor: hslToHex(hue3, 30 + (hash % 20), l3),
      sizeMin: sizeBase,
      sizeMax: sizeBase + 10 + (hash % 15),
      behavior: behaviors[hash % behaviors.length],
      depthMin: depthBase,
      depthMax: depthBase + 2000 + (hash % 3000),
      rarity: 1 + (hash % 5)
    };
  });
  
  dynamicCreaturesLoaded = true;
}

// Start loading immediately
loadDynamicCreatures();

/* ============================= PROCEDURAL CREATURE RENDERING ============================= */

function spawnDynamicCreature(def, x, y){
  const g = new PIXI.Graphics();
  creaturesLayer.addChild(g);
  attachHoverLabel(g, def.name, def.sizeMax * 1.2);
  
  const size = rand(def.sizeMin, def.sizeMax);
  const behavior = def.behavior;
  
  const base = {
    type: 'dynamic',
    def: def,
    x, y,
    vx: 0, vy: 0,
    angle: 0, displayAngle: 0,
    phase: rand(0, Math.PI*2),
    tailPhase: rand(0, Math.PI*2),
    size: size,
    g: g
  };
  
  switch(behavior){
    case 'swim':
    case 'dash':
    case 'school':
      return {
        ...base,
        targetX: x + rand(-400, 400),
        targetY: clamp(y + rand(-200, 200), def.depthMin, def.depthMax),
        retarget: rand(150, 350),
        speed: behavior === 'dash' ? rand(1.5, 2.5) : rand(0.6, 1.4),
        update: updateSwimmingDynamic
      };
    case 'hover':
    case 'pulse':
      return {
        ...base,
        baseY: y,
        driftPhase: rand(0, Math.PI*2),
        update: updateHoveringDynamic
      };
    case 'crawl':
      return {
        ...base,
        dir: Math.random() < 0.5 ? -1 : 1,
        walkPhase: rand(0, Math.PI*2),
        pauseTimer: rand(60, 180),
        update: updateCrawlingDynamic
      };
    case 'jet':
      return {
        ...base,
        targetX: x + rand(-350, 350),
        targetY: clamp(y + rand(-180, 180), def.depthMin, def.depthMax),
        retarget: rand(180, 360),
        jetTimer: rand(60, 160),
        jetPower: 0,
        update: updateJettingDynamic
      };
    case 'glide':
      return {
        ...base,
        targetX: x + rand(-600, 600),
        targetY: clamp(y + rand(-150, 150), def.depthMin, def.depthMax),
        retarget: rand(220, 420),
        wingPhase: rand(0, Math.PI*2),
        update: updateGlidingDynamic
      };
    case 'wiggle':
    case 'drift':
      return {
        ...base,
        targetX: x + rand(-300, 300),
        vxBase: Math.random() < 0.5 ? -1 : 1,
        phase: rand(0, Math.PI*2),
        update: updateWigglingDynamic
      };
    default:
      return {
        ...base,
        targetX: x + rand(-400, 400),
        targetY: clamp(y + rand(-200, 200), def.depthMin, def.depthMax),
        retarget: rand(150, 350),
        speed: rand(0.6, 1.4),
        update: updateSwimmingDynamic
      };
  }
}

function updateSwimmingDynamic(c, dt){
  c.retarget -= dt;
  if(c.retarget <= 0){
    c.targetX = c.x + rand(-450, 450);
    c.targetY = clamp(c.y + rand(-250, 250), c.def.depthMin, c.def.depthMax);
    c.retarget = rand(160, 380);
  }
  const dx = c.targetX - c.x, dy = c.targetY - c.y;
  const d = Math.hypot(dx, dy) || 1;
  c.vx = lerp(c.vx, (dx/d) * c.speed, 0.012 * dt);
  c.vy = lerp(c.vy, (dy/d) * c.speed, 0.012 * dt);
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.y = clamp(c.y, c.def.depthMin, c.def.depthMax);
  
  const speed = Math.hypot(c.vx, c.vy);
  if(speed > 0.05) c.angle = Math.atan2(c.vy, c.vx);
  c.displayAngle = lerpAngle(c.displayAngle, c.angle, 0.04 * dt);
  c.tailPhase += 0.1 * dt * (1 + speed * 0.3);
  
  c.g.x = c.x; c.g.y = c.y; c.g.rotation = c.displayAngle;
  redrawDynamicCreature(c);
}

function updateHoveringDynamic(c, dt){
  c.phase += 0.025 * dt;
  c.driftPhase += 0.006 * dt;
  c.y = clamp(c.baseY + Math.sin(c.driftPhase) * 45, c.def.depthMin, c.def.depthMax);
  c.x += Math.sin(c.driftPhase * 1.3) * 0.25 * dt;
  
  c.g.x = c.x; c.g.y = c.y;
  redrawDynamicCreature(c);
}

function updateCrawlingDynamic(c, dt){
  c.pauseTimer -= dt;
  if(c.pauseTimer <= 0){
    if(Math.random() < 0.5) c.dir *= -1;
    c.pauseTimer = rand(60, 220);
  }
  c.x += c.dir * 0.5 * dt;
  c.walkPhase += 0.25 * dt;
  
  const fy = floorY(c.x);
  c.y = fy - c.size * 0.3;
  c.g.x = c.x; c.g.y = c.y;
  c.g.scale.x = c.dir < 0 ? -1 : 1;
  redrawDynamicCreature(c);
}

function updateJettingDynamic(c, dt){
  c.retarget -= dt;
  c.jetTimer -= dt;
  if(c.retarget <= 0){
    c.targetX = c.x + rand(-400, 400);
    c.targetY = clamp(c.y + rand(-200, 200), c.def.depthMin, c.def.depthMax);
    c.retarget = rand(200, 400);
  }
  if(c.jetTimer <= 0){
    const dx = c.targetX - c.x, dy = c.targetY - c.y, d = Math.hypot(dx, dy) || 1;
    c.vx += (dx/d) * 2.5;
    c.vy += (dy/d) * 2.5;
    c.jetPower = 1;
    c.jetTimer = rand(70, 150);
  }
  c.vx *= Math.pow(0.9, dt);
  c.vy *= Math.pow(0.9, dt);
  c.x += c.vx * dt; c.y += c.vy * dt;
  c.y = clamp(c.y, c.def.depthMin, c.def.depthMax);
  c.jetPower = lerp(c.jetPower, 0, 0.05 * dt);
  
  const speed = Math.hypot(c.vx, c.vy);
  if(speed > 0.05) c.angle = Math.atan2(c.vy, c.vx);
  c.displayAngle = lerpAngle(c.displayAngle, c.angle, 0.04 * dt);
  c.phase += 0.08 * dt * (1 + c.jetPower);
  
  c.g.x = c.x; c.g.y = c.y; c.g.rotation = c.displayAngle;
  redrawDynamicCreature(c);
}

function updateGlidingDynamic(c, dt){
  c.retarget -= dt;
  if(c.retarget <= 0){
    c.targetX = c.x + rand(-700, 700);
    c.targetY = clamp(c.y + rand(-180, 180), c.def.depthMin, c.def.depthMax);
    c.retarget = rand(240, 460);
  }
  const dx = c.targetX - c.x, dy = c.targetY - c.y;
  const d = Math.hypot(dx, dy) || 1;
  c.vx = lerp(c.vx, (dx/d) * 1.2, 0.008 * dt);
  c.vy = lerp(c.vy, (dy/d) * 1.2, 0.008 * dt);
  c.x += c.vx * dt; c.y += c.vy * dt;
  c.angle = Math.atan2(c.vy, c.vx);
  c.displayAngle = lerpAngle(c.displayAngle, c.angle, 0.02 * dt);
  c.wingPhase += 0.07 * dt;
  
  c.g.x = c.x; c.g.y = c.y; c.g.rotation = c.displayAngle;
  redrawDynamicCreature(c);
}

function updateWigglingDynamic(c, dt){
  const dx = c.targetX - c.x;
  if(Math.abs(dx) < 20){
    c.targetX = c.x + rand(150, 300) * (Math.random() < 0.5 ? -1 : 1);
  }
  c.vx = lerp(c.vx, Math.sign(dx) * 0.7, 0.01 * dt);
  c.x += c.vx * dt;
  const desiredY = clamp(floorY(c.x) - 40, c.def.depthMin, c.def.depthMax);
  c.y = lerp(c.y, desiredY, 0.02 * dt);
  c.phase += 0.1 * dt;
  
  c.g.x = c.x; c.g.y = c.y;
  c.g.scale.x = c.vx < 0 ? -1 : 1;
  redrawDynamicCreature(c);
}

function redrawDynamicCreature(c){
  const g = c.g;
  g.clear();
  const s = c.size;
  const def = c.def;
  const behavior = def.behavior;
  
  // Procedural body shape based on behavior
  switch(behavior){
    case 'swim':
    case 'dash':
    case 'school':
      drawFishBody(g, s, def, c.tailPhase, c);
      break;
    case 'hover':
    case 'pulse':
      drawJellyBody(g, s, def, c.phase);
      break;
    case 'crawl':
      drawCrawlBody(g, s, def, c.walkPhase);
      break;
    case 'jet':
      drawJetBody(g, s, def, c.phase, c.jetPower || 0);
      break;
    case 'glide':
      drawGlideBody(g, s, def, c.wingPhase);
      break;
    case 'wiggle':
    case 'drift':
      drawWiggleBody(g, s, def, c.phase);
      break;
    default:
      drawFishBody(g, s, def, c.tailPhase, c);
  }
}

function drawFishBody(g, s, def, tailPhase, c){
  const bodyColor = def.bodyColor;
  const finColor = def.finColor;
  const eyeColor = def.eyeColor;
  
  // Tail
  const wag = Math.sin(tailPhase) * s * 0.3;
  g.lineStyle({ width: Math.max(1.4, s*0.08), color: finColor, ...ROUND });
  g.moveTo(-s*0.8, 0);
  g.lineTo(-s*1.4, -s*0.3 + wag);
  g.lineTo(-s*1.5, s*0.1 + wag);
  g.lineTo(-s*0.85, s*0.15);
  
  // Body
  g.lineStyle({ width: Math.max(1.6, s*0.1), color: bodyColor, ...ROUND });
  g.drawEllipse(0, 0, s*0.9, s*0.5);
  
  // Dorsal fin
  const finWag = Math.sin(tailPhase * 1.3) * s * 0.05;
  g.lineStyle({ width: Math.max(1.2, s*0.07), color: finColor, ...ROUND });
  g.moveTo(-s*0.1, -s*0.45);
  g.quadraticCurveTo(s*0.1, -s*0.7 + finWag, s*0.3, -s*0.4);
  
  // Pectoral fin
  const row = Math.sin(tailPhase + 1.4) * 0.4 + 0.2;
  g.moveTo(s*0.2, s*0.1);
  g.quadraticCurveTo(s*0.05 + row*s*0.1, s*0.55, -s*0.15, s*0.42 + row*s*0.15);
  
  // Eye
  g.lineStyle(1.3, eyeColor);
  g.drawCircle(s*0.45, -s*0.08, Math.max(1.2, s*0.07));
}

function drawJellyBody(g, s, def, phase){
  const pulse = 1 + Math.sin(phase * 3) * 0.18;
  const bodyColor = def.bodyColor;
  
  g.lineStyle(1.6, bodyColor, 0.8);
  g.moveTo(-s*pulse, 0);
  g.quadraticCurveTo(-s*0.7*pulse, -s*0.95, 0, -s*0.95);
  g.quadraticCurveTo(s*0.7*pulse, -s*0.95, s*pulse, 0);
  g.quadraticCurveTo(0, s*0.35, -s*pulse, 0);
  
  const tentacles = 4 + Math.floor(Math.abs(def.name.length) % 3);
  for(let i=0; i<tentacles; i++){
    const tx = lerp(-s*0.8, s*0.8, i/(tentacles-1));
    g.lineStyle(1.6, bodyColor, 0.5);
    g.moveTo(tx, s*0.2);
    for(let seg=1; seg<=4; seg++){
      const ny = s*0.2 + seg*s*0.45;
      const nx = tx + Math.sin(phase*4 + i + seg)*s*0.22;
      g.lineTo(nx, ny);
    }
  }
}

function drawCrawlBody(g, s, def, walkPhase){
  const bodyColor = def.bodyColor;
  const legSwing = Math.sin(walkPhase) * 0.35;
  
  g.lineStyle({ width: Math.max(1.3, s*0.13), color: bodyColor, ...ROUND });
  g.drawEllipse(0, 0, s, s*0.62);
  
  // Legs
  for(let i=0; i<3; i++){
    const lx = lerp(-s*0.7, s*0.7, i/2);
    const sw = Math.sin(walkPhase + i*1.3) * s*0.4;
    g.moveTo(lx, s*0.4);
    g.lineTo(lx + sw*0.4, s*0.95 + Math.abs(sw)*0.2);
  }
  
  // Eyes
  g.lineStyle(1.2, def.eyeColor);
  g.drawCircle(s*0.3, -s*0.1, Math.max(1, s*0.06));
}

function drawJetBody(g, s, def, phase, jetPower){
  const bodyColor = def.bodyColor;
  const squish = 1 - jetPower * 0.25;
  
  // Tentacles
  const n = 6;
  for(let i=0; i<n; i++){
    const by = lerp(-s*0.55, s*0.55, i/(n-1));
    g.lineStyle({ width: Math.max(1.2, s*0.06), color: bodyColor, alpha:0.85, ...ROUND });
    g.moveTo(-s*0.3, by*0.5);
    for(let seg=1; seg<=3; seg++){
      const t = seg/3;
      const wob = Math.sin(phase + i*0.7 + seg) * s*0.25*(1+jetPower);
      g.lineTo(-s*(0.5+t*0.9), by + wob);
    }
  }
  
  // Body
  g.lineStyle({ width: Math.max(1.6, s*0.09), color: bodyColor, ...ROUND });
  g.drawEllipse(0, 0, s*squish, s*0.85);
  
  // Eyes
  g.lineStyle(1.2, def.eyeColor);
  g.drawCircle(s*0.3, -s*0.25, Math.max(1, s*0.08));
  g.drawCircle(s*0.3, s*0.25, Math.max(1, s*0.08));
}

function drawGlideBody(g, s, def, wingPhase){
  const bodyColor = def.bodyColor;
  const wing = Math.sin(wingPhase) * s * 0.3;
  
  g.lineStyle({ width: Math.max(1.6, s*0.08), color: bodyColor, ...ROUND });
  g.moveTo(s*0.9, 0);
  g.quadraticCurveTo(s*0.2, -s*0.9+wing, -s*0.7, -s*0.15);
  g.quadraticCurveTo(-s*0.3, 0, -s*0.7, s*0.15);
  g.quadraticCurveTo(s*0.2, s*0.9-wing, s*0.9, 0);
  
  // Tail
  g.lineStyle({ width: Math.max(1, s*0.04), color: bodyColor, alpha:0.8 });
  g.moveTo(-s*0.5, 0);
  g.lineTo(-s*1.6, Math.sin(wingPhase*1.5)*s*0.2);
  
  // Eyes
  g.lineStyle(1.2, def.eyeColor);
  g.drawCircle(s*0.45, -s*0.1, Math.max(1, s*0.05));
  g.drawCircle(s*0.45, s*0.1, Math.max(1, s*0.05));
}

function drawWiggleBody(g, s, def, phase){
  const bodyColor = def.bodyColor;
  const segs = 5 + Math.floor(Math.abs(def.name.length) % 4);
  
  g.lineStyle({ width: Math.max(1.6, s*0.16), color: bodyColor, ...ROUND });
  g.moveTo(s*1.1, 0);
  for(let i=1; i<=segs; i++){
    const t = i/segs;
    const nx = s*1.1 - t*s*2.4;
    const ny = Math.sin(phase*3 - t*5) * s*0.35*t;
    g.lineTo(nx, ny);
  }
  
  g.lineStyle(1.2, def.eyeColor);
  g.drawCircle(s*1.05, 0, Math.max(1, s*0.07));
}

/* ============================= DEBUG MODE ============================= */

let debugMode = false;
const debugDisplay = document.createElement('div');
debugDisplay.id = 'debug-display';
debugDisplay.style.cssText = `
  position: fixed;
  top: 100px;
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
  const timeOfDay = cycleTime < 0.5 ? 'DAY' : 'NIGHT';
  const brightness = cycleTime < 0.5 ? (1 - cycleTime*2) : (cycleTime*2 - 1);
  debugDisplay.innerHTML = `
    X: ${Math.round(player.x)}<br>
    Y: ${Math.round(player.y)}<br>
    VX: ${player.vx.toFixed(2)}<br>
    VY: ${player.vy.toFixed(2)}<br>
    Depth: ${Math.max(0, Math.round((player.y - SURFACE_Y)/8))}m<br>
    <br>
    Time: ${timeOfDay}<br>
    Cycle: ${(cycleTime*100).toFixed(1)}%<br>
    Brightness: ${(brightness*100).toFixed(1)}%<br>
    Dynamic: ${dynamicCreatures.length}
  `;
}

/* ============================= GAME / UI STATE ============================= */

let gameStarted = false;
let commandOpen = false;

/* ============================= INPUT ============================= */

const keys = { up:false, down:false, left:false, right:false, space:false };

window.addEventListener('keydown', (e)=>{
  if(commandOpen) return;
  if(gameStarted && e.key === '/'){
    e.preventDefault();
    openCommandPrompt();
    return;
  }
  if(!gameStarted) return;
  switch(e.key){
    case 'ArrowUp': keys.up=true; e.preventDefault(); break;
    case 'ArrowDown': keys.down=true; e.preventDefault(); break;
    case 'ArrowLeft': keys.left=true; e.preventDefault(); break;
    case 'ArrowRight': keys.right=true; e.preventDefault(); break;
    case ' ': keys.space=true; e.preventDefault(); break;
  }
  hideInstructions();
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
  hideInstructions();
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

/* ============================= FISH SHAPE (shared by player, schools, sharks) ============================= */

function drawFishShape(g, size, colors, tailPhase, speedFrac, bank){
  g.clear();
  const s = size;
  const speed = clamp(speedFrac, 0, 1);

  const wagAmp = 0.30 + speed*0.55;
  const waveAt = (xFrac, lag) => Math.sin(tailPhase - lag + xFrac*1.6) * wagAmp;

  const wagMid = waveAt(0.55, 0);
  const wagJoint = waveAt(0.85, 0.55);
  const wagTip = waveAt(1.0, 1.05);

  const bodyWave = Math.sin(tailPhase*0.5) * s * 0.045 * (0.35 + speed);
  const stretch = 1 + speed*0.07;

  const baseX = -s*0.85;
  const jointX = -s*1.3*stretch, jointY = wagJoint*s*0.62;
  const tipX = -s*1.95*stretch, tipY = wagJoint*s*0.62 + wagTip*s*0.95;
  g.beginFill(colors.fin, 0.92);
  g.moveTo(baseX, -s*0.16 + wagMid*s*0.08);
  g.quadraticCurveTo(jointX, jointY - s*0.24, tipX, tipY - s*0.05);
  g.quadraticCurveTo(jointX, jointY + s*0.24, baseX, s*0.16 + wagMid*s*0.08);
  g.closePath();
  g.endFill();

  g.lineStyle({ width: Math.max(1.6, s*0.085), color: colors.body, ...ROUND });
  g.moveTo(s*1.0*stretch, 0);
  g.quadraticCurveTo(
    s*0.5, -s*0.60 + bodyWave*0.4 + wagMid*s*0.10,
    -s*0.85, -s*0.30 + bank*s*0.15 + bodyWave + wagJoint*s*0.12
  );
  g.quadraticCurveTo(-s*1.05, bodyWave + wagJoint*s*0.12, -s*0.85, s*0.30 - bank*s*0.15 + bodyWave + wagJoint*s*0.12);
  g.quadraticCurveTo(s*0.5, s*0.62 + bodyWave*0.4 + wagMid*s*0.10, s*1.0*stretch, 0);

  const ridgeFlutter = Math.sin(tailPhase*1.3) * 0.12;
  g.lineStyle({ width: Math.max(1.4, s*0.07), color: colors.fin, ...ROUND });
  g.moveTo(-s*0.22, -s*0.34 + bodyWave*0.5 + wagMid*s*0.08);
  g.quadraticCurveTo(
    -s*0.05, -s*0.50 + ridgeFlutter*s*0.10 + wagMid*s*0.08,
    s*0.16, -s*0.36 + bodyWave*0.3 + wagMid*s*0.06
  );

  const row = Math.sin(tailPhase + 1.4) * 0.4 + 0.2;
  g.moveTo(s*0.18, s*0.12);
  g.quadraticCurveTo(s*0.05 + row*s*0.1, s*0.55, -s*0.15, s*0.42 + row*s*0.15);

  g.lineStyle({ width: 1.3, color: colors.eye });
  g.drawCircle(s*0.62*stretch, -s*0.08, Math.max(1.2, s*0.07));
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
  bob: 0,
  bank: 0,
  inAir: false,
  flipping: false,
  flipProgress: 0,
  flipDir: 1
};
const PLAYER_COLORS = { body:0xff9d5c, fin:0xffd194, eye:0xfff4e6 };

function updatePlayer(dt){
  const wasUnderwater = player.y >= SURFACE_Y;

  let ax = 0, ay = 0;
  if(gameStarted){
    if(keys.left) ax -= player.accel;
    if(keys.right) ax += player.accel;
    if(keys.up) ay -= player.accel;
    if(keys.down) ay += player.accel;
  } else {
    const t = performance.now()*0.00006;
    ax = Math.sin(t)*player.accel*0.35;
    ay = Math.cos(t*0.7)*player.accel*0.22;
  }

  if(ax !== 0 && ay !== 0){ ax *= 0.78; ay *= 0.78; }

  const inAir = player.y < SURFACE_Y;

  if(inAir){
    ax *= 0.45;
    ay = ay*0.25 + GRAVITY;
  }

  player.vx += ax * dt;
  player.vy += ay * dt;

  if(inAir){
    player.vx *= Math.pow(0.995, dt);
  } else {
    player.vx *= Math.pow(player.drag, dt);
    player.vy *= Math.pow(player.drag, dt);
  }

  const rawSpeed = Math.hypot(player.vx, player.vy);
  const maxS = inAir ? player.maxSpeed*1.8 : player.maxSpeed;
  if(rawSpeed > maxS){
    const k = maxS / rawSpeed;
    player.vx *= k; player.vy *= k;
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  if(player.y < AIR_TOP){ player.y = AIR_TOP; if(player.vy < 0) player.vy = 0; }

  const nowUnderwater = player.y >= SURFACE_Y;

  if(wasUnderwater !== nowUnderwater){
    spawnSplash(player.x, SURFACE_Y);
    if(wasUnderwater && !nowUnderwater && player.vy < -FLIP_SPEED_THRESHOLD && !player.flipping){
      player.flipping = true;
      player.flipProgress = 0;
      player.flipDir = player.vx >= 0 ? 1 : -1;
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
    }
  }

  const angleDiff = ((player.angle - player.displayAngle + Math.PI) % (Math.PI*2)) - Math.PI;
  player.bank = clamp(angleDiff * 1.8, -1, 1);

  const moveFactor = 0.5 + Math.min(speed/player.maxSpeed, 1)*1.85;
  player.tailPhase += 0.155*dt*moveFactor*6;
  player.bob = inAir ? 0 : Math.sin(performance.now()*0.0025)*1.6;
  player.inAir = inAir;

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

/* ============================= SCHOOLS OF FISH ============================= */

const schools = [];
const SCHOOL_PALETTES = [
  {name:'Green Chromis', body:0x7fe8d4, fin:0xbdfff0, eye:0x08332b},
  {name:'Yellow Tang', body:0xffd45e, fin:0xfff0bd, eye:0x3a2c00},
  {name:'Blue Cardinalfish', body:0x9ec8ff, fin:0xdceaff, eye:0x0b2347},
  {name:'Pink Anthias', body:0xff8fa3, fin:0xffd6df, eye:0x3a0a16},
  {name:'Angelfish', body:0xffe566, fin:0xffeb99, eye:0x664d00},
  {name:'Clownfish', body:0xff6b35, fin:0xffa366, eye:0x331a00}
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
    m.g.x = mx; m.g.y = my; m.g.rotation = heading;
    drawFishShape(m.g, m.size, s.palette, m.phase, 0.8, Math.sin(m.offAngle)*0.3);
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

/* ============================= SHARKS ============================= */

const SHARK_COLORS = { body:0x9aa6b2, fin:0xcfd8e0, eye:0x10151a };

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
  const speedMult = options.difficulty === 'hard' ? 1.35 : (options.difficulty === 'peaceful' ? 0.8 : 1);
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

  sh.g.x = sh.x; sh.g.y = sh.y; sh.g.rotation = sh.displayAngle;
  drawFishShape(sh.g, sh.size, SHARK_COLORS, sh.tailPhase, 1, sh.bank);
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

  o.g.x = o.x; o.g.y = o.y; o.g.rotation = o.displayAngle;
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

  g.lineStyle(1.2, 0x1a0a1f);
  g.drawCircle(s*0.3, -s*0.25, Math.max(1, s*0.08));
  g.drawCircle(s*0.3, s*0.25, Math.max(1, s*0.08));
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

  g.lineStyle(1.2, 0x1a0a1f);
  g.drawCircle(s*0.3, -s*1.0+bob, Math.max(1, s*0.07));
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

  r.g.x = r.x; r.g.y = r.y; r.g.rotation = r.displayAngle;
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

  g.lineStyle(1.2, 0x10131f);
  g.drawCircle(s*0.45, -s*0.1, Math.max(1, s*0.05));
  g.drawCircle(s*0.45, s*0.1, Math.max(1, s*0.05));
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

  g.lineStyle(1.2, 0x111a0d);
  g.drawCircle(s*1.05, 0, Math.max(1, s*0.07));
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
  const g = p.g;
  g.clear();
  const s = p.size;
  const puff = 1 + Math.sin(p.puffPhase*2)*0.25;

  g.lineStyle({ width: Math.max(1.4, s*0.12), color: p.color, ...ROUND });
  g.drawCircle(0, 0, s*puff);

  for(let i=0;i<8;i++){
    const ang = (i/8)*Math.PI*2;
    g.moveTo(0, 0);
    g.lineTo(Math.cos(ang)*s*puff*1.3, Math.sin(ang)*s*puff*1.3);
  }

  g.lineStyle(1.2, 0x1a0a1f);
  g.drawCircle(s*0.4, -s*0.2, Math.max(1, s*0.06));
}

/* ============================= NPC MANAGER ============================= */

let npcs = [];
const SPAWN_RADIUS_MIN = 700;
const SPAWN_RADIUS_MAX = 1300;
const DESPAWN_RADIUS = 2100;
const MAX_NPCS = 140;
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
  spawnTimer = rand(25,80) / spawnRateMult;
  if(totalCreatureCount() >= MAX_NPCS) return;

  const angle = rand(0, Math.PI*2);
  const d = rand(SPAWN_RADIUS_MIN, SPAWN_RADIUS_MAX);
  let x = player.x + Math.cos(angle)*d;
  let y = clamp(player.y + Math.sin(angle)*d, WORLD_TOP_MARGIN+40, 7500);

  const r = Math.random();
  
  // Dynamic creatures from edge function / fallback
  if(dynamicCreatures.length > 0 && r < 0.35){
    const def = dynamicCreatures[Math.floor(Math.random() * dynamicCreatures.length)];
    const spawnY = clamp(y, def.depthMin, def.depthMax);
    npcs.push(spawnDynamicCreature(def, x, spawnY));
    return;
  }
  
  if(r < 0.45 && schools.length < MAX_SCHOOLS){
    spawnSchool(x,y);
  } else if(r < 0.50){
    npcs.push(spawnJellyfish(x, clamp(y, WORLD_TOP_MARGIN+60, 7000)));
  } else if(r < 0.54){
    npcs.push(spawnCrab(x));
  } else if(r < 0.58){
    npcs.push(spawnTurtle(x,y));
  } else if(r < 0.62){
    npcs.push(spawnOctopus(x,y));
  } else if(r < 0.65){
    npcs.push(spawnSeahorse(x,y));
  } else if(r < 0.68){
    npcs.push(spawnStingray(x,y));
  } else if(r < 0.71){
    npcs.push(spawnEel(x, clamp(y, WORLD_TOP_MARGIN+40, 7500)));
  } else if(r < 0.74){
    npcs.push(spawnStarfish(x));
  } else if(r < 0.77){
    npcs.push(spawnSeaUrchin(x, y));
  } else if(r < 0.80){
    npcs.push(spawnPufferfish(x, y));
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
    else if(n.type==='dynamic' && n.update) n.update(n, dt);
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

  if(player.y < 800){
    const causticAlpha = Math.max(0, 0.08 - player.y/10000);
    waterOverlayG.lineStyle(1, 0xffffff, causticAlpha);
    for(let i=0; i<12; i++){
      const cx = ((i*120 + time*0.02 + player.x*0.1) % (W+200)) - 100;
      const cy = 20 + Math.sin(time*0.001 + i)*30;
      waterOverlayG.moveTo(cx, cy);
      waterOverlayG.quadraticCurveTo(cx+40, cy+20, cx+80, cy-10);
      waterOverlayG.quadraticCurveTo(cx+120, cy-30, cx+160, cy+10);
    }
  }

  if(player.y < 400){
    const rayAlpha = Math.max(0, 0.04 - player.y/8000);
    waterOverlayG.beginFill(0xffffff, rayAlpha);
    for(let i=0; i<5; i++){
      const rx = ((i*200 + time*0.008) % (W+300)) - 150;
      waterOverlayG.moveTo(rx, 0);
      waterOverlayG.lineTo(rx+30, 0);
      waterOverlayG.lineTo(rx+80, H);
      waterOverlayG.lineTo(rx+20, H);
      waterOverlayG.closePath();
    }
    waterOverlayG.endFill();
  }
}

/* ============================= WATER BACKGROUND (CSS) ============================= */

const waterBg = document.getElementById('water-bg');
function updateWaterBackground(){
  const H = app.screen.height;
  const topFrac = clamp((player.y - H/2) / 8000, 0, 1);
  const botFrac = clamp((player.y + H/2) / 8000, 0, 1);
  const c1 = colorAtDepthFraction(topFrac);
  const c2 = colorAtDepthFraction(botFrac);

  const cycleTime = getCycleTime(performance.now());
  let brightness = cycleTime < 0.5 ? (1 - cycleTime*2) : (cycleTime*2 - 1);
  brightness = 0.5 + brightness*0.5;
  brightness *= options.brightness;

  const adjustedC1 = [Math.round(c1[0]*brightness), Math.round(c1[1]*brightness), Math.round(c1[2]*brightness)];
  const adjustedC2 = [Math.round(c2[0]*brightness), Math.round(c2[1]*brightness), Math.round(c2[2]*brightness)];

  waterBg.style.background = `linear-gradient(to bottom, ${rgbToCss(adjustedC1)} 0%, ${rgbToCss(adjustedC2)} 100%)`;
}

/* ============================= DAY/NIGHT CLOCK ============================= */

const clockEl = document.getElementById('daynight-clock');

function updateClock(){
  const cycleTime = getCycleTime(performance.now());
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
  'time','weather','flip','coords','fact','8ball','roll','coinflip','rename'
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
  school: (x,y)=> { spawnSchool(x,y); return null; }
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
      if(isNaN(v) || v<=0){ printLine('Usage: /speed <number, e.g. 5.4>', 'err'); break; }
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
      const cycleTime = getCycleTime(performance.now());
      printLine(cycleTime < 0.5 ? 'It is currently day.' : 'It is currently night.', 'info');
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
  depthValEl.textContent = Math.max(0, Math.round((player.y - SURFACE_Y)/8));
}

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
  updateNPCs(dt);
  trySpawn(dt);

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
  drawSeafloorAndDecor(now);
  redrawBubbles();
  redrawSplashes();
  drawSurfaceLine(now);
  drawWaterOverlay(now);

  playerG.y = app.screen.height/2 + player.bob;
  drawFishShape(playerG, player.size, PLAYER_COLORS, player.tailPhase, speed/player.maxSpeed, player.bank);
  playerG.rotation = player.flipping
    ? player.displayAngle + player.flipProgress*Math.PI*2*player.flipDir
    : player.displayAngle;

  updateWaterBackground();
  updateHUD();
  updateDebugDisplay();
  updateClock();
});

})();

