export type AppProcessRole = "combined" | "web" | "worker";

export function appProcessRole(): AppProcessRole {
  const role = process.env.APP_PROCESS_ROLE?.trim() || "combined";
  if (role === "combined" || role === "web" || role === "worker") return role;
  throw new Error("APP_PROCESS_ROLE must be combined, web, or worker.");
}

export function backgroundWorkersEnabled(): boolean {
  return appProcessRole() !== "web";
}
