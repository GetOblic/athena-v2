import {
  monitorResponse,
  monitorServiceForRequest,
  readJson,
  refilterJob,
} from "@/services/monitor/monitorCustomerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const service = await monitorServiceForRequest();
  const body = await readJson(request);
  return monitorResponse(() => refilterJob(service, jobId, body));
}
