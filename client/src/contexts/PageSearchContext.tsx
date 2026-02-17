/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

type PageSearchContextValue = {
  term: string;
  setTerm: (term: string) => void;
};

const PageSearchContext = createContext<PageSearchContextValue | null>(null);

export const usePageSearch = () => useContext(PageSearchContext);

export function PageSearchProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [term, setTerm] = useState("");

  useEffect(() => {
    setTerm("");
  }, [location.pathname]);

  const value = useMemo(() => ({ term, setTerm }), [term]);

  return <PageSearchContext.Provider value={value}>{children}</PageSearchContext.Provider>;
}
