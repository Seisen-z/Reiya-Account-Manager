import { CSSProperties, FC, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GamepadIcon } from "./Icons";

/*
 * One reliable way to show a Roblox game icon.
 *
 * Saved icon links (e.g. in recent games) can stop working after a while, so this
 * tries every known link in order, and if they all fail it asks the backend for a
 * fresh one. Fresh links are cached and requests for many games are batched.
 * If nothing works, a gamepad placeholder is shown instead of a broken image.
 */

const freshCache = new Map<string, string | null>(); // placeId -> url (null = Roblox has no icon)
const waiting = new Map<string, Array<(url: string | null) => void>>();
let batch = new Set<string>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function flushBatch() {
  const ids = [...batch];
  batch = new Set();
  batchTimer = null;
  if (ids.length === 0) return;
  invoke<Record<string, string>>("fetch_place_thumbnails", { placeIds: ids })
    .then(map => ids.forEach(id => settle(id, map?.[id] || null)))
    .catch(() => ids.forEach(id => settle(id, null, true)));
}

function settle(placeId: string, url: string | null, transient = false) {
  if (!transient) freshCache.set(placeId, url);
  const cbs = waiting.get(placeId) ?? [];
  waiting.delete(placeId);
  cbs.forEach(cb => cb(url));
}

/** Get a fresh icon URL for a place (cached, batched). */
export function fetchFreshGameIcon(placeId: string): Promise<string | null> {
  if (!/^\d+$/.test(placeId)) return Promise.resolve(null);
  if (freshCache.has(placeId)) return Promise.resolve(freshCache.get(placeId) ?? null);
  return new Promise(resolve => {
    const list = waiting.get(placeId);
    if (list) { list.push(resolve); return; }
    waiting.set(placeId, [resolve]);
    batch.add(placeId);
    if (batch.size >= 50) flushBatch();
    else if (!batchTimer) batchTimer = setTimeout(flushBatch, 30);
  });
}

export const GameIcon: FC<{
  placeId?: string | null;
  /** Known icon links, best first. Empty/undefined entries are ignored. */
  urls?: Array<string | null | undefined>;
  alt?: string;
  /** Size of the placeholder gamepad icon. */
  placeholderSize?: number;
  style?: CSSProperties;
  /** Fetch a fresh icon even when no links are known (default true). */
  fetchIfMissing?: boolean;
}> = ({ placeId, urls = [], alt = "", placeholderSize = 18, style, fetchIfMissing = true }) => {
  const known = useMemo(
    () => [...new Set(urls.filter((u): u is string => !!u && u.trim() !== ""))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [urls.join("|")],
  );
  const [index, setIndex] = useState(0);
  const [fresh, setFresh] = useState<string | null>(() => (placeId && freshCache.get(placeId)) || null);
  const [gaveUp, setGaveUp] = useState(false);

  // Start over when the game or its links change
  useEffect(() => {
    setIndex(0);
    setGaveUp(false);
    setFresh((placeId && freshCache.get(placeId)) || null);
  }, [placeId, known]);

  const needFresh = !fresh && !!placeId && (index >= known.length) && (known.length > 0 || fetchIfMissing);
  useEffect(() => {
    if (!needFresh || !placeId) return;
    let alive = true;
    fetchFreshGameIcon(placeId).then(url => {
      if (!alive) return;
      if (url && !known.includes(url)) setFresh(url);
      else setGaveUp(true);
    });
    return () => { alive = false; };
  }, [needFresh, placeId, known]);

  const src = index < known.length ? known[index] : fresh;

  if (!src || gaveUp) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--g04)", ...style }}>
        <GamepadIcon size={placeholderSize} color="var(--t3)" />
      </div>
    );
  }

  return (
    <img
      key={src}
      src={src}
      alt={alt}
      loading="lazy"
      draggable={false}
      onError={() => {
        if (index < known.length) setIndex(i => i + 1); // try the next known link, then a fresh one
        else setGaveUp(true);
      }}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...style }}
    />
  );
};
