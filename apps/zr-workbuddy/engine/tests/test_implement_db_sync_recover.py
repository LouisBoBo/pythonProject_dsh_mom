"""写码 Job 因 erp.db EPERM 失败时的回收 / 门禁。"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class ImplementDbSyncRecoverTests(unittest.TestCase):
    def test_recover_existing_low_stock_when_only_db_failed(self) -> None:
        from app.dev_pipeline.implement import recover_job_after_db_sync_fail

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rel = "backend/app/routers/inventory_low_stock.py"
            (root / rel).parent.mkdir(parents=True, exist_ok=True)
            (root / rel).write_text("# low stock\n", encoding="utf-8")
            (root / "frontend/src/views/warehouse").mkdir(parents=True, exist_ok=True)
            (root / "frontend/src/views/warehouse/LowStockAlertsView.vue").write_text(
                "<template></template>\n", encoding="utf-8"
            )
            (root / "frontend/src/api").mkdir(parents=True, exist_ok=True)
            (root / "frontend/src/api/inventoryLowStock.js").write_text("export {}\n", encoding="utf-8")
            job = {
                "status": "failed",
                "detail": (
                    "Error: 同步写入失败：backend/erp.db（Error: EPERM: operation not permitted, "
                    "rename 'x\\erp.db.cc-sync-tmp' -> 'x\\erp.db'）"
                ),
                "changed_files": ["backend/erp.db"],
            }
            out = recover_job_after_db_sync_fail(
                job=job,
                workspace=str(root),
                requirement="仓储管理增加「低库存预警」页；调用 /api/inventory-low-stock",
            )
            self.assertIsNotNone(out)
            assert out is not None
            self.assertTrue(out.get("ok"), out)
            files = out.get("changed_files") or []
            self.assertTrue(any("inventory_low_stock" in f for f in files), files)
            self.assertFalse(any(f.endswith(".db") for f in files), files)

    def test_recover_code_files_listed_beside_db(self) -> None:
        from app.dev_pipeline.implement import recover_job_after_db_sync_fail

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rel = "backend/app/routers/inventory_low_stock.py"
            (root / rel).parent.mkdir(parents=True, exist_ok=True)
            (root / rel).write_text("x=1\n", encoding="utf-8")
            job = {
                "detail": "同步写入失败：backend/erp.db（EPERM）",
                "changed_files": ["backend/erp.db", rel],
            }
            out = recover_job_after_db_sync_fail(
                job=job, workspace=str(root), requirement="低库存预警"
            )
            self.assertTrue(out and out.get("ok"), out)
            self.assertEqual(out.get("changed_files"), [rel])

    def test_recover_copies_from_sandbox_when_workspace_stale(self) -> None:
        from app.dev_pipeline import implement as impl

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            jid = "cch-test-sandbox-recover"
            sandbox = root / "sandboxes" / jid
            workspace = root / "workspace"
            rel = "backend/app/main.py"
            (sandbox / rel).parent.mkdir(parents=True, exist_ok=True)
            (workspace / rel).parent.mkdir(parents=True, exist_ok=True)
            (sandbox / rel).write_text("# fixed from sandbox\n", encoding="utf-8")
            (workspace / rel).write_text("# old\n", encoding="utf-8")
            (sandbox / "backend" / "pcb_procurement.db").write_bytes(b"SQLite")
            job = {
                "id": jid,
                "sandbox_path": str(sandbox),
                "detail": (
                    "同步写入失败：backend/pcb_procurement.db（Error: EPERM: "
                    "operation not permitted, rename）"
                ),
                "changed_files": ["backend/pcb_procurement.db", rel],
            }
            # 沙箱根目录约定在 ~/.zhongruan/...；单测 monkeypatch
            old = impl._cursor_chat_sandboxes_root
            impl._cursor_chat_sandboxes_root = lambda: root / "sandboxes"  # type: ignore
            try:
                out = impl.recover_job_after_db_sync_fail(
                    job=job, workspace=str(workspace), requirement="采购合同 Not found"
                )
            finally:
                impl._cursor_chat_sandboxes_root = old  # type: ignore
            self.assertTrue(out and out.get("ok"), out)
            self.assertTrue(out.get("from_sandbox"), out)
            self.assertEqual(out.get("changed_files"), [rel])
            self.assertEqual(
                (workspace / rel).read_text(encoding="utf-8"),
                "# fixed from sandbox\n",
            )
            self.assertFalse((workspace / "backend" / "pcb_procurement.db").exists())

    def test_recover_deletes_files_missing_in_sandbox(self) -> None:
        from app.dev_pipeline import implement as impl

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            jid = "cch-test-sandbox-delete"
            sandbox = root / "sandboxes" / jid
            workspace = root / "workspace"
            keep = "backend/app/main.py"
            gone = "frontend/src/views/reports/EmployeeWorkHoursReportView.vue"
            still = "backend/app/schemas.py"
            (sandbox / keep).parent.mkdir(parents=True, exist_ok=True)
            (workspace / keep).parent.mkdir(parents=True, exist_ok=True)
            (sandbox / keep).write_text("# from sandbox\n", encoding="utf-8")
            (workspace / keep).write_text("# old\n", encoding="utf-8")
            (workspace / gone).parent.mkdir(parents=True, exist_ok=True)
            (workspace / gone).write_text("<template></template>\n", encoding="utf-8")
            # 沙箱侧保留父目录、不保留文件 = Agent 已删；父目录缺失则不得删工程
            (sandbox / gone).parent.mkdir(parents=True, exist_ok=True)
            (sandbox / still).parent.mkdir(parents=True, exist_ok=True)
            (workspace / still).parent.mkdir(parents=True, exist_ok=True)
            (sandbox / still).write_text("# stay\n", encoding="utf-8")
            (workspace / still).write_text("# stay-old\n", encoding="utf-8")
            (workspace / "backend" / "erp.db").write_bytes(b"SQLite")
            job = {
                "id": jid,
                "sandbox_path": str(sandbox),
                "detail": (
                    "Error: 同步写入失败：backend/erp.db（Error: EPERM: "
                    "operation not permitted, rename）"
                ),
                "changed_files": ["backend/erp.db", keep],
                "deleted_files": [gone, still, "backend/erp.db"],
            }
            old = impl._cursor_chat_sandboxes_root
            impl._cursor_chat_sandboxes_root = lambda: root / "sandboxes"  # type: ignore
            try:
                out = impl.recover_job_after_db_sync_fail(
                    job=job, workspace=str(workspace), requirement="删除员工工时报表"
                )
            finally:
                impl._cursor_chat_sandboxes_root = old  # type: ignore
            self.assertTrue(out and out.get("ok"), out)
            self.assertEqual(out.get("changed_files"), [keep])
            self.assertEqual(out.get("deleted_files"), [gone])
            self.assertFalse((workspace / gone).exists())
            self.assertTrue((workspace / still).is_file())
            self.assertTrue((workspace / "backend" / "erp.db").is_file())
            self.assertEqual(
                (workspace / keep).read_text(encoding="utf-8"),
                "# from sandbox\n",
            )

    def test_recover_skips_delete_when_sandbox_parent_missing(self) -> None:
        """残缺沙箱（无父目录）+ deleted_files 不得删工程文件。"""
        from app.dev_pipeline import implement as impl

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            jid = "cch-test-sparse-delete"
            sandbox = root / "sandboxes" / jid
            workspace = root / "workspace"
            gone = "frontend/src/views/reports/OnlyInWorkspace.vue"
            sandbox.mkdir(parents=True, exist_ok=True)
            (workspace / gone).parent.mkdir(parents=True, exist_ok=True)
            (workspace / gone).write_text("<template></template>\n", encoding="utf-8")
            job = {
                "id": jid,
                "sandbox_path": str(sandbox),
                "detail": "同步写入失败：backend/erp.db（Error: EPERM: operation not permitted）",
                "changed_files": [],
                "deleted_files": [gone],
            }
            old = impl._cursor_chat_sandboxes_root
            impl._cursor_chat_sandboxes_root = lambda: root / "sandboxes"  # type: ignore
            try:
                out = impl.recover_job_after_db_sync_fail(
                    job=job, workspace=str(workspace), requirement="删报表"
                )
            finally:
                impl._cursor_chat_sandboxes_root = old  # type: ignore
            self.assertTrue((workspace / gone).is_file())
            deleted = out.get("deleted_files") if out else None
            self.assertTrue(not deleted, out)

    def test_requirement_forbids_db(self) -> None:
        from app.dev_pipeline.implement import build_implement_requirement

        text = build_implement_requirement(
            message="仓储管理增加低库存预警页",
            epic={"artifacts": {"prd": {"goal": "低库存预警", "scope": {"max_files": 10}}}},
        )
        self.assertIn("*.db", text)
        self.assertIn("erp.db", text)


if __name__ == "__main__":
    unittest.main()
