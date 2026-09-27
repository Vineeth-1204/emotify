import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import { ConvexReactClient } from "convex/react";
import { AppState, AppStateStatus } from "react-native";
import { api } from "../convex/_generated/api";

interface User {
  id: string;
  full_name: string;
  mobile_number: string;
  role: string;
  status: string;
  is_first_login?: boolean;
  onboardingComplete?: boolean;
  screeningComplete?: boolean;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  isLoggingOut: boolean;
  isAuthenticated: boolean;
  register: (params: {
    full_name: string;
    mobile_number: string;
    password: string;
    email?: string;
  }) => Promise<{ error?: string }>;
  login: (mobile_number: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  updateUser: (updatedUser: User) => void;
  loginWithBiometrics: () => Promise<{ error?: string }>;
  biometricsEnabled: boolean;
  setBiometricsEnabled: (enabled: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children, convex }: { children: React.ReactNode; convex: ConvexReactClient }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);

  const tokenRef = useRef<string | null>(null);
  const isLoggingOutRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { tokenRef.current = token; }, [token]);

  useEffect(() => {
    async function loadStorageAndValidate() {
      try {
        const savedToken = await SecureStore.getItemAsync("mobile_token");
        const savedUserStr = await SecureStore.getItemAsync("mobile_user");
        const isBiometricEnabled = await SecureStore.getItemAsync("biometric_enabled");

        setBiometricsEnabled(isBiometricEnabled === "true");

        if (savedToken && savedUserStr) {
          // Validate current session token with Convex backend
          const validatedUser = await convex.mutation(api.users.validateSession, { token: savedToken });
          if (validatedUser) {
            const mappedUser: User = {
              id: validatedUser.id,
              full_name: validatedUser.full_name || "",
              mobile_number: validatedUser.mobile_number || "",
              role: validatedUser.role || "",
              status: validatedUser.status || "",
              is_first_login: validatedUser.is_first_login,
              onboardingComplete: validatedUser.onboardingComplete,
              screeningComplete: validatedUser.screeningComplete,
            };
            setToken(savedToken);
            tokenRef.current = savedToken;
            setUser(mappedUser);
            await SecureStore.setItemAsync("mobile_user", JSON.stringify(mappedUser));
          } else {
            // Invalid/Expired session - clean up local storage
            await SecureStore.deleteItemAsync("mobile_token").catch(() => {});
            await SecureStore.deleteItemAsync("mobile_user").catch(() => {});
          }
        }
      } catch (e) {
        console.error("Failed to load secure store / validate session", e);
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

      const mappedUser: User = {
        id: data.user.id,
        full_name: data.user.full_name || "",
        mobile_number: data.user.mobile_number || "",
        role: data.user.role || "",
        status: data.user.status || "",
        is_first_login: data.user.is_first_login,
        onboardingComplete: data.user.onboardingComplete,
        screeningComplete: data.user.screeningComplete,
      };

      tokenRef.current = data.token;
      setToken(data.token);
      setUser(mappedUser);

      await SecureStore.setItemAsync("mobile_token", data.token);
      await SecureStore.setItemAsync("mobile_user", JSON.stringify(mappedUser));

      // Enable biometric login automatically (saves silently without triggering prompt on write)
      if (data.biometricToken) {
        await SecureStore.setItemAsync("biometric_token", data.biometricToken);
        await SecureStore.setItemAsync("biometric_enabled", "true");
        setBiometricsEnabled(true);
      }

      return {};
    } catch (e: any) {
      return { error: e.message || "Network request failed" };
    }
  };

  const register = async (params: {
    full_name: string;
    mobile_number: string;
    password: string;
    email?: string;
  }) => {
    try {
      const data = await convex.mutation(api.users.registerStudent, params);

      if (data.error || !data.token || !data.user) {
        return { error: data.error || "Registration failed" };
      }

      const mappedUser: User = {
        id: data.user.id,
        full_name: data.user.full_name || "",
        mobile_number: data.user.mobile_number || "",
        role: data.user.role || "",
        status: data.user.status || "",
        is_first_login: data.user.is_first_login,
        onboardingComplete: data.user.onboardingComplete,
        screeningComplete: data.user.screeningComplete,
      };

      tokenRef.current = data.token;
      setToken(data.token);
      setUser(mappedUser);

      await SecureStore.setItemAsync("mobile_token", data.token);
      await SecureStore.setItemAsync("mobile_user", JSON.stringify(mappedUser));

      return {};
    } catch (e: any) {
      return { error: e.message || "Network request failed" };
    }
  };

  const loginWithBiometrics = async () => {
    try {
      // 1. Check if biometrics is supported and enrolled
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        return { error: "Biometrics not configured on this device." };
      }

      // 2. Prompt user for biometrics
      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: "Authenticate to login to Emotify",
        disableDeviceFallback: false,
      });

      if (!authResult.success) {
        return { error: "Biometric authentication failed." };
      }

      // 3. Retrieve the biometric token from secure storage
      const biometricToken = await SecureStore.getItemAsync("biometric_token");

      if (!biometricToken) {
        return { error: "No biometric credentials saved. Please log in with password first." };
      }

      const data = await convex.mutation(api.users.biometricLogin, { biometricToken });

      if (data.error || !data.token || !data.user) {
        return { error: data.error || "Biometric login failed" };
      }

      const mappedUser: User = {
        id: data.user.id,
        full_name: data.user.full_name || "",
        mobile_number: data.user.mobile_number || "",
        role: data.user.role || "",
        status: data.user.status || "",
        is_first_login: data.user.is_first_login,
        onboardingComplete: data.user.onboardingComplete,
        screeningComplete: data.user.screeningComplete,
      };

      tokenRef.current = data.token;
      setToken(data.token);
      setUser(mappedUser);

      await SecureStore.setItemAsync("mobile_token", data.token);
      await SecureStore.setItemAsync("mobile_user", JSON.stringify(mappedUser));

      return {};
    } catch (e: any) {
      return { error: e.message || "Biometric authentication failed" };
    }
  };

  const logout = async () => {
    isLoggingOutRef.current = true;
    setIsLoggingOut(true);
    
    const currentToken = tokenRef.current;
    
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    
    try {
      if (currentToken) {
        await convex.mutation(api.users.logout, { token: currentToken }).catch(() => {});
      }
      
      await Promise.all([
        SecureStore.deleteItemAsync("mobile_token").catch(() => {}),
        SecureStore.deleteItemAsync("mobile_user").catch(() => {}),
      ]);
    } finally {
      isLoggingOutRef.current = false;
      setIsLoggingOut(false);
    }
  };

  const lastBackgroundTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === "background") {
        lastBackgroundTimeRef.current = Date.now();
      } else if (nextAppState === "active") {
        if (lastBackgroundTimeRef.current !== null) {
          const elapsed = Date.now() - lastBackgroundTimeRef.current;
          const fifteenMinutes = 15 * 60 * 1000;
          if (elapsed > fifteenMinutes) {
            if (tokenRef.current) {
              console.log("Inactivity limit exceeded. Logging out user automatically.");
              await logout();
            }
          }
        }
        lastBackgroundTimeRef.current = null;
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  const updateUser = async (updatedUser: User) => {
    setUser(updatedUser);
    await SecureStore.setItemAsync("mobile_user", JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isLoading,
        isLoggingOut,
        isAuthenticated: !!token,
        register,
        login,
        logout,
        updateUser,
        loginWithBiometrics,
        biometricsEnabled,
        setBiometricsEnabled,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAppAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAppAuth must be used within an AuthProvider");
  }
  return context;
}
