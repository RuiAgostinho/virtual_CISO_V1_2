import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import ChatWidget from "@/components/chat/ChatWidget";

type Props = {
  children: React.ReactNode;
};

export default function AppShell({ children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Topbar onOpenMenu={() => setSidebarOpen(true)} />

      <div className="flex">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Em desktop reserva 18rem (w-72) para a sidebar */}
        <main className="flex-1 p-6 lg:ml-72 min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}