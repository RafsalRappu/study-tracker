"use client";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, AppBar, Box, Button, Chip, CircularProgress, Container, IconButton, List, ListItem,
  ListItemText, Paper, Stack, Toolbar, Typography,
} from "@mui/material";
import DarkMode from "@mui/icons-material/DarkMode";
import LightMode from "@mui/icons-material/LightMode";
import NotificationsActive from "@mui/icons-material/NotificationsActive";
import PlayArrow from "@mui/icons-material/PlayArrow";
import Stop from "@mui/icons-material/Stop";
import Download from "@mui/icons-material/Download";
import Upload from "@mui/icons-material/Upload";
import { RootState, setMode } from "@/store";
import { api } from "@/lib/api";
import { summarize, fmt, TARGET } from "@/lib/stats";
import { END_DATE } from "@/lib/config";

const REMINDER_INTERVAL = 3 * 60 * 60 * 1000;
type ReminderRecord = { idleSince: number; remindedAt: number | null };
const reminderKey = (userId: string) => `study-reminders:${userId}`;
const readReminder = (userId: string): ReminderRecord | null => {
  const value = localStorage.getItem(reminderKey(userId));
  if (!value) return null;
  const parsed = JSON.parse(value) as ReminderRecord;
  if (typeof parsed.idleSince !== "number" ||
      (parsed.remindedAt !== null && typeof parsed.remindedAt !== "number")) {
    throw new Error("Saved reminder data is invalid.");
  }
  return parsed;
};
const writeReminder = (userId: string, value: ReminderRecord) =>
  localStorage.setItem(reminderKey(userId), JSON.stringify(value));

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
};

