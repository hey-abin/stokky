"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, Users, Video } from "lucide-react";

const STORAGE_KEY = "stokky-profile";

const DEFAULT_FORM = {
  nickname: "",
  interests: ""
};

export default function ChatSetup() {
  const router = useRouter();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [error, setError] = useState("");

  useEffect(() => {
    const savedProfile = window.sessionStorage.getItem(STORAGE_KEY);

    if (!savedProfile) {
      return;
    }

    try {
      const parsed = JSON.parse(savedProfile);
      setForm({
        nickname: parsed.nickname || "",
        interests: (parsed.interests || []).join(", ")
      });
    } catch (_error) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const keywordCount = useMemo(
    () => form.interests.split(",").map((item) => item.trim()).filter(Boolean).length,
    [form.interests]
  );

  async function handleSubmit(event) {
    event.preventDefault();

    const nickname = form.nickname.trim();
    const interests = [...new Set(form.interests.split(",").map((item) => item.trim()).filter(Boolean))].slice(0, 8);

    if (!nickname) {
      setError("Add your name before continuing.");
      return;
    }

    if (!interests.length) {
      setError("Add at least one keyword so stokky can find a better match.");
      return;
    }

    // High-visibility check for Secure Context
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("Insecure Connection Detected: Browsers block camera/mic access on non-localhost HTTP sites. Please use an HTTPS ngrok link or localhost.");
      return;
    }

    setError("Requesting camera and microphone access...");
    
    try {
      // Check if mediaDevices is supported (only available in Secure Contexts)
      if (!navigator.mediaDevices) {
        throw new Error("mediaDevices_not_supported");
      }

      // Force the browser to ask for permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: true 
      });
      
      // Stop the stream immediately, it was just to check/prompt for permission
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      console.error("Media permission error:", err);
      if (err.message === "mediaDevices_not_supported") {
        setError("Your browser context is not secure. Please use 'localhost' or '127.0.0.1' to access the chat.");
      } else {
        setError("Camera and microphone access is required to enter the chat room. Please enable them in your browser settings.");
      }
      return;
    }

    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        nickname,
        interests,
        mode: "both"
      })
    );

    router.push("/chat/room");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f6f1e4] px-4 py-6 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,176,32,0.22),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(49,100,244,0.12),transparent_32%)]" />
      <section className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col justify-center">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-brand-blue">stokky</p>
            <h1 className="font-display text-3xl font-bold text-brand-ink sm:text-5xl">
              Step in, set your vibe, meet someone live.
            </h1>
          </div>
          <div className="hidden rounded-full border border-brand-ink/10 bg-white/75 px-4 py-2 text-sm text-brand-ink/70 lg:flex lg:items-center lg:gap-2">
            <Users className="h-4 w-4 text-brand-blue" />
            Video-first random chat
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <form className="panel p-6 sm:p-8" onSubmit={handleSubmit}>
            <div className="mb-6">
              <p className="inline-flex items-center gap-2 rounded-full bg-brand-sky px-3 py-1 text-sm font-semibold text-brand-blue">
                <Sparkles className="h-4 w-4" />
                Setup first, then straight into the room
              </p>
              <h2 className="mt-4 font-display text-3xl font-bold">Your intro</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-brand-ink/70">
                Drop your name and a few keywords. Once you continue, stokky opens a dedicated video-and-chat screen.
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold">Your name</label>
                <input
                  className="field"
                  value={form.nickname}
                  onChange={(event) => {
                    setError("");
                    setForm((current) => ({ ...current, nickname: event.target.value }));
                  }}
                  placeholder="abin"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">Keywords</label>
                <textarea
                  className="field min-h-32 resize-none"
                  value={form.interests}
                  onChange={(event) => {
                    setError("");
                    setForm((current) => ({ ...current, interests: event.target.value }));
                  }}
                  placeholder="design, football, anime, startups"
                />
                <div className="mt-2 flex items-center justify-between text-xs text-brand-ink/60">
                  <span>Use commas to separate each keyword.</span>
                  <span>{keywordCount}/8 keywords</span>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-brand-ink/10 bg-[#132850] p-5 text-white">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand-amber">
                <Video className="h-4 w-4" />
                What happens next
              </div>
              <p className="mt-3 text-sm leading-7 text-white/85">
                stokky asks for camera and microphone access, opens a dedicated room, and starts matching immediately.
              </p>
              {error ? <p className="mt-4 text-sm font-semibold text-rose-300">{error}</p> : null}
              <button type="submit" className="mt-5 button-primary w-full justify-center">
                Continue to call room
                <ArrowRight className="ml-2 h-4 w-4" />
              </button>
            </div>
          </form>

          <div className="panel-dark overflow-hidden p-6 sm:p-8">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.35em] text-white/50">Live layout</p>
                <h3 className="mt-2 font-display text-3xl font-bold">Video first. Chat always open.</h3>
              </div>
              <span className="status-pill border-white/15 bg-white/10 text-white">24h room history</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-[28px] bg-white/10 p-4">
                <div className="mb-3 flex items-center justify-between text-sm text-white/70">
                  <span>Chat column</span>
                  <span>Skip / Leave</span>
                </div>
                <div className="space-y-3">
                  <div className="rounded-3xl bg-white/10 p-4 text-sm text-white/80">
                    Shared messages sit beside the call on desktop.
                  </div>
                  <div className="rounded-3xl bg-brand-blue/80 p-4 text-sm text-white">You: What kind of projects are you into?</div>
                  <div className="rounded-3xl bg-white/10 p-4 text-sm text-white/85">
                    Stranger: Mostly design systems and indie product ideas.
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-[28px] bg-gradient-to-br from-brand-blue to-[#0f1730] p-4">
                  <div className="mb-3 flex items-center justify-between text-sm text-white/75">
                    <span>Your camera</span>
                    <span>Mic / Camera controls</span>
                  </div>
                  <div className="aspect-video rounded-3xl bg-black/30" />
                </div>
                <div className="rounded-[28px] border border-white/10 bg-white/10 p-4">
                  <div className="mb-3 flex items-center justify-between text-sm text-white/75">
                    <span>Stranger video</span>
                    <span>Full focus</span>
                  </div>
                  <div className="aspect-video rounded-3xl border border-dashed border-white/20 bg-black/20" />
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[28px] border border-white/10 bg-white/5 p-4 text-sm leading-7 text-white/80">
              On mobile, the stranger video becomes the full-screen background, your messages float over it, and the
              composer with skip and leave stays pinned to the bottom.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
