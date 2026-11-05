/* Single source of truth for how the site names the two kinds of
   conversation Memory AI captures. Keep the wording generic (not tied to one
   setting like a coffee chat) and change it here only; the hero, the flow
   film, section titles and metadata all read from these values. */
import { Users, Video, type LucideIcon } from "lucide-react";

export type Channel = {
  /** One or two words, used on icons and tags. */
  label: string;
  /** Example shown on the flow-film card. */
  example: string;
  /** Small meta line under the example. */
  meta: string;
  icon: LucideIcon;
};

export const channels = {
  online: {
    label: "Online",
    example: "Product sync on Google Meet",
    meta: "Transcript imported",
    icon: Video,
  },
  inPerson: {
    label: "In person",
    example: "Client meeting, recorded on your phone",
    meta: "No bot needed",
    icon: Users,
  },
} satisfies Record<string, Channel>;

export const tagline = {
  /** Hero headline, muted first line then the promise. */
  lead: "Online or in person.",
  promise: "One",
  promiseAccent: "memory.",
  /** Used in the page title and description. */
  summary: "Online meetings and in-person conversations, remembered together",
};
