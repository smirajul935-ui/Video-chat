import { db, ref, set, get, onValue, update, remove, onDisconnect } from './firebase.js';
import { setupMedia, createPeerConnection, createOffer, answerOffer, closeConnection, localStream, peerConnection } from './webrtc.js';

const userId = crypto.randomUUID ? crypto.randomUUID() : 'user_' + Date.now();
let currentCallId = null;
let currentRoomCode = null; 
let isVideoMuted = false;
let isAudioMuted = false;
let facingMode = "user";

const homeScreen = document.getElementById('home-screen');
const videoScreen = document.getElementById('video-screen');
const statusOverlay = document.getElementById('status-overlay');
const callStatusText = document.getElementById('call-status');
const btnSkip = document.getElementById('btn-skip');

onDisconnect(ref(db, `users/${userId}`)).remove();

// 1. CREATE PRIVATE CHAT
document.getElementById('btn-create-private').addEventListener('click', async () => {
    const hasMedia = await setupMedia();
    if (!hasMedia) return;

    const code = Math.floor(1000 + Math.random() * 9000).toString();
    currentRoomCode = code;
    
    const roomRef = ref(db, `rooms/${code}`);
    await set(roomRef, { hostId: userId, status: 'waiting', createdAt: Date.now() });
    onDisconnect(roomRef).remove();

    showVideoScreen(`
        Room Created Successfully!<br>
        <span style="font-size:1rem; color:#aaa;">Ask your friend to enter this code:</span>
        <span class="generated-code">${code}</span>
        Waiting for friend to join...
    `);
    btnSkip.style.display = 'none';

    onValue(roomRef, async (snapshot) => {
        const data = snapshot.val();
        if (data && data.status === 'connected' && data.callId && data.hostId === userId) {
            currentCallId = data.callId;
            createPeerConnection(currentCallId, true);
            await createOffer(currentCallId);
        }
    });
});

// 2. JOIN PRIVATE CHAT
document.getElementById('btn-join-private').addEventListener('click', async () => {
    const code = document.getElementById('partner-code').value.trim();
    if (code.length !== 4 || isNaN(code)) return Swal.fire('Invalid Code', 'Please enter a valid 4-digit code.', 'warning');

    const roomRef = ref(db, `rooms/${code}`);
    const snapshot = await get(roomRef);

    if (snapshot.exists() && snapshot.val().status === 'waiting') {
        const hasMedia = await setupMedia();
        if (!hasMedia) return;

        currentRoomCode = code;
        const callId = `call_${Date.now()}`;
        currentCallId = callId;

        await update(roomRef, { guestId: userId, status: 'connected', callId: callId });

        showVideoScreen(`Connecting to Room <b style="color:#00f2fe;">${code}</b>...`);
        btnSkip.style.display = 'none';

        const checkOffer = setInterval(async () => {
            const offerSnap = await get(ref(db, `calls/${callId}/offer`));
            if (offerSnap.exists()) {
                clearInterval(checkOffer);
                createPeerConnection(callId, false);
                await answerOffer(callId, offerSnap.val());
            }
        }, 500);
    } else {
        Swal.fire('Error', 'Room not found or already full.', 'error');
    }
});

