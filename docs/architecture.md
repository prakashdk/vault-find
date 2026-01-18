# Architecture Guide

## Overview

The LLaMA RAG Starter Kit is a **simple, LangChain-native** RAG implementation that prioritizes clarity and maintainability over custom abstractions.

**Design Philosophy:**
- Use battle-tested LangChain components directly
- No custom abstractions (no ABC interfaces, no adapter patterns)
- Configuration flows top-down from entry points
- ~700 lines of code total vs 2000+ with custom layers

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Entry Points                            │
│  ┌──────────────────┐        ┌─────────────────────────┐   │
│  │   CLI (app/cli.py)│        │ Programmatic Usage      │   │
│  │  - ingest command │        │ - Import RAGService     │   │
│  │  - query command  │        │ - Direct Python calls   │   │
│  └──────────────────┘        └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              RAGService (common/service.py)                  │
│  - High-level API with sensible defaults                    │
│  - Lifecycle management (auto-load, auto-save)              │
│  - Methods: ingest_from_directory, ingest_from_texts,       │
│    add_document, query, retrieve, save, load                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               SimpleRAG (common/rag.py)                      │
│  - Core RAG implementation using LangChain LCEL             │
│  - Document loading and splitting                           │
│  - Vector store management                                  │
│  - RAG chain composition                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                 ┌────────────┼────────────┐
                 ▼            ▼            ▼
┌──────────────────┐  ┌──────────────┐  ┌────────────────┐
│    Factories     │  │  LangChain   │  │ Configuration  │
│ (factories.py)   │  │  Components  │  │ (config.py)    │
├──────────────────┤  ├──────────────┤  ├────────────────┤
│ get_embeddings() │  │ Documents    │  │ defaults.yaml  │
│ get_llm()        │  │ Embeddings   │  │ env overrides  │
│ get_vectorstore()│  │ VectorStore  │  │ get_config()   │
└──────────────────┘  │ Retrievers   │  └────────────────┘
                      │ Chains       │
                      └──────────────┘
```

## FastAPI Application Layer

The new Vault Find interface lives in [app/main.py](app/main.py). It exposes both HTML views and JSON APIs from a single FastAPI service:

- `GET /` renders the Jinja2 dashboard with forms for adding entities and running natural-language queries.
- `POST /entities` accepts form submissions (folder-aware) and persists entities to `data/entities.json` while indexing them through `RAGService` for later retrieval.
- `POST /query` runs the RAG pipeline and renders the answer inline on the dashboard.
- `/export` and `/import` provide downloadable/uploadable JSON using a shared schema (`schema_version`, `exported_at`, and folder → entities tree). API equivalents live under `/api/export` + `/api/import` for automation.
- `/api/entities` (GET/POST) and `/api/query` provide RESTful access for automation or integrations.

The sidebar of the HTML view now visualizes folder hierarchies; entities live within folders (created on demand) and the detail modal fetches content client-side using serialized metadata embedded in the page. This layer delegates all semantic search responsibilities to `RAGService`, keeping HTTP concerns (validation, templating) separate from retrieval logic while avoiding a standalone frontend service.

**Running the server:**
1. Install dependencies: `pip install -r requirements.txt` (ensure `llama_rag` is available).
2. Start the API + views: `python main.py` (runs `uvicorn app.main:app --reload`).
3. Visit `http://127.0.0.1:8000` for the dashboard or hit `/api/*` endpoints directly.

## Component Details

### 1. Entry Points

**CLI (app/cli.py)**
- Simple argparse-based interface
- Two commands: `ingest` and `query`
- Global `--verbose` flag for detailed logging
- Reads config once and passes down

**Programmatic Usage**
- Import `RAGService` directly
- Use as a library in other applications
- Full control over configuration

### 2. RAGService (common/service.py)

**Purpose:** High-level, framework-agnostic service layer

**Key Features:**
- Sensible defaults (Ollama + FAISS)
- Auto-load existing index on initialization
- Auto-save after ingestion (configurable)
- Multiple ingestion methods
- Lifecycle management

