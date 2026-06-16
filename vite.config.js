import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Deployed at https://EthanPullan.github.io/TestBank/ — the base must match the repo name.
export default defineConfig({
  base: "/TestBank/",
  plugins: [react()],
});
