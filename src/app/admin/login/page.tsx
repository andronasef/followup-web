import { LoginForm } from "./login-form.tsx";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-[20px] leading-[1.3] font-semibold text-foreground">Sign in</h1>
        <LoginForm />
      </div>
    </main>
  );
}
