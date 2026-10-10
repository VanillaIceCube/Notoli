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
    list_id: int
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
