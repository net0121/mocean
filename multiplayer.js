/* =============================================================================
   multiplayer.js — optional online multiplayer for mocean.

     • connects to server.js over a WebSocket (only after you press Play, and only if enabled)
     • other players appear as fish in the same ocean, with smooth interpolation
     • name tags above every fish (toggle in Options or with /tags)
     • chat from the command prompt: /say <message>, shown as a feed + speech bubbles
     • the title screen shows how many people are online (polls GET /online on the server)

   Only *players* are shared. Creatures, XP, caves and the day/night clock stay local to each
   client, so the game plays exactly the same with multiplayer off or the server unreachable.

   Loaded before game.js. game.js calls MoceanMultiplayer(ctx).
   ============================================================================= */
(function(global){
"use strict";

const KEY = 'mocean.mp.v1';
const SEND_MS = 90;                       // position updates, ~11 per second

// Where your multiplayer server lives, e.g. 'wss://mocean-server.onrender.com'.
// GitHub Pages only hosts static files, so deploy server.js somewhere that runs Node and put its address here.
// (Players can still override it in Options -> Server.) Leave empty if the game is served by server.js itself.
const DEFAULT_SERVER = 'wss://mocean-server.onrender.com';

function cleanName(s){ return String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16); }
function cleanText(s){ return String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140); }
function hueOf(name){ let h = 0; for(let i = 0; i < name.length; i++) h = (h*31 + name.charCodeAt(i)) % 360; return h; }

