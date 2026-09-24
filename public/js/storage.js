/**
 * Storage Module: Persistent User Identity Manager
 * Ensures that the user's chosen display name and persistent UUID
 * are stored reliably in localStorage across reloads, browser restarts, and reconnections.
 */

(function (window) {
  const STORAGE_KEY_USERNAME = 'watchroom_username';
  const STORAGE_KEY_USER_ID = 'watchroom_userId';

  // Deterministic avatar color generation
  const AVATAR_COLORS = [
    'linear-gradient(135deg, hsl(245, 86%, 65%), hsl(220, 80%, 55%))',
    'linear-gradient(135deg, hsl(190, 95%, 45%), hsl(160, 80%, 40%))',
    'linear-gradient(135deg, hsl(330, 85%, 60%), hsl(280, 80%, 55%))',
    'linear-gradient(135deg, hsl(38, 95%, 55%), hsl(15, 90%, 55%))',
    'linear-gradient(135deg, hsl(156, 75%, 45%), hsl(180, 80%, 40%))',
    'linear-gradient(135deg, hsl(270, 85%, 65%), hsl(310, 80%, 55%))',
    'linear-gradient(135deg, hsl(210, 90%, 60%), hsl(250, 80%, 60%))'
  ];

  function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'u-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
  }

  const UserStorage = {
    /**
     * Check if a valid username has already been saved
     * @returns {boolean}
     */
    hasSavedUsername() {
      const name = this.getSavedUsername();
      return Boolean(name && name.trim().length >= 2);
    },

    /**
     * Retrieve the permanently saved username from localStorage
     * @returns {string|null}
     */
    getSavedUsername() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_USERNAME);
        if (stored && typeof stored === 'string') {
          const trimmed = stored.trim();
          if (trimmed.length > 0) return trimmed;
        }
      } catch (err) {
        console.warn('[UserStorage] localStorage access error:', err);
      }
      return null;
    },

    /**
     * Save the username permanently in localStorage
     * @param {string} name
     * @returns {string} The saved username
     */
    saveUsername(name) {
      if (!name || typeof name !== 'string') {
        throw new Error('Name must be a valid non-empty string');
      }
      const cleanName = name.trim().slice(0, 30);
      try {
        localStorage.setItem(STORAGE_KEY_USERNAME, cleanName);
      } catch (err) {
        console.warn('[UserStorage] Failed to write username to localStorage:', err);
      }
      return cleanName;
    },

    /**
     * Retrieve or generate a persistent unique ID for this browser device
     * @returns {string}
     */
    getUserId() {
      try {
        let userId = localStorage.getItem(STORAGE_KEY_USER_ID);
        if (!userId) {
          userId = generateUUID();
          localStorage.setItem(STORAGE_KEY_USER_ID, userId);
        }
        return userId;
      } catch (err) {
        return generateUUID();
      }
    },

    /**
     * Get user initials (1 or 2 characters) for the avatar circle
     * @param {string} name
     * @returns {string}
     */
    getInitials(name) {
      if (!name) return '?';
      const clean = name.trim();
      const parts = clean.split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return clean.slice(0, 2).toUpperCase();
    },

    /**
     * Deterministic gradient background based on username
     * @param {string} name
     * @returns {string}
     */
    getUserColor(name) {
      if (!name) return AVATAR_COLORS[0];
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        hash = (hash << 5) - hash + name.charCodeAt(i);
        hash |= 0;
      }
      const index = Math.abs(hash) % AVATAR_COLORS.length;
      return AVATAR_COLORS[index];
    }
  };

  window.UserStorage = UserStorage;
})(window);
