import type { ReactNode } from "react";
import { LogoMark } from "./logo";

export function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: ReactNode; actions?: ReactNode }) {
  return <header className="spenst-page-heading"><div className="spenst-heading-copy"><p className="spenst-eyebrow"><LogoMark />{eyebrow}</p><h1>{title}</h1><p className="spenst-page-description">{description}</p></div>{actions && <div className="spenst-page-actions">{actions}</div>}</header>;
}
