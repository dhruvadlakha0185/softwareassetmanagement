"""
Idempotent seed — creates users, master data, DOA hierarchy.
Called automatically on startup when STORAGE_BACKEND=supabase|local.
Run manually: python -m scripts.seed
"""
import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.users import User, DOAHierarchy
from app.models.masters import (
    Category, SubCategory, Vendor, LicenseMetric,
    DiscoverySource, UsageUpdateMethod, Region,
)
import app.models  # noqa — registers all models

# ── Users ──────────────────────────────────────────────────────────────────────
SEED_USERS = [
    {"email": "admin@drl.local",     "full_name": "COE Admin",     "password": "Admin123!", "role": "COE_ADMIN",  "bu": "IT COE"},
    {"email": "appowner@drl.local",  "full_name": "App Owner",      "password": "Owner123!", "role": "APP_OWNER",  "bu": "IT Ops"},
    {"email": "cio@drl.local",       "full_name": "CIO Read Only",  "password": "Read123!",  "role": "READ_ONLY",  "bu": "IT COE"},
    {"email": "s.narayanan@drl.com", "full_name": "S. Narayanan",   "password": "Admin123!", "role": "COE_ADMIN",  "bu": "IT COE"},
    {"email": "p.verma@drl.com",     "full_name": "P. Verma",       "password": "Admin123!", "role": "COE_ADMIN",  "bu": "IT COE"},
    {"email": "j.williams@drl.com",  "full_name": "J. Williams",    "password": "Owner123!", "role": "APP_OWNER",  "bu": "IT Ops"},
    {"email": "r.chen@drl.com",      "full_name": "R. Chen",        "password": "Owner123!", "role": "APP_OWNER",  "bu": "QC Labs"},
    {"email": "k.patel@drl.com",     "full_name": "K. Patel",       "password": "Owner123!", "role": "APP_OWNER",  "bu": "ERP"},
    {"email": "m.garcia@drl.com",    "full_name": "M. Garcia",      "password": "Owner123!", "role": "APP_OWNER",  "bu": "Manufacturing"},
]

# ── Categories ─────────────────────────────────────────────────────────────────
SEED_CATEGORIES = [
    {"name": "Enterprise Productivity", "gxp_applicable": "no",
     "subs": ["Office Suite", "PDF Management", "Diagramming", "Automation", "Low-Code"]},
    {"name": "R&D & Lab Informatics",   "gxp_applicable": "yes",
     "subs": ["LIMS", "ELN", "CDS", "Scientific Data", "Image Analysis"]},
    {"name": "Quality & Compliance",    "gxp_applicable": "yes",
     "subs": ["QMS", "Validation", "Training Mgmt", "GRC"]},
    {"name": "Manufacturing Execution", "gxp_applicable": "yes",
     "subs": ["MES", "DCS/SCADA", "Process Historian", "CMMS", "Engineering"]},
    {"name": "IT Infrastructure",       "gxp_applicable": "mixed",
     "subs": ["Server OS", "Database", "ITSM", "Virtualization", "Backup", "Cloud"]},
    {"name": "ERP & Supply Chain",      "gxp_applicable": "mixed",
     "subs": ["ERP", "SCM Planning", "WMS", "Serialization"]},
    {"name": "IT Security",             "gxp_applicable": "mixed",
     "subs": ["EDR/XDR", "SIEM", "Firewall", "PAM", "Vulnerability Mgmt"]},
]

# ── Vendors ────────────────────────────────────────────────────────────────────
SEED_VENDORS = [
    {"name": "Oracle",          "audit_risk": "HIGH",   "last_audit_date": "2022", "notes": "LMS audit risk — track NUP meticulously"},
    {"name": "SAP",             "audit_risk": "HIGH",   "last_audit_date": "2023", "notes": "User type classification matters for audit"},
    {"name": "IBM",             "audit_risk": "HIGH",   "last_audit_date": None,   "notes": "Sub-capacity licensing — requires IBM tools"},
    {"name": "Broadcom/VMware", "audit_risk": "HIGH",   "last_audit_date": "2024", "notes": "New licensing model post-acquisition — urgent review"},
    {"name": "Microsoft",       "audit_risk": "MEDIUM", "last_audit_date": "2024", "notes": "EA agreement — annual true-up"},
    {"name": "Adobe",           "audit_risk": "LOW",    "last_audit_date": None,   "notes": "VIP licensing — seat-based"},
    {"name": "Veeva Systems",   "audit_risk": "LOW",    "last_audit_date": None,   "notes": "GxP SaaS — review before every renewal"},
    {"name": "CrowdStrike",     "audit_risk": "LOW",    "last_audit_date": None,   "notes": "EDR — endpoint-based"},
    {"name": "ServiceNow",      "audit_risk": "LOW",    "last_audit_date": None,   "notes": "ITSM subscription"},
    {"name": "LabWare",         "audit_risk": "LOW",    "last_audit_date": None,   "notes": "GxP LIMS — perpetual"},
    {"name": "Koerber Pharma",  "audit_risk": "LOW",    "last_audit_date": None,   "notes": "GxP MES — perpetual"},
    {"name": "AVEVA",           "audit_risk": "LOW",    "last_audit_date": None,   "notes": "Process historian"},
]

