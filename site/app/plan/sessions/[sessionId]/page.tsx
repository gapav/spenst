import { SessionBuilderScreen } from "@/components/session-builder";

export default async function SessionBuilderPage({ params }: PageProps<"/plan/sessions/[sessionId]">) {
  const { sessionId } = await params;
  return <SessionBuilderScreen sessionId={sessionId} />;
}
