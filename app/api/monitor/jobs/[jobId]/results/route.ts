import {
  monitorResponse,
  monitorServiceForRequest,
  readResults,
} from "@/services/monitor/monitorCustomerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const service = await monitorServiceForRequest();
  const params = new URL(request.url).searchParams;
  return monitorResponse(() => readResults(service, jobId, params));
}
