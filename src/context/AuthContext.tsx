import React, { createContext, useContext, useState, useEffect } from "react";
import { User } from "../types";
import {
  getServerUrl,
  setServerUrl as storeServerUrl,
  getAuthToken,
  getUser,
  DEFAULT_SERVER_URL,
} from "../services/storage";
import { api } from "../services/api";
import { unregisterDevicePushTokenAsync } from "../services/notifications";

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  token: string | null;
  serverUrl: string;
  setServerUrl: (url: string) => Promise<void>;
  login: (email: string, password: string, customServerUrl?: string) => Promise<void>;
  register: (
    data: { email: string; password: string; name?: string },
    customServerUrl?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrlState] = useState<string>(DEFAULT_SERVER_URL);

  useEffect(() => {
    restoreSession();
  }, []);

  const restoreSession = async () => {
    try {
      setIsLoading(true);
      const [savedUrl, savedToken, savedUser] = await Promise.all([
        getServerUrl(),
        getAuthToken(),
        getUser(),
      ]);

      setServerUrlState(savedUrl || DEFAULT_SERVER_URL);

      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(savedUser);
        setIsAuthenticated(true);

        // Verify session validity with backend in background
        api.auth
          .me()
          .then((res) => {
            if (res.user) {
              setUser(res.user);
            }
          })
          .catch((err) => {
            if (err.status === 401) {
              // Token expired or invalid
              logout();
            }
          });
      }
    } catch (error) {
      console.warn("Session restoration error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetServerUrl = async (url: string) => {
    const cleaned = url.trim().replace(/\/+$/, "");
    await storeServerUrl(cleaned);
    setServerUrlState(cleaned);
  };

  const login = async (
    email: string,
    password: string,
    customServerUrl?: string
  ) => {
    if (customServerUrl) {
      await handleSetServerUrl(customServerUrl);
    }
    const targetUrl = customServerUrl || serverUrl;
    const { user: loggedInUser, token: authToken } = await api.auth.login(
      email,
      password,
      targetUrl
    );

    setUser(loggedInUser);
    setToken(authToken);
    setIsAuthenticated(true);
  };

  const register = async (
    data: { email: string; password: string; name?: string },
    customServerUrl?: string
  ) => {
    if (customServerUrl) {
      await handleSetServerUrl(customServerUrl);
    }
    const targetUrl = customServerUrl || serverUrl;
    const { user: registeredUser, token: authToken } = await api.auth.register(
      data,
      targetUrl
    );

    setUser(registeredUser);
    setToken(authToken);
    setIsAuthenticated(true);
  };

  const logout = async () => {
    try {
      await unregisterDevicePushTokenAsync();
      await api.auth.logout();
    } catch (e) {
      console.warn("Error during logout:", e);
    } finally {
      setUser(null);
      setToken(null);
      setIsAuthenticated(false);
    }
  };

  const refreshSession = async () => {
    await restoreSession();
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        token,
        serverUrl,
        setServerUrl: handleSetServerUrl,
        login,
        register,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
