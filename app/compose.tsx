import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  X,
  Send,
  ChevronDown,
  Check,
  Paperclip,
} from "lucide-react-native";
import { useTheme } from "../src/context/ThemeContext";
import { api } from "../src/services/api";
import { MailAccount } from "../src/types";
import { Spacing, Typography } from "../src/constants/theme";

export default function ComposeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    accountId?: string;
    to?: string;
    cc?: string;
    subject?: string;
    bodyText?: string;
    inReplyTo?: string;
    references?: string;
    threadId?: string;
  }>();

  const { colors } = useTheme();

  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    params.accountId || ""
  );
  const [showCc, setShowCc] = useState<boolean>(Boolean(params.cc));
  const [to, setTo] = useState<string>(params.to || "");
  const [cc, setCc] = useState<string>(params.cc || "");
  const [subject, setSubject] = useState<string>(params.subject || "");
  const [bodyText, setBodyText] = useState<string>(params.bodyText || "");

  const [sending, setSending] = useState(false);
  const [accountModalVisible, setAccountModalVisible] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const res = await api.accounts.list();
      setAccounts(res.accounts || []);
      if (!selectedAccountId && res.accounts.length > 0) {
        setSelectedAccountId(res.accounts[0].id);
      }
    } catch (err) {
      console.warn("Failed to load accounts for composer:", err);
    }
  };

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  const handleSend = async () => {
    if (!selectedAccountId) {
      Alert.alert("Missing Account", "Please select an account to send from.");
      return;
    }
    if (!to.trim()) {
      Alert.alert("Missing Recipient", "Please enter at least one recipient email address in 'To'.");
      return;
    }
    if (!subject.trim()) {
      Alert.alert("Missing Subject", "Please provide a subject line.");
      return;
    }

    try {
      setSending(true);
      await api.messages.send({
        accountId: selectedAccountId,
        to: to.trim(),
        cc: cc.trim() || undefined,
        subject: subject.trim(),
        bodyText,
        inReplyTo: params.inReplyTo,
        references: params.references,
        threadId: params.threadId,
      });

      Alert.alert("Sent", "Your email has been sent successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      console.error("Send error:", err);
      Alert.alert("Send Failed", err.message || "Failed to dispatch email. Please check your credentials.");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      {/* Top Header */}
      <View style={[styles.topHeader, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.closeButton}
          disabled={sending}
        >
          <X size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          New Message
        </Text>

        <TouchableOpacity
          onPress={handleSend}
          disabled={sending}
          style={[
            styles.sendButton,
            {
              backgroundColor: colors.primary,
              opacity: sending ? 0.7 : 1,
            },
          ]}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Send size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.sendButtonText}>Send</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
          {/* From Account Selector */}
          <TouchableOpacity
            style={[styles.fieldRow, { borderBottomColor: colors.border }]}
            onPress={() => setAccountModalVisible(true)}
          >
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              From:
            </Text>
            <View style={styles.fromAccountWrapper}>
              <Text
                numberOfLines={1}
                style={[styles.fromAccountText, { color: colors.textPrimary }]}
              >
                {selectedAccount
                  ? `${selectedAccount.label} <${selectedAccount.emailAddress}>`
                  : "Select sending account..."}
              </Text>
              <ChevronDown size={16} color={colors.textSecondary} style={{ marginLeft: 6 }} />
            </View>
          </TouchableOpacity>

          {/* To Field */}
          <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              To:
            </Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.textPrimary }]}
              placeholder="recipient@example.com"
              placeholderTextColor={colors.textMuted}
              value={to}
              onChangeText={setTo}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {!showCc && (
              <TouchableOpacity
                onPress={() => setShowCc(true)}
                style={styles.ccToggle}
              >
                <Text style={[styles.ccToggleText, { color: colors.primary }]}>
                  Cc
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Cc Field (Optional) */}
          {showCc && (
            <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                Cc:
              </Text>
              <TextInput
                style={[styles.fieldInput, { color: colors.textPrimary }]}
                placeholder="colleague@example.com"
                placeholderTextColor={colors.textMuted}
                value={cc}
                onChangeText={setCc}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          )}

          {/* Subject Field */}
          <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              Subject:
            </Text>
            <TextInput
              style={[
                styles.fieldInput,
                { color: colors.textPrimary, fontWeight: Typography.weights.medium },
              ]}
              placeholder="Subject"
              placeholderTextColor={colors.textMuted}
              value={subject}
              onChangeText={setSubject}
            />
          </View>

          {/* Body Multiline Input */}
          <TextInput
            style={[
              styles.bodyInput,
              {
                color: colors.textPrimary,
              },
            ]}
            placeholder="Compose email..."
            placeholderTextColor={colors.textMuted}
            value={bodyText}
            onChangeText={setBodyText}
            multiline
            textAlignVertical="top"
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Account Picker Modal */}
      <Modal
        visible={accountModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAccountModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setAccountModalVisible(false)}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Send From Account
            </Text>
            <ScrollView>
              {accounts.map((acc) => (
                <TouchableOpacity
                  key={acc.id}
                  style={[
                    styles.modalItem,
                    {
                      backgroundColor:
                        selectedAccountId === acc.id
                          ? colors.surfaceHighlight
                          : "transparent",
                    },
                  ]}
                  onPress={() => {
                    setSelectedAccountId(acc.id);
                    setAccountModalVisible(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modalItemText, { color: colors.textPrimary }]}>
                      {acc.label}
                    </Text>
                    <Text
                      style={[styles.modalItemSubtext, { color: colors.textMuted }]}
                    >
                      {acc.emailAddress}
                    </Text>
                  </View>
                  {selectedAccountId === acc.id && (
                    <Check size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  formScroll: {
    flex: 1,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldLabel: {
    width: 65,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
  },
  fromAccountWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  fromAccountText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
  },
  fieldInput: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    padding: 0,
  },
  ccToggle: {
    paddingLeft: Spacing.sm,
  },
  ccToggleText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  bodyInput: {
    flex: 1,
    padding: Spacing.lg,
    fontSize: Typography.sizes.base,
    lineHeight: 22,
    minHeight: 300,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  modalContent: {
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.lg,
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.md,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  modalItemText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.medium,
  },
  modalItemSubtext: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
});
