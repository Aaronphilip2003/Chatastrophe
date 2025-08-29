// app.js
// Minimal WebRTC with client-side mixed audio recording => chunk upload to server

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const hangupBtn = document.getElementById('hangupBtn');
const callIdInput = document.getElementById('callIdInput');

const callIdLabel = document.getElementById('callIdLabel');
const roleLabel = document.getElementById('roleLabel');
const recLabel = document.getElementById('recLabel');
const sessionLabel = document.getElementById('sessionLabel');

let ws;
let pc;
let localStream;
let remoteStream;
let role = null; // 'offer' | 'answer'
let callId = null;

// Recording mixer state
let audioCtx = null;
let mixDest = null;
let mediaRecorder = null;
let isRecording = false;
let sessionId = null;

// --- UI helpers ---
function setCallInfo() {
  callIdLabel.textContent = callId || '—';
  roleLabel.textContent = role || '—';
  sessionLabel.textContent = sessionId || '—';
}
function setRecState(stateText, cls = 'muted') {
  recLabel.textContent = stateText;
  recLabel.className = `tag ${cls}`;
}

// --- WebSocket ---
function connectWS() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  ws = new WebSocket(`ws://${location.host}`);
  ws.onopen = () => console.log('WS connected');
  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data);

    if (msg.type === 'call-created') {
      callId = msg.callId;
      setCallInfo();
      // Now join as offerer
      ws.send(JSON.stringify({ type: 'join', callId, role: 'offer' }));
      await createOffer();
      return;
    }

    if (msg.type === 'joined') {
      console.log('Joined room:', msg);
      return;
    }

    if (msg.type === 'peer-joined') {
      console.log('Peer joined as', msg.role);
      return;
    }

    if (msg.type === 'offer') {
      await pc.setRemoteDescription(msg.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ type: 'answer', callId, answer }));
      return;
    }

    if (msg.type === 'answer') {
      await pc.setRemoteDescription(msg.answer);
      return;
    }

    if (msg.type === 'ice-candidate') {
      try { await pc.addIceCandidate(msg.candidate); } catch (e) { console.warn('ICE add failed', e); }
      return;
    }

    if (msg.type === 'hangup') {
      cleanup();
      return;
    }

    if (msg.type === 'peer-left') {
      console.log('Peer left');
      // stop recording if running
      stopRecording();
      return;
    }
  };
  ws.onclose = () => console.log('WS closed');
}

// --- Media + PC setup ---
async function getLocalMedia() {
  if (localStream) return localStream;
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  localVideo.srcObject = localStream;
  return localStream;
}

function setupPC() {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }]
  });
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  // send our tracks
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  // receive tracks
  pc.ontrack = (ev) => {
    ev.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
    // If it's an audio track and mixer exists, add to the mix
    ev.streams[0].getAudioTracks().forEach(track => {
      if (audioCtx && mixDest) {
        const node = audioCtx.createMediaStreamSource(new MediaStream([track]));
        node.connect(mixDest);
      }
    });
  };

  pc.onicecandidate = (ev) => {
    if (ev.candidate && callId) {
      ws.send(JSON.stringify({ type: 'ice-candidate', callId, candidate: ev.candidate }));
    }
  };
}

async function createOffer() {
  role = 'offer';
  setCallInfo();

  await getLocalMedia();
  setupPC();

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  ws.send(JSON.stringify({ type: 'offer', callId, offer }));
  hangupBtn.disabled = false;

  // Start recording on the offerer
  startRecording();
}

async function joinAsAnswerer() {
  role = 'answer';
  setCallInfo();

  await getLocalMedia();
  setupPC();

  ws.send(JSON.stringify({ type: 'join', callId, role: 'answer' }));
  hangupBtn.disabled = false;

  // Optional: also record on answerer (usually not needed—commented out)
  // startRecording();
}

// --- Recording mixer (local + remote) ---
function startRecording() {
  if (isRecording) return;
  if (!localStream) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  mixDest = audioCtx.createMediaStreamDestination();

  // Add local mic
  const localAudio = localStream.getAudioTracks()[0];
  if (localAudio) {
    const src = audioCtx.createMediaStreamSource(new MediaStream([localAudio]));
    src.connect(mixDest);
  }

  // Remote tracks will be added in ontrack (above) as they arrive

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus' : 'audio/webm';
  mediaRecorder = new MediaRecorder(mixDest.stream, { mimeType });

  if (!sessionId) sessionId = `${callId || 'session'}-${Date.now()}`;
  setCallInfo();

  mediaRecorder.onstart = () => setRecState('recording', 'ok');
  mediaRecorder.onstop = () => setRecState('stopped', 'warn');

  mediaRecorder.ondataavailable = async (ev) => {
    if (!ev.data || ev.data.size === 0) return;
    // POST chunk to server
    try {
      await fetch(`/upload-audio?sessionId=${encodeURIComponent(sessionId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: ev.data
      });
    } catch (e) {
      console.warn('Chunk upload failed', e);
      setRecState('upload error', 'warn');
    }
  };

  // 5s chunks
  mediaRecorder.start(5000);
  isRecording = true;
}

function stopRecording() {
  if (!isRecording) return;
  try { mediaRecorder.stop(); } catch {}
  isRecording = false;
  mediaRecorder = null;

  if (audioCtx) { try { audioCtx.close(); } catch {} }
  audioCtx = null;
  mixDest = null;
  sessionId = null;
  setCallInfo();
}

// --- Cleanup ---
function cleanup() {
  stopRecording();

  if (pc) {
    try { pc.getSenders().forEach(s => s.track && s.track.stop()); } catch {}
    try { pc.close(); } catch {}
  }
  pc = null;

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    localVideo.srcObject = null;
  }
  if (remoteStream) {
    remoteStream.getTracks().forEach(t => t.stop());
    remoteStream = null;
    remoteVideo.srcObject = null;
  }

  callId = null;
  role = null;
  setCallInfo();
  setRecState('idle', 'muted');
  hangupBtn.disabled = true;
}

// --- Button hooks ---
createBtn.onclick = async () => {
  connectWS();
  ws.onopen = async () => {
    ws.send(JSON.stringify({ type: 'create-call' }));
  };
};

joinBtn.onclick = async () => {
  const id = callIdInput.value.trim();
  if (!id) {
    alert('Paste a callId to join');
    return;
  }
  callId = id;
  connectWS();
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', callId, role: 'answer' }));
  };
  await joinAsAnswerer();
};

hangupBtn.onclick = () => {
  if (ws && callId) {
    ws.send(JSON.stringify({ type: 'hangup', callId }));
  }
  cleanup();
};

// Ready state
setCallInfo();
setRecState('idle', 'muted');

// HTTPS note for getUserMedia on remote hosts:
// Use https (or localhost) for camera/mic permissions.
