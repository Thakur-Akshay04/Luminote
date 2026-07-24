import { SignIn } from "@clerk/nextjs";
import SparkleMountainBackground from "@/components/SparkleMountainBackground";

export default function SignInPage() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-[#030303] p-4 relative overflow-hidden">
      <SparkleMountainBackground />
      <div className="relative z-10">
        <SignIn
          fallbackRedirectUrl="/dashboard"
          forceRedirectUrl="/dashboard"
          appearance={{
            variables: {
              colorPrimary: "#6366f1",
              colorBackground: "#18181b",
              borderRadius: "8px",
            },
            elements: {
              card: "border border-surface-border shadow-2xl bg-[#18181b]",
            },
          }}
        />
      </div>
    </main>
  );
}
