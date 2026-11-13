import { SessionDrawer } from "@/components/session-drawer";

export default async function SessionDrawerPage({ params }: PageProps<"/plan/sessions/[sessionId]">) {
  const { sessionId } = await params;
  return <SessionDrawer sessionId={sessionId} />;
}
