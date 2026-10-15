import { createFileRoute } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ChatApp } from "@/components/seat/ChatApp";
import { LoginScreen } from "@/components/seat/LoginScreen";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper">
        <p className="text-sm text-muted">正在确认席位…</p>
      </main>
    );
  }
  if (!user) return <LoginScreen next="/" />;
  return <ChatApp />;
}
