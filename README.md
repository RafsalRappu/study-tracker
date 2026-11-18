# Study Tracker
npm install && npm run dev  -> http://localhost:3000
Plan dates/target: src/lib/config.ts. Data is stored on-device (IndexedDB); use the
download/upload icons for backup. To add a real server later, swap src/lib/api.ts.

Enable 3-hour reminders from the dashboard to get a check-in after 3 hours without
an active study session, repeating every 3 hours until you return. Reminders use
browser notifications and work while the app is open; browsers may pause timers
when the app is closed, in which case the reminder appears when you return. On
mobile, open the app over HTTPS, add it to your home screen, and allow notifications.
