import type { Location } from "@/types";

const HEAD_OFFICE_PATTERN = /head\s*office/i;

export const isHeadOfficeLocationName = (name?: string | null) =>
  !!name && HEAD_OFFICE_PATTERN.test(name);

export const isHeadOfficeLocation = (location?: Location | null) =>
  isHeadOfficeLocationName(location?.name);