// 3. RANDOM CHAT
document.getElementById('btn-random').addEventListener('click', async () => {
    const hasMedia = await setupMedia();
    if (!hasMedia) return;

    showVideoScreen("Searching for random partner...");
    btnSkip.style.display = 'block';

    const myUserRef = ref(db, `users/${userId}`);
    await set(myUserRef, { status: 'waiting', incomingCall: null });

    const snapshot = await get(ref(db, 'users'));
    let matchedUserId = null;

    if (snapshot.exists()) {
        snapshot.forEach(child => {
            if (child.val().status === 'waiting' && child.key !== userId) matchedUserId = child.key;
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
        onValue(myUserRef, async (snap) => {
            const data = snap.val();
            if (data && data.incomingCall && data.incomingCall !== currentCallId) {
                currentCallId = data.incomingCall;
                const checkOffer = setInterval(async () => {
                    const offerSnap = await get(ref(db, `calls/${currentCallId}/offer`));
                    if (offerSnap.exists()) {
                        clearInterval(checkOffer);
                        createPeerConnection(currentCallId, false);
                        await answerOffer(currentCallId, offerSnap.val());
                    }
                }, 500);
            }
        });
    }
});

// ==========================================
// FIX: CONTROLS (MUTE, VIDEO OFF/ON, CAMERA SWITCH)
// ==========================================

// Audio Mute/Unmute
document.getElementById('btn-mute').addEventListener('click', (e) => {
    isAudioMuted = !isAudioMuted;
    localStream.getAudioTracks()[0].enabled = !isAudioMuted;
    e.currentTarget.innerHTML = isAudioMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
    e.currentTarget.style.color = isAudioMuted ? '#ff4757' : 'white';
});

// Video Off/On (NEW)
document.getElementById('btn-video').addEventListener('click', (e) => {
    isVideoMuted = !isVideoMuted;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !isVideoMuted; // Toggle video track
    }
    e.currentTarget.innerHTML = isVideoMuted ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
    e.currentTarget.style.color = isVideoMuted ? '#ff4757' : 'white';
});

// Camera Switch Fix (Front/Back)
document.getElementById('btn-camera').addEventListener('click', async () => {
    try {
        // Toggle direction
        facingMode = facingMode === "user" ? "environment" : "user";
        
        // Mobile browsers require stopping the old track before asking for the new one properly
        const oldVideoTrack = localStream.getVideoTracks()[0];
        if (oldVideoTrack) oldVideoTrack.stop();

        // Get new stream only for Video
        const newStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: facingMode }, 
            audio: false 
        });
        
        const newVideoTrack = newStream.getVideoTracks()[0];
        newVideoTrack.enabled = !isVideoMuted; // keep the mute state

        // Replace track in Peer Connection (if connected)
        if (peerConnection) {
            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) sender.replaceTrack(newVideoTrack);
        }
        
        // Update Local Video Element
        localStream.removeTrack(oldVideoTrack);
        localStream.addTrack(newVideoTrack);
        
        const localVideoElement = document.getElementById('local-video');
        localVideoElement.srcObject = localStream;
        
        // If back camera is used, remove the mirror effect (scaleX)
        if (facingMode === "environment") {
            localVideoElement.style.transform = "scaleX(1)";
        } else {
            localVideoElement.style.transform = "scaleX(-1)";
        }

    } catch (error) {
        console.error("Camera switch error:", error);
        Swal.fire('Error', 'Could not switch camera. Device might not support it.', 'error');
        // Revert facingMode variable
        facingMode = facingMode === "user" ? "environment" : "user"; 
    }
});

// End Call
document.getElementById('btn-end').addEventListener('click', endCall);

// Skip Call
document.getElementById('btn-skip').addEventListener('click', async () => {
    await endCall();
    setTimeout(() => { document.getElementById('btn-random').click(); }, 500);
});

async function endCall() {
    closeConnection();
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    if (currentRoomCode) {
        await remove(ref(db, `rooms/${currentRoomCode}`));
        currentRoomCode = null;
    }

    if (currentCallId) {
        await remove(ref(db, `calls/${currentCallId}`));
        currentCallId = null;
    }
    
    await remove(ref(db, `users/${userId}`));

    // Reset UI
    videoScreen.classList.remove('active');
    homeScreen.classList.add('active');
    document.getElementById('remote-video').srcObject = null;
    statusOverlay.style.display = 'flex';

    // Reset Button states
    isVideoMuted = false;
    isAudioMuted = false;
    document.getElementById('btn-video').innerHTML = '<i class="fas fa-video"></i>';
    document.getElementById('btn-video').style.color = 'white';
    document.getElementById('btn-mute').innerHTML = '<i class="fas fa-microphone"></i>';
    document.getElementById('btn-mute').style.color = 'white';
}

function showVideoScreen(htmlContent) {
    homeScreen.classList.remove('active');
    videoScreen.classList.add('active');
    callStatusText.innerHTML = htmlContent;
    statusOverlay.style.display = 'flex';
}
