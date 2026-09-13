# GradeTrack — local prototype

A working student grade tracking and parent reporting prototype built with **Flask + SQLite + vanilla JavaScript + Chart.js**.

## Run it immediately

1. Install Python 3.10+.
2. In this folder run:

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
python app.py
```

3. Open http://127.0.0.1:5000

The app creates `grades.db` automatically on first run.

### Demo access
Student and parent flows can both use:

**DEMO-2026**

The demo profile starts with Math, Physics, Chemistry, English, and Arabic sample grades so the graphs aren't empty.

## What works

- Student profile creation with a unique student code
- Parent/student code authentication using a server-side session
- SQLite persistence across restarts
- Multiple subjects and unlimited grade records
- Automatic percentage calculation from points earned / points possible
- Current-grade bar chart
- Historical line chart
- Full history table
- Parent-only notes linked to a subject and/or time period
- Responsive UI for desktop and mobile

## Security note

This is intentionally a local prototype. The student code is an access key, not production-grade identity verification. For a real deployment, add proper parent accounts, rate limiting, HTTPS, CSRF protection, stronger authorization/audit controls, and a secure secret stored outside source control.
