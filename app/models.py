from datetime import datetime
from typing import List, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


DataType = Literal["link", "note"]


class EntityBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1, max_length=1000)
    data_type: DataType = Field(..., description="Type of secure data stored with the entity")
    data: str = Field(..., min_length=1, description="Content for the selected data type")
    folder_name: str = Field(..., min_length=1, max_length=150, description="Folder used to group this entity")


class Entity(EntityBase):
    id: str = Field(default_factory=lambda: uuid4().hex)
    folder_id: str = Field(..., min_length=1)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Folder(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex)
    name: str = Field(..., min_length=1, max_length=150)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class FolderWithEntities(Folder):
    entities: List[Entity] = Field(default_factory=list)


class VaultExport(BaseModel):
    schema_version: str = Field(default="1.0")
    exported_at: datetime = Field(default_factory=datetime.utcnow)
    folders: List[FolderWithEntities] = Field(default_factory=list)


class SearchMatch(BaseModel):
    entity_id: str
    title: str
    folder_name: str
    data_type: DataType


class QueryResponse(BaseModel):
    question: str
    matches: List[SearchMatch]


class ApiMessage(BaseModel):
    detail: str
