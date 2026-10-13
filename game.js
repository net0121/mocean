#!/usr/bin/env node
/* =============================================================================
   server.js — the mocean multiplayer server.

     npm install
     npm start                 (http://localhost:3000)

   • serves the game files in this folder (so you can just open http://localhost:3000)
   • GET  /online      -> { "online": 3, "max": 100 }   (the title screen reads this)
   • WS   /            -> the game connects here after you press Play

   It only relays players' positions and chat; it knows nothing about creatures, XP or caves.

   Environment: PORT (3000), HOST (0.0.0.0), MAX_PLAYERS (100), MAX_PER_IP (6), TRUST_PROXY=1
   (use the X-Forwarded-For header for per-IP limits when running behind nginx / a platform proxy).
   ============================================================================= */
"use strict";

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PLAYERS = +process.env.MAX_PLAYERS || 100;
const MAX_PER_IP = +process.env.MAX_PER_IP || 6;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const ROOT = __dirname;
// The name "iamdev" unlocks dev commands in the client, so it is reserved: only a player who sends the
// DEV_KEY (set it as an environment variable; they enter it in game with /devkey) may use it.
// If DEV_KEY is not set, nobody can use the name on this server.
const DEV_KEY = process.env.DEV_KEY || '';
const nameOk = (n, key)=> n.toLowerCase().replace(/[^a-z0-9]/g, '') !== 'iamdev' || (DEV_KEY !== '' && key === DEV_KEY);

const MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif',
  '.webp':'image/webp', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.mp3':'audio/mpeg', '.ogg':'audio/ogg',
  '.wav':'audio/wav', '.woff2':'font/woff2'
};
const PRIVATE = new Set(['server.js', 'package.json', 'package-lock.json']);

/* --------------------------------------------------------------- helpers */

const cleanName = (s)=> String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
const cleanText = (s)=> String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
const num = (v, lo, hi)=> (typeof v === 'number' && Number.isFinite(v)) ? Math.min(hi, Math.max(lo, v)) : null;

// state = [x, y, vx, vy, angle, size, bodyColour, finColour, inCave]
function cleanState(s){
  if(!Array.isArray(s) || s.length !== 9) return null;
  const out = [num(s[0], -1e7, 1e7), num(s[1], -1e7, 1e7), num(s[2], -200, 200), num(s[3], -200, 200),
               num(s[4], -1e4, 1e4), num(s[5], 2, 200), num(s[6], 0, 0xffffff), num(s[7], 0, 0xffffff), s[8] ? 1 : 0];
  return out.some(v => v === null) ? null : out;
}

/* ------------------------------------------------------------ http server */

