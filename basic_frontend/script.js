const joinBtn = document.getElementById("joinBtn");
const roomIdInput = document.getElementById("roomId");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

let pc;       // RTCPeerConnection
let ws;       // WebSocket signaling
let localStream;

async function initWebRTC(roomId) {
    ws = new WebSocket(`ws://${location.hostname}:8000/ws/${roomId}`);

    pc = new RTCPeerConnection();

    // Handle remote stream
    pc.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    // Send ICE candidates to signaling server
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
        }
    };

    // WebSocket signaling handler
    ws.onmessage = async (msg) => {
        let data = JSON.parse(msg.data);

        if (data.type === "offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: "answer", answer }));
        } else if (data.type === "answer") {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else if (data.type === "candidate") {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (err) {
                console.error("Error adding received ICE candidate", err);
            }
        }
    };

    // Capture local stream
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // Create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.onopen = () => {
        ws.send(JSON.stringify({ type: "offer", offer }));
    };
}

joinBtn.onclick = () => {
    const roomId = roomIdInput.value.trim();
    if (roomId) initWebRTC(roomId);
};
