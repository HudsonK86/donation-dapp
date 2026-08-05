"use client";

import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AdminDashboard } from "@/components/dashboard/AdminDashboard";
import { UserDashboard } from "@/components/dashboard/UserDashboard";

export default function DashboardPage() {
  const { isAdmin, isLoading } = useAdminAuth();

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="h-10 w-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (isAdmin) {
    return <AdminDashboard />;
  }

  return <UserDashboard />;
}
