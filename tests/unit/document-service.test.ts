import { beforeEach, describe, expect, it, vi } from "vitest";

const documentCreateMock = vi.fn();
const documentFindMock = vi.fn();
const documentFindByIdMock = vi.fn();
const versionFindOneMock = vi.fn();
const versionCreateMock = vi.fn();
const versionFindByIdMock = vi.fn();
const readFileMock = vi.fn();
const unlinkMock = vi.fn();
const createHashMock = vi.fn();
const logAuditMock = vi.fn();
const assertIntegrityMock = vi.fn();

vi.mock("fs/promises", () => ({
  default: {
    readFile: (...args: unknown[]) => readFileMock(...args),
    unlink: (...args: unknown[]) => unlinkMock(...args),
  },
  readFile: (...args: unknown[]) => readFileMock(...args),
  unlink: (...args: unknown[]) => unlinkMock(...args),
}));

vi.mock("crypto", () => ({
  default: {
    createHash: (...args: unknown[]) => createHashMock(...args),
  },
  createHash: (...args: unknown[]) => createHashMock(...args),
}));

vi.mock("../../server/src/models/document.model", () => ({
  DocumentModel: {
    create: (...args: unknown[]) => documentCreateMock(...args),
    find: (...args: unknown[]) => documentFindMock(...args),
    findById: (...args: unknown[]) => documentFindByIdMock(...args),
  },
}));

vi.mock("../../server/src/models/documentVersion.model", () => ({
  DocumentVersionModel: {
    findOne: (...args: unknown[]) => versionFindOneMock(...args),
    create: (...args: unknown[]) => versionCreateMock(...args),
    findById: (...args: unknown[]) => versionFindByIdMock(...args),
  },
}));

vi.mock("../../server/src/modules/records/services/audit.service", () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args),
}));

vi.mock("../../server/src/utils/uploadValidation", () => ({
  assertUploadedFileIntegrity: (...args: unknown[]) => assertIntegrityMock(...args),
}));

import {
  createDocument,
  listDocuments,
  getDocumentById,
  uploadDocumentVersion,
  getDocumentVersionDownload,
} from "../../server/src/modules/records/services/document.service";

