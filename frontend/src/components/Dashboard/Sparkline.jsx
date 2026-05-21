/** Decorative 7-point sparkline (cosmetic — not tied to live metrics). */
export default function Sparkline({ seed = 0, color = "currentColor" }) {
  const pts = [];
  let v = 0.35 + (seed % 7) * 0.08;
  for (let i = 0; i < 7; i++) {
    v = Math.max(0.15, Math.min(0.9, v + Math.sin(seed * 0.7 + i * 1.3) * 0.12));
    pts.push(v);
  }
  const w = 64;
  const h = 22;
  const step = w / (pts.length - 1);
  const d = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - p * h).toFixed(1)}`)
    .join(" ");

  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.65" />
    </svg>
  );
}
