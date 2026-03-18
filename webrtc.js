import { db, ref, set, onValue, remove, update } from './firebase.js';

const servers = {
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
    ]
};

export let localStream;
export let remoteStream;
export let peerConnection;

export async function setupMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('local-video').srcObject = localStream;
        return true;
    } catch (error) {
        console.error("Camera access denied!", error);
        Swal.fire('Error', 'Camera and Microphone access is required.', 'error');
        return false;
    }
}

export function createPeerConnection(callId, isCaller) {
    peerConnection = new RTCPeerConnection(servers);
    remoteStream = new MediaStream();
    document.getElementById('remote-video').srcObject = remoteStream;

    // Add local tracks
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Receive remote tracks
    peerConnection.ontrack = (event) => {
        event.streams[0].getTracks().forEach(track => {
            remoteStream.addTrack(track);
        });
        document.getElementById('status-overlay').style.display = 'none';
        document.getElementById('connect-sound').play().catch(e => console.log(e));
        
        // Show connect toast
        Swal.fire({
            toast: true, position: 'top-end', icon: 'success',
            title: 'User Connected!', showConfirmButton: false, timer: 2000
        });
    };

    // Handle ICE candidates exactly as required by prompt
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            const role = isCaller ? 'caller' : 'callee';
            const candidateRef = ref(db, `calls/${callId}/candidates/${role}_${Date.now()}`);
            set(candidateRef, event.candidate.toJSON());
        }
    };
    
    // Listen for connection state changes
    peerConnection.oniceconnectionstatechange = () => {
        if(peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
            Swal.fire({
                toast: true, position: 'top-end', icon: 'error',
                title: 'User Disconnected', showConfirmButton: false, timer: 2000
            });
            document.getElementById('btn-end').click(); // trigger cleanup
        }
    }
}

export async function createOffer(callId) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const callRef = ref(db, `calls/${callId}/offer`);
    await set(callRef, { type: offer.type, sdp: offer.sdp });

    // Listen for answer
    onValue(ref(db, `calls/${callId}/answer`), (snapshot) => {
        const data = snapshot.val();
        if (data && !peerConnection.currentRemoteDescription) {
            const answerDescription = new RTCSessionDescription(data);
            peerConnection.setRemoteDescription(answerDescription);
        }
    });

    // Listen for callee candidates
    onValue(ref(db, `calls/${callId}/candidates`), (snapshot) => {
        snapshot.forEach((child) => {
            if (child.key.startsWith('callee_')) {
                const candidate = new RTCIceCandidate(child.val());
                peerConnection.addIceCandidate(candidate).catch(e=>console.log(e));
            }
        });
    });
}

export async function answerOffer(callId, offerData) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offerData));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    const callRef = ref(db, `calls/${callId}/answer`);
    await set(callRef, { type: answer.type, sdp: answer.sdp });

    // Listen for caller candidates
    onValue(ref(db, `calls/${callId}/candidates`), (snapshot) => {
        snapshot.forEach((child) => {
            if (child.key.startsWith('caller_')) {
                const candidate = new RTCIceCandidate(child.val());
                peerConnection.addIceCandidate(candidate).catch(e=>console.log(e));
            }
        });
    });
}

export function closeConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
        }
