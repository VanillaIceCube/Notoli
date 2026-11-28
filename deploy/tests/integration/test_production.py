"""Behavioral release checks: real Compose and environment parsing."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from deploy.production import build_bundle as builder
from deploy.production import release


def environment():
    values = dict(
        GITHUB_SHA="a" * 40,
        GITHUB_RUN_ID="123",
        GITHUB_RUN_ATTEMPT="1",
        GITHUB_REPOSITORY_OWNER="VanillaIceCube",
        BACKEND_IMAGE="ghcr.io/vanillaicecube/"
        + release.APP
        + "-backend@sha256:"
        + "b" * 64,
        FRONTEND_IMAGE="ghcr.io/vanillaicecube/"
        + release.APP
        + "-frontend@sha256:"
        + "c" * 64,
        DJANGO_SECRET_KEY='literal-$dollar#hash"quote',
        DJANGO_EMAIL_HOST_KEY="key-$#literal",
        DJANGO_EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
        DJANGO_DEFAULT_FROM_EMAIL="test@example.invalid",
        MACROMAPPER_OPENAI_API_KEY="fake-ai",
    )
    # App-owned app.json may add required private backend settings. Only this
    # disposable fixture supplies synthetic values; production still requires
    # the operator's explicit inputs and preserves its missing-setting checks.
    for key in builder.REQUIRED:
        values.setdefault(key, "synthetic-release-fixture-" + key.lower())
    return values


class BundleTests(unittest.TestCase):
    def test_supported_email_backend_names_are_preserved_in_new_bundles(self):
        for supplied in (
            "anymail.backends.resend.EmailBackend",
            "django.core.mail.backends.smtp.EmailBackend",
        ):
            with (
                self.subTest(backend=supplied),
                tempfile.TemporaryDirectory() as directory,
            ):
                values = environment() | {"DJANGO_EMAIL_BACKEND": supplied}
                target = Path(directory) / "incoming"
                identity = builder.build(target, values)
                emitted = (target / identity / ".backend.env").read_text()
                self.assertIn("DJANGO_EMAIL_BACKEND=" + supplied + "\n", emitted)
                self.assertEqual(values["DJANGO_EMAIL_BACKEND"], supplied)

    def test_retired_and_unknown_email_backends_fail_before_creating_a_bundle(self):
        for supplied in (
            "authentication.email_backends.ResendApiEmailBackend",
            "apps.authentication.email_backends.ResendApiEmailBackend",
            "apps.email.backends.ResendApiEmailBackend",
            "custom.authentication.email_backends.UnreviewedBackend",
        ):
            with (
                self.subTest(backend=supplied),
                tempfile.TemporaryDirectory() as directory,
            ):
                target = Path(directory) / "incoming"
                with self.assertRaisesRegex(ValueError, "production email backend"):
                    builder.build(
                        target, environment() | {"DJANGO_EMAIL_BACKEND": supplied}
                    )
                self.assertFalse(target.exists())

    def test_extra_app_required_secret_is_synthetic_and_still_required(self):
        key = "APP_SPECIFIC_REQUIRED_SECRET"
        with patch.object(builder, "REQUIRED", [*builder.REQUIRED, key]):
            values = environment()
            self.assertEqual(values["DJANGO_SECRET_KEY"], 'literal-$dollar#hash"quote')
            self.assertEqual(values["DJANGO_EMAIL_HOST_KEY"], "key-$#literal")
            self.assertTrue(values[key].startswith("synthetic-release-fixture-"))
            with tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / "incoming"
                identity = builder.build(target, values)
                self.assertIn(
                    key + "=" + values[key] + "\n",
                    (target / identity / ".backend.env").read_text(),
                )
            for update in (None, "", "line\nbreak"):
                with (
                    self.subTest(value=update),
                    tempfile.TemporaryDirectory() as directory,
                ):
                    supplied = values.copy()
                    if update is None:
                        supplied.pop(key)
                    else:
                        supplied[key] = update
                    with self.assertRaises(ValueError):
                        builder.build(Path(directory) / "incoming", supplied)

    def test_raw_secrets_immutable_images_app_only_compose_and_bind(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            identity = builder.build(path / "incoming", environment())
            bundle = path / "incoming" / identity
            (bundle / ".release.env").write_text(
                "BACKEND_IMAGE="
                + environment()["BACKEND_IMAGE"]
                + "\nFRONTEND_IMAGE="
                + environment()["FRONTEND_IMAGE"]
                + "\nAPP_DB_PATH="
                + str(path / "db.sqlite3").replace("\\", "/")
                + "\n"
            )
            result = subprocess.run(
                [
                    "docker",
                    "compose",
                    "-p",
                    release.APP,
                    "--env-file",
                    str(bundle / ".release.env"),
                    "-f",
                    str(bundle / "compose.yml"),
                    "config",
                    "--format",
                    "json",
                ],
                capture_output=True,
                text=True,
                check=True,
            )
            with patch.object(release, "compose", return_value=result.stdout):
                release.validate_candidate_ports(bundle)
            model = json.loads(result.stdout)
            self.assertEqual(set(model["services"]), set(release.SERVICES))
            backend = model["services"][release.BACKEND]
            # Compose escapes dollars in its reusable config output.
            self.assertEqual(
                backend["environment"]["DJANGO_SECRET_KEY"].replace("$$", "$"),
                environment()["DJANGO_SECRET_KEY"],
            )
            self.assertEqual(
                backend["environment"]["DJANGO_EMAIL_HOST_KEY"].replace("$$", "$"),
                environment()["DJANGO_EMAIL_HOST_KEY"],
            )
            self.assertNotIn("ports", backend)
            self.assertFalse(
                backend["volumes"][0].get("bind", {}).get("create_host_path", False)
            )
            self.assertTrue(all(n["external"] for n in model["networks"].values()))
            if release.APP == "notoli":
                self.assertEqual(
                    backend["networks"]["backend_private"]["ipv4_address"],
                    "172.30.88.3",
                )
                self.assertEqual(
                    backend["environment"]["DJANGO_TRUSTED_PROXY_IPS"], "172.30.88.2"
                )
                self.assertNotIn(
                    "backend_private", model["services"][release.FRONTEND]["networks"]
                )
            # Exercise raw env parsing in a real disposable container, with all
            # production network/storage/port bindings removed from the fixture.
            model = json.loads(
                subprocess.run(
                    [
                        "docker",
                        "compose",
                        "--env-file",
                        str(bundle / ".release.env"),
                        "-f",
                        str(bundle / "compose.yml"),
                        "config",
                        "--format",
                        "json",
                        "--no-env-resolution",
                    ],
                    capture_output=True,
                    text=True,
                    check=True,
                ).stdout
            )
            service = model["services"][release.BACKEND]
            service.update(
                image="python:3.12-alpine", network_mode="none", volumes=[], ports=[]
            )
            service.pop("networks", None)
            service.pop("container_name", None)
            model["services"] = {release.BACKEND: service}
            model["networks"] = {}
            fixture = path / "fixture.json"
            fixture.write_text(json.dumps(model))
            value = subprocess.run(
                [
                    "docker",
                    "compose",
                    "-p",
                    release.APP + "-raw-test",
                    "-f",
                    str(fixture),
                    "run",
                    "--rm",
                    "--no-deps",
                    "-T",
                    "--entrypoint",
                    "python",
                    release.BACKEND,
                    "-c",
                    "import os,json; print(json.dumps(os.environ['DJANGO_SECRET_KEY']))",
                ],
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertEqual(
                json.loads(value.stdout), environment()["DJANGO_SECRET_KEY"]
            )

    def test_missing_secret_mutable_image_and_attempt_reuse_fail(self):
        for update in (
            {"DJANGO_SECRET_KEY": ""},
            {"BACKEND_IMAGE": "app:latest"},
            {"DJANGO_DEBUG": "1"},
            {"DJANGO_SECRET_KEY": "line\nbreak"},
        ):
            with tempfile.TemporaryDirectory() as directory:
                with self.assertRaises(ValueError):
                    builder.build(Path(directory) / "incoming", environment() | update)
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "incoming"
            builder.build(target, environment())
            with self.assertRaises(FileExistsError):
                builder.build(target, environment())


@unittest.skipUnless(
    os.name == "posix", "Real POSIX permissions/locks and transactions run on Linux"
)
class LaunchTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        incoming = self.root / "incoming"
        self.bundle = incoming / builder.build(incoming, environment())
        (self.root / release.DB_FILE).write_bytes(b"existing database")

    def test_tampered_bundle_is_rejected_before_host_changes(self):
        (self.bundle / ".backend.env").write_text("tampered")
        with self.assertRaisesRegex(release.ReleaseError, "checksum"):
            release.validate_bundle(self.bundle)
        (self.bundle / ".backend.env").unlink()
        (self.bundle / ".backend.env").symlink_to(self.root / release.DB_FILE)
        with self.assertRaises(release.ReleaseError):
            release.validate_bundle(self.bundle)

    def test_launch_checks_the_host_before_and_after_starting_the_services(self):
        with (
            patch.object(release, "check_host") as host,
            patch.object(release, "validate_candidate_ports"),
            patch.object(release, "compose") as compose,
            patch.object(release, "migrate") as migrate,
            patch.object(release, "readiness") as ready,
        ):
            release.deploy(self.root, self.bundle)
        self.assertEqual(
            [call.kwargs for call in host.call_args_list], [{"require_app": False}, {}]
        )
        self.assertEqual(
            [call.args[1] for call in compose.call_args_list], ["pull", "up"]
        )
        migrate.assert_called_once_with(
            self.bundle, environment()["BACKEND_IMAGE"], self.root / release.DB_FILE
        )
        ready.assert_called_once_with(self.bundle)
        self.assertEqual(
            {path.name for path in self.root.iterdir()}, {"incoming", release.DB_FILE}
        )

    def test_migration_failure_exits_before_starting_services(self):
        with (
            patch.object(release, "check_host"),
            patch.object(release, "validate_candidate_ports"),
            patch.object(release, "compose") as compose,
            patch.object(
                release, "migrate", side_effect=release.ReleaseError("migration failed")
            ),
            self.assertRaisesRegex(release.ReleaseError, "migration failed"),
        ):
            release.deploy(self.root, self.bundle)
        self.assertEqual([call.args[1] for call in compose.call_args_list], ["pull"])
        self.assertEqual(
            (self.root / release.DB_FILE).read_bytes(), b"existing database"
        )

    def test_failed_direct_backend_check_stops_both_services(self):
        def fail_backend_exec(directory, operation, *args, **kwargs):
            if operation == "exec":
                raise release.ReleaseError("offline")

        with (
            patch.object(release, "check_host"),
            patch.object(release, "validate_candidate_ports"),
            patch.object(release, "compose", side_effect=fail_backend_exec) as compose,
            patch.object(release, "migrate"),
            patch.object(release.time, "monotonic", side_effect=[0, 91]),
            self.assertRaisesRegex(release.ReleaseError, "direct backend API"),
        ):
            release.deploy(self.root, self.bundle)
        self.assertEqual(
            [call.args[1] for call in compose.call_args_list],
            ["pull", "up", "exec", "stop"],
        )
        self.assertEqual(
            compose.call_args.args, (self.bundle, "stop", *release.SERVICES)
        )

    def test_stable_locks_exclude_maintenance_and_other_app_attempts(self):
        import fcntl

        directory = self.root / "locks"
        directory.mkdir(mode=0o700)
        for name in ("maintenance.lock", release.APP + ".lock"):
            release.write_private(directory / name, "")
        with release.locks(directory):
            with self.assertRaises(release.ReleaseError):
                with release.locks(directory):
                    self.fail("second app release acquired lock")
        with (directory / "maintenance.lock").open("r+") as hold:
            fcntl.flock(hold, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(release.ReleaseError):
                with release.locks(directory):
                    self.fail("release entered maintenance hold")
        descriptor_count = len(list(Path("/proc/self/fd").iterdir()))
        for _ in range(5):
            with self.assertRaises(release.ReleaseError):
                with release.locks(directory):
                    raise release.ReleaseError("operation failed while locked")
        self.assertEqual(len(list(Path("/proc/self/fd").iterdir())), descriptor_count)
        (directory / (release.APP + ".lock")).unlink()
        (directory / (release.APP + ".lock")).symlink_to(directory / "maintenance.lock")
        with self.assertRaises(release.ReleaseError):
            with release.locks(directory):
                self.fail("accepted symlink lock")
