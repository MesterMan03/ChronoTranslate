import { useEffect } from "react";
import { Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navbar } from "./components/Navbar.tsx";
import { ProjectList } from "./pages/ProjectList.tsx";
import { ProjectView } from "./pages/ProjectView.tsx";
import { FileView } from "./pages/FileView.tsx";
import { useAuthStore } from "./store.ts";
import { api } from "./api.ts";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
});

function AuthLoader({ children }: { children: React.ReactNode }) {
  const { setUser } = useAuthStore();

  useEffect(() => {
    api.me().then((user) => setUser(user));
  }, [setUser]);

  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthLoader>
        <div className="min-h-screen flex flex-col">
          <Navbar />
          <main className="flex-1 w-full">
            <Routes>
              <Route path="/" element={<ProjectList />} />
              <Route path="/projects/:id" element={<ProjectView />} />
              <Route path="/projects/:id/files/:fileId" element={<FileView />} />
            </Routes>
          </main>
        </div>
      </AuthLoader>
    </QueryClientProvider>
  );
}
