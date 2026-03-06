import { describe, expect, it } from "vitest";

import { createHttpError } from "../../server/src/utils/httpError";
import { mapFields, pickDefined } from "../../server/src/utils/mapFields";
import {
  asNonEmptyString,
  asNullableString,
  clampInt,
  escapeRegex,
  parseBoolean,
  parseDateInput,
  parsePositiveInt,
  readPagination,
  readParam,
} from "../../server/src/utils/requestParsing";
import {
  STRONG_PASSWORD_MESSAGE,
  STRONG_PASSWORD_MIN_LENGTH,
  validateStrongPassword,
} from "../../server/src/utils/passwordPolicy";

describe("createHttpError", () => {
  it("should create an Error instance with status and details for valid input", () => {
    const error = createHttpError(418, "teapot", { extra: true });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("teapot");
    expect(error.status).toBe(418);
    expect(error.details).toEqual({ extra: true });
  });

  it("should omit details when details are undefined", () => {
    const error = createHttpError(400, "bad request");

    expect(error.status).toBe(400);
    expect("details" in error).toBe(false);
  });
});

describe("mapFields", () => {
  it("should map only defined source fields to target keys for typical input", () => {
    const mapped = mapFields(
      { firstName: "Ava", lastName: "Khan", ignored: "x" },
      { firstName: "first_name", lastName: "last_name" }
    );

    expect(mapped).toEqual({
      first_name: "Ava",
      last_name: "Khan",
    });
  });

  it("should return an empty object when source input is empty", () => {
    expect(mapFields({}, { firstName: "first_name" })).toEqual({});
  });

  it("should preserve null, zero, and empty string values while dropping undefined values", () => {
    const mapped = mapFields(
      {
        empty: "",
        zero: 0,
        nullable: null,
        skipped: undefined,
      },
      {
        empty: "empty_db",
        zero: "zero_db",
        nullable: "nullable_db",
        skipped: "skipped_db",
      }
    );

    expect(mapped).toEqual({
      empty_db: "",
      zero_db: 0,
      nullable_db: null,
    });
  });
});

describe("pickDefined", () => {
  it("should remove only undefined values from an object", () => {
    expect(
      pickDefined({
        name: "asset",
        count: 0,
        notes: null,
        skipped: undefined,
      })
    ).toEqual({
      name: "asset",
      count: 0,
      notes: null,
    });
  });

  it("should return an empty object when every value is undefined", () => {
    expect(pickDefined({ a: undefined, b: undefined })).toEqual({});
  });
});

describe("readParam", () => {
  it("should return a trimmed string for a typical string param", () => {
    expect(readParam({ params: { id: " 123 " } } as never, "id")).toBe("123");
  });

  it("should return the first trimmed entry when a param is an array", () => {
    expect(readParam({ params: { id: [" 123 ", "456"] } } as never, "id")).toBe(
      "123"
    );
  });

  it("should return an empty string when the param is missing", () => {
    expect(readParam({ params: {} } as never, "id")).toBe("");
  });
});

describe("parsePositiveInt and clampInt", () => {
  it("should parse a typical positive number and floor decimal input", () => {
    expect(parsePositiveInt("12.8", 5, 50)).toBe(12);
    expect(clampInt(7.9, 1, 10)).toBe(7);
  });

  it("should fall back for null, undefined, and non-numeric input and clamp empty strings to one", () => {
    expect(parsePositiveInt("", 5, 50)).toBe(1);
    expect(parsePositiveInt(null, 5, 50)).toBe(1);
    expect(parsePositiveInt(undefined, 5, 50)).toBe(5);
    expect(parsePositiveInt("oops", 5, 50)).toBe(5);
  });

  it("should clamp values to minimum one and maximum bounds", () => {
    expect(parsePositiveInt(0, 5, 50)).toBe(1);
    expect(parsePositiveInt(-20, 5, 50)).toBe(1);
    expect(parsePositiveInt(999, 5, 50)).toBe(50);
  });
});

describe("readPagination", () => {
  it("should return page, limit, and skip for typical query values", () => {
    expect(readPagination({ page: "3", limit: "25" })).toEqual({
      page: 3,
      limit: 25,
      skip: 50,
    });
  });

  it("should use configured defaults when query values are missing", () => {
    expect(
      readPagination({}, { defaultPage: 2, defaultLimit: 15, maxLimit: 40 })
    ).toEqual({
      page: 2,
      limit: 15,
      skip: 15,
    });
  });

  it("should clamp oversized limits and invalid pages to safe bounds", () => {
    expect(
      readPagination({ page: "0", limit: "9000" }, { maxPage: 20, maxLimit: 40 })
    ).toEqual({
      page: 1,
      limit: 40,
      skip: 0,
    });
  });
});

