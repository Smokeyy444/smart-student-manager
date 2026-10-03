/**
 * Browser Notification Abstraction & Delivery Service.
 *
 * SCOPE & CAPABILITY HONESTY:
 * - This service uses the standard HTML5 Web Notification API.
 * - Notifications are successfully dispatched when:
 *   1. The user has granted browser notification permission ("granted").
 *   2. The user has enabled browser notifications in application settings.
 *   3. The application is open in a browser tab / active session.
 * - Out-of-browser background push notifications (when the browser is completely closed)
 *   require a server-side Web Push (VAPID) protocol, PushManager service worker,
 *   and external push service (e.g. FCM/Mozilla autopush), which is architected for a future phase.
 */

export type NotificationPermissionStatus = "default" | "granted" | "denied" | "unsupported";

/**
 * Checks if the Web Notification API is supported by the client environment.
 */
export function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * Returns the current Notification permission state.
 */
export function getBrowserNotificationPermission(): NotificationPermissionStatus {
  if (!isBrowserNotificationSupported()) {
    return "unsupported";
  }
  return Notification.permission as NotificationPermissionStatus;
}

/**
 * Requests permission from the user for browser notifications.
 * Must be triggered by a direct user gesture (button click).
 */
export async function requestBrowserNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!isBrowserNotificationSupported()) {
    return "unsupported";
  }

  try {
    const permission = await Notification.requestPermission();
    return permission as NotificationPermissionStatus;
  } catch (error) {
    console.error("Failed to request notification permission:", error);
    return "denied";
  }
}

export interface BrowserNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
  onClick?: () => void;
}

/**
 * Dispatches an HTML5 notification if permissions and settings allow.
 */
export function dispatchBrowserNotification(
  payload: BrowserNotificationPayload
): boolean {
  if (!isBrowserNotificationSupported()) {
    return false;
  }

  if (Notification.permission !== "granted") {
    return false;
  }

  try {
    const notification = new Notification(payload.title, {
      body: payload.body,
      icon: payload.icon || "/favicon.ico",
      tag: payload.tag,
    });

    if (payload.onClick) {
      notification.onclick = (e) => {
        e.preventDefault();
        window.focus();
        payload.onClick?.();
        notification.close();
      };
    }

    return true;
  } catch (error) {
    console.error("Failed to dispatch browser notification:", error);
    return false;
  }
}
