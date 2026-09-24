# 📺 WatchRoom — Real-Time Virtual Watch & Screen Sharing Platform

A modern, high-performance, real-time **Watch Room / Virtual Room** web application where multiple users can join rooms, share screens via peer-to-peer WebRTC, and chat in real-time with exact local timestamps.

![WatchRoom Banner](https://img.shields.io/badge/WebRTC-Peer--to--Peer-6366f1?style=for-the-badge&logo=webrtc&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-Real--Time-010101?style=for-the-badge&logo=socket.io&logoColor=white)
![Express](https://img.shields.io/badge/Node.js-Express-black?style=for-the-badge&logo=express&logoColor=white)
![Render](https://img.shields.io/badge/Render-Deploy%20Ready-46E3B7?style=for-the-badge&logo=render&logoColor=white)

---

## ✨ Features

- **⚡ True WebRTC Screen Sharing**: Peer-to-peer zero-latency screen capture for entire monitors, application windows, or browser tabs with system audio support.
- **💬 Real-Time Live Chat**: Instant messaging with sender name, "You" indicators, message bubbles, and exact local timestamps (e.g. `08:42 PM`).
- **🔒 Permanent Name Memory**: User display names are permanently saved on the device via persistent storage — no random names or resets on reload.
- **🔄 Live Name Updates**: Renaming updates instantly across all connected participants with in-room system alerts.
- **👥 Multi-User Presence**: Live participant lists with colored initials avatars, online status indicators, and active screen sharing badges.
- **📱 Fully Responsive**: Automatic layout adaptation for Desktops, Laptops, Tablets, and Mobile phones (iOS & Android).
- **🚀 1-Click Render Deployment**: Pre-configured with `render.yaml` for instant free deployment.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, Socket.IO, XSS sanitization
- **Frontend**: HTML5, Vanilla CSS3 (Glassmorphism & CSS Variables), JavaScript (ES6+), WebRTC APIs
- **Database / Persistence**: Server-side JSON store with atomic file sync + Client-side LocalStorage
- **Deployment**: Render Blueprint (`render.yaml`), Docker/Cloud-ready

---

## 🚀 Quick Start (Localhost)

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/arvindmishra91357-max/watch-room.git
   cd watch-room
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the application**:
   ```bash
   npm start
   ```

4. **Open in browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

---

## 🌐 Deploy to Render (100% Free)

This repository includes a [`render.yaml`](render.yaml) file for automated deployment.

1. Go to [Render.com](https://render.com) and log in.
2. Click **New +** ➔ **Web Service**.
3. Connect this GitHub repository (`watch-room`).
4. Set:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
5. Click **Deploy Web Service**!

Detailed deployment instructions in Hindi & English can be found in [DEPLOY_RENDER.md](DEPLOY_RENDER.md).

---

## 📂 Project Structure

```
├── data/
│   └── rooms_db.json         # Persistent server storage for rooms & chat history
├── public/
│   ├── css/
│   │   └── style.css         # Modern dark glassmorphic design system
│   ├── js/
│   │   ├── app.js            # Master orchestrator & UI manager
│   │   ├── chat.js           # Real-time chat & local time formatter
│   │   ├── storage.js        # Persistent identity manager
│   │   └── webrtc.js         # WebRTC screen capture & signaling
│   └── index.html            # Semantic HTML5 layout
├── server/
│   ├── server.js             # Express server & REST endpoints
│   ├── socketHandler.js      # Socket.IO real-time event handlers
│   └── store.js              # Persistent storage controller
├── test/
│   └── socket_test.js        # Automated multi-user integration tests
├── DEPLOY_RENDER.md          # Step-by-step Render guide
├── render.yaml               # Render Blueprint config
└── package.json              # Project dependencies & scripts
```

---

## 📄 License
ISC
