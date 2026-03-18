import { db, ref, set, get, onValue, update, remove, onDisconnect } from './firebase.js';
import { setupMedia, createPeerConnection, createOffer, answerOffer, closeConnection, localStream } from './webrtc.js';

// User System Setup
const userId = crypto.randomUUID ? crypto.randomUUID() : 'user_' + Date.now();
const userCode = Math.floor(100000 + Math.random() * 900000).toString();
let currentCallId = null;
let isVideoMuted = false;
let isAudioMuted = false;
let facingMode = "user"; // Camera mode

// Elements
const homeScreen = document.getElementById('home-screen');
const videoScreen = document.getElementById('video-screen');
const myCodeEl = document.getElementById('my-code');
const statusOverlay = document.getElementById('status-overlay');
const callStatusText = document.getElementById('call-status');

// Init User in Firebase
async function initUser() {
    myCodeEl.innerText = userCode;
    const userRef = ref(db, `users/${userId}`);
    
    // Auto delete on disconnect
    onDisconnect(userRef).remove();

    await set(userRef, {
        code: userCode,
        status: "online",
        incomingCall: null,
        createdAt: Date.now()
    });

    // Listen for incoming calls (Code Match or Random Match)
    onValue(ref(db, `users/${userId}/incomingCall`), async (snapshot) => {
        const callId = snapshot.val();
        if (callId && callId !== currentCallId) {
            currentCallId = callId;
            await joinCall(callId);
        }
    });
}

// 1. Random Chat Matchmaking
document.getElementById('btn-random').addEventListener('click', async () => {
    const hasMedia = await setupMedia();
    if (!hasMedia) return;

    showVideoScreen("Searching for random partner...");
    await update(ref(db, `users/${userId}`), { status: 'waiting' });

    // Find waiting user
    const usersRef = ref(db, 'users');
    const snapshot = await get(usersRef);
    let matchedUserId = null;

    if (snapshot.exists()) {
        snapshot.forEach(child => {
            const user = child.val();
            if (user.status === 'waiting' && child.key !== userId) {
                matchedUserId = child.key;
            }
        });
    }

    if (matchedUserId) {
        // Caller Side
        const callId = `call_${Date.now()}`;
        currentCallId = callId;
        
        // Update both to connected
        await update(ref(db, `users/${userId}`), { status: 'connected' });
        await update(ref(db, `users/${matchedUserId}`), { status: 'connected', incomingCall: callId });

        createPeerConnection(callId, true);
        await createOffer(callId);
    } else {
        // Just wait - logic handled by onValue listener above
        callStatusText.innerText = "Waiting for someone to join...";
    }
});

// 2. Private Chat (Code System)
document.getElementById('btn-private').addEventListener('click', async () => {
    const code = document.getElementById('partner-code').value.trim();
    if (code.length !== 6) {
        Swal.fire('Error', 'Please enter a valid 6-digit code', 'warning');
        return;
    }
    if (code === userCode) {
        Swal.fire('Error', 'You cannot call yourself!', 'error');
        return;
    }

    const hasMedia = await setupMedia();
    if (!hasMedia) return;

    showVideoScreen("Connecting to private chat...");
    
    const usersRef = ref(db, 'users');
    const snapshot = await get(usersRef);
    let matchedUserId = null;

    if (snapshot.exists()) {
        snapshot.forEach(child => {
            if (child.val().code === code) matchedUserId = child.key;
        });
    }

    if (matchedUserId) {
        const callId = `call_${Date.now()}`;
        currentCallId = callId;
        
        await update(ref(db, `users/${userId}`), { status: 'connected' });
        await update(ref(db, `users/${matchedUserId}`), { status: 'connected', incomingCall: callId });

        createPeerConnection(callId, true);
        await createOffer(callId);
    } else {
        Swal.fire('Failed', 'User not found. Check the code and try again.', 'error');
        endCall();
    }
});

// Callee joins the call
async function joinCall(callId) {
    showVideoScreen("Connecting...");
    await update(ref(db, `users/${userId}`), { status: 'connected' });
    
    // Wait for offer to be ready in db
    const checkOffer = setInterval(async () => {
        const offerSnap = await get(ref(db, `calls/${callId}/offer`));
        if (offerSnap.exists()) {
            clearInterval(checkOffer);
            createPeerConnection(callId, false);
            await answerOffer(callId, offerSnap.val());
        }
    }, 500);
}

// Controls
document.getElementById('btn-mute').addEventListener('click', (e) => {
    isAudioMuted = !isAudioMuted;
    localStream.getAudioTracks()[0].enabled = !isAudioMuted;
    e.currentTarget.innerHTML = isAudioMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
    e.currentTarget.style.color = isAudioMuted ? '#ff4757' : 'white';
});

document.getElementById('btn-camera').addEventListener('click', async () => {
    facingMode = facingMode === "user" ? "environment" : "user";
    const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facingMode }, audio: !isAudioMuted });
    
    const videoTrack = newStream.getVideoTracks()[0];
    const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
    if (sender) sender.replaceTrack(videoTrack);
    
    localStream.removeTrack(localStream.getVideoTracks()[0]);
    localStream.addTrack(videoTrack);
    document.getElementById('local-video').srcObject = localStream;
});

// End Call
document.getElementById('btn-end').addEventListener('click', endCall);

// Skip (Random Match)
document.getElementById('btn-skip').addEventListener('click', async () => {
    await endCall();
    setTimeout(() => {
        document.getElementById('btn-random').click();
    }, 500);
});

async function endCall() {
    closeConnection();
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    if (currentCallId) {
        await remove(ref(db, `calls/${currentCallId}`)); // Auto Delete call data
    }
    
    await update(ref(db, `users/${userId}`), { status: 'online', incomingCall: null });
    currentCallId = null;

    videoScreen.classList.remove('active');
    homeScreen.classList.add('active');
    document.getElementById('remote-video').srcObject = null;
    statusOverlay.style.display = 'flex';
}

function showVideoScreen(statusText) {
    homeScreen.classList.remove('active');
    videoScreen.classList.add('active');
    callStatusText.innerText = statusText;
    statusOverlay.style.display = 'flex';
}

// Copy Code
document.getElementById('copy-code-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(userCode);
    Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Code Copied!', showConfirmButton: false, timer: 1500 });
});

// Initialize on Load
initUser();
