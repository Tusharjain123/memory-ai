/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import {
  formatPostDate,
  getPost,
  posts,
  readingMinutes,
  type BlogBlock,
} from "@/lib/blog";
import { buttonPrimary, displayTitle, shell } from "@/lib/ui";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = getPost((await params).slug);
  if (!post) return { title: "Post not found — Memory AI" };
  return {
    title: `${post.title} — Memory AI`,
    description: post.description,
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      images: [{ url: post.cover.src, width: post.cover.width, height: post.cover.height }],
      publishedTime: post.date,
      authors: [post.author],
    },
    twitter: { card: "summary_large_image", title: post.title, description: post.description },
  };
}

function Block({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case "h2":
      return (
        <h2 className={cn(displayTitle, "mt-16 text-[clamp(1.9rem,3.5vw,2.5rem)] leading-[1.1] first:mt-0")}>
          {block.text}
        </h2>
      );
    case "quote":
      return (
        <p className="mt-3 border-l-[3px] border-accent pl-5 font-display text-2xl italic leading-snug text-accent-ink">
          “{block.text}”
        </p>
      );
    case "img":
      return (
        <figure className="my-12 md:-mx-16">
          <img
            src={block.src}
            width={block.width}
            height={block.height}
            alt={block.alt}
            loading="lazy"
            className="w-full rounded-[22px] border border-line"
          />
          {block.caption && (
            <figcaption className="mt-3 text-center text-sm leading-normal text-muted">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
    default:
      return <p className="mt-5 [h2+&]:mt-3">{block.text}</p>;
  }
}

export default async function BlogPostPage({ params }: Props) {
  const post = getPost((await params).slug);
  if (!post) notFound();

  return (
    <>
      <SiteHeader current="blog" />
      <main id="main">
        <article className="pb-24 pt-12 sm:pb-32 sm:pt-16">
          <header className={cn(shell, "max-w-3xl text-center")}>
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition hover:text-accent-ink"
            >
              <ArrowLeft size={16} /> All posts
            </Link>
            <h1 className={cn(displayTitle, "mt-7 text-[clamp(2.75rem,6vw,4.75rem)] leading-none")}>
              {post.title}
            </h1>
            <p className="mt-6 font-display text-[clamp(1.25rem,2vw,1.5rem)] italic leading-snug text-muted">
              {post.description}
            </p>
            <p className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[0.8125rem] text-faint">
              <span>{post.author}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={post.date}>{formatPostDate(post.date)}</time>
              <span aria-hidden="true">·</span>
              {readingMinutes(post)} min read
            </p>
          </header>
          <figure className={cn(shell, "my-10 max-w-[1040px] sm:mb-14 sm:mt-12")}>
            <img
              src={post.cover.src}
              width={post.cover.width}
              height={post.cover.height}
              alt={post.cover.alt}
              fetchPriority="high"
              className="w-full rounded-[28px] shadow-card"
            />
          </figure>
          <div className="mx-auto w-[min(680px,calc(100%-48px))] text-[1.0625rem] leading-[1.75] text-ink sm:text-[1.1875rem]">
            {post.body.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </div>
          <aside
            aria-labelledby="post-cta-title"
            className="mx-auto mt-20 w-[min(760px,calc(100%-48px))] rounded-[28px] border border-line bg-surface px-6 py-10 text-center shadow-card sm:px-10 sm:py-12"
          >
            <h2 id="post-cta-title" className={cn(displayTitle, "text-[clamp(2rem,4vw,2.75rem)] leading-[1.05]")}>
              Memory AI is opening its <em className="text-accent-ink">waitlist</em>
            </h2>
            <p className="mt-3.5 leading-relaxed text-muted">
              If this is a problem you’ve experienced too, I’d love for you to be
              part of what we’re building.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-6">
              <Link href="/#early-access" className={buttonPrimary}>
                Join early access <ArrowRight size={16} />
              </Link>
              {post.originalUrl && (
                <a
                  href={post.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-bold text-ink"
                >
                  <span className="border-b border-line-strong pb-0.5 transition hover:border-accent-ink">
                    Also on Medium
                  </span>
                  <ArrowUpRight size={16} />
                </a>
              )}
            </div>
          </aside>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
