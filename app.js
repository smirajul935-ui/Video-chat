import { db, ref, set, get, onValue, update, remove, onDisconnect } from './firebase.js';
import { setupMedia, createPeerConnection, createOffer, answerOffer, closeConnection, localStream } from './webrtc.js';

// User System
const userId = crypto.randomUUID ? crypto.randomUUID() : 'user_' + Date.now();
let currentCallId = null;
let currentRoomCode = null; // Store 4-digit code if user is in private room
let isVideoMuted = false;
let isAudioMuted = false;
let facingMode = "user";

// DOM Elements
const homeScreen = document.getElementById('home-screen');
const videoScreen = document.getElementById('video-screen');
const statusOverlay = document.getElementById('status-overlay');
const callStatusText = document.getElementById('call-status');
const btnSkip = document.getElementById('btn-skip');

// Auto delete user presence on disconnect
onDisconnect(ref(db, `users/${userId}`)).remove();

// ==========================================
// 1. CREATE PRIVATE CHAT (Generates 4-digit Code)
// ==========================================
document.getElementById('btn-create-private').addEventListener('click', async () => {
    const hasMedia = await setupMedia();
    if (!hasMedia) return;

    // Generate 4-digit random code
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    currentRoomCode = code;
    
    // Save Room in Firebase
    const roomRef = ref(db, `rooms/${code}`);
    await set(roomRef, {
        hostId: userId,
        status: 'waiting',
        createdAt: Date.now()
    });

    // Auto delete room if host closes tab
    onDisconnect(roomRef).remove();

    // Show beautiful waiting screen with the code
    showVideoScreen(`
        Room Created Successfully!<br>
        <span style="font-size:1rem; color:#aaa;">Ask your friend to enter this code:</span>
        <span class="generated-code">${code}</span>
        Waiting for friend to join...
    `);
    btnSkip.style.display = 'none';

    // Listen for guest to join
    onValue(roomRef, async (snapshot) => {
        const data = snapshot.val();
        if (data && data.status === 'connected' && data.callId && data.hostId === userId) {
            currentCallId = data.callId;
            createPeerConnection(currentCallId, true); // Host becomes caller
            await createOffer(currentCallId);
        }
    });
});

// ==========================================
// 2. JOIN PRIVATE CHAT
// ==========================================
document.getElementById('btn-join-private').addEventListener('click', async () => {
    const code = document.getElementById('partner-code').value.trim();
    
    if (code.length !== 4 || isNaN(code)) {
        return Swal.fire('Invalid Code', 'Please enter a valid 4-digit code.', 'warning');
    }

    const roomRef = ref(db, `rooms/${code}`);
    const snapshot = await get(roomRef);

    if (snapshot.exists() && snapshot.val().status === 'waiting') {
        const hasMedia = await setupMedia();
        if (!hasMedia) return;

        currentRoomCode = code;
        const callId = `call_${Date.now()}`;
        currentCallId = callId;

        // Update room status to connected
        await update(roomRef, {
            guestId: userId,
            status: 'connected',
            callId: callId
        });

        showVideoScreen(`Connecting to Room <b style="color:#00f2fe;">${code}</b>...`);
        btnSkip.style.display = 'none';

        // Wait for host to create offer
        const checkOffer = setInterval(async () => {
            const offerSnap = await get(ref(db, `calls/${callId}/offer`));
            if (offerSnap.exists()) {
                clearInterval(checkOffer);
                createPeerConnection(callId, false); // Guest is callee
                await answerOffer(callId, offerSnap.val());
            }
        }, 500);

    } else {
        Swal.fire('Error', 'Room not found or already full.', 'error');
    }
});

// ==========================================
// 3. RANDOM CHAT (Omegle Style)
// ==========================================
document.getElementById('btn-random').addEventListener('click', async () => {
    const hasMedia = await setupMedia();
    if (!hasMedia) return;

    showVideoScreen("Searching for random partner...");
    btnSkip.style.display = 'block';

    const myUserRef = ref(db, `users/${userId}`);
    await set(myUserRef, { status: 'waiting', incomingCall: null });

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
        const callId = `call_${Date.now()}`;
        currentCallId = callId;
        
        await update(ref(db, `users/${userId}`), { status: 'connected' });
        await update(ref(db, `users/${matchedUserId}`), { status: 'connected', incomingCall: callId });

        createPeerConnection(callId, true);
        await createOffer(callId);
    } else {
        // Wait for someone else to find us
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
// CONTROLS & CLEANUP
// ==========================================
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

document.getElementById('btn-end').addEventListener('click', endCall);

document.getElementById('btn-skip').addEventListener('click', async () => {
    await endCall();
    setTimeout(() => { document.getElementById('btn-random').click(); }, 500);
});

async function endCall() {
    closeConnection();
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    // Delete Private Room if existed
    if (currentRoomCode) {
        await remove(ref(db, `rooms/${currentRoomCode}`));
        currentRoomCode = null;
    }

    // Delete Call Signaling Data
    if (currentCallId) {
        await remove(ref(db, `calls/${currentCallId}`));
        currentCallId = null;
    }
    
    // Reset User Status
    await remove(ref(db, `users/${userId}`));

    // Reset UI
    videoScreen.classList.remove('active');
    homeScreen.classList.add('active');
    document.getElementById('remote-video').srcObject = null;
    statusOverlay.style.display = 'flex';
}

function showVideoScreen(htmlContent) {
    homeScreen.classList.remove('active');
    videoScreen.classList.add('active');
    callStatusText.innerHTML = htmlContent;
    statusOverlay.style.display = 'flex';
}
