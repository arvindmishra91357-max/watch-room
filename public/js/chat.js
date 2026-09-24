/**
 * Chat Module: Real-Time Live Messaging
 * Formats messages with sender name, clean message bubble, and exact local time (e.g. 03:15 AM).
 * Differentiates current user ('me') from other participants.
 */

(function (window) {
  class ChatManager {
    constructor() {
      this.container = null;
      this.currentUserId = null;
      this.unreadCount = 0;
      this.isTabActive = true;
      this.onUnreadChange = null;
    }

    init({ container, currentUserId, onUnreadChange }) {
      this.container = container;
      this.currentUserId = currentUserId;
      this.onUnreadChange = onUnreadChange;
    }

    setCurrentUserId(userId) {
      this.currentUserId = userId;
    }

    setTabActive(isActive) {
      this.isTabActive = isActive;
      if (isActive) {
        this.unreadCount = 0;
        if (this.onUnreadChange) this.onUnreadChange(this.unreadCount);
      }
    }

    clearMessages() {
      if (!this.container) return;
      this.container.innerHTML = `
        <div class="chat-start-notice">
          <span class="notice-icon">🔒</span>
          <span>Messages in this room are real-time, encrypted, and persist during your session.</span>
        </div>
      `;
    }

    /**
     * Format timestamp to user's exact local time (e.g. 03:15 AM)
     * @param {string|Date} timestamp
     * @returns {string}
     */
    formatLocalTime(timestamp) {
      if (!timestamp) {
        return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      }
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      }
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    }

    /**
     * Render message into chat feed
     * @param {Object} message { id, senderId, senderName, text, timestamp }
     */
    appendMessage(message) {
      if (!this.container) return;

      const isSystem = message.senderId === 'system';
      const isMe = !isSystem && String(message.senderId) === String(this.currentUserId);
      const timeStr = this.formatLocalTime(message.timestamp);

      if (isSystem) {
        const sysEl = document.createElement('div');
        sysEl.className = 'chat-system-message';
        sysEl.innerHTML = `
          <span>${this.escapeHTML(message.text)}</span>
          <span class="system-time">${timeStr}</span>
        `;
        this.container.appendChild(sysEl);
      } else {
        const row = document.createElement('div');
        row.className = `chat-message-row ${isMe ? 'me' : 'other'}`;

        // Header: Sender Name & Local Time
        const header = document.createElement('div');
        header.className = 'message-header';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'sender-name';
        nameSpan.textContent = isMe ? 'You' : message.senderName;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = timeStr;

        header.appendChild(nameSpan);
        header.appendChild(timeSpan);

        // Bubble: Safe text rendering
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.textContent = message.text; // Text node prevents any script execution / XSS

        row.appendChild(header);
        row.appendChild(bubble);

        this.container.appendChild(row);

        // Update unread count if chat tab is hidden
        if (!this.isTabActive && !isMe) {
          this.unreadCount++;
          if (this.onUnreadChange) this.onUnreadChange(this.unreadCount);
          this.playNotificationSound();
        }
      }

      this.scrollToBottom();
    }

    /**
     * Load existing message history into room
     * @param {Array} messages
     */
    loadHistory(messages = []) {
      this.clearMessages();
      for (const msg of messages) {
        this.appendMessage(msg);
      }
    }

    scrollToBottom() {
      if (!this.container) return;
      this.container.scrollTop = this.container.scrollHeight;
    }

    escapeHTML(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    /**
     * Web Audio gentle notification pop for incoming messages
     */
    playNotificationSound() {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1); // A5

        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.18);
      } catch (e) {
        // Audio might be blocked before first user gesture
      }
    }
  }

  window.ChatManager = new ChatManager();
})(window);
