import { AthleteProfileScreen } from "@/components/athlete-profile";

export default async function AthletePage({ params }: PageProps<"/athletes/[id]">) {
  const { id } = await params;
  return <AthleteProfileScreen athleteId={id} />;
}
