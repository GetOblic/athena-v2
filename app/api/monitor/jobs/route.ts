import {
  monitorResponse,
  monitorServiceForRequest,
  readJobs,
} from "@/services/monitor/monitorCustomerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const service = await monitorServiceForRequest();
  return monitorResponse(() => readJobs(service, null));
}
