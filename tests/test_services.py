import tempfile
from pathlib import Path
from typing import List

import pytest
from llama_rag import RecordsService

from app.models import Entity, EntityBase, SearchMatch
from app.repository import EntityRepository
from app.services import EntityService


@pytest.fixture
def temp_data_dir(tmp_path):
    """Create temporary data directory."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "index").mkdir()
    return data_dir


@pytest.fixture
def repository(temp_data_dir):
    """Create repository with temporary storage."""
    return EntityRepository(storage_path=temp_data_dir / "entities.json")


@pytest.fixture
def rag_service(temp_data_dir):
    """Create RAG service with temporary index."""
    return RecordsService(index_path=temp_data_dir / "index")


@pytest.fixture
def entity_service(repository, rag_service):
    """Create entity service with test dependencies."""
    service = EntityService(repo=repository, rag_service=rag_service)
    service.bootstrap_index()
    return service


class TestAddEntity:
    """Tests for creating entities."""

    def test_create_entity_basic(self, entity_service):
        """Test creating a basic entity."""
        data = EntityBase(
            title="Test Password",
            description="A test password entry",
            data="secret123",
            data_type="password",
            folder_name="Personal",
        )
        
        entity = entity_service.create_entity(data)
        
        assert entity.id is not None
        assert entity.title == "Test Password"
        assert entity.description == "A test password entry"
        assert entity.data == "secret123"
        assert entity.data_type == "password"
        assert entity.folder_name == "Personal"

    def test_create_entity_persisted(self, entity_service):
        """Test entity is persisted to repository."""
        data = EntityBase(
            title="API Key",
            description="Production API key",
            data="key-123456",
            data_type="api_key",
            folder_name="Work",
        )
        
        entity = entity_service.create_entity(data)
        retrieved = entity_service.get_entity(entity.id)
        
        assert retrieved.id == entity.id
        assert retrieved.title == entity.title
        assert retrieved.data == entity.data

    def test_create_entity_indexed(self, entity_service):
        """Test entity is added to search index."""
        data = EntityBase(
            title="Database Credentials",
            description="Production database connection",
            data="postgresql://localhost:5432/db",
            data_type="connection_string",
            folder_name="Infrastructure",
        )
        
        entity = entity_service.create_entity(data)
        matches = entity_service.search_entities("database credentials")
        
        assert len(matches) > 0
        assert any(m.entity_id == entity.id for m in matches)

    def test_create_multiple_entities(self, entity_service):
        """Test creating multiple entities."""
        entities_data = [
            EntityBase(
                title=f"Entity {i}",
                description=f"Description {i}",
                data=f"data-{i}",
                data_type="note",
                folder_name="Test",
            )
            for i in range(5)
        ]
        
        created_entities = [entity_service.create_entity(data) for data in entities_data]
        all_entities = entity_service.list_entities()
        
        assert len(all_entities) >= 5
        for entity in created_entities:
            assert entity.id in [e.id for e in all_entities]


class TestQueryEntity:
    """Tests for searching entities."""

    @pytest.fixture
    def populated_service(self, entity_service):
        """Service with pre-populated test data."""
        test_entities = [
            EntityBase(
                title="AWS Production API Key",
                description="Main AWS API key for production environment",
                data="AKIAIOSFODNN7EXAMPLE",
                data_type="api_key",
                folder_name="AWS",
            ),
            EntityBase(
                title="Database Password",
                description="PostgreSQL production database password",
                data="super-secret-password",
                data_type="password",
                folder_name="Database",
            ),
            EntityBase(
                title="Slack Webhook URL",
                description="Webhook for notifications channel",
                data="https://hooks.slack.com/services/T00/B00/XXX",
                data_type="url",
                folder_name="Integrations",
            ),
            EntityBase(
                title="SSH Private Key",
                description="SSH key for production servers",
                data="-----BEGIN RSA PRIVATE KEY-----\nMIIE...",
                data_type="ssh_key",
                folder_name="SSH",
            ),
        ]
        for data in test_entities:
            entity_service.create_entity(data)
        return entity_service

    def test_search_by_title(self, populated_service):
        """Test searching entities by title."""
        matches = populated_service.search_entities("AWS API key")
        
        assert len(matches) > 0
        assert any("AWS" in m.title for m in matches)

    def test_search_by_description(self, populated_service):
        """Test searching entities by description."""
        matches = populated_service.search_entities("webhook notifications")
        
        assert len(matches) > 0
        assert any("Slack" in m.title or "webhook" in m.title.lower() for m in matches)

    def test_search_by_folder(self, populated_service):
        """Test searching entities by folder name."""
        matches = populated_service.search_entities("database")
        
        assert len(matches) > 0
        assert any(m.folder_name == "Database" for m in matches)

    def test_search_by_type(self, populated_service):
        """Test searching entities by data type."""
        matches = populated_service.search_entities("password")
        
        assert len(matches) > 0
        # Should find entities with "password" in title/description/type

    def test_search_with_k_limit(self, populated_service):
        """Test limiting search results."""
        matches = populated_service.search_entities("production", k=2)
        
        assert len(matches) <= 2

    def test_search_no_matches(self, populated_service):
        """Test search with no matching results."""
        matches = populated_service.search_entities("nonexistent quantum fizzbuzz")
        
        # May return empty or low-relevance results
        assert isinstance(matches, list)

    def test_search_returns_metadata_only(self, populated_service):
        """Test search returns metadata, not sensitive data."""
        matches = populated_service.search_entities("API key")
        
        for match in matches:
            assert hasattr(match, "entity_id")
            assert hasattr(match, "title")
            assert hasattr(match, "folder_name")
            assert hasattr(match, "data_type")
            # Ensure data field is not exposed in search results
            assert not hasattr(match, "data")

    def test_search_deduplicates_results(self, populated_service):
        """Test search results don't contain duplicates."""
        matches = populated_service.search_entities("production")
        
        entity_ids = [m.entity_id for m in matches]
        assert len(entity_ids) == len(set(entity_ids))


