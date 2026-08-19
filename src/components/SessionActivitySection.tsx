import { FC } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useLanguage } from "../context/LanguageContext";
import { SectionHeader } from "./SectionHeader";

export const SessionActivitySection: FC<{
  weekStats: { sessCount: number; timeStr: string };
  graphData: { day: string; sessions: number }[];
  first?: boolean;
}> = ({ weekStats, graphData, first }) => {
  const { t } = useLanguage();
  return (
    <div style={first ? undefined : { marginTop: 24, borderTop: "1px solid var(--g05)", paddingTop: 24 }}>
      <div className="glass-container" style={{ padding: 16 }}>
        <SectionHeader
          dotColor="var(--accent-2)"
          dotShadow="0 0 6px rgba(160,160,160,0.4)"
          title={t("session_activity")}
          style={{ marginBottom: 8 }}
          trailing={<span style={{ fontSize: 10.5, color: "var(--t2)", fontWeight: 600 }}>{weekStats.sessCount} {t("sessions_plural")} · {weekStats.timeStr}</span>}
        />
        <div style={{ height: 100 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={graphData} margin={{ top: 4, right: 4, left: -26, bottom: 0 }}>
              <defs>
                <linearGradient id="aG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-line)" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="var(--chart-line)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--g03)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "var(--t3)", fontSize: 9.5, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--t3)", fontSize: 9.5, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "var(--modal-bg)", border: "1px solid var(--modal-border)", borderRadius: 10, fontSize: 11 }}
                labelStyle={{ color: "var(--t2)", fontWeight: 700 }} itemStyle={{ color: "var(--t1)", fontWeight: 800 }}
                formatter={(v) => [`${v ?? 0} ${t("sessions_plural")}`, t("sessions_plural")]} />
              <Area type="monotone" dataKey="sessions" stroke="var(--chart-line)" strokeWidth={1.8}
                fill="url(#aG)" dot={{ fill: "var(--chart-line)", r: 3, strokeWidth: 0 }}
                activeDot={{ fill: "var(--chart-line)", r: 5, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
