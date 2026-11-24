import {
  enqueueForOperator,
  monitorResponse,
  monitorServiceForRequest,
  readJobs,
  readJson,
} from "@/services/monitor/monitorCustomerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const service = await monitorServiceForRequest();
  return monitorResponse(() => readJobs(service, id));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const service = await monitorServiceForRequest();
  const body = await readJson(request);
  return monitorResponse(() => enqueueForOperator(service, id, body));
}
