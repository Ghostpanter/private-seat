import { useState } from "react";
import { Lock } from "lucide-react";
import { GROK_PROVIDERS, authClient, signIn } from "@/lib/auth/client";

const BEARER_KEY = "grok-auth.bearer-token";

function rememberBearer(token: string | null) {
  if (!token) return;
  try {
    sessionStorage.setItem(BEARER_KEY, token);
  } catch {
    /* storage unavailable */
  }
}

function mapAuthError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("exist") || text.includes("already")) return "这个邮箱已经注册过了，直接登录即可。";
  if (text.includes("password") && text.includes("short")) return "密码至少 8 位。";
  if (text.includes("invalid") || text.includes("credential") || text.includes("password")) {
    return "邮箱或密码不对。";
  }
  return "没有成功，请再试一次。";
}

export function LoginScreen({ next, code }: { next: string; code?: string }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (mode === "up" && name.trim().length < 1) {
      setError("写一个称呼，朋友列表里会显示它，不会显示对话。");
      return;
    }
    if (password.length < 8) {
      setError("密码至少 8 位。");
      return;
    }
    setPending(true);
    try {
      const fetchOptions = {
        onSuccess: (ctx: { response: Response }) => {
          rememberBearer(ctx.response.headers.get("set-auth-token"));
        },
      };
      const result =
        mode === "up"
          ? await authClient.signUp.email({
              name: name.trim(),
              email: email.trim(),
              password,
              fetchOptions,
            })
          : await authClient.signIn.email({
              email: email.trim(),
              password,
              fetchOptions,
            });
      if (result.error) {
        setError(mapAuthError(result.error.message ?? ""));
        setPending(false);
        return;
      }
      try {
        await authClient.getSession();
      } catch {
        /* the next navigation reloads the session */
      }
      window.location.assign(next);
    } catch (err) {
      setError(mapAuthError(err instanceof Error ? err.message : ""));
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-dvh bg-paper md:grid-cols-2">
      <section className="hidden flex-col justify-between bg-ink px-12 py-12 text-paper md:flex">
        <div>
          <p className="font-serif text-4xl font-medium tracking-tight">分席</p>
          <p className="mt-3 max-w-sm text-mist">把 Grok 分给朋友。对话各坐各的。</p>
        </div>
        <ul className="max-w-sm space-y-6">
          <li>
            <p className="text-sm font-medium">同一个 Grok</p>
            <p className="mt-1 text-sm text-mist">朋友用的是你的额度，不是另一个模型。</p>
          </li>
          <li>
            <p className="text-sm font-medium">记录不互通</p>
            <p className="mt-1 text-sm text-mist">每段对话只属于登录的那个人。席主也读不到内容。</p>
          </li>
          <li>
            <p className="text-sm font-medium">邀请才进得来</p>
            <p className="mt-1 text-sm text-mist">没有邀请码的人打不开对话，避免额度被陌生人用掉。</p>
          </li>
        </ul>
        <p className="flex items-center gap-2 text-sm text-mist">
          <Lock className="size-4" aria-hidden="true" />
          互相不可见
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="md:hidden">
            <p className="font-serif text-3xl font-medium tracking-tight">分席</p>
            <p className="mt-2 text-sm text-muted">把 Grok 分给朋友。对话各坐各的，谁也看不见谁。</p>
          </div>

          <h1 className="mt-8 font-serif text-2xl font-medium tracking-tight md:mt-0">
            {mode === "in" ? "登录你的席位" : "开一个席位"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {code
              ? `登录后会自动使用邀请码 ${code}。`
              : "用邮箱即可。Google 和 X 也可以。"}
          </p>

          <div className="mt-6 grid grid-cols-2 rounded-lg bg-wash p-1">
            <button
              type="button"
              onClick={() => {
                setMode("in");
                setError(null);
              }}
              className={`min-h-11 rounded-sm text-sm font-medium ${mode === "in" ? "bg-card text-ink" : "text-muted"}`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("up");
                setError(null);
              }}
              className={`min-h-11 rounded-sm text-sm font-medium ${mode === "up" ? "bg-card text-ink" : "text-muted"}`}
            >
              注册
            </button>
          </div>

          <form onSubmit={submit} className="mt-5 space-y-3">
            {mode === "up" ? (
              <label className="block text-sm">
                <span className="text-muted">称呼</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  maxLength={40}
                  className="mt-1 min-h-11 w-full rounded-sm border border-line bg-card px-3 text-ink"
                />
              </label>
            ) : null}
            <label className="block text-sm">
              <span className="text-muted">邮箱</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                className="mt-1 min-h-11 w-full rounded-sm border border-line bg-card px-3 text-ink"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted">密码</span>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                minLength={8}
                className="mt-1 min-h-11 w-full rounded-sm border border-line bg-card px-3 text-ink"
              />
            </label>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="min-h-11 w-full rounded-sm bg-ink px-4 text-sm font-medium text-paper disabled:opacity-60"
            >
              {pending ? "请稍等…" : mode === "in" ? "进入" : "注册并进入"}
            </button>
          </form>

          <div className="mt-6 flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-line" />
            或
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="mt-4 space-y-2">
            {GROK_PROVIDERS.map((provider) => (
              <button
                key={provider.providerId}
                type="button"
                onClick={() => {
                  void signIn(provider.providerId, { callbackURL: next }).catch(() => {
                    setError("登录窗口没有打开。");
                  });
                }}
                className="min-h-11 w-full rounded-sm border border-line bg-card px-4 text-sm font-medium"
              >
                用 {provider.label} 继续
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
