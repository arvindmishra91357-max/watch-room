# 🚀 Render Pe WatchRoom Deploy Karne Ka Complete Guide

WatchRoom application ko [Render.com](https://render.com) par **100% Free** aur **2 minutes** me deploy karne ke do aasan tarike hain:

---

## Tarika 1: GitHub Se Render Par Deploy (Recommended & Sabse Aasan)

### Step 1: Code Ko GitHub Par Push Karein
Agar aapne is folder ko abhi tak GitHub repository me push nahi kiya hai, to apne terminal me ye commands chalayein:

```bash
git init
git add .
git commit -m "Deploy WatchRoom to Render"
git branch -M main
git remote add origin https://github.com/AAPKA_USERNAME/AAPKA_REPO_NAME.git
git push -u origin main
```

---

### Step 2: Render.com Par New Web Service Banayein
1. [Render.com](https://render.com) par login karein.
2. Dashboard par **New +** button par click karein aur **Web Service** choose karein.
3. Apna GitHub repository select karein (e.g. `Watch-Room`).
4. Settings fill karein:
   - **Name**: `watchroom-live` (ya apni pasand ka koi bhi naam)
   - **Region**: `Oregon (US West)` ya `Singapore`
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. **Environment Variables** (Optional, default settings already configured):
   - `NODE_VERSION` = `20.18.0`
   - `NODE_ENV` = `production`
6. Click **Deploy Web Service**!

---

### Step 3: Ho Gaya! 🎉
2 minute me aapki live URL taiyar ho jayegi, jaise:
```
https://watchroom-live.onrender.com
```

Ab aap is URL ko kisi bhi device (Laptop, Phone, Tablet) par open karke screen share aur live chat kar sakte hain!

---

## Tarika 2: Render Blueprint (1-Click Deploy)

Is project me already `render.yaml` file maujood hai!
1. Render dashboard me **New +** -> **Blueprint** select karein.
2. Apna GitHub repository connect karein.
3. Render automatic `render.yaml` ko padh kar sari settings khud configure kar dega.
4. Click **Apply**!

---

## Important Notes for Render Free Tier:
- **HTTPS & WebSockets**: Render free tier par automatically free SSL/HTTPS milta hai. WebRTC screen sharing and Socket.IO chat HTTPS par best kaam karte hain!
- **Auto Sleep**: Free tier par agar 15 minute tak koi room active na ho to service sleep ho sakti hai. Jaise hi koi URL open karega, 30-50 seconds me restart ho jayegi.
