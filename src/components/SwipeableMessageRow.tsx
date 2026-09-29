import React, { useRef } from "react";
import { Animated, PanResponder, View, StyleSheet } from "react-native";
import { Archive, Trash2 } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { MessageCard } from "./MessageCard";
import { MessageListItem } from "../types";

interface SwipeableMessageRowProps {
  message: MessageListItem;
  selectMode: boolean;
  selected: boolean;
  onPress: () => void;
  onToggleStar: () => void;
  onToggleSelect: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

const SWIPE_THRESHOLD = 80;

export function SwipeableMessageRow({
  message,
  selectMode,
  selected,
  onPress,
  onToggleStar,
  onToggleSelect,
  onArchive,
  onDelete,
}: SwipeableMessageRowProps) {
  const { colors } = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        if (selectMode) return false;
        return (
          Math.abs(gesture.dx) > 12 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5
        );
      },
      onPanResponderMove: (_, gesture) => {
        translateX.setValue(gesture.dx);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx <= -SWIPE_THRESHOLD) {
          // Swiped left, revealing the right side -> archive.
          Animated.timing(translateX, {
            toValue: -500,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            translateX.setValue(0);
            onArchive();
          });
        } else if (gesture.dx >= SWIPE_THRESHOLD) {
          // Swiped right, revealing the left side -> delete.
          Animated.timing(translateX, {
            toValue: 500,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            translateX.setValue(0);
            onDelete();
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 6,
        }).start();
      },
    }),
  ).current;

  return (
    <View style={styles.wrapper}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View
          style={[
            styles.actionBg,
            styles.actionLeft,
            { backgroundColor: colors.danger },
          ]}
        >
          <Trash2 size={20} color="#FFFFFF" />
        </View>
        <View
          style={[
            styles.actionBg,
            styles.actionRight,
            { backgroundColor: colors.primary },
          ]}
        >
          <Archive size={20} color="#FFFFFF" />
        </View>
      </View>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <MessageCard
          message={message}
          onPress={selectMode ? onToggleSelect : onPress}
          onToggleStar={selectMode ? undefined : onToggleStar}
          selectMode={selectMode}
          selected={selected}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    overflow: "hidden",
  },
  actionBg: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "50%",
    flexDirection: "row",
    alignItems: "center",
  },
  actionLeft: {
    left: 0,
    justifyContent: "flex-start",
    paddingLeft: 24,
  },
  actionRight: {
    right: 0,
    justifyContent: "flex-end",
    paddingRight: 24,
  },
});
