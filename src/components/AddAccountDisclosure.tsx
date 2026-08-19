import { ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PlusIcon, XIcon } from "./Icons";

export interface AddAccountAction {
  icon: ReactNode;
  label: string;
  sub?: string;
  onClick: () => void;
}

export function AddAccountDisclosure({
  open,
  onOpenChange,
  label,
  title,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  title: string;
  actions: AddAccountAction[];
}) {
  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); onOpenChange(!open); }}
        className="btn glow-btn"
        style={{
          borderRadius: 8, padding: "7px 14px", fontSize: 11, fontWeight: 800,
          background: "#FFFFFF", color: "#07080a", border: "none",
          display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
        }}
      >
        <PlusIcon size={11} color="#07080a" /> {label}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, scale: 0.9, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -6, transition: { duration: 0.12 } }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.3 }}
            onClick={e => e.stopPropagation()}
            style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 9999,
              transformOrigin: "top right",
              width: 280, borderRadius: 16, padding: 4,
              background: "var(--modal-bg)", backdropFilter: "blur(16px)",
              border: "1px solid var(--modal-border)", boxShadow: "0 12px 36px rgba(0,0,0,.4)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--t1)" }}>
                {title}
              </span>
              <motion.button
                onClick={() => onOpenChange(false)}
                whileTap={{ scale: 0.9 }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 20, height: 20, borderRadius: "50%",
                  background: "var(--g08)", border: "none", cursor: "pointer",
                }}
              >
                <XIcon size={11} color="var(--t1)" />
              </motion.button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4 }}>
              {actions.map((a, i) => (
                <motion.button
                  key={i}
                  onClick={() => { a.onClick(); onOpenChange(false); }}
                  whileTap={{ scale: 0.96 }}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: 6, padding: "14px 8px", borderRadius: 12, border: "none", cursor: "pointer",
                    background: "var(--g02)", transition: "background-color .15s ease",
                    textAlign: "center",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--g05)"}
                  onMouseLeave={e => e.currentTarget.style.background = "var(--g02)"}
                >
                  <span style={{ display: "flex", color: "var(--t2)" }}>{a.icon}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--t1)", lineHeight: 1.25 }}>{a.label}</span>
                  {a.sub && <span style={{ fontSize: 8.5, color: "var(--t3)", lineHeight: 1.2 }}>{a.sub}</span>}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
