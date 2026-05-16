import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router";
import { useAuthStore } from "../store.ts";
import { api } from "../api.ts";

export function Navbar() {
  const { user } = useAuthStore();
  const location = useLocation();

  const canReview = user && (user.role === "reviewer" || user.role === "admin" || user.role === "superadmin");
  const isAdmin = user && (user.role === "admin" || user.role === "superadmin");

  const { data: countData } = useQuery({
    queryKey: ["pendingCount"],
    queryFn: () => api.pendingCount(),
    enabled: !!canReview,
    refetchInterval: 60_000,
  });

  const navLink = (to: string, label: string, badge?: number) => {
    const active = location.pathname === to;
    return (
      <Link
        to={to}
        className={`text-sm flex items-center gap-1.5 transition-colors ${
          active ? "text-white" : "text-white/40 hover:text-white/70"
        }`}
      >
        {label}
        {badge ? (
          <span className="bg-yellow-500/30 text-yellow-400 text-xs px-1.5 py-0.5 rounded-full leading-none">
            {badge}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <nav className="h-12 border-b border-white/10 flex items-center px-6 gap-4 bg-black/20 shrink-0">
      <Link to="/" className="font-bold text-sm text-white/80">
        ChronoTranslate
      </Link>

      {canReview && navLink("/review", "Review", countData?.total || undefined)}
      {isAdmin && navLink("/admin", "Admin")}

      <div className="flex-1" />

      {user ? (
        <div className="flex items-center gap-3">
          {user.avatarUrl && (
            <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
          )}
          <span className="text-sm text-white/60">{user.username}</span>
          <span className={`text-xs px-2 py-0.5 rounded border ${
            user.role === "superadmin"
              ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
              : user.role === "admin"
              ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
              : user.role === "reviewer"
              ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
              : "bg-white/5 text-white/40 border-white/10"
          }`}>
            {user.role}
          </span>
          <a
            href="/auth/logout"
            className="text-xs text-white/40 hover:text-white ml-2"
          >
            logout
          </a>
        </div>
      ) : (
        <a
          href="/auth/discord"
          className="text-sm bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded transition-colors"
        >
          Login with Discord
        </a>
      )}
    </nav>
  );
}
