import { useState, useEffect, useMemo, type FC } from "react";
import { motion, AnimatePresence, MotionConfig, type Transition } from "motion/react";
import { PinIcon, ChevronsUpDownIcon } from "./Icons";

export interface PinnableAccount {
  user_id: number;
  username: string;
  display_name: string;
  avatar_url: string;
}

const springConfig: Transition = { type: "spring", stiffness: 400, damping: 40 };

export const PinnedAccountsHero: FC<{
  accounts: PinnableAccount[];
  onSelect: (userId: number) => void;
}> = ({ accounts, onSelect }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(i => Math.min(i, Math.max(accounts.length - 1, 0)));
  }, [accounts.length]);

  const current = accounts[activeIndex];

  const shuffle = () => {
    if (accounts.length === 0) return;
    const next = (activeIndex + 1) % accounts.length;
    setActiveIndex(next);
    onSelect(accounts[next].user_id);
  };

  const initials = useMemo(() => current?.username?.slice(0, 2).toUpperCase() ?? "", [current]);

  if (accounts.length === 0) return null;

  return (
    <MotionConfig transition={springConfig}>
      <motion.div
        layout
        className="overflow-hidden"
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        style={{ padding: "6px 14px 12px" }}
      >
        <AnimatePresence mode="popLayout">
          <motion.div
            key="pinned-hero"
            layout
            initial={{ opacity: 0, scale: 0.8, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -12 }}
            onClick={shuffle}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 10, borderRadius: 12, padding: "8px 10px",
              background: "var(--g03)", border: "1px solid var(--g06)", cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
              <div style={{
                position: "relative", flexShrink: 0,
                width: 30, height: 30, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "var(--surface-3)", overflow: "hidden",
              }}>
                {current.avatar_url
                  ? <img src={current.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: 10, fontWeight: 800, color: "var(--t2)" }}>{initials}</span>
                }
                <div style={{
                  position: "absolute", bottom: -2, right: -2,
                  width: 14, height: 14, borderRadius: "50%",
                  background: "var(--g08)", border: "2px solid var(--panel-bg)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <PinIcon size={7} color="#FBBF24" fill="#FBBF24" />
                </div>
              </div>
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={current.user_id}
                  initial={{ opacity: 0, scale: 0.7, filter: "blur(8px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.7, filter: "blur(8px)" }}
                  transition={{ duration: 0.45, type: "spring", bounce: 0 }}
                  style={{
                    fontSize: 12, fontWeight: 800, color: "var(--t1)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {current.display_name || current.username}
                </motion.span>
              </AnimatePresence>
            </div>

            {accounts.length > 1 && (
              <motion.div
                whileTap={{ scale: 0.9 }}
                style={{
                  flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  width: 22, height: 22, borderRadius: "50%",
                  background: "var(--g05)", color: "var(--t3)",
                }}
              >
                <ChevronsUpDownIcon size={12} />
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </MotionConfig>
  );
};
