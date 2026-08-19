import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import {
  PlayIcon,
  PlusIcon,
  TrashIcon,
  CheckIcon,
  XIcon,
  PowerIcon,
  AlertTriangleIcon,
} from "./Icons";
import { EventEntry, SessionRecord, timeAgo } from "../pages/Home";

const EVENT_COLORS: Record<string, string> = {
  launched:       "var(--green)",
  added:          "var(--accent)",
  removed:        "var(--red)",
  cookie_valid:   "var(--green)",
  cookie_expired: "var(--red)",
  killed:         "rgba(255, 255, 255, 0.4)",
  sync_failed:    "var(--amber)",
};

const EVENT_ICONS: Record<string, React.ReactNode> = {
  launched:       <PlayIcon size={10} />,
  added:          <PlusIcon size={10} />,
  removed:        <TrashIcon size={10} />,
  cookie_valid:   <CheckIcon size={10} />,
  cookie_expired: <XIcon size={10} />,
  killed:         <PowerIcon size={10} />,
  sync_failed:    <AlertTriangleIcon size={10} />,
};

function EventRow({ event }: { event: EventEntry }) {
  const { t } = useLanguage();
  const color = EVENT_COLORS[event.kind] ?? "var(--t3)";
  const icon  = EVENT_ICONS[event.kind]  ?? <span style={{ fontSize: 10 }}>•</span>;
  const rel   = timeAgo(new Date(event.timestamp), t);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", borderBottom: "1px solid var(--glass-line-2)" }}>
      <span style={{ color, display: "flex", alignItems: "center", justifyContent: "center", width: 14, flexShrink: 0 }}>{icon}</span>
      {event.avatar_url ? (
        <img src={event.avatar_url} alt="" style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
      ) : (
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--g03)", flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10.5, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {event.detail}
        </div>
      </div>
      <div style={{ fontSize: 9, color: "var(--t3)", flexShrink: 0 }}>{rel}</div>
    </div>
  );
}

function ActivityRow({ record }: { record: SessionRecord }) {
  const { t } = useLanguage();
  const dur = record.duration_minutes < 60
    ? `${record.duration_minutes}m`
    : `${Math.floor(record.duration_minutes / 60)}h ${record.duration_minutes % 60}m`;
  const ts = timeAgo(new Date(record.start_time), t);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", borderBottom: "1px solid var(--glass-line-2)" }}>
      {record.avatar_url ? (
        <img src={record.avatar_url} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
      ) : (
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--g03)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "var(--t2)", flexShrink: 0 }}>
          {record.username.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {record.username}
        </div>
        <div style={{ fontSize: 9.5, color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
          {record.game_name}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: "var(--t2)", fontWeight: 700 }}>{dur}</div>
        <div style={{ fontSize: 9, color: "var(--t3)", marginTop: 1 }}>{ts}</div>
      </div>
    </div>
  );
}

export const ActivityPanel: FC<{
  recentActivity: SessionRecord[];
  events: EventEntry[];
}> = ({ recentActivity, events }) => {
  const { t } = useLanguage();
  return (
    <div style={{ width: 252, borderLeft: "1px solid var(--glass-line)", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--panel-bg)", flexShrink: 0 }}>

      {/* Recent history — independently scrollable */}
      {recentActivity.length > 0 && (
        <div style={{ flexShrink: 0, borderBottom: "1px solid var(--glass-line-2)", padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <div style={{ width: 3, height: 10, background: "linear-gradient(180deg, #C4B5FD 0%, rgba(196,181,253,0.15) 100%)", borderRadius: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 9, fontWeight: 900, color: "var(--t3)", letterSpacing: "0.08em" }}>{t("recent_history")}</span>
          </div>
          <div className="scroll" style={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: 200, overflowY: "auto" }}>
            {recentActivity.map((r, i) => <ActivityRow key={i} record={r} />)}
          </div>
        </div>
      )}

      {/* Event log — independently scrollable, fills remaining space */}
      {events.length > 0 && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexShrink: 0 }}>
            <span className="section-dot" style={{ width: 5, height: 5, background: "#818CF8", boxShadow: "0 0 5px rgba(129,140,248,0.4)" }} />
            <span style={{ fontSize: 9, fontWeight: 900, color: "var(--t3)", letterSpacing: "0.08em" }}>{t("event_log")}</span>
            <span style={{ fontSize: 8.5, color: "var(--t3)", opacity: 0.5 }}>— {events.length}</span>
          </div>
          <div className="scroll" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" }}>
            {events.slice(0, 80).map((ev, i) => <EventRow key={i} event={ev} />)}
          </div>
        </div>
      )}

    </div>
  );
};
