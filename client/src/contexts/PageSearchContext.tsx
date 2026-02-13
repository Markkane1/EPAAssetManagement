/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from "react";

type PageSearchContextValue = {
  term: string;
  setTerm: (term: string) => void;
};

const PageSearchContext = createContext<PageSearchContextValue | null>(null);

export const usePageSearch = () => useContext(PageSearchContext);

export const PageSearchProvider = PageSearchContext.Provider;
