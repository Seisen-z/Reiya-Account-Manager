import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import { SectionHeader } from "./SectionHeader";

export interface TopGameEntry {
  placeId: string;
  name: string;
  minutes: number;
  sessions: number;
  thumbnailUrl?: string;
}

export const TopGamesByPlaytimeSection: FC<{
  topGames: TopGameEntry[];
  first?: boolean;
}> = ({ topGames, first }) => {
  const { t } = useLanguage();
  if (topGames.length === 0) return null;
  return (
    <div style={first ? undefined : { marginTop: 24, borderTop: "1px solid var(--g05)", paddingTop: 24 }}>
      <div className="glass-container" style={{ padding: 16 }}>
        <SectionHeader
          dotColor="#818cf8"
          dotShadow="0 0 6px rgba(129,140,248,0.5)"
          title={t("top_games")}
          style={{ marginBottom: 12 }}
          trailing={<span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600 }}>{t("by_total_playtime_lbl")}</span>}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {topGames.map((g, i) => {
            const maxMin = topGames[0].minutes;
            const pct = maxMin > 0 ? (g.minutes / maxMin) * 100 : 0;
            const hrs = Math.floor(g.minutes / 60);
            const mins = g.minutes % 60;
            const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
            const rankColors = ["#f59e0b", "#94a3b8", "#cd7c39", "var(--t3)", "var(--t3)", "var(--t3)"];
            return (
              <div key={g.name + i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: rankColors[i], width: 14, textAlign: "center", flexShrink: 0 }}>{i + 1}</span>
                {g.thumbnailUrl ? (
                  <img src={g.thumbnailUrl} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--g04)", flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>{g.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "var(--t2)", flexShrink: 0 }}>{timeStr}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 99, background: "var(--g05)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: i === 0 ? "linear-gradient(90deg, #818cf8, #a78bfa)" : "var(--g18)", transition: "width 0.6s ease" }} />
                  </div>
                  <span style={{ fontSize: 9, color: "var(--t3)", marginTop: 2, display: "block" }}>{g.sessions} {g.sessions === 1 ? t("session") : t("sessions_plural")}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