**API:**
```python
class RAGService:
    def __init__(
        self,
        index_path: Optional[Path] = None,
        auto_load: bool = True,
        auto_save: bool = True,
        embedding_type: str = "ollama",
        embedding_model: str = "embeddinggemma",
        llm_type: str = "ollama",
        llm_model: str = "llama3.1",
        # ... more config
    )
    
    def ingest_from_directory(directory: Path, ...) -> int
    def ingest_from_texts(texts: List[str], ...) -> int
    def add_document(text: str, metadata: Dict, ...) -> int
    def query(query: str, k: int) -> str
    def retrieve(query: str, k: int) -> List[Document]
    def save(path: Optional[Path]) -> None
    def load(path: Optional[Path]) -> None
    def has_index() -> bool
    def get_stats() -> Dict
    def reset() -> None
```

**Design Decisions:**
- All config passed via constructor (no hidden config reads)
- Methods have explicit defaults (no implicit config lookups)
- Returns simple types (int, str, List) not custom objects
- Stateful (holds vectorstore, chain) for efficiency

### 3. SimpleRAG (common/rag.py)

**Purpose:** Core RAG implementation using LangChain components

**Responsibilities:**
- Create embeddings, LLM, and vector store via factories
- Load and split documents
- Build LCEL chains for retrieval + generation
- Save/load vector store to disk

**Key Methods:**
```python
class SimpleRAG:
    def ingest(source_path: Path, chunk_size: int, chunk_overlap: int)
    def query(question: str, k: int) -> str
    def retrieve(query: str, k: int) -> List[Document]
    def save(path: Path)
    def load(path: Path)
```

**LangChain LCEL Chain:**
```python
chain = (
    {
        "context": retriever | format_docs,
        "question": RunnablePassthrough()
    }
    | prompt
    | llm
    | StrOutputParser()
)
```

**Design Decisions:**
- Pure LangChain components (no custom wrappers)
- LCEL for composable, declarative chains
- Explicit parameters (no config reads)
- Uses utility functions for reusable logic

### 4. Factories (common/factories.py)

**Purpose:** Simple factory functions to create LangChain components

**Functions:**
```python
def get_embeddings(type: str, model: str) -> Embeddings
def get_llm(type: str, model: str, temperature: float) -> BaseChatModel
def get_vectorstore(embeddings: Embeddings, type: str) -> Type[VectorStore]
```

**Supported Providers:**
- **Embeddings:** Ollama, OpenAI, HuggingFace
- **LLMs:** ChatOllama, ChatOpenAI, LlamaCpp
- **Vector Stores:** FAISS, Chroma

**Design Decisions:**
- Pure functions (no state, no config reads)
- Return LangChain interfaces directly
- Easy to extend with new providers
- Type hints for clarity

### 5. Configuration (common/config.py, config/defaults.yaml)

**Purpose:** Minimal configuration with sensible defaults

**config/defaults.yaml:**
```yaml
index:
  path: "./data/index"
  auto_save: true
```

**Environment Variables:**
```bash
export LLAMA_RAG_INDEX__PATH=./my-index
```

**Design Decisions:**
- Most defaults in `RAGService` constants
- Config for deployment-specific settings only
- Read once at top, pass down explicitly
- No scattered config reads in utility functions

### 6. Utilities (common/utils.py)

**Purpose:** Shared logging and helper functions

**Key Functions:**
```python
def configure_logging(verbose: bool) -> None
def get_logger(name: str) -> logging.Logger
def generate_doc_id(text: str, source: str) -> str
def calculate_checksum(text: str) -> str
```

## Data Flow

### Ingestion Flow

```
User → CLI ingest command
  ↓
RAGService.ingest_from_directory()
  ↓
SimpleRAG.ingest()
  ↓
load_documents()  [LangChain DirectoryLoader]
  ↓
split_documents() [RecursiveCharacterTextSplitter]
  ↓
VectorStore.from_documents() [Generate embeddings, build index]
  ↓
RAGService.save() [Persist to disk]
```

### Query Flow

```
User → CLI query command
  ↓
RAGService.query()
  ↓
SimpleRAG.query()
  ↓
LCEL Chain execution:
  - Retriever: vectorstore.similarity_search(query, k)
  - Format: docs → formatted context
  - Prompt: question + context → prompt
  - LLM: prompt → generated answer
  - Parser: extract string response
  ↓
Return answer to user
```

