/**
 * Preview-only auth defaults. Server-only — never import this from the client.
 *
 * No client id or secret is stored here. Google / X sign-in uses
 * `GROK_AUTH_CLIENT_ID` and `GROK_AUTH_CLIENT_SECRET` when a deployer injects
 * them. Self-hosting uses email and password and does not need those two.
 */
export const PREVIEW_CLIENT_ID = "";
export const PREVIEW_CLIENT_SECRET = "";

/** The shared auth broker issuer (OIDC discovery lives under it). */
export const GROK_ISSUER_DEFAULT = "https://auth.grok.me";

/**
 * Host patterns a preview deployment may use. Better Auth checks the request
 * host against this list when `BETTER_AUTH_URL` is not set.
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
