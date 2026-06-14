import {
  useAuth as useClerkSession,
  useClerk,
  useUser,
  type ClerkProviderProps
} from "@clerk/clerk-react";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

const AUTH_STORAGE_KEY = "edgetrace.mockAuth";
const MOCK_USER_ID = "local-demo-user";

export type AuthMode = "clerk" | "mock";

export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  createdAt?: string;
};

type AuthContextValue = {
  authMode: AuthMode;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  signup: () => void;
  logout: () => void;
  getAccessToken?: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const requestedAuthMode = import.meta.env.VITE_AUTH_MODE as string | undefined;

if (import.meta.env.PROD) {
  const missing: string[] = [];
  if (requestedAuthMode !== "clerk") missing.push("VITE_AUTH_MODE=clerk");
  if (!publishableKey) missing.push("VITE_CLERK_PUBLISHABLE_KEY");
  if (missing.length > 0) {
    throw new Error(`EdgeTrace production client env is incomplete: ${missing.join(", ")}`);
  }
}

export const clientAuthMode: AuthMode =
  !import.meta.env.PROD && (requestedAuthMode === "mock" || !publishableKey) ? "mock" : "clerk";

export const clerkProviderProps: Pick<ClerkProviderProps, "publishableKey" | "afterSignOutUrl"> = {
  publishableKey: publishableKey ?? "",
  afterSignOutUrl: "/"
};

export function MockAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() =>
    window.localStorage.getItem(AUTH_STORAGE_KEY) === "true" ? createMockUser() : null
  );

  const value = useMemo<AuthContextValue>(() => {
    const login = () => {
      const nextUser = createMockUser();
      window.localStorage.setItem(AUTH_STORAGE_KEY, "true");
      setUser(nextUser);
    };

    const signup = login;

    const logout = () => {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      setUser(null);
    };

    return {
      authMode: "mock",
      user,
      isAuthenticated: Boolean(user),
      isLoading: false,
      login,
      signup,
      logout,
      getAccessToken: async () => null
    };
  }, [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function ClerkAuthProvider({ children }: { children: ReactNode }) {
  const clerk = useClerk();
  const { isLoaded, isSignedIn, getToken } = useClerkSession();
  const { user: clerkUser, isLoaded: isUserLoaded } = useUser();

  const value = useMemo<AuthContextValue>(() => {
    const user: AuthUser | null =
      isSignedIn && clerkUser
        ? {
            id: clerkUser.id,
            email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
            name: clerkUser.fullName ?? clerkUser.username ?? undefined,
            createdAt: clerkUser.createdAt ? new Date(clerkUser.createdAt).toISOString() : undefined
          }
        : null;

    return {
      authMode: "clerk",
      user,
      isAuthenticated: Boolean(user),
      isLoading: !isLoaded || !isUserLoaded,
      login: () => clerk.openSignIn({ fallbackRedirectUrl: "/app/dashboard" }),
      signup: () => clerk.openSignUp({ fallbackRedirectUrl: "/app/dashboard" }),
      logout: () => void clerk.signOut({ redirectUrl: "/" }),
      getAccessToken: () => getToken()
    };
  }, [clerk, clerkUser, getToken, isLoaded, isSignedIn, isUserLoaded]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an EdgeTrace auth provider");
  return context;
}

function createMockUser(): AuthUser {
  return {
    id: MOCK_USER_ID,
    name: "EdgeTrace User",
    email: "user@edgetrace.local",
    createdAt: new Date().toISOString()
  };
}
