"use client";
import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  CheckCheck,
  MessageCircleQuestion,
  Milestone,
  Pause,
  Play,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { channels } from "@/lib/site-copy";

/* The launch "film": an online call and an in-person chat stream into one
   memory, which then produces insights. Pure SVG + HTML on a single 12s CSS
   timeline (keyframes in app/globals.css). HTML cards are positioned in
   percentages of a stage whose aspect ratio matches the SVG viewBox, so the
   connector paths always land on the cards. Under reduced motion the
   keyframes are disabled and the resting styles show the finished frame. */

/* Tailwind only generates classes it can find written out in the source, so
   every timeline class is spelled out literally here (no string building). */
const beat = {
  online: "[animation:film-online_12s_ease-in-out_infinite]",
  offline: "[animation:film-offline_12s_ease-in-out_infinite]",
  drawIn: "[animation:film-draw-in_12s_ease-in-out_infinite]",
  drawOut: "[animation:film-draw-out_12s_ease-in-out_infinite]",
  pulseWindow: "[animation:film-pulse-window_12s_linear_infinite]",
  pulseWindowOut: "[animation:film-pulse-window-out_12s_linear_infinite]",
  orb: "[animation:film-orb_12s_ease-in-out_infinite]",
  halo: "[animation:film-halo_12s_ease-out_infinite]",
  chip1: "[animation:film-chip-1_12s_ease-in-out_infinite]",
  chip2: "[animation:film-chip-2_12s_ease-in-out_infinite]",
  chip3: "[animation:film-chip-3_12s_ease-in-out_infinite]",
  chip4: "[animation:film-chip-4_12s_ease-in-out_infinite]",
} as const;

type Insight = {
  icon: LucideIcon;
  kind: string;
  text: string;
  from: string;
  /** Desktop position (left/top in %) and mobile position. */
  desk: string;
  mob: string;
  keyframe: string;
};

const insights: Insight[] = [
  {
    icon: CheckCheck,
    kind: "Promise",
    text: "Send the revised proposal by Friday",
    from: channels.online.label,
    desk: "md:left-[69%] md:top-[17%]",
    mob: "left-[3%] top-[66%]",
    keyframe: beat.chip1,
  },
  {
    icon: Milestone,
    kind: "Decision",
    text: "Go with pricing option B",
    from: channels.inPerson.label,
    desk: "md:left-[69%] md:top-[39%]",
    mob: "left-[51%] top-[66%]",
    keyframe: beat.chip2,
  },
  {
    icon: CalendarClock,
    kind: "Prep brief",
    text: "Aarav · 2 things still open",
    from: "Both",
    desk: "md:left-[69%] md:top-[61%]",
    mob: "left-[3%] top-[85.5%]",
    keyframe: beat.chip3,
  },
  {
    icon: MessageCircleQuestion,
    kind: "Ask",
    text: "“What did we agree on pricing?”",
    from: "Both",
    desk: "md:left-[69%] md:top-[83%]",
    mob: "left-[51%] top-[85.5%]",
    keyframe: beat.chip4,
  },
];

const deskIn = [
  "M175,129 C340,129 370,280 500,280",
  "M175,431 C340,431 370,280 500,280",
];
const deskOut = [95, 218, 342, 465].map(
  (y) => `M500,280 C640,280 650,${y} 825,${y}`,
);
const mobIn = [
  "M104,106 C104,170 200,155 200,224",
  "M296,106 C296,170 200,155 200,224",
];
const mobOut = [
  "M200,224 C200,300 104,300 104,370",
  "M200,224 C200,300 296,300 296,370",
  "M200,224 C200,330 104,400 104,479",
  "M200,224 C200,330 296,400 296,479",
];

