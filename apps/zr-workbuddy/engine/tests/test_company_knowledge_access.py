"""共享知识库召回权限单测。"""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from app.auth import company_knowledge_access as cka
from app import company_knowledge as ck


class CompanyKnowledgeAccessNormalizeTests(unittest.TestCase):
    def test_default_allow_all(self):
        out = cka.normalize_company_knowledge_access(None)
        self.assertTrue(out["allow_all"])
        self.assertEqual(out["entry_ids"], [])

    def test_allowlist(self):
        out = cka.normalize_company_knowledge_access(
            {"allow_all": False, "entry_ids": ["a", "a", " b ", ""]}
        )
        self.assertFalse(out["allow_all"])
        self.assertEqual(out["entry_ids"], ["a", "b"])

    def test_string_false_not_default_allow_all(self):
        """手改/脏数据里 allow_all=\"false\" 不得抬成全开。"""
        out = cka.normalize_company_knowledge_access(
            {"allow_all": "false", "entry_ids": ["only"]}
        )
        self.assertFalse(out["allow_all"])
        self.assertEqual(out["entry_ids"], ["only"])

    def test_entry_ids_only_means_allowlist(self):
        """只写 entry_ids、未写 allow_all → 白名单（含空列表=全拒）。"""
        out = cka.normalize_company_knowledge_access({"entry_ids": ["x"]})
        self.assertFalse(out["allow_all"])
        self.assertEqual(out["entry_ids"], ["x"])
        empty = cka.normalize_company_knowledge_access({"entry_ids": []})
        self.assertFalse(empty["allow_all"])
        self.assertEqual(empty["entry_ids"], [])


class CompanyKnowledgeAccessFilterTests(unittest.TestCase):
    def test_no_user_sees_nothing(self):
        hits = [{"id": "1", "title": "A"}, {"id": "2", "title": "B"}]
        self.assertEqual(cka.filter_hits_for_user(hits, None), [])
        self.assertFalse(cka.can_recall_entry(None, "1"))
        self.assertEqual(
            cka.effective_company_knowledge_access(None),
            {"allow_all": False, "entry_ids": []},
        )

    def test_admin_sees_all(self):
        hits = [{"id": "1", "title": "A"}, {"id": "2", "title": "B"}]
        out = cka.filter_hits_for_user(hits, {"role": "admin"})
        self.assertEqual(len(out), 2)

    def test_member_allow_all(self):
        hits = [{"id": "1"}, {"id": "2"}]
        out = cka.filter_hits_for_user(
            hits, {"role": "user", "company_knowledge_access": {"allow_all": True}}
        )
        self.assertEqual(len(out), 2)

    def test_member_allowlist_filters(self):
        hits = [{"id": "1", "title": "A"}, {"id": "2", "title": "B"}]
        out = cka.filter_hits_for_user(
            hits,
            {
                "role": "user",
                "company_knowledge_access": {"allow_all": False, "entry_ids": ["2"]},
            },
        )
        self.assertEqual([h["id"] for h in out], ["2"])

    def test_member_empty_allowlist_blocks_all(self):
        hits = [{"id": "1"}, {"id": "2"}]
        out = cka.filter_hits_for_user(
            hits,
            {
                "role": "user",
                "company_knowledge_access": {"allow_all": False, "entry_ids": []},
            },
        )
        self.assertEqual(out, [])


class CompanyKnowledgeAccessSaveShapeTests(unittest.TestCase):
    def test_access_from_entry_ids(self):
        self.assertTrue(cka.access_from_entry_ids([], allow_all=True)["allow_all"])
        self.assertFalse(cka.access_from_entry_ids([], allow_all=False)["allow_all"])
        self.assertEqual(
            cka.access_from_entry_ids(["x"], allow_all=False)["entry_ids"], ["x"]
        )
        # 只传空列表不得误开成全员可读
        empty_list = cka.access_from_entry_ids([], allow_all=None)
        self.assertFalse(empty_list["allow_all"])
        self.assertEqual(empty_list["entry_ids"], [])
        # 两者都不传 → 默认全开
        self.assertTrue(cka.access_from_entry_ids(None, allow_all=None)["allow_all"])


class CompanyKnowledgeCiteAuthTests(unittest.IsolatedAsyncioTestCase):
    async def test_cite_without_user_does_not_return_hits(self):
        """未登录不得绕过 ACL 读全库。"""
        with patch.object(ck, "search", new=AsyncMock(return_value={
            "ok": True,
            "query": "x",
            "hits": [{"id": "1", "title": "secret", "snippet": "body"}],
        })):
            out = await ck.cite("x", user_row=None)
            self.assertFalse(out.get("ok"))
            self.assertEqual(out.get("code"), "auth_required")
            self.assertEqual(out.get("count"), 0)
            self.assertEqual(out.get("hits"), [])


if __name__ == "__main__":
    unittest.main()
