import { redirect } from "next/navigation";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { HelpCenterView } from "@/components/getting-started/HelpCenterView";
import { tenantConversationWrapperChrome } from "@/lib/tenantI18n/conversationChrome";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function GettingStartedPage({
  searchParams,
}: {
  searchParams?: Promise<{ topic?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { messages } = await getTenantLocalization();
  const copy = messages.gettingStarted;
  const conversationChrome = tenantConversationWrapperChrome(messages);
  const params = searchParams ? await searchParams : {};
  const initialTopicId =
    typeof params.topic === "string" ? params.topic : null;

  return (
    <TenantAppShell currentPath="/getting-started" messages={messages}>
      <HelpCenterView
        copy={copy}
        initialTopicId={initialTopicId}
        conversationChrome={conversationChrome}
      />
    </TenantAppShell>
  );
}
