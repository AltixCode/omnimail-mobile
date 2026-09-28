import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { X, Plus, Mail, Lock, Server, Check, ShieldAlert } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { Input } from "./Input";
import { Button } from "./Button";
import { api } from "../services/api";
import { Spacing, Typography } from "../constants/theme";

interface AddAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onAccountAdded: () => void;
}

const PROVIDER_PRESETS = [
  {
    name: "Fastmail",
    imapHost: "imap.fastmail.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.fastmail.com",
    smtpPort: 465,
    smtpSecure: true,
  },
  {
    name: "Gmail",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
  },
  {
    name: "iCloud",
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587,
    smtpSecure: false,
  },
  {
    name: "Custom IMAP",
    imapHost: "",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "",
    smtpPort: 587,
    smtpSecure: false,
  },
];

export function AddAccountModal({
  visible,
  onClose,
  onAccountAdded,
}: AddAccountModalProps) {
  const { colors } = useTheme();

  const [selectedProvider, setSelectedProvider] = useState("Fastmail");
  const [label, setLabel] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");

  const [imapHost, setImapHost] = useState("imap.fastmail.com");
  const [imapPort, setImapPort] = useState("993");
  const [imapSecure, setImapSecure] = useState(true);

  const [smtpHost, setSmtpHost] = useState("smtp.fastmail.com");
  const [smtpPort, setSmtpPort] = useState("465");
  const [smtpSecure, setSmtpSecure] = useState(true);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectPreset = (preset: typeof PROVIDER_PRESETS[0]) => {
    setSelectedProvider(preset.name);
    setImapHost(preset.imapHost);
    setImapPort(preset.imapPort.toString());
    setImapSecure(preset.imapSecure);
    setSmtpHost(preset.smtpHost);
    setSmtpPort(preset.smtpPort.toString());
    setSmtpSecure(preset.smtpSecure);
  };

  const handleSave = async () => {
    setError(null);
    if (!emailAddress.trim() || !password) {
      setError("Email address and password are required.");
      return;
    }
    if (!imapHost.trim() || !smtpHost.trim()) {
      setError("IMAP and SMTP hostnames are required.");
      return;
    }

    try {
      setLoading(true);

      const accountLabel = label.trim() || emailAddress.trim();
      const userEmail = emailAddress.trim();

      // Create account on OmniMail backend
      await api.accounts.create({
        label: accountLabel,
        emailAddress: userEmail,
        imapHost: imapHost.trim(),
        imapPort: parseInt(imapPort, 10) || 993,
        imapSecure,
        imapUser: userEmail,
        imapPassword: password,
        smtpHost: smtpHost.trim(),
        smtpPort: parseInt(smtpPort, 10) || 587,
        smtpSecure,
        smtpUser: userEmail,
        smtpPassword: password,
      });

      // Trigger initial sync
      api.sync.trigger().catch(() => {});

      Alert.alert("Account Added", `Successfully connected ${accountLabel}!`);
      onAccountAdded();
      onClose();
    } catch (err: any) {
      console.error("Failed to add account:", err);
      setError(err.message || "Failed to connect mail account. Check credentials and server settings.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.backdrop}
      >
        <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                Add Mail Account
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Connect an external IMAP / SMTP mailbox
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {error && (
              <View style={[styles.errorBox, { backgroundColor: colors.dangerLight }]}>
                <ShieldAlert size={16} color={colors.danger} style={{ marginRight: 6 }} />
                <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
              </View>
            )}

            {/* Aggregator Clarity Note */}
            <View
              style={[
                styles.noticeBox,
                {
                  backgroundColor: colors.surfaceHighlight,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
                OmniMail is an email aggregator. Connect your existing email accounts using standard IMAP/SMTP. Your emails stay hosted on your original provider.
              </Text>
            </View>

            {/* Provider presets */}
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              SELECT PROVIDER
            </Text>
            <View style={styles.presetsRow}>
              {PROVIDER_PRESETS.map((p) => {
                const isSelected = selectedProvider === p.name;
                return (
                  <TouchableOpacity
                    key={p.name}
                    style={[
                      styles.presetBadge,
                      {
                        backgroundColor: isSelected ? colors.primaryLight : colors.surfaceHighlight,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => handleSelectPreset(p)}
                  >
                    {isSelected && (
                      <Check size={12} color={colors.primary} style={{ marginRight: 4 }} />
                    )}
                    <Text
                      style={[
                        styles.presetBadgeText,
                        { color: isSelected ? colors.primary : colors.textPrimary },
                      ]}
                    >
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Input
              label="Account Label (e.g. Work, Personal)"
              placeholder="Work Fastmail"
              value={label}
              onChangeText={setLabel}
            />

            <Input
              label="Email Address"
              placeholder="alex@example.com"
              value={emailAddress}
              onChangeText={setEmailAddress}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              leftIcon={<Mail size={16} color={colors.textMuted} />}
            />

            <Input
              label="App Password / Password"
              placeholder="••••••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              leftIcon={<Lock size={16} color={colors.textMuted} />}
              helperText="For Gmail/iCloud, use an App Password generated in your account security settings."
            />

            <TouchableOpacity
              onPress={() => setShowAdvanced(!showAdvanced)}
              style={styles.advancedToggle}
            >
              <Server size={14} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={[styles.advancedText, { color: colors.primary }]}>
                {showAdvanced ? "Hide Server Host Settings" : "Configure IMAP & SMTP Hostnames"}
              </Text>
            </TouchableOpacity>

            {showAdvanced && (
              <View style={[styles.advancedBox, { borderColor: colors.border }]}>
                <Input
                  label="IMAP Host"
                  value={imapHost}
                  onChangeText={setImapHost}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Input
                  label="IMAP Port"
                  value={imapPort}
                  onChangeText={setImapPort}
                  keyboardType="numeric"
                />
                <Input
                  label="SMTP Host"
                  value={smtpHost}
                  onChangeText={setSmtpHost}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Input
                  label="SMTP Port"
                  value={smtpPort}
                  onChangeText={setSmtpPort}
                  keyboardType="numeric"
                />
              </View>
            )}

            <Button
              title="Connect Account"
              onPress={handleSave}
              loading={loading}
              size="lg"
              icon={<Plus size={18} color="#FFFFFF" />}
              style={styles.saveBtn}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    paddingBottom: Spacing.xl,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  subtitle: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  body: {
    padding: Spacing.lg,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.md,
  },
  errorText: {
    fontSize: Typography.sizes.xs,
    flex: 1,
  },
  sectionLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  presetsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: Spacing.md,
  },
  presetBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetBadgeText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  advancedToggle: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: Spacing.sm,
  },
  advancedText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
  },
  advancedBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  saveBtn: {
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
  noticeBox: {
    padding: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  noticeText: {
    fontSize: Typography.sizes.xs - 1,
    lineHeight: 16,
  },
});