describe("document.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFileMock.mockResolvedValue(Buffer.from("file-bytes"));
    unlinkMock.mockResolvedValue(undefined);
    createHashMock.mockReturnValue({
      update: () => ({ digest: () => "sha256-hash" }),
    });
    logAuditMock.mockResolvedValue(undefined);
    assertIntegrityMock.mockResolvedValue(undefined);
  });

  function leanResult<T>(value: T) {
    return { lean: async () => value };
  }

  it("should create documents only within the allowed office scope", async () => {
    await expect(
      createDocument({ userId: "user-1", role: "employee", locationId: null, isOrgAdmin: false }, { title: "Doc", docType: "Other" })
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      createDocument(
        { userId: "user-1", role: "employee", locationId: "office-1", isOrgAdmin: false },
        { title: "Doc", docType: "Other", officeId: "office-2" }
      )
    ).rejects.toMatchObject({ status: 403 });

    documentCreateMock.mockResolvedValue([{ id: "doc-1" }]);
    const result = await createDocument(
      { userId: "user-1", role: "employee", locationId: "office-1", isOrgAdmin: false },
      { title: "Doc", docType: "Other", officeId: "office-1" }
    );

    expect(documentCreateMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          title: "Doc",
          doc_type: "Other",
          status: "Draft",
          office_id: "office-1",
          created_by_user_id: "user-1",
        }),
      ],
      { session: undefined }
    );
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: "doc-1" });
  });

  it("should paginate document lists and apply office filters for non-admin users", async () => {
    const leanMock = vi.fn().mockResolvedValue([{ id: "doc-1" }]);
    documentFindMock.mockReturnValue({
      sort: () => ({
        skip: () => ({
          limit: () => ({ lean: leanMock }),
        }),
      }),
    });

    const rows = await listDocuments(
      { userId: "user-1", role: "employee", locationId: "office-1", isOrgAdmin: false },
      { status: "Final" },
      { page: 2, limit: 5 }
    );

    expect(documentFindMock).toHaveBeenCalledWith({ status: "Final", office_id: "office-1" });
    expect(rows).toEqual([{ id: "doc-1" }]);
  });

  it("should validate document access by id", async () => {
    documentFindByIdMock.mockReturnValueOnce(leanResult(null));
    await expect(
      getDocumentById({ userId: "user-1", role: "employee", locationId: "office-1", isOrgAdmin: false }, "doc-1")
    ).rejects.toMatchObject({ status: 404 });

    documentFindByIdMock.mockReturnValueOnce(leanResult({ office_id: "office-2" }));
    await expect(
      getDocumentById({ userId: "user-1", role: "employee", locationId: "office-1", isOrgAdmin: false }, "doc-1")
    ).rejects.toMatchObject({ status: 403 });

    documentFindByIdMock.mockReturnValueOnce(leanResult({ id: "doc-1", office_id: "office-1" }));
    await expect(
      getDocumentById({ userId: "user-1", role: "employee", locationId: "office-1", isOrgAdmin: false }, "doc-1")
    ).resolves.toEqual({ id: "doc-1", office_id: "office-1" });
  });

  it("should upload a document version, compute its hash, and log the audit entry", async () => {
    documentFindByIdMock.mockReturnValue(leanResult({ office_id: "office-1" }));
    versionFindOneMock.mockReturnValue({
      sort: () => ({ lean: () => ({ exec: async () => ({ version_no: 2 }) }) }),
    });
    versionCreateMock.mockResolvedValue({ id: "version-1" });

    const file = {
      path: "uploads/tmp/upload.pdf",
      originalname: "upload.pdf",
      mimetype: "application/pdf",
      size: 1234,
    };

    const result = await uploadDocumentVersion(
      { userId: "user-1", role: "employee", locationId: "office-1", isOrgAdmin: false },
      "doc-1",
      file as never
    );

    expect(assertIntegrityMock).toHaveBeenCalledWith(file, "file");
    expect(readFileMock).toHaveBeenCalledWith("uploads/tmp/upload.pdf");
    expect(versionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        document_id: "doc-1",
        version_no: 3,
        file_name: "upload.pdf",
        sha256: "sha256-hash",
      })
    );
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: "version-1" });
  });

  it("should clean up temporary uploads when version creation fails before persistence", async () => {
    documentFindByIdMock.mockReturnValue(leanResult({ office_id: "office-1" }));
    versionFindOneMock.mockReturnValue({
      sort: () => ({ lean: () => ({ exec: async () => null }) }),
    });
    versionCreateMock.mockRejectedValue(new Error("insert failed"));

    const file = {
      path: "uploads/tmp/bad.pdf",
      originalname: "bad.pdf",
      mimetype: "application/pdf",
      size: 1234,
    };

    await expect(
      uploadDocumentVersion(
        { userId: "user-1", role: "employee", locationId: "office-1", isOrgAdmin: false },
        "doc-1",
        file as never
      )
    ).rejects.toThrow("insert failed");

    expect(unlinkMock).toHaveBeenCalledWith("uploads/tmp/bad.pdf");
  });

  it("should validate download access and prevent paths outside uploads", async () => {
    versionFindByIdMock.mockReturnValueOnce(leanResult(null));
    await expect(
      getDocumentVersionDownload({ userId: "user-1", role: "employee", locationId: "office-1", isOrgAdmin: false }, "version-1")
    ).rejects.toMatchObject({ status: 404 });

    versionFindByIdMock.mockReturnValueOnce(leanResult({ document_id: "doc-1", storage_key: "../escape.pdf", file_path: null }));
    documentFindByIdMock.mockReturnValueOnce(leanResult({ office_id: "office-1" }));
    await expect(
      getDocumentVersionDownload({ userId: "user-1", role: "employee", locationId: "office-1", isOrgAdmin: false }, "version-1")
    ).rejects.toMatchObject({ status: 400 });

    versionFindByIdMock.mockReturnValueOnce(leanResult({ document_id: "doc-1", storage_key: "uploads/documents/file.pdf", file_path: null }));
    documentFindByIdMock.mockReturnValueOnce(leanResult({ office_id: "office-1" }));
    const result = await getDocumentVersionDownload(
      { userId: "user-1", role: "employee", locationId: "office-1", isOrgAdmin: false },
      "version-1"
    );

    expect(result.absolutePath).toContain("uploads\\documents\\file.pdf");
  });
});
