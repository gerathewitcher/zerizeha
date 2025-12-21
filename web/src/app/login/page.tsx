import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LoginPageClient from "@/app/login/LoginPageClient";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const hasSession = !!(
    cookieStore.get("access_token")
  );

  if (hasSession) {
    redirect("/spaces");
  }

  return <LoginPageClient />;
}
