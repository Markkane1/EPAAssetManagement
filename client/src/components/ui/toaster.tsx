import { Toast, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map((toastItem) => (
        <Toast key={toastItem.id} open={toastItem.open}>
          {toastItem.title ? <ToastTitle>{toastItem.title}</ToastTitle> : null}
          {toastItem.description ? <ToastDescription>{toastItem.description}</ToastDescription> : null}
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
