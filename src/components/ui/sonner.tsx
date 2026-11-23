import { useTheme } from "@/contexts/ThemeContext";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      offset="calc(env(safe-area-inset-top, 0px) + var(--ios-pwa-top-buffer, 0px) + 0.75rem)"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-2xl group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-slate-200/90 dark:group-[.toaster]:border-slate-800 group-[.toaster]:shadow-xl",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:rounded-full group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:rounded-full group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