class TestIntegration:
    """Integration tests for complete workflows."""

    def test_add_search_retrieve_workflow(self, entity_service):
        """Test complete workflow: add entity, search, retrieve full data."""
        # Add entity
        data = EntityBase(
            title="GitHub Personal Access Token",
            description="Token for CI/CD pipeline",
            data="ghp_1234567890abcdefghijklmnopqrstuvwxyz",
            data_type="token",
            folder_name="GitHub",
        )
        entity = entity_service.create_entity(data)
        
        # Search for it
        matches = entity_service.search_entities("GitHub token CI")
        assert len(matches) > 0
        match = next((m for m in matches if m.entity_id == entity.id), None)
        assert match is not None
        
        # Retrieve full entity
        full_entity = entity_service.get_entity(match.entity_id)
        assert full_entity.data == "ghp_1234567890abcdefghijklmnopqrstuvwxyz"
        assert full_entity.title == "GitHub Personal Access Token"

    def test_delete_entity_removes_from_search(self, entity_service):
        """Test deleting entity removes it from search results."""
        # Add entity
        data = EntityBase(
            title="Temporary Secret",
            description="Will be deleted soon",
            data="temp123",
            data_type="note",
            folder_name="Temp",
        )
        entity = entity_service.create_entity(data)
        entity_id = entity.id
        
        # Verify it's searchable
        matches = entity_service.search_entities("temporary secret")
        assert any(m.entity_id == entity_id for m in matches)
        
        # Delete it
        entity_service.delete_entity(entity_id)
        
        # Verify it's gone from search
        matches_after = entity_service.search_entities("temporary secret")
        assert not any(m.entity_id == entity_id for m in matches_after)
        
        # Verify it's gone from repository
        with pytest.raises(ValueError, match="not found"):
            entity_service.get_entity(entity_id)
