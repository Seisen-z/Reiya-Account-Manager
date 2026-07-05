import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "./Toast";
import { useLanguage } from "../context/LanguageContext";

const RATE_KEY = "reiya_rated_v1";
const SNOOZE_KEY = "reiya_rate_snooze_until";
const SNOOZE_DAYS = 7;
const STAR_PATH = "M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z";

interface RatingStats { average: number; count: number; }

export default function RateBanner({ onRated }: { onRated?: (stats: RatingStats) => void }) {
  const toast = useToast();
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [rated, setRated] = useState(false);
  const [stats, setStats] = useState<RatingStats | null>(null);

  useEffect(() => {
    const alreadyRated = localStorage.getItem(RATE_KEY);
    const snoozeUntil = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    if (alreadyRated || Date.now() < snoozeUntil) return;
    if (Math.random() >= 0.5) return;
    const delay = 4000 + Math.random() * 10000;
    const id = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(id);
  }, []);

  const rate = (value: number) => {
    localStorage.setItem(RATE_KEY, String(value));
    setRated(true);
    toast.success(t("thanks_for_rating"));

    invoke("submit_rating", { rating: value })
      .then(() => invoke<RatingStats>("get_rating_stats"))
      .then(stats => { setStats(stats); onRated?.(stats); })
      .catch(() => {});

    setTimeout(() => setVisible(false), 4000);
  };

  const dismiss = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400000));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={{
      background: "var(--surface-2)",
      border: "1px solid var(--border-mid)",
      borderRadius: 10,
      padding: "10px 10px 12px",
      marginBottom: 10,
      position: "relative",
    }}>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          position: "absolute", top: 5, right: 6,
          width: 16, height: 16, border: "none", background: "transparent",
          color: "var(--t3)", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0,
        }}
      >×</button>

      {rated ? (
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 10.5, color: "var(--t2)", margin: 0, fontWeight: 600 }}>
            {t("thanks_for_rating")}
          </p>
          {stats && stats.count > 0 && (
            <p style={{ fontSize: 9.5, color: "var(--t3)", margin: "4px 0 0", fontWeight: 600 }}>
              {stats.average.toFixed(1)} ★ {t("average")} · {stats.count} {t("ratings")}
            </p>
          )}
        </div>
      ) : (
        <>
          <p style={{ fontSize: 10.5, color: "var(--t2)", textAlign: "center", margin: "0 0 8px", fontWeight: 600, paddingRight: 12 }}>
            {t("enjoying_app")}
          </p>
          <div className="rate-stars">
            {[5, 4, 3, 2, 1].map(v => (
              <button
                key={v}
                className="rate-star"
                title={`${v} star${v > 1 ? "s" : ""}`}
                onClick={() => rate(v)}
              >
                <svg viewBox="0 0 576 512"><path d={STAR_PATH} /></svg>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
