/** App icon adapter. Lucide is the first-choice icon source; the local names
 *  below preserve the existing UI API while mapping to lucide-react components. */

import type { SVGProps } from "react";
import {
  ArrowUp,
  Bell,
  Brain,
  BrushCleaning,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  Folder,
  FolderKanban,
  Globe,
  Image as ImageIcon,
  Info,
  List,
  MessageCircle,
  Mic,
  Moon,
  MoreVertical,
  Palette,
  Paperclip,
  Pause,
  Plus,
  RefreshCw,
  Search,
  SendHorizontal,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Split,
  SquarePen,
  SquareStop,
  Sun,
  Terminal,
  Undo2,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

const LUCIDE_ICONS = {
  plus: Plus,
  search: Search,
  sun: Sun,
  moon: Moon,
  chat: MessageCircle,
  folder: Folder,
  image: ImageIcon,
  globe: Globe,
  calendar: Calendar,
  broom: BrushCleaning,
  mic: Mic,
  bell: Bell,
  chevR: ChevronRight,
  chevD: ChevronDown,
  send: SendHorizontal,
  stop: SquareStop,
  pause: Pause,
  paperclip: Paperclip,
  sliders: SlidersHorizontal,
  spark: Sparkles,
  check: Check,
  newchat: SquarePen,
  projects: FolderKanban,
  skills: Zap,
  gear: Settings,
  x: X,
  info: Info,
  palette: Palette,
  dots3: MoreVertical,
  copy: Copy,
  rollback: Undo2,
  refresh: RefreshCw,
  arrowUp: ArrowUp,
  brain: Brain,
  wrench: Wrench,
  terminal: Terminal,
  eye: Eye,
  list: List,
  split: Split,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof LUCIDE_ICONS;

export function Icon({ name, className }: { name: string; className?: string }) {
  const Lucide = LUCIDE_ICONS[name as IconName];
  if (Lucide) {
    return <Lucide className={className} aria-hidden="true" focusable="false" />;
  }
  return <MissingIcon className={className} />;
}

function MissingIcon({ className }: Pick<SVGProps<SVGSVGElement>, "className">) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}
