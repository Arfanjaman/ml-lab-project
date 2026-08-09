# Vercel deployment checklist

You do not need a terminal for deployment.

## Repository layout

Your GitHub repository root should contain:

```text
app.py
requirements.txt
.python-version
normalization.py
data_service.py
data/
  responses.csv
static/
  css/
  js/
templates/
  index.html
README.md
```

## Vercel UI

1. Open Vercel.
2. Add New → Project.
3. Select/import the GitHub repository.
4. Root Directory: repository root (`./`).
5. Build Command: leave empty/default.
6. Output Directory: leave empty/default.
7. Install Command: leave empty/default.
8. Environment Variables: none required.
9. Deploy.

## Future CSV updates

Edit or replace `data/responses.csv` in GitHub and commit it. Vercel's Git integration will redeploy the project automatically.
