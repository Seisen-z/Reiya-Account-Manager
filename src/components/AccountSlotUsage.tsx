import { Link } from "react-router-dom";

export function AccountSlotUsage({ used, limit, premium }: { used: number; limit: number | null; premium: boolean | null }) {
  if (limit === null || premium) return null;
  return (
    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--t2)", marginTop: 3 }}>
      {premium === false ? used + " of " + limit + " accounts used" : "Free plan: " + limit + " accounts"}
      {premium === false && used >= limit && (
        <> <Link to="/premium" style={{ color: "var(--accent)", textDecoration: "underline" }}>View Premium</Link></>
      )}
    </div>
  );
}
