import { createLovableAuth } from "@lovable.dev/cloud-auth-js";
import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

const lovableAuth = createLovableAuth({
  supportedOAuthOrigins: [
    "https://oauth.lovable.app",
    "https://lovable.dev",
    ...(typeof window !== "undefined" ? [window.location.origin] : []),
  ],
});

const isLocalhostOrigin = () => {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
};

export const formatSocialAuthError = (
  providerLabel: "Google" | "Apple",
  rawMessage?: string
): { level: "info" | "error"; title: string; description?: string } => {
  const msg = (rawMessage || "").trim();
  const lower = msg.toLowerCase();

  if (lower.includes("cancelled") || lower.includes("canceled") || lower.includes("access_denied")) {
    return {
      level: "info",
      title: `${providerLabel} ile giriş iptal edildi.`,
    };
  }
  if (lower.includes("popup was blocked") || lower.includes("popup")) {
    return {
      level: "error",
      title: "Açılır pencere engellendi.",
      description: "Tarayıcı ayarlarından açılır pencerelere izin verip tekrar deneyin.",
    };
  }
  if (lower.includes("preview mode") || lower.includes("new tab")) {
    return {
      level: "info",
      title: "Önizleme penceresi kısıtlaması",
      description: `${providerLabel} ile giriş yapmak için lütfen sayfayı yeni sekmede açın.`,
    };
  }
  if (lower.includes("yerel ortamda") || lower.includes("yerel geliştirme")) {
    return {
      level: "info",
      title: `${providerLabel} girişi canlı ortamda aktiftir.`,
      description: msg,
    };
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return {
      level: "error",
      title: `${providerLabel} giriş isteği zaman aşımına uğradı.`,
      description: "Lütfen tekrar deneyin.",
    };
  }
  if (lower.includes("state is invalid")) {
    return {
      level: "error",
      title: "Oturum doğrulama süresi doldu.",
      description: "Lütfen tekrar giriş yapmayı deneyin.",
    };
  }
  return {
    level: "error",
    title: `${providerLabel} ile giriş başarısız.`,
    description: msg || "Lütfen tekrar deneyin veya e-posta/şifre ile devam edin.",
  };
};

export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "apple" | "microsoft" | "lovable",
      opts?: SignInOptions
    ) => {
      const redirectUri =
        opts?.redirect_uri ?? (typeof window !== "undefined" ? window.location.origin : "");

      // Local Vite dev server does not host Lovable's /~oauth/initiate edge proxy.
      // Probe Supabase OAuth safely without triggering a raw 400 JSON browser redirect.
      if (isLocalhostOrigin() && (provider === "google" || provider === "apple")) {
        try {
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
              redirectTo: redirectUri,
              queryParams: opts?.extraParams,
              skipBrowserRedirect: true,
            },
          });
          if (error || !data?.url) {
            return {
              redirected: false,
              error:
                error ??
                new Error(
                  "Sosyal giriş yerel geliştirme ortamında yapılandırılmamış. Canlı sitede (econnotes.online) doğrudan çalışmaktadır."
                ),
            };
          }
          const probe = await fetch(data.url, { redirect: "manual" });
          if (probe.type === "opaqueredirect" || (probe.status >= 300 && probe.status < 400)) {
            window.location.assign(data.url);
            return { redirected: true, error: null };
          }
          return {
            redirected: false,
            error: new Error(
              "Google ve Apple girişi canlı ortamda (econnotes.online) aktif olarak çalışmaktadır. Yerel ortamda lütfen e-posta ve şifre kullanın."
            ),
          };
        } catch (e) {
          return {
            redirected: false,
            error: e instanceof Error ? e : new Error(String(e)),
          };
        }
      }

      try {
        const result = await lovableAuth.signInWithOAuth(provider, {
          redirect_uri: redirectUri,
          extraParams: {
            ...opts?.extraParams,
          },
        });

        if (result?.redirected || result?.error) {
          return result;
        }

        if (result?.tokens) {
          try {
            const { error: sessionError } = await supabase.auth.setSession(result.tokens);
            if (sessionError) {
              return { redirected: false, error: sessionError };
            }
          } catch (e) {
            return { redirected: false, error: e instanceof Error ? e : new Error(String(e)) };
          }
        }

        return result;
      } catch (e) {
        return {
          redirected: false,
          error: e instanceof Error ? e : new Error(String(e)),
        };
      }
    },
  },
};
