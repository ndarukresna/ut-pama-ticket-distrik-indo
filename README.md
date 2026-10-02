# UT × PAMA Ticket System

A deployable static ticketing app for the UT × PAMA Distrik INDO workflow. It is designed to work as a public web app and can optionally sync with Supabase when configured.

## Features

- Login screen for admin / plant / UT / SM PAMA roles
- Ticket list with search and filters
- Create new ticket with optional spare-part detail
- Feedback timeline per ticket
- Close / reject actions for UT roles
- Admin summary dashboard
- User account management
- LocalStorage fallback for easy demo use
- Supabase-ready configuration for online sync

## Public deployment

### Option 1: GitHub Pages

1. Push this repository to GitHub.
2. Open your repository on GitHub.
3. Go to Settings → Pages.
4. Set source to `Deploy from a branch`.
5. Select the `main` branch and `/ (root)` folder.
6. Save.
7. Your public URL will be:
   `https://<username>.github.io/<repo-name>/`

### Option 2: Netlify

1. Import the repository into Netlify.
2. Set build command to empty (or leave blank for static site).
3. Set publish directory to the repository root.
4. Deploy.

## Supabase setup

This project includes a ready-to-use Supabase connection hook. To enable it:

1. Create a Supabase project.
2. Create tables named:
   - `tickets`
   - `profiles`
3. Add the project URL and anon key to `config.js`.
4. Set `enabled: true` in `window.SUPABASE_CONFIG`.

Example:

```js
window.SUPABASE_CONFIG = {
  url: "https://your-project.supabase.co",
  anonKey: "your-anon-key",
  enabled: true,
};
```

Note: For a public frontend, Supabase RLS must allow the anonymous role to read/write if you want client-side access without a server. For production, prefer server-side auth and stricter permissions.

## Local demo mode

If Supabase is not configured, the app runs entirely in the browser using `localStorage`. This is the easiest option for testing and demoing.

## Default accounts

- admin / admin123
- pamaplant / plant123
- ut / ut123
- smpama / smpama123

## Notes

This is a static frontend and is intended for easy public deployment and future updates. If you want more advanced work such as real-time multi-user sync, image uploads, or team-specific features, the next stage would be a full Supabase-backed app with database policies and server logic.
