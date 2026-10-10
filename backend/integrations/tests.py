import base64
import hashlib
import io
from datetime import timedelta
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx2
from asgiref.sync import async_to_sync, sync_to_async
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import Client, TestCase, TransactionTestCase
from django.utils import timezone
from oauth2_provider.models import AccessToken, Application, RefreshToken
from rest_framework_simplejwt.tokens import RefreshToken as JWTRefreshToken

from notes.models import Board, ListNote, Note
from notes.models import List as NoteList
from notifications.models import Notification

from .oauth import resolve_token
from .tools import execute

CALLBACK = "https://chatgpt.com/connector/oauth/test-callback"
VERIFIER = "notoli-test-code-verifier-with-at-least-forty-three-characters"
CHALLENGE = (
    base64.urlsafe_b64encode(hashlib.sha256(VERIFIER.encode()).digest())
    .decode()
    .rstrip("=")
)


def make_client():
    return Application.objects.create(
        name="Notoli for ChatGPT",
        client_id="notoli-chatgpt",
        client_type="public",
        authorization_grant_type="authorization-code",
        redirect_uris=CALLBACK,
    )


def make_token(
    user, app, value="test-access", scope="notoli:read notoli:write", resource=None
):
    return AccessToken.objects.create(
        user=user,
        application=app,
        token=value,
        scope=scope,
        expires=timezone.now() + timedelta(hours=1),
        resource=[resource or settings.MCP_RESOURCE_URL],
    )


class OAuthTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            "oauth-user", email="oauth@example.com", password="Strong-password-789!"
        )
        self.app = make_client()
        self.client.force_login(self.user)

    def authorize(self, **changes):
        params = {
            "client_id": self.app.client_id,
            "response_type": "code",
            "redirect_uri": CALLBACK,
            "scope": "notoli:read notoli:write",
            "state": "unguessable-client-state",
            "resource": settings.MCP_RESOURCE_URL,
            "code_challenge": CHALLENGE,
            "code_challenge_method": "S256",
        }
        params.update(changes)
        response = self.client.get("/auth/mcp/authorize/", params)
        if response.status_code != 200 or "form" not in response.context:
            return response
        data = {
            field.name: field.value() or ""
            for field in response.context["form"]
            if field.is_hidden
        }
        data["allow"] = "Authorize"
        return self.client.post("/auth/mcp/authorize/", data)

    def exchange(self, code, **changes):
        data = {
            "grant_type": "authorization_code",
            "client_id": self.app.client_id,
            "code": code,
            "redirect_uri": CALLBACK,
            "code_verifier": VERIFIER,
            "resource": settings.MCP_RESOURCE_URL,
        }
        data.update(changes)
        return self.client.post(
            "/auth/mcp/token/",
            urlencode(data),
            content_type="application/x-www-form-urlencoded",
        )

    def issue(self):
        response = self.authorize()
        self.assertEqual(response.status_code, 302, response.content)
        params = parse_qs(urlsplit(response.url).query)
        self.assertEqual(params["state"], ["unguessable-client-state"])
        self.assertEqual(params["iss"], [settings.MCP_BASE_URL])
        response = self.exchange(params["code"][0])
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def test_full_pkce_flow_refresh_and_revoke(self):
        issued = self.issue()
        token = resolve_token(issued["access_token"])
        self.assertEqual(token.user, self.user)
        self.assertEqual(token.token, "")  # Only checksums are stored.
        refresh = self.client.post(
            "/auth/mcp/token/",
            urlencode(
                {
                    "grant_type": "refresh_token",
                    "client_id": self.app.client_id,
                    "refresh_token": issued["refresh_token"],
                    "resource": settings.MCP_RESOURCE_URL,
                }
            ),
            content_type="application/x-www-form-urlencoded",
        )
        self.assertEqual(refresh.status_code, 200, refresh.content)
        self.assertNotEqual(issued["refresh_token"], refresh.json()["refresh_token"])
        response = self.client.get("/auth/mcp/connections/")
        self.assertContains(response, "Notoli for ChatGPT")
        self.client.post("/auth/mcp/connections/", {"application_id": self.app.pk})
        with self.assertRaises(PermissionDenied):
            resolve_token(refresh.json()["access_token"])
        self.assertFalse(
            RefreshToken.objects.filter(user=self.user, revoked__isnull=True).exists()
        )

    def test_pkce_resource_and_callback_checks(self):
        for changes in (
            {"resource": "https://wrong.example/mcp"},
            {"code_challenge_method": "plain"},
            {"state": ""},
        ):
            self.assertEqual(self.authorize(**changes).status_code, 400)
        response = self.authorize(redirect_uri="https://unregistered.example/callback")
        self.assertNotEqual(response.status_code, 302)
        response = self.authorize()
        code = parse_qs(urlsplit(response.url).query)["code"][0]
        self.assertEqual(
            self.exchange(code, code_verifier="incorrect-verifier").status_code, 400
        )
        self.assertEqual(
            self.exchange(code, resource="https://wrong.example/mcp").status_code, 400
        )
        good = self.exchange(code)
        self.assertEqual(good.status_code, 200, good.content)
        self.assertEqual(self.exchange(code).status_code, 400)

    def test_refresh_cannot_escalate_scope_and_reuse_revokes_family(self):
        issued = self.issue()

        def refresh(**changes):
            data = {
                "grant_type": "refresh_token",
                "client_id": self.app.client_id,
                "refresh_token": issued["refresh_token"],
                "resource": settings.MCP_RESOURCE_URL,
            }
            data.update(changes)
            return self.client.post(
                "/auth/mcp/token/",
                urlencode(data),
                content_type="application/x-www-form-urlencoded",
            )

        self.assertEqual(
            refresh(scope="notoli:read notoli:write unknown").status_code, 400
        )
        self.assertEqual(refresh(resource="https://wrong.example/mcp").status_code, 400)
        rotated = refresh()
        self.assertEqual(rotated.status_code, 200, rotated.content)
        self.assertEqual(refresh().status_code, 400)
        with self.assertRaises(PermissionDenied):
            resolve_token(rotated.json()["access_token"])

    def test_login_csrf_denial_and_metadata(self):
        client = Client(enforce_csrf_checks=True)
        page = client.get("/auth/mcp/login/")
        self.assertContains(page, "Email or username")
        self.assertEqual(
            client.post(
                "/auth/mcp/login/",
                {"username": self.user.email, "password": "Strong-password-789!"},
            ).status_code,
            403,
        )
        response = client.post(
            "/auth/mcp/login/",
            {
                "username": self.user.email,
                "password": "Strong-password-789!",
                "csrfmiddlewaretoken": client.cookies["csrftoken"].value,
            },
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            client.post(
                "/auth/mcp/connections/", {"application_id": self.app.pk}
            ).status_code,
            403,
        )
        self.assertEqual(client.post("/auth/mcp/logout/").status_code, 403)
        self.assertEqual(
            self.client.post(
                "/auth/mcp/connections/", {"application_id": "bad"}
            ).status_code,
            400,
        )
        metadata = self.client.get("/.well-known/oauth-authorization-server").json()
        self.assertEqual(metadata["code_challenge_methods_supported"], ["S256"])
        self.assertNotIn("registration_endpoint", metadata)
        self.assertEqual(
            self.client.get("/.well-known/oauth-protected-resource/mcp").json()[
                "resource"
            ],
            settings.MCP_RESOURCE_URL,
        )

    def test_revoke_endpoint_and_user_isolation(self):
        mine = make_token(self.user, self.app)
        other = get_user_model().objects.create_user(
            "other-connection", email="other@example.com"
        )
        theirs = make_token(other, self.app, "other-access")
        response = self.client.post(
            "/auth/mcp/revoke/",
            urlencode({"client_id": self.app.client_id, "token": "test-access"}),
            content_type="application/x-www-form-urlencoded",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(AccessToken.objects.filter(pk=mine.pk).exists())
        self.client.post("/auth/mcp/connections/", {"application_id": self.app.pk})
        self.assertTrue(AccessToken.objects.filter(pk=theirs.pk).exists())

    def test_registration_command_checks_exact_redirects(self):
        for uri in (
            "http://chatgpt.com/callback",
            "https://*.chatgpt.com/callback",
            "https://user:pass@chatgpt.com/callback",
        ):
            with self.assertRaises(CommandError):
                call_command(
                    "register_mcp_client",
                    redirect_uri=[uri],
                    client_id="bad",
                    stdout=io.StringIO(),
                )
        call_command(
            "register_mcp_client",
            redirect_uri=[CALLBACK],
            client_id="another-client",
            stdout=io.StringIO(),
        )
        with self.assertRaises(CommandError):
            call_command(
                "register_mcp_client",
                redirect_uri=[CALLBACK],
                client_id="another-client",
                stdout=io.StringIO(),
            )

    def test_consent_denial_and_unsupported_grants(self):
        response = self.client.get(
            "/auth/mcp/authorize/",
            {
                "client_id": self.app.client_id,
                "response_type": "code",
                "redirect_uri": CALLBACK,
                "scope": "notoli:read",
                "state": "deny-state",
                "resource": settings.MCP_RESOURCE_URL,
                "code_challenge": CHALLENGE,
                "code_challenge_method": "S256",
            },
        )
        data = {
            field.name: field.value() or ""
            for field in response.context["form"]
            if field.is_hidden
        }
        denied = self.client.post("/auth/mcp/authorize/", data)
        self.assertEqual(denied.status_code, 302)
        params = parse_qs(urlsplit(denied.url).query)
        self.assertEqual(params["error"], ["access_denied"])
        self.assertEqual(params["iss"], [settings.MCP_BASE_URL])
        self.assertFalse(AccessToken.objects.exists())
        csrf = Client(enforce_csrf_checks=True)
        csrf.force_login(self.user)
        self.assertEqual(csrf.post("/auth/mcp/authorize/", data).status_code, 403)
        for grant in ("password", "client_credentials"):
            response = self.client.post(
                "/auth/mcp/token/",
                urlencode({"grant_type": grant, "client_id": self.app.client_id}),
                content_type="application/x-www-form-urlencoded",
            )
            self.assertIn(response.status_code, (400, 401))


class ToolTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            "tool-user", email="tools@example.com"
        )
        self.other = get_user_model().objects.create_user(
            "other-user", email="other@example.com"
        )
        self.app = make_client()
        make_token(self.user, self.app)
        self.board = Board.objects.create(
            name="Shared", owner=self.other, created_by=self.other
        )
        self.board.collaborators.add(self.user)
        self.note_list = NoteList.objects.create(
            name="Groceries", board=self.board, created_by=self.user
        )

    def call(self, operation, **arguments):
        return execute("test-access", operation, **arguments)

    def test_discovery_create_complete_and_notifications(self):
        boards = self.call("list_boards", query="Shared", limit=1, offset=0)["results"]
        self.assertEqual([board["id"] for board in boards], [self.board.pk])
        self.assertNotIn("collaborators_details", boards[0])
        self.assertEqual(
            self.call("list_lists", board_id=self.board.pk, limit=50, offset=0)[
                "results"
            ][0]["id"],
            self.note_list.pk,
        )
        item = self.call(
            "add_item",
            list_id=self.note_list.pk,
            note="Buy milk",
            description="Two cartons",
        )
        self.assertEqual(Note.objects.get(pk=item["id"]).created_by, self.user)
        self.assertTrue(
            ListNote.objects.filter(list=self.note_list, note_id=item["id"]).exists()
        )
        updated = self.call(
            "update_item",
            list_id=self.note_list.pk,
            item_id=item["id"],
            note=None,
            description=None,
            status="Complete",
        )
        self.assertEqual(updated["status"], "Complete")
        self.assertEqual(
            self.call("get_items", list_id=self.note_list.pk, limit=50, offset=0)[
                "results"
            ][0]["id"],
            item["id"],
        )
        events = set(
            Notification.objects.filter(
                recipient=self.other, note_id=item["id"]
            ).values_list("event_type", flat=True)
        )
        self.assertEqual(
            events, {Notification.EVENT_NOTE_CREATED, Notification.EVENT_NOTE_COMPLETED}
        )

    def test_cross_user_removed_collaborator_and_scope_blocked(self):
        outsider_list = (
            NoteList.objects.filter(board__owner=self.other)
            .exclude(pk=self.note_list.pk)
            .first()
        )
        with self.assertRaises(PermissionDenied):
            self.call("get_items", list_id=outsider_list.pk, limit=50, offset=0)
        self.board.collaborators.remove(self.user)
        for operation in ("get_items", "add_item"):
            with self.assertRaises(PermissionDenied):
                self.call(
                    operation,
                    list_id=self.note_list.pk,
                    limit=50,
                    offset=0,
                    note="Forbidden",
                    description="",
                )
        self.board.collaborators.add(self.user)
        AccessToken.objects.filter(user=self.user).update(scope="notoli:read")
        with self.assertRaises(PermissionDenied):
            self.call(
                "add_item", list_id=self.note_list.pk, note="Forbidden", description=""
            )

    def test_validation_pagination_and_membership(self):
        for index in range(3):
            self.call(
                "add_item",
                list_id=self.note_list.pk,
                note=f"Item {index}",
                description="",
            )
        page = self.call("get_items", list_id=self.note_list.pk, limit=2, offset=0)
        self.assertEqual(page["next_offset"], 2)
        self.assertEqual(
            len(
                self.call("get_items", list_id=self.note_list.pk, limit=2, offset=2)[
                    "results"
                ]
            ),
            1,
        )
        before = Note.objects.count()
        with self.assertRaises(ValueError):
            self.call(
                "add_item", list_id=self.note_list.pk, note="x" * 256, description=""
            )
        self.assertEqual(Note.objects.count(), before)
        foreign = (
            Note.objects.filter(board__owner=self.other)
            .exclude(board=self.board)
            .first()
        )
        with self.assertRaises(PermissionDenied):
            self.call(
                "update_item",
                list_id=self.note_list.pk,
                item_id=foreign.pk,
                note=None,
                description=None,
                status="Complete",
            )


