import { useLanguage } from "../context/LanguageContext";
import { useUpdate } from "../context/UpdateContext";
import { CHANGELOG, ChangeKind } from "../data/changelog";

const KIND_STYLE: Record<ChangeKind, { label: string; color: string; bg: string }> = {
  new:      { label: "NEW",      color: "var(--green)", bg: "var(--green-dim)" },
  improved: { label: "IMPROVED", color: "#A78BFA",       bg: "rgba(167,139,250,0.10)" },
  fixed:    { label: "FIXED",    color: "var(--red)",   bg: "var(--red-dim)" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "Not yet released";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function Changelog() {
  const { t } = useLanguage();
  const { currentVersion } = useUpdate();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "18px 24px",
        borderBottom: "1px solid var(--g04)",
        background: "var(--g01)",
        backdropFilter: "blur(12px)",
        flexShrink: 0,
      }}>
        <h1 style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.06em", color: "var(--t1)", margin: 0 }}>
          {t("changelog")}
        </h1>
        <p style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", letterSpacing: "0.1em", marginTop: 3 }}>
          {t("changelog_subtitle")}
        </p>
      </div>

      {/* Timeline */}
      <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 40px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {CHANGELOG.map(release => {
            const isCurrent = currentVersion && release.version === currentVersion;
            return (
              <div
                key={release.version}
                className="card"
                style={{
                  padding: "16px 18px",
                  borderRadius: 14,
                  border: isCurrent ? "1px solid rgba(52,211,153,0.35)" : "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: "var(--t1)" }}>
                      {release.version === "Unreleased" ? "Upcoming" : `v${release.version}`}
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--t2)" }}>{release.title}</span>
                    {isCurrent && (
                      <span className="chip chip-green" style={{ fontSize: 9, padding: "2px 7px" }}>
                        CURRENT
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600, flexShrink: 0 }}>
                    {formatDate(release.date)}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                  {release.changes.map((c, i) => {
                    const style = KIND_STYLE[c.kind];
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <span style={{
                          flexShrink: 0,
                          fontSize: 9,
                          fontWeight: 800,
                          letterSpacing: "0.05em",
                          padding: "2px 7px",
                          borderRadius: 6,
                          color: style.color,
                          background: style.bg,
                          marginTop: 1,
                        }}>
                          {style.label}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.6 }}>{c.text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
