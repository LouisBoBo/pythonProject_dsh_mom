import unittest
import sys
from pathlib import Path
out = Path(__file__).resolve().parents[1] / "tmp" / "_purge_test.out"
sys.path.insert(0, str(Path(__file__).resolve().parent))
loader = unittest.TestLoader()
suite = loader.loadTestsFromNames([
    "test_purge_broken_profile_bundles",
    "test_ensure_dsh_knowledge",
])
with out.open("w", encoding="utf-8") as f:
    runner = unittest.TextTestRunner(stream=f, verbosity=2)
    result = runner.run(suite)
    f.write(f"\nOK={result.wasSuccessful()} tests={result.testsRun} fail={len(result.failures)} err={len(result.errors)}\n")
sys.exit(0 if result.wasSuccessful() else 1)
