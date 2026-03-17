import React, { useEffect, useRef, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import "../styles/videoComponent.css";
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import io from 'socket.io-client';
import IconButton from '@mui/material/IconButton';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import ChatIcon from '@mui/icons-material/Chat';
import SendIcon from '@mui/icons-material/Send';
import Badge from '@mui/material/Badge';
import DownloadIcon from '@mui/icons-material/Download';
import PeopleIcon from '@mui/icons-material/People';
import { GoogleGenAI } from "@google/genai";
import { AuthContext } from '../context/AuthContext';

const SERVER_URL = "http://localhost:3000";
const AI_SENDER  = "🤖 AI Assistant";

// Module-level WebRTC peer connections map
const connections = {};

const peerConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// ─────────────────────────────────────────────────────────────────────────────
// VideoTile — a single remote participant tile with reactive camera-off state
// ─────────────────────────────────────────────────────────────────────────────
const VideoTile = React.memo(({ stream, socketId, username }) => {
    const videoRef = useRef();
    const initial  = (username || '?')[0].toUpperCase();

    const isVideoLive = (s) =>
        !!(s && s.getVideoTracks().some(t => t.readyState === 'live' && t.enabled));

    const [hasVideo, setHasVideo] = useState(() => isVideoLive(stream));

    useEffect(() => {
        if (videoRef.current && stream) videoRef.current.srcObject = stream;

        if (!stream) { setHasVideo(false); return; }

        const update = () => setHasVideo(isVideoLive(stream));
        update();

        const tracks = stream.getVideoTracks();
        tracks.forEach(t => { t.onmute = update; t.onunmute = update; t.onended = update; });
        stream.onaddtrack    = update;
        stream.onremovetrack = update;

        return () => {
            tracks.forEach(t => { t.onmute = null; t.onunmute = null; t.onended = null; });
            stream.onaddtrack    = null;
            stream.onremovetrack = null;
        };
    }, [stream]);

    return (
        <div className={`video-card ${!hasVideo ? 'video-card--off' : ''}`}>
            <video
                data-socket={socketId}
                ref={videoRef}
                autoPlay
                className={hasVideo ? '' : 'video-hidden'}
            />
            {!hasVideo && (
                <div className="video-avatar-placeholder">
                    <div className="video-avatar-ring">
                        <span className="video-avatar-initial">{initial}</span>
                    </div>
                    <span className="video-avatar-name">{username || 'User'}</span>
                    <span className="video-cam-off-label">📷 Camera off</span>
                </div>
            )}
            {hasVideo && <span className="video-name name-bottom">{username}</span>}
        </div>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — silent audio track & blank video track (used when camera is off)
// ─────────────────────────────────────────────────────────────────────────────
const createSilentTrack = () => {
    const ctx        = new AudioContext();
    const oscillator = ctx.createOscillator();
    const dst        = oscillator.connect(ctx.createMediaStreamDestination());
    oscillator.start();
    ctx.resume();
    return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
};

const createBlackTrack = ({ width = 640, height = 480 } = {}) => {
    const canvas = Object.assign(document.createElement('canvas'), { width, height });
    canvas.getContext('2d').fillRect(0, 0, width, height);
    return Object.assign(canvas.captureStream().getVideoTracks()[0], { enabled: false });
};

const createBlankStream = () => new MediaStream([createBlackTrack(), createSilentTrack()]);

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function VideoMeetComponent() {

    const navigate = useNavigate();
    const { getUserProfile } = useContext(AuthContext);

    // Refs
    const socketRef       = useRef();
    const socketIdRef     = useRef();
    const localVideoRef   = useRef();
    const videoListRef    = useRef([]);
    const messagesEndRef  = useRef();

    // Device availability
    let [videoAvailable, setVideoAvailable] = useState(true);
    let [audioAvailable, setAudioAvailable] = useState(true);
    let [screenAvailable, setScreenAvailable] = useState(false);

    // Media state
    let [video,  setVideo]  = useState();
    let [audio,  setAudio]  = useState();
    let [screen, setScreen] = useState();

    // UI panels
    let [showModal,      setModal]      = useState(false);
    let [showUsersPanel, setShowUsersPanel] = useState(false);

    // Chat
    let [messages,    setMessages]    = useState([]);
    let [message,     setMessage]     = useState('');
    let [newMessages, setNewMessages] = useState(0);

    // Lobby / user identity
    let [askForUsername, setAskForUsername] = useState(true);
    let [username,       setUsername]       = useState('');
    let [usernameError,  setUsernameError]  = useState(false);

    // Participants
    const [socketToUsername, setSocketToUsername] = useState({});
    const [connectedUsers,   setConnectedUsers]   = useState([]);

    // Remote video streams
    let [videos, setVideos] = useState([]);

    // ── Permissions & initial stream ────────────────────────────────────────
    const getPermissions = async () => {
        try {
            const vid = await navigator.mediaDevices.getUserMedia({ video: true });
            setVideoAvailable(!!vid);
            vid?.getTracks().forEach(t => t.stop());

            const aud = await navigator.mediaDevices.getUserMedia({ audio: true });
            setAudioAvailable(!!aud);
            aud?.getTracks().forEach(t => t.stop());

            setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);

            const stream = await navigator.mediaDevices.getUserMedia({
                video: videoAvailable,
                audio: audioAvailable,
            });
            if (stream) {
                window.localStream = stream;
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            }
        } catch (err) {
            console.error('Permission error:', err);
        }
    };

    useEffect(() => { getPermissions(); }, []);

    useEffect(() => {
        getUserProfile()
            .then(data => { if (data?.name) setUsername(data.name); })
            .catch(() => {});
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            window.localStream?.getTracks().forEach(t => t.stop());
            Object.values(connections).forEach(c => c.close());
            socketRef.current?.disconnect();
        };
    }, []);

    // Auto-scroll chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── Local stream management ─────────────────────────────────────────────
    const onLocalStreamReady = (stream) => {
        try { window.localStream?.getTracks().forEach(t => t.stop()); } catch (_) {}

        window.localStream = stream;
        localVideoRef.current.srcObject = stream;

        // Re-offer to all existing peers with the new stream
        for (const id in connections) {
            if (id === socketIdRef.current) continue;
            connections[id].addStream(stream);
            connections[id].createOffer()
                .then(desc => connections[id].setLocalDescription(desc))
                .then(() => socketRef.current.emit('signal', id,
                    JSON.stringify({ sdp: connections[id].localDescription })))
                .catch(console.error);
        }

        // When a track ends, fall back to blank stream
        stream.getTracks().forEach(track => {
            track.onended = () => {
                setVideo(false);
                setAudio(false);
                try { localVideoRef.current.srcObject?.getTracks().forEach(t => t.stop()); } catch (_) {}

                const blank = createBlankStream();
                window.localStream = blank;
                localVideoRef.current.srcObject = blank;

                for (const id in connections) {
                    connections[id].addStream(blank);
                    connections[id].createOffer()
                        .then(desc => connections[id].setLocalDescription(desc))
                        .then(() => socketRef.current.emit('signal', id,
                            JSON.stringify({ sdp: connections[id].localDescription })))
                        .catch(console.error);
                }
            };
        });
    };

    const getUserMedia = () => {
        if ((video && videoAvailable) || (audio && audioAvailable)) {
            navigator.mediaDevices.getUserMedia({ video, audio })
                .then(onLocalStreamReady)
                .catch(console.error);
        } else {
            try { localVideoRef.current.srcObject?.getTracks().forEach(t => t.stop()); } catch (_) {}
        }
    };

    useEffect(() => {
        if (video !== undefined && audio !== undefined) getUserMedia();
    }, [video, audio]);

    // ── Screen share ────────────────────────────────────────────────────────
    const onDisplayStreamReady = (stream) => {
        try { window.localStream?.getTracks().forEach(t => t.stop()); } catch (_) {}

        window.localStream = stream;
        localVideoRef.current.srcObject = stream;

        for (const id in connections) {
            if (id === socketIdRef.current) continue;
            connections[id].addStream(stream);
            connections[id].createOffer()
                .then(desc => connections[id].setLocalDescription(desc))
                .then(() => socketRef.current.emit('signal', id,
                    JSON.stringify({ sdp: connections[id].localDescription })))
                .catch(console.error);
        }

        stream.getTracks().forEach(track => {
            track.onended = () => {
                setScreen(false);
                try { localVideoRef.current.srcObject?.getTracks().forEach(t => t.stop()); } catch (_) {}
                const blank = createBlankStream();
                window.localStream = blank;
                localVideoRef.current.srcObject = blank;
                getUserMedia();
            };
        });
    };

    const getDisplayMedia = () => {
        if (screen && navigator.mediaDevices.getDisplayMedia) {
            navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
                .then(onDisplayStreamReady)
                .catch(console.error);
        }
    };

    useEffect(() => {
        if (screen !== undefined) getDisplayMedia();
    }, [screen]);

    // ── WebRTC signalling ───────────────────────────────────────────────────
    const gotMessageFromServer = (fromId, rawMessage) => {
        const signal = JSON.parse(rawMessage);

        if (signal.sdp) {
            connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp))
                .then(() => {
                    if (signal.sdp.type !== 'offer') return;
                    connections[fromId].createAnswer()
                        .then(desc => connections[fromId].setLocalDescription(desc))
                        .then(() => socketRef.current.emit('signal', fromId,
                            JSON.stringify({ sdp: connections[fromId].localDescription })))
                        .catch(console.error);
                })
                .catch(console.error);
        }

        if (signal.ice) {
            connections[fromId]
                .addIceCandidate(new RTCIceCandidate(signal.ice))
                .catch(console.error);
        }
    };

    // ── Chat ────────────────────────────────────────────────────────────────
    const addMessage = (data, sender, senderSocketId) => {
        setMessages(prev => [...prev, { sender, data }]);
        if (senderSocketId !== socketIdRef.current) {
            setNewMessages(prev => prev + 1);
        }
    };

    const sendMessage = () => {
        if (!message.trim()) return;
        // Always emit through socket so ALL users see every message (including @ai questions)
        socketRef.current.emit('chat-message', message, username);
        if (message.toLowerCase().startsWith('@ai')) askAI(message);
        setMessage('');
    };

    const askAI = async (userMessage) => {
        const ai     = new GoogleGenAI({ apiKey: import.meta.env.VITE_GOOGLE_GEMINI_API_KEY });
        const prompt = userMessage.replace(/@ai/i, '').trim();
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3.1-flash-lite-preview',
                contents: prompt,
            });
            socketRef.current.emit('chat-message', response.text, AI_SENDER);
        } catch (e) {
            const code = e?.status || e?.code;
            const msg =
                code === 429 ? 'Rate limit reached. Please wait a moment.' :
                code === 503 ? 'AI is currently busy. Please try again shortly.' :
                (code === 401 || code === 403) ? 'Invalid API key.' :
                'Something went wrong. Try again.';
            socketRef.current.emit('chat-message', msg, AI_SENDER);
        }
    };

    const parseMarkdown = (text) => text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g,     '<em>$1</em>')
        .replace(/`(.*?)`/g,       '<code>$1</code>')
        .replace(/\n/g,            '<br/>');

    const downloadChat = () => {
        const stripHtml = (html) => html.replace(/<[^>]*>/g, '').replace(/\n/g, ' ');
        const text = messages.map(m => `[${m.sender}]: ${stripHtml(m.data)}`).join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: 'chat.txt' });
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Socket connection ───────────────────────────────────────────────────
    const connectToSocketServer = () => {
        socketRef.current = io.connect(SERVER_URL, { secure: false });
        socketRef.current.on('signal', gotMessageFromServer);

        socketRef.current.on('connect', () => {
            socketRef.current.emit('join-call', window.location.href);
            socketRef.current.emit('set-username', username);
            socketIdRef.current = socketRef.current.id;

            setConnectedUsers([{ socketId: socketRef.current.id, name: username }]);

            socketRef.current.on('chat-message', addMessage);

            socketRef.current.on('user-username', (socketId, uname) => {
                setSocketToUsername(prev => ({ ...prev, [socketId]: uname }));
                setConnectedUsers(prev => {
                    const exists = prev.find(u => u.socketId === socketId);
                    if (exists) return prev.map(u => u.socketId === socketId ? { ...u, name: uname } : u);
                    return [...prev, { socketId, name: uname }];
                });
            });

            socketRef.current.on('user-left', (id) => {
                setVideos(prev => prev.filter(v => v.socketId !== id));
                setConnectedUsers(prev => prev.filter(u => u.socketId !== id));
            });

            socketRef.current.on('user-joined', (id, clients) => {
                if (!Array.isArray(clients)) return;

                clients.forEach((peerId) => {
                    connections[peerId] = new RTCPeerConnection(peerConfig);

                    connections[peerId].onicecandidate = (event) => {
                        if (event.candidate) {
                            socketRef.current.emit('signal', peerId,
                                JSON.stringify({ ice: event.candidate }));
                        }
                    };

                    connections[peerId].onaddstream = (event) => {
                        const exists = videoListRef.current.find(v => v.socketId === peerId);
                        if (exists) {
                            setVideos(prev => {
                                const updated = prev.map(v =>
                                    v.socketId === peerId ? { ...v, stream: event.stream } : v);
                                videoListRef.current = updated;
                                return updated;
                            });
                        } else {
                            setVideos(prev => {
                                const updated = [...prev, { socketId: peerId, stream: event.stream }];
                                videoListRef.current = updated;
                                return updated;
                            });
                        }
                    };

                    const localStream = window.localStream ?? (() => {
                        const blank = createBlankStream();
                        window.localStream = blank;
                        return blank;
                    })();
                    connections[peerId].addStream(localStream);

                    if (peerId !== socketIdRef.current) {
                        setConnectedUsers(prev => {
                            if (prev.find(u => u.socketId === peerId)) return prev;
                            return [...prev, { socketId: peerId, name: socketToUsername[peerId] || 'User' }];
                        });
                    }
                });

                // If we're the newly joined user, create offers to everyone
                if (id === socketIdRef.current) {
                    for (const peerId in connections) {
                        if (peerId === socketIdRef.current) continue;
                        try { connections[peerId].addStream(window.localStream); } catch (_) {}
                        connections[peerId].createOffer()
                            .then(desc => connections[peerId].setLocalDescription(desc))
                            .then(() => socketRef.current.emit('signal', peerId,
                                JSON.stringify({ sdp: connections[peerId].localDescription })))
                            .catch(console.error);
                    }
                }
            });
        });
    };

    // ── Controls ────────────────────────────────────────────────────────────
    const connect = () => {
        if (!username.trim()) { setUsernameError(true); return; }
        setUsernameError(false);
        setAskForUsername(false);
        setVideo(videoAvailable);
        setAudio(audioAvailable);
        connectToSocketServer();
    };

    const handleEndCall = () => {
        try { localVideoRef.current.srcObject?.getTracks().forEach(t => t.stop()); } catch (_) {}
        navigate('/');
    };

    const handleChatToggle = () => {
        if (!showModal) { setShowUsersPanel(false); setNewMessages(0); }
        setModal(prev => !prev);
    };

    const handleUsersToggle = () => {
        if (!showUsersPanel) setModal(false);
        setShowUsersPanel(prev => !prev);
    };

    // ── TextField sx (reused) ───────────────────────────────────────────────
    const textFieldSx = {
        '& .MuiOutlinedInput-root': {
            color: 'var(--text-primary)',
            '& fieldset':           { borderColor: 'var(--glass-border)' },
            '&:hover fieldset':     { borderColor: 'var(--text-secondary)' },
            '&.Mui-focused fieldset': { borderColor: 'var(--accent-primary)' },
        },
        '& .MuiInputLabel-root':            { color: 'var(--text-secondary)' },
        '& .MuiInputLabel-root.Mui-focused': { color: 'var(--accent-primary)' },
    };

    // ── Render ───────────────────────────────────────────────────────────────
    if (askForUsername) {
        return (
            <div className="lobbyContainer">
                <div className="lobbyForm">
                    <h2 className="lobbySubTitle">Enter into Lobby</h2>

                    <TextField
                        id="lobby-name"
                        label="Your Name"
                        value={username}
                        variant="outlined"
                        error={usernameError}
                        helperText={usernameError ? 'Name is required to join' : ''}
                        onChange={e => { setUsername(e.target.value); setUsernameError(false); }}
                        sx={textFieldSx}
                    />

                    <Button
                        variant="contained"
                        onClick={connect}
                        sx={{
                            background: 'var(--accent-gradient)',
                            fontWeight: 600,
                            py: 1.5,
                            borderRadius: '12px',
                            textTransform: 'none',
                            fontSize: '1rem',
                            boxShadow: '0 8px 16px rgba(255, 152, 57, 0.3)',
                        }}
                    >
                        Join Meeting
                    </Button>

                    <Button
                        variant="contained"
                        startIcon={<CallEndIcon />}
                        onClick={handleEndCall}
                        sx={{
                            background: 'linear-gradient(135deg, #ff4757, #c0392b)',
                            color: '#fff',
                            fontWeight: 600,
                            py: 1.5,
                            borderRadius: '12px',
                            textTransform: 'none',
                            fontSize: '0.95rem',
                            boxShadow: '0 4px 15px rgba(255, 71, 87, 0.4)',
                            '&:hover': {
                                background: 'linear-gradient(135deg, #ff6b81, #ff4757)',
                                boxShadow: '0 6px 20px rgba(255, 71, 87, 0.55)',
                            },
                        }}
                    >
                        Leave
                    </Button>
                </div>

                <video ref={localVideoRef} autoPlay muted className="lobbyPreview" />
            </div>
        );
    }

    return (
        <div className="meetVideoContainer">

            {/* ── Chat Panel ──────────────────────────────────────────── */}
            {showModal && (
                <div className="chatRoom">
                    <div className="chatHeader">
                        <h1>Chat</h1>
                        <IconButton
                            onClick={downloadChat}
                            title="Download chat"
                            size="small"
                            sx={{ color: 'var(--text-secondary)', '&:hover': { color: 'var(--text-primary)' } }}
                        >
                            <DownloadIcon />
                        </IconButton>
                    </div>

                    <div className="chatContainer">
                        <div className="chattingDisplay">
                            {messages.length === 0 && (
                                <div className="chat-empty-state">
                                    <span>💬</span>
                                    <p>No messages yet.<br />Type <strong>@ai</strong> to ask the AI assistant!</p>
                                </div>
                            )}
                            {messages.map((item, index) => {
                                const isAI  = item.sender === AI_SENDER;
                                const isOwn = item.sender === username;
                                return (
                                    <div
                                        className={`msg-box ${isOwn ? 'own' : isAI ? 'ai' : 'other'}`}
                                        key={index}
                                    >
                                        <span>{item.sender}</span>
                                        <p dangerouslySetInnerHTML={{ __html: parseMarkdown(item.data) }} />
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>

                    <div className="chattingArea">
                        <input
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
                            placeholder="Message or @ai <question>"
                        />
                        <button onClick={sendMessage}><SendIcon sx={{ fontSize: '1.2rem' }} /></button>
                    </div>
                </div>
            )}

            {/* ── Participants Panel ───────────────────────────────────── */}
            {showUsersPanel && (
                <div className="usersPanel">
                    <div className="chatHeader">
                        <h1>Participants ({connectedUsers.length})</h1>
                    </div>
                    <div className="usersList">
                        {connectedUsers.map((user) => (
                            <div className="userItem" key={user.socketId}>
                                <div className="userAvatar">
                                    {(user.name || 'U')[0].toUpperCase()}
                                </div>
                                <div className="userInfo">
                                    <span className="userName">
                                        {user.name || 'Unknown'}
                                        {user.socketId === socketIdRef.current && (
                                            <span className="youBadge"> (You)</span>
                                        )}
                                    </span>
                                    <span className="userStatus">● In call</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Control Bar ─────────────────────────────────────────── */}
            <div className="buttonContainers">
                <IconButton
                    onClick={() => setVideo(v => !v)}
                    className={video ? 'activeIcon' : 'inactiveIcon'}
                    title={video ? 'Turn off camera' : 'Turn on camera'}
                >
                    {video ? <VideocamIcon /> : <VideocamOffIcon />}
                </IconButton>

                <IconButton onClick={handleEndCall} className="endCallIcon" title="End call">
                    <CallEndIcon />
                </IconButton>

                <IconButton
                    onClick={() => setAudio(a => !a)}
                    className={audio ? 'activeIcon' : 'inactiveIcon'}
                    title={audio ? 'Mute' : 'Unmute'}
                >
                    {audio ? <MicIcon /> : <MicOffIcon />}
                </IconButton>

                <IconButton
                    onClick={() => setScreen(s => !s)}
                    className={screen ? 'activeIcon' : 'inactiveIcon'}
                    title={screen ? 'Stop sharing' : 'Share screen'}
                    disabled={!screenAvailable}
                >
                    {screen ? <ScreenShareIcon /> : <StopScreenShareIcon />}
                </IconButton>

                <Badge badgeContent={newMessages} max={99} color="error">
                    <IconButton
                        onClick={handleChatToggle}
                        className={showModal ? 'activeIcon' : 'inactiveIcon'}
                        title="Chat"
                    >
                        <ChatIcon />
                    </IconButton>
                </Badge>

                <Badge badgeContent={connectedUsers.length} color="primary">
                    <IconButton
                        onClick={handleUsersToggle}
                        className={showUsersPanel ? 'activeIcon' : 'inactiveIcon'}
                        title="Participants"
                    >
                        <PeopleIcon />
                    </IconButton>
                </Badge>
            </div>

            {/* ── Local Video PIP ──────────────────────────────────────── */}
            <div className="localVideoWrapper">
                <video
                    ref={localVideoRef}
                    className="meetUserVideo"
                    autoPlay
                    muted
                    style={{ display: video === false ? 'none' : undefined }}
                />
                {video === false && (
                    <div className="localVideoAvatar">
                        <span>{(username || 'Y')[0].toUpperCase()}</span>
                        <small>Cam off</small>
                    </div>
                )}
            </div>

            {/* ── Remote Videos ────────────────────────────────────────── */}
            <div className="conferenceView">
                {videos.map((v) => (
                    <VideoTile
                        key={v.socketId}
                        stream={v.stream}
                        socketId={v.socketId}
                        username={socketToUsername[v.socketId] || ''}
                    />
                ))}
            </div>
        </div>
    );
}