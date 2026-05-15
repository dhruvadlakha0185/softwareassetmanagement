"""
XLSX template generator and Tab A / Tab B parser.

Tab A — Entitlement Metadata:
  LOCKED (grey):    ENT_ID | SW_ID | Canonical Name | Metric | Current Status
  EDITABLE (white): Contract Name | License Type | Entitled Count
                    | Unit Cost (INR) | Annual Cost (INR) | PO Number | Notes

Tab B — Usage Update:
  LOCKED (grey):    ENT_ID | SW_ID | Canonical Name
  EDITABLE (white): In-Use Count | Reporting Period | Reason for Change
"""
import io
import hashlib
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment


_HEADER_FILL = PatternFill("solid", fgColor="1A2E5A")   # DRL navy
_HEADER_FONT = Font(color="FFFFFF", bold=True, size=10)
_LOCKED_FILL = PatternFill("solid", fgColor="F0F2F5")   # light grey = read-only hint


def _style_header(ws, row: int, cols: int) -> None:
    for col in range(1, cols + 1):
        cell = ws.cell(row=row, column=col)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = Alignment(horizontal="center")


def generate_template(entitlements: list[dict]) -> bytes:
    """
    Build an XLSX workbook with two sheets pre-populated from entitlements list.
    Each dict must have: ent_id, sw_id, canonical_name, metric_name, status,
                         contract_name, license_type, entitled_count,
                         unit_cost_inr, annual_cost_inr, po_number,
                         in_use_count, notes
    Returns raw bytes of the .xlsx file.
    """
    wb = Workbook()

    # ── Tab A ──────────────────────────────────────────────────────────────────
    # Cols 1-5 locked (reference), cols 6-12 editable
    ws_a = wb.active
    ws_a.title = "Tab A - Metadata"
    headers_a = [
        "ENT_ID", "SW_ID", "Canonical Name", "Metric", "Current Status",  # locked (1-5)
        "Contract Name", "License Type (subscription/perpetual)",           # editable (6-7)
        "Entitled Count", "Unit Cost (INR)", "Annual Cost (INR)",           # editable (8-10)
        "PO Number", "Notes",                                               # editable (11-12)
    ]
    ws_a.append(headers_a)
    _style_header(ws_a, 1, len(headers_a))

    for ent in entitlements:
        ws_a.append([
            ent.get("ent_id", ""),
            ent.get("sw_id", ""),
            ent.get("canonical_name", ""),
            ent.get("metric_name", ""),
            ent.get("status", ""),
            ent.get("contract_name", ""),
            ent.get("license_type", ""),
            ent.get("entitled_count") or "",
            ent.get("unit_cost_inr") or "",
            ent.get("annual_cost_inr") or "",
            ent.get("po_number") or "",
            ent.get("notes") or "",
        ])

    # Grey out locked reference columns (1-5)
    for row in ws_a.iter_rows(min_row=2, min_col=1, max_col=5):
        for cell in row:
            cell.fill = _LOCKED_FILL

    # ── Tab B ──────────────────────────────────────────────────────────────────
    ws_b = wb.create_sheet("Tab B - Usage")
    headers_b = ["ENT_ID", "SW_ID", "Canonical Name", "In-Use Count",
                 "Reporting Period", "Reason for Change"]
    ws_b.append(headers_b)
    _style_header(ws_b, 1, len(headers_b))

    for ent in entitlements:
        ws_b.append([
            ent.get("ent_id", ""),
            ent.get("sw_id", ""),
            ent.get("canonical_name", ""),
            ent.get("in_use_count") or "",
            "",  # Reporting Period — user fills
            "",  # Reason — user fills
        ])

    # Grey out read-only info columns (1-3)
    for row in ws_b.iter_rows(min_row=2, min_col=1, max_col=3):
        for cell in row:
            cell.fill = _LOCKED_FILL

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def parse_tab_a(data: bytes) -> list[dict]:
    """
    Parse Tab A sheet. Returns list of dicts with updatable keys.
    Column layout (0-indexed):
      0  ENT_ID (key, locked)
      1  SW_ID (locked)
      2  Canonical Name (locked)
      3  Metric (locked)
      4  Current Status (locked)
      5  Contract Name (editable)
      6  License Type (editable — normalised to lowercase)
      7  Entitled Count (editable)
      8  Unit Cost INR (editable)
      9  Annual Cost INR (editable)
      10 PO Number (editable)
      11 Notes (editable)
    Skips rows where ENT_ID is blank.
    """
    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb["Tab A - Metadata"]
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    result = []
    for row in rows:
        if not row or not row[0]:
            continue
        license_type = str(row[6]).strip().lower() if row[6] else None
        if license_type not in ("subscription", "perpetual"):
            license_type = None  # ignore invalid values
        result.append({
            "ent_id":          str(row[0]).strip(),
            "contract_name":   str(row[5]).strip() if row[5] else None,
            "license_type":    license_type,
            "entitled_count":  int(row[7]) if row[7] is not None else None,
            "unit_cost_inr":   int(row[8]) if row[8] is not None else None,
            "annual_cost_inr": int(row[9]) if row[9] is not None else None,
            "po_number":       str(row[10]).strip() if row[10] else None,
            "notes":           str(row[11]).strip() if row[11] else None,
        })
    return result


def parse_tab_b(data: bytes) -> list[dict]:
    """
    Parse Tab B sheet. Returns list of dicts with keys:
    ent_id, in_use_count, reporting_period, reason
    Skips rows where ENT_ID is blank.
    """
    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb["Tab B - Usage"]
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    result = []
    for row in rows:
        if not row or not row[0]:
            continue
        result.append({
            "ent_id": str(row[0]).strip(),
            "in_use_count": int(row[3]) if row[3] is not None else None,
            "reporting_period": str(row[4]).strip() if row[4] else None,
            "reason": str(row[5]).strip() if row[5] else None,
        })
    return result


def file_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
