"use client";

import { UserProfile } from "@clerk/nextjs";

export default function ProfilePage() {
  return (
    <div className="min-h-screen bg-surface-base p-4 sm:p-8 flex flex-col items-center justify-center">
      <UserProfile
        routing="hash"
        appearance={{
          variables: {
            colorPrimary: "#6366f1",
            colorBackground: "#18181b",
            borderRadius: "12px",
          },
          elements: {
            card: "border border-surface-border shadow-2xl bg-[#18181b]",
            navbar: "border-r border-surface-border",
          },
        }}
      />
    </div>
  );
}
