import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://tflrfkocbdkizmkhimiw.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmbHJma29jYmRraXpta2hpbWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNDYyNDAsImV4cCI6MjA5MjgyMjI0MH0.tbrmqluUo2zSDx6_xNGimcJ6VF0CzSzZfz6KHYjkjf4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
