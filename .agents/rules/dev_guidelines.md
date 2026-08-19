---
trigger: always_on
---

# Project Guidelines & Memory for Watodo

## Server & Dev Environment
- **Always restart frontend and backend** when making changes or when requested.
- Development servers are run via:
  - `npm run dev` (runs both backend on port 3001 and Vite UI on port 5173 concurrently).
- Ensure backend (`tsx watch src/server.ts`) and frontend (`vite --config vite.config.ts`) are restarted and active after any changes so the user's environment is always up-to-date and ready to use.
