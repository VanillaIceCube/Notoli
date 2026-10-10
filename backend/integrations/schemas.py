from typing import Literal

from typing_extensions import TypedDict


class BoardSummary(TypedDict):
    id: int
    name: str
    description: str


class ListSummary(BoardSummary):
    board_id: int


class Item(TypedDict):
    id: int
    list_id: int | None
    board_id: int
    note: str
    description: str
    status: Literal["Not Started", "In Progress", "Complete"]
    updated_at: str
    url: str


class BoardPage(TypedDict):
    results: list[BoardSummary]
    next_offset: int | None


class ListPage(TypedDict):
    results: list[ListSummary]
    next_offset: int | None


class ItemPage(TypedDict):
    results: list[Item]
    next_offset: int | None


class UserSummary(TypedDict):
    id: int
    username: str
    email: str
    display_name: str


class BoardCollaboratorPage(TypedDict):
    board_id: int
    board_name: str
    sharing_level: Literal["board"]
    can_manage_collaborators: bool
    owner: UserSummary
    results: list[UserSummary]
    next_offset: int | None


class BoardSharingChange(TypedDict):
    board_id: int
    board_name: str
    sharing_level: Literal["board"]
    action: Literal["added", "removed"]


class MutationResult(TypedDict):
    id: int
    action: str


class OrderResult(TypedDict):
    id: int
    ordered_ids: list[int]


class CountResult(TypedDict):
    count: int


class NotificationSummary(TypedDict):
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


class NotificationPage(TypedDict):
    results: list[NotificationSummary]
    next_offset: int | None
