'use client';

import { motion } from 'motion/react';
import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useLanguage } from "../../context/LanguageContext";
import { TopGameEntry } from "../TopGamesByPlaytimeSection";
import { SectionHeader } from "../SectionHeader";
import { GameIcon } from "../GameIcon";

interface SessionBentoProps {
  className?: string;
  weekStats: { sessCount: number; timeStr: string };
  graphData: { day: string; sessions: number }[];
  topGames: TopGameEntry[];
  /** Real launch-readiness checks shown in the "System status" card. */
  status: {
    multiInstance: boolean | null;
    bootstrapper: { enabled: boolean; installed: boolean | null; version?: string | null };
    logins: { ready: number; total: number };
  };
}

export default function SessionBento({ weekStats, graphData, topGames, status }: SessionBentoProps) {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const { t } = useLanguage();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      
      {/* Bento Top Row: 2 Cols Session Activity + 1 Col Session Health */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        
        {/* Card 1: Session Activity Chart */}
        <div
          onMouseEnter={() => setHoveredCard(1)}
          onMouseLeave={() => setHoveredCard(null)}
          style={{
            background: "var(--g01)",
            border: `1px solid ${hoveredCard === 1 ? "var(--g08)" : "var(--g05)"}`,
            borderRadius: 14,
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            transition: "all .2s ease",
            boxShadow: hoveredCard === 1 ? "0 8px 24px rgba(0,0,0,0.3)" : "none",
          }}
        >
          {/* Header */}
          <SectionHeader
            dotColor="var(--amber)"
            dotShadow="0 0 8px rgba(245,158,11,0.5)"
            title={t("session_activity")}
            style={{ marginBottom: 12 }}
            trailing={
              <span style={{ fontSize: 11, color: "var(--t2)", fontWeight: 700 }}>
                {weekStats.sessCount} {t("sessions_plural")} · {weekStats.timeStr}
              </span>
            }
          />

          {/* Recharts Area Graph */}
          <div style={{ height: 110, width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={graphData} margin={{ top: 6, right: 6, left: -26, bottom: 0 }}>
                <defs>
                  <linearGradient id="reiyaBentoGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-line)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--chart-line)" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--g03)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "var(--t3)", fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--t3)", fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--modal-bg)", border: "1px solid var(--g07)", borderRadius: 10, fontSize: 11 }}
                  labelStyle={{ color: "var(--t2)", fontWeight: 700 }}
                  itemStyle={{ color: "var(--amber)", fontWeight: 800 }}
                  formatter={(v) => [`${v ?? 0} ${t("sessions_plural")}`, t("sessions_plural")]}
                />
                <Area
                  type="monotone"
                  dataKey="sessions"
                  stroke="var(--chart-line)"
                  strokeWidth={2}
                  fill="url(#reiyaBentoGradient)"
                  dot={{ fill: "var(--chart-line)", r: 3, strokeWidth: 0 }}
                  activeDot={{ fill: "var(--chart-line)", r: 5, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card 2: System status — real checks, not decoration */}
        <div
          onMouseEnter={() => setHoveredCard(2)}
          onMouseLeave={() => setHoveredCard(null)}
          style={{
            background: "var(--g01)",
            border: `1px solid ${hoveredCard === 2 ? "var(--g08)" : "var(--g05)"}`,
            borderRadius: 14,
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            transition: "all .2s ease",
            boxShadow: hoveredCard === 2 ? "0 8px 24px rgba(0,0,0,0.3)" : "none",
          }}
        >
          {(() => {
            const rows: { name: string; val: string; pct: number; tone: "ok" | "warn" | "off" | "unknown" }[] = [
              {
                name: "Multi-instance",
                val: status.multiInstance === null ? "Unknown" : status.multiInstance ? "On" : "Off",
                pct: status.multiInstance ? 100 : 0,
                tone: status.multiInstance === null ? "unknown" : status.multiInstance ? "ok" : "warn",
              },
              {
                name: "Bootstrapper",
                val: !status.bootstrapper.enabled ? "Not used"
                  : status.bootstrapper.installed === null ? "Checking…"
                  : status.bootstrapper.installed ? (status.bootstrapper.version ? `v${status.bootstrapper.version.replace(/^version-/, "").slice(0, 10)}` : "Installed")
                  : "Not installed",
                pct: !status.bootstrapper.enabled ? 0 : status.bootstrapper.installed ? 100 : 0,
                tone: !status.bootstrapper.enabled ? "off" : status.bootstrapper.installed === null ? "unknown" : status.bootstrapper.installed ? "ok" : "warn",
              },
              {
                name: "Account logins",
                val: status.logins.total === 0 ? "No accounts" : `${status.logins.ready}/${status.logins.total} working`,
                pct: status.logins.total === 0 ? 0 : (status.logins.ready / status.logins.total) * 100,
                tone: status.logins.total === 0 ? "off" : status.logins.ready === status.logins.total ? "ok" : "warn",
              },
            ];
            const toneColor = { ok: "var(--green)", warn: "var(--amber)", off: "var(--t3)", unknown: "var(--t3)" };
            const anyWarn = rows.some(r => r.tone === "warn");
            return (
              <>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 900, color: "var(--t3)", letterSpacing: "0.1em" }}>SYSTEM STATUS</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9.5, fontWeight: 800, color: anyWarn ? "var(--amber)" : "var(--green)" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: anyWarn ? "var(--amber)" : "var(--green)" }} />
                      {anyWarn ? "NEEDS ATTENTION" : "ALL GOOD"}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>Launch readiness</div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 12 }}>
                  {rows.map((st, idx) => (
                    <div key={st.name} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, fontWeight: 700 }}>
                        <span style={{ color: "var(--t2)" }}>{st.name}</span>
                        <span style={{ color: toneColor[st.tone] }}>{st.val}</span>
                      </div>
                      <div style={{ display: "flex", gap: 2 }}>
                        {Array.from({ length: 12 }).map((_, j) => {
                          const filled = j < Math.round((st.pct / 100) * 12);
                          return (
                            <motion.div
                              key={j}
                              style={{ height: 5, flex: 1, borderRadius: 1, background: filled ? toneColor[st.tone] : "var(--g05)" }}
                              animate={hoveredCard === 2 && filled ? { opacity: [0.5, 1, 0.5] } : { opacity: filled ? 0.75 : 1 }}
                              transition={{ duration: 0.5, delay: idx * 0.1 + j * 0.02 }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>

      </div>

      {/* Bento Bottom Row: Top Games by Playtime */}
      {topGames.length > 0 && (
        <div
          onMouseEnter={() => setHoveredCard(3)}
          onMouseLeave={() => setHoveredCard(null)}
          style={{
            background: "var(--g01)",
            border: `1px solid ${hoveredCard === 3 ? "var(--g08)" : "var(--g05)"}`,
            borderRadius: 14,
            padding: "16px 20px",
            transition: "all .2s ease",
            boxShadow: hoveredCard === 3 ? "0 8px 24px rgba(0,0,0,0.3)" : "none",
          }}
        >
          <SectionHeader
            dotColor="#818cf8"
            dotShadow="0 0 8px rgba(129,140,248,0.5)"
            title={t("top_games")}
            style={{ marginBottom: 14 }}
            trailing={
              <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600 }}>
                {t("by_total_playtime_lbl")}
              </span>
            }
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {topGames.slice(0, 6).map((g, i) => {
              const maxMin = topGames[0].minutes;
              const pct = maxMin > 0 ? (g.minutes / maxMin) * 100 : 0;
              const hrs = Math.floor(g.minutes / 60);
              const mins = g.minutes % 60;
              const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
              const rankColors = ["#F59E0B", "#94A3B8", "#CD7C39", "var(--t3)", "var(--t3)", "var(--t3)"];

              return (
                <div
                  key={g.name + i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 12px",
                    background: "var(--g02)",
                    borderRadius: 10,
                    border: "1px solid var(--g04)",
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 900, color: rankColors[i] || "var(--t3)", width: 16, textAlign: "center", flexShrink: 0 }}>
                    #{i + 1}
                  </span>
                  <div style={{ width: 32, height: 32, borderRadius: 7, overflow: "hidden", flexShrink: 0 }}>
                    <GameIcon placeId={g.placeId} urls={[g.thumbnailUrl]} placeholderSize={14} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.name}
                      </span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--t2)", flexShrink: 0, marginLeft: 6 }}>
                        {timeStr}
                      </span>
                    </div>
                    <div style={{ height: 4, borderRadius: 99, background: "var(--g05)", overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          borderRadius: 99,
                          background: i === 0 ? "linear-gradient(90deg, #818cf8, #a78bfa)" : "var(--g18)",
                          transition: "width 0.6s ease",
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 9, color: "var(--t3)", marginTop: 2, display: "block" }}>
                      {g.sessions} {g.sessions === 1 ? t("session") : t("sessions_plural")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
