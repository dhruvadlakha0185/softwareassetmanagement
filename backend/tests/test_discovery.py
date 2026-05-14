import io
import csv
import pytest
from openpyxl import Workbook


def _make_csv(rows: list[dict]) -> bytes:
    buf = io.StringIO()
    if not rows:
        return b""
    writer = csv.DictWriter(buf, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue().encode()


def _make_xlsx(rows: list[dict]) -> bytes:
    wb = Workbook()
    ws = wb.active
    if not rows:
        return b""
    ws.append(list(rows[0].keys()))
    for row in rows:
        ws.append(list(row.values()))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


async def test_list_discovery_returns_list(client):
    resp = await client.get("/api/v1/discovery")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_ingest_requires_auth(client):
    resp = await client.post(
        "/api/v1/discovery/ingest",
        files={"file": ("test.csv", io.BytesIO(b"contract_name\nMicrosoft 365"), "text/csv")},
    )
    assert resp.status_code in (401, 403)


async def test_ingest_csv(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    csv_data = _make_csv([
        {"contract_name": "Microsoft 365", "device_id": "PC001", "device_type": "endpoint",
         "os": "Windows 11", "version": "24H2", "last_seen": "2026-05-01", "site": "HQ"},
        {"contract_name": "Unknown Software XYZ", "device_id": "PC002", "device_type": "endpoint",
         "os": "Windows 10", "version": "22H2", "last_seen": "2026-04-15", "site": "Lab"},
    ])
    resp = await client.post(
        "/api/v1/discovery/ingest",
        files={"file": ("discovery.csv", io.BytesIO(csv_data), "text/csv")},
        headers=h,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["inserted"] == 2
    assert data["matched"] >= 0
    assert data["unmatched"] >= 0
    assert "batch_id" in data


async def test_ingest_xlsx(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    xlsx_data = _make_xlsx([
        {"contract_name": "SAP ERP (S/4HANA)", "device_id": "SRV001",
         "device_type": "server", "os": "RHEL 8", "version": "2023",
         "last_seen": "2026-05-10", "site": "Mumbai"},
    ])
    resp = await client.post(
        "/api/v1/discovery/ingest",
        files={"file": ("discovery.xlsx", io.BytesIO(xlsx_data),
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=h,
    )
    assert resp.status_code == 201
    assert resp.json()["inserted"] == 1


async def test_ingest_invalid_format_rejected(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post(
        "/api/v1/discovery/ingest",
        files={"file": ("file.txt", io.BytesIO(b"text content"), "text/plain")},
        headers=h,
    )
    assert resp.status_code == 400


async def test_list_filter_unmatched(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    csv_data = _make_csv([
        {"contract_name": "Definitely Unknown SW 99999", "device_id": "FC001",
         "device_type": "endpoint", "os": "Windows 11", "version": "1.0",
         "last_seen": "2026-05-01", "site": "HQ"},
    ])
    await client.post(
        "/api/v1/discovery/ingest",
        files={"file": ("d.csv", io.BytesIO(csv_data), "text/csv")},
        headers=h,
    )
    unmatched_resp = await client.get("/api/v1/discovery?matched=false")
    assert unmatched_resp.status_code == 200
    assert all(r["sw_id"] is None for r in unmatched_resp.json())
