import Link from "next/link";
import { ArrowRight, MessageCircle, ShieldCheck, Sparkles, Video } from "lucide-react";

const featureCards = [
  {
    title: "Video & text in one room",
    description: "Switch between face-to-face conversation and fast text chat without leaving the match.",
    icon: Video
  },
  {
    title: "Keyword-first matchmaking",
    description: "Add interests like design, coding, startups, cricket, or cinema and get better matches faster.",
    icon: Sparkles
  },
  {
    title: "Built for busy rooms",
    description: "Socket-based queueing keeps matching responsive when lots of people arrive together.",
    icon: MessageCircle
  }
];

const steps = [
  "Set a nickname and choose interests.",
  "Pick text, video, or both.",
  "Join the queue and get matched instantly."
];

export default function HomePage() {
  return (
    <main className="relative overflow-hidden">
      <section className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-brand-blue">stokky</p>
            <h1 className="font-display text-3xl font-bold sm:text-4xl">Random conversations, upgraded.</h1>
          </div>
          <Link href="/chat" className="button-primary">
            Start now
          </Link>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="panel relative overflow-hidden p-8 sm:p-10">
            <div className="absolute inset-0 -z-10 bg-grid-fade bg-grid-fade opacity-70" />
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-brand-sky px-4 py-2 text-sm font-semibold text-brand-blue">
              <ShieldCheck className="h-4 w-4" />
              Private 1-to-1 sessions with keyword matching
            </div>
            <h2 className="max-w-2xl font-display text-4xl font-bold leading-tight sm:text-6xl">
              Omegle energy, cleaner flow, better control.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-brand-ink/75">
              stokky pairs strangers around shared interests, then opens a smooth video and messaging space that feels
              familiar without feeling dated.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/chat" className="button-primary">
                Enter chat
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <a href="#features" className="button-secondary">
                Explore features
              </a>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {steps.map((step, index) => (
                <div key={step} className="rounded-2xl border border-brand-ink/10 bg-white/80 p-4">
                  <div className="mb-2 text-sm font-bold text-brand-blue">0{index + 1}</div>
                  <p className="text-sm leading-6 text-brand-ink/80">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="panel-dark relative overflow-hidden p-6 sm:p-8">
            <div className="absolute -right-16 top-0 h-36 w-36 rounded-full bg-brand-amber/30 blur-3xl" />
            <div className="absolute -left-20 bottom-0 h-44 w-44 rounded-full bg-brand-blue/30 blur-3xl" />
            <div className="relative">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-white/60">Live Preview</p>
                  <h3 className="mt-2 text-2xl font-bold">What your room feels like</h3>
                </div>
                <span className="status-pill border-white/15 bg-white/10 text-white">Fast match</span>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/5 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-3xl bg-gradient-to-br from-brand-blue via-[#1c2f61] to-[#0f1730] p-4">
                    <div className="mb-3 flex items-center justify-between text-sm text-white/80">
                      <span>You</span>
                      <span className="status-pill border-white/15 bg-white/10 text-white">Camera on</span>
                    </div>
                    <div className="aspect-[4/3] rounded-2xl border border-white/10 bg-black/35" />
                  </div>
                  <div className="rounded-3xl bg-white/10 p-4">
                    <div className="mb-3 flex items-center justify-between text-sm text-white/80">
                      <span>Stranger</span>
                      <span className="status-pill border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
                        Interest match
                      </span>
                    </div>
                    <div className="aspect-[4/3] rounded-2xl border border-dashed border-white/20 bg-black/30" />
                  </div>
                </div>

                <div className="mt-4 rounded-3xl bg-white/10 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="font-semibold">Shared keywords</p>
                    <div className="flex gap-2 text-xs">
                      {["startup", "movies", "ui/ux"].map((item) => (
                        <span key={item} className="rounded-full bg-white/10 px-3 py-1">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-white/85">
                    <p><span className="font-semibold text-brand-amber">You:</span> Have you worked on any side project recently?</p>
                    <p><span className="font-semibold text-sky-300">Stranger:</span> Yes, I am building a travel reels app with Next.js.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section id="features" className="mt-8 grid gap-4 md:grid-cols-3">
          {featureCards.map(({ title, description, icon: Icon }) => (
            <div key={title} className="panel p-6">
              <div className="mb-4 inline-flex rounded-2xl bg-brand-sky p-3 text-brand-blue">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-2xl font-bold">{title}</h3>
              <p className="mt-3 leading-7 text-brand-ink/75">{description}</p>
            </div>
          ))}
        </section>
      </section>
    </main>
  );
}
