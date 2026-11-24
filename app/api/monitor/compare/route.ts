import {
  compareJobs,
  monitorResponse,
  monitorServiceForRequest,
  readJson,
} from "@/services/monitor/monitorCustomerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const service = await monitorServiceForRequest();
  const body = await readJson(request);
  return monitorResponse(() => compareJobs(service, body));
}