# ── License Metrics ────────────────────────────────────────────────────────────
SEED_METRICS = [
    {"name": "Per User",            "description": "Named user / seat",               "how_to_count": "Count active named users in the system"},
    {"name": "Concurrent User",     "description": "Simultaneous sessions pool",      "how_to_count": "Peak simultaneous usage — not total installs"},
    {"name": "Per Core (2-pack)",   "description": "SQL Server, some DBs",            "how_to_count": "Physical/virtual cores ÷ 2, minimum 4 packs/server"},
    {"name": "Per Core (16-pack)",  "description": "Windows Server Standard",         "how_to_count": "16-core minimum per server"},
    {"name": "Per Processor (NUP)", "description": "Oracle DB",                       "how_to_count": "All users with access rights — including inactive"},
    {"name": "Per Workstation",     "description": "CDS, scientific software",        "how_to_count": "Count validated/licensed workstations"},
    {"name": "Per Endpoint",        "description": "Security, MDM software",          "how_to_count": "All managed endpoints in scope"},
    {"name": "Per Site / Line",     "description": "MES, serialization",              "how_to_count": "Physical production site or manufacturing line count"},
    {"name": "Per Tag",             "description": "OSIsoft PI",                      "how_to_count": "Count of active PI data tags / streams"},
    {"name": "Per GB of Memory",    "description": "SAP HANA Database",               "how_to_count": "Total licensed memory in GB — measure actual allocation"},
    {"name": "Per Study",           "description": "Clinical EDC (Medidata)",         "how_to_count": "Count active clinical studies — inactive excluded"},
]

# ── Discovery Sources ──────────────────────────────────────────────────────────
SEED_SOURCES = [
    {"name": "SCCM (Microsoft MECM)", "type": "agent",  "coverage": "Domain-joined Windows",          "frequency": "Weekly",     "contact": "IT Ops — J. Williams",       "status": "active",   "notes": None},
    {"name": "ServiceNow CMDB",       "type": "cmdb",   "coverage": "All IT assets",                  "frequency": "Monthly",    "contact": "ITSM — A. Kumar",            "status": "stale",    "notes": None},
    {"name": "CrowdStrike Falcon",    "type": "edr",    "coverage": "All managed endpoints",          "frequency": "Real-time",  "contact": "Security Ops — L. Martinez", "status": "active",   "notes": None},
    {"name": "Cortex XDR",            "type": "edr",    "coverage": "Servers only",                   "frequency": "Real-time",  "contact": "Security Ops — L. Martinez", "status": "active",   "notes": None},
    {"name": "Manual / Procurement",  "type": "manual", "coverage": "License entitlements from POs",  "frequency": "As purchased","contact": "Procurement — S. Patel",     "status": "active",   "notes": None},
    {"name": "Cloud CASB",            "type": "casb",   "coverage": "SaaS apps via corporate network","frequency": "Monthly",    "contact": "Security Ops — L. Martinez", "status": "active",   "notes": None},
]

# ── Usage Update Methods ───────────────────────────────────────────────────────
SEED_METHODS = [
    {"name": "Monthly Template Upload (XLSX)", "description": "App Owner downloads, fills, re-uploads monthly",    "template_required": "tab_a_and_b"},
    {"name": "Quarterly Manual Update",        "description": "App Owner manually enters count quarterly via form", "template_required": "none"},
    {"name": "Auto via SCCM Feed",             "description": "SCCM weekly export auto-populates in-use count",    "template_required": "none"},
    {"name": "App Owner Manual Entry",         "description": "Ad hoc entry with mandatory reason-for-change",      "template_required": "none"},
    {"name": "Auto via CrowdStrike API",       "description": "CrowdStrike endpoint count pulled automatically",    "template_required": "none"},
]

