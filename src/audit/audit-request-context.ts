import { AsyncLocalStorage } from "node:async_hooks";

export type AuditRequestContext = {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export const auditRequestContext = new AsyncLocalStorage<AuditRequestContext>();
