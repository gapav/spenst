/**
 * The season plan with a slot for the session drawer. Opening a session from
 * the plan is a soft navigation to `/plan/sessions/[id]`, which `@drawer`
 * intercepts and shows over the plan (decision 24); a reload or a shared link
 * gets the full builder page instead.
 */
export default function PlanLayout({ children, drawer }: LayoutProps<"/plan">) {
  return <>{children}{drawer}</>;
}
