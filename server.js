const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// SERVE FROM ROOT — THIS FIXES EVERYTHING
app.use(express.static(__dirname));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
const players = {};
const swords = {};
const WORLD_SIZE = { w: 2000, h: 1500 };

io.on('connection', (socket) => {
  const team = Object.values(players).filter(p => p.team === 'grok').length < 
               Object.values(players).filter(p => p.team === 'popcorn').length ? 'grok' : 'popcorn';

  players[socket.id] = {
    id: socket.id, x: Math.random() * WORLD_SIZE.w, y: Math.random() * WORLD_SIZE.h,
    angle: 0, team, health: 100, kills: 0, deaths: 0
  };

  socket.emit('currentPlayers', players);
  socket.emit('youAre', { id: socket.id, team });
  socket.broadcast.emit('newPlayer', players[socket.id]);

  socket.on('playerMove', data => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].angle = data.angle;
      socket.broadcast.emit('playerMoved', { id: socket.id, ...data });
    }
  });

  socket.on('shootSword', sword => {
    if (!players[socket.id] || players[socket.id].health <= 0) return;
    const s = { ...sword, id: uuidv4(), owner: socket.id, team: players[socket.id].team, life: 60 };
    swords[s.id] = s;
    io.emit('swordShot', s);
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

setInterval(() => {
  const toDelete = [];
  for (const id in swords) {
    const s = swords[id];
    s.x += s.vx; s.y += s.vy; s.life--;
    if (s.life <= 0 || s.x < 0 || s.x > WORLD_SIZE.w || s.y < 0 || s.y > WORLD_SIZE.h) {
      toDelete.push(id); continue;
    }
    for (const pid in players) {
      const p = players[pid];
      if (p.team === s.team) continue;
      if (Math.hypot(p.x - s.x, p.y - s.y) < 30) {
        p.health -= 40; toDelete.push(id);
        if (p.health <= 0) {
          players[s.owner].kills++; p.deaths++; p.health = 100;
          p.x = Math.random() * WORLD_SIZE.w; p.y = Math.random() * WORLD_SIZE.h;
          io.emit('playerDied', { id: pid, killer: s.owner });
        }
        io.emit('playerHit', { id: pid, health: p.health });
        break;
      }
    }
  }
  toDelete.forEach(id => delete swords[id]);
  io.emit('swordsUpdate', swords);
}, 1000/60);

server.listen(PORT, '0.0.0.0', () => {
  console.log('GROK vs POPCORNS IS LIVE!');
  console.log('OPEN: https://groks-vs-popcorns.onrender.com');
});
