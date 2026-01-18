from pathlib import Path
from typing import List, Optional

from llama_rag import RAGService

from .models import Entity, EntityBase, FolderWithEntities, SearchMatch, VaultExport
from .repository import EntityRepository


class EntityService:
    """Coordinates storage and retrieval via RAG."""

    def __init__(self, repo: EntityRepository, rag_service: RAGService) -> None:
        self.repo = repo
        self.rag = rag_service

    def list_entities(self) -> List[Entity]:
        return self.repo.list_entities()

    def list_folders(self) -> List[FolderWithEntities]:
        return self.repo.list_folders()

    def export_vault(self) -> VaultExport:
        return self.repo.export_vault()

    def import_vault(self, payload: VaultExport) -> None:
        self.repo.import_vault(payload)
        self._rebuild_index()

    def get_entity(self, entity_id: str) -> Entity:
        entity = self.repo.get_entity(entity_id)
        if not entity:
            raise ValueError(f"Entity {entity_id} not found")
        return entity

    def delete_entity(self, entity_id: str) -> None:
        if not self.repo.delete_entity(entity_id):
            raise ValueError(f"Entity {entity_id} not found")
        self._rebuild_index()

    def search_entities(self, question: str, k: Optional[int] = None) -> List[SearchMatch]:
        try:
            docs = self.rag.retrieve(question, k=k) if k else self.rag.retrieve(question)
        except AttributeError:  # Fallback if retrieve unavailable
            answer = self.rag.query(question, k=k) if k else self.rag.query(question)
            return [] if not answer else []
        matches: List[SearchMatch] = []
        seen = set()
        for doc in docs:
            entity_id = doc.metadata.get("entity_id")
            if not entity_id or entity_id in seen:
                continue
            entity = self.repo.get_entity(entity_id)
            if not entity:
                continue
            matches.append(
                SearchMatch(
                    entity_id=entity.id,
                    title=entity.title,
                    folder_name=entity.folder_name,
                )
            )
            seen.add(entity_id)
        return matches

    def create_entity(self, data: EntityBase) -> Entity:
        entity = self.repo.add_entity(data)
        self.rag.add_document(self._format_document(entity), metadata=self._metadata(entity))
        self.rag.save(None)
        return entity

    def bootstrap_index(self) -> None:
        if self.rag.has_index():
            return
        folders = self.repo.list_folders()
        self._index_entities(folders)

    def query(self, question: str, k: Optional[int] = None) -> str:
        return self.rag.query(question, k=k) if k else self.rag.query(question)

    def _rebuild_index(self) -> None:
        if hasattr(self.rag, "reset"):
            self.rag.reset()
        folders = self.repo.list_folders()
        self._index_entities(folders)

    def _index_entities(self, folders: List[FolderWithEntities]) -> None:
        if not folders:
            return
        for folder in folders:
            for entity in folder.entities:
                self.rag.add_document(self._format_document(entity), metadata=self._metadata(entity))
        self.rag.save(None)

    @staticmethod
    def _format_document(entity: Entity) -> str:
        return (
            f"Title: {entity.title}\n"
            f"Description: {entity.description}\n"
            f"Folder: {entity.folder_name}\n"
            f"Entity ID: {entity.id}\n"
        )

    @staticmethod
    def _metadata(entity: Entity) -> dict:
        return {
            "entity_id": entity.id,
            "title": entity.title,
            "data_type": entity.data_type,
            "folder": entity.folder_name,
        }
