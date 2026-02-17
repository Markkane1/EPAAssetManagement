import type { Location } from "@/types";

export const isHeadOfficeLocationName = (name?: string | null) =>
  !!name && /directorate/i.test(name);

export const isHeadOfficeLocation = (location?: Location | null) =>
  location?.type === "HEAD_OFFICE" || location?.type === "DIRECTORATE" || isHeadOfficeLocationName(location?.name);
