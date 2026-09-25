/** Package fields when first booking a session or client request. */
export function resolveNewSessionPackageFields(packageSessionCount?: number | null): {
  num_sessions: number;
  session_no: number;
} {
  const num_sessions = Math.max(1, packageSessionCount ?? 1);
  return { num_sessions, session_no: 1 };
}
