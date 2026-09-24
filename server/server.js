const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const store = require('./store');
const { setupSocket } = require('./socketHandler');

const app = express();
const server = http.createServer(app);

// Setup Socket.IO with CORS enabled for any host/origin (required for Render HTTPS & custom domains)
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 30000,
  pingInterval: 15000,
  transports: ['websocket', 'polling']
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Generate clean, memorable room code
function generateRoomCode() {
  const adjectives = ['cosmic', 'hyper', 'lunar', 'neon', 'stellar', 'cyber', 'vivid', 'aurora', 'prism', 'nexus'];
  const nouns = ['hub', 'room', 'vault', 'lounge', 'theater', 'stage', 'orbit', 'zone', 'galaxy', 'stream'];
  const randAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randNoun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${randAdj}-${randNoun}-${num}`;
}

// Health check endpoint for Render / Uptime monitors
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    platform: process.platform,
    environment: process.env.NODE_ENV || 'production'
  });
});

// Create a new room
app.post('/api/rooms', (req, res) => {
  try {
    const { roomName, customCode, hostId, hostName } = req.body;
    let roomId = customCode ? String(customCode).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') : '';
    
    if (!roomId) {
      roomId = generateRoomCode();
    }

    const roomTitle = roomName && String(roomName).trim().length > 0 
      ? String(roomName).trim().slice(0, 50) 
      : `Room ${roomId.toUpperCase()}`;

    const created = store.createRoom(roomId, roomTitle, hostId, hostName);

    res.status(201).json({
      success: true,
      room: {
        id: created.id,
        name: created.name,
        createdAt: created.createdAt
      }
    });
  } catch (err) {
    console.error('[API] /api/rooms error:', err);
    res.status(500).json({ success: false, error: 'Failed to create room' });
  }
});

// Check if room exists
app.get('/api/rooms/:roomId', (req, res) => {
  try {
    const { roomId } = req.params;
    const room = store.getRoom(roomId);
    if (!room) {
      return res.status(404).json({
        exists: false,
        message: 'Room not found'
      });
    }

    const participants = store.getParticipants(roomId);
    res.json({
      exists: true,
      room: {
        id: room.id,
        name: room.name,
        createdAt: room.createdAt,
        participantCount: participants.length,
        hasScreenSharer: Boolean(room.screenSharer)
      }
    });
  } catch (err) {
    console.error('[API] /api/rooms/:roomId error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Direct SPA route for /room/:roomId
app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// SPA catch-all fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Initialize socket handlers
setupSocket(io);

// Host & Port binding compatible with Render, Railway, Fly.io, and Localhost
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`  🚀 Watch Room Server running!`);
  console.log(`  👉 Local:   http://localhost:${PORT}`);
  console.log(`  👉 Mode:    ${process.env.NODE_ENV || 'production'}`);
  console.log(`===============================================`);
});

// Graceful shutdown on Render redeploy / restart
function handleShutdown(signal) {
  console.log(`[Server] Received ${signal}. Gracefully closing HTTP and Socket.IO server...`);
  store.saveToDisk();
  server.close(() => {
    console.log('[Server] Server closed successfully.');
    process.exit(0);
  });
  // Force exit if not closed within 5s
  setTimeout(() => {
    console.error('[Server] Forcing shutdown.');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = { app, server };
