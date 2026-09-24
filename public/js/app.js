/**
 * Main Application Orchestrator
 * Connects UserStorage, ScreenShareManager, ChatManager, and Socket.IO.
 */

(function () {
  'use strict';

  // State
  let socket = null;
  let currentRoomId = null;
  let currentRoomName = null;
  let currentParticipants = [];
  let isSharingLocalScreen = false;

  // DOM Elements - Global & Header
  const lobbyView = document.getElementById('lobbyView');
  const roomView = document.getElementById('roomView');
  const brandLogoLink = document.getElementById('brandLogoLink');
  const headerRoomInfo = document.getElementById('headerRoomInfo');
  const headerRoomName = document.getElementById('headerRoomName');
  const headerRoomCodeText = document.getElementById('headerRoomCodeText');
  const headerRoomBadge = document.getElementById('headerRoomBadge');
  const headerRoomActions = document.getElementById('headerRoomActions');
  const headerCopyLinkBtn = document.getElementById('headerCopyLinkBtn');
  const headerLeaveRoomBtn = document.getElementById('headerLeaveRoomBtn');
  const headerUserAvatar = document.getElementById('headerUserAvatar');
  const headerUserName = document.getElementById('headerUserName');
  const btnOpenChangeName = document.getElementById('btnOpenChangeName');

  // DOM Elements - Lobby
  const lobbyUserAvatar = document.getElementById('lobbyUserAvatar');
  const lobbyUserName = document.getElementById('lobbyUserName');
  const lobbyChangeNameBtn = document.getElementById('lobbyChangeNameBtn');
  const createRoomForm = document.getElementById('createRoomForm');
  const createRoomNameInput = document.getElementById('createRoomNameInput');
  const createCustomCodeInput = document.getElementById('createCustomCodeInput');
  const joinRoomForm = document.getElementById('joinRoomForm');
  const joinRoomCodeInput = document.getElementById('joinRoomCodeInput');

  // DOM Elements - Watch Room Stage
  const roomStageName = document.getElementById('roomStageName');
  const roomStageCode = document.getElementById('roomStageCode');
  const stageCopyCodePill = document.getElementById('stageCopyCodePill');
  const presenceCountText = document.getElementById('presenceCountText');
  const sharingLiveBadge = document.getElementById('sharingLiveBadge');
  const theaterWrapper = document.getElementById('theaterWrapper');
  const mainScreenVideo = document.getElementById('mainScreenVideo');
  const presenterOverlay = document.getElementById('presenterOverlay');
  const presenterOverlayText = document.getElementById('presenterOverlayText');
  const noStreamPlaceholder = document.getElementById('noStreamPlaceholder');
  const emptyStateShareBtn = document.getElementById('emptyStateShareBtn');
  const videoFloatingControls = document.getElementById('videoFloatingControls');
  const btnToggleFullscreen = document.getElementById('btnToggleFullscreen');
  const btnTogglePip = document.getElementById('btnTogglePip');
  const btnToggleAudio = document.getElementById('btnToggleAudio');
  const audioIconOn = document.getElementById('audioIconOn');
  const audioIconMuted = document.getElementById('audioIconMuted');

  // DOM Elements - Stage Bottom Dock
  const btnToggleShareScreen = document.getElementById('btnToggleShareScreen');
  const shareIconStart = document.getElementById('shareIconStart');
  const shareIconStop = document.getElementById('shareIconStop');
  const shareBtnLabel = document.getElementById('shareBtnLabel');
  const btnDockCopyLink = document.getElementById('btnDockCopyLink');
  const btnDockLeaveRoom = document.getElementById('btnDockLeaveRoom');
  const btnMobileToggleSidebar = document.getElementById('btnMobileToggleSidebar');
  const mobileUnreadBadge = document.getElementById('mobileUnreadBadge');

  // DOM Elements - Sidebar & Chat
  const roomSidebar = document.getElementById('roomSidebar');
  const tabBtnChat = document.getElementById('tabBtnChat');
  const tabBtnParticipants = document.getElementById('tabBtnParticipants');
  const chatTab = document.getElementById('chatTab');
  const participantsTab = document.getElementById('participantsTab');
  const chatTabUnreadBadge = document.getElementById('chatTabUnreadBadge');
  const participantsTabCount = document.getElementById('participantsTabCount');
  const participantsTotalNum = document.getElementById('participantsTotalNum');
  const participantsList = document.getElementById('participantsList');
  const btnMobileCloseSidebar = document.getElementById('btnMobileCloseSidebar');
  const chatMessagesContainer = document.getElementById('chatMessagesContainer');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');

  // DOM Elements - Modals & Toasts
  const nameOnboardingModal = document.getElementById('nameOnboardingModal');
  const onboardingNameForm = document.getElementById('onboardingNameForm');
  const onboardingNameInput = document.getElementById('onboardingNameInput');
  const changeNameModal = document.getElementById('changeNameModal');
  const changeNameForm = document.getElementById('changeNameForm');
  const changeNameInput = document.getElementById('changeNameInput');
  const btnCancelChangeName = document.getElementById('btnCancelChangeName');
  const mobileWarningModal = document.getElementById('mobileWarningModal');
  const btnDismissMobileWarning = document.getElementById('btnDismissMobileWarning');
  const toastContainer = document.getElementById('toastContainer');

  // ==========================================================================
  // Initialization Flow
  // ==========================================================================
  function initApp() {
    setupChatManager();
    setupEventListeners();
    refreshUserIdentityUI();

    // Check if user has already set a name
    if (!UserStorage.hasSavedUsername()) {
      showOnboardingModal();
    } else {
      checkUrlForRoom();
    }
  }

  function setupChatManager() {
    ChatManager.init({
      container: chatMessagesContainer,
      currentUserId: UserStorage.getUserId(),
      onUnreadChange: (count) => {
        if (count > 0) {
          chatTabUnreadBadge.textContent = count;
          chatTabUnreadBadge.classList.remove('hidden');
          mobileUnreadBadge.textContent = count;
          mobileUnreadBadge.classList.remove('hidden');
        } else {
          chatTabUnreadBadge.classList.add('hidden');
          mobileUnreadBadge.classList.add('hidden');
        }
      }
    });
  }

  // ==========================================================================
  // User Identity UI Sync
  // ==========================================================================
  function refreshUserIdentityUI() {
    const savedName = UserStorage.getSavedUsername() || 'Friend';
    const initials = UserStorage.getInitials(savedName);
    const colorGradient = UserStorage.getUserColor(savedName);

    // Update Header Avatar & Name
    headerUserName.textContent = savedName;
    headerUserAvatar.textContent = initials;
    headerUserAvatar.style.background = colorGradient;

    // Update Lobby Avatar & Name
    lobbyUserName.textContent = savedName;
    lobbyUserAvatar.textContent = initials;
    lobbyUserAvatar.style.background = colorGradient;

    // Sync ChatManager
    ChatManager.setCurrentUserId(UserStorage.getUserId());
  }

  function showOnboardingModal() {
    nameOnboardingModal.classList.remove('hidden');
    setTimeout(() => onboardingNameInput.focus(), 100);
  }

  function hideOnboardingModal() {
    nameOnboardingModal.classList.add('hidden');
  }

  function openChangeNameModal() {
    const current = UserStorage.getSavedUsername() || '';
    changeNameInput.value = current;
    changeNameModal.classList.remove('hidden');
    setTimeout(() => changeNameInput.focus(), 100);
  }

  function closeChangeNameModal() {
    changeNameModal.classList.add('hidden');
  }

  // ==========================================================================
  // URL Routing & Room Query Detection
  // ==========================================================================
  function checkUrlForRoom() {
    const params = new URLSearchParams(window.location.search);
    const roomFromQuery = params.get('room');

    if (roomFromQuery) {
      joinRoom(roomFromQuery);
      return;
    }

    // Check pathname: /room/:id
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts[0] === 'room' && pathParts[1]) {
      joinRoom(pathParts[1]);
    }
  }

  function updateBrowserUrl(roomId) {
    if (roomId) {
      const newUrl = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
      window.history.pushState({ roomId }, '', newUrl);
    } else {
      window.history.pushState({}, '', window.location.origin + '/');
    }
  }

  // ==========================================================================
  // Socket Connection & Room Lifecycle
  // ==========================================================================
  function connectSocket() {
    if (socket && socket.connected) return socket;

    socket = io();

    socket.on('connect', () => {
      console.log('[Socket] Connected to server with ID:', socket.id);
      if (currentRoomId) {
        socket.emit('room:join', {
          roomId: currentRoomId,
          userId: UserStorage.getUserId(),
          userName: UserStorage.getSavedUsername()
        });
      }
    });

    socket.on('disconnect', () => {
      console.warn('[Socket] Disconnected from server');
      showToast('Connection lost. Reconnecting...', 'error');
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err);
    });

    socket.on('error:message', ({ message }) => {
      showToast(message, 'error');
    });

    // Room joined response
    socket.on('room:joined', (data) => {
      currentRoomName = data.room.name;
      currentParticipants = data.participants;

      // Update room UI headers
      updateRoomHeaderUI(data.room.id, data.room.name);
      renderParticipantsList(data.participants);

      // Load persistent chat history
      ChatManager.loadHistory(data.messages);

      // Initialize WebRTC with this socket
      setupWebRTC(socket);

      // If someone is already sharing screen, show live banner
      if (data.screenSharer) {
        handleRemoteScreenActive(data.screenSharer.userName);
      } else {
        handleScreenInactive();
      }

      showToast(`Welcome to ${data.room.name}!`, 'success');
    });

    // Participants list updated
    socket.on('room:participants-updated', (participants) => {
      currentParticipants = participants;
      renderParticipantsList(participants);
    });

    // Chat message received
    socket.on('chat:message', (message) => {
      ChatManager.appendMessage(message);
    });

    // User renamed
    socket.on('user:name-changed', ({ userId, oldName, newName }) => {
      if (userId === UserStorage.getUserId()) {
        showToast(`Your name is now ${newName}`, 'success');
      }
    });

    return socket;
  }

  function setupWebRTC(sock) {
    ScreenShareManager.init(sock, {
      onStreamActive: (stream, sharerInfo, isLocal) => {
        isSharingLocalScreen = isLocal;
        mainScreenVideo.srcObject = stream;
        mainScreenVideo.classList.remove('hidden');
        noStreamPlaceholder.classList.add('hidden');
        videoFloatingControls.classList.remove('hidden');
        sharingLiveBadge.classList.remove('hidden');

        presenterOverlay.classList.remove('hidden');
        presenterOverlayText.textContent = isLocal
          ? 'You are sharing your screen'
          : `${sharerInfo.userName || 'Someone'} is sharing their screen`;

        updateShareButtonState(isLocal);
      },
      onStreamInactive: () => {
        handleScreenInactive();
      },
      onError: (errMsg) => {
        showToast(errMsg, 'error');
      }
    });
  }

  function handleRemoteScreenActive(sharerName) {
    presenterOverlay.classList.remove('hidden');
    presenterOverlayText.textContent = `${sharerName} is sharing their screen`;
    sharingLiveBadge.classList.remove('hidden');
    noStreamPlaceholder.classList.add('hidden');
    mainScreenVideo.classList.remove('hidden');
    videoFloatingControls.classList.remove('hidden');
  }

  function handleScreenInactive() {
    isSharingLocalScreen = false;
    mainScreenVideo.srcObject = null;
    mainScreenVideo.classList.add('hidden');
    videoFloatingControls.classList.add('hidden');
    presenterOverlay.classList.add('hidden');
    sharingLiveBadge.classList.add('hidden');
    noStreamPlaceholder.classList.remove('hidden');
    updateShareButtonState(false);
  }

  function updateShareButtonState(isBroadcasting) {
    if (isBroadcasting) {
      btnToggleShareScreen.classList.remove('btn-primary');
      btnToggleShareScreen.classList.add('btn-danger-outline');
      shareIconStart.classList.add('hidden');
      shareIconStop.classList.remove('hidden');
      shareBtnLabel.textContent = 'Stop Sharing';
    } else {
      btnToggleShareScreen.classList.remove('btn-danger-outline');
      btnToggleShareScreen.classList.add('btn-primary');
      shareIconStart.classList.remove('hidden');
      shareIconStop.classList.add('hidden');
      shareBtnLabel.textContent = 'Share Screen';
    }
  }

  // ==========================================================================
  // Room Actions (Create, Join, Leave, Copy Link)
  // ==========================================================================
  async function createRoom(roomName, customCode) {
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName,
          customCode,
          hostId: UserStorage.getUserId(),
          hostName: UserStorage.getSavedUsername()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create room');
      }

      joinRoom(data.room.id);
    } catch (err) {
      console.error('[App] Create room error:', err);
      showToast(err.message || 'Failed to create room', 'error');
    }
  }

  function joinRoom(roomId) {
    if (!roomId) return;
    const cleanId = String(roomId).trim().toLowerCase();

    currentRoomId = cleanId;
    updateBrowserUrl(cleanId);

    // Switch view to Room
    lobbyView.classList.add('hidden');
    roomView.classList.remove('hidden');
    headerRoomInfo.classList.remove('hidden');
    headerRoomActions.classList.remove('hidden');
    headerLeaveRoomBtn.classList.remove('hidden');

    // Connect socket and join
    const sock = connectSocket();
    if (sock.connected) {
      sock.emit('room:join', {
        roomId: cleanId,
        userId: UserStorage.getUserId(),
        userName: UserStorage.getSavedUsername()
      });
    }
  }

  function leaveRoom() {
    if (!currentRoomId) return;

    // Stop screen share if active
    if (isSharingLocalScreen) {
      ScreenShareManager.stopScreenShare();
    }

    if (socket) {
      socket.emit('room:leave');
    }

    currentRoomId = null;
    currentRoomName = null;
    currentParticipants = [];

    // Switch view to Lobby
    roomView.classList.add('hidden');
    headerRoomInfo.classList.add('hidden');
    headerRoomActions.classList.add('hidden');
    headerLeaveRoomBtn.classList.add('hidden');
    lobbyView.classList.remove('hidden');

    updateBrowserUrl(null);
    showToast('You left the room.', 'success');
  }

  function copyRoomLink() {
    if (!currentRoomId) return;
    const url = `${window.location.origin}/?room=${encodeURIComponent(currentRoomId)}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => showToast('Room link copied to clipboard! 📋', 'success'))
        .catch(() => fallbackCopyText(url));
    } else {
      fallbackCopyText(url);
    }
  }

  function fallbackCopyText(text) {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand('copy');
      showToast('Room link copied to clipboard! 📋', 'success');
    } catch (e) {
      showToast('Could not copy link automatically.', 'error');
    }
    document.body.removeChild(input);
  }

  function updateRoomHeaderUI(roomId, roomName) {
    headerRoomName.textContent = roomName;
    headerRoomCodeText.textContent = roomId.toUpperCase();
    roomStageName.textContent = roomName;
    roomStageCode.textContent = roomId.toUpperCase();
  }

  // ==========================================================================
  // Participants List Rendering
  // ==========================================================================
  function renderParticipantsList(participants = []) {
    const count = participants.length;
    presenceCountText.textContent = `${count} Online`;
    participantsTabCount.textContent = count;
    participantsTotalNum.textContent = count;

    participantsList.innerHTML = '';

    for (const p of participants) {
      const isMe = String(p.userId) === String(UserStorage.getUserId());
      const initials = UserStorage.getInitials(p.userName);
      const avatarBg = UserStorage.getUserColor(p.userName);

      const li = document.createElement('li');
      li.className = 'participant-item';

      li.innerHTML = `
        <div class="participant-left">
          <div class="participant-avatar" style="background: ${avatarBg}">${initials}</div>
          <div class="participant-info">
            <div class="participant-name-row">
              <span class="participant-name">${escapeHTML(p.userName)}</span>
              ${isMe ? '<span class="you-tag">You</span>' : ''}
            </div>
            <span class="participant-status-text">
              <span class="status-dot-sm"></span>
              Online
            </span>
          </div>
        </div>
        ${p.isSharingScreen ? '<span class="participant-screen-badge">🖥️ Sharing</span>' : ''}
      `;

      participantsList.appendChild(li);
    }
  }

  // ==========================================================================
  // Event Listeners Setup
  // ==========================================================================
  function setupEventListeners() {
    // 1. First Visit Onboarding Form
    onboardingNameForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const rawName = onboardingNameInput.value.trim();
      if (rawName.length < 2) {
        showToast('Please enter at least 2 characters', 'error');
        return;
      }

      UserStorage.saveUsername(rawName);
      refreshUserIdentityUI();
      hideOnboardingModal();
      showToast(`Welcome, ${rawName}!`, 'success');

      // Check if URL has a pending room to join
      checkUrlForRoom();
    });

    // 2. Change Name Modal
    btnOpenChangeName.addEventListener('click', openChangeNameModal);
    lobbyChangeNameBtn.addEventListener('click', openChangeNameModal);
    btnCancelChangeName.addEventListener('click', closeChangeNameModal);

    changeNameForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const newName = changeNameInput.value.trim();
      if (newName.length < 2) {
        showToast('Please enter at least 2 characters', 'error');
        return;
      }

      const saved = UserStorage.saveUsername(newName);
      refreshUserIdentityUI();
      closeChangeNameModal();

      // If active in a room, notify socket server
      if (socket && currentRoomId) {
        socket.emit('user:change-name', { newName: saved });
      }

      showToast(`Name updated to ${saved}!`, 'success');
    });

    // 3. Create Room Form
    createRoomForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = createRoomNameInput.value.trim();
      const code = createCustomCodeInput.value.trim();
      createRoom(name, code);
    });

    // 4. Join Room Form
    joinRoomForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = joinRoomCodeInput.value.trim();
      if (!raw) return;

      let extractedCode = raw;
      // Handle pasted full URL: http://domain.com/?room=xyz or /room/xyz
      try {
        if (raw.includes('http://') || raw.includes('https://')) {
          const parsed = new URL(raw);
          const qRoom = parsed.searchParams.get('room');
          if (qRoom) {
            extractedCode = qRoom;
          } else {
            const parts = parsed.pathname.split('/').filter(Boolean);
            if (parts[0] === 'room' && parts[1]) {
              extractedCode = parts[1];
            }
          }
        }
      } catch (err) {}

      joinRoom(extractedCode);
    });

    // 5. Copy Link Buttons
    headerCopyLinkBtn.addEventListener('click', copyRoomLink);
    btnDockCopyLink.addEventListener('click', copyRoomLink);
    headerRoomBadge.addEventListener('click', copyRoomLink);
    stageCopyCodePill.addEventListener('click', copyRoomLink);

    // 6. Leave Room Buttons
    headerLeaveRoomBtn.addEventListener('click', leaveRoom);
    btnDockLeaveRoom.addEventListener('click', leaveRoom);
    brandLogoLink.addEventListener('click', (e) => {
      if (currentRoomId) {
        e.preventDefault();
        leaveRoom();
      }
    });

    // 7. Screen Sharing Toggle Button
    const triggerShareScreen = async () => {
      if (isSharingLocalScreen) {
        ScreenShareManager.stopScreenShare();
      } else {
        try {
          await ScreenShareManager.startScreenShare(currentParticipants);
        } catch (err) {
          if (err.message === 'MOBILE_NOT_SUPPORTED') {
            mobileWarningModal.classList.remove('hidden');
          } else if (err.message === 'PERMISSION_DENIED') {
            showToast('Screen sharing permission cancelled.', 'error');
          } else {
            showToast(err.message || 'Could not start screen sharing.', 'error');
          }
        }
      }
    };

    btnToggleShareScreen.addEventListener('click', triggerShareScreen);
    emptyStateShareBtn.addEventListener('click', triggerShareScreen);
    btnDismissMobileWarning.addEventListener('click', () => {
      mobileWarningModal.classList.add('hidden');
    });

    // 8. Chat Form Submit
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;

      if (!socket || !currentRoomId) {
        showToast('You are not currently in a room.', 'error');
        return;
      }

      socket.emit('chat:send', { text });
      chatInput.value = '';
      chatInput.focus();
    });

    // 9. Quick Emoji Buttons
    document.querySelectorAll('.quick-emoji-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const emoji = btn.getAttribute('data-emoji');
        chatInput.value += emoji;
        chatInput.focus();
      });
    });

    // 10. Sidebar Tab Switches
    tabBtnChat.addEventListener('click', () => {
      tabBtnChat.classList.add('active');
      tabBtnParticipants.classList.remove('active');
      chatTab.classList.add('active');
      participantsTab.classList.remove('active');
      ChatManager.setTabActive(true);
    });

    tabBtnParticipants.addEventListener('click', () => {
      tabBtnParticipants.classList.add('active');
      tabBtnChat.classList.remove('active');
      participantsTab.classList.add('active');
      chatTab.classList.remove('active');
      ChatManager.setTabActive(false);
    });

    // 11. Mobile Drawer
    btnMobileToggleSidebar.addEventListener('click', () => {
      roomSidebar.classList.toggle('mobile-open');
      if (roomSidebar.classList.contains('mobile-open')) {
        ChatManager.setTabActive(true);
      }
    });

    btnMobileCloseSidebar.addEventListener('click', () => {
      roomSidebar.classList.remove('mobile-open');
    });

    // 12. Floating Video Controls
    btnToggleFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        theaterWrapper.requestFullscreen().catch(err => {
          showToast(`Error attempting to enable fullscreen: ${err.message}`, 'error');
        });
      } else {
        document.exitFullscreen();
      }
    });

    btnTogglePip.addEventListener('click', async () => {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled && mainScreenVideo) {
        try {
          await mainScreenVideo.requestPictureInPicture();
        } catch (e) {
          showToast('Picture-in-Picture failed: ' + e.message, 'error');
        }
      }
    });

    btnToggleAudio.addEventListener('click', () => {
      mainScreenVideo.muted = !mainScreenVideo.muted;
      if (mainScreenVideo.muted) {
        audioIconOn.classList.add('hidden');
        audioIconMuted.classList.remove('hidden');
      } else {
        audioIconOn.classList.remove('hidden');
        audioIconMuted.classList.add('hidden');
      }
    });

    // Popstate (Back button navigation)
    window.addEventListener('popstate', (e) => {
      if (e.state && e.state.roomId) {
        joinRoom(e.state.roomId);
      } else if (currentRoomId) {
        leaveRoom();
      }
    });
  }

  // ==========================================================================
  // Toast Notifications
  // ==========================================================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="toast-icon"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="toast-icon"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    } else {
      iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="toast-icon"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `
      ${iconSvg}
      <span>${escapeHTML(message)}</span>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 3000);
  }

  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Kick off application
  document.addEventListener('DOMContentLoaded', initApp);
})();
