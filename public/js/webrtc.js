/**
 * WebRTC Module: Screen Sharing & Peer-to-Peer Media Streaming
 * Handles screen capture, mobile browser capability detection, and WebRTC mesh signaling.
 */

(function (window) {
  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  class ScreenShareManager {
    constructor() {
      this.socket = null;
      this.localStream = null;
      this.remoteStream = null;
      this.isBroadcasting = false;
      this.currentSharerSocketId = null;
      this.peerConnections = new Map(); // targetSocketId -> RTCPeerConnection
      this.onStreamActive = null; // callback(stream, sharerInfo, isLocal)
      this.onStreamInactive = null; // callback()
      this.onError = null; // callback(errorMsg)
    }

    init(socket, { onStreamActive, onStreamInactive, onError }) {
      this.socket = socket;
      this.onStreamActive = onStreamActive;
      this.onStreamInactive = onStreamInactive;
      this.onError = onError;
      this.setupSocketListeners();
    }

    /**
     * Check if current browser supports screen sharing
     */
    canShareScreen() {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const hasAPI = Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function');
      return {
        supported: hasAPI && !isMobile,
        isMobile
      };
    }

    setupSocketListeners() {
      if (!this.socket) return;

      // Broadcast received: someone started screen sharing
      this.socket.on('screen:started', (sharerInfo) => {
        this.currentSharerSocketId = sharerInfo.socketId;

        // If I am NOT the sharer, wait for the sharer's WebRTC offer
        if (sharerInfo.socketId !== this.socket.id) {
          console.log(`[WebRTC] ${sharerInfo.userName} started sharing. Waiting for stream...`);
        }
      });

      // Broadcast received: screen sharing ended
      this.socket.on('screen:stopped', () => {
        console.log('[WebRTC] Screen sharing stopped.');
        this.closeAllConnections();
        this.currentSharerSocketId = null;
        if (this.onStreamInactive) {
          this.onStreamInactive();
        }
      });

      // WebRTC Signal from a peer (offer, answer, candidate)
      this.socket.on('screen:signal', async ({ fromSocketId, fromUserName, signalData }) => {
        try {
          await this.handleIncomingSignal(fromSocketId, signalData);
        } catch (err) {
          console.error('[WebRTC] Error handling signal:', err);
        }
      });

      // When a new participant joins while I am sharing, send them an offer
      this.socket.on('room:participant-joined', async (participant) => {
        if (this.isBroadcasting && this.localStream) {
          console.log(`[WebRTC] New viewer ${participant.userName} joined. Initiating WebRTC offer...`);
          await this.createOfferForPeer(participant.socketId);
        }
      });

      // When a participant leaves, clean up their peer connection
      this.socket.on('room:participant-left', ({ socketId }) => {
        if (this.peerConnections.has(socketId)) {
          this.peerConnections.get(socketId).close();
          this.peerConnections.delete(socketId);
        }
      });
    }

    /**
     * Start capturing screen media and broadcast to all current room members
     * @param {Array} currentParticipants
     */
    async startScreenShare(currentParticipants = []) {
      const check = this.canShareScreen();
      if (!check.supported) {
        if (check.isMobile) {
          throw new Error('MOBILE_NOT_SUPPORTED');
        }
        throw new Error('Screen sharing is not supported by your current browser.');
      }

      try {
        // Request display media
        this.localStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'always',
            displaySurface: 'monitor'
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          }
        });

        this.isBroadcasting = true;
        this.currentSharerSocketId = this.socket.id;

        // Handle user stopping stream from native browser bar
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            console.log('[WebRTC] User ended screen share from browser banner.');
            this.stopScreenShare();
          };
        }

        // Notify server that screen sharing has started
        this.socket.emit('screen:start');

        // Immediately show local stream on presenter's screen
        if (this.onStreamActive) {
          this.onStreamActive(this.localStream, { userName: 'You' }, true);
        }

        // Send WebRTC offer to all existing participants in the room
        for (const p of currentParticipants) {
          if (p.socketId !== this.socket.id) {
            await this.createOfferForPeer(p.socketId);
          }
        }

        return this.localStream;
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          console.warn('[WebRTC] Screen share permission cancelled or denied by user.');
          throw new Error('PERMISSION_DENIED');
        }
        console.error('[WebRTC] getDisplayMedia error:', err);
        throw err;
      }
    }

    /**
     * Stop screen sharing, close peers, and notify room
     */
    stopScreenShare() {
      if (!this.isBroadcasting && !this.localStream) return;

      this.isBroadcasting = false;
      this.closeAllConnections();

      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => track.stop());
        this.localStream = null;
      }

      if (this.socket) {
        this.socket.emit('screen:stop');
      }

      if (this.onStreamInactive) {
        this.onStreamInactive();
      }
    }

    /**
     * Create WebRTC connection and send offer to viewer peer
     */
    async createOfferForPeer(targetSocketId) {
      if (!this.localStream) return;

      const pc = this.createPeerConnection(targetSocketId);

      // Add local stream tracks to connection
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });

      // Create and set offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send offer through socket signaling
      this.socket.emit('screen:signal', {
        targetSocketId,
        signalData: {
          type: 'offer',
          sdp: pc.localDescription
        }
      });
    }

    /**
     * Setup an RTCPeerConnection with ICE candidates forwarding
     */
    createPeerConnection(targetSocketId) {
      if (this.peerConnections.has(targetSocketId)) {
        this.peerConnections.get(targetSocketId).close();
        this.peerConnections.delete(targetSocketId);
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      this.peerConnections.set(targetSocketId, pc);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit('screen:signal', {
            targetSocketId,
            signalData: {
              type: 'candidate',
              candidate: event.candidate
            }
          });
        }
      };

      pc.ontrack = (event) => {
        console.log('[WebRTC] Received remote stream track:', event.track.kind);
        const stream = event.streams[0] || new MediaStream([event.track]);
        this.remoteStream = stream;
        if (this.onStreamActive) {
          this.onStreamActive(stream, { userName: 'Presenter' }, false);
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Peer ${targetSocketId} connection state:`, pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          this.peerConnections.delete(targetSocketId);
        }
      };

      return pc;
    }

    /**
     * Handle incoming signals: offer, answer, or ice candidate
     */
    async handleIncomingSignal(fromSocketId, signalData) {
      let pc = this.peerConnections.get(fromSocketId);

      if (signalData.type === 'offer') {
        // Viewer receives offer from presenter
        pc = this.createPeerConnection(fromSocketId);
        await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.socket.emit('screen:signal', {
          targetSocketId: fromSocketId,
          signalData: {
            type: 'answer',
            sdp: pc.localDescription
          }
        });
      } else if (signalData.type === 'answer') {
        // Presenter receives answer from viewer
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
        }
      } else if (signalData.type === 'candidate') {
        // ICE Candidate received
        if (pc && signalData.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
          } catch (err) {
            console.warn('[WebRTC] Failed to add ICE candidate:', err);
          }
        }
      }
    }

    closeAllConnections() {
      for (const pc of this.peerConnections.values()) {
        pc.close();
      }
      this.peerConnections.clear();
      this.remoteStream = null;
    }
  }

  window.ScreenShareManager = new ScreenShareManager();
})(window);
