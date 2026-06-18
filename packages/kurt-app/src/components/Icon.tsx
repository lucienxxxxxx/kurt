/** Hand-rolled SVG icons (ported from prototype/ui.jsx). PORTING_GUIDE §8 maps
 *  these to lucide-react; kept inline for 6.1 parity, swappable later. */

const ICON: Record<string, string> = {
  plus: "M12 5v14M5 12h14",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 100 8 4 4 0 000-8z",
  moon: "M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z",
  chat: "M21 12a8 8 0 01-8 8H7l-4 3v-5a8 8 0 018-11h2a8 8 0 016 5z",
  folder: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M8.5 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  globe: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9z",
  calendar: "M5 5h14v15H5zM5 9h14M9 3v4M15 3v4",
  broom: "M19 5l-7 7M11 13l-4 7M11 13l5 5M5.5 18.5L8 21",
  mic: "M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM5 11a7 7 0 0014 0M12 18v3",
  bell: "M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6zM10 21h4",
  chevR: "M9 6l6 6-6 6",
  chevD: "M6 9l6 6 6-6",
  send: "M5 12l14-7-5 7 5 7-14-7zM5 12h9",
  stop: "M7 7h10v10H7z",
  pause: "M8 6v12M16 6v12",
  paperclip: "M21 11l-8.5 8.5a4 4 0 01-5.7-5.7L15 5.5a2.5 2.5 0 013.5 3.5l-8.4 8.4a1 1 0 01-1.4-1.4l7.7-7.7",
  sliders: "M4 7h11M19 7h1M4 17h7M15 17h5M15 5v4M11 15v4",
  spark: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z",
  check: "M5 13l4 4L19 7",
  newchat: "M12 5v14M5 12h14",
  projects: "M3 8h6l2 2h10v9H3zM7 5h6l2 2",
  skills: "M13 2L4 14h7l-2 8 10-12h-8z",
  gear: "M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3h.1a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8v.1a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  x: "M6 6l12 12M18 6l-12 12",
  info: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7v.01",
  palette: "M12 3a9 9 0 100 18c1 0 1.5-.8 1.5-1.7 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H16a5 5 0 005-5c0-4.4-4-8-9-8zM7 12.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM10.5 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM15 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  dots3: "M12 5v.01M12 12v.01M12 19v.01",
  copy: "M9 9h10v10H9zM5 15H4a1 1 0 01-1-1V5a1 1 0 011-1h9a1 1 0 011 1v1",
  rollback: "M9 14L4 9l5-5M4 9h11a5 5 0 110 10h-1",
  arrowUp: "M12 20V5M6 11l6-6 6 6",
};

export function Icon({ name, className }: { name: string; className?: string }) {
  const d = ICON[name] || "";
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split("M").filter(Boolean).map((seg, i) => <path key={i} d={"M" + seg} />)}
    </svg>
  );
}
