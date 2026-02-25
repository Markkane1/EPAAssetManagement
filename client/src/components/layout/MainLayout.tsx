import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { Sheet, SheetContent } from "@/components/ui/sheet";

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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const searchTerm = pageSearch?.term ?? fallbackSearchTerm;
  const setSearchTerm = pageSearch?.setTerm ?? setFallbackSearchTerm;

  // Reset scroll position only when navigating to a new route
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="h-screen overflow-hidden bg-background flex">
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[88vw] max-w-[22rem] p-0">
          <Sidebar isMobileDrawer onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex-1 flex flex-col">
        <Header
          title={title}
          description={description}
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder={searchPlaceholder}
          onMenuClick={() => setMobileNavOpen(true)}
        />
        <main 
          ref={mainRef}
          className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 lg:p-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