# ── Regions ────────────────────────────────────────────────────────────────────
SEED_REGIONS = [
    {"name": "India",  "sites_json": "Mumbai R&D, Hyderabad Mfg, Hyderabad HQ",   "regulatory_zone": "CDSCO · Annex 11",       "data_residency": "India",               "aws_region": "ap-south-1"},
    {"name": "US",     "sites_json": "New York HQ, NJ QC Lab, NJ Mfg, US DC",     "regulatory_zone": "FDA · 21 CFR Part 11",    "data_residency": "US (AWS us-east-1)",  "aws_region": "us-east-1"},
    {"name": "EU",     "sites_json": "Frankfurt Mfg, Frankfurt DC",               "regulatory_zone": "EMA · Annex 11 · GDPR",   "data_residency": "EU (AWS eu-central-1)","aws_region": "eu-central-1"},
    {"name": "Global", "sites_json": "All sites",                                 "regulatory_zone": "Multiple",                "data_residency": "Per-region",          "aws_region": None},
]


async def _upsert(session, model, unique_field: str, items: list[dict]) -> dict:
    created = {}
    for data in items:
        key = data[unique_field]
        existing = (await session.execute(
            select(model).where(getattr(model, unique_field) == key)
        )).scalar_one_or_none()
        if existing:
            print(f"  skip   {model.__tablename__}:{key}")
            created[key] = existing
        else:
            obj = model(**{k: v for k, v in data.items() if k != "subs"})
            session.add(obj)
            await session.flush()
            print(f"  create {model.__tablename__}:{key}")
            created[key] = obj
    return created


async def seed():
    async with AsyncSessionLocal() as session:
        # Users
        user_map: dict[str, User] = {}
        for u in SEED_USERS:
            existing = (await session.execute(select(User).where(User.email == u["email"]))).scalar_one_or_none()
            if existing:
                print(f"  skip   user:{u['email']}")
                user_map[u["email"]] = existing
            else:
                obj = User(
                    email=u["email"], full_name=u["full_name"],
                    hashed_password=get_password_hash(u["password"]),
                    role=u["role"], bu=u["bu"], is_active=True,
                )
                session.add(obj)
                await session.flush()
                print(f"  create user:{u['email']} [{u['role']}]")
                user_map[u["email"]] = obj

        # Categories + sub-categories
        for cat_data in SEED_CATEGORIES:
            existing = (await session.execute(
                select(Category).where(Category.name == cat_data["name"])
            )).scalar_one_or_none()
            if existing:
                print(f"  skip   category:{cat_data['name']}")
            else:
                cat = Category(name=cat_data["name"], gxp_applicable=cat_data["gxp_applicable"])
                session.add(cat)
                await session.flush()
                for sub_name in cat_data.get("subs", []):
                    session.add(SubCategory(category_id=cat.id, name=sub_name))
                print(f"  create category:{cat_data['name']} + {len(cat_data.get('subs', []))} subs")

        # Other masters
        await _upsert(session, Vendor, "name", SEED_VENDORS)
        await _upsert(session, LicenseMetric, "name", SEED_METRICS)
        await _upsert(session, DiscoverySource, "name", SEED_SOURCES)
        await _upsert(session, UsageUpdateMethod, "name", SEED_METHODS)
        await _upsert(session, Region, "name", SEED_REGIONS)

        # DOA hierarchy
        for email, tier, role_label, scope in [
            ("s.narayanan@drl.com", "1", "CIO",      "All · T-30+"),
            ("p.verma@drl.com",     "1", "COE Head", "All · T-30+ · GxP"),
        ]:
            u = user_map.get(email)
            if u:
                exists = (await session.execute(
                    select(DOAHierarchy).where(DOAHierarchy.user_id == u.id)
                )).scalar_one_or_none()
                if not exists:
                    session.add(DOAHierarchy(
                        user_id=u.id, tier=tier, role_label=role_label, alert_scope=scope
                    ))
                    print(f"  create doa:{email}")
                else:
                    print(f"  skip   doa:{email}")

        await session.commit()
    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
