# Configuration Reference

## Overview

The LLaMA RAG Starter Kit uses **minimal configuration** with sensible defaults. Most configuration is done through `RAGService` constructor parameters rather than external config files.

## Configuration Hierarchy

Configuration priority (highest to lowest):

1. **Constructor Parameters** - Passed directly to `RAGService()`
2. **Environment Variables** - `LLAMA_RAG_*` prefix  
3. **YAML Config** - `config/defaults.yaml`
4. **Service Defaults** - Built-in constants in `RAGService`

## YAML Configuration (config/defaults.yaml)

**Current minimal config:**

```yaml
index:
  path: "./data/index"
  auto_save: true
```

### Options

#### `index.path`
- **Type:** string
- **Default:** `"./data/index"`
- **Description:** Default path for vector index storage

#### `index.auto_save`
- **Type:** boolean
- **Default:** `true`
- **Description:** Whether to automatically save index after ingestion

## Environment Variables

Override any setting using `LLAMA_RAG_` prefix with double underscores for nesting:

```bash
# Index configuration
export LLAMA_RAG_INDEX__PATH="./production/index"
export LLAMA_RAG_INDEX__AUTO_SAVE=false

# Model configuration (if using typed settings)
export LLAMA_RAG_EMBEDDING__MODEL="embeddinggemma"
export LLAMA_RAG_LLM__MODEL="llama3.1"
```

## RAGService Defaults

Most configuration is defined as constants in `RAGService` class:

```python
class RAGService:
    # Model configuration
    DEFAULT_EMBEDDING_TYPE = "ollama"
    DEFAULT_EMBEDDING_MODEL = "embeddinggemma"
    DEFAULT_LLM_TYPE = "ollama"
    DEFAULT_LLM_MODEL = "llama3.1"
    DEFAULT_LLM_TEMPERATURE = 0.7
    DEFAULT_VECTORSTORE_TYPE = "faiss"
    
    # Processing configuration
    DEFAULT_CHUNK_SIZE = 500
    DEFAULT_CHUNK_OVERLAP = 50
    DEFAULT_RETRIEVAL_K = 4
```

## Configuration via Constructor

**Recommended approach:** Pass configuration directly to `RAGService`:

```python
from common.service import RAGService
from pathlib import Path

service = RAGService(
    # Index configuration
    index_path=Path("./my-index"),
    auto_load=True,
    auto_save=True,
    
    # Embedding configuration
    embedding_type="ollama",  # or "openai", "huggingface"
    embedding_model="embeddinggemma",
    
    # LLM configuration
    llm_type="ollama",  # or "openai", "llamacpp"
    llm_model="llama3.1",
    llm_temperature=0.7,
    
    # Vector store configuration
    vectorstore_type="faiss",  # or "chroma"
    
    # Processing configuration
    chunk_size=500,
    chunk_overlap=50,
    retrieval_k=4,
)
```

## Provider-Specific Configuration

### Ollama (Default)

**Requirements:**
- Ollama installed and running locally
- Models pulled: `ollama pull embeddinggemma` and `ollama pull llama3.1`

```python
service = RAGService(
    embedding_type="ollama",
    embedding_model="embeddinggemma",  # or "nomic-embed-text", "mxbai-embed-large"
    llm_type="ollama",
    llm_model="llama3.1",  # or "llama2", "mistral", "phi"
)
```

### OpenAI

**Requirements:**
- `pip install langchain-openai`
- API key: `export OPENAI_API_KEY=sk-...`

```python
service = RAGService(
    embedding_type="openai",
    embedding_model="text-embedding-3-small",  # or "text-embedding-ada-002"
    llm_type="openai",
    llm_model="gpt-4",  # or "gpt-3.5-turbo"
    llm_temperature=0.7,
)
```

### HuggingFace Embeddings

**Requirements:**
- `pip install sentence-transformers`

```python
service = RAGService(
    embedding_type="huggingface",
    embedding_model="all-MiniLM-L6-v2",  # or "all-mpnet-base-v2"
    llm_type="ollama",  # Still use Ollama for LLM
    llm_model="llama3.1",
)
```

### LlamaCpp (Local Models)

**Requirements:**
- `pip install llama-cpp-python`
- Download GGUF model file

