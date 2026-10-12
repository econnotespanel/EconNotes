import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type LovableOAuthClient = {
  signInWithOAuth: (
    provider: "google" | "apple" | "microsoft" | "lovable",
    opts?: { redirect_uri?: string; extraParams?: Record<string, string> }
  ) => Promise<any>;
};

const getLovableOAuthClient = async (): Promise<LovableOAuthClient | null> => {
  try {
    const module = await import("@lovable.dev/cloud-auth-js");
    const factory = module.createLovableAuth;
    if (typeof factory !== "function") return null;
    return factory();
  } catch {
    return null;
  }
};

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: "google" | "apple" | "microsoft" | "lovable", opts?: SignInOptions) => {
      const client = await getLovableOAuthClient();
      if (!client) {
        return {
          redirected: false,
          error: new Error("Sosyal giriş bu ortamda kullanılamıyor."),
        };
      }

      try {
        const result = await client.signInWithOAuth(provider, {
          redirect_uri: opts?.redirect_uri,
          extraParams: {
            ...opts?.extraParams,
          },
        });

        if (result?.redirected || result?.error) {
          return result;
        }

        if (result?.tokens) {
          try {
            await supabase.auth.setSession(result.tokens);
          } catch (e) {
            return { error: e instanceof Error ? e : new Error(String(e)) };
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
