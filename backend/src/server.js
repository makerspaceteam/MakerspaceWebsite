import "dotenv/config";
import { createApp } from "./app.js";
import { isSupabaseConfigured } from "./config/supabaseClient.js";

const app = createApp();
const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
  if (!isSupabaseConfigured) {
    console.warn("Supabase env vars not set — copy .env.example to .env and fill them in to enable data routes.");
  }
});
