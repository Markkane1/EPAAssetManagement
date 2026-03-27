import { useCallback, useState, type ChangeEvent } from "react";

const DEFAULT_PDF_ERROR = "Attachment must be a PDF file.";

export function isPdfAttachment(file: File) {
  if (file.type === "application/pdf") return true;
  return /\.pdf$/i.test(file.name);
}

export function usePdfAttachmentField(errorMessage = DEFAULT_PDF_ERROR) {
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const resetAttachment = useCallback(() => {
    setAttachmentFile(null);
    setAttachmentError(null);
  }, []);

  const handleAttachmentChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    if (!selected) {
      resetAttachment();
      return;
    }

    if (!isPdfAttachment(selected)) {
      setAttachmentFile(null);
      setAttachmentError(errorMessage);
      event.target.value = "";
      return;
    }

    setAttachmentFile(selected);
    setAttachmentError(null);
  }, [errorMessage, resetAttachment]);

  const validateAttachment = useCallback((file = attachmentFile) => {
    if (file && !isPdfAttachment(file)) {
      setAttachmentError(errorMessage);
      return false;
    }

    return true;
  }, [attachmentFile, errorMessage]);

  return {
    attachmentFile,
    attachmentError,
    handleAttachmentChange,
    resetAttachment,
    validateAttachment,
  };
}
