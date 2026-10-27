import { createClient } from "@insforge/sdk";

const { VITE_INSFORGE_URL, VITE_INSFORGE_ANON_KEY } = import.meta.env;

export const insforge =
  VITE_INSFORGE_URL && VITE_INSFORGE_ANON_KEY
    ? createClient({
        baseUrl: VITE_INSFORGE_URL,
        anonKey: VITE_INSFORGE_ANON_KEY,
      })
    : null;
