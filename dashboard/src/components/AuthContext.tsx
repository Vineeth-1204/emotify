import React, { createContext, useContext, useState, useEffect } from "react";
import { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";

interface User {
  id: string;
  full_name: string;
  mobile_number: string;
  role: string;
  status: string;
  is_first_login?: boolean;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  /** True for administrators; counsellors see only their assigned caseload. */
  isAdmin: boolean;
  login: (mobile_number: string, password: string) => Promise<{ error?: string }>;
  logout: () => void;
}

const STAFF_ROLES = ["admin", "counsellor"];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children, convex }: { children: React.ReactNode; convex: ConvexReactClient }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("dashboard_token"));
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("dashboard_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStorageAndValidate() {
      try {
        const savedToken = localStorage.getItem("dashboard_token");
        const savedUserStr = localStorage.getItem("dashboard_user");

        if (savedToken && savedUserStr) {
          const validatedUser = await convex.mutation(api.users.validateSession, { token: savedToken });
          if (validatedUser && STAFF_ROLES.includes(validatedUser.role ?? "")) {
            const mappedUser: User = {
              id: validatedUser.id,
              full_name: validatedUser.full_name || "",
              mobile_number: validatedUser.mobile_number || "",
              role: validatedUser.role || "",
              status: validatedUser.status || "",
              is_first_login: validatedUser.is_first_login || false,
            };
            setToken(savedToken);
            setUser(mappedUser);
            localStorage.setItem("dashboard_user", JSON.stringify(mappedUser));
          } else {
            // Invalid/Expired session - clean up local storage
            setToken(null);
            setUser(null);
            localStorage.removeItem("dashboard_token");
            localStorage.removeItem("dashboard_user");
          }
        }
      } catch (e) {
        console.error("Failed to load storage / validate session", e);
      } finally {
        setIsLoading(false);
      }
    }
    loadStorageAndValidate();
  }, [convex]);

  const login = async (mobile_number: string, password: string) => {
    try {
      const data = await convex.mutation(api.users.login, { mobile_number, password });

      if (data.error || !data.token || !data.user) {
        return { error: data.error || "Login failed" };
      }

      if (!STAFF_ROLES.includes(data.user.role ?? "")) {
        return { error: "Access denied. Staff (admin or counsellor) access only." };
      }

      const mappedUser: User = {
        id: data.user.id,
        full_name: data.user.full_name || "",
        mobile_number: data.user.mobile_number || "",
        role: data.user.role || "",
        status: data.user.status || "",
        is_first_login: data.user.is_first_login || false,
      };

      setToken(data.token);
      setUser(mappedUser);

      localStorage.setItem("dashboard_token", data.token);
      localStorage.setItem("dashboard_user", JSON.stringify(mappedUser));

      return {};
    } catch (e: any) {
      return { error: e.message || "Failed to connect to authentication server." };
    }
  };

  const logout = () => {
    const currentToken = token || localStorage.getItem("dashboard_token");
    setToken(null);
    setUser(null);
    localStorage.removeItem("dashboard_token");
    localStorage.removeItem("dashboard_user");
    if (currentToken) {
      convex.mutation(api.users.logout, { token: currentToken }).catch(() => {});
    }
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isLoading,
        isAdmin: user?.role === "admin",
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useDashboardAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useDashboardAuth must be used within an AuthProvider");
  }
  return context;
}

export function useConvexAuth() {
  const { isLoading, token } = useDashboardAuth();
  
  const fetchAccessToken = React.useCallback(async () => {
    return token;
  }, [token]);

  return React.useMemo(() => ({
    isLoading,
    isAuthenticated: !!token,
    fetchAccessToken,
  }), [isLoading, token, fetchAccessToken]);
}
