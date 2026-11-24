// Simple SVG car silhouettes (no photos needed). Colour follows the car's paint colour.
const PAINT: Record<string, string> = {
  white: "#e5e7eb", black: "#1f2937", silver: "#9ca3af", gray: "#6b7280", grey: "#6b7280", red: "#dc2626",
  blue: "#2563eb", green: "#15803d", orange: "#ea580c", yellow: "#eab308",
};

const BODY: Record<string, string> = {
  sedan: "M20 70 L40 70 Q48 48 70 44 L110 30 Q140 24 170 30 L210 46 Q240 50 260 58 Q272 62 272 72 L272 80 L20 80 Z",
  suv: "M20 78 L20 56 Q22 46 40 44 L70 22 Q80 16 100 16 L190 16 Q205 16 214 24 L240 44 Q268 48 272 60 L272 80 L20 80 Z",
  hatchback: "M24 78 L24 58 Q26 48 44 46 L78 24 Q88 18 104 18 L178 18 Q196 18 204 30 L224 52 Q260 54 268 64 L268 80 L24 80 Z",
  pickup: "M16 80 L16 50 L120 50 L132 22 Q136 16 146 16 L196 16 Q206 16 212 24 L232 48 Q268 50 274 62 L274 80 Z",
  minivan: "M18 80 L18 40 Q20 22 46 20 L196 18 Q214 18 226 30 L250 50 Q270 54 274 64 L274 80 Z",
  coupe: "M18 76 L36 68 Q60 50 96 42 L136 30 Q160 26 186 32 L230 50 Q262 54 274 64 L274 80 L18 80 Z",
};

export default function CarArt({ body, color, className = "" }: { body: string; color: string; className?: string }) {
  const fill = PAINT[color?.toLowerCase()] ?? "#64748b";
  const path = BODY[body] ?? BODY.sedan;
  return (
    <svg viewBox="0 0 292 110" className={className} role="img" aria-label={`${color} ${body}`}>
      <defs>
        <linearGradient id={`sky-${body}-${color}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#eef2ff" />
          <stop offset="1" stopColor="#f8fafc" />
        </linearGradient>
      </defs>
      <rect width="292" height="110" fill={`url(#sky-${body}-${color})`} />
      <ellipse cx="146" cy="96" rx="130" ry="6" fill="#cbd5e1" opacity="0.6" />
      <path d={path} fill={fill} stroke="#0f172a" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d={path} fill="url(#glass)" opacity="0" />
      <circle cx="72" cy="82" r="14" fill="#111827" /><circle cx="72" cy="82" r="6" fill="#9ca3af" />
      <circle cx="222" cy="82" r="14" fill="#111827" /><circle cx="222" cy="82" r="6" fill="#9ca3af" />
      <rect x="250" y="60" width="16" height="5" rx="2" fill="#fde68a" />
    </svg>
  );
}
