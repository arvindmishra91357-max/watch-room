const { v4: uuidv4 } = require('uuid');
const xss = require('xss');
const store = require('./store');

// Custom XSS sanitizer configuration
const sanitizeOptions = {
  whiteList: {}, // No HTML tags permitted in chat messages
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script']
};

function setupSocket(io) {
  io.on('connection', (socket) => {
    // 1. Join room
    socket.on('room:join', ({ roomId, userId, userName }) => {
      try {
        if (!roomId || !userName) {
          return socket.emit('error:message', { message: 'Room ID and user name are required.' });
        }

        const cleanRoomId = String(roomId).trim().toLowerCase();
        const cleanUserName = String(userName).trim().slice(0, 30);
        const cleanUserId = String(userId || uuidv4()).trim();

        // Ensure room exists in store
        let room = store.getRoom(cleanRoomId);
        if (!room) {
          room = store.createRoom(cleanRoomId, `Room ${cleanRoomId.toUpperCase()}`, cleanUserId, cleanUserName);
        }

        // Store user state on socket
        socket.data.roomId = cleanRoomId;
        socket.data.userId = cleanUserId;
        socket.data.userName = cleanUserName;

        socket.join(cleanRoomId);

        // Register participant
        const participant = store.addParticipant(cleanRoomId, socket.id, {
          userId: cleanUserId,
          userName: cleanUserName
        });

        const participants = store.getParticipants(cleanRoomId);
        const messages = store.getMessages(cleanRoomId);
        const screenSharer = store.getScreenSharer(cleanRoomId);

        // Send full sync to the joining client
        socket.emit('room:joined', {
          room: {
            id: room.id,
            name: room.name,
            createdAt: room.createdAt
          },
          currentUserId: cleanUserId,
          participants,
          messages,
          screenSharer
        });

        // Notify other room participants
        socket.to(cleanRoomId).emit('room:participant-joined', participant);
        io.to(cleanRoomId).emit('room:participants-updated', participants);

        // Create persistent system join notification message in chat
        const sysMsg = store.addMessage(cleanRoomId, {
          id: uuidv4(),
          senderId: 'system',
          senderName: 'System',
          text: `${cleanUserName} joined the room`,
          timestamp: new Date().toISOString()
        });
        io.to(cleanRoomId).emit('chat:message', sysMsg);

        console.log(`[Socket] User ${cleanUserName} (${cleanUserId}) joined room ${cleanRoomId}`);
      } catch (err) {
        console.error('[Socket] room:join error:', err);
        socket.emit('error:message', { message: 'Failed to join room.' });
      }
    });

    // 2. Chat message
    socket.on('chat:send', ({ text }) => {
      try {
        const { roomId, userId, userName } = socket.data;
        if (!roomId || !userId) {
          return socket.emit('error:message', { message: 'You are not in a room.' });
        }

        if (!text || typeof text !== 'string') {
          return socket.emit('error:message', { message: 'Message cannot be empty.' });
        }

        const rawText = text.trim();
        if (rawText.length === 0) {
          return socket.emit('error:message', { message: 'Message cannot be empty.' });
        }

        // Prevent abnormally huge payloads
        const boundedText = rawText.slice(0, 2000);
        // Strictly sanitize text against XSS attacks
        const cleanText = xss(boundedText, sanitizeOptions);

        const newMsg = store.addMessage(roomId, {
          id: uuidv4(),
          senderId: userId,
          senderName: userName,
          text: cleanText,
          timestamp: new Date().toISOString()
        });

        // Broadcast to everyone in the room (including sender)
        io.to(roomId).emit('chat:message', newMsg);
      } catch (err) {
        console.error('[Socket] chat:send error:', err);
        socket.emit('error:message', { message: 'Failed to send message.' });
      }
    });

    // 3. User updates display name
    socket.on('user:change-name', ({ newName }) => {
      try {
        const { roomId, userId, userName: oldName } = socket.data;
        if (!roomId) return;

        const cleanNewName = String(newName || '').trim().slice(0, 30);
        if (!cleanNewName || cleanNewName === oldName) return;

        socket.data.userName = cleanNewName;
        store.updateParticipantName(roomId, socket.id, cleanNewName);

        const participants = store.getParticipants(roomId);
        io.to(roomId).emit('room:participants-updated', participants);
        io.to(roomId).emit('user:name-changed', {
          socketId: socket.id,
          userId,
          oldName,
          newName: cleanNewName
        });

        // Add system message
        const sysMsg = store.addMessage(roomId, {
          id: uuidv4(),
          senderId: 'system',
          senderName: 'System',
          text: `${oldName} changed their name to ${cleanNewName}`,
          timestamp: new Date().toISOString()
        });
        io.to(roomId).emit('chat:message', sysMsg);

        console.log(`[Socket] ${oldName} renamed to ${cleanNewName} in ${roomId}`);
      } catch (err) {
        console.error('[Socket] user:change-name error:', err);
      }
    });

    // 4. Screen sharing start
    socket.on('screen:start', () => {
      try {
        const { roomId, userId, userName } = socket.data;
        if (!roomId) return;

        const currentSharer = store.getScreenSharer(roomId);
        if (currentSharer && currentSharer.socketId !== socket.id) {
          return socket.emit('screen:error', {
            message: `${currentSharer.userName} is currently sharing their screen.`
          });
        }

        const sharerInfo = {
          socketId: socket.id,
          userId,
          userName,
          startedAt: new Date().toISOString()
        };

        store.setScreenSharer(roomId, sharerInfo);

        // Tell all peers in the room that screen sharing has started
        io.to(roomId).emit('screen:started', sharerInfo);

        const participants = store.getParticipants(roomId);
        io.to(roomId).emit('room:participants-updated', participants);

        const sysMsg = store.addMessage(roomId, {
          id: uuidv4(),
          senderId: 'system',
          senderName: 'System',
          text: `${userName} started sharing their screen`,
          timestamp: new Date().toISOString()
        });
        io.to(roomId).emit('chat:message', sysMsg);

        console.log(`[Socket] Screen share started by ${userName} in ${roomId}`);
      } catch (err) {
        console.error('[Socket] screen:start error:', err);
        socket.emit('screen:error', { message: 'Failed to initiate screen share.' });
      }
    });

    // 5. Screen sharing stop
    socket.on('screen:stop', () => {
      try {
        const { roomId, userName } = socket.data;
        if (!roomId) return;

        const currentSharer = store.getScreenSharer(roomId);
        if (currentSharer && currentSharer.socketId === socket.id) {
          store.setScreenSharer(roomId, null);
          io.to(roomId).emit('screen:stopped');

          const participants = store.getParticipants(roomId);
          io.to(roomId).emit('room:participants-updated', participants);

          const sysMsg = store.addMessage(roomId, {
            id: uuidv4(),
            senderId: 'system',
            senderName: 'System',
            text: `${userName} stopped sharing their screen`,
            timestamp: new Date().toISOString()
          });
          io.to(roomId).emit('chat:message', sysMsg);

          console.log(`[Socket] Screen share stopped by ${userName} in ${roomId}`);
        }
      } catch (err) {
        console.error('[Socket] screen:stop error:', err);
      }
    });

    // 6. WebRTC Signaling relay (offers, answers, ICE candidates)
    socket.on('screen:signal', ({ targetSocketId, signalData }) => {
      try {
        if (!targetSocketId || !signalData) return;

        io.to(targetSocketId).emit('screen:signal', {
          fromSocketId: socket.id,
          fromUserId: socket.data.userId,
          fromUserName: socket.data.userName,
          signalData
        });
      } catch (err) {
        console.error('[Socket] screen:signal error:', err);
      }
    });

    // 6b. Viewer requests offer from active screen sharer
    socket.on('screen:request-offer', ({ sharerSocketId }) => {
      try {
        const targetId = sharerSocketId || (store.getScreenSharer(socket.data.roomId)?.socketId);
        if (!targetId) return;

        io.to(targetId).emit('screen:offer-requested', {
          viewerSocketId: socket.id,
          viewerUserId: socket.data.userId,
          viewerName: socket.data.userName
        });
      } catch (err) {
        console.error('[Socket] screen:request-offer error:', err);
      }
    });

    // 7. Explicit leave room
    socket.on('room:leave', () => {
      handleUserExit(socket, io);
    });

    // 8. Disconnection handler
    socket.on('disconnect', () => {
      handleUserExit(socket, io);
    });
  });
}

function handleUserExit(socket, io) {
  try {
    const { roomId, userName, userId } = socket.data;
    if (!roomId) return;

    socket.leave(roomId);
    const participant = store.removeParticipant(roomId, socket.id);

    if (participant) {
      // Check if this was the screen sharer
      const currentSharer = store.getScreenSharer(roomId);
      if (currentSharer && currentSharer.socketId === socket.id) {
        store.setScreenSharer(roomId, null);
        io.to(roomId).emit('screen:stopped');
      }

      const participants = store.getParticipants(roomId);
      io.to(roomId).emit('room:participant-left', {
        socketId: socket.id,
        userId,
        userName
      });
      io.to(roomId).emit('room:participants-updated', participants);

      // System notification
      const sysMsg = store.addMessage(roomId, {
        id: uuidv4(),
        senderId: 'system',
        senderName: 'System',
        text: `${userName} left the room`,
        timestamp: new Date().toISOString()
      });
      io.to(roomId).emit('chat:message', sysMsg);

      console.log(`[Socket] User ${userName} left room ${roomId}`);
    }

    socket.data.roomId = null;
  } catch (err) {
    console.error('[Socket] handleUserExit error:', err);
  }
}

module.exports = { setupSocket };
