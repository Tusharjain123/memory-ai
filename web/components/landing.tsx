"use client";
/* Images are pre-optimized WebP assets served locally; no runtime image service is needed. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Mic,
  Sparkles,
  ShieldCheck,
  Check,
  MessageCircle,
  Users,
  ClipboardCheck,
  Cloud,
  Smartphone,
  LockKeyhole,
  FileDown,
  Trash2,
  CalendarDays,
  Video,
  FolderTree,
  Menu,
  X,
  CheckCheck,
  CalendarClock,
  LifeBuoy,
} from "lucide-react";
import { WaitlistForm } from "./waitlist-form";
import { WaveMeter } from "./app-ui/wave-meter";
import { AskAnswer } from "./app-ui/ask-answer";
import { ReviewCard } from "./app-ui/review-card";
import { PhoneFrame } from "./app-ui/phone-frame";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function subscribeToMotionPreference(onChange: () => void) {
  const media = window.matchMedia(reducedMotionQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const getReducedMotion = () => window.matchMedia(reducedMotionQuery).matches;
const getServerReducedMotion = () => true;

const steps = [
  {
    name: "Record",
    icon: Mic,
    title: "Be there. We’ll take notes.",
    description:
      "Record a conversation on your phone. Pause when you need to, or save the audio to process later.",
    image: "record",
    alt: "Actual Memory AI recording screen with a microphone, timer and start recording control.",
    caption: "Speaker-separated transcripts, summaries, topics and decisions.",
    tags: ["Original", "Cleaned", "Roman Hinglish"],
  },
  {
    name: "Review",
    icon: ClipboardCheck,
    title: "A memory you can make right.",
    description:
      "Check what AI picked up. Approve, correct or reject extracted details, and replay the source when audio is retained.",
    image: "review",
    alt: "Actual Memory AI review card with approve, correct and reject controls for an extracted commitment. Fictional demo data.",
    caption: "You decide what becomes part of your memory.",
    tags: ["Approve", "Correct", "Reject"],
  },
  {
    name: "Recall",
    icon: MessageCircle,
    title: "Just ask what you remember.",
    description:
      "Ask about one conversation or across saved memories. Follow supporting references back to the source.",
    image: "ask",
    alt: "Actual Memory AI question and answer about a promised proposal. Fictional demo data.",
    caption:
      "Supporting references are implemented but not shown in this demo crop.",
    tags: ["One conversation", "Across memories", "Source references"],
  },
];

const features = [
  {
    className: "people-card",
    icon: Users,
    title: "Pick up where you left off.",
    body: "People profiles, conversation history, and preparation briefs help you arrive with the context.",
    image: "screen-people",
    alt: "Actual People screen listing relationship memory across conversations. Fictional demo data.",
    foot: "People & history",
  },
  {
    className: "commitment-card",
    icon: CheckCheck,
    title: "A promise with a place to live.",
    body: "Keep track of what you owe and what others owe you, with the conversation behind each commitment.",
    image: "screen-commitments",
    alt: "Actual commitments screen listing what is owed, with source evidence. Fictional demo data.",
    foot: "Commitments & follow-through",
  },
  {
    className: "prep-card",
    icon: CalendarClock,
    title: "A brief before you meet.",
    body: "Gather the last conversation, open commitments and the details that matter into one short preparation view.",
    image: "screen-person-prep",
    alt: "Actual preparation brief for an upcoming conversation with Aarav Mehta. Fictional demo data.",
    foot: "Preparation",
  },
  {
    className: "pending-card",
    icon: LifeBuoy,
    title: "Nothing gets lost on the way.",
    body: "If processing is interrupted, the recording waits safely on your device until it can finish.",
    image: "screen-pending",
    alt: "Actual saved recordings screen showing a recording waiting to finish processing. Fictional demo data.",
    foot: "Recovery",
  },
];

const roadmap = [
  {
    icon: CalendarDays,
    image: "calendar",
    title: "Calendar sync",
    text: "The right context before you meet.",
    detail:
      "Connect events with relevant memories and make preparation easier.",
  },
  {
    icon: Video,
    image: "meeting",
    title: "Online meeting notetaker",
    text: "A memory for the meetings online, too.",
    detail:
      "Capture online conversations with transcripts, summaries, decisions and follow-ups.",
  },
  {
    icon: FolderTree,
    image: "folders",
    title: "Folders & subfolders",
    text: "A place for every part of your life.",
    detail: "Organize memories by project, client or personal topic.",
  },
];

export function Landing({
  deckUrl,
  signupAvailable,
}: {
  deckUrl: string;
  signupAvailable: boolean;
}) {
  const [step, setStep] = useState(0);
  const reducedMotion = useSyncExternalStore(
    subscribeToMotionPreference,
    getReducedMotion,
    getServerReducedMotion,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const heroVisual = useRef<HTMLDivElement>(null);
  /* Once the reader picks a step themselves, nothing moves on its own again
     for the rest of the session. That is the whole conflict-resolution story
     between scroll-linking and the tablist. */
  const manual = useRef(false);

  /* Scroll drives the walkthrough: whichever tab sits nearest the middle of
     the viewport is the active step. Observing the tab buttons themselves
     means no extra markup and it works at every breakpoint, since they are a
     column on desktop and a stack on mobile. Deps are stable, so the observer
     is built once — not rebuilt on every step change. */
  useEffect(() => {
    if (reducedMotion || !("IntersectionObserver" in window)) return;
    if (window.innerHeight < 620) return; // the centre band would never match
    const nodes = tabs.current.filter(Boolean) as HTMLButtonElement[];
    if (nodes.length !== steps.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (manual.current) return;
        const hit = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!hit) return;
        const index = nodes.indexOf(hit.target as HTMLButtonElement);
        if (index >= 0)
          setStep((current) => (current === index ? current : index));
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    nodes.forEach((node) => observer.observe(node));
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

  const activate = (index: number) => {
    manual.current = true;
    setStep(index);
    tabs.current[index]?.focus();
  };
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
  const selected = steps[step];
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
            <a href="#how-it-works">How it works</a>
            <a href="#features">The app</a>
            <a href="#privacy">Privacy</a>
            <a href="#whats-next">What’s next</a>
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
              ["How it works", "#how-it-works"],
              ["The app", "#features"],
              ["Privacy", "#privacy"],
              ["What’s next", "#whats-next"],
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
              <span className="eyebrow-line" /> A little more present
            </p>
            <h1 id="hero-title">
              Conversations
              <br />
              worth <span>remembering.</span>
            </h1>
            <p className="hero-description">
              Be in the moment. Memory AI turns your conversations into notes,
              people, and promises you can come back to.
            </p>
            <WaitlistForm available={signupAvailable} />
            <a
              className="text-link"
              href={deckUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Get to know Memory AI <span>View the deck</span>
              <ArrowUpRight size={18} />
            </a>
          </div>
          <div className="hero-visual" ref={heroVisual}>
            <div className="hero-orbit" aria-hidden="true" />
            <img
              className="conversation-art"
              src="/images/conversation.webp"
              width="900"
              height="600"
              alt="Soft 3D illustration of two people connected by a conversation"
              fetchPriority="high"
            />
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
            <p className="visual-caption">
              Phone: a real app screen. Card: an illustration. Fictional demo
              data.
            </p>
          </div>
        </section>
        <div className="hero-footer shell" data-reveal data-reveal-stagger>
          <p>
            Less mental juggling.
            <br />
            <strong>More room for the conversation.</strong>
          </p>
          <div>
            <WaveMeter className="footer-wave" bars={14} />
            <span>Capture naturally</span>
          </div>
          <div>
            <Sparkles />
            <span>Find the important details</span>
          </div>
          <div>
            <ShieldCheck />
            <span>Keep control</span>
          </div>
        </div>

        <section
          id="the-problem"
          className="problem section"
          aria-labelledby="problem-title"
        >
          <div className="shell problem-layout" data-reveal>
            <div className="problem-art">
              <img
                src="/images/scattered-notes.webp"
                width="900"
                height="600"
                loading="lazy"
                alt="Conceptual illustration of notes and fragments scattered around a clock"
              />
              <div className="problem-resolve">
                <ReviewCard />
                <p>
                  Memory AI extracts the detail and waits for you to confirm it.
                </p>
              </div>
            </div>
            <div className="problem-copy">
              <p className="eyebrow">
                <span className="eyebrow-line" /> Before Memory AI
              </p>
              <h2 id="problem-title">
                The details don’t wait
                <br />
                <span>for you to write them down.</span>
              </h2>
              <p>
                You were listening, not transcribing. By the evening the name,
                the number and the thing you promised have already blurred.
              </p>
              <ul className="problem-list">
                <li>
                  <Check /> The commitment you made, half-remembered.
                </li>
                <li>
                  <Check /> The decision everyone recalls differently.
                </li>
                <li>
                  <Check /> The context you needed right before the next
                  meeting.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="walkthrough section"
          aria-labelledby="walkthrough-title"
        >
          <div className="shell">
            <div className="section-heading centered" data-reveal>
              <p className="eyebrow">From a conversation to a memory</p>
              <h2 id="walkthrough-title">
                Say it. Save it.
                <br />
                <span>Come back to it.</span>
              </h2>
              <p>Three simple steps. One less thing to keep in your head.</p>
            </div>
            <div className="walkthrough-layout" data-reveal>
              <div
                className="walkthrough-tabs"
                role="tablist"
                aria-label="Explore how Memory AI works"
                aria-orientation="vertical"
                onKeyDown={(event) => {
                  let next = step;
                  if (event.key === "ArrowDown" || event.key === "ArrowRight")
                    next = (step + 1) % 3;
                  else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
                    next = (step + 2) % 3;
                  else if (event.key === "Home") next = 0;
                  else if (event.key === "End") next = 2;
                  else return;
                  event.preventDefault();
                  activate(next);
                }}
              >
                {steps.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.name}
                      ref={(node) => {
                        tabs.current[index] = node;
                      }}
                      id={`step-tab-${index}`}
                      role="tab"
                      type="button"
                      aria-selected={step === index}
                      aria-controls={`step-panel-${index}`}
                      tabIndex={step === index ? 0 : -1}
                      className={`step-tab ${step === index ? "active" : ""}`}
                      onClick={() => {
                        manual.current = true;
                        setStep(index);
                      }}
                    >
                      <span className="step-number">0{index + 1}</span>
                      <span className="step-content">
                        <span className="step-name">
                          <Icon size={21} />
                          {item.name}
                        </span>
                        <span className="step-title">{item.title}</span>
                        <span className="step-description">
                          {item.description}
                        </span>
                      </span>
                      <ArrowUpRight className="step-arrow" size={20} />
                    </button>
                  );
                })}
              </div>
              <div
                className={`walkthrough-stage stage-${selected.image}`}
                role="tabpanel"
                id={`step-panel-${step}`}
                aria-labelledby={`step-tab-${step}`}
                tabIndex={0}
              >
                <div className="stage-label">
                  <span>Inside Memory AI</span>
                  <span>Current MVP</span>
                </div>
                <div className="stage-intro">
                  <h3>{selected.title}</h3>
                  <p>{selected.description}</p>
                </div>
                <div className="stage-image" key={selected.image}>
                  <img
                    src={`/images/${selected.image}.webp`}
                    alt={selected.alt}
                    loading="lazy"
                  />
                </div>
                <div className="stage-detail">
                  <div className="stage-tags">
                    {selected.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <p>{selected.caption}</p>
                </div>
              </div>
            </div>
            <p className="section-disclosure">
              Authentic app screens with fictional demo data. Illustrations are
              conceptual.
            </p>
          </div>
        </section>

        <section
          id="features"
          className="features section shell"
          aria-labelledby="features-title"
        >
          <div className="section-heading heading-row" data-reveal>
            <div>
              <p className="eyebrow">Made for the details that matter</p>
              <h2 id="features-title">
                Remember the people.
                <br />
                <span>Keep the promises.</span>
              </h2>
            </div>
            <p>
              The context of a conversation stays useful long after it ends.
            </p>
          </div>
          <div className="feature-grid" data-reveal data-reveal-stagger>
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article
                  key={feature.title}
                  className={`feature-card ${feature.className}`}
                >
                  <div className="feature-card-heading">
                    <div className="feature-icon">
                      <Icon size={26} />
                    </div>
                    <h3>{feature.title}</h3>
                    <p>{feature.body}</p>
                  </div>
                  <div className="feature-screenshot">
                    <img
                      src={`/images/${feature.image}.webp`}
                      width="560"
                      height="1218"
                      loading="lazy"
                      alt={feature.alt}
                    />
                  </div>
                  <div className="feature-foot">
                    <span>{feature.foot}</span>
                    <span>Current MVP</span>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="mvp-note">
            <Check size={18} aria-hidden="true" /> Current MVP means implemented
            in the repository. It is not a claim of public availability or
            production readiness.
          </p>
        </section>

        <section
          id="privacy"
          className="privacy section"
          aria-labelledby="privacy-title"
        >
          <div className="shell">
            <div className="privacy-top" data-reveal>
              <div className="privacy-copy">
                <p className="eyebrow">Memory, with your say</p>
                <h2 id="privacy-title">
                  Personal memories.
                  <br />
                  <span>Personal control.</span>
                </h2>
                <p>
                  Permanent memories stay on your device. Transcription and AI
                  use cloud processing, with a temporary processing handoff.
                </p>
                <div
                  className="storage-flow"
                  aria-label="Audio recorded on device, cloud transcription and AI, permanent memories saved on device"
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
                    <span>In the cloud</span>
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
          id="whats-next"
          className="roadmap section shell"
          aria-labelledby="roadmap-title"
        >
          <div className="section-heading heading-row" data-reveal>
            <div>
              <p className="eyebrow">A little further ahead</p>
              <h2 id="roadmap-title">
                More ways
                <br />
                <span>to remember.</span>
              </h2>
            </div>
            <p>
              The same idea, in more of the places where conversations happen.
            </p>
          </div>
          <div className="roadmap-grid" data-reveal data-reveal-stagger>
            {roadmap.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title}>
                  <div className="roadmap-art">
                    <img
                      src={`/images/${item.image}.webp`}
                      width="660"
                      height="440"
                      loading="lazy"
                      alt={`Concept illustration for ${item.title.toLowerCase()}`}
                    />
                    <span className="planned-label">Planned</span>
                  </div>
                  <div className="roadmap-card-top">
                    <div className="roadmap-icon">
                      <Icon size={26} strokeWidth={1.5} />
                    </div>
                  </div>
                  <h3>{item.title}</h3>
                  <p className="roadmap-lead">{item.text}</p>
                  <p>{item.detail}</p>
                  <p className="roadmap-note">Concept illustration.</p>
                </article>
              );
            })}
          </div>
          <p className="section-disclosure">
            Proposed capabilities. No vendors, launch dates or delivery order
            are promised.
          </p>
        </section>

        <section className="closing-section" aria-labelledby="closing-title">
          <div className="shell closing-inner" data-reveal>
            <div className="closing-mark">
              <img src="/images/logo.png" width="64" height="64" alt="" />
            </div>
            <p className="eyebrow">Keep the conversation going</p>
            <h2 id="closing-title">
              Make room for
              <br />
              <span>what matters.</span>
            </h2>
            <p>
              Leave your email. We’ll reach out when there’s a way to try Memory
              AI.
            </p>
            <div className="closing-actions">
              <a
                className="button"
                href="#early-access"
                onClick={returnToSignup}
              >
                Join early access <ArrowUpRight size={19} />
              </a>
              <a
                className="button button-outline"
                href={deckUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View the deck <ArrowUpRight size={19} />
              </a>
            </div>
            {!signupAvailable && (
              <p className="closing-note">Early-access signup opens soon.</p>
            )}
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
        <p>A memory for your conversations.</p>
        <a href={deckUrl} target="_blank" rel="noopener noreferrer">
          Product deck <ArrowUpRight size={16} />
        </a>
      </footer>
    </>
  );
}
