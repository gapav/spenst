"use client";

import { KeyRound, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useSpenst } from "@/components/app-provider";
import { Logo } from "@/components/logo";
import { Button, inputClass } from "@/components/ui";
import { internalPath } from "@/lib/auth";

function SignInForm() {
  const { signIn, isDemoMode } = useSpenst();
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = internalPath(search.get("next"));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError(null);
    try { await signIn(email.trim().toLowerCase(), password); router.push(next); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Couldn’t sign in"); }
    finally { setLoading(false); }
  }

  return <div className="grid min-h-screen lg:grid-cols-[1.05fr_.95fr]">
    <section className="relative hidden overflow-hidden bg-[var(--chrome)] p-12 text-[var(--on-chrome)] lg:flex lg:flex-col">
      <div className="absolute -right-24 top-24 h-96 w-96 rounded-full border-[3px] border-[var(--mark)]" />
      <div className="absolute bottom-[-13rem] left-[-8rem] h-[30rem] w-[30rem] rounded-full border-[1px] border-white/20" />
      <div className="relative"><Logo /></div>
      <div className="relative mt-auto max-w-xl">
        <p className="text-xs font-black uppercase tracking-[.2em] text-[var(--on-chrome-soft)]">Made for test day</p>
        <h1 className="mt-5 text-6xl font-black leading-[.98] tracking-[-.06em]">Explosive?<br />Now you<br />know.</h1>
        <p className="mt-6 max-w-md text-lg leading-8 text-white/60">Sprints, jumps and bar speed become one power profile per athlete — and a plan for what each of them needs.</p>
      </div>
    </section>
    <main className="grid place-items-center p-5 sm:p-10"><div className="w-full max-w-md">
      <div className="mb-10 lg:hidden"><Logo /></div>
      <p className="text-xs font-black uppercase tracking-[.17em] text-[var(--accent)]">Welcome to Röskr</p>
      <h2 className="mt-3 text-4xl font-black tracking-[-.055em]">Sign in.</h2>
      <p className="mt-4 leading-7 text-[var(--ink-soft)]">{isDemoMode ? "Demo mode — any email and any password open the demo." : "Use the email address and password your administrator gave you."}</p>
      <form className="mt-8 grid gap-4" onSubmit={submit}>
        <label className="grid gap-2 text-sm font-bold">Email address<div className="relative"><Mail className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={18} /><input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className={`${inputClass} pl-10`} placeholder="coach@club.com" autoFocus /></div></label>
        <label className="grid gap-2 text-sm font-bold">Password<div className="relative"><KeyRound className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={18} /><input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={`${inputClass} pl-10`} placeholder="••••••••••" /></div></label>
        {error && <p role="alert" className="rounded-xl bg-[var(--danger-bg)] px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}
        <Button size="lg" disabled={loading}>{loading ? "Signing in …" : <><KeyRound size={18} />Sign in</>}</Button>
      </form>
    </div></main>
  </div>;
}

export default function SignInPage() { return <Suspense><SignInForm /></Suspense>; }
