import {
  monitorResponse,
  monitorServiceForRequest,
  readJson,
  readMonitor,
  updateMonitorForOperator,
} from "@/services/monitor/monitorCustomerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const service = await monitorServiceForRequest();
  return monitorResponse(() => readMonitor(service, id));
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const service = await monitorServiceForRequest();
  const body = await readJson(request);
  return monitorResponse(() => updateMonitorForOperator(service, id, body));
}
