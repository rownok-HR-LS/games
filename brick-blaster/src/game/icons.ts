import type { PowerKind } from "./engine";

// Layered 24×24 power-up icons, shared by the canvas capsules and the HTML legend/HUD.
// Each layer is an even-odd path with a tone: "main" (solid), "soft" (translucent) or
// "dark" (shading cut into the main shape). Layers draw in order.
export type Tone = "main" | "soft" | "dark";
export type IconLayer = { d: string; tone: Tone };

const ball = (cx: number, cy: number, r: number) => {
  // Solid ball with a small specular hole at the upper left.
  const hx = cx - r * 0.38;
  const hy = cy - r * 0.38;
  const hr = r * 0.27;
  return `M${cx} ${cy - r}a${r} ${r} 0 1 1 0 ${2 * r}a${r} ${r} 0 1 1 0 ${-2 * r}zM${hx} ${hy - hr}a${hr} ${hr} 0 1 0 0 ${2 * hr}a${hr} ${hr} 0 1 0 0 ${-2 * hr}z`;
};

export const POWER_ICONS: Record<PowerKind, IconLayer[]> = {
  // Long paddle with arrows pushing outward.
  expand: [
    { tone: "main", d: "M11.2 7.8H7.6V4.4L3 9l4.6 4.6v-3.4h3.6zM12.8 7.8h3.6V4.4L21 9l-4.6 4.6v-3.4h-3.6zM3.2 16.4h17.6a2.3 2.3 0 0 1 0 4.6H3.2a2.3 2.3 0 0 1 0-4.6z" },
    { tone: "dark", d: "M3.2 19.2h17.6v.9H3.2z" },
  ],
  // Three glossy balls.
  multi: [
    { tone: "main", d: `${ball(12, 7, 4.2)}${ball(6.3, 16.4, 4.2)}${ball(17.7, 16.4, 4.2)}` },
  ],
  // Two-layer flame.
  fire: [
    { tone: "main", d: "M12 .8c1 4 6.8 6.6 6.8 12.8a6.8 6.8 0 0 1-13.6 0c0-3.2 1.7-5.6 3.6-6.9.1 2.5 1.1 4.1 2.6 4.7C10.6 7.6 11 4 12 .8z" },
    { tone: "dark", d: "M12.3 9.4c.5 2.6 3.7 4.1 3.7 7.4a4 4 0 0 1-8 0c0-1.9 1-3.2 2.1-4 .2 1.3.8 2 1.6 2.3-.3-2.1-.1-4 .6-5.7z" },
    { tone: "main", d: "M12 15.4c-1 .9-1.6 1.8-1.6 2.7a1.6 1.6 0 0 0 3.2 0c0-.9-.6-1.8-1.6-2.7z" },
  ],
  // Paddle with twin cannons firing beams.
  laser: [
    { tone: "soft", d: "M5.7 1.5h1.6v10.5H5.7zM16.7 1.5h1.6v10.5h-1.6z" },
    { tone: "main", d: "M5.1 1h2.8v3.4H5.1zM16.1 1h2.8v3.4h-2.8zM4.8 13h3.4v4H4.8zM15.8 13h3.4v4h-3.4zM3.2 16.6h17.6a2.2 2.2 0 0 1 0 4.4H3.2a2.2 2.2 0 0 1 0-4.4z" },
    { tone: "dark", d: "M3.2 19.2h17.6v.9H3.2z" },
  ],
  // Horseshoe magnet with steel tips and a pull field.
  catch: [
    { tone: "soft", d: "M9 19.6a5.5 5.5 0 0 0 6 0l.9 1.4a7.2 7.2 0 0 1-7.8 0z" },
    { tone: "main", d: "M3.5 2h5.4v8.7a3.1 3.1 0 0 0 6.2 0V2h5.4v8.7a8.5 8.5 0 0 1-17 0z" },
    { tone: "dark", d: "M3.5 2h5.4v3.6H3.5zM15.1 2h5.4v3.6h-5.4z" },
  ],
  // Hourglass with falling sand.
  slow: [
    { tone: "soft", d: "M6.4 4.2h11.2c0 4-3.6 5.6-3.6 7.8s3.6 3.8 3.6 7.8H6.4c0-4 3.6-5.6 3.6-7.8S6.4 8.2 6.4 4.2z" },
    { tone: "main", d: "M4.6 1.6h14.8v2.6H4.6zM4.6 19.8h14.8v2.6H4.6zM8.5 6.4h7c-.6 1.9-2.7 2.9-3.5 4.1-.8-1.2-2.9-2.2-3.5-4.1zM11.55 10.6h.9v4h-.9zM12 14.6c.6 1.6 4.1 2.2 4.7 5.2H7.3c.6-3 4.1-3.6 4.7-5.2z" },
  ],
  // Heart with a plus.
  life: [
    { tone: "main", d: "M12 21.6l-1.5-1.4C5 15.3 1.7 12.3 1.7 8.6c0-3 2.4-5.4 5.4-5.4 1.9 0 3.6.8 4.9 2.2 1.3-1.4 3-2.2 4.9-2.2 3 0 5.4 2.4 5.4 5.4 0 3.7-3.3 6.7-8.8 11.6z" },
    { tone: "dark", d: "M10.9 7.6h2.2v2.6h2.6v2.2h-2.6V15h-2.2v-2.6H8.3v-2.2h2.6z" },
  ],
  // Bevelled shield with a centre ridge.
  shield: [
    { tone: "main", d: "M12 1.3l8.8 3.3v6.6c0 5.5-3.7 10.5-8.8 11.8-5.1-1.3-8.8-6.3-8.8-11.8V4.6z" },
    { tone: "dark", d: "M12 4.2l6.1 2.3v4.7c0 4-2.6 7.7-6.1 8.9z" },
    { tone: "soft", d: "M11.3 4.5h1.4v14.8h-1.4z" },
  ],
  // Short paddle with arrows pushing inward.
  shrink: [
    { tone: "soft", d: "M.6 8.1h2.6v1.8H.6zM20.8 8.1h2.6v1.8h-2.6z" },
    { tone: "main", d: "M3.6 7.8h3.6V4.4L11.4 9l-4.2 4.6v-3.4H3.6zM20.4 7.8h-3.6V4.4L12.6 9l4.2 4.6v-3.4h3.6zM9.4 16.4h5.2a2.3 2.3 0 0 1 0 4.6H9.4a2.3 2.3 0 0 1 0-4.6z" },
    { tone: "dark", d: "M9.4 19.2h5.2v.9H9.4z" },
  ],
  // Speeding ball with motion lines.
  fast: [
    { tone: "soft", d: "M.8 7.6h8.4v1.8H.8zM2.8 11.1h6.6v1.8H2.8zM.8 14.6h8.4v1.8H.8z" },
    { tone: "main", d: ball(16.2, 12, 6) },
  ],
};
