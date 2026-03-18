# T€ÄÇH̾ 𝐕𝚒dєσ🤍 - Realtime WebRTC Video Chat App

A complete, fully client-side, browser-based Random & Private video chat application similar to Omegle, utilizing WebRTC and Firebase Realtime Database. 

## 🌐 Features
1. **Random Matchmaking**: Click "Start Random Chat" to instantly match with another waiting user. Includes a "Skip" button.
2. **Private Code Chat**: Enter your friend's 6-digit auto-generated code to instantly connect securely 1-on-1.
3. **WebRTC Integration**: Ultra-low latency video/audio streams using `RTCPeerConnection`.
4. **Firebase Signaling**: Auto-deletes call data instantly after disconnects.
5. **No Backend Required**: 100% Client-side. No Node.js / Express required.

## 🚀 How to Run Locally

Because the project uses ES6 Modules (`type="module"`), you **cannot** open the `index.html` file directly in the browser via `file://`. You must serve it via a local web server.

**Option 1: VS Code Live Server (Recommended)**
1. Open this project folder in Visual Studio Code.
2. Install the **"Live Server"** extension.
3. Right-click `index.html` and select **"Open with Live Server"**.

**Option 2: Python**
1. Open terminal in the project folder.
2. Run: `python3 -m http.server 8000`
3. Visit `http://localhost:8000` in your browser.

## ☁️ How to Deploy (GitHub Pages / Netlify)

This project is perfectly tailored to be hosted statically.

**Deploy to GitHub Pages:**
1. Create a new repository on GitHub.
2. Upload all files (`index.html`, `style.css`, `.js` files).
3. Go to Repo Settings -> Pages -> Deploy from Branch (`main`).
4. Save and your site will be live instantly!

**Deploy to Netlify:**
1. Go to [Netlify Drop](https://app.netlify.com/drop).
2. Drag and drop this entire project folder.
3. Site is live instantly.

## 🔐 Firebase Setup
This code is already pre-configured with the Firebase credentials provided. If you want to use your own, replace the `firebaseConfig` object in `firebase.js`.

**Firebase Realtime Database Security Rules:**
Go to Firebase Console -> Realtime Database -> Rules and set:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
