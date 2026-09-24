import { Landing } from "@/components/landing";
import { publicSiteSettings } from "@/lib/server-settings";
export const dynamic = "force-dynamic";
export default function Home() {
  return <Landing {...publicSiteSettings()} />;
}