const server = http.createServer((req, res)=>{
  res.setHeader('Access-Control-Allow-Origin', '*');           // so a page hosted elsewhere can read the player count
  let url;
  try{ url = new URL(req.url, 'http://localhost'); }catch(err){ res.writeHead(400); return res.end(); }

  if(url.pathname === '/online'){
    res.writeHead(200, { 'Content-Type':'application/json', 'Cache-Control':'no-store' });
    return res.end(JSON.stringify({ online: players.size, max: MAX_PLAYERS }));
  }
  if(req.method !== 'GET' && req.method !== 'HEAD'){ res.writeHead(405); return res.end(); }

  let rel;
  try{ rel = decodeURIComponent(url.pathname); }catch(err){ res.writeHead(400); return res.end(); }
  if(rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  const inside = file.startsWith(ROOT + path.sep);
  const parts = path.relative(ROOT, file).split(path.sep);
  const ext = path.extname(file).toLowerCase();
  if(!inside || !MIME[ext] || PRIVATE.has(path.basename(file)) || parts.some(p => p.startsWith('.') || p === 'node_modules')){
    res.writeHead(404); return res.end('Not found');
  }
  fs.readFile(file, (err, data)=>{
    if(err){ res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[ext], 'Cache-Control':'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

/* -------------------------------------------------------- websocket server */

const wss = new WebSocketServer({ server, maxPayload: 1024, perMessageDeflate: false });
const players = new Map();            // id -> player (joined players only)
const perIp = new Map();
let nextId = 1;

function send(ws, obj){ if(ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(obj, exceptId){
  const data = JSON.stringify(obj);
  for(const p of players.values()) if(p.id !== exceptId && p.ws.readyState === 1) p.ws.send(data);
}

wss.on('connection', (ws, req)=>{
  const ip = (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
  if((perIp.get(ip) || 0) >= MAX_PER_IP){ send(ws, { t:'err', text:'Too many connections from your address.' }); return ws.close(1008); }
  perIp.set(ip, (perIp.get(ip) || 0) + 1);

  const p = { id: nextId++, ws, ip, name:'', joined:false, s:null, dirty:false, lastS:0, chatTimes:[], lastName:0, lastPing:0 };
  ws.alive = true;
  ws.on('pong', ()=>{ ws.alive = true; });
  setTimeout(()=>{ if(!p.joined) ws.terminate(); }, 10000);

  ws.on('message', (raw)=>{
    let m; try{ m = JSON.parse(raw.toString()); }catch(err){ return; }
    if(!m || typeof m.t !== 'string') return;
    const now = Date.now();

    if(m.t === 'ping'){                                // lets the game show your latency
      if(now - p.lastPing > 400){ p.lastPing = now; send(ws, { t:'pong', ts: typeof m.ts === 'number' ? m.ts : 0 }); }
      return;
    }

    if(m.t === 'join'){
      if(p.joined) return;
      if(players.size >= MAX_PLAYERS){ send(ws, { t:'err', text:'The server is full.' }); return ws.close(1013); }
      p.name = cleanName(m.name) || ('Fish' + p.id);
      const denied = !nameOk(p.name, m.key);
      if(denied) p.name = 'Fish' + p.id;
      p.joined = true;
      players.set(p.id, p);
      send(ws, { t:'welcome', id:p.id, name:p.name, n:players.size,
                 players: Array.from(players.values()).filter(o => o !== p).map(o => ({ id:o.id, name:o.name, s:o.s, typing:!!o.typing })) });
      broadcast({ t:'join', p:{ id:p.id, name:p.name }, n:players.size }, p.id);
      if(denied) send(ws, { t:'sys', text:'That name is reserved, so you were renamed ' + p.name + '. Pick another with /name.' });
      return;
    }
    if(!p.joined) return;

    if(m.t === 's'){
      if(now - p.lastS < 40) return;                 // at most ~25 updates / second
      const s = cleanState(m.s);
      if(s){ p.s = s; p.dirty = true; p.lastS = now; }
    } else if(m.t === 'chat'){
      const text = cleanText(m.text);
      if(!text) return;
      p.chatTimes = p.chatTimes.filter(t => now - t < 10000);
      if(p.chatTimes.length >= 5 || (p.chatTimes.length && now - p.chatTimes[p.chatTimes.length - 1] < 600)){
        return send(ws, { t:'sys', text:'Slow down \u2014 you are sending messages too fast.' });
      }
      p.chatTimes.push(now);
      p.typing = false;
      broadcast({ t:'chat', id:p.id, name:p.name, text });
    } else if(m.t === 'typing'){
      const on = m.on === true;
      if(on === p.typing) return;
      p.typing = on;
      broadcast({ t:'typing', id:p.id, on }, p.id);
    } else if(m.t === 'name'){
      const n = cleanName(m.name);
      if(!n || n === p.name || now - p.lastName < 2000) return;
      if(!nameOk(n, m.key)){
        send(ws, { t:'sys', text:'That name is reserved.' });
        return send(ws, { t:'name', id:p.id, name:p.name });      // tell the client to keep its old name
      }
      p.lastName = now; p.name = n;
      broadcast({ t:'name', id:p.id, name:n }, p.id);
    }
  });

  ws.on('close', ()=>{
    const c = (perIp.get(ip) || 1) - 1;
    if(c <= 0) perIp.delete(ip); else perIp.set(ip, c);
    if(p.joined && players.delete(p.id)) broadcast({ t:'leave', id:p.id, n:players.size });
  });
  ws.on('error', ()=>{});
});

// position updates go out in batches, 15 times a second, only for players that moved
setInterval(()=>{
  const rows = [];
  for(const p of players.values()) if(p.dirty){ rows.push([p.id].concat(p.s)); p.dirty = false; }
  if(!rows.length) return;
  for(const p of players.values()){
    const mine = rows.filter(r => r[0] !== p.id);
    if(mine.length) send(p.ws, { t:'snap', p:mine });
  }
}, 66);

// drop connections that stopped answering, and sockets that never said hello
setInterval(()=>{
  for(const ws of wss.clients){
    if(ws.alive === false){ ws.terminate(); continue; }
    ws.alive = false; try{ ws.ping(); }catch(err){}
  }
}, 20000);

server.listen(PORT, HOST, ()=> console.log(`mocean server on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
process.on('SIGINT', ()=>{ wss.close(); server.close(()=> process.exit(0)); setTimeout(()=> process.exit(0), 500); });
