
// public/app.js
const webcamVideo = document.getElementById('webcamVideo');
const remoteVideo = document.getElementById('remoteVideo');

const webcamButton = document.getElementById('webcamButton');
const callButton = document.getElementById('callButton');
const answerButton = document.getElementById('answerButton');
const hangupButton = document.getElementById('hangupButton');
const callInput = document.getElementById('callInput');
const micToggle = document.getElementById('micToggle');
const camToggle = document.getElementById('camToggle');

let pc;
let localStream;
let remoteStream;
let ws;
let callId;
let role; // 'offer' or 'answer'

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'call-created') {
      callId = msg.callId;
      callInput.value = callId;
    }
    if (msg.type === 'joined') {
      const { state } = msg;
      if (state.offer && role === 'answer') {
        pc.setRemoteDescription(state.offer);
      }
      if (state.answer && role === 'offer') {
        pc.setRemoteDescription(state.answer);
      }
      (state.offerCandidates || []).forEach(c => pc.addIceCandidate(c).catch(()=>{}));
      (state.answerCandidates || []).forEach(c => pc.addIceCandidate(c).catch(()=>{}));
    }
    if (msg.type === 'offer' && role === 'answer') {
      pc.setRemoteDescription(msg.offer);
      maybeAnswer();
    }
    if (msg.type === 'answer' && role === 'offer') {
      pc.setRemoteDescription(msg.answer);
    }
    if (msg.type === 'ice-candidate') {
      pc.addIceCandidate(msg.candidate).catch(()=>{});
    }
    if (msg.type === 'hangup') {
      cleanup();
    }
  };
}

function setupPC() {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }]
  });
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.ontrack = (ev) => ev.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
  pc.onicecandidate = (ev) => {
    if (ev.candidate && callId) {
      ws.send(JSON.stringify({
        type: 'ice-candidate',
        callId,
        role,
        candidate: ev.candidate.toJSON()
      }));
    }
  };
}

async function startWebcam() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  webcamVideo.srcObject = localStream;
  callButton.disabled = false;
  answerButton.disabled = false;
  hangupButton.disabled = false;
  micToggle.disabled = false;
  camToggle.disabled = false;
  updateMicUI(true);
  updateCamUI(true);
}

async function createCall() {
  role = 'offer';
  setupPC();
  ws.send(JSON.stringify({ type: 'create-call' }));
  ws.addEventListener('message', async function handler(ev) {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'call-created') {
      callId = msg.callId;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.send(JSON.stringify({ type: 'offer', callId, offer }));
      ws.removeEventListener('message', handler);
    }
  }, { once: true });
}

async function joinCall() {
  role = 'answer';
  setupPC();
  callId = callInput.value.trim();
  if (!callId) return;
  ws.send(JSON.stringify({ type: 'join-call', callId }));
  // If offer arrives later, maybeAnswer() will run then.
  setTimeout(maybeAnswer, 300);
}

async function maybeAnswer() {
  if (pc.remoteDescription && pc.signalingState === 'have-remote-offer') {
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: 'answer', callId, answer }));
  }
}

function updateMicUI(isOn) {
  micToggle.textContent = `Mic: ${isOn ? 'On' : 'Off'}`;
  }
  
  
  function updateCamUI(isOn) {
  camToggle.textContent = `Camera: ${isOn ? 'On' : 'Off'}`;
  if (!webcamVideo) return;
  webcamVideo.classList.toggle('video-off', !isOn);
  }
  
  
  function toggleMic() {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled; // toggles without stopping track
  updateMicUI(track.enabled);
  }
  
  
  function toggleCam() {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled; // keep sender; just disable
  updateCamUI(track.enabled);
  }

function hangup() {
  if (callId) ws.send(JSON.stringify({ type: 'hangup', callId }));
  cleanup();
}

function cleanup() {
  if (pc) {
    pc.getSenders().forEach(s => s.track && s.track.stop());
    pc.close();
    pc = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    if (micToggle) { micToggle.disabled = true; micToggle.textContent = 'Mic: On'; }
    if (camToggle) { camToggle.disabled = true; camToggle.textContent = 'Camera: On'; webcamVideo && webcamVideo.classList.remove('video-off'); }
  }
  remoteStream = null;
  callId = null;
  role = null;
  callButton.disabled = false;
  answerButton.disabled = false;
}

webcamButton.onclick = startWebcam;
callButton.onclick = createCall;
answerButton.onclick = joinCall;
hangupButton.onclick = hangup;
micToggle.onclick = toggleMic;
camToggle.onclick = toggleCam;

connectWS();
