import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ReviewRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/briefings/${id}`);
}
