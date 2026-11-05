import { ArrowRight, Plus, Sparkles, type LucideIcon } from "lucide-react";
import { channels } from "@/lib/site-copy";
import { cn } from "@/lib/utils";

/* The hero's one-glance story: Online + In person → One memory.
   Every tile sits in a slot of the same size, so the tiles share a centre
   line and the labels share a baseline even though the memory tile is
   larger. Connectors are matching round badges; a dot travels behind them.
   All motion is decorative and the reduced-motion reset turns it off. */

/** Same height for tile slots and connectors keeps everything centred. */
const slot = "h-20 sm:h-24";

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
    <figure className="flex w-20 flex-col items-center sm:w-24">
      <div className={cn(slot, "grid w-full place-items-center")}>
        <div
          className={cn(
            "grid place-items-center rounded-[22px] border",
            primary
              ? "size-[76px] border-transparent bg-[radial-gradient(circle_at_30%_25%,#5fe3cf,var(--accent)_55%,#0b7d6f)] text-white shadow-[0_10px_44px_rgb(22_175_153/40%)] sm:size-[88px]"
              : "size-16 border-line bg-surface text-accent-ink shadow-lift sm:size-[72px]",
            float,
          )}
        >
          <Icon size={primary ? 32 : 26} strokeWidth={1.75} aria-hidden="true" />
        </div>
      </div>
      <figcaption
        className={cn(
          "mt-2 text-xs font-medium sm:text-sm",
          primary ? "text-ink" : "text-muted",
        )}
      >
        {label}
      </figcaption>
    </figure>
  );
}

function Connector({ icon: Icon, delay }: { icon: LucideIcon; delay: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        slot,
        "relative flex w-10 items-center justify-center [--travel:34px] sm:w-16 sm:[--travel:58px]",
      )}
    >
      <span className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-line-strong to-transparent" />
      <span
        style={{ animationDelay: delay }}
        className="absolute left-0 top-1/2 size-1.5 rounded-full bg-accent opacity-0 [animation:hero-travel_2.4s_ease-in-out_infinite]"
      />
      <span className="relative grid size-6 place-items-center rounded-full border border-line bg-surface text-faint shadow-card">
        <Icon size={13} strokeWidth={2.25} />
      </span>
    </div>
  );
}

export function HeroEquation() {
  return (
    <div
      role="img"
      aria-label={`${channels.online.label} meetings plus ${channels.inPerson.label.toLowerCase()} conversations become one memory.`}
      className="flex items-start justify-center"
    >
      <Tile icon={channels.online.icon} label={channels.online.label} float="[animation:hero-float_6s_ease-in-out_infinite]" />
      <Connector icon={Plus} delay="0s" />
      <Tile icon={channels.inPerson.icon} label={channels.inPerson.label} float="[animation:hero-float_6s_ease-in-out_-2s_infinite]" />
      <Connector icon={ArrowRight} delay="-1.2s" />
      <Tile icon={Sparkles} label="One memory" float="[animation:hero-float_6s_ease-in-out_-4s_infinite]" primary />
    </div>
  );
}
