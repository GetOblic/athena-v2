import {
  cancelJob,
  monitorResponse,
  monitorServiceForRequest,
} from "@/services/monitor/monitorCustomerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const service = await monitorServiceForRequest();
  return monitorResponse(() => cancelJob(service, jobId));
}
