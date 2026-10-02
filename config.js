window.SUPABASE_CONFIG = {
  url: process.env.REACT_APP_SUPABASE_URL || "https://your-project.supabase.co",
  anonKey: process.env.REACT_APP_SUPABASE_ANON_KEY || "your-anon-key",
  enabled: false,
};

window.APP_META = {
  name: "UT × PAMA",
  subtitle: "Sistem Tiket Distrik INDO",
};

window.SUPABASE_TABLES = {
  TICKETS: 'tickets',
  PROFILES: 'profiles',
  FEEDBACKS: 'feedbacks',
  ACTIVITY_LOG: 'activity_log',
};
