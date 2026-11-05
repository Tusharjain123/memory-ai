"use client";
/* Images are pre-optimized WebP assets served locally; no runtime image service is needed. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  BrainCircuit,
  CheckCheck,
  Mic,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { WaitlistForm } from "./waitlist-form";
import { FlowFilm } from "./flow-film";
import { HeroEquation } from "./hero-equation";
import { tagline } from "@/lib/site-copy";
import { SiteFooter, SiteHeader } from "./site-chrome";
import { useReveal } from "@/lib/use-reveal";
import {
  displayTitle,
  eyebrow,
  lede,
  reveal,
  sectionTitle,
  shell,
} from "@/lib/ui";
import { cn } from "@/lib/utils";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function subscribeToMotionPreference(onChange: () => void) {
  const media = window.matchMedia(reducedMotionQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const getReducedMotion = () => window.matchMedia(reducedMotionQuery).matches;
const getServerReducedMotion = () => true;

const steps: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Mic,
    title: "Capture",
    body: "Import a Google Meet transcript, or record in person from your phone. No bot joins.",
  },
  {
    icon: BrainCircuit,
    title: "Understand",
    body: "AI picks out promises, decisions and details. You approve what’s saved.",
  },
  {
    icon: CheckCheck,
    title: "Recall",
    body: "Ask in plain words, or open a brief before you meet again.",
  },
];

const insights = [
  {
    title: "Every promise, with the moment it was made.",
    image: "/images/screen-commitments-clean.webp",
    height: 1117,
    alt: "Commitments screen listing what is owed, each with the exact quote. Sample data.",
  },
  {
    title: "Ask what was agreed. Get the answer from your own conversations.",
    image: "/images/screen-ask.webp",
    height: 1117,
    alt: "Ask Memory screen answering what was promised to a client last week. Sample data.",
  },
  {
    title: "A short brief before you meet someone again.",
    image: "/images/screen-person-prep.webp",
    height: 1218,
    alt: "Prep brief before meeting Aarav Mehta: last conversation, open promises, preferences. Sample data.",
  },
];

const privacy: { icon: LucideIcon; text: string }[] = [
  { icon: Smartphone, text: "Memories stay on your phone" },
  { icon: Trash2, text: "Audio deleted after processing" },
  { icon: ShieldCheck, text: "You approve what’s saved" },
];

const faqs = [
  {
    q: "Does a bot join my meeting?",
    a: "No. In person, Memory AI records from your phone. For Google Meet, connect your calendar and import the meeting’s transcript afterwards. Nothing joins the call.",
  },
  {
    q: "Which online meetings does it work with?",
    a: "Google Meet, for now. Meet saves transcripts on Google Workspace plans with transcription turned on, and a transcript can be imported for 30 days after the meeting.",
  },
  {
    q: "Where do my memories live?",
    a: "On your phone. Audio and imported transcripts go to cloud services for transcription and AI, and are deleted from our servers as soon as processing finishes.",
  },
  {
    q: "How much does it cost?",
    a: "You pay for what you use. Your account starts with 5,000 free tokens, and you can top up with a prepaid pack. No subscription.",
  },
];

function SectionHead({
  label,
  title,
  body,
  className,
}: {
  label: string;
  title: React.ReactNode;
  body?: string;
  className?: string;
}) {
  return (
    <div data-reveal className={cn(reveal, "mx-auto max-w-2xl text-center", className)}>
      <p className={eyebrow}>{label}</p>
      <h2 className={cn(sectionTitle, "mt-4")}>{title}</h2>
      {body && <p className={cn(lede, "mt-4")}>{body}</p>}
    </div>
  );
}

export function Landing({
  deckUrl,
  signupAvailable,
}: {
  deckUrl: string;
  signupAvailable: boolean;
}) {
  const reducedMotion = useSyncExternalStore(
    subscribeToMotionPreference,
    getReducedMotion,
    getServerReducedMotion,
  );
  const demoVideo = useRef<HTMLVideoElement>(null);
  useReveal();

  /* The demo starts itself, muted, the first time it scrolls into view —
     never under reduced motion, and never again once it has started, so a
     reader who pauses it stays in charge. */
  useEffect(() => {
    const video = demoVideo.current;
    if (reducedMotion || !video || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        video.play().catch(() => {});
      },
      { threshold: 0.5 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [reducedMotion]);

  return (
    <>
      <SiteHeader onHome />
      <main id="main" className="relative overflow-x-clip">
        {/* Ambient glow behind the hero */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[720px] w-[1100px] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,var(--accent-soft),transparent_65%)] opacity-90"
        />

        {/* ── Hero: one picture, one line, one field ── */}
        <section
          aria-labelledby="hero-title"
          className={cn(shell, "pt-14 text-center sm:pt-20")}
        >
          <HeroEquation />
          <h1
            id="hero-title"
            className={cn(
              displayTitle,
              "mx-auto mt-10 text-[clamp(2.75rem,7vw,5.5rem)] leading-[1.02]",
            )}
          >
            <span className="block text-faint">{tagline.lead}</span>
            <span className="block">
              {tagline.promise}{" "}
              <em className="text-accent-ink">{tagline.promiseAccent}</em>
            </span>
          </h1>
          <div className="mt-10">
            <WaitlistForm available={signupAvailable} />
          </div>
        </section>

        {/* ── Flow film ── */}
        <section
          id="film"
          aria-label="How online and offline conversations become insights"
          className="mx-auto mt-14 w-[min(1120px,calc(100%-32px))] scroll-mt-24 sm:mt-20"
        >
          <FlowFilm />
        </section>

        {/* ── How it works ── */}
        <section id="how" className={cn(shell, "scroll-mt-24 pt-28 sm:pt-36")}>
          <SectionHead
            label="How it works"
            title={
              <>
                Three steps. <em className="text-accent-ink">Zero</em> note-taking.
              </>
            }
          />
          <ol
            data-reveal
            data-reveal-stagger
            className="group relative mt-14 grid gap-10 md:grid-cols-3 md:gap-8"
          >
            {/* Connector that draws across the three steps */}
            <span
              aria-hidden="true"
              className="absolute left-[16.6%] right-[16.6%] top-7 hidden h-px origin-left bg-gradient-to-r from-accent via-line-strong to-accent transition-transform duration-[1400ms] ease-out group-data-[reveal=pending]:scale-x-0 md:block"
            />
            {steps.map((step, index) => (
              <li
                key={step.title}
                className={cn(reveal, "relative text-center", "group-data-[reveal=pending]:translate-y-5 group-data-[reveal=pending]:opacity-0")}
              >
                <span className="relative mx-auto grid size-14 place-items-center rounded-2xl border border-line bg-surface text-accent-ink shadow-card">
                  <step.icon size={22} />
                  <span className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-ink text-[0.6875rem] font-bold text-on-ink">
                    {index + 1}
                  </span>
                </span>
                <h3 className="mt-5 font-display text-3xl text-ink">{step.title}</h3>
                <p className="mx-auto mt-2 max-w-xs leading-relaxed text-muted">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Insights ── */}
        <section id="insights" className={cn(shell, "scroll-mt-24 pt-28 sm:pt-36")}>
          <SectionHead
            label="What you get"
            title={
              <>
                Insights, <em className="text-accent-ink">not</em> transcripts.
              </>
            }
          />
          <div
            data-reveal
            data-reveal-stagger
            className="group mt-14 grid gap-6 md:grid-cols-3"
          >
            {insights.map((item) => (
              <article
                key={item.image}
                className={cn(
                  reveal,
                  "group-data-[reveal=pending]:translate-y-5 group-data-[reveal=pending]:opacity-0",
                  "flex flex-col overflow-hidden rounded-[28px] border border-line bg-surface shadow-card transition hover:-translate-y-1 hover:shadow-lift",
                )}
              >
                <h3 className="px-7 pt-7 text-lg font-semibold leading-snug text-ink">
                  {item.title}
                </h3>
                <div className="mx-7 mt-6 h-[360px] overflow-hidden rounded-t-[22px] border border-b-0 border-line bg-tint">
                  <img
                    src={item.image}
                    width={560}
                    height={item.height}
                    alt={item.alt}
                    loading="lazy"
                    className="w-full"
                  />
                </div>
              </article>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-faint">
            Real app screens, sample data.
          </p>
        </section>

        {/* ── Demo video ── */}
        <section id="demo" className={cn(shell, "scroll-mt-24 pt-28 sm:pt-36")}>
          <SectionHead label="See it in the app" title="From a conversation to a kept promise." />
          <figure
            data-reveal
            className={cn(
              reveal,
              "mx-auto mt-12 max-w-4xl overflow-hidden rounded-[28px] border border-line bg-surface p-2 shadow-float",
            )}
          >
            <video
              ref={demoVideo}
              src="/video/demo.mp4"
              poster="/video/demo-poster.webp"
              width={1280}
              height={720}
              controls
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="Product demo: recording a conversation, reviewing what AI picked up, asking a question and opening a prep brief."
              className="block w-full rounded-[22px]"
            />
          </figure>
        </section>

        {/* ── Privacy ── */}
        <section id="privacy" className={cn(shell, "scroll-mt-24 pt-28 sm:pt-36")}>
          <div
            data-reveal
            className={cn(
              reveal,
              "rounded-[32px] border border-line bg-surface px-6 py-14 text-center shadow-card sm:px-12",
            )}
          >
            <p className={eyebrow}>Privacy</p>
            <h2 className={cn(sectionTitle, "mx-auto mt-4 max-w-2xl")}>
              Your memories stay <em className="text-accent-ink">yours.</em>
            </h2>
            <ul className="mt-9 flex flex-wrap justify-center gap-3">
              {privacy.map((item) => (
                <li
                  key={item.text}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-bg px-4 py-2.5 text-sm font-medium text-ink"
                >
                  <item.icon size={16} className="text-accent-ink" aria-hidden="true" />
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className={cn(shell, "scroll-mt-24 pt-28 sm:pt-36")}>
          <SectionHead label="FAQ" title="Fair questions." />
          <div data-reveal className={cn(reveal, "mx-auto mt-12 max-w-2xl divide-y divide-line border-y border-line")}>
            {faqs.map((item) => (
              <details key={item.q} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-lg font-medium text-ink [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <Plus
                    size={20}
                    aria-hidden="true"
                    className="shrink-0 text-faint transition-transform duration-300 group-open:rotate-45"
                  />
                </summary>
                <p className="pb-6 pr-10 leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Closing ── */}
        <section className={cn(shell, "py-28 text-center sm:py-36")}>
          <div data-reveal className={reveal}>
            <h2 className={cn(displayTitle, "mx-auto max-w-[16ch] text-[clamp(2.5rem,6vw,4.75rem)] leading-[1.02]")}>
              Stop relying on memory. <em className="text-accent-ink">Use one.</em>
            </h2>
            <p className={cn(lede, "mx-auto mt-5 max-w-md")}>
              Join early access and be first to try Memory AI.
            </p>
            <div className="mt-9">
              <WaitlistForm available={signupAvailable} instance="closing" />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter deckUrl={deckUrl} />
    </>
  );
}
