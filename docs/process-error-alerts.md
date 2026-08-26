# Process Error Alerts

PM2 View monitors your processes and sends email alerts when something goes wrong.

## What This Feature Does

When a process crashes or enters an error state, PM2 View automatically sends an email notification to you and your team. No manual monitoring required.

## How It Works

- **Automatic monitoring**: A background watcher checks process status every 10 seconds
- **Instant alerts**: When a process goes from running (`online`) to `error`, an email is sent immediately
- **Smart cooldown**: Each process can only trigger one alert every 5 minutes to prevent email spam

## Who Receives Alerts

Alerts are sent to:

- The project owner
- The notify email address (if configured for the project)
- All team members (if the project belongs to a team)

## Setup

**No setup required** — this feature is enabled automatically for all registered projects.

To receive alerts, make sure your project has:

1. A registered owner (done when you add the project)
2. SMTP configured in your environment variables

### SMTP Configuration

Add these to your `.env` file:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
```

For Gmail, you'll need to generate an [App Password](https://myaccount.google.com/apppasswords).

## What You'll Receive

Example alert email:

```
Subject: ⚠️ Process Error Alert: my-api-server

Process: my-api-server
Project: My API Server
Previous Status: online
Current Status: error
Time: 2026-08-25 14:32:15
```

## FAQ

**Q: Will I get an email every time my process restarts?**
A: No. The cooldown period (5 minutes) prevents spam. If your process crashes and restarts multiple times within 5 minutes, you'll only receive one email.

**Q: Can I configure which processes trigger alerts?**
A: Currently, all registered processes are monitored. Unregistered PM2 processes are not tracked.

**Q: What if my SMTP is not configured?**
A: The alert system will silently skip sending emails. No errors will occur, but you won't receive notifications.