export default function Dashboard() {
  const { mode, userId } = useSelector((s: RootState) => s.ui);
  const dispatch = useDispatch();
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const file = useRef<HTMLInputElement>(null);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission | "unsupported">("default");
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderDue, setReminderDue] = useState(false);
  const [returnStatus, setReturnStatus] = useState("");
  const [notificationError, setNotificationError] = useState("");

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const q = useQuery({ queryKey: ["sessions", userId], queryFn: () => api.list(userId) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["sessions", userId] });
  const toggle = useMutation({
    mutationFn: (running: boolean) => (running ? api.stop(userId) : api.start(userId)),
    onSuccess: (_data, wasRunning) => {
      refresh();
      if (!wasRunning) {
        acknowledgeReturn();
      }
    },
  });

  const s = summarize(q.data ?? [], now);
  const running = !!s.active;
  const pct = Math.min(100, (s.todayMs / TARGET) * 100);
  const met = s.todayMs >= TARGET;

  function acknowledgeReturn() {
    try {
      const record = readReminder(userId);
      if (record?.remindedAt) {
        const elapsed = Date.now() - record.remindedAt;
        setReturnStatus(elapsed <= REMINDER_INTERVAL
          ? "You're back on time — you returned within 3 hours."
          : `You're back ${fmt(elapsed - REMINDER_INTERVAL)} after your 3-hour window.`);
      }
    } catch (error) {
      setNotificationError(`Could not read reminder time: ${String(error)}`);
    }
    setReminderDue(false);
  }

  useEffect(() => {
    setNotificationPermission(
      typeof Notification === "undefined" ? "unsupported" : Notification.permission,
    );
    setRemindersEnabled(localStorage.getItem("study-reminders-enabled") === "true");
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
        setNotificationError(`Could not enable mobile notifications: ${String(error)}`);
      });
    }
  }, []);

  useEffect(() => {
    if (!remindersEnabled || q.isLoading) return;
    if (q.data?.some((session) => session.end === null)) return;

    let record: ReminderRecord;
    try {
      record = readReminder(userId) ?? { idleSince: Date.now(), remindedAt: null };
      const latestEnd = (q.data ?? []).reduce(
        (latest, session) => Math.max(latest, session.end ?? 0), 0,
      );
      if (latestEnd > record.idleSince) {
        record = { idleSince: latestEnd, remindedAt: null };
      }
      writeReminder(userId, record);
    } catch (error) {
      setNotificationError(`Could not read reminder settings: ${String(error)}`);
      return;
    }

    let timeout = 0;
    const schedule = () => {
      const dueAt = (record.remindedAt ?? record.idleSince) + REMINDER_INTERVAL;
      timeout = window.setTimeout(() => {
        record = { ...record, remindedAt: Date.now() };
        try {
          writeReminder(userId, record);
        } catch (error) {
          setNotificationError(`Could not save reminder time: ${String(error)}`);
          return;
        }
        setReminderDue(true);
        setReturnStatus("");
        if (notificationPermission === "granted" && "serviceWorker" in navigator) {
          navigator.serviceWorker.ready
            .then((registration) => registration.showNotification("Study check-in", {
              body: "It's been 3 hours since your last study session. Come back now to get back on track.",
              icon: "/icon.svg",
              badge: "/icon.svg",
              tag: "study-check-in",
              data: { url: "/" },
            }))
            .catch((error: unknown) => {
              setNotificationError(`Could not show the reminder notification: ${String(error)}`);
            });
        }
        schedule();
      }, Math.max(0, dueAt - Date.now()));
    };
    const onVisibilityChange = () => {
      if (!document.hidden) {
        window.clearTimeout(timeout);
        schedule();
      }
    };
    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [notificationPermission, q.data, q.isLoading, remindersEnabled, userId]);

  const enableReminders = async () => {
    setNotificationError("");
    if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
      setNotificationPermission("unsupported");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        await navigator.serviceWorker.register("/sw.js");
        localStorage.setItem("study-reminders-enabled", "true");
        setRemindersEnabled(true);
      } else if (permission === "denied") {
        setNotificationError("Notifications are blocked. Allow them in your browser or device settings to enable reminders.");
      }
    } catch (error) {
      setNotificationError(`Could not enable reminders: ${String(error)}`);
    }
  };

  const exportData = async () => {
    const url = URL.createObjectURL(new Blob([await api.exportJson(userId)], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: "study-backup.json" }).click();
    URL.revokeObjectURL(url);
  };
  const importData = async (f?: File) => { if (f) { await api.importJson(userId, await f.text()); refresh(); } };

  return (
    <>
      <AppBar position="sticky" color="transparent" elevation={0} sx={{ backdropFilter: "blur(12px)" }}>
        <Toolbar>
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>Study Tracker</Typography>
          <IconButton onClick={exportData} aria-label="Export backup"><Download /></IconButton>
          <IconButton onClick={() => file.current?.click()} aria-label="Import backup"><Upload /></IconButton>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => importData(e.target.files?.[0])} />
          <IconButton
            aria-label="Toggle dark mode"
            onClick={() => { const m = mode === "dark" ? "light" : "dark"; localStorage.setItem("mode", m); dispatch(setMode(m)); }}
          >{mode === "dark" ? <LightMode /> : <DarkMode />}</IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 3, display: "grid", gap: 3, gridTemplateColumns: { md: "1fr 1fr" }, alignItems: "start" }}>
        <Stack gap={3}>
          <Paper sx={{ p: 4, textAlign: "center" }}>
            <Box sx={{ position: "relative", display: "inline-flex" }}>
              <CircularProgress variant="determinate" value={100} size={240} thickness={3}
                sx={{ color: "action.hover", position: "absolute" }} />
              <CircularProgress variant="determinate" value={pct} size={240} thickness={3}
                color={met ? "secondary" : "primary"} />
              <Box sx={{ position: "absolute", inset: 0, display: "grid", placeContent: "center" }}>
                <Typography variant="h3" fontWeight={800} sx={{ fontVariantNumeric: "tabular-nums" }}>{clock(s.todayMs)}</Typography>
                <Typography color="text.secondary">
                  {met ? `+${fmt(s.todayMs - TARGET)} extra` : `${fmt(TARGET - s.todayMs)} to go`}
                </Typography>
              </Box>
            </Box>
            <Button fullWidth size="large" variant="contained" color={running ? "error" : "primary"}
              startIcon={running ? <Stop /> : <PlayArrow />} disabled={toggle.isPending || q.isLoading}
              onClick={() => toggle.mutate(running)} sx={{ mt: 4, py: 1.6, fontSize: 18 }}>
              {running ? "Stop studying" : "Start studying"}
            </Button>
          </Paper>

          <Paper sx={{ p: 2.5 }}>
            <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ xs: "stretch", sm: "center" }}
              justifyContent="space-between" gap={2}>
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>3-hour reminders</Typography>
                <Typography variant="body2" color="text.secondary">
                  Get a check-in after 3 hours away, then every 3 hours until you return.
                </Typography>
              </Box>
              <Button variant="outlined" startIcon={<NotificationsActive />}
                disabled={remindersEnabled || notificationPermission === "unsupported"}
                onClick={enableReminders}>
                {remindersEnabled ? "Reminders enabled" : "Enable reminders"}
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
              On mobile, add Study Tracker to your home screen and allow notifications. Reminders require the app to be open; if it was closed, you’ll get the check-in when you return.
            </Typography>
            {notificationPermission === "unsupported" && (
              <Typography variant="caption" color="error.main" display="block" sx={{ mt: 1 }}>
                This browser does not support web notifications.
              </Typography>
            )}
            {reminderDue && (
              <Alert severity="warning" sx={{ mt: 2 }} action={
                <Button color="inherit" size="small" onClick={acknowledgeReturn}>I’m back</Button>
              }>
                It’s been 3 hours since your last study session. Start studying or check in now.
              </Alert>
            )}
            {returnStatus && <Alert severity="success" sx={{ mt: 2 }}>{returnStatus}</Alert>}
            {notificationError && <Alert severity="error" sx={{ mt: 2 }}>{notificationError}</Alert>}
          </Paper>

          <Paper sx={{ p: 2.5, display: "grid", gridTemplateColumns: "repeat(3,1fr)", textAlign: "center", gap: 1 }}>
            <Stat label="Days left" value={String(s.daysLeft)} hint={`till ${END_DATE}`} />
            <Stat label="Streak" value={`${s.streak}d`} hint="days at 8h" />
            <Stat label={s.balance >= 0 ? "Ahead" : "Behind"} value={fmt(s.balance)} hint={`${s.metDays}/${s.pastDays} days met`}
              color={s.balance >= 0 ? "primary.main" : "error.main"} />
          </Paper>
        </Stack>

        <Paper sx={{ p: 1 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ p: 2, pb: 0 }}>History</Typography>
          <List sx={{ maxHeight: { md: "70vh" }, overflow: "auto" }}>
            {s.history.map((d) => (
              <ListItem key={d.key} secondaryAction={
                <Chip size="small" label={d.diff >= 0 ? (d.diff === 0 ? "On target" : `+${fmt(d.diff)}`) : `−${fmt(d.diff)}`}
                  color={d.diff >= 0 ? (d.diff === 0 ? "primary" : "secondary") : "error"} variant="outlined" />
              }>
                <ListItemText primary={new Date(d.key + "T00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                  secondary={`${fmt(d.ms)} studied`} />
              </ListItem>
            ))}
          </List>
        </Paper>
      </Container>
    </>
  );
}

function Stat({ label, value, hint, color }: { label: string; value: string; hint: string; color?: string }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="h5" fontWeight={800} color={color}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{hint}</Typography>
    </Box>
  );
}
