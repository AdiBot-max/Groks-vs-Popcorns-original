const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

// THIS IS THE ONLY FIX YOU NEED — SERVE FROM ROOT
app.use(express.static(__dirname));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;

// Game state
const players = {};
const swords = {};
const WORLD_SIZE = { w: 2000, h: 1500 };

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  const team = Object.values(players).filter(p => p.team === 'grok').length <
               Object.values(players).filter(p => p.team === 'popcorn').length ? 'grok' : 'popcorn';

  players[socket.id] = {
    id: socket.id,
    x: Math.random() * WORLD_SIZE.w,
    y: Math.random() * WORLD_SIZE.h,
    angle: 0,
    team,
    health: 100,
    kills: 0,
    deaths: 0
  };

  socket.emit('currentPlayers', players);
  socket.emit('youAre', { id: socket.id, team });
  socket.broadcast.emit('newPlayer', players[socket.id]);

  socket.on('playerMove', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].angle = data.angle;
      socket.broadcast.emit('playerMoved', { id: socket.id, ...data });
    }
  });

  socket.on('shootSword', (sword) => {
    const player = players[socket.id];
    if (!player || player.health <= 0) return;

    const swordId = uuidv4();
    swords[swordId] = {
      ...sword,
      id: swordId,
      owner: socket.id,
      team: player.team,
      createdAt: Date.now()
    };
    io.emit('swordShot', swords[swordId]);
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

// Game loop
setInterval(() => {
  const now = Date.now();
  const toDelete = [];

  for (const sid in swords) {
    const s = swords[sid];
    s.x += s.vx;
    s.y += s.vy;
    s.life--;

    if (s.life <= 0 || s.x < 0 || s.x > WORLD_SIZE.w || s.y < 0 || s.y > WORLD_SIZE.h) {
      toDelete.push(sid);
      continue;
    }

    for (const pid in players) {
      const p = players[pid];
      if (p.team === s.team) continue;
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      if (Math.sqrt(dx*dx + dy*dy) < 30) {
        p.health -= 40;
        toDelete.push(sid);

        if (p.health <= 0) {
          players[s.owner].kills++;
          p.deaths++;
          p.health = 100;
          p.x = Math.random() * WORLD_SIZE.w;
          p.y = Math.random() * WORLD_SIZE.h;
          io.emit('playerDied', { id: pid, killer: s.owner });
        }
        io.emit('playerHit', { id: pid, health: p.health });
        break;
      }
    }
  }

  toDelete.forEach(id => delete swords[id]);
  io.emit('swordsUpdate', swords);

}, 1000 / 60);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`GROK vs POPCORNS LIVE AT PORT ${PORT}`);

