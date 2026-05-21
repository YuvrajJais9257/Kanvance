import { useRef, useState, useEffect, useMemo } from "react";
import styles from "./VirtualList.module.css";

function defaultGetSize(estimateSize, index) {
  return typeof estimateSize === "function" ? estimateSize(index) : estimateSize;
}

/**
 * Lightweight windowed list — no external deps.
 * Renders only rows near the viewport; supports per-row size estimates (e.g. expanded cards).
 *
 * Accessibility props:
 *   getRowRole(item, index) — return "listitem" | "presentation" per row.
 *                             Defaults to () => "listitem".
 *                             Pass (item) => item.type === "header" ? "presentation" : "listitem"
 *                             when the list mixes header rows with content rows.
 */
export default function VirtualList({
  items,
  renderItem,
  estimateSize = 88,
  overscan = 8,
  remeasureDep,
  getItemKey,
  getRowRole,
  className = "",
  innerClassName = "",
  empty = null,
  fill = true,
}) {
  const parentRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);

  const offsets = useMemo(() => {
    const off = [0];
    for (let i = 0; i < items.length; i++) {
      off.push(off[i] + defaultGetSize(estimateSize, i));
    }
    return off;
  }, [items.length, remeasureDep, estimateSize]);

  const totalSize = offsets[items.length] ?? 0;

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight || 600);
    measure();
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [items.length]);

  const range = useMemo(() => {
    if (!items.length) return { start: 0, end: 0 };
    let start = 0;
    for (let i = 0; i < items.length; i++) {
      if (offsets[i + 1] > scrollTop) {
        start = Math.max(0, i - overscan);
        break;
      }
    }
    let end = items.length;
    const bottom = scrollTop + viewportH;
    for (let i = start; i < items.length; i++) {
      if (offsets[i] >= bottom) {
        end = Math.min(items.length, i + overscan + 1);
        break;
      }
    }
    return { start, end: Math.max(start, end) };
  }, [scrollTop, viewportH, offsets, items.length, overscan]);

  if (!items.length) return empty;

  const viewportClass = fill
    ? `${styles.viewport} ${styles.fill} ${className}`
    : `${styles.viewport} ${className}`;

  const indices = [];
  for (let i = range.start; i < range.end; i++) indices.push(i);

  return (
    <div
      ref={parentRef}
      className={viewportClass}
      role="list"
      aria-rowcount={items.length}
    >
      <div
        className={`${styles.inner} ${innerClassName}`}
        style={{ height: totalSize }}
      >
        {indices.map((index) => {
          const item = items[index];
          const key = getItemKey ? getItemKey(item, index) : index;
          const rowRole = getRowRole ? getRowRole(item, index) : "listitem";
          return (
            <div
              key={key}
              role={rowRole}
              aria-rowindex={index + 1}
              className={styles.row}
              style={{ transform: `translateY(${offsets[index]}px)` }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