```python
service = RAGService(
    embedding_type="ollama",
    embedding_model="embeddinggemma",
    llm_type="llamacpp",
    llm_model="/path/to/model.gguf",
)
```

### Chroma Vector Store

**Requirements:**
- `pip install chromadb`

```python
service = RAGService(
    embedding_type="ollama",
    embedding_model="embeddinggemma",
    vectorstore_type="chroma",
)
```

## Chunking Configuration

Configure document chunking for ingestion:

```python
# Via RAGService constructor (sets defaults)
service = RAGService(
    chunk_size=1000,      # Larger chunks for more context
    chunk_overlap=100,     # 10% overlap recommended
)

# Or per-ingestion call
service.ingest_from_directory(
    Path("docs/"),
    chunk_size=500,        # Override default for this call
    chunk_overlap=50,
)
```

**Guidelines:**
- **Small chunks (128-256):** Precise retrieval, less context
- **Medium chunks (500-512):** Balanced (default)
- **Large chunks (1024-2048):** More context, less precision
- **Overlap:** 10-20% of chunk_size recommended

## Retrieval Configuration

Configure how many documents to retrieve:

```python
# Via RAGService constructor (sets default)
service = RAGService(
    retrieval_k=4,  # Default number of documents
)

# Or per-query
answer = service.query("What is ML?", k=10)  # Retrieve 10 docs for this query
```

**Guidelines:**
- **k=3-5:** Good for focused questions
- **k=5-10:** Good for broader topics
- **k>10:** May introduce noise

## Logging Configuration

Configure logging level via CLI or programmatically:

```bash
# CLI: Default (clean output)
python -m app.cli ingest docs/ --output ./data/index

# CLI: Verbose (detailed logs)
python -m app.cli --verbose ingest docs/ --output ./data/index
```

```python
# Programmatic
from common.utils import configure_logging

configure_logging(verbose=False)  # Clean output (default)
configure_logging(verbose=True)   # Detailed logs with timestamps
```

## Complete Configuration Example

```python
from common.service import RAGService
from common.utils import configure_logging
from pathlib import Path

# Enable verbose logging
configure_logging(verbose=True)

# Create service with full configuration
service = RAGService(
    # Index settings
    index_path=Path("./production/ml-docs"),
    auto_load=True,
    auto_save=True,
    
    # Embedding settings (OpenAI)
    embedding_type="openai",
    embedding_model="text-embedding-3-small",
    
    # LLM settings (GPT-4)
    llm_type="openai",
    llm_model="gpt-4",
    llm_temperature=0.5,  # More deterministic
    
    # Vector store (Chroma)
    vectorstore_type="chroma",
    
    # Processing settings
    chunk_size=1000,
    chunk_overlap=100,
    retrieval_k=5,
)

# Ingest with custom chunking
service.ingest_from_directory(
    Path("docs/ml-papers/"),
    chunk_size=1500,  # Override for this corpus
    chunk_overlap=150,
)

# Query with custom k
answer = service.query("Explain transformers", k=8)
print(answer)
```

## Configuration Best Practices

1. **Start with defaults** - They work well for most use cases
2. **Override per-use-case** - Use constructor params for deployment-specific settings
3. **Use environment variables** - For secrets and deployment configuration
4. **Avoid YAML complexity** - Keep `defaults.yaml` minimal
5. **Document provider requirements** - Note API keys, installed models, etc.

## Troubleshooting

### "Ollama connection refused"

```bash
# Start Ollama service
ollama serve

# Pull required models
ollama pull embeddinggemma
ollama pull llama3.1
```

### "OpenAI API key not found"

```bash
export OPENAI_API_KEY=sk-...
```

### "Model not found"

```bash
# For Ollama
ollama pull <model-name>

# For LlamaCpp
# Download .gguf file and provide full path
```

### "Index not found"

```bash
# Create index first
python -m app.cli ingest docs/ --output ./data/index

# Or check path
ls -la ./data/index/
```

## Related Documentation

- [Architecture Guide](architecture.md) - System design and data flow
- [CLI Usage Guide](../examples/cli_usage.md) - Command-line examples
- [README](../README.md) - Quick start guide
