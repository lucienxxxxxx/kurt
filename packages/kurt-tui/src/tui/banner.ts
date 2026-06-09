/**
 * The startup banner. In the natural-scroll model the logo is printed ONCE to
 * stdout at launch (it scrolls away with history) rather than pinned in a fixed
 * region — so it lives here as a plain string, not an Ink component.
 */

const ART = [
  " __                  __",
  "|  |--.--.--.----.|  |_",
  "|    <|  |  |   _||   _|",
  "|__|__|_____|__|  |____|",
];

const CYAN = "\x1b[1;36m";
const RESET = "\x1b[0m";

/**
 * Centered, colored banner for a given terminal width. The art is centered as a
 * BLOCK — every line gets the same left margin — so the glyph columns stay
 * aligned (centering each line independently would shear it).
 */
export function bannerString(width: number): string {
  const artWidth = Math.max(...ART.map((line) => line.length));
  const left = " ".repeat(Math.max(0, Math.floor((width - artWidth) / 2)));
  return ART.map((line) => left + CYAN + line + RESET).join("\n");
}
