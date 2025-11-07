const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const socket = io();

let me = { id: null, team: null };
let players = {};
let swords = {};
let keys = {};
let mouse = { x: 0, y: 0, down: false };

const WORLD = { w: 2000, h: 1500 };
let camera = { x: 0, y: 0 };

// Resize & fullscreen
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Fullscreen on any click
canvas.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  }
});

// Input
window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
canvas.addEventListener('mousemove', e => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});
canvas.addEventListener('mousedown', e => {
  if (e.button === 0) { mouse.down = true; shoot(); }
});
canvas.addEventListener('mouseup', () => mouse.down = false);
window.addEventListener('keypress', e => {
  if (e.key === 'g' || e.key === 'G') shoot();
});

function shoot() {
  if (!me.id) return;
  const angle = Math.atan2(mouse.y - canvas.height/2, mouse.x - canvas.width/2);
  const speed = 12;
  socket.emit('shootSword', {
    x: players[me.id].x,
    y: players[me.id].y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 60,
    angle
  });
}

// Socket events
socket.on('youAre', data => {
  me = data;
  document.getElementById('teamInfo').textContent = 
    data.team === 'grok' ? '🤖 YOU ARE GROK' : '🍿 YOU ARE POPCORN';
  document.getElementById('teamInfo').className = data.team;
});

socket.on('currentPlayers', data => players = data);
socket.on('newPlayer', player => players[player.id] = player);
socket.on('playerMoved', data => {
  if (players[data.id]) {
    players[data.id].x = data.x;
    players[data.id].y = data.y;
    players[data.id].angle = data.angle;
  }
});
socket.on('playerLeft', id => delete players[id]);
socket.on('swordsUpdate', data => swords = data);
socket.on('swordShot', sword => swords[sword.id] = sword);
socket.on('playerHit', data => {
  if (players[data.id]) players[data.id].health = data.health;
});
socket.on('playerDied', data => {
  if (data.id === me.id) {
    document.getElementById('health').textContent = '💀 RESPAWNING...';
    setTimeout(() => {
      document.getElementById('health').textContent = '❤️ 100';
    }, 1500);
  }
});

// Game loop
function update() {
  if (!me.id || !players[me.id]) return;

  const speed = 4;
  let vx = 0, vy = 0;
  if (keys['w']) vy -= speed;
  if (keys['s']) vy += speed;
  if (keys['a']) vx -= speed;
  if (keys['d']) vx += speed;

  const p = players[me.id];
  p.x += vx;
  p.y += vy;
  p.x = Math.max(50, Math.min(WORLD.w - 50, p.x));
  p.y = Math.max(50, Math.min(WORLD.h - 50, p.y));

  const angle = Math.atan2(mouse.y - canvas.height/2, mouse.x - canvas.width/2);
  p.angle = angle;

  socket.emit('playerMove', { x: p.x, y: p.y, angle });

  // Camera follow
  camera.x = p.x - canvas.width / 2;
  camera.y = p.y - canvas.height / 2;

  // Update UI
  document.getElementById('score').textContent = 
    `Kills: ${p.kills || 0} | Deaths: ${p.deaths || 0}`;
  document.getElementById('health').textContent = 
    p.health > 0 ? `❤️ ${p.health}` : '💀 DEAD';
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  // Grid background
  ctx.strokeStyle = '#003300';
  ctx.lineWidth = 2;
  for (let x = 0; x < WORLD.w; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD.h);
    ctx.stroke();
  }
  for (let y = 0; y < WORLD.h; y += 100) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD.w, y);
    ctx.stroke();
  }

  // Swords
  for (const sid in swords) {
    const s = swords[sid];
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.font = '40px serif';
    ctx.fillText('⚔️', -15, 15);
    ctx.restore();
  }

  // Players
  for (const id in players) {
    const p = players[id];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);

    // Body
    ctx.font = '60px serif';
    const emoji = p.team === 'grok' ? '🤖' : '🍿';
    ctx.fillText(emoji, -25, 20);

    // Health bar
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-30, 40, 60, 8);
    ctx.fillStyle = p.health > 50 ? '#0f0' : p.health > 25 ? '#ff0' : '#f00';
    ctx.fillRect(-30, 40, (p.health / 100) * 60, 8);

    // Name
    ctx.font = '16px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(id === me.id ? 'YOU' : id.slice(0, 6), 0, 65);

    ctx.restore();
  }

  ctx.restore();
}

function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);