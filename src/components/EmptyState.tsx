import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { Spacing, Typography } from "../constants/theme";
import { Button } from "./Button";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionTitle?: string;
  onAction?: () => void;
  actionLoading?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  actionTitle,
  onAction,
  actionLoading = false,
}: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.description, { color: colors.textSecondary }]}>
        {description}
      </Text>
      {actionTitle && onAction ? (
        <Button
          title={actionTitle}
          onPress={onAction}
          loading={actionLoading}
          variant="secondary"
          size="sm"
          style={styles.actionButton}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    minHeight: 280,
  },
  iconContainer: {
    marginBottom: Spacing.md,
    opacity: 0.8,
  },
  title: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  description: {
    fontSize: Typography.sizes.sm,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
    marginBottom: Spacing.lg,
  },
  actionButton: {
    minWidth: 120,
  },
});
