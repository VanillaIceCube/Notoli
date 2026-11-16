from typing import Literal

from typing_extensions import TypedDict


class ResultMetadata(TypedDict, total=False):
    truncated: bool
    detail: str
    applied: bool


class BoardSummary(ResultMetadata):
    id: int
    name: str
    description: str


class ListSummary(BoardSummary):
    board_id: int


class Item(ResultMetadata):
    id: int
    list_id: int | None
    board_id: int
    note: str
    description: str
    status: Literal["Not Started", "In Progress", "Complete"]
    updated_at: str
    url: str


class BoardPage(ResultMetadata):
    results: list[BoardSummary]
    next_offset: int | None


class ListPage(ResultMetadata):
    results: list[ListSummary]
    next_offset: int | None


class ItemPage(ResultMetadata):
    results: list[Item]
    next_offset: int | None


class UserSummary(ResultMetadata):
    id: int
    username: str
    email: str
    display_name: str


class BoardCollaboratorPage(ResultMetadata):
    board_id: int
    board_name: str
    sharing_level: Literal["board"]
    can_manage_collaborators: bool
    owner: UserSummary
    results: list[UserSummary]
    next_offset: int | None


class BoardSharingChange(ResultMetadata):
    board_id: int
    board_name: str
    sharing_level: Literal["board"]
    action: Literal["added", "removed"]


class MutationResult(ResultMetadata):
    id: int
    action: str


class OrderResult(ResultMetadata):
    id: int
    ordered_ids: list[int]


class CountResult(ResultMetadata):
    count: int


class NotificationSummary(ResultMetadata):
    id: int
    event_type: str
    title: str
    message: str
    is_read: bool
    created_at: str
    read_at: str | None
    board_id: int | None
    board_name: str
    list_id: int | None
    item_id: int | None
    target_path: str


class NotificationPage(ResultMetadata):
    results: list[NotificationSummary]
    next_offset: int | None
