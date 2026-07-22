import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-surface-base p-4">
      <SignIn
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
