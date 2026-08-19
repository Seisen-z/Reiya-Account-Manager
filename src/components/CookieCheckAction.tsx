import { FC } from "react";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import { ShieldCheckIcon, AlertTriangleIcon, LoaderIcon, RefreshIcon } from "./Icons";

export type CookieCheckStatus = "idle" | "checking" | "error";

export const CookieCheckAction: FC<{
  status: CookieCheckStatus;
  invalidCount: number;
  label: string;
  checkingLabel: string;
  onRun: () => void;
}> = ({ status, invalidCount, label, checkingLabel, onRun }) => {
  if (status === "idle") {
    return (
      <button onClick={onRun} className="btn btn-ghost glow-btn"
        style={{ padding: "7px 12px", borderRadius: 8, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", gap: 5 }}>
        <ShieldCheckIcon size={11} /> {label}
      </button>
    );
  }

  const errorText = `${invalidCount} ${invalidCount === 1 ? "cookie" : "cookies"} invalid`;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <MotionConfig transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}>
        <motion.div
          layout
          initial={false}
          style={{
            position: "relative", zIndex: 1, display: "flex", alignItems: "center",
            overflow: "hidden", borderRadius: 99, padding: "6px 12px",
            border: "1px solid var(--g07)",
            background: status === "error" ? "var(--red-dim)" : "var(--g03)",
          }}
        >
          <AnimatePresence mode="popLayout">
            <motion.div
              layout
              key={status}
              initial={{ opacity: 0, scale: 0.4, filter: "blur(2px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.4, filter: "blur(2px)" }}
              transition={{ type: "spring", bounce: 0, duration: 0.25 }}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              {status === "error"
                ? <AlertTriangleIcon size={12} color="var(--red)" />
                : <LoaderIcon size={12} color="var(--t2)" style={{ animation: "spin 1s linear infinite" }} />
              }
              <span style={{
                fontSize: 11, fontWeight: 800,
                color: status === "error" ? "var(--red)" : "var(--t2)",
                whiteSpace: "nowrap",
              }}>
                {status === "error" ? errorText : checkingLabel}
              </span>
            </motion.div>
          </AnimatePresence>
        </motion.div>

        <AnimatePresence mode="popLayout">
          {status === "error" && (
            <motion.button
              initial={{ opacity: 0, x: -14, scale: 0.7 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -14, scale: 0.7 }}
              transition={{ type: "spring", stiffness: 320, damping: 22 }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={onRun}
              title="Retry"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 26, height: 26, borderRadius: "50%", marginLeft: 6,
                border: "none", background: "var(--g10)", color: "var(--t1)", cursor: "pointer",
              }}
            >
              <RefreshIcon size={11} />
            </motion.button>
          )}
        </AnimatePresence>
      </MotionConfig>
    </div>
  );
};
