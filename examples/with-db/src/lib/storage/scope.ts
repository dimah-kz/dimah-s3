/**
 * Demo scope resolver — reads the `demo-user` cookie and falls back to a
 * shared demo user. Replace with your real session lookup (Better Auth,
 * NextAuth, ...) returning `null` for unauthenticated requests.
 */
export function resolveScope(request: Request): string {
  const cookie = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)demo-user=([^;\s]+)/.exec(cookie);
  return `user:${match?.[1] ?? "demo"}`;
}
