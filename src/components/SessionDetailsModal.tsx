import { FC } from "react";
import { HomeModal, SessionElapsed, Session } from "../pages/Home";
import { GamepadIcon } from "./Icons";

export const SessionDetailsModal: FC<{
  session: Session | null;
  onClose: () => void;
  onCopyPid: () => void;
}> = ({ session, onClose, onCopyPid }) => {
  if (!session) return null;
  return (
    <HomeModal title="Session Details" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          {session.avatar_url
            ? <img src={session.avatar_url} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
            : <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center" }}><GamepadIcon size={24} color="var(--t2)" /></div>
          }
          <span style={{ position: "absolute", bottom: 2, right: 2, width: 12, height: 12, borderRadius: "50%", background: "var(--green)", border: "2px solid var(--modal-bg)", animation: "pulse-glow 2s ease-in-out infinite" }} />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "var(--t1)" }}>{session.username ?? "Unknown"}</div>
          <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 3 }}>{session.game_name ?? `PID ${session.pid}`}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" }}>
          <div style={{ background: "var(--g03)", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 800, letterSpacing: "0.06em" }}>PID</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: "var(--t1)", marginTop: 2 }}>{session.pid}</div>
          </div>
          <div style={{ background: "var(--g03)", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 800, letterSpacing: "0.06em" }}>ELAPSED</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: "var(--green)", marginTop: 2 }}>
              <SessionElapsed startTime={session.start_time} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 6 }}>
          <button onClick={onCopyPid}
            className="btn btn-ghost" style={{ flex: 1 }}>
            Copy PID
          </button>
          <button onClick={onClose} className="btn"
            style={{ flex: 1, background: "#FFFFFF", color: "#000", fontWeight: 800 }}>
            Close
          </button>
        </div>
      </div>
    </HomeModal>
  );
};
