import { Suspense } from "react";
import { TestingBoard } from "@/components/testing-board";

// `useSearchParams` needs a Suspense boundary to prerender.
export default function TestingPage() {
  return <Suspense><TestingBoard /></Suspense>;
}
