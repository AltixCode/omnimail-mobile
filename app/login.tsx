import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Mail,
  Lock,
  Server,
  Globe,
  ArrowRight,
  ShieldCheck,
  UserPlus,
  User,
  Check,
} from "lucide-react-native";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";
import { Input } from "../src/components/Input";
import { Button } from "../src/components/Button";
import { Spacing, Typography } from "../src/constants/theme";
import { DEFAULT_SERVER_URL } from "../src/services/storage";

const SERVER_PRESETS = [
  { label: "AltixCode Cloud", url: "https://webmail.altixcode.com" },
  { label: "Local Dev (3000)", url: "http://localhost:3000" },
  { label: "Android Emulator", url: "http://10.0.2.2:3000" },
];

export default function LoginScreen() {
  const { login, register, serverUrl } = useAuth();
  const { colors } = useTheme();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [url, setUrl] = useState(serverUrl || DEFAULT_SERVER_URL);
  const [isCustomServer, setIsCustomServer] = useState(false);

  // Form Fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);

    const targetUrl = url.trim().replace(/\/+$/, "");
    if (!targetUrl) {
      setError("Please select or enter an OmniMail server URL.");
      return;
    }

    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    if (mode === "register") {
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      try {
        setLoading(true);
        await register(
          {
            email: email.trim(),
            password,
            name: name.trim() || undefined,
          },
          targetUrl
        );
      } catch (err: any) {
        console.error("Registration failed:", err);
        setError(
          err.message || "Failed to create account. Please check your connection and server URL."
        );
      } finally {
        setLoading(false);
      }
    } else {
      try {
        setLoading(true);
        await login(email.trim(), password, targetUrl);
      } catch (err: any) {
        console.error("Login failed:", err);
        setError(
          err.message || "Failed to sign in. Please verify your credentials and server URL."
        );
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.logoContainer, { backgroundColor: colors.primaryLight }]}>
              <Mail size={36} color={colors.primary} />
            </View>
            <Text style={[styles.appTitle, { color: colors.textPrimary }]}>
              OmniMail
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Unified multi-account webmail & calendar
            </Text>

            {/* Aggregator Clarity Banner */}
            <View
              style={[
                styles.aggregatorBanner,
                {
                  backgroundColor: colors.surfaceHighlight,
                  borderColor: colors.border,
                },
              ]}
            >
              <ShieldCheck size={16} color={colors.primary} style={{ marginTop: 2, marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.aggregatorTitle, { color: colors.textPrimary }]}>
                  Email Aggregator, Not an Email Host
                </Text>
                <Text style={[styles.aggregatorText, { color: colors.textSecondary }]}>
                  OmniMail is an aggregator client. We do not provide @omnimail email accounts. Connect your existing mailboxes (Gmail, Fastmail, iCloud, or custom IMAP) after sign in.
                </Text>
              </View>
            </View>
          </View>

          {/* Server Selector Card */}
          <View
            style={[
              styles.serverCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.serverCardHeader}>
              <Server size={15} color={colors.primary} />
              <Text style={[styles.serverCardTitle, { color: colors.textPrimary }]}>
                OmniMail Server
              </Text>
            </View>

            {/* Presets Chips */}
            <View style={styles.presetChipsRow}>
              {SERVER_PRESETS.map((preset) => {
                const isSelected = !isCustomServer && url.trim() === preset.url;
                return (
                  <TouchableOpacity
                    key={preset.url}
                    style={[
                      styles.presetChip,
                      {
                        backgroundColor: isSelected ? colors.primaryLight : colors.surfaceHighlight,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => {
                      setUrl(preset.url);
                      setIsCustomServer(false);
                    }}
                  >
                    {isSelected && (
                      <Check size={12} color={colors.primary} style={{ marginRight: 4 }} />
                    )}
                    <Text
                      style={[
                        styles.presetChipText,
                        { color: isSelected ? colors.primary : colors.textSecondary },
                      ]}
                    >
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={[
                  styles.presetChip,
                  {
                    backgroundColor: isCustomServer ? colors.primaryLight : colors.surfaceHighlight,
                    borderColor: isCustomServer ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setIsCustomServer(true)}
              >
                {isCustomServer && (
                  <Check size={12} color={colors.primary} style={{ marginRight: 4 }} />
                )}
                <Text
                  style={[
                    styles.presetChipText,
                    { color: isCustomServer ? colors.primary : colors.textSecondary },
                  ]}
                >
                  Custom URL
                </Text>
              </TouchableOpacity>
            </View>

            {isCustomServer ? (
              <Input
                label="Custom Server Address"
                placeholder="https://mail.yourdomain.com"
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
                leftIcon={<Globe size={16} color={colors.textMuted} />}
                helperText="Enter the full URL of your OmniMail instance"
              />
            ) : (
              <Text style={[styles.activeServerUrlText, { color: colors.textMuted }]}>
                Connecting to: <Text style={{ color: colors.primary }}>{url}</Text>
              </Text>
            )}
          </View>

          {/* Main Auth Card */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            {/* Mode Switcher Tabs */}
            <View style={[styles.tabBar, { backgroundColor: colors.surfaceHighlight }]}>
              <TouchableOpacity
                style={[
                  styles.tabButton,
                  mode === "login" && [styles.activeTab, { backgroundColor: colors.surface }],
                ]}
                onPress={() => {
                  setMode("login");
                  setError(null);
                }}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    {
                      color: mode === "login" ? colors.primary : colors.textSecondary,
                      fontWeight: mode === "login" ? Typography.weights.semibold : Typography.weights.medium,
                    },
                  ]}
                >
                  Sign In
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.tabButton,
                  mode === "register" && [styles.activeTab, { backgroundColor: colors.surface }],
                ]}
                onPress={() => {
                  setMode("register");
                  setError(null);
                }}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    {
                      color: mode === "register" ? colors.primary : colors.textSecondary,
                      fontWeight: mode === "register" ? Typography.weights.semibold : Typography.weights.medium,
                    },
                  ]}
                >
                  Create Account
                </Text>
              </TouchableOpacity>
            </View>

            {error ? (
              <View style={[styles.errorBanner, { backgroundColor: colors.dangerLight }]}>
                <Text style={[styles.errorBannerText, { color: colors.danger }]}>
                  {error}
                </Text>
              </View>
            ) : null}

            {mode === "register" && (
              <Input
                label="Full Name (Optional)"
                placeholder="Alex Turner"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                leftIcon={<User size={18} color={colors.textMuted} />}
              />
            )}

            <Input
              label="Email Address"
              placeholder="user@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              leftIcon={<Mail size={18} color={colors.textMuted} />}
            />

            <Input
              label="Password"
              placeholder="••••••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              leftIcon={<Lock size={18} color={colors.textMuted} />}
              helperText={mode === "register" ? "Minimum 6 characters" : undefined}
            />

            {mode === "register" && (
              <Input
                label="Confirm Password"
                placeholder="••••••••••••"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                leftIcon={<Lock size={18} color={colors.textMuted} />}
              />
            )}

            <Button
              title={mode === "login" ? "Sign In" : "Create Account & Start"}
              onPress={handleSubmit}
              loading={loading}
              size="lg"
              style={styles.submitButton}
              icon={
                mode === "login" ? (
                  <ArrowRight size={18} color="#FFFFFF" />
                ) : (
                  <UserPlus size={18} color="#FFFFFF" />
                )
              }
            />

            {/* Quick Switch Link */}
            <TouchableOpacity
              onPress={() => {
                setMode(mode === "login" ? "register" : "login");
                setError(null);
              }}
              style={styles.switchModeButton}
            >
              <Text style={[styles.switchModeText, { color: colors.textSecondary }]}>
                {mode === "login"
                  ? "Don't have an OmniMail account? "
                  : "Already have an account? "}
                <Text style={{ color: colors.primary, fontWeight: Typography.weights.semibold }}>
                  {mode === "login" ? "Create one" : "Sign in"}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <ShieldCheck size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
            <Text style={[styles.footerText, { color: colors.textMuted }]}>
              Secure encrypted session with token-based authentication
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  logoContainer: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  appTitle: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: Typography.sizes.sm,
    textAlign: "center",
  },
  serverCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  serverCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
    gap: 6,
  },
  serverCardTitle: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  presetChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: Spacing.xs,
  },
  presetChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
  },
  activeServerUrlText: {
    fontSize: Typography.sizes.xs,
    marginTop: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  tabBar: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 10,
    marginBottom: Spacing.lg,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  activeTab: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabButtonText: {
    fontSize: Typography.sizes.sm,
  },
  errorBanner: {
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.md,
  },
  errorBannerText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
  },
  submitButton: {
    marginTop: Spacing.sm,
  },
  switchModeButton: {
    alignItems: "center",
    marginTop: Spacing.md,
    paddingVertical: 4,
  },
  switchModeText: {
    fontSize: Typography.sizes.xs,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  footerText: {
    fontSize: Typography.sizes.xs,
    textAlign: "center",
  },
  aggregatorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: Spacing.md,
    textAlign: "left",
  },
  aggregatorTitle: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    marginBottom: 2,
  },
  aggregatorText: {
    fontSize: Typography.sizes.xs - 1,
    lineHeight: 16,
  },
});
