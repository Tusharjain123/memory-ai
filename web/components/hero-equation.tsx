import { Sparkles, type LucideIcon } from "lucide-react";
import { channels } from "@/lib/site-copy";
import { cn } from "@/lib/utils";

/* The hero's one-glance story: Online + In person → One memory.
   Floating tiles and a travelling dot; all motion is decorative and is
   switched off by the reduced-motion reset in globals.css. */

function Tile({
  icon: Icon,
  label,
  float,
  primary = false,
}: {
  icon: LucideIcon;
  label: string;
  float: string;
  primary?: boolean;
}) {
  return (
    <figure className="flex flex-col items-center gap-2.5">
      <div
        className={cn(
          "grid place-items-center rounded-[22px] border shadow-lift",
          primary
            ? "size-[72px] border-transparent bg-[radial-gradient(circle_at_30%_25%,#5fe3cf,var(--accent)_55%,#0b7d6f)] text-white shadow-[0_0_44px_rgb(22_175_153/45%)] sm:size-20"
            : "size-16 border-line bg-surface text-accent-ink sm:size-[72px]",
          float,
        )}
      >
        <Icon size={primary ? 30 : 26} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <figcaption
        className={cn(
          "text-xs font-medium sm:text-sm",
          primary ? "text-ink" : "text-muted",
        )}
      >
        {label}
      </figcaption>
    </figure>
  );
}

function Connector({ symbol, delay }: { symbol: string; delay: string }) {
  return (
    <div className="relative -mt-7 flex w-10 items-center justify-center [--travel:34px] sm:w-16 sm:[--travel:58px]" aria-hidden="true">
      <span className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-line-strong to-transparent" />
      <span
        style={{ animationDelay: delay }}
        className="absolute left-0 top-1/2 size-1.5 rounded-full bg-accent opacity-0 [animation:hero-travel_2.4s_ease-in-out_infinite]"
      />
      <span className="relative text-lg font-light text-faint">{symbol}</span>
    </div>
  );
}

export function HeroEquation() {
  return (
    <div
      role="img"
      aria-label={`${channels.online.label} meetings plus ${channels.inPerson.label.toLowerCase()} conversations become one memory.`}
      className="flex items-center justify-center"
    >
      <Tile icon={channels.online.icon} label={channels.online.label} float="[animation:hero-float_6s_ease-in-out_infinite]" />
      <Connector symbol="+" delay="0s" />
      <Tile icon={channels.inPerson.icon} label={channels.inPerson.label} float="[animation:hero-float_6s_ease-in-out_-2s_infinite]" />
      <Connector symbol="→" delay="-1.2s" />
      <Tile icon={Sparkles} label="One memory" float="[animation:hero-float_6s_ease-in-out_-4s_infinite]" primary />
    </div>
  );
}
