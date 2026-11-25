"""Scoped routine execution and exact signed-in approval for sensitive actions."""

import hashlib
import json
from datetime import timedelta
from uuid import UUID

from django.conf import settings
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.http import Http404
from django.utils import timezone
from rest_framework.exceptions import APIException

from apps.notifications import services as notifications

from . import operations, queries
from .models import Confirmation, Execution
from .permissions import lock_actor, principal, required_scopes
from .results import bounded_result, json_value


def _uuid(value):
    try:
        if not isinstance(value, str):
            raise ValueError
        return UUID(value)
    except (ValueError, TypeError, AttributeError):
        raise operations.OperationError(
            "Generate a request UUID and reuse it for the same action and arguments."
        ) from None


def _digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, allow_nan=False).encode()
    ).hexdigest()


def _owned(record, token):
    if (
        record.owner_id != token.user_id
        or record.client_id != token.application.client_id
    ):
        raise PermissionDenied("Execution belongs to another connection.")


def _outcome(record):
    if record.state == Execution.State.COMPLETED:
        return dict(record.outcome, replayed=True)
    return {
        "request_id": str(record.pk),
        "action": record.action,
        "status": record.state,
        "applied": False
        if record.state in {Execution.State.CANCELLED, Execution.State.EXPIRED}
        else None,
        "replayed": True,
        "result": {
            "detail": "This request cannot execute again. Inspect current records before requesting another action."
        },
    }


def _close(record, state):
    record.state = state
    record.save(update_fields=["state", "updated_at"])
    Confirmation.objects.filter(pk=record.confirmation_id).delete()


def _preparation(record):
    pending = (
        Confirmation.objects.select_for_update()
        .filter(pk=record.confirmation_id)
        .first()
    )
    if pending is None or pending.expires_at <= timezone.now():
        _close(record, Execution.State.EXPIRED)
        return None
    if (
        pending.owner_id != record.owner_id
        or pending.client_id != record.client_id
        or pending.action != record.action
        or pending.target_id != record.target_id
        or _digest({"action": pending.action, "arguments": pending.payload})
        != record.request_digest
        or record.action not in operations.PREPARABLE
    ):
        _close(record, Execution.State.CANCELLED)
        return None
    return pending


def _fresh(record, pending, user):
    try:
        current = queries.snapshot(
            user,
            record.action,
            pending.payload,
            pending.selected_ids,
        )
    except (PermissionDenied, APIException, ValueError):
        _close(record, Execution.State.CANCELLED)
        return None
    if _digest(current) != pending.fingerprint:
        _close(record, Execution.State.CANCELLED)
        return None
    return current


def _prepared(record, pending, replayed=False):
    return {
        "request_id": str(record.pk),
        "action": record.action,
        "status": record.state,
        "applied": False,
        "replayed": replayed,
        "result": {
            "confirmation_id": str(pending.pk),
            "approval_url": settings.FRONTEND_BASE_URL.rstrip("/")
            + "/connections/authorize?approval_id="
            + str(pending.pk),
            "expires_at": pending.expires_at.isoformat(),
            "changes": pending.payload,
            "detail": "Open this URL and approve the exact action while signed in to Notoli, then call confirm_change with the same request and confirmation IDs. An MCP token cannot approve.",
        },
    }


def _complete(record, output, *, envelope):
    output = bounded_result(output, mutation=True)
    if envelope:
        output = {
            "request_id": str(record.pk),
            "action": record.action,
            "status": "completed",
            "applied": True,
            "replayed": False,
            "result": output,
        }
    else:
        output.update(
            request_id=str(record.pk),
            execution_status="completed",
            applied=True,
            replayed=False,
        )
    # Receipt persistence and every domain write share the same transaction.
    record.state, record.outcome = Execution.State.COMPLETED, json_value(output)
    record.save(update_fields=["state", "outcome", "updated_at"])
    return record.outcome


def execute(raw_token, operation, **arguments):
    try:
        return _execute(raw_token, operation, **arguments)
    except APIException as error:
        if error.status_code in {403, 404}:
            raise PermissionDenied("Object not found or permission denied.") from None
        raise operations.OperationError(operations.CHANGE_REJECTED) from None


