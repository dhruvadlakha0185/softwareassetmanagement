"""
Comprehensive mock data seed for DRL SAM Platform v3.0.

Covers every UI scenario:
  • Software Catalog  : 24 titles across all categories, GxP flags, vendor risks
  • Contracts         : T+1, T+7, T+15, T+30, T+60, T+90, far-future, and 2 expired
  • Entitlements      : OVER_DEPLOYED × 4, WATCH × 7, UNDER_UTILISED × 5, OK × 6, EXPIRED × 2
  • Discovery Records : 20 records — 12 matched, 8 unmatched
  • Alerts            : Pre-built renewal (CRITICAL→INFO) + utilisation (HIGH/MEDIUM)
  • Reconciliation    : One completed run with results

Run once:
    cd backend && python -m scripts.seed_mock

Also exposed as POST /api/v1/admin/seed-mock  (COE_ADMIN only).
Idempotent — checks if SW-013 exists before inserting.
"""
import asyncio
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.catalog import SoftwareCatalog, SoftwareAlias
from app.models.contracts import Contract, Entitlement
from app.models.discovery import DiscoveryRecord
from app.models.alerts import Alert
from app.models.masters import Category, SubCategory, Vendor, LicenseMetric, Region
from app.models.reconciliation import ReconciliationRun, ReconciliationResult
from app.models.users import User
import app.models  # noqa — registers all models

TODAY = date.today()


def _d(offset_days: int) -> date:
    return TODAY + timedelta(days=offset_days)


async def _lookup(session: AsyncSession, model, field: str, value: str):
    r = await session.execute(select(model).where(getattr(model, field) == value))
    return r.scalar_one_or_none()


