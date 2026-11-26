import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangleIcon } from "./Icons";

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions (remove, kill, delete). */
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * App-styled replacement for window.confirm().
 * Usage: const confirm = useConfirm(); if (await confirm({ title: "Remove?" , danger: true })) { ... }
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  // Fallback keeps things working if a component renders outside the provider.
  return ctx ?? (async (o: ConfirmOptions) => window.confirm(o.title));
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>(options => new Promise<boolean>(resolve => {
    setPending({ ...options, resolve });
  }), []);

  const close = useCallback((result: boolean) => {
    setPending(p => { p?.resolve(result); return null; });
  }, []);

  useEffect(() => {
    if (!pending) return;
    confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(false); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [pending, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          onMouseDown={e => { if (e.target === e.currentTarget) close(false); }}
          onClick={e => e.stopPropagation()}
          style={{
            position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            style={{
              width: 380, maxWidth: "100%", background: "var(--modal-bg)", border: "1px solid var(--modal-border)",
              borderRadius: 18, padding: 22, boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
              display: "flex", flexDirection: "column", gap: 14, animation: "fadeInSlideUp 0.16s ease",
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              {pending.danger && (
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--red-dim)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <AlertTriangleIcon size={16} color="var(--red)" />
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div id="confirm-dialog-title" style={{ fontSize: 14.5, fontWeight: 850, color: "var(--t1)", lineHeight: 1.35 }}>{pending.title}</div>
                {pending.message && <div style={{ fontSize: 12, color: "var(--t2)", marginTop: 6, lineHeight: 1.55 }}>{pending.message}</div>}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => close(false)}
                className="btn btn-ghost"
                style={{ padding: "8px 14px", borderRadius: 9, fontSize: 12, fontWeight: 800 }}
              >
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                ref={confirmBtnRef}
                onClick={() => close(true)}
                className="btn"
                style={{
                  padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 900, border: "none", cursor: "pointer",
                  background: pending.danger ? "var(--red)" : "#FFFFFF",
                  color: pending.danger ? "#fff" : "#07080a",
                }}
              >
                {pending.confirmLabel ?? "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
