/* Blog posts are stored here as structured blocks, so the site needs no
   Markdown parser or CMS. To add a post, append an entry to `posts` and put its
   images in public/blog/<slug>/. */

export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "quote"; text: string }
  | { type: "img"; src: string; alt: string; width: number; height: number; caption?: string };

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  author: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  cover: { src: string; alt: string; width: number; height: number };
  /** Where the post was first published, if anywhere. */
  originalUrl?: string;
  body: BlogBlock[];
};

const brainSlug = "your-brain-was-never-meant-to-be-a-search-engine";
const brainImg = (file: string) => `/blog/${brainSlug}/${file}`;

export const posts: BlogPost[] = [
  {
    slug: brainSlug,
    title: "Your Brain Was Never Meant to Be a Search Engine",
    description:
      "We meet people online and offline, have hundreds of conversations, and collect ideas along the way. But what happens when the context of those conversations gets lost?",
    author: "Tushar Jain",
    date: "2026-11-05",
    cover: {
      src: brainImg("cover.webp"),
      alt: "Illustration of a person thinking, surrounded by a video call, a voice note, a note, a coffee cup, a calendar and a phone, all connected to one point of memory.",
      width: 1536,
      height: 864,
    },
    originalUrl:
      "https://medium.com/@tushar_jain_/your-brain-was-never-meant-to-be-a-search-engine-f8faf0b769dc",
    body: [
      { type: "h2", text: "We meet people in two ways. Online and offline." },
      { type: "p", text: "Think about the last time you had an interesting conversation with someone." },
      { type: "p", text: "Maybe it was a Zoom call with a founder. You discussed a product idea, exchanged thoughts about the market, and agreed to explore something together." },
      { type: "p", text: "The conversation was valuable. You wanted to remember what was discussed, what you had agreed upon, and what you needed to do next." },
      { type: "p", text: "Fortunately, we now have tools for that." },
      { type: "p", text: "Online meeting notetakers can join our calls, record conversations, generate transcripts, summarize discussions, and extract action items. We no longer have to rely entirely on our memory to recall what happened during a meeting." },
      { type: "p", text: "Now, imagine meeting the same person a week later." },
      { type: "p", text: "This time, you’re sitting across from each other at a coffee shop." },
      { type: "p", text: "You discuss how things have progressed since your last conversation. Maybe you talk about a completely different idea. Perhaps you discover a new opportunity, share a personal experience, or make a decision that changes the direction of your earlier discussion." },
      { type: "p", text: "Let’s call the first conversation X and the second one Y." },
      { type: "p", text: "Together, X and Y represent the complete context of your interactions with this person." },
      { type: "p", text: "But here’s the problem." },
      {
        type: "img",
        src: brainImg("x-plus-y.webp"),
        alt: "Two cards: conversation X on a video call, remembered by a meeting notetaker, and conversation Y at a coffee shop a week later, remembered by a voice recorder. Nothing connects them.",
        width: 1600,
        height: 934,
        caption: "Two conversations, two tools. Nothing connects X and Y.",
      },
      { type: "p", text: "They have captured two conversations. They have not captured the continuity between them." },
      { type: "h2", text: "The problem isn’t recording conversations. It’s remembering the context." },
      { type: "p", text: "At first, this might sound like a small problem." },
      { type: "p", text: "After all, you can always go back and read the transcript of your previous meeting. You can record your in-person conversation. You can even put everything into a single folder." },
      { type: "p", text: "But think about what that actually requires." },
      { type: "p", text: "You need to remember that a conversation happened. You need to remember where it was recorded. You need to find the right transcript, search through it, and connect what was discussed with the conversation you’re having today." },
      { type: "p", text: "In other words, you need to remember enough about something you have forgotten to find the information that helps you remember it." },
      { type: "p", text: "That’s a strange problem to have in a world where we have access to so much information." },
      { type: "p", text: "And it becomes even more complicated when you meet the same person multiple times." },
      { type: "p", text: "Imagine having five conversations with someone over two months." },
      {
        type: "img",
        src: brainImg("five-conversations.webp"),
        alt: "A timeline of five conversations over eight weeks: an idea is introduced, built on, changes direction, gains a constraint, and ends in a decision.",
        width: 1600,
        height: 614,
        caption: "An idea evolves over five conversations, and the reason for the decision is spread across all of them.",
      },
      { type: "p", text: "If you look at each conversation independently, you might understand what happened during that particular meeting. But you could easily miss how the idea evolved, why a particular decision was made, or what led you to that conclusion." },
      { type: "p", text: "The meaning isn’t always in a single conversation. Sometimes, it exists between conversations." },
      { type: "h2", text: "Our conversations don’t happen in isolated sessions" },
      { type: "p", text: "We have become accustomed to thinking about conversations as individual events." },
      { type: "p", text: "A meeting has a start time, an end time, a transcript, and a summary. Once the meeting is over, we move on to the next thing." },
      { type: "p", text: "But that’s not how human relationships or ideas actually work." },
      { type: "p", text: "A conversation with a friend doesn’t end when you leave the coffee shop." },
      { type: "p", text: "A discussion with a colleague doesn’t reset when you close Google Meet." },
      { type: "p", text: "An idea doesn’t become irrelevant simply because it was discussed three weeks ago." },
      { type: "p", text: "Conversations are continuous, even when the tools we use to capture them are not." },
      { type: "p", text: "And this is not limited to meetings." },
      { type: "p", text: "Think about the different places where information about your life exists today." },
      { type: "p", text: "A conversation with a friend on WhatsApp." },
      { type: "p", text: "A meeting with a colleague on Google Meet." },
      { type: "p", text: "A voice note you recorded while walking." },
      { type: "p", text: "An idea you wrote down in your notes app." },
      { type: "p", text: "A discussion you had over lunch." },
      { type: "p", text: "A decision you made while talking to someone on the phone." },
      { type: "p", text: "Each of these contains a small piece of your context." },
      { type: "p", text: "But these pieces rarely come together when you need them." },
      { type: "p", text: "You might remember the person but forget the conversation. You might remember the idea but forget who introduced it. You might remember that you made a decision but forget why you made it in the first place." },
      { type: "p", text: "And when the context disappears, even information that has been carefully recorded becomes difficult to use." },
      { type: "h2", text: "What if we could remember the complete context?" },
      { type: "p", text: "This question got me thinking." },
      { type: "p", text: "What if we stopped treating every conversation as an independent recording?" },
      { type: "p", text: "What if the things we captured online, offline, through voice notes, or through our own thoughts could become part of a continuous personal memory?" },
      { type: "p", text: "Imagine meeting someone today and discussing an idea." },
      { type: "p", text: "A few weeks later, you meet them again." },
      { type: "p", text: "Instead of starting from scratch, you could ask:" },
      { type: "quote", text: "What was the idea we discussed last time?" },
      { type: "quote", text: "Did we talk about this with anyone else?" },
      { type: "quote", text: "What did I promise to follow up on?" },
      { type: "quote", text: "How has this idea evolved since our first conversation?" },
      { type: "p", text: "And instead of searching through multiple recordings, transcripts, and notes, you could retrieve the relevant context naturally." },
      { type: "p", text: "Not just the words." },
      { type: "p", text: "The people, the ideas, the decisions, and the connections between them." },
      { type: "p", text: "That was the direction I wanted to explore." },
      { type: "h2", text: "That’s why I started building Memory AI" },
      { type: "p", text: "I didn’t want to build another application that simply records conversations and generates summaries." },
      { type: "p", text: "There are already plenty of tools that do that." },
      { type: "p", text: "I wanted to explore something different: a personal memory system that helps you capture the things that matter and retrieve them when you need them." },
      { type: "p", text: "A place where your voice notes, thoughts, ideas, and conversations don’t have to exist as disconnected pieces of information." },
      { type: "p", text: "Memory AI started with this idea." },
      { type: "p", text: "Capture something once. Let AI help organize and understand it. And when you need it later, ask about it naturally." },
      {
        type: "img",
        src: brainImg("product.webp"),
        alt: "Three Memory AI app screens with sample data: a prep brief before meeting Aarav Mehta, an Ask Memory answer about a promised proposal, and the commitment ledger.",
        width: 1600,
        height: 1094,
        caption: "Memory AI today: a prep brief before you meet, natural questions, and every commitment in one place. Real screens, sample data.",
      },
      { type: "p", text: "The goal isn’t to make you remember every single thing." },
      { type: "p", text: "It’s to make sure that the things worth remembering don’t disappear just because you forgot where you stored them." },
      { type: "p", text: "Because I believe the next interesting evolution of AI isn’t just about making it smarter at answering questions." },
      { type: "p", text: "It’s about making it better at understanding the context of our own lives." },
      { type: "p", text: "And perhaps, for the first time, giving us a way to remember more without having to think about remembering everything." },
      { type: "h2", text: "A small step toward remembering more" },
      { type: "p", text: "I don’t think technology should make us spend more time managing information." },
      { type: "p", text: "I think it should help us spend more time being present." },
      { type: "p", text: "The conversations we have, the ideas we exchange, the promises we make, and the people we meet are all part of our lives. They deserve more than being scattered across recordings, transcripts, and forgotten notes." },
      { type: "p", text: "That’s what I’m trying to build with Memory AI." },
      { type: "p", text: "Not another place to store things, but a way to bring the things we’ve already captured back into our lives when they matter." },
      { type: "p", text: "Because your brain was never meant to be a search engine." },
    ],
  },
];

/** Newest first. */
export function listPosts(): BlogPost[] {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date));
}

export function getPost(slug: string): BlogPost | undefined {
  return posts.find((post) => post.slug === slug);
}

export function readingMinutes(post: BlogPost): number {
  const words = post.body
    .filter((block) => block.type !== "img")
    .map((block) => ("text" in block ? block.text : ""))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}

export function formatPostDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
