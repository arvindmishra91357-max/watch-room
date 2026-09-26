const { io } = require('socket.io-client');

async function runWebRTCSignalingTest() {
  console.log('=== Starting Comprehensive WebRTC Signaling & Screen Share Test ===');

  const serverUrl = 'http://localhost:3000';
  const roomId = 'stream-test-room';

  // 1. Connect Host (Arvind) and Viewer 1 (Rahul)
  const host = io(serverUrl, { transports: ['websocket'] });
  const viewer1 = io(serverUrl, { transports: ['websocket'] });

  await Promise.all([
    new Promise(res => host.on('connect', res)),
    new Promise(res => viewer1.on('connect', res))
  ]);
  console.log('✓ Host and Viewer 1 connected to server.');

  // Join room
  await new Promise(resolve => {
    host.on('room:joined', resolve);
    host.emit('room:join', { roomId, userId: 'host-1', userName: 'HostArvind' });
  });

  await new Promise(resolve => {
    viewer1.on('room:joined', resolve);
    viewer1.emit('room:join', { roomId, userId: 'viewer-1', userName: 'ViewerRahul' });
  });
  console.log('✓ Host and Viewer 1 both joined room:', roomId);

  // 2. Scenario A: Host starts sharing while Viewer 1 is already in room
  console.log('\n--- Scenario A: Host starts sharing while viewer is in room ---');
  
  const viewerReceivedStarted = new Promise(resolve => {
    viewer1.on('screen:started', (sharer) => {
      console.log(`✓ Viewer 1 received 'screen:started' from ${sharer.userName} (${sharer.socketId})`);
      resolve(sharer);
    });
  });

  host.emit('screen:start');
  const sharerInfo = await viewerReceivedStarted;

  // Viewer 1 requests offer from sharer
  const hostReceivedOfferRequest = new Promise(resolve => {
    host.on('screen:offer-requested', (req) => {
      console.log(`✓ Host received 'screen:offer-requested' from ${req.viewerName} (${req.viewerSocketId})`);
      resolve(req);
    });
  });

  viewer1.emit('screen:request-offer', { sharerSocketId: sharerInfo.socketId });
  const offerReq = await hostReceivedOfferRequest;

  // Host sends WebRTC offer to Viewer 1
  const viewerReceivedOffer = new Promise(resolve => {
    viewer1.on('screen:signal', (signal) => {
      if (signal.signalData.type === 'offer') {
        console.log(`✓ Viewer 1 received WebRTC 'offer' from host (${signal.fromUserName})`);
        resolve(signal);
      }
    });
  });

  const mockOfferSdp = 'v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n';
  host.emit('screen:signal', {
    targetSocketId: offerReq.viewerSocketId,
    signalData: {
      type: 'offer',
      sdp: mockOfferSdp
    }
  });

  await viewerReceivedOffer;

  // Host immediately sends candidate (testing candidate arrival before or after offer)
  const viewerReceivedCandidate = new Promise(resolve => {
    viewer1.on('screen:signal', (signal) => {
      if (signal.signalData.type === 'candidate') {
        console.log(`✓ Viewer 1 received ICE 'candidate' from host`);
        resolve(signal);
      }
    });
  });

  host.emit('screen:signal', {
    targetSocketId: offerReq.viewerSocketId,
    signalData: {
      type: 'candidate',
      candidate: {
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.100 50000 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0
      }
    }
  });

  await viewerReceivedCandidate;

  // Viewer 1 sends answer back to Host
  const hostReceivedAnswer = new Promise(resolve => {
    host.on('screen:signal', (signal) => {
      if (signal.signalData.type === 'answer') {
        console.log(`✓ Host received WebRTC 'answer' from viewer (${signal.fromUserName})`);
        resolve(signal);
      }
    });
  });

  const mockAnswerSdp = 'v=0\r\no=- 654321 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n';
  viewer1.emit('screen:signal', {
    targetSocketId: host.id,
    signalData: {
      type: 'answer',
      sdp: mockAnswerSdp
    }
  });

  await hostReceivedAnswer;

  // 3. Scenario B: Viewer 2 joins room WHILE Host is already actively sharing
  console.log('\n--- Scenario B: Viewer 2 joins room during active broadcast ---');
  const viewer2 = io(serverUrl, { transports: ['websocket'] });
  await new Promise(res => viewer2.on('connect', res));

  const viewer2Joined = new Promise(resolve => {
    viewer2.on('room:joined', (data) => {
      console.log(`✓ Viewer 2 joined room. Active screen sharer:`, data.screenSharer ? data.screenSharer.userName : 'None');
      resolve(data);
    });
  });

  viewer2.emit('room:join', { roomId, userId: 'viewer-2', userName: 'ViewerSneha' });
  const joinData = await viewer2Joined;

  if (!joinData.screenSharer) {
    throw new Error('Expected screenSharer to be present in room:joined data for Viewer 2');
  }

  // Viewer 2 requests offer from active sharer
  const hostReceivedViewer2OfferReq = new Promise(resolve => {
    host.on('screen:offer-requested', (req) => {
      if (req.viewerName === 'ViewerSneha') {
        console.log(`✓ Host received 'screen:offer-requested' from Viewer 2 (${req.viewerName})`);
        resolve(req);
      }
    });
  });

  viewer2.emit('screen:request-offer', { sharerSocketId: joinData.screenSharer.socketId });
  await hostReceivedViewer2OfferReq;

  // Host sends offer to Viewer 2
  const viewer2ReceivedOffer = new Promise(resolve => {
    viewer2.on('screen:signal', (signal) => {
      if (signal.signalData.type === 'offer') {
        console.log(`✓ Viewer 2 received WebRTC 'offer' from host`);
        resolve(signal);
      }
    });
  });

  host.emit('screen:signal', {
    targetSocketId: viewer2.id,
    signalData: {
      type: 'offer',
      sdp: mockOfferSdp
    }
  });

  await viewer2ReceivedOffer;

  // 4. Host stops screen share
  console.log('\n--- Scenario C: Host stops screen share ---');
  const viewersReceivedStopped = Promise.all([
    new Promise(resolve => viewer1.on('screen:stopped', () => {
      console.log('✓ Viewer 1 notified screen:stopped');
      resolve();
    })),
    new Promise(resolve => viewer2.on('screen:stopped', () => {
      console.log('✓ Viewer 2 notified screen:stopped');
      resolve();
    }))
  ]);

  host.emit('screen:stop');
  await viewersReceivedStopped;

  // Cleanup
  host.disconnect();
  viewer1.disconnect();
  viewer2.disconnect();

  console.log('\n🎉 ALL WEBRTC SIGNALING TESTS PASSED SUCCESSFULLY! 🎉\n');
}

runWebRTCSignalingTest().catch(err => {
  console.error('❌ WebRTC Signaling Test Failed:', err);
  process.exit(1);
});
