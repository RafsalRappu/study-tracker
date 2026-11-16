import { configureStore, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { DEFAULT_USER } from "@/lib/config";

const ui = createSlice({
  name: "ui",
  initialState: { mode: "dark" as "light" | "dark", userId: DEFAULT_USER },
  reducers: {
    setMode: (s, a: PayloadAction<"light" | "dark">) => { s.mode = a.payload; },
    setUser: (s, a: PayloadAction<string>) => { s.userId = a.payload; },
  },
});
export const { setMode, setUser } = ui.actions;
export const store = configureStore({ reducer: { ui: ui.reducer } });
export type RootState = ReturnType<typeof store.getState>;
