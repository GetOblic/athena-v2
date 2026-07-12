import { hostname } from "os";
import { randomUUID } from "crypto";

export function createWorkerIdentity(): string {
  return `athena-worker:${hostname()}:${process.pid}:${randomUUID()}`;
}
