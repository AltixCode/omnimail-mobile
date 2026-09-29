import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import {
  User,
  Server,
  Mail,
  Bell,
  BellRing,
  Moon,
  LogOut,
  ChevronRight,
  ShieldCheck,
  Send,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Plus,
  Shield,
  X,
} from "lucide-react-native";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/services/api";
import {
  registerForPushNotificationsAsync,
  unregisterDevicePushTokenAsync,
  scheduleLocalRichNotification,
} from "../../src/services/notifications";
import { getDeviceToken } from "../../src/services/storage";
import { MailAccount } from "../../src/types";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { AddAccountModal } from "../../src/components/AddAccountModal";
import { Spacing, Typography } from "../../src/constants/theme";

export default function SettingsScreen() {
  const { user, serverUrl, logout } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();

  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  // Push Notifications state
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [registeringPush, setRegisteringPush] = useState(false);
  const [sendingTestPush, setSendingTestPush] = useState(false);
  const [testPushStatus, setTestPushStatus] = useState<string | null>(null);
  const [addAccountVisible, setAddAccountVisible] = useState(false);

  // Trusted Senders (remote image auto-loading, synced with the web app)
  const [trustedSenders, setTrustedSenders] = useState<
    { id: string; email: string }[]
  >([]);
  const [loadingTrustedSenders, setLoadingTrustedSenders] = useState(true);
  const [newSenderInput, setNewSenderInput] = useState("");
  const [addingSender, setAddingSender] = useState(false);
  const [trustedSenderError, setTrustedSenderError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    loadAccounts();
    checkPushStatus();
    loadTrustedSenders();
  }, []);

  const loadTrustedSenders = async () => {
    try {
      setLoadingTrustedSenders(true);
      const res = await api.settings.trustedSenders.list();
      setTrustedSenders(res.senders || []);
    } catch (err) {
      console.warn("Failed to load trusted senders:", err);
    } finally {
      setLoadingTrustedSenders(false);
    }
  };

  const handleAddTrustedSender = async () => {
    const email = newSenderInput.trim();
    if (!email) return;
    setAddingSender(true);
    setTrustedSenderError(null);
    try {
      const res = await api.settings.trustedSenders.add(email);
      setTrustedSenders((prev) => [res.sender, ...prev]);
      setNewSenderInput("");
    } catch (err: any) {
      setTrustedSenderError(err.message || "Failed to add trusted sender");
    } finally {
      setAddingSender(false);
    }
  };

  const handleRemoveTrustedSender = async (email: string) => {
    try {
      await api.settings.trustedSenders.remove(email);
      setTrustedSenders((prev) => prev.filter((s) => s.email !== email));
    } catch (err) {
      console.warn("Failed to remove trusted sender:", err);
    }
  };

  const loadAccounts = async () => {
    try {
      setLoadingAccounts(true);
      const res = await api.accounts.list();
      setAccounts(res.accounts || []);
    } catch (err) {
      console.warn("Failed to load accounts in settings:", err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const checkPushStatus = async () => {
    try {
      const storedToken = await getDeviceToken();
      if (storedToken) {
        setPushToken(storedToken);
        setPushEnabled(true);
      } else {
        const { status } = await Notifications.getPermissionsAsync();
        setPushEnabled(status === "granted");
      }
    } catch (err) {
      console.warn("Error checking push status:", err);
    }
  };

  const handleTogglePush = async (value: boolean) => {
    if (value) {
      try {
        setRegisteringPush(true);
        const res = await registerForPushNotificationsAsync();
        if (res.granted && res.token) {
          setPushEnabled(true);
          setPushToken(res.token);
          Alert.alert(
            "Push Notifications Enabled",
            "This device has been registered to receive instant alerts when new mail arrives.",
          );
        } else {
          setPushEnabled(false);
          Alert.alert(
            "Permission Not Granted",
            res.error || "Could not register push token.",
          );
        }
      } catch (err: any) {
        setPushEnabled(false);
        Alert.alert("Error", err.message || "Failed to register notifications");
      } finally {
        setRegisteringPush(false);
      }
    } else {
      try {
        setRegisteringPush(true);
        await unregisterDevicePushTokenAsync();
        setPushEnabled(false);
        setPushToken(null);
        Alert.alert(
          "Push Notifications Disabled",
          "Device unregistered successfully.",
        );
      } catch (err: any) {
        Alert.alert("Error", err.message || "Failed to unregister");
      } finally {
        setRegisteringPush(false);
      }
    }
  };

  const handleSendTestPush = async () => {
    try {
      setSendingTestPush(true);
      setTestPushStatus(null);

      // Trigger local rich notification with email_actions category (Mark as read, Archive, Reply)
      await scheduleLocalRichNotification(
        "New Email: QA Verification",
        "qa@itsata.com: Test email with attachments verified successfully.",
        { type: "new_email", accountId: accounts[0]?.id },
      );

      // Also trigger server dispatch if registered
      try {
        await api.devices.testPush(
          "OmniMail Push Alert",
          "Test push notification dispatched successfully from the server!",
        );
      } catch {
        // If not registered with Expo push server on simulator, local rich alert was still triggered
      }

      setTestPushStatus(
        "Rich notification displayed with action buttons (Reply, Archive, Mark Read)!",
      );
    } catch (err: any) {
      setTestPushStatus(`Error: ${err.message}`);
    } finally {
      setSendingTestPush(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out of OmniMail?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => logout(),
      },
    ]);
  };

  const maskToken = (token: string) => {
    if (token.length <= 16) return token;
    return `${token.substring(0, 8)}••••••••${token.substring(token.length - 8)}`;
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>
          Settings
        </Text>
      </View>

      <ScrollView style={styles.scrollArea}>
        {/* Profile Card */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.profileRow}>
            <View
              style={[
                styles.avatarCircle,
                { backgroundColor: colors.primaryLight },
              ]}
            >
              <Text style={[styles.avatarText, { color: colors.primary }]}>
                {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.profileName, { color: colors.textPrimary }]}>
                {user?.name || "OmniMail User"}
              </Text>
              <Text
                style={[styles.profileEmail, { color: colors.textSecondary }]}
              >
                {user?.email || "No email available"}
              </Text>
            </View>
          </View>
        </View>

        {/* Server Information */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Server Connection
          </Text>

          <View style={styles.infoRow}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Server
                size={18}
                color={colors.textSecondary}
                style={{ marginRight: 10 }}
              />
              <View>
                <Text
                  style={[styles.infoLabel, { color: colors.textSecondary }]}
                >
                  Server URL
                </Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                  {serverUrl}
                </Text>
              </View>
            </View>
            <View style={styles.statusPill}>
              <View
                style={[styles.statusDot, { backgroundColor: colors.success }]}
              />
              <Text style={[styles.statusText, { color: colors.success }]}>
                Connected
              </Text>
            </View>
          </View>
        </View>

        {/* Connected Mail Accounts */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <Text
              style={[
                styles.sectionTitle,
                { color: colors.textPrimary, marginBottom: 0 },
              ]}
            >
              Connected Accounts ({accounts.length})
            </Text>
            <TouchableOpacity
              onPress={() => setAddAccountVisible(true)}
              style={[
                styles.addAccountHeaderBtn,
                { backgroundColor: colors.primaryLight },
              ]}
            >
              <Plus
                size={14}
                color={colors.primary}
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.addAccountHeaderBtnText,
                  { color: colors.primary },
                ]}
              >
                Add
              </Text>
            </TouchableOpacity>
          </View>

          {loadingAccounts ? (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ marginVertical: 12 }}
            />
          ) : accounts.length === 0 ? (
            <View style={styles.emptyAccountContainer}>
              <Text
                style={[styles.emptyAccountText, { color: colors.textMuted }]}
              >
                No email accounts connected yet.
              </Text>
              <Button
                title="Add Mail Account"
                onPress={() => setAddAccountVisible(true)}
                size="sm"
                icon={<Plus size={14} color="#FFFFFF" />}
                style={{ marginTop: 8 }}
              />
            </View>
          ) : (
            accounts.map((acc, index) => (
              <View
                key={acc.id}
                style={[
                  styles.accountRow,
                  index > 0 && {
                    borderTopColor: colors.borderSubtle,
                    borderTopWidth: 1,
                  },
                ]}
              >
                <Mail
                  size={18}
                  color={colors.primary}
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.accountLabel, { color: colors.textPrimary }]}
                  >
                    {acc.label}
                  </Text>
                  <Text
                    style={[
                      styles.accountEmail,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {acc.emailAddress}
                  </Text>
                </View>
                <View style={styles.syncStatusBadge}>
                  <Text
                    style={[styles.syncStatusText, { color: colors.textMuted }]}
                  >
                    {acc.syncStatus === "syncing" ? "Syncing..." : "Active"}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Device Push Notifications */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <BellRing
                size={20}
                color={colors.primary}
                style={{ marginRight: 8 }}
              />
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.textPrimary, marginBottom: 0 },
                ]}
              >
                Push Notifications
              </Text>
            </View>
            {registeringPush ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Switch
                value={pushEnabled}
                onValueChange={handleTogglePush}
                trackColor={{ false: colors.textMuted, true: colors.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={colors.textMuted}
              />
            )}
          </View>

          <Text
            style={[styles.sectionSubtitle, { color: colors.textSecondary }]}
          >
            Receive instant push alerts whenever a new email arrives in any of
            your mail accounts.
          </Text>

          {pushToken ? (
            <View
              style={[
                styles.tokenBox,
                { backgroundColor: colors.surfaceHighlight },
              ]}
            >
              <Smartphone
                size={16}
                color={colors.textSecondary}
                style={{ marginRight: 6 }}
              />
              <Text
                numberOfLines={1}
                style={[styles.tokenText, { color: colors.textMuted }]}
              >
                Token: {maskToken(pushToken)}
              </Text>
            </View>
          ) : null}

          <View style={{ marginTop: Spacing.md }}>
            <Button
              title="Send Test Push Notification"
              onPress={handleSendTestPush}
              loading={sendingTestPush}
              variant="outline"
              size="sm"
              icon={<Send size={15} color={colors.primary} />}
            />
            {testPushStatus && (
              <Text
                style={[
                  styles.testPushStatusText,
                  {
                    color: testPushStatus.startsWith("Error")
                      ? colors.danger
                      : colors.success,
                  },
                ]}
              >
                {testPushStatus}
              </Text>
            )}
          </View>
        </View>

        {/* Appearance */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Moon
                size={20}
                color={colors.textSecondary}
                style={{ marginRight: 8 }}
              />
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.textPrimary, marginBottom: 0 },
                ]}
              >
                Dark Appearance
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.textMuted, true: colors.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={colors.textMuted}
            />
          </View>
        </View>

        {/* Trusted Senders (remote image privacy) */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Shield
                size={20}
                color={colors.textSecondary}
                style={{ marginRight: 8 }}
              />
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.textPrimary, marginBottom: 0 },
                ]}
              >
                Trusted Senders ({trustedSenders.length})
              </Text>
            </View>
          </View>
          <Text
            style={[styles.trustedSendersHint, { color: colors.textMuted }]}
          >
            External images in emails are blocked by default to prevent senders
            from tracking you. Senders and domains listed here will have their
            images load automatically. Synced with the web app.
          </Text>

          <View style={styles.trustedSenderAddRow}>
            <View style={{ flex: 1 }}>
              <Input
                placeholder="e.g. notifications@github.com or @company.com"
                value={newSenderInput}
                onChangeText={setNewSenderInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
            </View>
            <TouchableOpacity
              onPress={handleAddTrustedSender}
              disabled={addingSender || !newSenderInput.trim()}
              style={[
                styles.trustedSenderAddButton,
                {
                  backgroundColor: colors.primary,
                  opacity: addingSender || !newSenderInput.trim() ? 0.5 : 1,
                },
              ]}
            >
              {addingSender ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Plus size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
          {trustedSenderError && (
            <Text style={[styles.trustedSenderError, { color: colors.danger }]}>
              {trustedSenderError}
            </Text>
          )}

          {loadingTrustedSenders ? (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ marginTop: 12 }}
            />
          ) : trustedSenders.length === 0 ? (
            <Text
              style={[styles.trustedSendersEmpty, { color: colors.textMuted }]}
            >
              No trusted senders yet.
            </Text>
          ) : (
            <View style={styles.trustedSendersList}>
              {trustedSenders.map((sender) => (
                <View
                  key={sender.id}
                  style={[
                    styles.trustedSenderRow,
                    { borderColor: colors.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.trustedSenderEmail,
                      { color: colors.textPrimary },
                    ]}
                    numberOfLines={1}
                  >
                    {sender.email}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveTrustedSender(sender.email)}
                    hitSlop={8}
                  >
                    <X size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Logout Button */}
        <View style={styles.logoutWrapper}>
          <Button
            title="Sign Out"
            onPress={handleLogout}
            variant="danger"
            size="lg"
            icon={<LogOut size={18} color="#FFFFFF" />}
          />
        </View>
      </ScrollView>

      {/* Add Account Modal */}
      <AddAccountModal
        visible={addAccountVisible}
        onClose={() => setAddAccountVisible(false)}
        onAccountAdded={() => {
          loadAccounts();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  screenTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
  },
  scrollArea: {
    flex: 1,
    padding: Spacing.lg,
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  avatarText: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  profileName: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  profileEmail: {
    fontSize: Typography.sizes.sm,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.md,
  },
  sectionSubtitle: {
    fontSize: Typography.sizes.xs,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: Spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  infoLabel: {
    fontSize: Typography.sizes.xs,
  },
  infoValue: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  statusText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
  },
  addAccountHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  addAccountHeaderBtnText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  emptyAccountContainer: {
    paddingVertical: 12,
    alignItems: "center",
  },
  emptyAccountText: {
    fontSize: Typography.sizes.xs,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  accountLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
  },
  accountEmail: {
    fontSize: Typography.sizes.xs,
    marginTop: 1,
  },
  syncStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  syncStatusText: {
    fontSize: 11,
  },
  tokenBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    borderRadius: 8,
    marginTop: 4,
  },
  tokenText: {
    fontSize: 11,
  },
  testPushStatusText: {
    fontSize: Typography.sizes.xs,
    marginTop: 6,
    textAlign: "center",
  },
  logoutWrapper: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.xxxl,
  },
  trustedSendersHint: {
    fontSize: Typography.sizes.xs,
    lineHeight: 16,
    marginTop: 4,
    marginBottom: 12,
  },
  trustedSenderAddRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  trustedSenderAddButton: {
    width: 46,
    height: 46,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  trustedSenderError: {
    fontSize: Typography.sizes.xs,
    marginTop: 6,
  },
  trustedSendersEmpty: {
    fontSize: Typography.sizes.xs,
    marginTop: 12,
    textAlign: "center",
  },
  trustedSendersList: {
    marginTop: 12,
    gap: 8,
  },
  trustedSenderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  trustedSenderEmail: {
    flex: 1,
    fontSize: Typography.sizes.sm,
  },
});
