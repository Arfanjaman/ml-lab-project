from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import uvicorn

from data_service import SurveyData


BASE_DIR = Path(__file__).resolve().parent
CSV_PATH = BASE_DIR / "data" / "responses.csv"

app = FastAPI(title="Student Performance Survey Dashboard")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")
survey = SurveyData(CSV_PATH)


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse(request=request, name="index.html", context={})


@app.get("/api/meta")
def api_meta():
    return survey.metadata()


@app.get("/api/aggregate")
def api_aggregate(
    field: str = Query("q1"),
    breakdown: str = Query("none"),
    department: str = Query("__all__"),
    semester: str = Query("__all__"),
    top_n: int = Query(20, ge=1, le=100),
):
    try:
        return survey.aggregate(
            field_id=field,
            breakdown=breakdown,
            department=department,
            semester=semester,
            top_n=top_n,
        )
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/department-semester")
def api_department_semester():
    return survey.department_semester_matrix()


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5000)
