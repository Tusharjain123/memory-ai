"use client";
/* Images are pre-optimized WebP assets served locally; no runtime image service is needed. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  MessageCircle,
  Cloud,
  Smartphone,
  LockKeyhole,
  FileDown,
  Trash2,
  Menu,
  Play,
  X,
  CheckCheck,
  CalendarClock,
} from "lucide-react";
import { WaitlistForm } from "./waitlist-form";
import { AskAnswer } from "./app-ui/ask-answer";
import { PhoneFrame } from "./app-ui/phone-frame";
import { LiveCapture } from "./app-ui/live-capture";
import { FadingNotes } from "./app-ui/fading-notes";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function subscribeToMotionPreference(onChange: () => void) {
  const media = window.matchMedia(reducedMotionQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const getReducedMotion = () => window.matchMedia(reducedMotionQuery).matches;
const getServerReducedMotion = () => true;

const demoSteps = [
  {
    when: "During",
    text: "Put your phone on the table and record. No bot, no typing.",
  },
  {
    when: "After",
    text: "Confirm the promises and decisions AI picked up. They join your commitments.",
  },
  {
    when: "Later",
    text: "Ask what was agreed and get the answer from your own conversations.",
  },
  {
    when: "Before the next meeting",
    text: "Open a short brief: the last conversation and what’s still open.",
  },
];

const oneToOne = [
  {
    pain: "No bot can join a coffee.",
    fix: "Your phone on the table is enough.",
  },
  {
    pain: "Typing notes across the table feels rude.",
    fix: "Stay present. Review the key points afterwards.",
  },
  {
    pain: "There are no shared minutes, only two memories.",
    fix: "Commitments on both sides, with the exact words.",
  },
];

const fixes = [
  {
    className: "fix-commitments",
    icon: CheckCheck,
    pain: "I promised something and forgot.",
    title: "Every commitment, with the moment you made it.",
    body: "What you owe and what others owe you, each linked to the conversation where it was said.",
    image: "screen-commitments",
    alt: "Actual commitments screen listing what is owed, with source evidence. Fictional demo data.",
    foot: "Commitments",
  },
  {
    className: "fix-ask",
    icon: MessageCircle,
    pain: "We remember the decision differently.",
    title: "Ask what was agreed. Follow it to the source.",
    body: "Ask about one conversation or across saved memories, and follow supporting references back to what was said.",
    image: "ask",
    alt: "Actual Memory AI question and answer about a promised proposal. Fictional demo data.",
    foot: "Ask your memory",
  },
  {
    className: "fix-prep",
    icon: CalendarClock,
    pain: "I walk into calls without context.",
    title: "A short brief before you meet.",
    body: "The last conversation, open commitments and the details that matter, gathered into one preparation view.",
    image: "screen-person-prep",
    alt: "Actual preparation brief for an upcoming conversation with Aarav Mehta. Fictional demo data.",
    foot: "Preparation",
  },
];

const faqs = [
  {
    q: "Does a bot join my meeting?",
    a: (
      <>
        No. Memory AI records from your phone, which makes it a fit for{" "}
        <a href="#one-to-one">in-person, one-to-one conversations</a>. Online
        meeting capture is planned, not available yet.
      </>
    ),
  },
  {
    q: "Does it work when we mix Hindi and English?",
    a: "Yes. Transcripts come in the original, a cleaned-up version and Roman Hinglish.",
  },
  {
    q: "What if my connection drops while it’s processing?",
    a: "The recording waits safely on your device and finishes processing when it can.",
  },
  {
    q: "Where do my memories live?",
    a: "On your phone. Audio goes to cloud services for transcription and AI, and is deleted from our servers as soon as processing finishes. The result waits briefly until your phone collects it. There’s no cloud backup or device sync yet, so clearing the app’s data removes your memories.",
  },
  {
    q: "Is it on iPhone?",
    a: "Not yet. Memory AI is an Android app right now.",
  },
  {
    q: "Should I tell people I’m recording?",
    a: "Yes. Always ask before you record a conversation.",
  },
  {
    q: "Can I use it today?",
    a: "It’s in early access on Android, and free for the whole beta. Join the list and we’ll email you personally when your spot opens.",
  },
  {
    q: "What’s coming next?",
    a: "Online calls, context from your calendar and folders by client are planned. These are plans, not promises. No dates yet.",
  },
];

const nextSteps = [
  "Join with your email. No account needed.",
  "We email you personally when your spot opens.",
  "Install the Android app. It’s free for the whole beta, and the first 15 members get a setup call with the founder.",
];

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
  const [menuOpen, setMenuOpen] = useState(false);
  const demoVideo = useRef<HTMLVideoElement>(null);
  const heroVisual = useRef<HTMLDivElement>(null);
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

  /* Scroll reveals. Containers marked data-reveal-stagger hand each child an
     index so they arrive in sequence rather than all at once. */
  useEffect(() => {
    const media = window.matchMedia(reducedMotionQuery);
    if (media.matches || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.08 },
    );
    const elements = document.querySelectorAll("[data-reveal]");
    elements.forEach((element) => {
      element.classList.add("will-reveal");
      if (element.hasAttribute("data-reveal-stagger"))
        Array.from(element.children).forEach((child, index) =>
          (child as HTMLElement).style.setProperty("--i", String(index)),
        );
      observer.observe(element);
    });
    const showAll = () => {
      if (media.matches)
        elements.forEach((element) => element.classList.add("is-visible"));
    };
    media.addEventListener("change", showAll);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", showAll);
    };
  }, []);

  /* The hero leans very slightly toward the pointer. Enough to feel alive,
     small enough that nobody consciously notices it. Desktop pointers only. */
  useEffect(() => {
    const element = heroVisual.current;
    if (reducedMotion || !element) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches)
      return;
    if (window.innerWidth < 1100) return;
    let frame = 0;
    let pending: { x: number; y: number } | null = null;
    const apply = () => {
      frame = 0;
      if (!pending) return;
      element.style.setProperty("--tilt-x", pending.x.toFixed(3));
      element.style.setProperty("--tilt-y", pending.y.toFixed(3));
    };
    const onMove = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      pending = {
        x: ((event.clientX - box.left) / box.width) * 2 - 1,
        y: ((event.clientY - box.top) / box.height) * 2 - 1,
      };
      if (!frame) frame = window.requestAnimationFrame(apply);
    };
    const onLeave = () => {
      pending = { x: 0, y: 0 };
      if (!frame) frame = window.requestAnimationFrame(apply);
    };
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerleave", onLeave);
    return () => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);

  const returnToSignup = () => {
    setMenuOpen(false);
    window.setTimeout(
      () =>
        document
          .getElementById("waitlist-email")
          ?.focus({ preventScroll: true }),
      100,
    );
  };
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="shell nav-inner">
          <a
            className="brand"
            href="#main"
            onClick={() => setMenuOpen(false)}
            aria-label="Memory AI home"
          >
            <img src="/images/logo.png" width="44" height="44" alt="" />
            <span>
              Memory<span className="brand-ai">ai</span>
            </span>
          </a>
          <nav className="desktop-nav" aria-label="Main navigation">
            <a href="#the-problem">The problem</a>
            <a href="#demo">How it works</a>
            <a href="#privacy">Privacy</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="nav-actions">
            <a
              className="button button-small"
              href="#early-access"
              onClick={returnToSignup}
            >
              Join early access <ArrowRight size={16} />
            </a>
            <button
              className="menu-toggle"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav
            id="mobile-navigation"
            className="mobile-nav"
            aria-label="Mobile navigation"
            onKeyDown={(event) => {
              if (event.key === "Escape") setMenuOpen(false);
            }}
          >
            {[
              ["The problem", "#the-problem"],
              ["How it works", "#demo"],
              ["Privacy", "#privacy"],
              ["FAQ", "#faq"],
            ].map(([label, url]) => (
              <a key={url} href={url} onClick={() => setMenuOpen(false)}>
                {label}
                <ArrowUpRight size={18} />
              </a>
            ))}
          </nav>
        )}
      </header>
      <main id="main">
        <section className="hero shell" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="eyebrow-line" /> For back-to-back client
              conversations
            </p>
            <h1 id="hero-title">
              You said you’d
              <br />
              follow up.
              <br />
              <span>Did you?</span>
            </h1>
            <p className="hero-description">
              Memory AI remembers what was promised, decided and asked in your
              client conversations, so you can listen instead of taking notes.
              No meeting bot. Memories stay on your phone.
            </p>
            <WaitlistForm available={signupAvailable} />
            <p className="hero-perk">
              The first 15 members get a setup call with the founder.
            </p>
            <a className="text-link" href="#demo">
              See it in 20 seconds <span>Watch the demo</span>
              <Play size={16} />
            </a>
          </div>
          <div className="hero-visual" ref={heroVisual}>
            <div className="hero-orbit" aria-hidden="true" />
            <LiveCapture />
            <div className="hero-phone">
              <div className="hero-phone-tilt">
                <img
                  src="/images/screen-home.webp"
                  width="560"
                  height="1218"
                  alt="Memory AI home screen with options to record a conversation, ask memory and review commitments. Fictional demo data."
                />
              </div>
            </div>
            <div className="hero-memory recreation">
              <span className="recreation-tag">Illustration</span>
              <div className="memory-label">
                <Sparkles size={16} /> A detail, remembered
              </div>
              <AskAnswer />
            </div>
          </div>
        </section>
        <div className="hero-footer shell" data-reveal data-reveal-stagger>
          <p>
            Listen now.
            <br />
            <strong>Remember later.</strong>
          </p>
          <div>
            <CheckCheck />
            <span>No more half-remembered promises</span>
          </div>
          <div>
            <CalendarClock />
            <span>No more scrolling for context before a call</span>
          </div>
          <div>
            <MessageCircle />
            <span>No more “I thought we agreed…”</span>
          </div>
        </div>

        <section
          id="the-problem"
          className="problem section"
          aria-labelledby="problem-title"
        >
          <div className="shell problem-layout" data-reveal>
            <div className="problem-art">
              <FadingNotes />
            </div>
            <div className="problem-copy">
              <p className="eyebrow">
                <span className="eyebrow-line" /> Sound familiar?
              </p>
              <h2 id="problem-title">
                It’s 6pm. Four client calls.
                <br />
                <span>Already blurring.</span>
              </h2>
              <p>
                You were listening, not transcribing. Now the budget number, the
                deadline and the thing you promised are slipping away.
              </p>
              <p>
                Notes mid-call cost you the conversation. Notes afterwards miss
                the details.
              </p>
              <p>
                One-to-ones are the hardest. The coffee with a client, the site
                visit, the quick chat after the pitch: no bot, no shared
                minutes, only two memories. That’s often where the real
                commitments are made.
              </p>
            </div>
          </div>
          <div id="one-to-one" className="shell one-to-one">
            <ul className="contrast-list" data-reveal data-reveal-stagger>
              {oneToOne.map((row) => (
                <li key={row.pain}>
                  <span className="contrast-pain">{row.pain}</span>
                  <ArrowRight className="contrast-arrow" aria-hidden="true" />
                  <strong className="contrast-fix">{row.fix}</strong>
                </li>
              ))}
            </ul>
            <p className="one-to-one-consent">
              Always ask before you record.{" "}
              <a href="#privacy">How your data is handled</a>
            </p>
          </div>
        </section>

        <section
          id="demo"
          className="demo section"
          aria-labelledby="demo-title"
        >
          <div className="shell">
            <div className="section-heading centered" data-reveal>
              <p className="eyebrow">How it works</p>
              <h2 id="demo-title">
                From a coffee chat
                <br />
                <span>to a kept promise.</span>
              </h2>
              <p>Twenty seconds, real app screens.</p>
            </div>
            <figure className="demo-frame" data-reveal>
              <video
                ref={demoVideo}
                src="/video/demo.mp4"
                poster="/video/demo-poster.webp"
                width="1280"
                height="720"
                controls
                muted
                loop
                playsInline
                preload="metadata"
                aria-describedby="demo-steps"
              />
            </figure>
            <ol
              id="demo-steps"
              className="demo-steps"
              data-reveal
              data-reveal-stagger
            >
              {demoSteps.map((item) => (
                <li key={item.when}>
                  <strong>{item.when}</strong>
                  <span>{item.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="fixes"
          className="fixes section shell"
          aria-labelledby="fixes-title"
        >
          <div className="section-heading heading-row" data-reveal>
            <div>
              <p className="eyebrow">What changes</p>
              <h2 id="fixes-title">
                Three things you’ll stop
                <br />
                <span>worrying about.</span>
              </h2>
            </div>
            <p>
              What you say today is still there when a client asks tomorrow.
            </p>
          </div>
          <div className="fix-list">
            {fixes.map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.title}
                  className={`fix-row ${item.className}`}
                  data-reveal
                >
                  <div className="fix-pain">
                    <span className="fix-pain-label">Sound like you?</span>
                    <p>“{item.pain}”</p>
                  </div>
                  <div className="feature-card fix-card">
                    <div className="feature-card-heading">
                      <div className="feature-icon">
                        <Icon size={26} />
                      </div>
                      <h3>{item.title}</h3>
                      <p>{item.body}</p>
                    </div>
                    <div className="feature-screenshot">
                      <img
                        src={`/images/${item.image}.webp`}
                        loading="lazy"
                        alt={item.alt}
                      />
                    </div>
                    <div className="feature-foot">
                      <span>{item.foot}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="cta-band" data-reveal>
            <p>
              <strong>Sound like you?</strong> Join early access, free for the
              whole beta.
            </p>
            <a className="button" href="#early-access" onClick={returnToSignup}>
              Join early access <ArrowUpRight size={19} />
            </a>
          </div>
        </section>

        <section
          id="privacy"
          className="privacy section"
          aria-labelledby="privacy-title"
        >
          <div className="shell">
            <div className="privacy-top" data-reveal>
              <div className="privacy-copy">
                <p className="eyebrow">The obvious question</p>
                <h2 id="privacy-title">
                  Recording clients?
                  <br />
                  <span>On your terms.</span>
                </h2>
                <p>
                  No bot joins the conversation. Audio is deleted from our
                  servers as soon as it’s processed, and your memories are
                  stored only on your phone.
                </p>
                <p className="privacy-small">
                  Transcription and AI run on cloud services while a recording
                  is processed.
                </p>
                <div
                  className="storage-flow"
                  aria-label="Audio recorded on device, processed in the cloud and then deleted, memories saved on device"
                >
                  <div>
                    <Smartphone />
                    <strong>Record</strong>
                    <span>On device</span>
                  </div>
                  <span className="flow-step" aria-hidden="true">
                    <span className="flow-rail">
                      <span className="flow-dot" />
                    </span>
                    <ArrowRight className="flow-arrow" />
                  </span>
                  <div>
                    <Cloud />
                    <strong>Process</strong>
                    <span>Then deleted</span>
                  </div>
                  <span className="flow-step" aria-hidden="true">
                    <span className="flow-rail">
                      <span className="flow-dot" />
                    </span>
                    <ArrowRight className="flow-arrow" />
                  </span>
                  <div>
                    <Smartphone />
                    <strong>Remember</strong>
                    <span>On device</span>
                  </div>
                </div>
              </div>
              <div className="privacy-art">
                <PhoneFrame
                  src="/images/screen-privacy.webp"
                  alt="Actual Memory AI privacy settings screen showing how data moves: recorded here, processed temporarily, remembered here. Fictional demo data."
                  caption="The same promise, inside the app."
                />
              </div>
            </div>
            <div className="control-grid" data-reveal data-reveal-stagger>
              <div>
                <ShieldCheck />
                <h3>Review what stays</h3>
                <p>
                  Approve, correct or reject details. Replay supporting audio
                  when retained.
                </p>
              </div>
              <div>
                <LockKeyhole />
                <h3>Lock app access</h3>
                <p>
                  Use biometric access. This does not add database encryption.
                </p>
              </div>
              <div>
                <FileDown />
                <h3>Take it with you</h3>
                <p>
                  Export a memory as Markdown, including its transcript and
                  notes.
                </p>
              </div>
              <div>
                <Trash2 />
                <h3>Delete when you want</h3>
                <p>Remove recordings, individual memories or all local data.</p>
              </div>
            </div>
            <p className="privacy-limit">
              Currently, there is no built-in cloud backup or device sync.
              Removing app data can remove your local memories.
            </p>
          </div>
        </section>

        <section
          id="faq"
          className="faq section shell"
          aria-labelledby="faq-title"
        >
          <div className="faq-layout">
            <div className="section-heading" data-reveal>
              <p className="eyebrow">Before you ask</p>
              <h2 id="faq-title">
                Fair
                <br />
                <span>questions.</span>
              </h2>
            </div>
            <div className="faq-list" data-reveal data-reveal-stagger>
              {faqs.map((item) => (
                <details key={item.q}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="closing-section" aria-labelledby="closing-title">
          <div className="shell closing-inner" data-reveal>
            <div className="closing-mark">
              <img src="/images/logo.png" width="64" height="64" alt="" />
            </div>
            <p className="eyebrow">Your next client conversation</p>
            <h2 id="closing-title">
              Stop relying on memory.
              <br />
              <span>Use one.</span>
            </h2>
            <p>
              Join early access on Android and be among the first to try Memory
              AI with your clients.
            </p>
            <div className="closing-signup">
              <WaitlistForm available={signupAvailable} instance="closing" />
              <div className="next-steps">
                <p className="next-steps-title">What happens next</p>
                <ol>
                  {nextSteps.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </div>
            </div>
            <a
              className="text-link closing-deck"
              href={deckUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Want the details? <span>View the deck</span>
              <ArrowUpRight size={18} />
            </a>
          </div>
        </section>
      </main>
      <footer className="site-footer shell">
        <a className="brand" href="#main" aria-label="Memory AI home">
          <img src="/images/logo.png" width="36" height="36" alt="" />
          <span>
            Memory<span className="brand-ai">ai</span>
          </span>
        </a>
        <p>Remember every client conversation.</p>
        <p className="footer-note">
          App screens are real, shown with sample data. Cards marked
          Illustration are drawn for this page.
        </p>
        <a href={deckUrl} target="_blank" rel="noopener noreferrer">
          Product deck <ArrowUpRight size={16} />
        </a>
      </footer>
    </>
  );
}