global.MoceanMultiplayer = function(ctx){
  const { app, world, player, view, creaturesLayer, drawFishShape, lerpAngle, clamp, look } = ctx;

  /* ------------------------------------------------------------ settings */

  const cfg = { enabled:true, name:'', tags:true, server:'' };
  try{ Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); }catch(err){}
  cfg.name = cleanName(cfg.name) || ('Fish' + (1000 + Math.floor(Math.random()*9000)));
  const saveCfg = ()=>{ try{ localStorage.setItem(KEY, JSON.stringify(cfg)); }catch(err){} };
  saveCfg();

  // "host:port", "http://host", "ws://host" and "wss://host" all work. Empty = the server that served this page.
  function bases(){
    const onPages = /\.github\.io$/i.test(location.hostname);        // a static host: there is no server at this origin
    let s = String(cfg.server || '').trim() || DEFAULT_SERVER || global.MOCEAN_SERVER ||
            (/^https?:$/.test(location.protocol) && !onPages ? location.origin : onPages ? '' : 'http://localhost:3000');
    if(!s) return null;
    if(!/^[a-z]+:\/\//i.test(s)) s = (location.protocol === 'https:' ? 'https://' : 'http://') + s;
    s = s.replace(/\/+$/, '');
    const http = s.replace(/^ws/i, 'http');
    return { http, ws: http.replace(/^http/i, 'ws') };
  }

  /* --------------------------------------------------------------- state */

  let started = false, ws = null, connected = false, myId = null, online = 0;
  let retryTimer = null, retries = 0, lastSend = 0, lastKey = '';
  const remotes = new Map();

  /* ------------------------------------------------------------ DOM bits */

  const $ = (id)=> document.getElementById(id);
  const titleCountEl = $('online-count'), titleTextEl = $('online-text');
  const enabledEl = $('mp-enabled-checkbox'), nameEl = $('player-name-input'), tagsEl = $('name-tags-checkbox'), serverEl = $('server-input');

  const hudEl = document.createElement('div');
  hudEl.id = 'mp-status';
  const hud = $('hud');
  if(hud) hud.appendChild(hudEl);

  const feedEl = document.createElement('div');
  feedEl.id = 'chat-feed';
  document.body.appendChild(feedEl);

  function setTitleCount(n){
    if(!titleCountEl) return;
    if(n === null){ titleCountEl.className = 'online-count off'; titleTextEl.textContent = 'Server offline \u2014 playing solo'; }
    else { titleCountEl.className = 'online-count on'; titleTextEl.textContent = n === 0 ? 'No one online yet \u2014 be the first!' : n === 1 ? '1 player online' : n + ' players online'; }
  }

  let lastHud = '';
  function setHud(){
    let t = '';
    if(cfg.enabled && started) t = connected ? '\u25CF ' + online + ' online' : '\u25CB connecting\u2026';
    if(t !== lastHud){ lastHud = t; hudEl.textContent = t; hudEl.classList.toggle('live', connected); hudEl.style.display = t ? 'block' : 'none'; }
  }

  function feedAdd(name, text, cls){
    const d = document.createElement('div');
    d.className = 'feed-line' + (cls ? ' ' + cls : '');
    if(name){
      const n = document.createElement('span');
      n.className = 'feed-name'; n.textContent = name + ': ';
      n.style.color = cls === 'me' ? '#ffd194' : `hsl(${hueOf(name)},80%,72%)`;
      d.appendChild(n);
    }
    const t = document.createElement('span'); t.textContent = text; d.appendChild(t);
    feedEl.appendChild(d);
    while(feedEl.children.length > 7) feedEl.removeChild(feedEl.firstChild);
    setTimeout(()=>{ if(d.parentNode) d.parentNode.removeChild(d); }, 12000);
  }

  function sysLine(text){ ctx.print(text, 'info'); feedAdd('', text, 'sys'); }

  /* ---------------------------------------------------------- PIXI layers */

  const remoteLayer = new PIXI.Container();               // other fish live just above the creatures
  world.addChildAt(remoteLayer, world.getChildIndex(creaturesLayer) + 1);

  const tagLayer = new PIXI.Container();                  // our own tag + bubble, in screen space
  app.stage.addChild(tagLayer);

  const TAG_STYLE = { fontFamily:'Roboto Mono, monospace', fontSize:13, fontWeight:'600', fill:0xdff6ff, stroke:0x07151e, strokeThickness:3 };
  const BUBBLE_STYLE = { fontFamily:'Roboto Mono, monospace', fontSize:12, fill:0xffffff, stroke:0x07151e, strokeThickness:3,
                         wordWrap:true, wordWrapWidth:190, align:'center', lineHeight:14 };
  function makeTag(name, color){
    const t = new PIXI.Text(name, Object.assign({}, TAG_STYLE, { fill: color }));
    t.anchor.set(0.5, 1); return t;
  }
  function makeBubble(){
    const b = new PIXI.Text('', BUBBLE_STYLE);
    b.anchor.set(0.5, 1); b.visible = false; return b;
  }
  function tagColor(name){                                  // a stable, readable colour per name
    const h = hueOf(name)/360, s = 0.8, l = 0.76, a = s*Math.min(l, 1 - l);
    const f = (n)=>{ const k = (n + h*12) % 12; return Math.round((l - a*Math.max(-1, Math.min(k - 3, 9 - k, 1)))*255); };
    return (f(0) << 16) | (f(8) << 8) | f(4);
  }

  const me = { tag: makeTag(cfg.name, 0xffd194), bubble: makeBubble(), bubbleUntil: 0, bubbleAt: 0 };
  me.tag.visible = false;
  tagLayer.addChild(me.tag, me.bubble);

  function showBubble(o, text, now){
    o.bubble.text = text;
    o.bubble.alpha = 1;
    o.bubbleAt = now;
    o.bubbleUntil = now + clamp(3200 + text.length*55, 3200, 8000);
    o.bubble.visible = true;
  }
  function fadeBubble(o, now){
    if(!o.bubble.visible) return;
    const left = o.bubbleUntil - now;
    if(left <= 0){ o.bubble.visible = false; return; }
    o.bubble.alpha = clamp(left/600, 0, 1);
  }

  /* ----------------------------------------------------- remote players */

  function addRemote(p){
    if(p.id === myId || remotes.has(p.id)) return;
    const name = cleanName(p.name) || 'Fish';
    const r = {
      id:p.id, name, x:0, y:0, tx:0, ty:0, tvx:0, tvy:0, a:0, ta:0, size:20, c1:0xff9d5c, c2:0xffd194,
      cave:false, ts:0, tp:Math.random()*6, init:false,
      g:new PIXI.Graphics(), tag:makeTag(name, tagColor(name)), bubble:makeBubble(), bubbleUntil:0, bubbleAt:0
    };
    r.g.visible = false; r.tag.visible = false;
    remoteLayer.addChild(r.g, r.tag, r.bubble);
    remotes.set(r.id, r);
    if(p.s) applyState(r, p.s);
  }

  function removeRemote(id){
    const r = remotes.get(id);
    if(!r) return;
    remoteLayer.removeChild(r.g, r.tag, r.bubble);
    r.g.destroy(); r.tag.destroy(); r.bubble.destroy();
    remotes.delete(id);
  }

  function clearRemotes(){ for(const id of Array.from(remotes.keys())) removeRemote(id); }

  // s = [x, y, vx, vy, angle, size, bodyColour, finColour, inCave]
  function applyState(r, s){
    r.tx = s[0]; r.ty = s[1]; r.tvx = s[2]; r.tvy = s[3]; r.ta = s[4];
    r.size = s[5]; r.c1 = s[6]; r.c2 = s[7]; r.cave = !!s[8];
    r.ts = performance.now();
    if(!r.init){ r.init = true; r.x = r.tx; r.y = r.ty; r.a = r.ta; }
  }

  function setRemoteName(r, name){
    r.name = name;
    r.tag.text = name;
    r.tag.style.fill = tagColor(name);
  }

  /* ----------------------------------------------------------- network */

  function send(obj){ if(ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

  function connect(){
    if(ws || !cfg.enabled || !started) return;
    clearTimeout(retryTimer);
    const b = bases();
    if(!b) return;                                                  // no server configured: stay solo
    try{ ws = new WebSocket(b.ws); }catch(err){ ws = null; scheduleRetry(); return; }
    const sock = ws;
    sock.onopen = ()=>{ retries = 0; send({ t:'join', name:cfg.name }); };
    sock.onmessage = (ev)=>{
      let m; try{ m = JSON.parse(ev.data); }catch(err){ return; }
      handle(m);
    };
    sock.onclose = ()=>{
      if(ws !== sock) return;
      const was = connected;
      ws = null; connected = false; myId = null; clearRemotes();
      if(was) sysLine('Disconnected from the server.');
      scheduleRetry();
    };
    sock.onerror = ()=>{};
  }

  function scheduleRetry(){
    clearTimeout(retryTimer);
    if(!cfg.enabled || !started) return;
    retryTimer = setTimeout(connect, Math.min(15000, 1000*Math.pow(2, retries++)));
  }

  function disconnect(){
    clearTimeout(retryTimer);
    const sock = ws; ws = null; connected = false; myId = null;
    if(sock){ try{ sock.close(); }catch(err){} }
    clearRemotes();
  }

  function handle(m){
    const now = performance.now();
    switch(m.t){
      case 'welcome':
        myId = m.id; connected = true; online = m.n | 0;
        if(m.name && m.name !== cfg.name){ cfg.name = m.name; saveCfg(); if(nameEl) nameEl.value = m.name; me.tag.text = m.name; }
        for(const p of (m.players || [])) addRemote(p);
        lastKey = '';                                     // force a first position update
        sysLine('Connected \u2014 ' + online + (online === 1 ? ' player' : ' players') + ' online. Chat with /say <message>.');
        break;
      case 'join':
        online = m.n | 0; addRemote(m.p);
        sysLine(cleanName(m.p.name) + ' joined.');
        break;
      case 'leave': {
        online = m.n | 0;
        const r = remotes.get(m.id);
        if(r){ sysLine(r.name + ' left.'); removeRemote(m.id); }
        break;
      }
      case 'name': {
        const r = remotes.get(m.id), nm = cleanName(m.name);
        if(r && nm){ sysLine(r.name + ' is now known as ' + nm + '.'); setRemoteName(r, nm); }
        break;
      }
      case 'snap':
        for(const row of (m.p || [])){ const r = remotes.get(row[0]); if(r) applyState(r, row.slice(1)); }
        break;
      case 'chat': {
        const text = cleanText(m.text), mine = m.id === myId;
        const name = mine ? cfg.name : (cleanName(m.name) || 'Fish');
        ctx.print(name + ': ' + text, mine ? 'chat me' : 'chat');
        feedAdd(name, text, mine ? 'me' : '');
        const who = mine ? me : remotes.get(m.id);
        if(who) showBubble(who, text, now);
        break;
      }
      case 'sys': ctx.print(String(m.text || ''), 'info'); feedAdd('', String(m.text || ''), 'sys'); break;
    }
  }

  /* ------------------------------------------------- title-screen counter */

  async function poll(){
    if(started) return;
    let timer;
    try{
      const c = new AbortController();
      timer = setTimeout(()=> c.abort(), 4000);
      const b = bases();
      if(!b){ setTitleCount(null); return; }
      const r = await fetch(b.http + '/online', { cache:'no-store', signal:c.signal });
      const j = await r.json();
      setTitleCount(j && Number.isFinite(j.online) ? j.online : null);
    }catch(err){ setTitleCount(null); }
    clearTimeout(timer);
  }
  poll();
  setInterval(poll, 8000);

  /* ------------------------------------------------------- options wiring */

  if(enabledEl){ enabledEl.checked = cfg.enabled; enabledEl.addEventListener('change', ()=> setEnabled(enabledEl.checked)); }
  if(tagsEl){ tagsEl.checked = cfg.tags; tagsEl.addEventListener('change', ()=>{ cfg.tags = tagsEl.checked; saveCfg(); }); }
  if(nameEl){
    nameEl.value = cfg.name;
    nameEl.addEventListener('input', ()=>{ const n = cleanName(nameEl.value); if(n){ setName(n, false); } });
    nameEl.addEventListener('change', ()=>{ nameEl.value = cfg.name; });   // empty box falls back to the last good name
    nameEl.addEventListener('keydown', (e)=> e.stopPropagation());
  }
  if(serverEl){
    serverEl.value = cfg.server;
    serverEl.addEventListener('keydown', (e)=> e.stopPropagation());
    serverEl.addEventListener('change', ()=> setServer(serverEl.value));
  }

  function setEnabled(on){
    cfg.enabled = !!on; saveCfg();
    if(enabledEl) enabledEl.checked = cfg.enabled;
    if(cfg.enabled){ retries = 0; connect(); } else disconnect();
  }
  function setName(n, echo){
    cfg.name = n; saveCfg();
    me.tag.text = n;
    if(nameEl && document.activeElement !== nameEl) nameEl.value = n;
    if(connected) send({ t:'name', name:n });
  }
  function setServer(s){
    cfg.server = String(s || '').trim(); saveCfg();
    if(serverEl) serverEl.value = cfg.server;
    if(started){ disconnect(); retries = 0; connect(); } else poll();
  }

  /* -------------------------------------------------------------- update */

  function update(dt, now){
    setHud();
    feedEl.style.display = ctx.isCommandOpen() ? 'none' : 'flex';
    const inCave = ctx.inCave();

    // our own tag + bubble
    const px = player.x, size = player.size * look().size;
    const showMine = connected && cfg.tags && !inCave && ctx.isStarted();
    me.tag.visible = showMine;
    me.tag.x = app.screen.width/2 + view.ox;
    me.tag.y = app.screen.height/2 + player.bob + view.oy - size*1.05 - 14;
    me.bubble.x = me.tag.x;
    me.bubble.y = me.tag.y - (showMine ? 20 : -2);
    me.bubble.visible = me.bubble.visible && !inCave;
    fadeBubble(me, now);

    remoteLayer.visible = connected && !inCave;
    if(!connected) return;

    // send our state
    if(ctx.isStarted() && now - lastSend >= SEND_MS){
      const lk = look();
      const s = [Math.round(px), Math.round(player.y), +player.vx.toFixed(2), +player.vy.toFixed(2),
                 +player.displayAngle.toFixed(2), Math.round(size*10)/10, lk.colors.body, lk.colors.fin, inCave ? 1 : 0];
      const key = s.join(',');
      if(key !== lastKey || now - lastSend > 1000){ lastKey = key; lastSend = now; send({ t:'s', s }); }
      else lastSend = now;
    }

    // draw everyone else
    if(inCave) return;
    const W = app.screen.width, H = app.screen.height, ease = 1 - Math.pow(0.82, dt);
    for(const r of remotes.values()){
      if(!r.init) continue;
      const age = Math.min((now - r.ts)/16.67, 12);                      // frames since the last update: dead reckoning
      const gx = r.tx + r.tvx*age, gy = r.ty + r.tvy*age;
      if(Math.abs(gx - r.x) > 1500 || Math.abs(gy - r.y) > 1500){ r.x = gx; r.y = gy; }   // teleport: snap
      else { r.x += (gx - r.x)*ease; r.y += (gy - r.y)*ease; }
      r.a = lerpAngle(r.a, r.ta, 1 - Math.pow(0.85, dt));

      const sx = r.x + world.x, sy = r.y + world.y, pad = 260;
      const vis = !r.cave && sx > -pad && sx < W + pad && sy > -pad && sy < H + pad;
      r.g.visible = vis; r.tag.visible = vis && cfg.tags;
      if(!vis){ r.bubble.visible = false; continue; }

      const frac = clamp(Math.hypot(r.tvx, r.tvy)/9, 0, 1);
      r.tp += (0.2 + frac*0.5)*dt;
      drawFishShape(r.g, r.size, { body:r.c1, fin:r.c2 }, r.tp, frac, 0, r.a);
      r.g.x = r.x; r.g.y = r.y; r.g.rotation = r.a;
      r.tag.x = r.x; r.tag.y = r.y - r.size*1.05 - 14;
      r.bubble.x = r.x; r.bubble.y = r.tag.y - (cfg.tags ? 20 : -2);
      fadeBubble(r, now);
    }
  }

  /* ------------------------------------------------------------ commands */

  // returns [[text, class], ...] like dungeons.command()
  function command(cmd, args){
    switch(cmd){
      case 'say': case 'chat': case 'msg': {
        const text = cleanText(args.join(' '));
        if(!text) return [['Usage: /say <message>', 'err']];
        if(!cfg.enabled) return [['Multiplayer is off. Turn it on with /mp on.', 'err']];
        if(!connected) return [['Not connected to a server, so nobody can hear you. (/mp status)', 'err']];
        send({ t:'chat', text });
        return [];
      }
      case 'name': case 'nick': {
        if(!args.length) return [['Your name is "' + cfg.name + '". Change it with /name <new name>.', 'info']];
        const n = cleanName(args.join(' '));
        if(!n) return [['Usage: /name <new name> (up to 16 characters)', 'err']];
        setName(n);
        return [['You are now "' + n + '".', 'ok']];
      }
      case 'who': case 'players': case 'online': {
        if(!connected) return [['Not connected. (/mp status)', 'err']];
        const names = [cfg.name + ' (you)'].concat(Array.from(remotes.values()).map(r => r.name));
        return [[online + ' online: ' + names.join(', '), 'info']];
      }
      case 'tags': {
        const a = (args[0] || '').toLowerCase();
        cfg.tags = a === 'on' ? true : a === 'off' ? false : !cfg.tags;
        saveCfg(); if(tagsEl) tagsEl.checked = cfg.tags;
        return [['Name tags ' + (cfg.tags ? 'on' : 'off') + '.', 'ok']];
      }
      case 'mp': case 'multiplayer': {
        const a = (args[0] || 'status').toLowerCase();
        if(a === 'on' || a === 'off'){ setEnabled(a === 'on'); return [['Multiplayer ' + a + '.', 'ok']]; }
        if(a === 'server'){
          if(!args[1]) return [['Server: ' + (bases() || { http:'none configured' }).http + (cfg.server ? '' : ' (default)') + '. Usage: /mp server <host:port | reset>', 'info']];
          setServer(args[1] === 'reset' ? '' : args[1]);
          return [['Server set to ' + (bases() || { http:'none' }).http + '.', 'ok']];
        }
        return [
          ['Multiplayer: ' + (cfg.enabled ? (connected ? 'connected' : 'trying to connect') : 'off') + ' \u00B7 ' + online + ' online', connected ? 'ok' : 'info'],
          ['Server: ' + (bases() || { http:'none configured' }).http + ' \u00B7 Name: ' + cfg.name + ' \u00B7 Tags: ' + (cfg.tags ? 'on' : 'off'), 'info'],
          ['Commands: /say /name /who /tags /mp on|off|server', 'info']
        ];
      }
    }
    return null;
  }

  return {
    update, command,
    start(){ started = true; if(cfg.enabled) connect(); },
    get connected(){ return connected; }
  };
};

})(window);