async def seed_mock():
    async with AsyncSessionLocal() as s:

        # ── Guard: idempotent ─────────────────────────────────────────────
        if (await s.execute(select(SoftwareCatalog).where(SoftwareCatalog.sw_id == "SW-013"))).scalar_one_or_none():
            print("[mock] SW-013 already exists — skipping mock seed.")
            return

        print("[mock] Building comprehensive mock dataset…")

        # ── Resolve seeded master data ────────────────────────────────────
        cats = {c.name: c for c in (await s.execute(select(Category))).scalars()}
        subs = {sc.name: sc for sc in (await s.execute(select(SubCategory))).scalars()}
        vendors = {v.name: v for v in (await s.execute(select(Vendor))).scalars()}
        metrics = {m.name: m for m in (await s.execute(select(LicenseMetric))).scalars()}
        regions = {r.name: r for r in (await s.execute(select(Region))).scalars()}
        users_by_email = {u.email: u for u in (await s.execute(select(User))).scalars()}

        # User shortcuts
        jw = users_by_email.get("j.williams@drl.com")   # IT Ops
        rc = users_by_email.get("r.chen@drl.com")        # QC Labs
        kp = users_by_email.get("k.patel@drl.com")       # ERP
        mg = users_by_email.get("m.garcia@drl.com")      # Manufacturing
        adm = users_by_email.get("admin@drl.local")

        def cat_id(name):  return cats[name].id if name in cats else None
        def sub_id(name):  return subs[name].id if name in subs else None
        def ven_id(name):  return vendors[name].id if name in vendors else None
        def reg_id(name):  return regions[name].id if name in regions else None
        def met_id(name):  return metrics[name].id if name in metrics else None

        # ── ① 12 additional SW catalog entries ───────────────────────────
        NEW_SW = [
            dict(sw_id="SW-013", canonical_name="SAP Concur",
                 publisher="SAP", category_id=cat_id("ERP & Supply Chain"),
                 sub_category_id=sub_id("SCM Planning"), gxp_flag="no",
                 vendor_id=ven_id("SAP"), vendor_risk="MEDIUM",
                 deployment="cloud", region_id=reg_id("India"),
                 app_owner_id=kp.id if kp else None,
                 notes="Travel & expense management. ~2,800 active travellers.",
                 onboarded_date=date(2024, 4, 1)),

            dict(sw_id="SW-014", canonical_name="Medidata Rave EDC",
                 publisher="Medidata", category_id=cat_id("R&D & Lab Informatics"),
                 sub_category_id=sub_id("ELN"), gxp_flag="yes_21cfr",
                 vendor_id=None, vendor_risk="MEDIUM",
                 deployment="cloud", region_id=reg_id("US"),
                 app_owner_id=rc.id if rc else None,
                 notes="Clinical EDC for Phase I-III trials. 21 CFR Part 11 validated.",
                 onboarded_date=date(2023, 9, 15)),

            dict(sw_id="SW-015", canonical_name="IBM Cognos Analytics",
                 publisher="IBM", category_id=cat_id("Enterprise Productivity"),
                 sub_category_id=sub_id("Diagramming"), gxp_flag="no",
                 vendor_id=ven_id("IBM"), vendor_risk="HIGH",
                 deployment="on_premise", region_id=reg_id("India"),
                 app_owner_id=jw.id if jw else None,
                 notes="BI/reporting platform. IBM sub-capacity licensing — requires IBM SUA tool.",
                 onboarded_date=date(2022, 1, 10)),

            dict(sw_id="SW-016", canonical_name="Symantec Endpoint Protection",
                 publisher="Broadcom", category_id=cat_id("IT Security"),
                 sub_category_id=sub_id("EDR/XDR"), gxp_flag="no",
                 vendor_id=ven_id("Broadcom/VMware"), vendor_risk="HIGH",
                 deployment="on_premise", region_id=reg_id("India"),
                 app_owner_id=jw.id if jw else None,
                 notes="Legacy AV/EDR. Migration to CrowdStrike planned post-contract expiry.",
                 onboarded_date=date(2021, 6, 1)),

            dict(sw_id="SW-017", canonical_name="Oracle E-Business Suite",
                 publisher="Oracle", category_id=cat_id("ERP & Supply Chain"),
                 sub_category_id=sub_id("ERP"), gxp_flag="yes_21cfr",
                 vendor_id=ven_id("Oracle"), vendor_risk="HIGH",
                 deployment="on_premise", region_id=reg_id("India"),
                 app_owner_id=kp.id if kp else None,
                 notes="Legacy ERP for India manufacturing. GxP validated for batch records.",
                 onboarded_date=date(2020, 3, 1)),

            dict(sw_id="SW-018", canonical_name="Tableau Desktop",
                 publisher="Salesforce", category_id=cat_id("Enterprise Productivity"),
                 sub_category_id=sub_id("Diagramming"), gxp_flag="no",
                 vendor_id=None, vendor_risk="LOW",
                 deployment="desktop_cloud", region_id=reg_id("Global"),
                 app_owner_id=jw.id if jw else None,
                 notes="Self-service BI. Usage dropped significantly after Power BI rollout.",
                 onboarded_date=date(2023, 1, 15)),

            dict(sw_id="SW-019", canonical_name="Qualys VMDR",
                 publisher="Qualys", category_id=cat_id("IT Security"),
                 sub_category_id=sub_id("Vulnerability Mgmt"), gxp_flag="no",
                 vendor_id=None, vendor_risk="LOW",
                 deployment="cloud", region_id=reg_id("Global"),
                 app_owner_id=jw.id if jw else None,
                 notes="Vulnerability management and patch prioritisation.",
                 onboarded_date=date(2024, 2, 1)),

            dict(sw_id="SW-020", canonical_name="Veeva Vault RIM",
                 publisher="Veeva Systems", category_id=cat_id("Quality & Compliance"),
                 sub_category_id=sub_id("GRC"), gxp_flag="yes_both",
                 vendor_id=ven_id("Veeva Systems"), vendor_risk="LOW",
                 deployment="cloud", region_id=reg_id("Global"),
                 app_owner_id=rc.id if rc else None,
                 notes="Regulatory information management. Annex 11 + 21 CFR Part 11 validated.",
                 onboarded_date=date(2024, 1, 1)),

            dict(sw_id="SW-021", canonical_name="Microsoft Power BI",
                 publisher="Microsoft", category_id=cat_id("Enterprise Productivity"),
                 sub_category_id=sub_id("Low-Code"), gxp_flag="no",
                 vendor_id=ven_id("Microsoft"), vendor_risk="MEDIUM",
                 deployment="cloud", region_id=reg_id("Global"),
                 app_owner_id=jw.id if jw else None,
                 notes="Enterprise BI included in M365 E3. Separate Power BI Premium for large datasets.",
                 onboarded_date=date(2025, 1, 1)),

            dict(sw_id="SW-022", canonical_name="OpenText Documentum D2",
                 publisher="OpenText", category_id=cat_id("Quality & Compliance"),
                 sub_category_id=sub_id("QMS"), gxp_flag="yes_21cfr",
                 vendor_id=None, vendor_risk="MEDIUM",
                 deployment="on_premise", region_id=reg_id("India"),
                 app_owner_id=mg.id if mg else None,
                 notes="Document management for batch records and SOPs. 21 CFR Part 11 validated.",
                 onboarded_date=date(2022, 7, 1)),

            dict(sw_id="SW-023", canonical_name="Cisco Umbrella",
                 publisher="Cisco", category_id=cat_id("IT Security"),
                 sub_category_id=sub_id("Firewall"), gxp_flag="no",
                 vendor_id=None, vendor_risk="LOW",
                 deployment="cloud", region_id=reg_id("Global"),
                 app_owner_id=jw.id if jw else None,
                 notes="DNS-layer security. Covers all 5,000+ managed endpoints globally.",
                 onboarded_date=date(2024, 4, 1)),

            dict(sw_id="SW-024", canonical_name="Mulesoft Anypoint Platform",
                 publisher="Salesforce", category_id=cat_id("IT Infrastructure"),
                 sub_category_id=sub_id("Cloud"), gxp_flag="no",
                 vendor_id=None, vendor_risk="MEDIUM",
                 deployment="cloud", region_id=reg_id("Global"),
                 app_owner_id=jw.id if jw else None,
                 notes="Integration platform. Core licence expired — renewal in progress.",
                 onboarded_date=date(2023, 6, 1)),
        ]

        for data in NEW_SW:
            s.add(SoftwareCatalog(**data))
        await s.flush()
        print(f"  [mock] Added {len(NEW_SW)} SW catalog entries (SW-013 to SW-024)")

        # ── ② Contracts — strategic expiry dates ─────────────────────────
        #  Each (sw_id, po_number, clm_id, end_date, start_date, value, renewal)
        CONTRACT_SPECS = [
            # Existing SW entries (SW-001 to SW-012)
            ("SW-001", "PO-2025-MS-001",  "CLM-2025-0021", date(2024,1,1), _d(230),  900_000_000, "yes",    "Microsoft 365 E3 + E5 Security"),
            ("SW-002", "PO-2025-SAP-001", "CLM-2025-0034", date(2025,4,1), _d(7),    450_000_000, "opt_in", "SAP S/4HANA On-Prem Enterprise"),
            ("SW-003", "PO-2024-ORA-003", "CLM-2024-0089", date(2023,4,1), _d(30),   320_000_000, "no",     "Oracle DB 19c NUP + Support"),
            ("SW-004", "PO-2020-LW-001",  None,            date(2020,1,1), None,     None,        "no",     "LabWare LIMS Perpetual License"),
            ("SW-005", "PO-2024-VV-001",  "CLM-2024-0056", date(2024,8,1), _d(90),   225_000_000, "yes",    "Veeva Vault QMS Annual Subscription"),
            ("SW-006", "PO-2024-MS-002",  "CLM-2024-0102", date(2024,1,1), _d(230),  45_000_000,  "yes",    "Windows Server 2022 Datacenter"),
            ("SW-007", "PO-2025-CS-001",  "CLM-2025-0007", date(2025,4,1), _d(138),  48_000_000,  "yes",    "CrowdStrike Falcon Enterprise"),
            ("SW-008", "PO-2025-SN-001",  "CLM-2025-0012", date(2024,7,1), _d(60),   48_000_000,  "opt_in", "ServiceNow ITSM Professional"),
            ("SW-009", "PO-2025-BC-001",  "CLM-2025-0045", date(2024,5,1), _d(15),   66_000_000,  "no",     "VMware vSphere 8 Support Renewal"),
            ("SW-010", "PO-2024-AD-001",  None,            date(2024,4,1), _d(320),  12_000_000,  "yes",    "Adobe Acrobat Pro DC VIP"),
            ("SW-011", "PO-2022-AV-001",  None,            date(2022,4,1), _d(30),   25_000_000,  "no",     "AVEVA PI System Support"),
            ("SW-012", "PO-2019-KP-001",  None,            date(2019,1,1), None,     None,        "no",     "Koerber PAS-X MES Perpetual"),
            # New SW entries (SW-013 to SW-024)
            ("SW-013", "PO-2025-SAP-002", "CLM-2025-0061", date(2025,5,1), _d(1),    28_000_000,  "no",     "SAP Concur Travel & Expense"),
            ("SW-014", "PO-2024-MD-001",  "CLM-2024-0073", date(2024,8,1), _d(77),   25_000_000,  "opt_in", "Medidata Rave EDC Clinical"),
            ("SW-015", "PO-2023-IBM-001", "CLM-2023-0031", date(2023,5,1), _d(15),   30_000_000,  "no",     "IBM Cognos Analytics Sub-Cap"),
            ("SW-016", "PO-2023-BC-002",  None,            date(2023,4,15),_d(-30),  16_000_000,  "no",     "Symantec SEP Enterprise"),    # EXPIRED
            ("SW-017", "PO-2023-ORA-002", "CLM-2023-0044", date(2023,6,1), _d(30),   45_000_000,  "no",     "Oracle EBS R12 NUP + Support"),
            ("SW-018", "PO-2024-SF-001",  None,            date(2024,2,1), _d(261),  4_800_000,   "yes",    "Tableau Desktop Creator"),
            ("SW-019", "PO-2025-QL-001",  "CLM-2025-0018", date(2025,3,1), _d(139),  28_500_000,  "yes",    "Qualys VMDR Enterprise"),
            ("SW-020", "PO-2024-VV-002",  "CLM-2024-0081", date(2024,8,1), _d(77),   156_000_000, "yes",    "Veeva Vault RIM Annual"),
            ("SW-021", "PO-2025-MS-003",  "CLM-2025-0003", date(2025,1,1), _d(320),  21_000_000,  "yes",    "Power BI Premium P1 Node"),
            ("SW-022", "PO-2022-OT-001",  "CLM-2022-0019", date(2022,7,1), _d(46),   9_500_000,   "opt_in", "Documentum D2 Annual Support"),
            ("SW-023", "PO-2025-CI-001",  "CLM-2025-0022", date(2025,4,1), _d(139),  22_500_000,  "yes",    "Cisco Umbrella DNS Advantage"),
            ("SW-024", "PO-2022-SF-002",  None,            date(2022,6,1), _d(-135), 17_000_000,  "no",     "Mulesoft Anypoint Gold"),      # EXPIRED
        ]

        contract_by_sw: dict[str, Contract] = {}
        for (sw_id, po, clm, start, end, value, renewal, name) in CONTRACT_SPECS:
            c = Contract(
                sw_id=sw_id,
                po_number=po,
                clm_id=clm,
                start_date=start,
                end_date=end,
                total_value_inr=value,
                auto_renewal_clause=renewal,
                file_name=f"{name.replace(' ','_')}.pdf",
                storage_backend="supabase",
                is_archived=False,
                created_by=adm.id if adm else None,
            )
            s.add(c)
            await s.flush()
            contract_by_sw[sw_id] = c

        print(f"  [mock] Added {len(CONTRACT_SPECS)} contracts")

        # ── ③ Entitlements — all status scenarios ─────────────────────────
        #  (sw_id, contract_name, lic_type, metric, entitled, in_use, unit_cost, annual_cost, status, owner)
        ENT_SPECS = [
            # ── WATCH (>90% util) ──────────────────────────────────────────
            ("SW-001", "Microsoft 365 E3",               "subscription", "Per User",            2500, 2340,   3_600,  90_000_000, "WATCH",          jw),
            ("SW-005", "Veeva Vault Quality + RIM",      "subscription", "Per User",             500,  465,  45_000, 225_000_000, "WATCH",          rc),
            ("SW-006", "Windows Server 2022 Datacenter", "subscription", "Per Core (16-pack)",   200,  180,  15_000,  30_000_000, "WATCH",          jw),
            ("SW-007", "CrowdStrike Falcon Enterprise",  "subscription", "Per Endpoint",        4000, 3750,   1_200,  48_000_000, "WATCH",          jw),
            ("SW-009", "VMware vSphere 8 Enterprise",    "perpetual",    "Per Core (2-pack)",    120,  110,   5_500,  None,       "WATCH",          jw),
            ("SW-011", "AVEVA PI System 2023",           "perpetual",    "Per Tag",             5000, 4800,     500,  25_000_000, "WATCH",          mg),
            ("SW-013", "SAP Concur Travel",              "subscription", "Per User",            1000,  950,   2_800,  28_000_000, "WATCH",          kp),
            ("SW-019", "Qualys VMDR Cloud Platform",     "subscription", "Per Endpoint",        3000, 2800,     950,  28_500_000, "WATCH",          jw),
            ("SW-020", "Veeva Vault RIM Submissions",    "subscription", "Per User",             300,  280,  52_000, 156_000_000, "WATCH",          rc),
            # ── OVER_DEPLOYED (>100% util) ─────────────────────────────────
            ("SW-002", "SAP S/4HANA Enterprise",         "perpetual",    "Per User",             300,  310,  15_000,  45_000_000, "OVER_DEPLOYED",  kp),
            ("SW-003", "Oracle DB 19c NUP",              "perpetual",    "Per Processor (NUP)",    8,    8, 250_000, None,        "OVER_DEPLOYED",  kp),
            ("SW-012", "Koerber PAS-X MES",              "perpetual",    "Per Site / Line",        2,    3, 1_500_000,None,       "OVER_DEPLOYED",  mg),
            ("SW-017", "Oracle EBS R12 Users",           "perpetual",    "Per User",             200,  250,  18_000,  None,       "OVER_DEPLOYED",  kp),
            # ── UNDER_UTILISED (<30% util) ────────────────────────────────
            ("SW-008", "ServiceNow ITSM Pro",            "subscription", "Per User",             400,  120,   8_000,  48_000_000, "UNDER_UTILISED", jw),
            ("SW-010", "Adobe Acrobat Pro DC",           "subscription", "Per User",             800,  200,   1_500,  12_000_000, "UNDER_UTILISED", jw),
            ("SW-015", "IBM Cognos Analytics",           "subscription", "Per User",             100,   25,  12_000,  30_000_000, "UNDER_UTILISED", jw),
            ("SW-018", "Tableau Desktop Creator",        "subscription", "Per User",             150,   40,   3_200,   4_800_000, "UNDER_UTILISED", jw),
            ("SW-021", "Power BI Premium P1",            "subscription", "Per User",            1000,  300,   2_100,  21_000_000, "UNDER_UTILISED", jw),
            ("SW-024", "Mulesoft Anypoint Gold",         "subscription", "Per Core (2-pack)",     20,    5,  85_000,  None,       "UNDER_UTILISED", adm),
            # ── OK / ACTIVE ────────────────────────────────────────────────
            ("SW-004", "LabWare LIMS Perpetual",         "perpetual",    "Concurrent User",       75,   60, 200_000,  None,       "OK",             rc),
            ("SW-014", "Medidata Rave EDC",              "subscription", "Per Study",             10,    8, 2_500_000, 25_000_000,"OK",             rc),
            ("SW-022", "Documentum D2 Users",            "subscription", "Per User",             100,   80,   9_500,   9_500_000, "OK",             mg),
            ("SW-023", "Cisco Umbrella DNS Advantage",   "subscription", "Per Endpoint",        5000, 4200,     450,  22_500_000, "OK",             jw),
            # ── EXPIRED ────────────────────────────────────────────────────
            ("SW-016", "Symantec SEP Enterprise",        "subscription", "Per Endpoint",        2000, 2000,     800,  16_000_000, "EXPIRED",        jw),
        ]

        ent_by_sw: dict[str, Entitlement] = {}
        for idx, (sw_id, cname, lic, metric_name, entitled, in_use, unit_cost, annual_cost, status, owner) in enumerate(ENT_SPECS, start=1):
            ent = Entitlement(
                ent_id=f"ENT-{idx:03d}",
                sw_id=sw_id,
                contract_id=contract_by_sw[sw_id].id if sw_id in contract_by_sw else None,
                contract_name=cname,
                metric_id=met_id(metric_name),
                license_type=lic,
                entitled_count=entitled,
                in_use_count=in_use,
                unit_cost_inr=unit_cost,
                annual_cost_inr=annual_cost,
                app_owner_id=owner.id if owner else None,
                status=status,
            )
            s.add(ent)
            ent_by_sw[sw_id] = ent

        await s.flush()
        print(f"  [mock] Added {len(ENT_SPECS)} entitlements ({sum(1 for _,_,_,_,_,_,_,_,st,_ in ENT_SPECS if st=='WATCH')} WATCH, "
              f"{sum(1 for _,_,_,_,_,_,_,_,st,_ in ENT_SPECS if st=='OVER_DEPLOYED')} OVER_DEPLOYED, "
              f"{sum(1 for _,_,_,_,_,_,_,_,st,_ in ENT_SPECS if st=='UNDER_UTILISED')} UNDER_UTILISED, "
              f"{sum(1 for _,_,_,_,_,_,_,_,st,_ in ENT_SPECS if st=='EXPIRED')} EXPIRED)")

        # ── ④ Aliases ─────────────────────────────────────────────────────
        ALIASES = [
            ("SW-001", ["M365", "Office 365", "Microsoft Office", "MSFT 365"]),
            ("SW-002", ["SAP S4", "S/4HANA", "SAP ERP Central"]),
            ("SW-003", ["Oracle DB", "ODB", "Oracle RDBMS"]),
            ("SW-007", ["CS Falcon", "CrowdStrike"]),
            ("SW-008", ["SN ITSM", "ServiceNow"]),
            ("SW-013", ["Concur", "SAP Travel"]),
            ("SW-016", ["SEP", "Symantec AV"]),
            ("SW-021", ["Power BI", "PBI"]),
        ]
        for sw_id, names in ALIASES:
            for n in names:
                s.add(SoftwareAlias(sw_id=sw_id, alias_name=n, source_name="mock_seed"))
        await s.flush()
        print(f"  [mock] Added aliases for {len(ALIASES)} SW entries")

        # ── ⑤ Discovery records ───────────────────────────────────────────
        DISC = [
            # Matched (contract_name matches catalog)
            ("Microsoft 365 E3",              "PC-MUM-001",  "endpoint", "Windows 11",   "23H2",   _d(-3),  "Mumbai R&D"),
            ("Microsoft 365 E3",              "PC-HYD-045",  "endpoint", "Windows 11",   "22H2",   _d(-5),  "Hyderabad HQ"),
            ("SAP S/4HANA Enterprise",        "SRV-SAP-01",  "server",   "SLES 15",      "2023",   _d(-7),  "Mumbai DC"),
            ("Oracle DB 19c NUP",             "SRV-ORA-01",  "server",   "Oracle Linux 8","19.20", _d(-2),  "Hyderabad DC"),
            ("Oracle DB 19c NUP",             "SRV-ORA-02",  "server",   "Oracle Linux 8","19.20", _d(-4),  "Mumbai DC"),
            ("CrowdStrike Falcon Enterprise", "PC-NJ-023",   "endpoint", "Windows 10",   "22H2",   _d(-1),  "NJ QC Lab"),
            ("CrowdStrike Falcon Enterprise", "PC-MUM-099",  "endpoint", "macOS",        "14.4",   _d(-3),  "Mumbai R&D"),
            ("ServiceNow ITSM Pro",           "SRV-SN-01",   "server",   "RHEL 8",       "8.9",    _d(-10), "Mumbai DC"),
            ("LabWare LIMS Perpetual",        "WS-QC-007",   "endpoint", "Windows 10",   "LTSC",   _d(-2),  "Hyderabad QC"),
            ("LabWare LIMS Perpetual",        "WS-QC-008",   "endpoint", "Windows 10",   "LTSC",   _d(-2),  "Mumbai R&D"),
            ("Adobe Acrobat Pro DC",          "PC-HYD-102",  "endpoint", "Windows 11",   "23H2",   _d(-5),  "Hyderabad HQ"),
            ("Tableau Desktop Creator",       "PC-MUM-057",  "endpoint", "Windows 11",   "23H2",   _d(-3),  "Mumbai R&D"),
            # Unmatched (shadow IT or contract name not in catalog)
            ("AutoCAD 2024",                  "PC-MFG-033",  "endpoint", "Windows 10",   "22H2",   _d(-8),  "Frankfurt Mfg"),
            ("WinRAR 6.2",                    "PC-HYD-200",  "endpoint", "Windows 11",   "23H2",   _d(-1),  "Hyderabad HQ"),
            ("TeamViewer Host",               "PC-MUM-155",  "endpoint", "Windows 10",   "22H2",   _d(-15), "Mumbai R&D"),
            ("Notepad++ 8.6",                 "PC-NJ-041",   "endpoint", "Windows 10",   "22H2",   _d(-3),  "NJ QC Lab"),
            ("7-Zip 23.01",                   "PC-HYD-088",  "endpoint", "Windows 11",   "23H2",   _d(-6),  "Hyderabad HQ"),
            ("Python 3.12 (Unofficial)",      "SRV-DEV-03",  "server",   "Ubuntu 22.04", "22.04",  _d(-2),  "Hyderabad DC"),
            ("Zoom Client 5.17",              "PC-MUM-077",  "endpoint", "macOS",        "13.6",   _d(-4),  "Mumbai R&D"),
            ("Foxit PDF Reader",              "PC-FRA-012",  "endpoint", "Windows 10",   "22H2",   _d(-9),  "Frankfurt Mfg"),
        ]

        # Static contract_name → sw_id mapping for matched discovery records
        DISC_MATCH = {
            "Microsoft 365 E3":              "SW-001",
            "SAP S/4HANA Enterprise":        "SW-002",
            "Oracle DB 19c NUP":             "SW-003",
            "CrowdStrike Falcon Enterprise": "SW-007",
            "ServiceNow ITSM Pro":           "SW-008",
            "LabWare LIMS Perpetual":        "SW-004",
            "Adobe Acrobat Pro DC":          "SW-010",
            "Tableau Desktop Creator":       "SW-018",
        }

        batch_id = uuid.uuid4()
        disc_n = 1
        for (cname, dev_id, dev_type, os, ver, last_seen, site) in DISC:
            s.add(DiscoveryRecord(
                disc_id=f"D-{disc_n:04d}",
                contract_name=cname,
                sw_id=DISC_MATCH.get(cname),
                device_id=dev_id, device_type=dev_type, os=os, version=ver,
                last_seen=last_seen, site=site,
                upload_date=TODAY, upload_batch_id=batch_id,
            ))
            disc_n += 1

        await s.flush()
        print(f"  [mock] Added {len(DISC)} discovery records (12 matched, 8 unmatched)")

        # ── ⑥ Alerts — pre-built for dashboard ───────────────────────────
        def _sw(sw_id): return ent_by_sw.get(sw_id)

        ALERT_DATA = [
            # RENEWAL CRITICAL (T≤7)
            dict(alert_type="RENEWAL", ent_id=_sw("SW-013").ent_id if _sw("SW-013") else None,
                 severity="CRITICAL", days_to_expiry=1,
                 title=f"Renewal due TOMORROW: SAP Concur",
                 body_json={"sw_name": "SAP Concur", "end_date": str(_d(1)), "days_to_expiry": 1, "is_gxp": False},
                 is_gxp=False),
            dict(alert_type="RENEWAL", ent_id=_sw("SW-002").ent_id if _sw("SW-002") else None,
                 severity="CRITICAL", days_to_expiry=7,
                 title="Renewal due in 7 days: SAP S/4HANA Enterprise",
                 body_json={"sw_name": "SAP S/4HANA", "end_date": str(_d(7)), "days_to_expiry": 7, "is_gxp": False},
                 is_gxp=False),
            # RENEWAL HIGH (T≤30)
            dict(alert_type="RENEWAL", ent_id=_sw("SW-009").ent_id if _sw("SW-009") else None,
                 severity="HIGH", days_to_expiry=15,
                 title="Renewal due in 15 days: VMware vSphere Support",
                 body_json={"sw_name": "Broadcom VMware vSphere", "end_date": str(_d(15)), "days_to_expiry": 15, "is_gxp": False},
                 is_gxp=False),
            dict(alert_type="RENEWAL", ent_id=_sw("SW-015").ent_id if _sw("SW-015") else None,
                 severity="HIGH", days_to_expiry=15,
                 title="Renewal due in 15 days: IBM Cognos Analytics",
                 body_json={"sw_name": "IBM Cognos Analytics", "end_date": str(_d(15)), "days_to_expiry": 15, "is_gxp": False},
                 is_gxp=False),
            dict(alert_type="RENEWAL", ent_id=_sw("SW-003").ent_id if _sw("SW-003") else None,
                 severity="HIGH", days_to_expiry=30,
                 title="Renewal due in 30 days: Oracle DB 19c NUP",
                 body_json={"sw_name": "Oracle Database 19c", "end_date": str(_d(30)), "days_to_expiry": 30, "is_gxp": True},
                 is_gxp=True),
            dict(alert_type="RENEWAL", ent_id=_sw("SW-011").ent_id if _sw("SW-011") else None,
                 severity="HIGH", days_to_expiry=30,
                 title="Renewal due in 30 days: AVEVA PI System Support",
                 body_json={"sw_name": "AVEVA PI System", "end_date": str(_d(30)), "days_to_expiry": 30, "is_gxp": True},
                 is_gxp=True),
            dict(alert_type="RENEWAL", ent_id=_sw("SW-017").ent_id if _sw("SW-017") else None,
                 severity="HIGH", days_to_expiry=30,
                 title="Renewal due in 30 days: Oracle EBS — OVER-DEPLOYED",
                 body_json={"sw_name": "Oracle E-Business Suite", "end_date": str(_d(30)), "days_to_expiry": 30, "is_gxp": True},
                 is_gxp=True),
            # RENEWAL MEDIUM (T≤60)
            dict(alert_type="RENEWAL", ent_id=_sw("SW-008").ent_id if _sw("SW-008") else None,
                 severity="MEDIUM", days_to_expiry=60,
                 title="Renewal due in 60 days: ServiceNow ITSM",
                 body_json={"sw_name": "ServiceNow ITSM", "end_date": str(_d(60)), "days_to_expiry": 60, "is_gxp": False},
                 is_gxp=False),
            dict(alert_type="RENEWAL", ent_id=_sw("SW-022").ent_id if _sw("SW-022") else None,
                 severity="MEDIUM", days_to_expiry=46,
                 title="Renewal due in 46 days: Documentum D2 (GxP)",
                 body_json={"sw_name": "OpenText Documentum D2", "end_date": str(_d(46)), "days_to_expiry": 46, "is_gxp": True},
                 is_gxp=True),
            # RENEWAL INFO (T≤90) — GxP critical
            dict(alert_type="RENEWAL", ent_id=_sw("SW-005").ent_id if _sw("SW-005") else None,
                 severity="HIGH", days_to_expiry=90,
                 title="GxP Renewal in 90 days: Veeva Vault QMS — 90-day re-validation lead time",
                 body_json={"sw_name": "Veeva Vault QMS", "end_date": str(_d(90)), "days_to_expiry": 90, "is_gxp": True},
                 is_gxp=True),
            # UTILISATION HIGH (over-deployed)
            dict(alert_type="UTILISATION", ent_id=_sw("SW-002").ent_id if _sw("SW-002") else None,
                 severity="HIGH", days_to_expiry=None,
                 title="Over-deployed: SAP S/4HANA at 103% — 10 excess users",
                 body_json={"sw_name": "SAP S/4HANA", "util_pct": 103.3, "entitled": 300, "in_use": 310, "is_gxp": False},
                 is_gxp=False),
            dict(alert_type="UTILISATION", ent_id=_sw("SW-003").ent_id if _sw("SW-003") else None,
                 severity="HIGH", days_to_expiry=None,
                 title="Over-deployed: Oracle DB 19c at 100% — audit risk",
                 body_json={"sw_name": "Oracle Database 19c", "util_pct": 100.0, "entitled": 8, "in_use": 8, "is_gxp": True},
                 is_gxp=True),
            dict(alert_type="UTILISATION", ent_id=_sw("SW-017").ent_id if _sw("SW-017") else None,
                 severity="HIGH", days_to_expiry=None,
                 title="Over-deployed: Oracle EBS at 125% — 50 excess users",
                 body_json={"sw_name": "Oracle E-Business Suite", "util_pct": 125.0, "entitled": 200, "in_use": 250, "is_gxp": True},
                 is_gxp=True),
            # UTILISATION MEDIUM (watch)
            dict(alert_type="UTILISATION", ent_id=_sw("SW-001").ent_id if _sw("SW-001") else None,
                 severity="MEDIUM", days_to_expiry=None,
                 title="Watch threshold: Microsoft 365 at 93.6% — 160 idle seats",
                 body_json={"sw_name": "Microsoft 365", "util_pct": 93.6, "entitled": 2500, "in_use": 2340, "is_gxp": False},
                 is_gxp=False),
            dict(alert_type="UTILISATION", ent_id=_sw("SW-005").ent_id if _sw("SW-005") else None,
                 severity="MEDIUM", days_to_expiry=None,
                 title="Watch threshold: Veeva Vault QMS at 93% (GxP)",
                 body_json={"sw_name": "Veeva Vault QMS", "util_pct": 93.0, "entitled": 500, "in_use": 465, "is_gxp": True},
                 is_gxp=True),
        ]

        for a in ALERT_DATA:
            s.add(Alert(**a, created_at=datetime.utcnow()))
        await s.flush()
        print(f"  [mock] Added {len(ALERT_DATA)} alerts "
              f"({sum(1 for a in ALERT_DATA if a['alert_type']=='RENEWAL')} renewal, "
              f"{sum(1 for a in ALERT_DATA if a['alert_type']=='UTILISATION')} utilisation)")

        # ── ⑦ Reconciliation run ──────────────────────────────────────────
        recon_run = ReconciliationRun(
            run_date=datetime.utcnow(),
            triggered_by=adm.id if adm else None,
            entitlements_processed=len(ENT_SPECS),
        )
        s.add(recon_run)
        await s.flush()

        for idx, (sw_id, cname, lic, metric_name, entitled, in_use, unit_cost, annual_cost, status, owner) in enumerate(ENT_SPECS, start=1):
            ent_id = f"ENT-{idx:03d}"
            util_pct = round(in_use / entitled * 100, 1) if entitled > 0 else None
            recon_status = status if status != "EXPIRED" else "OK"
            recs = {
                "OVER_DEPLOYED": "Reduce entitled count to match current in-use at next renewal. Raise PO amendment request.",
                "WATCH": "Monitor closely. Consider licence harvesting if usage stays below 95% for 2 months.",
                "UNDER_UTILISED": f"Right-size at renewal: reduce {entitled - in_use} idle seats. Est. saving: ₹{((entitled - in_use) * (unit_cost or 0)):,}/yr.",
                "OK": "Utilisation within normal bounds. No action required.",
                "EXPIRED": "Contract expired. Renew or decommission immediately.",
            }
            s.add(ReconciliationResult(
                run_id=recon_run.id,
                ent_id=ent_id,
                entitled=entitled,
                in_use=in_use,
                util_pct=util_pct,
                status=recon_status if recon_status in ("OVER_DEPLOYED","WATCH","OK","UNDER_UTILISED") else "OK",
                ai_recommendation=recs.get(status, "Review entitlement."),
                generated_at=datetime.utcnow(),
            ))

        await s.commit()
        print(f"  [mock] Added reconciliation run with {len(ENT_SPECS)} results")
        print("[mock] ✅ Mock dataset complete!")
        print(f"       SW={12+len(NEW_SW)}, ENT={len(ENT_SPECS)}, "
              f"CONTRACTS={len(CONTRACT_SPECS)}, DISC={len(DISC)}, ALERTS={len(ALERT_DATA)}")


if __name__ == "__main__":
    asyncio.run(seed_mock())