function Paths({
  incoming,
  outgoing,
  viewBox,
  className,
}: {
  incoming: string[];
  outgoing: string[];
  viewBox: string;
  className: string;
}) {
  const common = {
    fill: "none",
    pathLength: 1,
    strokeLinecap: "round" as const,
  };
  return (
    <svg
      viewBox={viewBox}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
    >
      {incoming.map((d) => (
        <path
          key={d}
          d={d}
          {...common}
          stroke="var(--line-strong)"
          strokeWidth={2}
          strokeDasharray="1"
          strokeDashoffset={0}
          className={beat.drawIn}
        />
      ))}
      {outgoing.map((d) => (
        <path
          key={d}
          d={d}
          {...common}
          stroke="var(--line-strong)"
          strokeWidth={2}
          strokeDasharray="1"
          strokeDashoffset={0}
          className={beat.drawOut}
        />
      ))}
      {/* Travelling pulses: short bright dashes running along the paths,
          shown only once their path has been drawn. */}
      {[
        { paths: incoming, timing: beat.pulseWindow },
        { paths: outgoing, timing: beat.pulseWindowOut },
      ].map(({ paths, timing }) => (
        <g key={timing} className={timing}>
          {paths.map((d, index) => (
            <path
              key={`pulse-${d}`}
              d={d}
              {...common}
              stroke="var(--accent)"
              strokeWidth={3}
              strokeDasharray="0.07 0.93"
              strokeDashoffset={0}
              style={{ animationDelay: `${(index % 3) * -0.45}s` }}
              className="[animation:film-pulse_1.6s_linear_infinite]"
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

function Wave({ delay = 0 }: { delay?: number }) {
  return (
    <span className="flex h-5 items-center gap-[3px]" aria-hidden="true">
      {[0.6, 1, 0.75, 0.9, 0.5, 0.85, 0.65].map((height, index) => (
        <span
          key={index}
          style={{
            height: `${height * 100}%`,
            animationDelay: `${delay + index * -0.13}s`,
          }}
          className="w-[3px] rounded-full bg-accent [animation:film-wave_0.9s_ease-in-out_infinite]"
        />
      ))}
    </span>
  );
}

function SourceCard({
  icon: Icon,
  label,
  title,
  meta,
  position,
  keyframe,
  delay,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  meta: string;
  position: string;
  keyframe: string;
  delay?: number;
}) {
  return (
    <div
      className={cn(
        "absolute z-10 w-[46%] -translate-y-1/2 rounded-2xl border border-line bg-surface p-3 shadow-card md:w-[27%] md:p-4",
        position,
        keyframe,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink md:size-8">
          <Icon size={16} />
        </span>
        <span className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-accent-ink md:text-[0.6875rem]">
          {label}
        </span>
      </div>
      <p className="mt-2 text-[0.8125rem] font-semibold leading-snug text-ink md:text-[0.9375rem]">
        {title}
      </p>
      <div className="mt-2 hidden items-center justify-between gap-2 md:flex">
        <span className="text-xs text-faint">{meta}</span>
        <Wave delay={delay} />
      </div>
    </div>
  );
}

export function FlowFilm() {
  const stage = useRef<HTMLDivElement>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [offscreen, setOffscreen] = useState(false);

  /* Don't burn cycles while nobody can see it. */
  useEffect(() => {
    const element = stage.current;
    if (!element || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => setOffscreen(!entry.isIntersecting),
      { threshold: 0.05 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const paused = userPaused || offscreen;

  return (
    <figure className="relative">
      <div
        ref={stage}
        data-paused={paused ? "" : undefined}
        role="img"
        aria-label="Animated illustration: an online meeting and an in-person conversation both flow into one memory, which then produces a promise, a decision, a prep brief and an answer to a question."
        className="relative mx-auto aspect-[400/560] w-full overflow-hidden rounded-[28px] border border-line bg-surface/60 shadow-float backdrop-blur-sm data-paused:**:[animation-play-state:paused] md:aspect-[1000/560]"
      >
        {/* Soft dotted backdrop */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-60 [background-image:radial-gradient(var(--line-strong)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_80%)]"
        />

        <Paths
          incoming={deskIn}
          outgoing={deskOut}
          viewBox="0 0 1000 560"
          className="hidden md:block"
        />
        <Paths
          incoming={mobIn}
          outgoing={mobOut}
          viewBox="0 0 400 560"
          className="md:hidden"
        />

        <SourceCard
          icon={channels.online.icon}
          label={channels.online.label}
          title={channels.online.example}
          meta={channels.online.meta}
          position="left-[3%] top-[19%] md:left-[4%] md:top-[23%]"
          keyframe={beat.online}
        />
        <SourceCard
          icon={channels.inPerson.icon}
          label={channels.inPerson.label}
          title={channels.inPerson.example}
          meta={channels.inPerson.meta}
          position="left-[51%] top-[19%] md:left-[4%] md:top-[77%]"
          keyframe={beat.offline}
          delay={-0.4}
        />

        {/* The memory orb */}
        <div className="absolute left-1/2 top-[40%] z-10 -translate-x-1/2 -translate-y-1/2 md:top-1/2">
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-0 rounded-full border-2 border-accent opacity-0",
              beat.halo,
            )}
          />
          <div
            className={cn(
              "relative grid size-24 place-items-center rounded-full bg-[radial-gradient(circle_at_30%_25%,#5fe3cf,var(--accent)_55%,#0b7d6f)] text-center text-white shadow-[0_0_60px_rgb(22_175_153/45%)] md:size-32",
              beat.orb,
            )}
          >
            <div>
              <p className="font-display text-xl leading-none md:text-3xl">Memory</p>
              <p className="mt-1 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-white/85 md:text-[0.6875rem]">
                X + Y
              </p>
            </div>
          </div>
        </div>

        {insights.map((item) => (
          <div
            key={item.kind}
            className={cn(
              "absolute z-10 w-[46%] -translate-y-1/2 rounded-2xl border border-line bg-surface px-3 py-2.5 shadow-card md:w-[27%] md:px-4 md:py-3",
              item.mob,
              item.desk,
              item.keyframe,
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-accent-ink md:text-[0.6875rem]">
                <item.icon size={14} aria-hidden="true" />
                {item.kind}
              </span>
              <span className="hidden rounded-full bg-tint px-2 py-0.5 text-[0.625rem] text-faint sm:inline">
                {item.from}
              </span>
            </div>
            <p className="mt-1 text-[0.75rem] font-medium leading-snug text-ink md:text-sm">
              {item.text}
            </p>
          </div>
        ))}

        {/* Column captions (desktop) */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-5 hidden text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-faint md:block"
        >
          <span className="absolute left-[17.5%] -translate-x-1/2">Capture</span>
          <span className="absolute left-1/2 -translate-x-1/2">Remember</span>
          <span className="absolute left-[82.5%] -translate-x-1/2">Understand</span>
        </div>

        <span className="absolute left-3 top-3 z-20 rounded-full md:left-4 md:top-4 border border-dashed border-line-strong px-2.5 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-faint">
          Illustration
        </span>
        <button
          type="button"
          onClick={() => setUserPaused(!userPaused)}
          aria-label={userPaused ? "Play animation" : "Pause animation"}
          className="absolute right-3 top-3 z-20 grid size-8 md:right-4 md:top-4 md:size-9 place-items-center rounded-full border border-line bg-surface text-muted transition hover:text-ink motion-reduce:hidden"
        >
          {userPaused ? <Play size={15} /> : <Pause size={15} />}
        </button>
      </div>
    </figure>
  );
}
