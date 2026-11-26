import { openUrl } from "@tauri-apps/plugin-opener";
import { KOFI_URL } from "../lib/links";
import { useLanguage } from "../context/LanguageContext";

const KOFI_RED = "#FF5E5B";

/** Ko-fi coffee cup mark. */
export function KofiIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z" />
    </svg>
  );
}

/** Opens the Ko-fi page in the user's browser. */
export function openKofi() {
  void openUrl(KOFI_URL).catch(() => window.open(KOFI_URL, "_blank", "noopener"));
}

/**
 * "Support Reiya on Ko-fi" button.
 * - "sidebar": full-width compact button
 * - "banner": wider call-out with a short message
 */
export function KofiButton({ variant = "sidebar" }: { variant?: "sidebar" | "banner" }) {
  const { t } = useLanguage();

  if (variant === "banner") {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 14,
        background: "linear-gradient(135deg, rgba(255,94,91,0.12) 0%, var(--g01) 70%)",
        border: "1px solid rgba(255,94,91,0.3)",
      }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(255,94,91,0.15)", color: KOFI_RED, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <KofiIcon size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "var(--t1)" }}>{t("kofi_banner_title")}</div>
          <div style={{ fontSize: 11.5, color: "var(--t2)", marginTop: 3, lineHeight: 1.5 }}>{t("kofi_banner_body")}</div>
        </div>
        <button
          onClick={openKofi}
          style={{
            flexShrink: 0, display: "flex", alignItems: "center", gap: 7, height: 36, padding: "0 16px", borderRadius: 10,
            border: "none", background: KOFI_RED, color: "#fff", fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <KofiIcon size={14} /> {t("kofi_button")}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={openKofi}
      title={t("kofi_tip")}
      style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
        height: 32, marginBottom: 10, borderRadius: 9, cursor: "pointer", fontFamily: "inherit",
        border: "1px solid rgba(255,94,91,0.35)", background: "rgba(255,94,91,0.1)", color: KOFI_RED,
        fontSize: 11.5, fontWeight: 800, transition: "background .12s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,94,91,0.18)")}
      onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,94,91,0.1)")}
    >
      <KofiIcon size={13} /> {t("kofi_sidebar")}
    </button>
  );
}
