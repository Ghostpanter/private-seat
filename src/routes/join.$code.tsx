import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { redeemInvite } from "@/lib/seat/api";
import { LoginScreen } from "@/components/seat/LoginScreen";

export const Route = createFileRoute("/join/$code")({ component: JoinPage });

function JoinPage() {
  const { code } = Route.useParams();
  const normalized = code.trim().toUpperCase();
  const next = `/join/${normalized}`;
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void redeemInvite({ data: { code: normalized } })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        void navigate({ to: "/", replace: true });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "邀请码没有用上");
      });
    return () => {
      cancelled = true;
    };
  }, [user, normalized, navigate]);

  if (isPending || (user && !error)) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-6 text-center">
        <p className="text-sm text-muted">{user ? "正在入席…" : "正在确认席位…"}</p>
      </main>
    );
  }

  if (!user) return <LoginScreen next={next} code={normalized} />;

  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-center">
      <div className="max-w-sm">
        <p className="font-serif text-3xl font-medium">分席</p>
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
        <a href="/" className="mt-6 inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline">
          回到首页
        </a>
      </div>
    </main>
  );
}
