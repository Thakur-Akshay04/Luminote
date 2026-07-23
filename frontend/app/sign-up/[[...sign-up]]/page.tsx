import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-surface-base p-4">
      <SignUp
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
    </main>
  );
}
