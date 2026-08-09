# Student Performance Survey Dashboard — Vercel Ready

Interactive **FastAPI + Pandas + Chart.js** dashboard for the supplied student-performance survey CSV.

This version is prepared for **GitHub → Vercel deployment with no terminal commands**.

## What is already configured

- `app.py` is at the repository root and exports a FastAPI instance named `app`, which Vercel detects automatically.
- `requirements.txt` contains all Python dependencies; Vercel installs them during deployment.
- `.python-version` pins Python 3.12.
- `data/responses.csv` is bundled with the repository and read by the backend at runtime.
- No database is required.
- No environment variables are required.
- No Build Command is required.
- No Output Directory is required.
- No `vercel.json` is required.

## Deploy from GitHub — no command line

1. Create a GitHub repository using the files from this folder.
2. Make sure **`app.py` is at the root of the repository**, not inside another nested project folder.
3. In Vercel choose **Add New → Project**.
4. Import the GitHub repository.
5. Keep the detected/default settings. Do **not** add a Build Command or Output Directory.
6. Click **Deploy**.

Vercel detects the FastAPI app and installs `requirements.txt` automatically.

## Updating the survey later

Replace this file in GitHub:

```text
data/responses.csv
```

Commit the new CSV using GitHub's web interface. If the repository is connected to Vercel, that commit automatically starts a new deployment. No server command is needed.

The replacement CSV should keep the same Google Form column headings, especially:

- `What is your department?`
- `Which semester are you currently in?`

## Department normalization

Normalization is implemented in `normalization.py`. Raw variants such as `CSE`, `cse`, `Cse`, `Computer Science and Engineering`, `Department of Computer Science and Engineering`, and `CSSE` are counted as **CSE**. Missing values become `Unspecified`.

## Dashboard features

- Analyze any survey response field.
- Filter by normalized department.
- Filter by semester.
- Break down results by department, semester, or department + semester.
- Vertical bar, horizontal bar, line, pie, doughnut, and polar-area charts.
- Exact count/percentage table.
- Department × semester coverage matrix.
- Responsive desktop/mobile layout.

## Backend routes

```text
/
/api/meta
/api/aggregate
/api/department-semester
```

## Important note about the CSV

The deployed Vercel filesystem is read-only. That is fine here because `responses.csv` is intentionally static within each deployment. To change the data, replace the CSV in GitHub and let Vercel redeploy the project.

## Optional local development

Local commands are **not required for Vercel deployment**. They are only useful if you want to test changes on your computer before pushing to GitHub.
