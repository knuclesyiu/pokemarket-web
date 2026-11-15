/**
 * In-app feedback — toasts and confirmation dialogs.
 *
 * The app used `Alert.alert` everywhere. On native that is a system
 * dialog and it works. On web it is a no-op: react-native-web does
 * not implement `Alert`, so every validation error, every failed
 * request and every "saved" confirmation was silently swallowed.
 * Eighty-five call sites, and on the deployed web build the user
 * pressed a button, nothing happened, and nothing said why.
 *
 * This is the replacement. It looks the same on every platform, so
 * the behaviour that gets tested on web is the behaviour that ships
 * in the APK.
 *
 *   notify(title, message?)   — a toast that fades itself away
 *   confirm(title, message?, buttons?) — a modal that waits for a
 *                                choice, with the same button shape
 *                                `Alert.alert` took
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { C, R, SP, T, themed } from '../theme';
import { useAppearance } from '../contexts/AppearanceContext';

// ─── Types ───────────────────────────────────────────────────────────────────

export type Tone = 'info' | 'error' | 'success';

export interface FeedbackButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface Toast {
  id: number;
  title: string;
  message?: string;
  tone: Tone;
}

interface Dialog {
  title: string;
  message?: string;
  buttons: FeedbackButton[];
}

interface FeedbackApi {
  /** Say something. Returns immediately. */
  notify: (title: string, message?: string, tone?: Tone) => void;
  /** Ask something, and run the chosen button's callback. */
  confirm: (
    title: string,
    message?: string,
    buttons?: FeedbackButton[],
  ) => void;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

/**
 * The module-level entry point.
 *
 * Eighty-five call sites were calling `Alert.alert` from inside
 * components. Turning each of those into a hook call would have meant
 * editing the body of every component in the app, and every one of
 * them is a place a mistake can hide. The provider registers itself
 * here instead, and the screens call a plain function.
 *
 * `notify` and `confirmAction` work even before the provider mounts:
 * they do nothing rather than throw, so a screen rendered outside the
 * app shell still works.
 */
let activeApi: FeedbackApi = { notify: () => {}, confirm: () => {} };

function registerFeedbackApi(api: FeedbackApi) {
  activeApi = api;
}

export function notify(
  title: string,
  message?: string,
  tone?: Tone,
): void {
  activeApi.notify(title, message, tone);
}

export function confirmAction(
  title: string,
  message?: string,
  buttons?: FeedbackButton[],
): void {
  activeApi.confirm(title, message, buttons);
}

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    // A screen rendered outside the provider would otherwise crash on
    // every call. Falling back to a console warning keeps the screen
    // alive and points at the mistake.
    console.warn('[feedback] useFeedback used outside FeedbackProvider');
    return { notify: () => {}, confirm: () => {} };
  }
  return ctx;
}

// ─── Tone ────────────────────────────────────────────────────────────────────

const TONE_COLOR: Record<Tone, string> = {
  info: C.gold,
  error: C.down,
  success: C.up,
};

const TONE_ICON: Record<Tone, string> = {
  info: '›',
  error: '!',
  success: '✓',
};

/**
 * Errors read differently from information, and the old API had no way
 * to say which was which. Rather than make every one of the eighty-five
 * call sites pass a flag, the tone is read off the title: the titles
 * used for failures say so.
 */
function inferTone(title: string): Tone {
  if (/失敗|錯誤|無效|不能|無法|唔到|不對|太弱|格式|重複/.test(title)) return 'error';
  if (/成功|完成|已更新|已設定|已刪|已發送/.test(title)) return 'success';
  return 'info';
}

// ─── Provider ────────────────────────────────────────────────────────────────

const TOAST_MS = 3600;

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const nextId = useRef(1);

  const notify = useCallback(
    (title: string, message?: string, tone?: Tone) => {
      const id = nextId.current++;
      setToasts((prev) => [
        ...prev.slice(-2),
        { id, title, message, tone: tone ?? inferTone(title) },
      ]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, TOAST_MS);
    },
    [],
  );

  const confirm = useCallback(
    (title: string, message?: string, buttons?: FeedbackButton[]) => {
      setDialog({
        title,
        message,
        buttons:
          buttons && buttons.length > 0
            ? buttons
            : [{ text: '好', style: 'default' }],
      });
    },
    [],
  );

  const api = useMemo(() => ({ notify, confirm }), [notify, confirm]);

  // Publish the api so screens can call notify() without a hook.
  useEffect(() => {
    registerFeedbackApi(api);
    return () => {
      registerFeedbackApi({ notify: () => {}, confirm: () => {} });
    };
  }, [api]);

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <ToastStack toasts={toasts} onDismiss={(id) =>
        setToasts((prev) => prev.filter((t) => t.id !== id))
      } />
      {dialog ? (
        <ConfirmDialog
          dialog={dialog}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </FeedbackContext.Provider>
  );
};

