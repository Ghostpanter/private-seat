import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { LoginScreen } from "@/components/seat/LoginScreen";

type LoginSearch = { next: string };

function safeNext(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    next: safeNext(search.next),
  }),
  component: LoginPage,
});

function LoginPage() {
  const { next } = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper">
        <p className="text-sm text-muted">正在确认席位…</p>
      </main>
    );
  }
  if (user) return <Navigate to={next} />;
  return <LoginScreen next={next} />;
}
