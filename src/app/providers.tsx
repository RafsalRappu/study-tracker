"use client";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import { store, RootState, setMode } from "@/store";
import { requestPersistence } from "@/lib/db";

function Themed({ children }: { children: ReactNode }) {
  const mode = useSelector((s: RootState) => s.ui.mode);
  const dispatch = useDispatch();
  useEffect(() => {
    const saved = localStorage.getItem("mode") as "light" | "dark" | null;
    dispatch(setMode(saved ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")));
    requestPersistence();
  }, [dispatch]);
  const theme = useMemo(() => createTheme({
    palette: {
      mode,
      primary: { main: mode === "dark" ? "#6fcf9f" : "#2f6f5e" },
      secondary: { main: "#e0a526" },
      background: mode === "dark"
        ? { default: "#101714", paper: "#18221e" }
        : { default: "#f3f6f2", paper: "#ffffff" },
    },
    shape: { borderRadius: 16 },
    typography: { fontFamily: "var(--font-sans), system-ui, sans-serif" },
  }), [mode]);
  return <ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider>;
}

export default function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <Provider store={store}>
      <QueryClientProvider client={qc}><Themed>{children}</Themed></QueryClientProvider>
    </Provider>
  );
}
