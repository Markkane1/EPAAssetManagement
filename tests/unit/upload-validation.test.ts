import { beforeEach, describe, expect, it, vi } from "vitest";

const openMock = vi.fn();

vi.mock("fs/promises", () => ({
  default: {
    open: (...args: unknown[]) => openMock(...args),
  },
  open: (...args: unknown[]) => openMock(...args),
}));

import {
  assertUploadedFileIntegrity,
  getAllowedUploadMimeTypes,
  isAllowedUploadExtension,
  isAllowedUploadMimeType,
} from "../../server/src/utils/uploadValidation";

describe("uploadValidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should expose the supported MIME types as a defensive copy", () => {
    const mimeTypes = getAllowedUploadMimeTypes();

    expect(mimeTypes).toEqual(["application/pdf", "image/jpeg", "image/png"]);

    mimeTypes.push("text/plain" as never);

    expect(getAllowedUploadMimeTypes()).toEqual(["application/pdf", "image/jpeg", "image/png"]);
  });

  it("should correctly validate allowed MIME types", () => {
    expect(isAllowedUploadMimeType("application/pdf")).toBe(true);
    expect(isAllowedUploadMimeType("image/jpeg")).toBe(true);
    expect(isAllowedUploadMimeType("image/png")).toBe(true);
    expect(isAllowedUploadMimeType("")).toBe(false);
    expect(isAllowedUploadMimeType("application/octet-stream")).toBe(false);
  });

  it("should validate file extensions against the declared MIME type", () => {
    expect(isAllowedUploadExtension("report.PDF", "application/pdf")).toBe(true);
    expect(isAllowedUploadExtension("photo.jpeg", "image/jpeg")).toBe(true);
    expect(isAllowedUploadExtension("photo.jpg", "image/jpeg")).toBe(true);
    expect(isAllowedUploadExtension("scan.png", "image/png")).toBe(true);
    expect(isAllowedUploadExtension("archive.pdf.exe", "application/pdf")).toBe(false);
    expect(isAllowedUploadExtension("no-extension", "application/pdf")).toBe(false);
    expect(isAllowedUploadExtension("image.png", "application/octet-stream")).toBe(false);
  });

  it("should accept a file whose MIME type, extension, and magic bytes all match", async () => {
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const readMock = vi.fn().mockImplementation(async (buffer: Buffer) => {
      buffer.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
      return { bytesRead: 5, buffer };
    });
    openMock.mockResolvedValue({ read: readMock, close: closeMock });

    await expect(
      assertUploadedFileIntegrity({
        originalname: "evidence.pdf",
        mimetype: "application/pdf",
        size: 128,
        path: "/tmp/evidence.pdf",
      })
    ).resolves.toBeUndefined();

    expect(openMock).toHaveBeenCalledWith("/tmp/evidence.pdf", "r");
    expect(readMock).toHaveBeenCalledOnce();
    expect(closeMock).toHaveBeenCalledOnce();
  });

  it("should reject uploads with a disallowed MIME type before reading the file", async () => {
    await expect(
      assertUploadedFileIntegrity({
        originalname: "script.sh",
        mimetype: "text/plain",
        size: 32,
        path: "/tmp/script.sh",
      }, "attachment")
    ).rejects.toMatchObject({
      status: 400,
      message: "attachment MIME type is not allowed",
    });

    expect(openMock).not.toHaveBeenCalled();
  });

  it("should reject uploads whose extension does not match the declared MIME type", async () => {
    await expect(
      assertUploadedFileIntegrity({
        originalname: "invoice.png",
        mimetype: "application/pdf",
        size: 32,
        path: "/tmp/invoice.png",
      }, "receipt")
    ).rejects.toMatchObject({
      status: 400,
      message: "receipt extension does not match MIME type",
    });

    expect(openMock).not.toHaveBeenCalled();
  });

  it("should reject empty files before inspecting magic bytes", async () => {
    await expect(
      assertUploadedFileIntegrity({
        originalname: "invoice.pdf",
        mimetype: "application/pdf",
        size: 0,
        path: "/tmp/invoice.pdf",
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "file is empty",
    });

    expect(openMock).not.toHaveBeenCalled();
  });

  it("should reject files whose content signature does not match the declared type and still close the file", async () => {
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const readMock = vi.fn().mockImplementation(async (buffer: Buffer) => {
      buffer.set([0x89, 0x50, 0x4e, 0x47]);
      return { bytesRead: 4, buffer };
    });
    openMock.mockResolvedValue({ read: readMock, close: closeMock });

    await expect(
      assertUploadedFileIntegrity({
        originalname: "invoice.pdf",
        mimetype: "application/pdf",
        size: 42,
        path: "/tmp/invoice.pdf",
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "file content does not match declared file type",
    });

    expect(closeMock).toHaveBeenCalledOnce();
  });
});