class MCPHTTPTests(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            "http-user", email="http@example.com"
        )
        self.app = make_client()
        self.token = make_token(self.user, self.app)

    def test_asgi_protocol_auth_schemas_and_tools(self):
        from app.asgi import application

        note_list = NoteList.objects.filter(board__owner=self.user).first()
        jwt = str(JWTRefreshToken.for_user(self.user).access_token)

        async def check():
            async with application.router.lifespan_context(application):
                async with httpx2.AsyncClient(
                    transport=httpx2.ASGITransport(app=application),
                    base_url=settings.MCP_BASE_URL,
                ) as client:
                    headers = {
                        "Accept": "application/json, text/event-stream",
                        "MCP-Protocol-Version": "2025-11-25",
                    }
                    payload = {
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "tools/list",
                        "params": {},
                    }
                    response = await client.post("/mcp", json=payload, headers=headers)
                    self.assertEqual(response.status_code, 401, response.text)
                    self.assertIn(
                        "oauth-protected-resource/mcp",
                        response.headers["www-authenticate"],
                    )
                    headers["Authorization"] = "Bearer test-access"
                    init = await client.post(
                        "/mcp",
                        headers=headers,
                        json={
                            "jsonrpc": "2.0",
                            "id": 0,
                            "method": "initialize",
                            "params": {
                                "protocolVersion": "2025-11-25",
                                "capabilities": {},
                                "clientInfo": {"name": "test", "version": "1"},
                            },
                        },
                    )
                    self.assertEqual(init.status_code, 200, init.text)
                    response = await client.post("/mcp", json=payload, headers=headers)
                    self.assertEqual(response.status_code, 200, response.text)
                    tools = {
                        tool["name"]: tool
                        for tool in response.json()["result"]["tools"]
                    }
                    self.assertEqual(
                        set(tools),
                        {
                            "list_boards",
                            "list_lists",
                            "get_items",
                            "add_item",
                            "update_item",
                        },
                    )
                    self.assertTrue(tools["get_items"]["annotations"]["readOnlyHint"])
                    self.assertFalse(tools["add_item"]["annotations"]["readOnlyHint"])
                    self.assertEqual(
                        tools["add_item"]["_meta"]["securitySchemes"],
                        [{"type": "oauth2", "scopes": ["notoli:read", "notoli:write"]}],
                    )
                    self.assertEqual(
                        tools["get_items"]["inputSchema"]["properties"]["limit"][
                            "maximum"
                        ],
                        100,
                    )
                    response = await client.post(
                        "/mcp",
                        headers=headers,
                        json={
                            "jsonrpc": "2.0",
                            "id": 2,
                            "method": "tools/call",
                            "params": {"name": "list_boards", "arguments": {}},
                        },
                    )
                    self.assertFalse(
                        response.json()["result"].get("isError", False), response.text
                    )
                    self.assertTrue(
                        response.json()["result"]["structuredContent"]["results"]
                    )

                    async def invoke(name, arguments):
                        result = await client.post(
                            "/mcp",
                            headers=headers,
                            json={
                                "jsonrpc": "2.0",
                                "id": 3,
                                "method": "tools/call",
                                "params": {"name": name, "arguments": arguments},
                            },
                        )
                        self.assertEqual(result.status_code, 200, result.text)
                        return result.json()["result"]

                    created = await invoke(
                        "add_item", {"list_id": note_list.pk, "note": "HTTP item"}
                    )
                    self.assertFalse(created.get("isError"), created)
                    item_id = created["structuredContent"]["id"]
                    updated = await invoke(
                        "update_item",
                        {
                            "list_id": note_list.pk,
                            "item_id": item_id,
                            "status": "Complete",
                        },
                    )
                    self.assertEqual(updated["structuredContent"]["status"], "Complete")
                    invalid = await invoke(
                        "get_items", {"list_id": note_list.pk, "limit": 101}
                    )
                    self.assertTrue(invalid["isError"])
                    await sync_to_async(
                        AccessToken.objects.filter(pk=self.token.pk).update
                    )(scope="notoli:read")
                    denied = await invoke(
                        "add_item", {"list_id": note_list.pk, "note": "Should fail"}
                    )
                    self.assertTrue(denied["isError"])
                    self.assertIn(
                        "insufficient_scope", denied["_meta"]["mcp/www_authenticate"][0]
                    )
                    jwt_response = await client.post(
                        "/mcp",
                        json=payload,
                        headers={**headers, "Authorization": f"Bearer {jwt}"},
                    )
                    self.assertEqual(jwt_response.status_code, 401)
                    bad_origin = await client.post(
                        "/mcp",
                        json=payload,
                        headers={**headers, "Origin": "https://untrusted.example"},
                    )
                    self.assertEqual(bad_origin.status_code, 403)
                    legacy = await client.get(
                        "/api/boards/", headers={"Authorization": "Bearer test-access"}
                    )
                    self.assertEqual(legacy.status_code, 401)
                    await sync_to_async(self.token.delete)()
                    revoked = await client.post("/mcp", json=payload, headers=headers)
                    self.assertEqual(revoked.status_code, 401)

        async_to_sync(check)()

    def test_expiry_resource_inactive_and_revocation(self):
        for updates in (
            {"expires": timezone.now() - timedelta(seconds=1)},
            {"resource": ["https://wrong.example/mcp"]},
        ):
            AccessToken.objects.filter(pk=self.token.pk).update(**updates)
            with self.assertRaises(PermissionDenied):
                resolve_token("test-access")
            self.token.save()
        self.user.is_active = False
        self.user.save()
        with self.assertRaises(PermissionDenied):
            resolve_token("test-access")
        self.user.is_active = True
        self.user.save()
        self.token.delete()
        with self.assertRaises(PermissionDenied):
            resolve_token("test-access")
