import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useFreeAccountLimit() {
  const [limit, setLimit] = useState<number | null>(null);
  useEffect(() => {
    let current = true;
    invoke<number>("get_free_account_limit").then(value => {
      if (current && Number.isSafeInteger(value) && value > 0) setLimit(value);
    }).catch(() => {});
    return () => { current = false; };
  }, []);
  return limit;
}

export function useAccountPlan() {
  const limit = useFreeAccountLimit();
  const [premium, setPremium] = useState<boolean | null>(null);

  useEffect(() => {
    let current = true;
    let pending = false;
    const check = async () => {
      if (pending) return;
      pending = true;
      try {
        const status = await invoke<{ premium: boolean }>("premium_status");
        if (current) setPremium(status.premium);
      } catch {
        if (current) setPremium(null);
      } finally {
        pending = false;
      }
    };
    const refresh = () => { void check(); };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return { limit, premium };
}
