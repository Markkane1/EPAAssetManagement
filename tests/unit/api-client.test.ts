/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import api, { API_BASE_URL, ApiError } from "../../client/src/lib/api";

describe("client API helper", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    document.cookie = "csrf_token=test-csrf-token";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });

  it("should issue GET requests with credentials included and normalize Mongo ObjectId payloads", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          _id: { $oid: "asset-1" },
          nested: [{ _id: { $oid: "asset-2" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await api.get<{ _id: string; id: string; nested: Array<{ _id: string; id: string }> }>("/assets/asset-1");

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/assets/asset-1`, {
      method: "GET",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    expect(result).toEqual({
      _id: "asset-1",
      id: "asset-1",
      nested: [{ _id: "asset-2", id: "asset-2" }],
    });
  });

  it("should include the CSRF token header for mutation requests", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await api.post("/auth/change-password", {
      oldPassword: "OldPass123!",
      newPassword: "NewPass123!",
    });

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/auth/change-password`, {
      method: "POST",
      body: JSON.stringify({
        oldPassword: "OldPass123!",
        newPassword: "NewPass123!",
      }),
      cache: undefined,
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": "test-csrf-token",
      },
      credentials: "include",
    });
  });

  it("should collapse validation issues into a single ApiError message", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Validation error",
          error: "VALIDATION_ERROR",
          issues: [
            { path: "email", message: "Email is required" },
            { path: "password", message: "Password is too short" },
          ],
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(api.post("/auth/login", {})).rejects.toMatchObject<ApiError>({
      name: "ApiError",
      status: 400,
      message: "email: Email is required | password: Password is too short",
    });
  });

  it("should surface plain-text server errors as ApiError instances", async () => {
    fetchMock.mockResolvedValue(new Response("Service unavailable", { status: 503 }));

    await expect(api.get("/health")).rejects.toMatchObject<ApiError>({
      name: "ApiError",
      status: 503,
      message: "Service unavailable",
    });
  });
});
