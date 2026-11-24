import AuthForm from "@/components/AuthForm";
import { safeNext } from "@/lib/session";

export const metadata = { title: "Log in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <div className="px-4 pb-16"><AuthForm mode="login" next={next ? safeNext(next) : undefined} /></div>;
}
