const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'rooms_db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class Store {
  constructor() {
    this.rooms = new Map(); // roomId -> { id, name, createdAt, hostId, hostName, screenSharer: null }
    this.messages = new Map(); // roomId -> Array<Message>
    this.activeParticipants = new Map(); // roomId -> Map<socketId, { socketId, userId, userName, joinedAt, isSharingScreen }>
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.rooms) {
          for (const [id, room] of Object.entries(parsed.rooms)) {
            this.rooms.set(id, {
              ...room,
              screenSharer: null // reset transient live screen state on restart
            });
          }
        }
        if (parsed.messages) {
          for (const [id, msgs] of Object.entries(parsed.messages)) {
            this.messages.set(id, msgs);
          }
        }
        console.log(`[Store] Loaded ${this.rooms.size} rooms and message histories from persistent storage.`);
      }
    } catch (err) {
      console.error('[Store] Error loading from disk:', err);
    }
  }

  saveToDisk() {
    try {
      const serializableRooms = {};
      for (const [id, room] of this.rooms.entries()) {
        serializableRooms[id] = {
          id: room.id,
          name: room.name,
          createdAt: room.createdAt,
          hostId: room.hostId,
          hostName: room.hostName
        };
      }

      const serializableMessages = {};
      for (const [id, msgs] of this.messages.entries()) {
        // Keep last 300 messages per room to prevent unbounded file growth while preserving ample history
        serializableMessages[id] = msgs.slice(-300);
      }

      const payload = JSON.stringify({
        rooms: serializableRooms,
        messages: serializableMessages,
        lastSaved: new Date().toISOString()
      }, null, 2);

      const tempFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempFile, payload, 'utf-8');
      fs.renameSync(tempFile, DB_FILE);
    } catch (err) {
      console.error('[Store] Error persisting to disk:', err);
    }
  }

  createRoom(roomId, name, hostId, hostName) {
    const cleanId = String(roomId).trim().toLowerCase();
    const cleanName = String(name || `Room ${cleanId}`).trim();

    if (!this.rooms.has(cleanId)) {
      const newRoom = {
        id: cleanId,
        name: cleanName,
        createdAt: new Date().toISOString(),
        hostId: hostId || null,
        hostName: hostName || 'Anonymous',
        screenSharer: null
      };
      this.rooms.set(cleanId, newRoom);
      if (!this.messages.has(cleanId)) {
        this.messages.set(cleanId, []);
      }
      this.saveToDisk();
      return newRoom;
    }
    return this.rooms.get(cleanId);
  }

  getRoom(roomId) {
    if (!roomId) return null;
    return this.rooms.get(String(roomId).trim().toLowerCase()) || null;
  }

  roomExists(roomId) {
    if (!roomId) return false;
    return this.rooms.has(String(roomId).trim().toLowerCase());
  }

  addParticipant(roomId, socketId, user) {
    const cleanId = String(roomId).trim().toLowerCase();
    if (!this.activeParticipants.has(cleanId)) {
      this.activeParticipants.set(cleanId, new Map());
    }
    const roomParts = this.activeParticipants.get(cleanId);
    
    // Check if user is already registered under another socket or updating
    const participant = {
      socketId,
      userId: user.userId,
      userName: user.userName,
      joinedAt: new Date().toISOString(),
      isSharingScreen: false
    };

    roomParts.set(socketId, participant);
    return participant;
  }

  removeParticipant(roomId, socketId) {
    const cleanId = String(roomId).trim().toLowerCase();
    if (!this.activeParticipants.has(cleanId)) return null;
    const roomParts = this.activeParticipants.get(cleanId);
    const participant = roomParts.get(socketId);
    if (participant) {
      roomParts.delete(socketId);
      
      // If this participant was sharing screen, clear it
      const room = this.getRoom(cleanId);
      if (room && room.screenSharer && room.screenSharer.socketId === socketId) {
        room.screenSharer = null;
      }
    }
    return participant || null;
  }

  updateParticipantName(roomId, socketId, newName) {
    const cleanId = String(roomId).trim().toLowerCase();
    if (!this.activeParticipants.has(cleanId)) return null;
    const roomParts = this.activeParticipants.get(cleanId);
    const participant = roomParts.get(socketId);
    if (participant) {
      participant.userName = newName;
      // Also update screenSharer if this user is sharing
      const room = this.getRoom(cleanId);
      if (room && room.screenSharer && room.screenSharer.socketId === socketId) {
        room.screenSharer.userName = newName;
      }
      return participant;
    }
    return null;
  }

  getParticipants(roomId) {
    const cleanId = String(roomId).trim().toLowerCase();
    if (!this.activeParticipants.has(cleanId)) return [];
    return Array.from(this.activeParticipants.get(cleanId).values());
  }

  getParticipantBySocket(roomId, socketId) {
    const cleanId = String(roomId).trim().toLowerCase();
    if (!this.activeParticipants.has(cleanId)) return null;
    return this.activeParticipants.get(cleanId).get(socketId) || null;
  }

  setScreenSharer(roomId, sharerInfo) {
    const room = this.getRoom(roomId);
    if (!room) return false;
    room.screenSharer = sharerInfo; // { socketId, userId, userName, startedAt } or null

    // Update flag in active participants
    const cleanId = String(roomId).trim().toLowerCase();
    if (this.activeParticipants.has(cleanId)) {
      for (const [sockId, p] of this.activeParticipants.get(cleanId).entries()) {
        p.isSharingScreen = Boolean(sharerInfo && sockId === sharerInfo.socketId);
      }
    }
    return true;
  }

  getScreenSharer(roomId) {
    const room = this.getRoom(roomId);
    return room ? room.screenSharer : null;
  }

  addMessage(roomId, message) {
    const cleanId = String(roomId).trim().toLowerCase();
    if (!this.messages.has(cleanId)) {
      this.messages.set(cleanId, []);
    }
    const msgs = this.messages.get(cleanId);
    const msgRecord = {
      id: message.id,
      roomId: cleanId,
      senderId: message.senderId,
      senderName: message.senderName,
      text: message.text,
      timestamp: message.timestamp || new Date().toISOString()
    };
    msgs.push(msgRecord);
    this.saveToDisk();
    return msgRecord;
  }

  getMessages(roomId) {
    const cleanId = String(roomId).trim().toLowerCase();
    return this.messages.get(cleanId) || [];
  }
}

module.exports = new Store();
