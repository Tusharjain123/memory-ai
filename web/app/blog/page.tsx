/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { formatPostDate, listPosts, readingMinutes } from "@/lib/blog";
import { displayTitle, eyebrow, lede, shell } from "@/lib/ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Blog — Memory AI",
  description:
    "Essays on memory, conversations and context, from the team building Memory AI.",
};

export default function BlogIndex() {
  const posts = listPosts();
  return (
    <>
      <SiteHeader current="blog" />
      <main id="main" className={cn(shell, "pb-24 pt-16 sm:pb-32 sm:pt-20")}>
        <header className="max-w-3xl">
          <p className={eyebrow}>
            <span className="h-0.5 w-7 bg-current" /> Blog
          </p>
          <h1 className={cn(displayTitle, "mt-6 text-[clamp(2.75rem,5vw,4.25rem)] leading-none")}>
            Notes on memory, <em className="text-accent-ink">context</em> and
            conversations
          </h1>
          <p className={cn(lede, "mt-5")}>
            Why we’re building Memory AI, and what we’re learning along the way.
          </p>
        </header>
        <ul className="mt-14 grid gap-7">
          {posts.map((post) => (
            <li key={post.slug}>
              <a
                href={`/blog/${post.slug}`}
                className="group grid items-center gap-5 rounded-[28px] border border-line bg-surface p-3.5 shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-lift md:grid-cols-[1.05fr_1fr] md:gap-10 md:p-5"
              >
                <img
                  src={post.cover.src}
                  width={post.cover.width}
                  height={post.cover.height}
                  alt=""
                  className="aspect-video w-full rounded-[22px] bg-bg object-cover"
                />
                <div className="px-2 pb-3 md:px-0 md:pb-0 md:pr-5">
                  <p className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-faint">
                    <time dateTime={post.date}>{formatPostDate(post.date)}</time>
                    <span aria-hidden="true">·</span>
                    {readingMinutes(post)} min read
                  </p>
                  <h2 className={cn(displayTitle, "mt-3 text-[clamp(1.9rem,3vw,2.6rem)] leading-[1.05]")}>
                    {post.title}
                  </h2>
                  <p className="mt-3.5 leading-relaxed text-muted">{post.description}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-[0.9375rem] font-bold text-accent-ink">
                    Read the blog
                    <ArrowRight
                      size={16}
                      className="transition-transform group-hover:translate-x-1"
                    />
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </>
  );
}
