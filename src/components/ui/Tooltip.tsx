import React, { useState, useRef, useEffect, FC } from "react";
import ReactDOM from "react-dom";
import { motion, AnimatePresence } from "motion/react";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const Tooltip: FC<TooltipProps> = ({
  content,
  children,
  position = "top",
  delay = 100,
  className,
  style,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateCoords = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    let top = 0;
    let left = 0;

    if (position === "top") {
      top = rect.top - 8;
      left = rect.left + rect.width / 2;
    } else if (position === "bottom") {
      top = rect.bottom + 8;
      left = rect.left + rect.width / 2;
    } else if (position === "left") {
      top = rect.top + rect.height / 2;
      left = rect.left - 8;
    } else if (position === "right") {
      top = rect.top + rect.height / 2;
      left = rect.right + 8;
    }

    setCoords({ top, left });
  };

  const handleMouseEnter = () => {
    updateCoords();
    timeoutRef.current = setTimeout(() => {
      updateCoords();
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  useEffect(() => {
    if (isVisible) {
      window.addEventListener("scroll", updateCoords, true);
      window.addEventListener("resize", updateCoords);
      return () => {
        window.removeEventListener("scroll", updateCoords, true);
        window.removeEventListener("resize", updateCoords);
      };
    }
  }, [isVisible]);

  const getTransform = () => {
    switch (position) {
      case "bottom":
        return "translate(-50%, 0)";
      case "left":
        return "translate(-100%, -50%)";
      case "right":
        return "translate(0, -50%)";
      case "top":
      default:
        return "translate(-50%, -100%)";
    }
  };

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      style={{ display: "inline-flex", alignItems: "center", ...style }}
      className={className}
    >
      {children}
      {typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <AnimatePresence>
            {isVisible && content && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                style={{
                  position: "fixed",
                  top: coords.top,
                  left: coords.left,
                  transform: getTransform(),
                  zIndex: 99999,
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                  padding: "4px 9px",
                  borderRadius: 6,
                  background: "rgba(18, 20, 26, 0.96)",
                  backdropFilter: "blur(14px)",
                  border: "1px solid var(--g07)",
                  color: "var(--t1)",
                  fontSize: 10.5,
                  fontWeight: 700,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.7), 0 0 1px rgba(255,255,255,0.15)",
                  lineHeight: 1.3,
                }}
              >
                {content}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};

export default Tooltip;