## Configuration Flow

```
CLI Entry Point (app/cli.py)
  ├─ Read config once: config = get_config()
  ├─ Parse command-line args
  └─ Create RAGService with explicit params
      ↓
RAGService.__init__()
  ├─ Apply service-level defaults
  ├─ Override with constructor params
  └─ Create SimpleRAG with explicit params
      ↓
SimpleRAG.__init__()
  ├─ Call factories with explicit type/model
  └─ Create LangChain components
      ↓
Factories (get_embeddings, get_llm, get_vectorstore)
  └─ Return LangChain components with explicit config
```

**Key Principle:** Config flows top-down, never bottom-up. No hidden config reads.

## Logging Strategy

**Default (Clean):**
- Log level: WARNING
- Format: Simple message only
- Use: User-facing status messages

**Verbose Mode:**
- Log level: DEBUG
- Format: Timestamp + module + level + message
- Use: Detailed process logs for debugging

**Configuration:**
```python
# At CLI entrypoint
configure_logging(verbose=args.verbose)

# Or programmatically
from common.utils import configure_logging
configure_logging(verbose=True)
```

## Extension Points

### Adding a New Embedding Provider

Edit `common/factories.py`:
```python
def get_embeddings(type: str = None, model: str = None):
    # ... existing code ...
    elif type == "cohere":
        from langchain_cohere import CohereEmbeddings
        return CohereEmbeddings(model=model)
```

### Adding a New LLM Provider

Edit `common/factories.py`:
```python
def get_llm(type: str = None, model: str = None, temperature: float = 0.7):
    # ... existing code ...
    elif type == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model=model, temperature=temperature)
```

### Adding a New Vector Store

Edit `common/factories.py`:
```python
def get_vectorstore(embeddings, type: str = None):
    # ... existing code ...
    elif type == "pinecone":
        from langchain_pinecone import PineconeVectorStore
        return PineconeVectorStore
```

### Custom RAG Chain

Modify `common/rag.py` → `create_rag_chain()`:
```python
def create_rag_chain(retriever, llm, prompt_template=None):
    # Your custom chain logic here
    # Can add reranking, query expansion, etc.
```

## Testing Strategy

**Unit Tests:**
- Test factories return correct LangChain types
- Test utility functions (checksums, IDs)
- Test configuration loading

**Integration Tests:**
- Test full ingest → save → load → query flow
- Use small demo corpus
- Assert on non-empty responses

**CLI Tests:**
- Use subprocess to run CLI commands
- Test against demo corpus
- Verify exit codes and output

## Performance Considerations

**Embedding Generation:**
- Batched automatically by LangChain
- Local models (Ollama) slower than API but free
- Consider GPU acceleration for large corpora

**Vector Search:**
- FAISS is fast for small-to-medium datasets (<1M docs)
- Consider approximate search for larger datasets
- Index size grows with number of chunks

**Memory Usage:**
- Vector store loads fully into memory
- ~4 bytes per dimension per vector
- Example: 10k chunks × 768 dims × 4 bytes = ~30MB

## Why This Architecture?

**Before:** Custom abstraction layers (2000+ lines)
- `EmbeddingService` ABC + adapters
- `IndexStore` ABC + adapters
- `ModelAdapter` ABC + adapters
- Complex pipeline with hooks

**After:** LangChain-native (700 lines)
- Direct use of LangChain components
- Simple service layer for lifecycle
- Pure factory functions
- Clean, understandable code

**Benefits:**
- ✅ 65% less code to maintain
- ✅ Battle-tested LangChain components
- ✅ 100+ provider integrations available
- ✅ Easier to understand and extend
- ✅ Standard patterns developers know
- ✅ Better documentation and community support

## Related Documentation

- [Configuration Reference](configuration.md) - Config options and environment variables
- [CLI Usage Guide](../examples/cli_usage.md) - Complete CLI examples and workflows
- [README](../README.md) - Quick start and API reference
- [Legacy Architecture](legacy-architecture.md) - Previous ABC-based design (historical reference)
