import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useSyncExternalStore } from "react";

interface LaunchOptions {
  userId: number;
  placeId: string | null;
  jobId: string | null;
  accessCode: string | null;
  useBootstrapper: boolean;
  gameName?: string | null;
  appMode?: boolean;
}

export type LaunchFeedback = { phase: "launching" | "requested" } | {
  phase: "failed";
  error: string;
  options: LaunchOptions;
};

let feedback: ReadonlyMap<number, LaunchFeedback> = new Map();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function publish(next: ReadonlyMap<number, LaunchFeedback>) {
  feedback = next;
  listeners.forEach(listener => listener());
}

function getFeedback() { return feedback; }

export function forgetAccountLaunch(userId: number) {
  if (!feedback.has(userId)) return;
  const next = new Map(feedback);
  next.delete(userId);
  publish(next);
}

async function launchAccount(options: LaunchOptions) {
  const { userId } = options;
  if (feedback.get(userId)?.phase === "launching") throw new Error("This account is already launching.");
  const pending: LaunchFeedback = { phase: "launching" };
  publish(new Map(feedback).set(userId, pending));
  try {
    await invoke("launch_account", { ...options });
    if (feedback.get(userId) === pending) publish(new Map(feedback).set(userId, { phase: "requested" }));
  } catch (error) {
    if (feedback.get(userId) === pending) {
      const reason = error instanceof Error ? error.message : String(error);
      publish(new Map(feedback).set(userId, { phase: "failed", error: reason || "Could not start Roblox.", options }));
    }
    throw error;
  }
}

async function retryLaunch(userId: number) {
  const last = feedback.get(userId);
  if (last?.phase === "failed") await launchAccount(last.options).catch(() => {});
}

export function useAccountLauncher() {
  const launchFeedback = useSyncExternalStore(subscribe, getFeedback);
  const launchingAccounts = useMemo(() => new Set(
    [...launchFeedback].filter(([, status]) => status.phase === "launching").map(([userId]) => userId),
  ), [launchFeedback]);

  return { launchAccount, launchingAccounts, launchFeedback, retryLaunch };
}

export function useObservedLaunchSessions(active: ReadonlySet<number>, launchFeedback: ReadonlyMap<number, LaunchFeedback>) {
  useEffect(() => {
    let next: Map<number, LaunchFeedback> | null = null;
    for (const id of active) {
      if (feedback.get(id)?.phase === "requested") {
        next ??= new Map(feedback);
        next.delete(id);
      }
    }
    if (next) publish(next);
  }, [active, launchFeedback]);
}
