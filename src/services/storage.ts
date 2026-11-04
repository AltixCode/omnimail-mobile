import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { User, ContactEntry } from "../types";

export const DEFAULT_SERVER_URL = "https://webmail.altixcode.com";

const KEYS = {
  SERVER_URL: "omnimail_server_url",
  AUTH_TOKEN: "omnimail_auth_token",
  USER: "omnimail_user_profile",
  DEVICE_TOKEN: "omnimail_device_token",
  CONTACTS: "omnimail_contacts_list",
};

// Web localStorage shim for browser / web preview testing
const webStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {}
    return null;
  },
  setItem: (key: string, val: string): void => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, val);
      }
    } catch {}
  },
  deleteItem: (key: string): void => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {}
  },
};

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return webStorage.getItem(key);
  }
  return await SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    webStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    webStorage.deleteItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function getServerUrl(): Promise<string> {
  try {
    const url = await getItem(KEYS.SERVER_URL);
    return (url && url.trim()) || DEFAULT_SERVER_URL;
  } catch (error) {
    console.warn("Error reading server URL from store:", error);
    return DEFAULT_SERVER_URL;
  }
}

export async function setServerUrl(url: string): Promise<void> {
  try {
    const cleaned = url.trim().replace(/\/+$/, "");
    await setItem(KEYS.SERVER_URL, cleaned);
  } catch (error) {
    console.error("Error setting server URL in store:", error);
  }
}

export async function getAuthToken(): Promise<string | null> {
  try {
    return await getItem(KEYS.AUTH_TOKEN);
  } catch (error) {
    console.warn("Error reading auth token from store:", error);
    return null;
  }
}

export async function setAuthToken(token: string | null): Promise<void> {
  try {
    if (token) {
      await setItem(KEYS.AUTH_TOKEN, token);
    } else {
      await deleteItem(KEYS.AUTH_TOKEN);
    }
  } catch (error) {
    console.error("Error updating auth token in store:", error);
  }
}

export async function getUser(): Promise<User | null> {
  try {
    const raw = await getItem(KEYS.USER);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch (error) {
    console.warn("Error reading user profile from store:", error);
    return null;
  }
}

export async function setUser(user: User | null): Promise<void> {
  try {
    if (user) {
      await setItem(KEYS.USER, JSON.stringify(user));
    } else {
      await deleteItem(KEYS.USER);
    }
  } catch (error) {
    console.error("Error updating user profile in store:", error);
  }
}

export async function getDeviceToken(): Promise<string | null> {
  try {
    return await getItem(KEYS.DEVICE_TOKEN);
  } catch (error) {
    return null;
  }
}

export async function setDeviceToken(token: string | null): Promise<void> {
  try {
    if (token) {
      await setItem(KEYS.DEVICE_TOKEN, token);
    } else {
      await deleteItem(KEYS.DEVICE_TOKEN);
    }
  } catch (error) {
    console.error("Error storing device token:", error);
  }
}

export async function clearAllAuthData(): Promise<void> {
  try {
    await deleteItem(KEYS.AUTH_TOKEN);
    await deleteItem(KEYS.USER);
  } catch (error) {
    console.error("Error clearing auth data:", error);
  }
}

export async function getStoredContacts(): Promise<ContactEntry[]> {
  try {
    const raw = await getItem(KEYS.CONTACTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Error reading stored contacts:", error);
    return [];
  }
}

export async function saveStoredContacts(contacts: ContactEntry[]): Promise<void> {
  try {
    await setItem(KEYS.CONTACTS, JSON.stringify(contacts.slice(0, 200)));
  } catch (error) {
    console.error("Error saving stored contacts:", error);
  }
}

export async function addStoredContacts(
  newRecipients: Array<{ address: string; name?: string | null } | string>
): Promise<void> {
  try {
    const existing = await getStoredContacts();
    const map = new Map<string, ContactEntry>();
    for (const c of existing) {
      map.set(c.address.toLowerCase(), c);
    }

    const nowStr = new Date().toISOString();
    for (const item of newRecipients) {
      const address = typeof item === "string" ? item.trim() : item.address.trim();
      const name = typeof item === "string" ? null : item.name?.trim() || null;
      if (!address || !address.includes("@")) continue;

      const cleanAddr = address.replace(/^<|>$/g, "").toLowerCase();
      const current = map.get(cleanAddr);
      if (current) {
        current.count = (current.count || 1) + 2;
        current.lastContactedAt = nowStr;
        if (!current.name && name) current.name = name;
      } else {
        const entry: ContactEntry = {
          address: cleanAddr,
          name: name || null,
          lastContactedAt: nowStr,
          count: 2,
        };
        map.set(cleanAddr, entry);
      }
    }

    const updated = Array.from(map.values()).sort((a, b) => {
      if ((b.count || 0) !== (a.count || 0)) return (b.count || 0) - (a.count || 0);
      const dateA = a.lastContactedAt ? new Date(a.lastContactedAt).getTime() : 0;
      const dateB = b.lastContactedAt ? new Date(b.lastContactedAt).getTime() : 0;
      return dateB - dateA;
    });

    await saveStoredContacts(updated);
  } catch (error) {
    console.error("Error updating stored contacts:", error);
  }
}
