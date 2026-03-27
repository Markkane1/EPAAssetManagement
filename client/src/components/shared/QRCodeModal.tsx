import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Printer } from "lucide-react";

type QRCodeRenderer = typeof import("qrcode.react")["QRCodeSVG"];

interface QRCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag: string;
  assetName: string;
  serialNumber?: string;
}

export function QRCodeModal({
  open,
  onOpenChange,
  tag,
  assetName,
  serialNumber,
}: QRCodeModalProps) {
  const qrRef = useRef<HTMLDivElement>(null);
  const [QRCodeSVG, setQRCodeSVG] = useState<QRCodeRenderer | null>(null);
  const [isLoadingQRCode, setIsLoadingQRCode] = useState(false);

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const qrValue = JSON.stringify({
    tag,
    asset: assetName,
    serial: serialNumber || "",
  });

  useEffect(() => {
    if (!open || QRCodeSVG) return;

    let isCancelled = false;
    setIsLoadingQRCode(true);

    import("qrcode.react")
      .then((module) => {
        if (!isCancelled) {
          setQRCodeSVG(() => module.QRCodeSVG);
          setIsLoadingQRCode(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setIsLoadingQRCode(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [QRCodeSVG, open]);

  const handleDownload = () => {
    if (isLoadingQRCode) return;
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `qr-${tag}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  const handlePrint = () => {
    if (isLoadingQRCode) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const safeTag = escapeHtml(tag);
    const safeAssetName = escapeHtml(assetName);
    const safeSerial = serialNumber ? escapeHtml(serialNumber) : "";

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Asset Tag: ${safeTag}</title>
          <style>
            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              font-family: system-ui, -apple-system, sans-serif;
            }
            .container {
              text-align: center;
              padding: 20px;
              border: 2px solid #000;
              border-radius: 8px;
            }
            .tag {
              font-size: 24px;
              font-weight: bold;
              font-family: monospace;
              margin-top: 16px;
            }
            .asset-name {
              font-size: 14px;
              color: #666;
              margin-top: 8px;
            }
            .serial {
              font-size: 12px;
              color: #999;
              margin-top: 4px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            ${svgData}
            <div class="tag">${safeTag}</div>
            <div class="asset-name">${safeAssetName}</div>
            ${serialNumber ? `<div class="serial">S/N: ${safeSerial}</div>` : ""}
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[350px]">
        <DialogHeader>
          <DialogTitle>Asset QR Code</DialogTitle>
          <DialogDescription>
            Scan this code to identify the asset
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-6" ref={qrRef}>
          <div className="bg-white p-4 rounded-lg">
            {QRCodeSVG ? (
              <QRCodeSVG
                value={qrValue}
                size={180}
                level="H"
                includeMargin
              />
            ) : (
              <div className="flex h-[180px] w-[180px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="mt-4 text-center">
            <p className="font-mono text-lg font-bold text-primary">{tag}</p>
            <p className="text-sm text-muted-foreground">{assetName}</p>
            {serialNumber && (
              <p className="text-xs text-muted-foreground">S/N: {serialNumber}</p>
            )}
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleDownload} disabled={isLoadingQRCode || !QRCodeSVG}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button onClick={handlePrint} disabled={isLoadingQRCode || !QRCodeSVG}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
