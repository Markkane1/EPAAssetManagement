import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { PageSearchProvider } from "@/contexts/PageSearchContext";

interface MainLayoutProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  searchPlaceholder?: string;
}

export function MainLayout({ children, title, description, searchPlaceholder }: MainLayoutProps) {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Reset scroll position only when navigating to a new route
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
    setSearchTerm("");
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
        <PageSearchProvider value={{ term: searchTerm, setTerm: setSearchTerm }}>
          <main 
            ref={mainRef}
            className="flex-1 overflow-y-auto overscroll-contain p-8"
          >
            {children}
          </main>
        </PageSearchProvider>
      </div>
    </div>
  );
}