// ─── Toast ───────────────────────────────────────────────────────────────────

const ToastStack: React.FC<{
  toasts: Toast[];
  onDismiss: (id: number) => void;
}> = ({ toasts, onDismiss }) => {
  if (!toasts.length) return null;
  return (
    <View style={styles.toastLayer} pointerEvents="box-none">
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </View>
  );
};

const ToastRow: React.FC<{ toast: Toast; onDismiss: (id: number) => void }> = ({
  toast,
  onDismiss,
}) => {
  const { t } = useAppearance();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim]);

  const dismiss = () => {
    Animated.timing(anim, {
      toValue: 0,
      duration: 160,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onDismiss(toast.id));
  };

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [-24, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View
        style={[
          styles.toastEdge,
          { backgroundColor: TONE_COLOR[toast.tone] },
        ]}
      />
      <View style={styles.toastBody}>
        <Text style={styles.toastTitle} numberOfLines={2}>
          {toast.title}
        </Text>
        {toast.message ? (
          <Text style={styles.toastMessage} numberOfLines={4}>
            {toast.message}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={dismiss}
        hitSlop={10}
        style={styles.toastClose}
        accessibilityRole="button"
        accessibilityLabel={t('關閉提示')}
      >
        <Text style={styles.toastCloseText}>✕</Text>
      </Pressable>
    </Animated.View>
  );
};

// ─── Dialog ──────────────────────────────────────────────────────────────────

const ConfirmDialog: React.FC<{
  dialog: Dialog;
  onClose: () => void;
}> = ({ dialog, onClose }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim]);

  const press = (button: FeedbackButton) => {
    onClose();
    button.onPress?.();
  };

  return (
    <View style={styles.dialogLayer}>
      <Pressable style={styles.dialogBackdrop} onPress={onClose} />
      <Animated.View
        style={[
          styles.dialogCard,
          {
            opacity: anim,
            transform: [
              {
                scale: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.94, 1],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.dialogTitle}>{dialog.title}</Text>
        {dialog.message ? (
          <ScrollView style={styles.dialogMessageWrap}>
            <Text style={styles.dialogMessage}>{dialog.message}</Text>
          </ScrollView>
        ) : null}
        <View style={styles.dialogButtons}>
          {dialog.buttons.map((b, i) => (
            <Pressable
              key={`${b.text}-${i}`}
              onPress={() => press(b)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.dialogButton,
                b.style === 'destructive' && styles.dialogButtonDestructive,
                b.style === 'cancel' && styles.dialogButtonCancel,
                pressed && styles.dialogButtonPressed,
              ]}
            >
              <Text
                style={[
                  styles.dialogButtonText,
                  b.style === 'destructive' && styles.dialogButtonTextDestructive,
                ]}
              >
                {b.text}
              </Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = themed((C) => StyleSheet.create({
  toastLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingTop: SP.xl,
    paddingHorizontal: SP.lg,
    gap: SP.sm,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: C.elevated,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  toastEdge: { width: 3 },
  toastBody: { flex: 1, paddingVertical: SP.md, paddingHorizontal: SP.md },
  toastTitle: { ...T.bodyStrong, color: C.text },
  toastMessage: {
    ...T.small,
    color: C.textSecondary,
    marginTop: 3,
    lineHeight: 19,
  },
  toastClose: {
    paddingHorizontal: SP.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastCloseText: { color: C.textTertiary, fontSize: 13, fontWeight: '700' },

  dialogLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10000,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SP.xl,
  },
  dialogBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.overlay,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: C.card,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: C.borderActive,
    padding: SP.xl,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 20,
  },
  dialogTitle: { ...T.title, color: C.text, marginBottom: SP.sm },
  dialogMessageWrap: { maxHeight: 260 },
  dialogMessage: {
    ...T.body,
    color: C.textSecondary,
    lineHeight: 22,
  },
  dialogButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SP.sm,
    marginTop: SP.xl,
    flexWrap: 'wrap',
  },
  dialogButton: {
    paddingVertical: SP.md,
    paddingHorizontal: SP.lg,
    borderRadius: R.md,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  dialogButtonCancel: { backgroundColor: 'transparent', borderColor: 'transparent' },
  dialogButtonDestructive: { backgroundColor: C.actionDim, borderColor: C.action },
  dialogButtonPressed: { opacity: 0.7 },
  dialogButtonText: { ...T.bodyStrong, color: C.text },
  dialogButtonTextDestructive: { color: C.action },
}))

export { TONE_COLOR, TONE_ICON };
