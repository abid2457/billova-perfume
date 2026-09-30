import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { supabase } from "./supabase";

export type Notification = {
  id: string;
  title: string;
  message: string;
  time: Date;
  read: boolean;
};

type NotifCtx = {
  notifications: Notification[];
  unreadCount: number;
  add: (title: string, message: string) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
};

const NotifContext = createContext<NotifCtx | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    try {
      const stored = localStorage.getItem("ah_notifications");
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((n: any) => ({ ...n, time: new Date(n.time) }));
      }
    } catch {}
    return [];
  });

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem("ah_notifications", JSON.stringify(notifications));
  }, [notifications]);

  const add = useCallback((title: string, message: string) => {
    setNotifications((prev) => [
      { id: crypto.randomUUID(), title, message, time: new Date(), read: false },
      ...prev.slice(0, 49), // Keep max 50
    ]);
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  // ─── Supabase Realtime Subscriptions ───
  useEffect(() => {
    const channel = supabase
      .channel("app-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "purchases" }, (payload) => {
        add("New Purchase", `Purchase of ₹${payload.new.total_amount} recorded.`);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "customers" }, (payload) => {
        add("New Customer", `${payload.new.customer_name} added to your customer list.`);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "products" }, (payload) => {
        add("New Product", `${payload.new.product_name} added to your catalog.`);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "products" }, (payload) => {
        add("Product Updated", `${payload.new.product_name} has been updated.`);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "products" }, () => {
        add("Product Deleted", "A product was removed from your catalog.");
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [add]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotifContext.Provider value={{ notifications, unreadCount, add, markRead, markAllRead, clearAll }}>
      {children}
    </NotifContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotifContext);
  if (!ctx) {
    return {
      notifications: [] as Notification[],
      unreadCount: 0,
      add: () => {},
      markRead: () => {},
      markAllRead: () => {},
      clearAll: () => {},
    } as NotifCtx;
  }
  return ctx;
}
