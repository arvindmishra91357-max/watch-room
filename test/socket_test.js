const { io } = require('socket.io-client');

async function runTest() {
  console.log('--- Starting Multi-User Real-time Socket & Chat Test ---');

  const serverUrl = 'http://localhost:3000';
  const roomId = 'cinema-101';

  const clientArvind = io(serverUrl, { transports: ['websocket'] });
  const clientRahul = io(serverUrl, { transports: ['websocket'] });

  await Promise.all([
    new Promise(res => clientArvind.on('connect', res)),
    new Promise(res => clientRahul.on('connect', res))
  ]);
  console.log('✓ Both Arvind and Rahul connected to Socket.IO server.');

  // Join room as Arvind
  const arvindJoined = new Promise((resolve) => {
    clientArvind.on('room:joined', (data) => {
      console.log('✓ Arvind joined room:', data.room.id);
      resolve(data);
    });
  });

  clientArvind.emit('room:join', {
    roomId,
    userId: 'user-arvind-uuid',
    userName: 'Arvind'
  });
  await arvindJoined;

  // Join room as Rahul
  const rahulJoined = new Promise((resolve) => {
    clientRahul.on('room:joined', (data) => {
      console.log('✓ Rahul joined room. Participants count:', data.participants.length);
      resolve(data);
    });
  });

  clientRahul.emit('room:join', {
    roomId,
    userId: 'user-rahul-uuid',
    userName: 'Rahul'
  });
  await rahulJoined;

  // Arvind sends chat: "Hello everyone!"
  const rahulReceivedArvindMsg = new Promise((resolve) => {
    clientRahul.on('chat:message', (msg) => {
      if (msg.senderName === 'Arvind' && msg.text === 'Hello everyone!') {
        console.log(`✓ Rahul received message from Arvind: "${msg.text}" at ${msg.timestamp}`);
        resolve(msg);
      }
    });
  });

  clientArvind.emit('chat:send', { text: 'Hello everyone!' });
  await rahulReceivedArvindMsg;

  // Rahul sends chat: "Hi bro!"
  const arvindReceivedRahulMsg = new Promise((resolve) => {
    clientArvind.on('chat:message', (msg) => {
      if (msg.senderName === 'Rahul' && msg.text === 'Hi bro!') {
        console.log(`✓ Arvind received message from Rahul: "${msg.text}" at ${msg.timestamp}`);
        resolve(msg);
      }
    });
  });

  clientRahul.emit('chat:send', { text: 'Hi bro!' });
  await arvindReceivedRahulMsg;

  // Test Name change: Rahul changes name to "Rahul Sharma"
  const nameChangedPromise = new Promise((resolve) => {
    clientArvind.on('user:name-changed', (data) => {
      console.log(`✓ Arvind received name change: ${data.oldName} -> ${data.newName}`);
      resolve(data);
    });
  });

  clientRahul.emit('user:change-name', { newName: 'Rahul Sharma' });
  await nameChangedPromise;

  // Test screen sharing signaling: Arvind starts sharing
  const screenStartPromise = new Promise((resolve) => {
    clientRahul.on('screen:started', (sharer) => {
      console.log(`✓ Rahul notified that screen share started by: ${sharer.userName}`);
      resolve(sharer);
    });
  });

  clientArvind.emit('screen:start');
  await screenStartPromise;

  // Rahul receives screen stopped
  const screenStopPromise = new Promise((resolve) => {
    clientRahul.on('screen:stopped', () => {
      console.log('✓ Rahul notified that screen share stopped.');
      resolve();
    });
  });

  clientArvind.emit('screen:stop');
  await screenStopPromise;

  // Cleanup
  clientArvind.disconnect();
  clientRahul.disconnect();

  console.log('🎉 ALL MULTI-USER SOCKET & REAL-TIME TESTS PASSED SUCCESSFULLY! 🎉');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
