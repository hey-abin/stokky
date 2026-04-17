"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  BadgeCheck,
  Camera,
  CameraOff,
  MessageSquareText,
  Mic,
  MicOff,
  RefreshCw,
  Send,
  SkipForward,
  Users,
  Video
} from "lucide-react";
import { getSocket } from "@/lib/socket-client";

const DEFAULT_FORM = {
  nickname: "",
  interests: "design, coding, cinema",
  mode: "both"
};

const initialStatus = {
  phase: "idle",
  text: "Ready when you are.",
  tone: "neutral"
};

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

function normalizeInterests(rawValue) {
  return [...new Set(rawValue.split(",").map((item) => item.trim()).filter(Boolean))].slice(0, 8);
}

export default function ChatShell() {
  const socketRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const roomRef = useRef(null);
  const scrollRef = useRef(null);

  const [form, setForm] = useState(DEFAULT_FORM);
  const [status, setStatus] = useState(initialStatus);
  const [queueStats, setQueueStats] = useState({ waiting: 0 });
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [connectionState, setConnectionState] = useState("new");

  const sharedInterests = room?.sharedInterests || [];
  const isSearching = status.phase === "searching";
  const isMatched = status.phase === "matched";
  const supportsVideo = useMemo(() => {
    if (room) {
      return room.mode !== "text";
    }

    return form.mode !== "text";
  }, [form.mode, room]);

  const createPeerConnection = useCallback(async (targetId, roomId) => {
    const socket = socketRef.current;
    const peer = new RTCPeerConnection({
      iceServers: buildIceServers()
    });

    peer.onconnectionstatechange = () => {
      setConnectionState(peer.connectionState);
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

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peerConnectionRef.current = peer;
    return peer;
  }, []);

  const setupMedia = useCallback(async (shouldInitiate, targetId, roomId) => {
    if (!navigator.mediaDevices) {
      setStatus({
        phase: "matched",
        text: "Your browser does not support camera or microphone access.",
        tone: "warn"
      });
      return;
    }

    try {
      const peer = await createPeerConnection(targetId, roomId);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

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
        phase: "matched",
        text: "Matched successfully, but camera or microphone access was blocked.",
        tone: "warn"
      });
    }
  }, [createPeerConnection]);

  const teardownMedia = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const teardownRoom = useCallback(() => {
    if (roomRef.current && socketRef.current) {
      socketRef.current.emit("room:leave", { roomId: roomRef.current });
    }

    teardownMedia();
    roomRef.current = null;
    setRoom(null);
    setMessages([]);
    setConnectionState("new");
  }, [teardownMedia]);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const handleQueueStats = (stats) => setQueueStats(stats);

    const handleMatchFound = async (payload) => {
      roomRef.current = payload.roomId;
      setRoom({
        roomId: payload.roomId,
        stranger: payload.stranger,
        mode: payload.you.mode,
        sharedInterests: payload.sharedInterests,
        initiator: payload.initiator,
        you: payload.you
      });
      setStatus({
        phase: "matched",
        text: `Matched with ${payload.stranger.nickname || "a stranger"}.`,
        tone: "success"
      });
      setMessages([]);
      socket.emit("room:join", { roomId: payload.roomId });

      const response = await fetch(`/api/rooms/${payload.roomId}/messages`);
      const data = await response.json();
      setMessages(data.messages || []);

      if (payload.you.mode !== "text") {
        await setupMedia(payload.initiator, payload.stranger.socketId, payload.roomId);
      }
    };

    const handleMessage = (payload) => {
      setMessages((current) => [...current, payload]);
    };

    const handleSignal = async ({ senderId, data, roomId }) => {
      if (!peerConnectionRef.current) {
        await setupMedia(false, senderId, roomId);
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
      setStatus({
        phase: "idle",
        text: "The stranger left. You can start again whenever you want.",
        tone: "neutral"
      });
      teardownRoom();
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
      teardownRoom();
    };
  }, [setupMedia, teardownRoom]);

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function beginSearch() {
    const socket = socketRef.current;
    const interests = normalizeInterests(form.interests);
    setStatus({
      phase: "searching",
      text: "Looking for someone with matching interests...",
      tone: "info"
    });
    teardownRoom();

    socket.emit(
      "queue:join",
      {
        nickname: form.nickname.trim() || "Guest",
        interests,
        mode: form.mode
      },
      (response) => {
        if (!response?.ok) {
          setStatus({
            phase: "idle",
            text: response?.error || "Queue join failed. Please try again.",
            tone: "warn"
          });
          return;
        }

        if (!response.matched) {
          setStatus({
            phase: "searching",
            text: `You are in queue. Position ${response.position}.`,
            tone: "info"
          });
        }
      }
    );
  }

  function stopSearch() {
    socketRef.current?.emit("queue:leave");
    setStatus(initialStatus);
  }

  function leaveCurrentRoom() {
    teardownRoom();
    setStatus(initialStatus);
  }

  function sendMessage() {
    const trimmed = messageInput.trim();
    if (!trimmed || !room?.roomId) {
      return;
    }

    socketRef.current.emit("chat:send", {
      roomId: room.roomId,
      text: trimmed,
      senderLabel: form.nickname.trim() || "You"
    });
    setMessageInput("");
  }

  function toggleTrack(kind) {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }

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
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-brand-blue">stokky</p>
          <h1 className="font-display text-3xl font-bold">Meet new people around shared interests.</h1>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-brand-ink/10 bg-white/80 px-4 py-2 text-sm">
          <Users className="h-4 w-4 text-brand-blue" />
          <span>{queueStats.waiting} waiting now</span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <aside className="panel p-5">
          <div className="mb-5">
            <h2 className="font-display text-2xl font-bold">Your setup</h2>
            <p className="mt-2 text-sm leading-6 text-brand-ink/70">
              Add a name, list a few interests, and choose how you want to connect.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">Nickname</label>
              <input
                className="field"
                value={form.nickname}
                onChange={(event) => setForm((current) => ({ ...current, nickname: event.target.value }))}
                placeholder="Your display name"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">Keywords</label>
              <textarea
                className="field min-h-28 resize-none"
                value={form.interests}
                onChange={(event) => setForm((current) => ({ ...current, interests: event.target.value }))}
                placeholder="music, startups, cricket, anime"
              />
              <p className="mt-2 text-xs leading-5 text-brand-ink/60">Separate each interest with commas.</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">Mode</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "text", label: "Text" },
                  { value: "video", label: "Video" },
                  { value: "both", label: "Both" }
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, mode: option.value }))}
                    className={clsx(
                      "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                      form.mode === option.value
                        ? "border-brand-blue bg-brand-blue text-white"
                        : "border-brand-ink/10 bg-white hover:border-brand-blue/40"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl bg-brand-ink p-4 text-white">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-amber">
              <BadgeCheck className="h-4 w-4" />
              Session status
            </div>
            <p className="mt-3 text-base leading-7">{status.text}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {!isSearching && !isMatched ? (
                <button type="button" className="button-primary" onClick={beginSearch}>
                  Find a stranger
                </button>
              ) : null}

              {isSearching ? (
                <button type="button" className="button-secondary border-white/20 bg-white/10 text-white" onClick={stopSearch}>
                  Cancel queue
                </button>
              ) : null}

              {isMatched ? (
                <>
                  <button type="button" className="button-primary" onClick={beginSearch}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    New match
                  </button>
                  <button
                    type="button"
                    className="button-secondary border-white/20 bg-white/10 text-white"
                    onClick={leaveCurrentRoom}
                  >
                    <SkipForward className="mr-2 h-4 w-4" />
                    Leave
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </aside>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="panel overflow-hidden p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-bold">Live room</h2>
                  <p className="text-sm text-brand-ink/65">
                    {room ? `Talking with ${room.stranger.nickname || "a stranger"}` : "Waiting to create a room"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="status-pill border-brand-blue/20 bg-brand-sky text-brand-blue">
                    <Video className="h-3.5 w-3.5" />
                    {supportsVideo ? connectionState : "Text only"}
                  </span>
                  {sharedInterests.length ? (
                    <span className="status-pill border-emerald-300 bg-emerald-50 text-emerald-700">
                      {sharedInterests.length} shared interest{sharedInterests.length > 1 ? "s" : ""}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className={clsx("grid gap-4", supportsVideo ? "md:grid-cols-2" : "grid-cols-1")}>
                <VideoPanel
                  label={form.nickname || "You"}
                  muted
                  videoRef={localVideoRef}
                  active={Boolean(localStreamRef.current)}
                  placeholder="Your camera preview appears here"
                  accent="primary"
                />

                {supportsVideo ? (
                  <VideoPanel
                    label={room?.stranger?.nickname || "Stranger"}
                    videoRef={remoteVideoRef}
                    active={Boolean(remoteStreamRef.current)}
                    placeholder="Remote stream appears after WebRTC connects"
                    accent="secondary"
                  />
                ) : (
                  <div className="panel-dark flex min-h-[260px] flex-col justify-between p-6">
                    <div>
                      <p className="text-sm uppercase tracking-[0.3em] text-white/50">Text Mode</p>
                      <h3 className="mt-2 text-2xl font-bold">Messaging-only conversation</h3>
                    </div>
                    <p className="max-w-md text-sm leading-6 text-white/75">
                      This room skips camera and microphone access and focuses on fast text conversation.
                    </p>
                  </div>
                )}
              </div>

              {supportsVideo ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <IconToggle
                    icon={cameraEnabled ? Camera : CameraOff}
                    label={cameraEnabled ? "Camera on" : "Camera off"}
                    onClick={() => toggleTrack("video")}
                  />
                  <IconToggle
                    icon={micEnabled ? Mic : MicOff}
                    label={micEnabled ? "Mic on" : "Mic muted"}
                    onClick={() => toggleTrack("audio")}
                  />
                </div>
              ) : null}
            </div>

            <div className="panel p-5">
              <h3 className="font-display text-2xl font-bold">Shared keywords</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {sharedInterests.length ? (
                  sharedInterests.map((interest) => (
                    <span key={interest} className="rounded-full bg-brand-sky px-4 py-2 text-sm font-semibold text-brand-blue">
                      {interest}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-brand-ink/65">No strong keyword overlap yet, but you can still chat.</p>
                )}
              </div>
            </div>
          </div>

          <div className="panel flex min-h-[600px] flex-col p-4">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-brand-ink/10 pb-4">
              <div>
                <h2 className="font-display text-2xl font-bold">Messages</h2>
                <p className="text-sm text-brand-ink/65">Keep the conversation moving while video connects.</p>
              </div>
              <MessageSquareText className="h-6 w-6 text-brand-blue" />
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
              {messages.length ? (
                messages.map((message, index) => {
                  const mine = message.senderId === socketRef.current?.id;

                  return (
                    <div
                      key={message.id || message._id || `${message.createdAt}-${index}`}
                      className={clsx("flex", mine ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={clsx(
                          "max-w-[85%] rounded-3xl px-4 py-3",
                          mine ? "bg-brand-blue text-white" : "bg-brand-sky text-brand-ink"
                        )}
                      >
                        <p className="mb-1 text-xs font-semibold opacity-70">
                          {mine ? "You" : message.senderLabel || "Stranger"}
                        </p>
                        <p className="text-sm leading-6">{message.text}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex h-full min-h-60 items-center justify-center rounded-3xl border border-dashed border-brand-ink/10 bg-brand-sky/40 p-6 text-center text-sm leading-7 text-brand-ink/65">
                  Messages will appear here once you connect with someone.
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-2 border-t border-brand-ink/10 pt-4">
              <input
                className="field"
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Say hi, ask a question, share a thought..."
              />
              <button type="button" className="button-primary px-4" onClick={sendMessage}>
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function VideoPanel({ label, muted = false, videoRef, active, placeholder, accent }) {
  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-[28px] p-4",
        accent === "primary"
          ? "bg-gradient-to-br from-brand-blue to-[#12213e] text-white"
          : "border border-brand-ink/10 bg-white"
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className={clsx("font-semibold", accent === "primary" ? "text-white" : "text-brand-ink")}>{label}</p>
        <span
          className={clsx(
            "status-pill",
            active
              ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-100"
              : accent === "primary"
                ? "border-white/15 bg-white/10 text-white/85"
                : "border-brand-ink/10 bg-brand-sky text-brand-blue"
          )}
        >
          {active ? "Live" : "Waiting"}
        </span>
      </div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-black/10 bg-black/20">
        <video ref={videoRef} autoPlay playsInline muted={muted} className="h-full w-full object-cover" />
        {!active ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm leading-6 text-white/75">
            {placeholder}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function IconToggle({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-full border border-brand-ink/10 bg-white px-4 py-2 text-sm font-semibold text-brand-ink transition hover:border-brand-blue hover:text-brand-blue"
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
