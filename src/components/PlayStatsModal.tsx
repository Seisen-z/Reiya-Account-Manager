import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import { HomeModal, SegmentedProgress, MetricTag } from "../pages/Home";

export interface PlayStatsRankRow {
  rank: number;
  name: string;
  sessionsLabel: string;
  timeText: string;
  pct: number;
}

export interface PlayStatsData {
  totalSessions: number;
  totalPlayTime: string;
  topAccount: string;
  byAccount: PlayStatsRankRow[];
  byGame: PlayStatsRankRow[];
}

export const PlayStatsModal: FC<{
  open: boolean;
  data: PlayStatsData;
  onClose: () => void;
}> = ({ open, data, onClose }) => {
  const { t } = useLanguage();
  if (!open) return null;
  return (
    <HomeModal title={t("play_stats")} onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Stat Summary Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <div style={{ background: "var(--g02)", border: "1px solid var(--g05)", borderRadius: 12, padding: "12px 16px" }}>
            <div style={{ fontSize: 9.5, color: "var(--t3)", fontWeight: 800, letterSpacing: "0.06em" }}>{t("total_playtime")}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--t1)", marginTop: 4 }}>{data.totalPlayTime}</div>
          </div>
          <div style={{ background: "var(--g02)", border: "1px solid var(--g05)", borderRadius: 12, padding: "12px 16px" }}>
            <div style={{ fontSize: 9.5, color: "var(--t3)", fontWeight: 800, letterSpacing: "0.06em" }}>{t("total_sessions")}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--t1)", marginTop: 4 }}>{data.totalSessions}</div>
          </div>
          <div style={{ background: "var(--g02)", border: "1px solid var(--g05)", borderRadius: 12, padding: "12px 16px" }}>
            <div style={{ fontSize: 9.5, color: "var(--t3)", fontWeight: 800, letterSpacing: "0.06em" }}>{t("top_account")}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 4 }} title={data.topAccount}>
              {data.topAccount}
            </div>
          </div>
        </div>

        {/* Rankings Lists Container */}
        <div className="scroll" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxHeight: "50vh", overflowY: "auto", paddingRight: 4 }}>

          {/* By Account */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 850, color: "var(--t2)", letterSpacing: "0.05em", paddingBottom: 8, borderBottom: "1px solid var(--glass-line)", marginBottom: 12 }}>{t("by_account")}</div>
            {data.byAccount.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--t3)", textAlign: "center", padding: 20 }}>{t("no_records_found")}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.byAccount.map((x) => (
                  <div key={x.name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 18, height: 18, borderRadius: "50%",
                          fontSize: 9.5, fontWeight: 900,
                          background: x.rank === 1 ? "#FFFFFF" : x.rank === 2 ? "rgba(255,255,255,0.6)" : x.rank === 3 ? "var(--g30)" : "var(--g06)",
                          color: x.rank <= 3 ? "#000" : "var(--t2)"
                        }}>
                          {x.rank}
                        </span>
                        <span style={{ fontWeight: 750, color: "var(--t1)" }}>{x.name}</span>
                      </div>
                      <span style={{ fontWeight: 800, color: "var(--t1)" }}>{x.timeText}</span>
                    </div>
                    {/* Segmented progress + session count tag */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <SegmentedProgress pct={x.pct} color={x.rank === 1 ? "#FFFFFF" : "var(--t2)"} />
                      <MetricTag label="S" value={x.sessionsLabel} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* By Game */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 850, color: "var(--t2)", letterSpacing: "0.05em", paddingBottom: 8, borderBottom: "1px solid var(--glass-line)", marginBottom: 12 }}>{t("by_game")}</div>
            {data.byGame.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--t3)", textAlign: "center", padding: 20 }}>{t("no_records_found")}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.byGame.map((x) => (
                  <div key={x.name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 18, height: 18, borderRadius: "50%",
                          fontSize: 9.5, fontWeight: 900,
                          background: x.rank === 1 ? "#FFFFFF" : x.rank === 2 ? "rgba(255,255,255,0.6)" : x.rank === 3 ? "var(--g30)" : "var(--g06)",
                          color: x.rank <= 3 ? "#000" : "var(--t2)"
                        }}>
                          {x.rank}
                        </span>
                        <span style={{ fontWeight: 750, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }} title={x.name}>
                          {x.name}
                        </span>
                      </div>
                      <span style={{ fontWeight: 800, color: "var(--t1)" }}>{x.timeText}</span>
                    </div>
                    {/* Segmented progress + session count tag */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <SegmentedProgress pct={x.pct} color={x.rank === 1 ? "#FFFFFF" : "var(--t2)"} />
                      <MetricTag label="S" value={x.sessionsLabel} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </HomeModal>
  );
};
