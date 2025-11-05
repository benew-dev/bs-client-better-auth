import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL:
    process.env.NEXT_PUBLIC_API_URL ||
    "https://bs-client-better-auth.vercel.app",
});

export const { useSession, signIn, signUp, signOut, updateUser } = authClient;
