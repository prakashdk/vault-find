import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from .models import Entity, EntityBase, FolderWithEntities, VaultExport


class EntityRepository:
    """Simple JSON-backed storage for entities."""

    DEFAULT_FOLDER_NAME = "General"

    def __init__(self, storage_path: Path) -> None:
        self.storage_path = storage_path
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.storage_path.exists():
            self._write_raw({"folders": []})
        else:
            # Ensure legacy formats migrate to folder-aware structure
            self._read_raw(persist_migration=True)

    def list_entities(self) -> List[Entity]:
        entities: List[Entity] = []
        for folder in self.list_folders():
            entities.extend(folder.entities)
        return entities

    def list_folders(self) -> List[FolderWithEntities]:
        data = self._read_raw()
        folders: List[FolderWithEntities] = []
        for folder in data["folders"]:
            folder.setdefault("created_at", datetime.utcnow().isoformat())
            entities = [
                Entity(**self._hydrate_entity(entity_data, folder))
                for entity_data in folder.get("entities", [])
            ]
            folders.append(
                FolderWithEntities(
                    id=folder["id"],
                    name=folder["name"],
                    created_at=folder["created_at"],
                    entities=entities,
                )
            )
        return folders

    def add_entity(self, data: EntityBase) -> Entity:
        content = self._read_raw()
        folder = self._get_or_create_folder(content, data.folder_name)
        entity = Entity(folder_id=folder["id"], **data.model_dump())
        folder.setdefault("entities", []).append(entity.model_dump(mode="json"))
        self._write_raw(content)
        return entity

    def get_entity(self, entity_id: str) -> Optional[Entity]:
        for folder in self.list_folders():
            for entity in folder.entities:
                if entity.id == entity_id:
                    return entity
        return None

    def delete_entity(self, entity_id: str) -> bool:
        content = self._read_raw()
        removed = False
        for folder in content.get("folders", []):
            entities = folder.get("entities", [])
            new_entities = [entity for entity in entities if entity.get("id") != entity_id]
            if len(new_entities) != len(entities):
                folder["entities"] = new_entities
                removed = True
        if removed:
            self._write_raw(content)
        return removed

    def delete_folder(self, folder_id: str) -> None:
        content = self._read_raw()
        folders = content.get("folders", [])
        for index, folder in enumerate(folders):
            if folder.get("id") != folder_id:
                continue
            if folder.get("entities"):
                raise ValueError("Folder must be empty before deletion")
            folders.pop(index)
            self._write_raw(content)
            return
        raise ValueError(f"Folder {folder_id} not found")

    def update_entity(self, entity_id: str, data: EntityBase) -> Entity:
        content = self._read_raw()
        current_folder = None
        current_index = None
        current_entity = None
        for folder in content.get("folders", []):
            for idx, entity in enumerate(folder.get("entities", [])):
                if entity.get("id") == entity_id:
                    current_folder = folder
                    current_index = idx
                    current_entity = entity
                    break
            if current_entity:
                break

        if not current_entity or current_folder is None or current_index is None:
            raise ValueError(f"Entity {entity_id} not found")

        target_folder = current_folder
        desired_folder_name = data.folder_name.strip()
        if desired_folder_name and desired_folder_name.lower() != current_folder["name"].lower():
            target_folder = self._get_or_create_folder(content, desired_folder_name)
            # remove from original folder
            current_folder["entities"].pop(current_index)

        updated_payload = {
            "id": entity_id,
            "title": data.title,
            "description": data.description,
            "data_type": data.data_type,
            "data": data.data,
            "folder_name": target_folder["name"],
            "folder_id": target_folder["id"],
            "created_at": current_entity.get("created_at", datetime.utcnow().isoformat()),
        }

        target_entities = target_folder.setdefault("entities", [])
        if target_folder is current_folder:
            target_entities[current_index] = updated_payload
        else:
            target_entities.append(updated_payload)

        self._write_raw(content)
        return Entity(**updated_payload)

    def export_vault(self) -> VaultExport:
        return VaultExport(folders=self.list_folders())

    def import_vault(self, payload: VaultExport) -> None:
        self.replace_all(payload.folders)

    def replace_all(self, folders: List[FolderWithEntities]) -> None:
        serialized = {
            "folders": [self._serialize_folder(folder) for folder in folders]
        }
        self._write_raw(serialized)

    def _hydrate_entity(self, entity_data: Dict[str, Any], folder: Dict[str, Any]) -> Dict[str, Any]:
        hydrated = {**entity_data}
        hydrated.setdefault("folder_id", folder["id"])
        hydrated.setdefault("folder_name", folder["name"])
        hydrated.setdefault("created_at", entity_data.get("created_at", datetime.utcnow().isoformat()))
        return hydrated

    def _get_or_create_folder(self, content: Dict[str, Any], folder_name: str) -> Dict[str, Any]:
        normalized_name = folder_name.strip()
        if not normalized_name:
            raise ValueError("Folder name cannot be empty")
        for folder in content["folders"]:
            if folder["name"].lower() == normalized_name.lower():
                return folder
        new_folder = {
            "id": uuid4().hex,
            "name": normalized_name,
            "created_at": datetime.utcnow().isoformat(),
            "entities": [],
        }
        content["folders"].append(new_folder)
        return new_folder

    def _read_raw(self, *, persist_migration: bool = False) -> Dict[str, Any]:
        if not self.storage_path.exists():
            return {"folders": []}
        content = self.storage_path.read_text(encoding="utf-8")
        if not content.strip():
            data = {"folders": []}
            if persist_migration:
                self._write_raw(data)
            return data
        data = json.loads(content)
        migrated = False
        if isinstance(data, list):
            data = self._migrate_list_to_folders(data)
            migrated = True
        elif "folders" not in data:
            data = {"folders": []}
            migrated = True
        if persist_migration and migrated:
            self._write_raw(data)
        return data

    def _write_raw(self, data: Dict[str, Any]) -> None:
        self.storage_path.write_text(
            json.dumps(data, indent=2, default=self._serialize),
            encoding="utf-8",
        )

    def _migrate_list_to_folders(self, legacy_entities: List[dict]) -> Dict[str, Any]:
        folder_id = uuid4().hex
        normalized_entities = []
        for entity in legacy_entities:
            normalized_entity = {**entity}
            normalized_entity.setdefault("folder_name", self.DEFAULT_FOLDER_NAME)
            normalized_entity.setdefault("folder_id", folder_id)
            normalized_entity.setdefault("created_at", datetime.utcnow().isoformat())
            normalized_entities.append(normalized_entity)
        return {
            "folders": [
                {
                    "id": folder_id,
                    "name": self.DEFAULT_FOLDER_NAME,
                    "created_at": datetime.utcnow().isoformat(),
                    "entities": normalized_entities,
                }
            ]
        }

    @staticmethod
    def _serialize(value):
        if isinstance(value, datetime):
            return value.isoformat()
        raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")

    def _serialize_folder(self, folder: FolderWithEntities) -> Dict[str, Any]:
        return {
            "id": folder.id,
            "name": folder.name,
            "created_at": folder.created_at.isoformat(),
            "entities": [
                self._serialize_entity_for_folder(entity, folder)
                for entity in folder.entities
            ],
        }

    @staticmethod
    def _serialize_entity_for_folder(entity: Entity, folder: FolderWithEntities) -> Dict[str, Any]:
        payload = entity.model_dump(mode="json")
        payload["folder_id"] = folder.id
        payload["folder_name"] = folder.name
        return payload