describe("string and date parsing helpers", () => {
  it("should return a trimmed string for typical nullable string input", () => {
    expect(asNullableString("  hello ")).toBe("hello");
  });

  it("should return null for empty, null-like, and undefined values", () => {
    expect(asNullableString("")).toBeNull();
    expect(asNullableString(" null ")).toBeNull();
    expect(asNullableString("undefined")).toBeNull();
    expect(asNullableString(null)).toBeNull();
    expect(asNullableString(undefined)).toBeNull();
  });

  it("should coerce unexpected primitive types to strings when non-empty", () => {
    expect(asNullableString(0)).toBe("0");
    expect(asNullableString(false)).toBe("false");
  });

  it("should return a trimmed string for valid required input and throw for empty values", () => {
    expect(asNonEmptyString("  office ", "officeId")).toBe("office");
    expect(() => asNonEmptyString("", "officeId")).toThrowError(/required/i);
    expect(() => asNonEmptyString(null, "officeId")).toThrowError(/required/i);
  });

  it("should parse valid dates and reject invalid date input", () => {
    const parsed = parseDateInput("2026-03-06", "requestedAt");

    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.toISOString()).toContain("2026-03-06");
    expect(parseDateInput("", "requestedAt")).toBeNull();
    expect(parseDateInput(null, "requestedAt")).toBeNull();
    expect(() => parseDateInput("not-a-date", "requestedAt")).toThrowError(
      /valid date/i
    );
    expect(() => parseDateInput({} as never, "requestedAt")).toThrowError(
      /valid date/i
    );
  });
});

describe("parseBoolean", () => {
  it("should parse typical boolean values and boolean strings", () => {
    expect(parseBoolean(true, "flag")).toBe(true);
    expect(parseBoolean(false, "flag")).toBe(false);
    expect(parseBoolean("true", "flag")).toBe(true);
    expect(parseBoolean("false", "flag")).toBe(false);
  });

  it("should return fallback for null and undefined values and treat empty strings as false", () => {
    expect(parseBoolean(undefined, "flag", true)).toBe(true);
    expect(parseBoolean(null, "flag", false)).toBe(false);
    expect(parseBoolean("", "flag", true)).toBe(false);
  });

  it("should throw for unexpected string and numeric inputs", () => {
    expect(() => parseBoolean("yes", "flag")).toThrowError(/boolean/i);
    expect(() => parseBoolean(1, "flag")).toThrowError(/boolean/i);
  });
});

describe("escapeRegex", () => {
  it("should escape regex metacharacters in a typical search string", () => {
    expect(escapeRegex("a+b?.*")).toBe("a\\+b\\?\\.\\*");
  });

  it("should return an empty string unchanged", () => {
    expect(escapeRegex("")).toBe("");
  });
});

describe("validateStrongPassword", () => {
  it("should return null for a valid strong password", () => {
    expect(validateStrongPassword("StrongPass123!")).toBeNull();
  });

  it("should reject passwords shorter than the configured minimum", () => {
    expect(validateStrongPassword("Aa1!short")).toBe(STRONG_PASSWORD_MESSAGE);
    expect("Aa1!short".length).toBeLessThan(STRONG_PASSWORD_MIN_LENGTH);
  });

  it("should reject passwords missing lowercase, uppercase, number, or symbol characters", () => {
    expect(validateStrongPassword("STRONGPASS123!")).toBe(
      STRONG_PASSWORD_MESSAGE
    );
    expect(validateStrongPassword("strongpass123!")).toBe(
      STRONG_PASSWORD_MESSAGE
    );
    expect(validateStrongPassword("StrongPassword!")).toBe(
      STRONG_PASSWORD_MESSAGE
    );
    expect(validateStrongPassword("StrongPassword1")).toBe(
      STRONG_PASSWORD_MESSAGE
    );
  });

  it("should coerce unexpected types and still reject invalid values safely", () => {
    expect(validateStrongPassword(undefined as never)).toBe(
      STRONG_PASSWORD_MESSAGE
    );
    expect(validateStrongPassword(null as never)).toBe(STRONG_PASSWORD_MESSAGE);
    expect(validateStrongPassword(123456789012 as never)).toBe(
      STRONG_PASSWORD_MESSAGE
    );
  });
});
