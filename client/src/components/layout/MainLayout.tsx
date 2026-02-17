import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { usePageSearch } from "@/contexts/PageSearchContext";

interface MainLayoutProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  searchPlaceholder?: string;
}

export function MainLayout({ children, title, description, searchPlaceholder }: MainLayoutProps) {
  const location = useLocation();
  const pageSearch = usePageSearch();
  const mainRef = useRef<HTMLElement>(null);
  const [fallbackSearchTerm, setFallbackSearchTerm] = useState("");
  const searchTerm = pageSearch?.term ?? fallbackSearchTerm;
  const setSearchTerm = pageSearch?.setTerm ?? setFallbackSearchTerm;

  // Reset scroll position only when navigating to a new route
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  return (
    <div className="h-screen overflow-hidden bg-background flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header
          title={title}
          description={description}
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder={searchPlaceholder}
        />
        <main 
          ref={mainRef}
          className="flex-1 overflow-y-auto overscroll-contain p-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
