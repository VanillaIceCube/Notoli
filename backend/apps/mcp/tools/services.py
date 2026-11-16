"""Authenticate each invocation and commit only a bounded, truthful result."""

from django.core.exceptions import PermissionDenied
from django.db import transaction
from rest_framework.exceptions import APIException

from . import operations, queries
from .permissions import principal
from .results import bounded_result


def execute(raw_token, operation, **arguments):
    with transaction.atomic():
        token = principal(raw_token, operation)
        try:
            dispatch = (
                queries.execute
                if operation in queries.READ_OPERATIONS
                else operations.execute
            )
            output = dispatch(token.user, operation, **arguments)
        except APIException as error:
            if error.status_code in {403, 404}:
                raise PermissionDenied(
                    "Object not found or permission denied."
                ) from None
            raise operations.OperationError(
                "Notoli rejected the change. Check the supplied fields and current record."
            ) from None
        # Representations are bounded before commit. A clipped description is
        # a successful change, with explicit metadata, never an ambiguous retry.
        return bounded_result(output, mutation=operation not in queries.READ_OPERATIONS)
