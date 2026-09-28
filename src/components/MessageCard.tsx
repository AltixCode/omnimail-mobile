import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from "react-native";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { Star, Paperclip, Calendar, Mail, CheckCircle2 } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { MessageListItem } from "../types";
import { Spacing, Typography } from "../constants/theme";

interface MessageCardProps {
  message: MessageListItem;
  onPress: () => void;
  onToggleStar?: () => void;
  onToggleRead?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}

export function MessageCard({
  message,
  onPress,
  onToggleStar,
}: MessageCardProps) {
  const { colors } = useTheme();

  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      if (isToday(date)) {
        return format(date, "h:mm a");
      }
      if (isYesterday(date)) {
        return "Yesterday";
      }
      return format(date, "MMM d");
    } catch {
      return "";
    }
  };

  const senderDisplayName =
    message.fromName || message.fromAddress.split("@")[0] || "Unknown";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed
            ? colors.surfaceHighlight
            : message.isRead
            ? colors.surface
            : colors.surfaceElevated,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={styles.leftColumn}>
        <View style={styles.unreadIndicatorSlot}>
          {!message.isRead && (
            <View
              style={[styles.unreadDot, { backgroundColor: colors.unreadDot }]}
            />
          )}
        </View>
      </View>

      <View style={styles.contentColumn}>
        <View style={styles.topRow}>
          <Text
            numberOfLines={1}
            style={[
              styles.senderText,
              {
                color: colors.textPrimary,
                fontWeight: message.isRead
                  ? Typography.weights.medium
                  : Typography.weights.bold,
              },
            ]}
          >
            {senderDisplayName}
          </Text>

          <View style={styles.dateAndIcons}>
            {message.hasAttachments && (
              <Paperclip
                size={14}
                color={colors.textMuted}
                style={styles.attachmentIcon}
              />
            )}
            {message.hasCalendarInvite && (
              <Calendar
                size={14}
                color={colors.primary}
                style={styles.attachmentIcon}
              />
            )}
            <Text
              style={[
                styles.dateText,
                {
                  color: message.isRead ? colors.textMuted : colors.primary,
                  fontWeight: message.isRead
                    ? Typography.weights.regular
                    : Typography.weights.semibold,
                },
              ]}
            >
              {formatDate(message.date)}
            </Text>
          </View>
        </View>

        <View style={styles.subjectRow}>
          <Text
            numberOfLines={1}
            style={[
              styles.subjectText,
              {
                color: colors.textPrimary,
                fontWeight: message.isRead
                  ? Typography.weights.regular
                  : Typography.weights.bold,
              },
            ]}
          >
            {message.subject || "(No Subject)"}
          </Text>

          {onToggleStar && (
            <TouchableOpacity
              onPress={onToggleStar}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.starButton}
            >
              <Star
                size={18}
                color={message.isStarred ? colors.starActive : colors.starInactive}
                fill={message.isStarred ? colors.starActive : "transparent"}
              />
            </TouchableOpacity>
          )}
        </View>

        {message.snippet ? (
          <Text
            numberOfLines={2}
            style={[styles.snippetText, { color: colors.textSecondary }]}
          >
            {message.snippet}
          </Text>
        ) : null}

        {message.account?.label ? (
          <View style={styles.footerRow}>
            <View
              style={[
                styles.accountBadge,
                {
                  backgroundColor: colors.surfaceHighlight,
                  borderColor: colors.borderSubtle,
                },
              ]}
            >
              <Text style={[styles.accountBadgeText, { color: colors.textMuted }]}>
                {message.account.label}
              </Text>
            </View>
            {message.folder?.name && message.folder.name.toUpperCase() !== "INBOX" && (
              <View
                style={[
                  styles.accountBadge,
                  {
                    backgroundColor: colors.surfaceHighlight,
                    borderColor: colors.borderSubtle,
                    marginLeft: 6,
                  },
                ]}
              >
                <Text style={[styles.accountBadgeText, { color: colors.textMuted }]}>
                  {message.folder.name}
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  leftColumn: {
    width: 14,
    paddingTop: 4,
    alignItems: "center",
  },
  unreadIndicatorSlot: {
    width: 8,
    height: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  contentColumn: {
    flex: 1,
    marginLeft: Spacing.xs,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  senderText: {
    fontSize: Typography.sizes.base,
    flex: 1,
    marginRight: Spacing.sm,
  },
  dateAndIcons: {
    flexDirection: "row",
    alignItems: "center",
  },
  attachmentIcon: {
    marginRight: 4,
  },
  dateText: {
    fontSize: Typography.sizes.xs,
  },
  subjectRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  subjectText: {
    fontSize: Typography.sizes.sm,
    flex: 1,
    marginRight: Spacing.sm,
  },
  starButton: {
    padding: 2,
  },
  snippetText: {
    fontSize: Typography.sizes.sm,
    lineHeight: 18,
    marginBottom: 6,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  accountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  accountBadgeText: {
    fontSize: 10,
    fontWeight: Typography.weights.medium,
  },
});
