"use client";

// Split out of page.tsx because the page itself is an async Server
// Component (it runs the D-14 exists() check server-side before rendering
// anything) and a Server Component cannot hold form/onSubmit state.
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SetupForm() {
  const router = useRouter();
  const [setupToken, setSetupToken] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch("/api/admin/setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-setup-token": setupToken,
      },
      body: JSON.stringify({ email, password, displayName: displayName || undefined }),
    });

    if (response.ok) {
      router.push("/admin/login");
      return;
    }

    setPending(false);
    setError("Couldn't create the owner account. Check the setup token and try again.");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="setup-token">Setup token</Label>
        <Input
          id="setup-token"
          type="password"
          autoComplete="off"
          required
          value={setupToken}
          onChange={(event) => setSetupToken(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="display-name">Name</Label>
        <Input
          id="display-name"
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error ? <p className="text-[14px] leading-[1.4] text-destructive">{error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">
        Create owner account
      </Button>
    </form>
  );
}
