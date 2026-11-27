"use client";

import { UserProfile } from "@clerk/nextjs";

export default function ProfilePage() {
  return (
    <div className="min-h-screen bg-surface-base p-4 sm:p-8 flex flex-col items-center justify-center">
      <UserProfile
        routing="hash"
        appearance={{
          variables: {
            colorPrimary: "#f58c24",
            colorBackground: "#17171b",
            borderRadius: "12px",
          },
          elements: {
            card: "border border-border shadow-2xl bg-[#17171b]",
            navbar: "border-r border-border",
          },
        }}
      />
    </div>
  );
}
