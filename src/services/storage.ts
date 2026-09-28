import * as SecureStore from "expo-secure-store";
import { User } from "../types";

export const DEFAULT_SERVER_URL = "https://webmail.altixcode.com";

const KEYS = {
  SERVER_URL: "omnimail_server_url",
  AUTH_TOKEN: "omnimail_auth_token",
  USER: "omnimail_user_profile",
  DEVICE_TOKEN: "omnimail_device_token",
};

export async function getServerUrl(): Promise<string> {
  try {
    const url = await SecureStore.getItemAsync(KEYS.SERVER_URL);
    return (url && url.trim()) || DEFAULT_SERVER_URL;
  } catch (error) {
    console.warn("Error reading server URL from secure store:", error);
    return DEFAULT_SERVER_URL;
  }
}

export async function setServerUrl(url: string): Promise<void> {
  try {
    const cleaned = url.trim().replace(/\/+$/, "");
    await SecureStore.setItemAsync(KEYS.SERVER_URL, cleaned);
  } catch (error) {
    console.error("Error setting server URL in secure store:", error);
  }
}

export async function getAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.AUTH_TOKEN);
  } catch (error) {
    console.warn("Error reading auth token from secure store:", error);
    return null;
  }
}

export async function setAuthToken(token: string | null): Promise<void> {
  try {
    if (token) {
      await SecureStore.setItemAsync(KEYS.AUTH_TOKEN, token);
    } else {
      await SecureStore.deleteItemAsync(KEYS.AUTH_TOKEN);
    }
  } catch (error) {
    console.error("Error updating auth token in secure store:", error);
  }
}

export async function getUser(): Promise<User | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEYS.USER);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch (error) {
    console.warn("Error reading user profile from secure store:", error);
    return null;
  }
}

export async function setUser(user: User | null): Promise<void> {
  try {
    if (user) {
      await SecureStore.setItemAsync(KEYS.USER, JSON.stringify(user));
    } else {
      await SecureStore.deleteItemAsync(KEYS.USER);
    }
  } catch (error) {
    console.error("Error updating user profile in secure store:", error);
  }
}

export async function getDeviceToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.DEVICE_TOKEN);
  } catch (error) {
    return null;
  }
}

export async function setDeviceToken(token: string | null): Promise<void> {
  try {
    if (token) {
      await SecureStore.setItemAsync(KEYS.DEVICE_TOKEN, token);
    } else {
      await SecureStore.deleteItemAsync(KEYS.DEVICE_TOKEN);
    }
  } catch (error) {
    console.error("Error storing device token:", error);
  }
}

export async function clearAllAuthData(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEYS.AUTH_TOKEN);
    await SecureStore.deleteItemAsync(KEYS.USER);
  } catch (error) {
    console.error("Error clearing auth data:", error);
  }
}