def _execute(raw_token, operation, **arguments):
    if operation == "confirm_change":
        if set(arguments) != {"request_id", "confirmation_id"}:
            raise operations.OperationError(
                "Use only the original request and confirmation IDs."
            )
        return confirm_change(raw_token, **arguments)
    with transaction.atomic():
        token = principal(
            raw_token, operation, lock=operation not in queries.READ_OPERATIONS
        )
        if operation in queries.READ_OPERATIONS:
            return bounded_result(queries.execute(token.user, operation, **arguments))
        request_id = _uuid(arguments.pop("request_id", None))
        arguments = json_value(
            operations.validate_arguments(operation, arguments),
            32768 if operation in operations.PREPARABLE else 65536,
        )
        digest = _digest({"action": operation, "arguments": arguments})
        record = Execution.objects.select_for_update().filter(pk=request_id).first()
        if record is not None:
            _owned(record, token)
            if record.action != operation or record.request_digest != digest:
                raise operations.OperationError(
                    "This UUID belongs to different action arguments."
                )
            if record.state not in {Execution.State.PREPARED, Execution.State.APPROVED}:
                if (
                    record.state == Execution.State.COMPLETED
                    and operation in operations.ROUTINE
                ):
                    queries.require_replay_access(
                        token.user,
                        operation,
                        record.outcome
                        if "execution_status" in record.outcome
                        else record.outcome["result"],
                    )
                return _outcome(record)
            pending = _preparation(record)
            if pending is None:
                return _outcome(record)
            if pending.token_checksum != token.token_checksum:
                raise PermissionDenied("Preparation belongs to a different token.")
            if _fresh(record, pending, token.user) is None:
                return _outcome(record)
            return _prepared(record, pending, True)
        target_id = next(
            (
                arguments[key]
                for key in ("notification_id", "task_id", "list_id", "board_id")
                if key in arguments
            ),
            None,
        )
        if not operations.requires_approval(token.user, operation, arguments):
            record = Execution.objects.create(
                id=request_id,
                owner=token.user,
                client_id=token.application.client_id,
                action=operation,
                target_id=target_id,
                request_digest=digest,
                state=Execution.State.IN_PROGRESS,
            )
            return _complete(
                record,
                operations.apply_action(token.user, operation, arguments),
                envelope=operation in {"add_board_collaborator", "set_list_tasks"},
            )
        selected_ids = []
        if operation == "clear_notifications":
            selected_ids = queries.selected_rows(
                notifications.notifications_for(token.user)
                .order_by("pk")
                .values_list("pk", flat=True)
            )
        current = queries.snapshot(token.user, operation, arguments, selected_ids)
        expired = Confirmation.objects.filter(
            owner=token.user, expires_at__lte=timezone.now()
        )
        Execution.objects.filter(
            confirmation_id__in=expired.values("pk"),
            state__in=[Execution.State.PREPARED, Execution.State.APPROVED],
        ).update(state=Execution.State.EXPIRED)
        expired.delete()
        if Confirmation.objects.filter(owner=token.user).count() >= 10:
            raise operations.OperationError(
                "Ten pending actions; cancel one in Notoli or wait five minutes."
            )
        record = Execution.objects.create(
            id=request_id,
            owner=token.user,
            client_id=token.application.client_id,
            action=operation,
            target_id=target_id,
            request_digest=digest,
        )
        pending = Confirmation.objects.create(
            id=record.confirmation_id,
            owner=token.user,
            client_id=record.client_id,
            token_checksum=token.token_checksum,
            action=operation,
            target_id=target_id,
            payload=arguments,
            fingerprint=_digest(current),
            selected_ids=selected_ids,
            expires_at=timezone.now() + timedelta(minutes=5),
        )
        return _prepared(record, pending)


def action_approval(user, reference, decision=None):
    from oauth2_provider.models import AccessToken

    with transaction.atomic():
        lock_actor(user)
        record = (
            Execution.objects.select_for_update()
            .filter(owner=user, confirmation_id=reference)
            .first()
        )
        if record is None:
            raise Http404
        base = {
            "status": record.state,
            "action": record.action,
            "target_id": record.target_id,
            "paid": False,
        }
        if record.state not in {Execution.State.PREPARED, Execution.State.APPROVED}:
            return base
        pending = _preparation(record)
        if pending is None:
            return dict(base, status=record.state)
        token = (
            AccessToken.objects.select_related("user", "application")
            .select_for_update()
            .filter(token_checksum=pending.token_checksum, user=user)
            .first()
        )
        if (
            token is None
            or not token.is_valid()
            or not token.user.is_active
            or token.resource != [settings.MCP_RESOURCE_URL]
            or token.application is None
            or token.application.client_id != record.client_id
            or token.application.authorization_grant_type != "authorization-code"
            or not set(required_scopes(record.action)) <= set(token.scope.split())
        ):
            raise PermissionDenied("This action's connection is no longer authorized.")
        current = _fresh(record, pending, user)
        if current is None:
            return dict(base, status=record.state)
        if decision == "cancel":
            _close(record, Execution.State.CANCELLED)
            return dict(base, status=record.state)
        if decision == "allow":
            record.state = Execution.State.APPROVED
            record.save(update_fields=["state", "updated_at"])
        elif decision is not None:
            raise operations.OperationError("Invalid approval decision.")
        return json_value(
            dict(
                base,
                status=record.state,
                application={
                    "name": token.application.name,
                    "client_id": record.client_id,
                },
                user={"username": user.get_username()},
                changes=pending.payload,
                current=current,
                destructive=True,
                expires_at=pending.expires_at.isoformat(),
            ),
            327680,
        )


def confirm_change(raw_token, request_id, confirmation_id):
    request_id, confirmation_id = _uuid(request_id), _uuid(confirmation_id)
    with transaction.atomic():
        token = principal(raw_token, "confirm_change", lock=True)
        record = Execution.objects.select_for_update().filter(pk=request_id).first()
        if record is None:
            raise operations.OperationError(
                "Prepare and approve this exact action in Notoli first."
            )
        _owned(record, token)
        # A generic confirm tool never substitutes its baseline scopes for the real action.
        operation = record.action
        if (
            operation not in operations.PREPARABLE
            or record.confirmation_id != confirmation_id
        ):
            raise operations.OperationError(
                "Use the original sensitive action identifiers."
            )
        token = principal(raw_token, operation)
        if record.state not in {Execution.State.PREPARED, Execution.State.APPROVED}:
            return _outcome(record)
        pending = _preparation(record)
        if pending is None:
            return _outcome(record)
        if pending.token_checksum != token.token_checksum:
            raise PermissionDenied("Preparation belongs to a different token.")
        if _fresh(record, pending, token.user) is None:
            return _outcome(record)
        if record.state != Execution.State.APPROVED:
            return _prepared(record, pending, True)
        arguments = pending.payload.copy()
        if record.action == "clear_notifications":
            arguments["selected_ids"] = pending.selected_ids
        record.state = Execution.State.IN_PROGRESS
        record.save(update_fields=["state", "updated_at"])
        pending.delete()
        return _complete(
            record,
            operations.apply_action(token.user, operation, arguments),
            envelope=True,
        )
