import {
  createMonitorForOperator,
  monitorResponse,
  monitorServiceForRequest,
  readJson,
  readMonitors,
} from "@/services/monitor/monitorCustomerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const service = await monitorServiceForRequest();
  return monitorResponse(() => readMonitors(service));
}

export async function POST(request: Request) {
  const service = await monitorServiceForRequest();
  const body = await readJson(request);
  return monitorResponse(() => createMonitorForOperator(service, body));
}
