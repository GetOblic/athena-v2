import {
  monitorResponse,
  monitorServiceForRequest,
  readJob,
} from "@/services/monitor/monitorCustomerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const service = await monitorServiceForRequest();
  return monitorResponse(() => readJob(service, jobId));
}
