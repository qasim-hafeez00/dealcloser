import AuthForm from "@/components/AuthForm";
import { safeNext } from "@/lib/session";

export const metadata = { title: "Sign up" };

export default async function Signup({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <div className="px-4 pb-16"><AuthForm mode="signup" next={next ? safeNext(next) : undefined} /></div>;
}
