import { lazy, Suspense } from "react";

// Ajoutez après les imports
export const dynamic = "force-dynamic";

const ProfileSkeleton = () => (
  <div className="animate-pulse space-y-4" aria-busy="true" aria-live="polite">
    <div className="h-10 bg-gray-200 rounded w-1/4 mb-6"></div>
    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2.5"></div>
    <div className="h-4 bg-gray-200 rounded w-1/2 mb-2.5"></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
      <div className="h-32 bg-gray-200 rounded"></div>
      <div className="h-32 bg-gray-200 rounded"></div>
    </div>
    <span className="sr-only">Loading profile data...</span>
  </div>
);

const Profile = lazy(() => import("@/components/auth/Profile"));

export const metadata = {
  title: "Buy It Now - Your Profile",
  description: "Manage your account settings and addresses",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ProfilePage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <Profile />
    </Suspense>
  );
}
