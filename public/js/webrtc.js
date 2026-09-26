/**
 * WebRTC Module: Screen Sharing & Peer-to-Peer Media Streaming
 * Handles screen capture, mobile browser capability detection, candidate queuing,
 * and reliable WebRTC mesh signaling with multi-STUN failover.
 */

(function (window) {
  'use strict';

  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ],
    iceCandidatePoolSize: 10
  };

  class ScreenShareManager {
    constructor() {
      this.socket = null;
      this.localStream = null;
      this.remoteStream = null;
      this.isBroadcasting = false;
      this.currentSharerSocketId = null;
      this.currentSharerName = null;
      this.peerConnections = new Map(); // targetSocketId -> RTCPeerConnection
      this.candidateQueues = new Map(); // targetSocketId -> Array<candidateInit>
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
        this.currentSharerName = sharerInfo.userName;

        // If I am NOT the sharer, proactively request offer from the active sharer
        if (sharerInfo.socketId !== this.socket.id) {
          console.log(`[WebRTC] ${sharerInfo.userName} started sharing. Requesting WebRTC stream...`);
          this.requestOfferFromSharer(sharerInfo.socketId);
        }
      });

      // Broadcast received: screen sharing ended
      this.socket.on('screen:stopped', () => {
        console.log('[WebRTC] Screen sharing stopped.');
        this.closeAllConnections();
        this.currentSharerSocketId = null;
        this.currentSharerName = null;
        if (this.onStreamInactive) {
          this.onStreamInactive();
        }
      });

      // WebRTC Signal from a peer (offer, answer, candidate)
      this.socket.on('screen:signal', async ({ fromSocketId, fromUserName, signalData }) => {
        try {
          await this.handleIncomingSignal(fromSocketId, signalData);
        } catch (err) {
          console.error('[WebRTC] Error handling incoming signal:', err);
        }
      });

      // When a viewer explicitly asks for an offer, send them one if we are broadcasting
      this.socket.on('screen:offer-requested', async ({ viewerSocketId, viewerName }) => {
        if (this.isBroadcasting && this.localStream) {
          console.log(`[WebRTC] Offer requested by viewer ${viewerName || viewerSocketId}. Creating offer...`);
          await this.createOfferForPeer(viewerSocketId);
        }
      });

      // When a new participant joins while I am sharing, send them an offer
      this.socket.on('room:participant-joined', async (participant) => {
        if (this.isBroadcasting && this.localStream && participant.socketId !== this.socket.id) {
          console.log(`[WebRTC] New viewer ${participant.userName} joined. Initiating WebRTC offer...`);
          await this.createOfferForPeer(participant.socketId);
        }
      });

      // When a participant leaves, clean up their peer connection and queued candidates
      this.socket.on('room:participant-left', ({ socketId }) => {
        if (this.peerConnections.has(socketId)) {
          try {
            this.peerConnections.get(socketId).close();
          } catch (e) {}
          this.peerConnections.delete(socketId);
        }
        this.candidateQueues.delete(socketId);
      });
    }

    /**
     * Request a WebRTC offer from the active screen sharer
     */
    requestOfferFromSharer(sharerSocketId) {
      if (!this.socket) return;
      const targetId = sharerSocketId || this.currentSharerSocketId;
      if (!targetId || targetId === this.socket.id) return;

      console.log(`[WebRTC] Emitting screen:request-offer to sharer: ${targetId}`);
      this.socket.emit('screen:request-offer', { sharerSocketId: targetId });
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
        // Request display media (try with audio first, fallback to video-only if not permitted)
        try {
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
        } catch (audioErr) {
          console.warn('[WebRTC] Capture with audio failed, falling back to video-only capture:', audioErr);
          this.localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              cursor: 'always',
              displaySurface: 'monitor'
            }
          });
        }

        this.isBroadcasting = true;
        this.currentSharerSocketId = this.socket.id;
        this.currentSharerName = 'You';

        // Handle user stopping stream from native browser floating banner
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
          if (p.socketId && p.socketId !== this.socket.id) {
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
        this.localStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (e) {}
        });
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
      if (!this.localStream || !targetSocketId) return;

      try {
        const pc = this.createPeerConnection(targetSocketId);

        // Add local stream tracks to connection
        this.localStream.getTracks().forEach((track) => {
          pc.addTrack(track, this.localStream);
        });

        // Create and set local offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Send offer through socket signaling
        this.socket.emit('screen:signal', {
          targetSocketId,
          signalData: {
            type: 'offer',
            sdp: pc.localDescription.sdp
          }
        });
        console.log(`[WebRTC] Sent offer to viewer: ${targetSocketId}`);
      } catch (err) {
        console.error(`[WebRTC] Error creating offer for peer ${targetSocketId}:`, err);
      }
    }

    /**
     * Setup an RTCPeerConnection with ICE candidates forwarding and track handler
     */
    createPeerConnection(targetSocketId) {
      if (this.peerConnections.has(targetSocketId)) {
        try {
          this.peerConnections.get(targetSocketId).close();
        } catch (e) {}
        this.peerConnections.delete(targetSocketId);
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      this.peerConnections.set(targetSocketId, pc);

      // Handle local ICE candidates and forward to remote peer
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidateData = event.candidate.toJSON ? event.candidate.toJSON() : event.candidate;
          this.socket.emit('screen:signal', {
            targetSocketId,
            signalData: {
              type: 'candidate',
              candidate: candidateData
            }
          });
        }
      };

      // Handle incoming remote media tracks (viewer side)
      pc.ontrack = (event) => {
        console.log(`[WebRTC] Received remote track (${event.track.kind}) from: ${targetSocketId}`);

        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
        }

        // Remove old track of the same kind if any to avoid stream conflicts
        const existingTracks = this.remoteStream.getTracks().filter((t) => t.kind === event.track.kind);
        existingTracks.forEach((oldTrack) => {
          if (oldTrack.id !== event.track.id) {
            this.remoteStream.removeTrack(oldTrack);
          }
        });

        // Add the incoming track if not already present
        if (!this.remoteStream.getTracks().some((t) => t.id === event.track.id)) {
          this.remoteStream.addTrack(event.track);
        }

        event.track.onended = () => {
          console.log(`[WebRTC] Remote track ended (${event.track.kind})`);
        };

        if (this.onStreamActive) {
          this.onStreamActive(this.remoteStream, { userName: this.currentSharerName || 'Presenter' }, false);
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] Peer ${targetSocketId} ICE connection state: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'failed') {
          console.warn(`[WebRTC] ICE connection failed with ${targetSocketId}. Attempting ICE restart...`);
          if (this.isBroadcasting && typeof pc.restartIce === 'function') {
            pc.restartIce();
          }
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Peer ${targetSocketId} connection state: ${pc.connectionState}`);
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
      if (!signalData || !fromSocketId) return;

      let pc = this.peerConnections.get(fromSocketId);

      if (signalData.type === 'offer') {
        // Viewer receives offer from presenter
        console.log(`[WebRTC] Received offer from ${fromSocketId}. Preparing answer...`);
        pc = this.createPeerConnection(fromSocketId);

        const sdpString = typeof signalData.sdp === 'string' ? signalData.sdp : (signalData.sdp?.sdp || '');
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: 'offer',
          sdp: sdpString
        }));

        // Drain any ICE candidates received before remoteDescription was ready
        await this.drainCandidateQueue(fromSocketId, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.socket.emit('screen:signal', {
          targetSocketId: fromSocketId,
          signalData: {
            type: 'answer',
            sdp: pc.localDescription.sdp
          }
        });
        console.log(`[WebRTC] Sent answer to presenter: ${fromSocketId}`);

      } else if (signalData.type === 'answer') {
        // Presenter receives answer from viewer
        if (pc) {
          console.log(`[WebRTC] Received answer from ${fromSocketId}. Finalizing connection...`);
          const sdpString = typeof signalData.sdp === 'string' ? signalData.sdp : (signalData.sdp?.sdp || '');
          await pc.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: sdpString
          }));

          // Drain any ICE candidates received before remoteDescription was set
          await this.drainCandidateQueue(fromSocketId, pc);
        }

      } else if (signalData.type === 'candidate') {
        // ICE Candidate received
        const candidateData = signalData.candidate;
        if (!candidateData) return;

        // If peer connection exists and remote description is established, add directly
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidateData));
          } catch (err) {
            console.warn('[WebRTC] Failed to add ICE candidate directly:', err);
          }
        } else {
          // Queue the candidate until remoteDescription is set
          if (!this.candidateQueues.has(fromSocketId)) {
            this.candidateQueues.set(fromSocketId, []);
          }
          this.candidateQueues.get(fromSocketId).push(candidateData);
        }
      }
    }

    /**
     * Drains and applies all queued ICE candidates for a peer once remote description is set
     */
    async drainCandidateQueue(socketId, pc) {
      const queue = this.candidateQueues.get(socketId);
      if (queue && queue.length > 0) {
        console.log(`[WebRTC] Draining ${queue.length} queued ICE candidate(s) for ${socketId}`);
        while (queue.length > 0) {
          const candidateData = queue.shift();
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidateData));
          } catch (err) {
            console.warn('[WebRTC] Error adding queued ICE candidate:', err);
          }
        }
      }
      this.candidateQueues.delete(socketId);
    }

    closeAllConnections() {
      for (const [targetId, pc] of this.peerConnections.entries()) {
        try {
          pc.close();
        } catch (e) {}
      }
      this.peerConnections.clear();
      this.candidateQueues.clear();

      if (this.remoteStream) {
        this.remoteStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (e) {}
        });
        this.remoteStream = null;
      }
    }
  }

  window.ScreenShareManager = new ScreenShareManager();
})(window);
