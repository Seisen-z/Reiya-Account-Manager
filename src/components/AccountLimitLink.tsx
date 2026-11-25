import { Link } from "react-router-dom";

export function isFreeAccountLimit(error: string | null | undefined) {
  return error?.includes("Free plan account limit reached.") ?? false;
}

export function AccountLimitLink() {
  return (
    <Link to="/premium" className="btn btn-ghost" style={{ display: "inline-flex", margin: "6px 0" }}>
      View Reiya Premium
    </Link>
  );
}
