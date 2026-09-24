@echo off
set "PATH=C:\Users\arvin\AppData\Local\Programs\Git\cmd;C:\Users\arvin\AppData\Local\Programs\gh\bin;%PATH%"

echo [1/5] Initializing Git repository...
git init
git config user.name "Arvind Mishra"
git config user.email "arvindmishra91357@gmail.com"
git branch -M main

echo [2/5] Staging files...
git add .

echo [3/5] Checking status...
git status -s

echo [4/5] Committing files...
git commit -m "Initial commit: Real-time WatchRoom with WebRTC screen sharing and live chat"

echo [5/5] Creating remote repository on GitHub and pushing...
gh repo create watch-room --public --source=. --remote=origin --push

echo Done!
