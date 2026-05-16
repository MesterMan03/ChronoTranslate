import { useAuthStore } from "../store.ts";

export function Navbar() {
  const { user } = useAuthStore();

  return (
    <nav className="h-12 border-b border-white/10 flex items-center px-6 gap-4 bg-black/20">
      <span className="font-bold text-sm text-white/80">ChronoTranslate</span>
      <div className="flex-1" />
      {user ? (
        <div className="flex items-center gap-3">
          {user.avatarUrl && (
            <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
          )}
          <span className="text-sm text-white/60">{user.username}</span>
          <span className="text-xs bg-white/10 px-2 py-0.5 rounded">{user.role}</span>
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
