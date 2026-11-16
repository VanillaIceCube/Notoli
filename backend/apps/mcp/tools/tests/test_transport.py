"""Authenticated MCP HTTP protocol, origin and revocation behavior."""

from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

import httpx2
from asgiref.sync import async_to_sync, sync_to_async
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.test import Client, SimpleTestCase, TransactionTestCase
from django.utils import timezone
from oauth2_provider.models import AccessToken
from rest_framework_simplejwt.tokens import RefreshToken as JWTRefreshToken

from apps.mcp.framework.oauth import resolve_token
from apps.notes.models import List as NoteList

from .helpers import (
    make_client,
    make_token,
)


class MCPToolTransportTests(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            "http-user", email="http@example.com"
        )
        self.app = make_client()
        self.token = make_token(self.user, self.app)

    def test_asgi_protocol_auth_schemas_and_tools(self):
        from config.asgi import application

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
                            "get_board_collaborators",
                            "add_board_collaborator",
                            "remove_board_collaborator",
                            "get_board",
                            "create_board",
                            "update_board",
                            "delete_board",
                            "get_list",
                            "create_list",
                            "update_list",
                            "delete_list",
                            "reorder_lists",
                            "list_board_items",
                            "get_item",
                            "add_board_item",
                            "update_board_item",
                            "delete_item",
                            "attach_item",
                            "set_list_items",
                            "reorder_items",
                            "list_notifications",
                            "get_notification",
                            "update_notification",
                            "mark_all_notifications_read",
                            "delete_notification",
                            "clear_notifications",
                            "confirm_change",
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
                    self.assertEqual(
                        tools["add_board_collaborator"]["_meta"]["securitySchemes"],
                        [{"type": "oauth2", "scopes": ["notoli:read", "notoli:share"]}],
                    )
                    self.assertFalse(
                        tools["remove_board_collaborator"]["annotations"][
                            "destructiveHint"
                        ]
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
                        if name in tools and "request_id" in tools[name][
                            "inputSchema"
                        ].get("properties", {}):
                            arguments = {"request_id": str(uuid4()), **arguments}
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

                    async def approve(result):
                        self.assertFalse(result.get("isError"), result)
                        prepared = result["structuredContent"]
                        self.assertEqual(prepared["status"], "prepared")
                        reference = prepared["result"]["confirmation_id"]

                        def decide():
                            app_client = Client(HTTP_AUTHORIZATION=f"Bearer {jwt}")
                            preview = app_client.get(
                                "/auth/mcp/action-approval/", {"approval_id": reference}
                            )
                            self.assertEqual(preview.status_code, 200, preview.content)
                            approved = app_client.post(
                                "/auth/mcp/action-approval/",
                                {
                                    "ticket": preview.json()["ticket"],
                                    "decision": "allow",
                                },
                            )
                            self.assertEqual(
                                approved.status_code, 200, approved.content
                            )

                        await sync_to_async(decide)()
                        done = await invoke(
                            "confirm_change",
                            {
                                "request_id": prepared["request_id"],
                                "confirmation_id": reference,
                            },
                        )
                        self.assertEqual(
                            done["structuredContent"]["status"], "completed"
                        )
                        return {
                            "structuredContent": done["structuredContent"]["result"]
                        }

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
                    board_id = note_list.board_id
                    target = await sync_to_async(get_user_model().objects.create_user)(
                        "http-collaborator", email="http-collaborator@example.com"
                    )
                    denied = await invoke(
                        "add_board_collaborator",
                        {"board_id": board_id, "identifier": target.email},
                    )
                    self.assertTrue(denied["isError"])
                    challenge = denied["_meta"]["mcp/www_authenticate"][0]
                    self.assertIn("insufficient_scope", challenge)
                    self.assertIn('scope="notoli:read notoli:share"', challenge)
                    await sync_to_async(
                        AccessToken.objects.filter(pk=self.token.pk).update
                    )(scope="notoli:read notoli:share")
                    added = await invoke(
                        "add_board_collaborator",
                        {"board_id": board_id, "identifier": target.email},
                    )
                    self.assertEqual(added["structuredContent"]["status"], "completed")
                    added = {"structuredContent": added["structuredContent"]["result"]}
                    self.assertEqual(
                        added["structuredContent"]["sharing_level"], "board"
                    )
                    members = await invoke(
                        "get_board_collaborators", {"board_id": board_id}
                    )
                    self.assertEqual(
                        members["structuredContent"]["owner"]["id"], self.user.pk
                    )
                    self.assertEqual(
                        members["structuredContent"]["results"][0]["id"], target.pk
                    )
                    invalid = await invoke(
                        "get_board_collaborators", {"board_id": board_id, "limit": 101}
                    )
                    self.assertTrue(invalid["isError"])
                    invalid = await invoke(
                        "remove_board_collaborator",
                        {"board_id": board_id, "user_id": 0},
                    )
                    self.assertTrue(invalid["isError"])
                    removed = await invoke(
                        "remove_board_collaborator",
                        {"board_id": board_id, "user_id": target.pk},
                    )
                    removed = await approve(removed)
                    self.assertEqual(removed["structuredContent"]["action"], "removed")
                    for name, args, scope in (
                        ("create_board", {"name": "Denied"}, "notoli:organize"),
                        ("list_notifications", {}, "notoli:notifications"),
                        (
                            "delete_item",
                            {"board_id": board_id, "item_id": item_id},
                            "notoli:delete",
                        ),
                    ):
                        denied = await invoke(name, args)
                        self.assertTrue(denied["isError"])
                        self.assertIn(scope, denied["_meta"]["mcp/www_authenticate"][0])
                    await sync_to_async(
                        AccessToken.objects.filter(pk=self.token.pk).update
                    )(scope=" ".join(settings.OAUTH2_PROVIDER["SCOPES"]))
                    new_board = await invoke("create_board", {"name": "Protocol board"})
                    self.assertFalse(new_board.get("isError"), new_board)
                    new_board_id = new_board["structuredContent"]["id"]
                    new_list = await invoke(
                        "create_list",
                        {"board_id": new_board_id, "name": "Protocol list"},
                    )
                    self.assertFalse(new_list.get("isError"), new_list)
                    for legacy in (False, True):
                        legacy_result = await invoke(
                            "delete_board",
                            {"board_id": new_board_id, "confirm": legacy},
                        )
                        self.assertEqual(
                            legacy_result["structuredContent"]["status"], "prepared"
                        )
                        self.assertFalse(legacy_result["structuredContent"]["applied"])
                    pending = await invoke("delete_board", {"board_id": new_board_id})
                    self.assertEqual(pending["structuredContent"]["status"], "prepared")
                    invalid = await invoke(
                        "set_list_items",
                        {
                            "list_id": new_list["structuredContent"]["id"],
                            "item_ids": [0],
                        },
                    )
                    self.assertTrue(invalid["isError"])
                    invalid = await invoke(
                        "reorder_items",
                        {"list_id": note_list.pk, "ordered_ids": [item_id] * 1001},
                    )
                    self.assertTrue(invalid["isError"])
                    orphan = await invoke(
                        "add_board_item", {"board_id": new_board_id, "note": "Unlisted"}
                    )
                    self.assertFalse(orphan.get("isError"), orphan)
                    self.assertIsNone(orphan["structuredContent"]["list_id"])
                    attached = await invoke(
                        "attach_item",
                        {
                            "list_id": new_list["structuredContent"]["id"],
                            "item_id": orphan["structuredContent"]["id"],
                        },
                    )
                    self.assertFalse(attached.get("isError"), attached)
                    direct_memberships = await invoke(
                        "set_list_items",
                        {
                            "list_id": new_list["structuredContent"]["id"],
                            "item_ids": [orphan["structuredContent"]["id"]],
                        },
                    )
                    self.assertEqual(
                        direct_memberships["structuredContent"]["status"], "completed"
                    )
                    self.assertEqual(
                        direct_memberships["structuredContent"]["result"][
                            "ordered_ids"
                        ],
                        [orphan["structuredContent"]["id"]],
                    )
                    removal_memberships = await invoke(
                        "set_list_items",
                        {
                            "list_id": new_list["structuredContent"]["id"],
                            "item_ids": [],
                        },
                    )
                    self.assertEqual(
                        removal_memberships["structuredContent"]["status"], "prepared"
                    )
                    self.assertFalse(
                        removal_memberships["structuredContent"]["applied"]
                    )
                    history = await invoke("list_notifications", {})
                    self.assertFalse(history.get("isError"), history)
                    deleted = await invoke("delete_board", {"board_id": new_board_id})
                    deleted = await approve(deleted)
                    self.assertEqual(deleted["structuredContent"]["action"], "deleted")
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


class RegistryAndErrorTests(SimpleTestCase):
    def test_server_factories_have_independent_complete_tool_registries(self):
        from ..server import create_server

        first, second = create_server(), create_server()
        self.assertIsNot(first, second)
        first_tools = [
            tool.model_dump(by_alias=True) for tool in async_to_sync(first.list_tools)()
        ]
        second_tools = [
            tool.model_dump(by_alias=True)
            for tool in async_to_sync(second.list_tools)()
        ]
        self.assertEqual(first_tools, second_tools)
        self.assertEqual(len(first_tools), 32)

        @first.tool()
        def isolated_fixture() -> dict:
            return {"fixture": True}

        self.assertEqual(len(async_to_sync(first.list_tools)()), 33)
        self.assertEqual(len(async_to_sync(second.list_tools)()), 32)

    def test_object_denial_has_no_reconnect_challenge_or_private_exception(self):
        from .. import server

        with patch.object(
            server, "execute", side_effect=PermissionDenied("private-object-id")
        ):
            with self.assertRaisesMessage(
                server.ToolError, "Object not found or permission denied"
            ) as denied:
                async_to_sync(server.call)("get_board", board_id=123)
        self.assertNotIn("private-object-id", str(denied.exception))

    def test_unexpected_failure_is_sanitized_with_reference(self):
        from .. import server

        with patch.object(
            server, "execute", side_effect=ValueError("private-provider-body")
        ):
            with self.assertLogs(server.logger, level="WARNING") as logs:
                with self.assertRaises(server.ToolError) as failure:
                    async_to_sync(server.call)("get_board", board_id=123)
        self.assertIn("reference ", str(failure.exception))
        self.assertNotIn(
            "private-provider-body", str(failure.exception) + str(logs.output)
        )
