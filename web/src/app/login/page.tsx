import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LoginPageClient from "@/app/login/LoginPageClient";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value ?? "";
  const hasSession = accessToken.trim().length > 0;

  if (hasSession) {
    redirect("/spaces");
  }

  return <LoginPageClient />;
}
