from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Any

import pandas as pd

from normalization import normalize_department, normalize_semester


class SurveyData:
    def __init__(self, csv_path: str | Path):
        self.csv_path = Path(csv_path)
        self.raw = pd.read_csv(self.csv_path)
        self.df = self.raw.copy()

        self.department_col = self._find_column("What is your department?")
        self.semester_col = self._find_column("Which semester are you currently in?")

        self.df["__department__"] = self.df[self.department_col].map(normalize_department)
        self.df["__semester__"] = self.df[self.semester_col].map(normalize_semester)

        self.column_ids: dict[str, str] = {
            f"q{i}": col for i, col in enumerate(self.raw.columns)
        }
        self.id_by_column = {value: key for key, value in self.column_ids.items()}

    def _find_column(self, starts_with: str) -> str:
        for col in self.raw.columns:
            if col.strip().lower().startswith(starts_with.lower()):
                return col
        raise ValueError(f"Required column not found: {starts_with}")

    @staticmethod
    def _short_label(column: str) -> str:
        label = column.split("(", 1)[0].strip()
        label = re.sub(r"-+$", "", label).strip()
        return label

    @staticmethod
    def _clean_value(value: Any) -> str:
        if value is None:
            return "(No response)"
        if isinstance(value, float) and math.isnan(value):
            return "(No response)"
        text = str(value).strip()
        return text if text else "(No response)"

    @staticmethod
    def _semester_sort_key(value: str):
        match = re.search(r"(\d+)", value)
        return (0, int(match.group(1))) if match else (1, value)

    def metadata(self) -> dict[str, Any]:
        departments = sorted(self.df["__department__"].unique().tolist())
        semesters = sorted(
            self.df["__semester__"].unique().tolist(),
            key=self._semester_sort_key,
        )
        fields = [
            {
                "id": field_id,
                "label": self._short_label(column),
                "full_label": column,
            }
            for field_id, column in self.column_ids.items()
            if column != "Timestamp"
        ]
        return {
            "total_rows": int(len(self.df)),
            "department_count": len([d for d in departments if d != "Unspecified"]),
            "semester_count": len([s for s in semesters if s != "Unspecified"]),
            "field_count": len(fields),
            "fields": fields,
            "departments": departments,
            "semesters": semesters,
            "department_field_id": self.id_by_column[self.department_col],
            "semester_field_id": self.id_by_column[self.semester_col],
        }

    def _filtered(self, department: str | None, semester: str | None) -> pd.DataFrame:
        df = self.df
        if department and department != "__all__":
            df = df[df["__department__"] == department]
        if semester and semester != "__all__":
            df = df[df["__semester__"] == semester]
        return df.copy()

    def aggregate(
        self,
        field_id: str,
        breakdown: str = "none",
        department: str | None = None,
        semester: str | None = None,
        top_n: int = 20,
    ) -> dict[str, Any]:
        if field_id not in self.column_ids:
            raise ValueError("Unknown field")
        if breakdown not in {"none", "department", "semester", "department_semester"}:
            raise ValueError("Unknown breakdown")

        column = self.column_ids[field_id]
        df = self._filtered(department, semester)
        if column == self.department_col:
            df["__response__"] = df["__department__"]
        elif column == self.semester_col:
            df["__response__"] = df["__semester__"]
        else:
            df["__response__"] = df[column].map(self._clean_value)

        if breakdown == "none":
            df["__group__"] = "All responses"
        elif breakdown == "department":
            df["__group__"] = df["__department__"]
        elif breakdown == "semester":
            df["__group__"] = df["__semester__"]
        else:
            df["__group__"] = df["__department__"] + " · " + df["__semester__"]

        counts = (
            df.groupby(["__response__", "__group__"], dropna=False)
            .size()
            .reset_index(name="count")
        )

        totals_by_response = (
            counts.groupby("__response__")["count"]
            .sum()
            .sort_values(ascending=False)
        )
        keep = totals_by_response.head(max(1, min(top_n, 100))).index.tolist()

        if len(totals_by_response) > len(keep):
            counts["__response__"] = counts["__response__"].where(
                counts["__response__"].isin(keep), "Other"
            )
            counts = (
                counts.groupby(["__response__", "__group__"], as_index=False)["count"]
                .sum()
            )

        response_order = (
            counts.groupby("__response__")["count"]
            .sum()
            .sort_values(ascending=False)
            .index.tolist()
        )
        group_order = (
            counts.groupby("__group__")["count"]
            .sum()
            .sort_values(ascending=False)
            .index.tolist()
        )

        pivot = counts.pivot_table(
            index="__response__",
            columns="__group__",
            values="count",
            aggfunc="sum",
            fill_value=0,
        ).reindex(response_order)

        datasets = []
        for group in group_order:
            values = [int(v) for v in pivot.get(group, pd.Series(index=pivot.index, data=0)).tolist()]
            datasets.append({"label": group, "data": values})

        filtered_total = int(len(df))
        table_rows = []
        for _, row in counts.sort_values("count", ascending=False).iterrows():
            count = int(row["count"])
            table_rows.append(
                {
                    "response": row["__response__"],
                    "group": row["__group__"],
                    "count": count,
                    "percent": round((count / filtered_total * 100), 2) if filtered_total else 0,
                }
            )

        return {
            "field_id": field_id,
            "field_label": self._short_label(column),
            "breakdown": breakdown,
            "filtered_total": filtered_total,
            "labels": response_order,
            "datasets": datasets,
            "table": table_rows,
            "category_count": len(response_order),
            "group_count": len(group_order),
        }

    def department_semester_matrix(self) -> dict[str, Any]:
        table = pd.crosstab(self.df["__department__"], self.df["__semester__"])
        dept_order = table.sum(axis=1).sort_values(ascending=False).index.tolist()
        sem_order = sorted(table.columns.tolist(), key=self._semester_sort_key)
        table = table.reindex(index=dept_order, columns=sem_order, fill_value=0)
        return {
            "departments": dept_order,
            "semesters": sem_order,
            "values": [
                [int(table.loc[dept, sem]) for sem in sem_order]
                for dept in dept_order
            ],
        }
