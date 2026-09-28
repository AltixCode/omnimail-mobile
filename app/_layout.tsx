import React, { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import * as Notifications from "expo-notifications";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import {
  registerBackgroundNotificationTask,
  setupNotificationCategoriesAsync,
  handleNotificationActionResponse,
} from "../src/services/notifications";
import LoginScreen from "./login";

function RootNavigation() {
  const { isAuthenticated, isLoading } = useAuth();
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const segments = useSegments();

  // Notification response listener for interactive actions & navigation
  useEffect(() => {
    setupNotificationCategoriesAsync();
    registerBackgroundNotificationTask();

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        try {
          handleNotificationActionResponse(response, (path) => {
            router.push(path as any);
          });
        } catch (err) {
          console.warn("Failed to handle notification tap navigation:", err);
        }
      }
    );

    return () => {
      responseSubscription.remove();
    };
  }, [router]);

  if (isLoading) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <StatusBar style={isDark ? "light" : "dark"} />
        <LoginScreen />
      </>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="message/[id]"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="compose"
          options={{
            headerShown: false,
            presentation: "modal",
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootNavigation />
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
