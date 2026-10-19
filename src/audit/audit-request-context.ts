import { AsyncLocalStorage } from "node:async_hooks";

export type AuditRequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export const auditRequestContext =
  new AsyncLocalStorage<AuditRequestContext>();
