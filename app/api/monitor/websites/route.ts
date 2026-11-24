import {
  createBoundedCategoryDiscoverer,
  inspectWebsite,
  monitorResponse,
  monitorServiceForRequest,
  readJson,
} from "@/services/monitor/monitorCustomerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const service = await monitorServiceForRequest();
  const body = await readJson(request);
  const discover = body.refresh === true ? await createBoundedCategoryDiscoverer() : undefined;
  return monitorResponse(() => inspectWebsite(service, body, discover));
}
