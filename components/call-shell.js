"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import {
  Camera,
  CameraOff,
  ChevronLeft,
  LoaderCircle,
  Mic,
  MicOff,
  Send,
  SkipForward,
  X
} from "lucide-react";
import { getSocket } from "@/lib/socket-client";

const STORAGE_KEY = "stokky-profile";

function buildIceServers() {
  const servers = [];

  if (process.env.NEXT_PUBLIC_STUN_URL) {
    servers.push({ urls: process.env.NEXT_PUBLIC_STUN_URL });
  }

  if (process.env.NEXT_PUBLIC_TURN_URL) {
    servers.push({
      urls: process.env.NEXT_PUBLIC_TURN_URL,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL
    });
  }

  return servers;
}

function attachStreamToVideo(videoElement, stream, muted = false) {
  if (!videoElement) {
    return;
  }

  videoElement.srcObject = stream || null;
  videoElement.muted = muted;

  if (!stream) {
    return;
  }

  const tryPlay = () => {
    const playPromise = videoElement.play();
    if (playPromise?.catch) {
      playPromise.catch(() => {});
    }
  };

  videoElement.onloadedmetadata = tryPlay;
  tryPlay();
}

export default function CallShell() {
  const router = useRouter();
  const socketRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const roomRef = useRef(null);
  const messagesRef = useRef(null);
  const profileRef = useRef(null);
  const autoQueueRef = useRef(false);

  const [profile, setProfile] = useState(null);
  const [queueStats, setQueueStats] = useState({ waiting: 0 });
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [connectionState, setConnectionState] = useState("waiting");
  const [localReady, setLocalReady] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [status, setStatus] = useState({
    phase: "booting",
    text: "Preparing your call room...",
    tone: "info"
  });

  const sharedInterests = room?.sharedInterests || [];
  const isMatched = status.phase === "matched";
  const remoteActive = Boolean(remoteStreamRef.current) || remoteReady;

  useEffect(() => {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);

    if (!stored) {
      router.replace("/chat");
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      const normalized = {
        nickname: parsed.nickname || "Guest",
        interests: parsed.interests || [],
        mode: "both"
      };
      setProfile(normalized);
      profileRef.current = normalized;
    } catch (_error) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      router.replace("/chat");
    }
  }, [router]);

  const syncLocalPreview = useCallback(() => {
    attachStreamToVideo(localVideoRef.current, localStreamRef.current, true);
  }, []);

  const ensureLocalMedia = useCallback(async () => {
    if (!navigator.mediaDevices) {
      throw new Error("media_unsupported");
    }

    if (localStreamRef.current) {
      syncLocalPreview();
      return localStreamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    });

    localStreamRef.current = stream;
    setLocalReady(true);
    setCameraEnabled(stream.getVideoTracks().every((track) => track.enabled));
    setMicEnabled(stream.getAudioTracks().every((track) => track.enabled));
    syncLocalPreview();

    return stream;
  }, [syncLocalPreview]);

  const releaseAllMedia = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalReady(false);

    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;
    setRemoteReady(false);

    syncLocalPreview();

    if (remoteVideoRef.current) {
      attachStreamToVideo(remoteVideoRef.current, null, false);
    }
  }, [syncLocalPreview]);

  const clearRemoteMedia = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;
    setRemoteReady(false);

    if (remoteVideoRef.current) {
      attachStreamToVideo(remoteVideoRef.current, null, false);
    }
  }, []);

  const createPeerConnection = useCallback((targetId, roomId) => {
    const socket = socketRef.current;
    const peer = new RTCPeerConnection({
      iceServers: buildIceServers()
    });

    peer.onconnectionstatechange = () => {
      const nextState = peer.connectionState || "connecting";
      setConnectionState(nextState);
      if (nextState === "connected") {
        setStatus({
          phase: "matched",
          text: `Connected with ${room?.stranger?.nickname || "your match"}.`,
          tone: "success"
        });
      }
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("webrtc:signal", {
          roomId,
          targetId,
          data: event.candidate
        });
      }
    };

    peer.ontrack = (event) => {
      remoteStreamRef.current = event.streams[0];
      setRemoteReady(true);
      attachStreamToVideo(remoteVideoRef.current, event.streams[0], false);
    };

    peerConnectionRef.current = peer;
    return peer;
  }, [room?.stranger?.nickname]);

  const setupMediaConnection = useCallback(async (shouldInitiate, targetId, roomId) => {
    try {
      const stream = await ensureLocalMedia();
      const peer = createPeerConnection(targetId, roomId);

      stream.getTracks().forEach((track) => {
        const alreadyAdded = peer.getSenders().some((sender) => sender.track?.id === track.id);
        if (!alreadyAdded) {
          peer.addTrack(track, stream);
        }
      });

      if (shouldInitiate) {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socketRef.current.emit("webrtc:signal", {
          roomId,
          targetId,
          data: offer
        });
      }
    } catch (_error) {
      setStatus({
        phase: "searching",
        text: "Camera or microphone access is blocked. Allow access to use live video.",
        tone: "warn"
      });
    }
  }, [createPeerConnection, ensureLocalMedia]);

  const fetchMessages = useCallback(async (roomId) => {
    const response = await fetch(`/api/rooms/${roomId}/messages`);
    const data = await response.json();
    setMessages(data.messages || []);
  }, []);

  const joinQueue = useCallback(() => {
    const socket = socketRef.current;
    const currentProfile = profileRef.current;

    if (!socket || !currentProfile) {
      return;
    }

    setStatus({
      phase: "searching",
      text: "Looking for someone with overlapping interests...",
      tone: "info"
    });
    setRoom(null);
    setMessages([]);
    setConnectionState("searching");
    clearRemoteMedia();

    socket.emit(
      "queue:join",
      {
        nickname: currentProfile.nickname,
        interests: currentProfile.interests,
        mode: "both"
      },
      (response) => {
        if (!response?.ok) {
          setStatus({
            phase: "error",
            text: response?.error || "Queue join failed. Try again in a moment.",
            tone: "warn"
          });
          return;
        }

        if (!response.matched) {
          setStatus({
            phase: "searching",
            text: `Waiting in queue. Position ${response.position}.`,
            tone: "info"
          });
        }
      }
    );
  }, [clearRemoteMedia]);

  const leaveRoom = useCallback(({ preserveLocalMedia = true } = {}) => {
    if (roomRef.current && socketRef.current) {
      socketRef.current.emit("room:leave", { roomId: roomRef.current });
    }

    roomRef.current = null;
    setRoom(null);
    setMessages([]);
    setConnectionState("waiting");
    clearRemoteMedia();

    if (!preserveLocalMedia) {
      releaseAllMedia();
    }
  }, [clearRemoteMedia, releaseAllMedia]);

  useEffect(() => {
    if (!profile) {
      return;
    }

    ensureLocalMedia()
      .then(() => {
        setStatus({
          phase: "ready",
          text: "Camera and microphone are ready. Finding your first match...",
          tone: "success"
        });
      })
      .catch(() => {
        setStatus({
          phase: "warn",
          text: "Allow camera and microphone access for the full call experience.",
          tone: "warn"
        });
      });
  }, [ensureLocalMedia, profile]);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const handleQueueStats = (stats) => setQueueStats(stats);

    const handleMatchFound = async (payload) => {
      roomRef.current = payload.roomId;
      setRoom({
        roomId: payload.roomId,
        stranger: payload.stranger,
        sharedInterests: payload.sharedInterests
      });
      setStatus({
        phase: "matched",
        text: `Matched with ${payload.stranger.nickname || "a stranger"}.`,
        tone: "success"
      });
      setConnectionState("connecting");
      setMessages([]);
      socket.emit("room:join", { roomId: payload.roomId });
      await fetchMessages(payload.roomId);
      await setupMediaConnection(payload.initiator, payload.stranger.socketId, payload.roomId);
    };

    const handleMessage = (payload) => {
      setMessages((current) => {
        const deduped = current.filter((message) => {
          const sameSender = message.senderId === payload.senderId;
          const sameText = message.text === payload.text;
          const optimistic = String(message.id || "").startsWith("local-");
          return !(optimistic && sameSender && sameText);
        });

        return [...deduped, payload];
      });
    };

    const handleSignal = async ({ senderId, data, roomId }) => {
      if (!peerConnectionRef.current) {
        await setupMediaConnection(false, senderId, roomId);
      }

      const peer = peerConnectionRef.current;

      if (data.type === "offer") {
        await peer.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit("webrtc:signal", {
          roomId,
          targetId: senderId,
          data: answer
        });
      } else if (data.type === "answer") {
        await peer.setRemoteDescription(new RTCSessionDescription(data));
      } else if (data.candidate) {
        await peer.addIceCandidate(new RTCIceCandidate(data));
      }
    };

    const handlePeerLeft = () => {
      leaveRoom({ preserveLocalMedia: true });
      setStatus({
        phase: "searching",
        text: "That call ended. Finding the next person now...",
        tone: "info"
      });
      joinQueue();
    };

    socket.on("queue:stats", handleQueueStats);
    socket.on("match:found", handleMatchFound);
    socket.on("chat:message", handleMessage);
    socket.on("webrtc:signal", handleSignal);
    socket.on("room:peer-left", handlePeerLeft);

    return () => {
      socket.off("queue:stats", handleQueueStats);
      socket.off("match:found", handleMatchFound);
      socket.off("chat:message", handleMessage);
      socket.off("webrtc:signal", handleSignal);
      socket.off("room:peer-left", handlePeerLeft);
      socket.emit("queue:leave");
      leaveRoom({ preserveLocalMedia: false });
    };
  }, [fetchMessages, joinQueue, leaveRoom, setupMediaConnection]);

  useEffect(() => {
    if (!profile || autoQueueRef.current) {
      return;
    }

    autoQueueRef.current = true;
    joinQueue();
  }, [joinQueue, profile]);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [messages]);

  useEffect(() => {
    syncLocalPreview();
  }, [localReady, syncLocalPreview]);

  useEffect(() => {
    attachStreamToVideo(remoteVideoRef.current, remoteStreamRef.current, false);
  }, [remoteReady]);

  useEffect(() => () => {
    releaseAllMedia();
  }, [releaseAllMedia]);

  async function toggleTrack(kind) {
    try {
      const stream = await ensureLocalMedia();
      const tracks = kind === "video" ? stream.getVideoTracks() : stream.getAudioTracks();
      const nextEnabled = !(kind === "video" ? cameraEnabled : micEnabled);

      tracks.forEach((track) => {
        track.enabled = nextEnabled;
      });

      if (kind === "video") {
        setCameraEnabled(nextEnabled);
      } else {
        setMicEnabled(nextEnabled);
      }
    } catch (_error) {
      setStatus({
        phase: "warn",
        text: "Please allow camera and microphone access before using video controls.",
        tone: "warn"
      });
    }
  }

  function sendMessage() {
    const trimmed = messageInput.trim();
    if (!trimmed || !room?.roomId) {
      return;
    }

    const optimisticMessage = {
      id: `local-${Date.now()}`,
      senderId: socketRef.current?.id,
      senderLabel: profile?.nickname || "You",
      text: trimmed,
      createdAt: new Date().toISOString()
    };

    setMessages((current) => [...current, optimisticMessage]);

    socketRef.current.emit("chat:send", {
      roomId: room.roomId,
      text: trimmed,
      senderLabel: profile?.nickname || "You"
    });
    setMessageInput("");
  }

  function handleSkip() {
    leaveRoom({ preserveLocalMedia: true });
    setStatus({
      phase: "searching",
      text: "Skipping to a new match...",
      tone: "info"
    });
    joinQueue();
  }

  function handleLeave() {
    socketRef.current?.emit("queue:leave");
    leaveRoom({ preserveLocalMedia: false });
    window.sessionStorage.removeItem(STORAGE_KEY);
    router.push("/chat");
  }

  return (
    <main className="min-h-screen bg-[#08111f] text-white">
      <section className="hidden min-h-screen lg:grid lg:grid-cols-[0.95fr_1.05fr]">
        <aside className="flex min-h-screen flex-col border-r border-white/10 bg-[#0c1628]">
          <div className="border-b border-white/10 px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-amber">stokky</p>
                <h1 className="mt-2 font-display text-3xl font-bold">Live conversation</h1>
              </div>
              <button
                type="button"
                onClick={handleLeave}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
              >
                <ChevronLeft className="h-4 w-4" />
                Setup
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/70">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {queueStats.waiting} waiting now
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {connectionLabel(connectionState)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {profile?.nickname || "Guest"}
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-white/65">{status.text}</p>
          </div>

          <div ref={messagesRef} className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
            {messages.length ? (
              messages.map((message, index) => {
                const mine = message.senderId === socketRef.current?.id;

                return (
                  <div key={message.id || message._id || `${message.createdAt}-${index}`} className={mine ? "text-right" : ""}>
                    <div
                      className={clsx(
                        "inline-block max-w-[85%] rounded-[28px] px-4 py-3 text-left text-sm leading-6",
                        mine ? "bg-brand-blue text-white" : "bg-white/10 text-white/88"
                      )}
                    >
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] opacity-60">
                        {mine ? "You" : message.senderLabel || "Stranger"}
                      </p>
                      <p>{message.text}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex h-full min-h-60 items-center justify-center rounded-[32px] border border-dashed border-white/10 bg-white/[0.03] p-8 text-center text-sm leading-7 text-white/55">
                Messages from the current call will appear here. Skip anytime to jump to another person.
              </div>
            )}
          </div>

          <div className="border-t border-white/10 px-6 py-5">
            <div className="mb-4 flex flex-wrap gap-2">
              {sharedInterests.length ? (
                sharedInterests.map((interest) => (
                  <span key={interest} className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                    {interest}
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/55">
                  No overlap yet
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <input
                className="w-full rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-brand-blue"
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={room ? "Type a message..." : "Match first to start chatting"}
              />
              <button type="button" className="button-primary rounded-full px-4" onClick={sendMessage}>
                <Send className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleSkip}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-semibold text-brand-ink transition hover:bg-brand-cream"
              >
                <SkipForward className="h-4 w-4" />
                Skip
              </button>
              <button
                type="button"
                onClick={handleLeave}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <X className="h-4 w-4" />
                Leave
              </button>
            </div>
          </div>
        </aside>

        <section className="grid min-h-screen grid-rows-2 bg-[#050a13]">
          <DesktopVideoPanel
            title="Your camera"
            subtitle={cameraEnabled ? "Live preview ready" : "Camera is off"}
            videoRef={localVideoRef}
            active={localReady}
            muted
            overlay={
              <div className="flex gap-2">
                <ControlButton
                  icon={cameraEnabled ? Camera : CameraOff}
                  label={cameraEnabled ? "Camera on" : "Camera off"}
                  onClick={() => toggleTrack("video")}
                />
                <ControlButton
                  icon={micEnabled ? Mic : MicOff}
                  label={micEnabled ? "Mic on" : "Mic off"}
                  onClick={() => toggleTrack("audio")}
                />
              </div>
            }
            placeholder="Allow camera access to see yourself here."
          />

          <DesktopVideoPanel
            title={room?.stranger?.nickname || "Stranger"}
            subtitle={isMatched ? "Remote live stream" : "Waiting for a match"}
            videoRef={remoteVideoRef}
            active={remoteActive}
            placeholder={isMatched ? "Connecting remote video..." : "We will place the other person's video here."}
          />
        </section>
      </section>

      <section className="relative min-h-screen lg:hidden">
        <div className="absolute inset-0 bg-black">
          <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
          {!remoteActive ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_top,rgba(49,100,244,0.3),transparent_32%),linear-gradient(180deg,#132850_0%,#050a13_100%)] px-8 text-center">
              <div className="mb-5 rounded-full bg-white/10 p-4">
                <LoaderCircle className={clsx("h-7 w-7", status.phase === "searching" ? "animate-spin" : "")} />
              </div>
              <h1 className="font-display text-3xl font-bold">
                {room?.stranger?.nickname || "Waiting for your next live match"}
              </h1>
              <p className="mt-3 max-w-sm text-sm leading-7 text-white/70">{status.text}</p>
            </div>
          ) : null}
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/65 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/90 to-transparent" />
        </div>

        <div className="relative flex min-h-screen flex-col">
          <div className="flex items-start justify-between p-4">
            <div className="rounded-2xl bg-black/35 px-4 py-3 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-brand-amber">stokky</p>
              <p className="mt-2 text-sm font-semibold">{room?.stranger?.nickname || "Looking for someone..."}</p>
              <p className="mt-1 text-xs text-white/65">{connectionLabel(connectionState)}</p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => toggleTrack("video")}
                className="rounded-full bg-black/35 p-3 text-white backdrop-blur"
              >
                {cameraEnabled ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
              </button>
              <button
                type="button"
                onClick={() => toggleTrack("audio")}
                className="rounded-full bg-black/35 p-3 text-white backdrop-blur"
              >
                {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className="pointer-events-none absolute right-4 top-24 w-28 overflow-hidden rounded-[24px] border border-white/15 bg-black/40 shadow-2xl backdrop-blur">
            <video ref={localVideoRef} autoPlay playsInline muted className="aspect-[3/4] w-full object-cover" />
            {!localReady ? (
              <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-[11px] text-white/70">
                You
              </div>
            ) : null}
          </div>

          <div className="mt-auto px-4 pb-8">
            <div
              ref={messagesRef}
              className="mb-3 max-h-56 space-y-2 overflow-y-auto rounded-[28px] border border-white/10 bg-black/28 p-3 backdrop-blur"
            >
              {messages.length ? (
                messages.map((message, index) => {
                  const mine = message.senderId === socketRef.current?.id;

                  return (
                    <div key={message.id || message._id || `${message.createdAt}-${index}`} className={mine ? "text-right" : ""}>
                      <div
                        className={clsx(
                          "inline-block max-w-[88%] rounded-3xl px-4 py-2.5 text-left text-sm leading-6",
                          mine ? "bg-brand-blue text-white" : "bg-white/14 text-white/90"
                        )}
                      >
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] opacity-65">
                          {mine ? "You" : message.senderLabel || "Stranger"}
                        </p>
                        <p>{message.text}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-3xl bg-white/8 px-4 py-3 text-sm text-white/65">
                  Messages from this call float here over the video. Scroll to see earlier messages.
                </div>
              )}
            </div>

            <div className="rounded-[32px] border border-white/10 bg-black/45 p-3 backdrop-blur">
              <div className="mb-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-semibold text-brand-ink"
                >
                  <SkipForward className="h-4 w-4" />
                  Skip
                </button>
                <button
                  type="button"
                  onClick={handleLeave}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white"
                >
                  <X className="h-4 w-4" />
                  Leave
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  className="w-full rounded-full border border-white/10 bg-white/8 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
                  value={messageInput}
                  onChange={(event) => setMessageInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Send a message..."
                />
                <button type="button" onClick={sendMessage} className="button-primary rounded-full px-4">
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function connectionLabel(state) {
  if (!state || state === "new" || state === "waiting") {
    return "Waiting";
  }

  if (state === "searching") {
    return "Searching";
  }

  if (state === "connected") {
    return "Connected";
  }

  if (state === "connecting") {
    return "Connecting";
  }

  return state;
}

function DesktopVideoPanel({ title, subtitle, videoRef, active, muted = false, placeholder, overlay }) {
  return (
    <div className="relative border-b border-white/10 p-5 last:border-b-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(49,100,244,0.22),transparent_28%)]" />
      <div className="relative flex h-full flex-col">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-white/45">{title}</p>
            <p className="mt-2 text-sm text-white/65">{subtitle}</p>
          </div>
          {overlay}
        </div>
        <div className="relative flex-1 overflow-hidden rounded-[34px] border border-white/10 bg-black/40">
          <video ref={videoRef} autoPlay playsInline muted={muted} className="h-full w-full object-cover" />
          {!active ? (
            <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-7 text-white/55">
              {placeholder}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ControlButton({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/12"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
