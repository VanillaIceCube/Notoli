"""App-owned central MCP release policy, separate from the shared release engine."""

import tempfile
import unittest
from pathlib import Path

from test_production import builder, environment


class CentralMCPPolicyTests(unittest.TestCase):
    def test_missing_introspection_secret_fails_before_bundle_creation(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "incoming"
            values = environment()
            values.pop("MCP_INTROSPECTION_CLIENT_SECRET", None)
            with self.assertRaisesRegex(ValueError, "MCP_INTROSPECTION_CLIENT_SECRET"):
                builder.build(target, values)
            self.assertFalse(target.exists())

    def test_dedicated_secret_preserves_literal_bytes_and_fixed_central_mode(self):
        secret = 'synthetic-$literal#quote"value'
        values = environment() | {"MCP_INTROSPECTION_CLIENT_SECRET": secret}
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "incoming"
            identity = builder.build(target, values)
            lines = (target / identity / ".backend.env").read_text().splitlines()
            self.assertIn("MCP_INTROSPECTION_CLIENT_SECRET=" + secret, lines)
            self.assertIn("DJANGO_MCP_AUTH_MODE=central", lines)
            self.assertIn(
                "DJANGO_MCP_BASE_URL=https://notoli.judeandrewalaba.com", lines
            )
        with (
            tempfile.TemporaryDirectory() as directory,
            self.assertRaisesRegex(ValueError, "DJANGO_MCP_AUTH_MODE"),
        ):
            builder.build(
                Path(directory) / "incoming",
                values | {"DJANGO_MCP_AUTH_MODE": "legacy"},
            )
