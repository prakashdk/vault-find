# Architecture Guide

## Overview

The LLaMA RAG Starter Kit follows a **layered architecture** with clear separation between reusable library code and application-specific concerns.

## Design Philosophy

### 1. Library-First Design

The codebase is structured for eventual extraction into an internal pip package:

```
common/  → Future: llama-rag-lib
app/     → Remains application-specific
```

**Why?**
- Reusability across multiple projects
- Easier to test and maintain
- Clear API boundaries
- Version-controlled dependencies

### 2. Interface-Driven

Every major component defines an **abstract interface** (ABC):

- `EmbeddingService` - All embedding adapters implement this
- `IndexStore` - All vector stores implement this
- `ModelAdapter` - All LLMs implement this

**Benefits:**
- Easy to swap implementations
- Duck-typing for flexibility
- Clear contracts for testing
- Future-proof architecture

### 3. Configuration Hierarchy

```
Runtime overrides  (highest priority)
    ↓
Environment vars   (LLAMA_RAG_*)
    ↓
YAML config        (config/defaults.yaml)
    ↓
Code defaults      (lowest priority)
```

## Component Architecture

### DocumentPipeline

**Purpose**: Orchestrate document processing from raw files to structured Doc objects.

```
Raw Files → Load → Chunk → Count Tokens → Dedupe → Doc Objects
```

**Key Design Decisions:**

1. **Stateless Operations**: Each stage is a pure function
2. **Lazy Evaluation**: Only loads files when needed
3. **Streaming Support**: Can process large corpora incrementally
4. **Hook System**: Inject custom logic at each stage

**Data Flow:**

```python
sources (List[Path])
    ↓
_load_sources() → List[Dict] (text + metadata)
    ↓
_chunk_documents() → List[Dict] (chunks with metadata)
    ↓
_count_tokens() → List[Dict] (add token counts)
    ↓
_deduplicate_exact() → List[Dict] (remove duplicates)
    ↓
_create_docs() → List[Doc] (structured objects)
```

### EmbeddingService

**Purpose**: Convert text to dense vector representations.

**Interface:**
```python
class EmbeddingService(ABC):
    def embed_texts(texts: List[str]) -> np.ndarray
    def get_embedding_dim() -> int
```

**Implementations:**

1. **HFEmbeddingAdapter** (Local)
   - Uses sentence-transformers
   - Caches model in memory
   - GPU acceleration when available
   - Batch processing for efficiency

2. **OpenAIEmbeddingAdapter** (Remote)
   - Calls OpenAI API
   - Handles rate limiting
   - Cost tracking
   - Retry logic

3. **RemoteEmbeddingAdapter** (Custom)
   - Generic HTTP client
   - Configurable endpoints
   - Works with Ollama, vLLM, etc.

**Why Multiple Adapters?**
- Development: Use free local models
- Production: Scale with cloud APIs
- Privacy: Keep sensitive data on-premise

### IndexStore

**Purpose**: Fast similarity search over high-dimensional vectors.

**Interface:**
```python
class IndexStore(ABC):
    def add(vectors, doc_ids, metadata?)
    def search(query_vector, k) -> List[Tuple[doc_id, score]]
    def persist(path)
    def load(path)
    def size() -> int
```

**Implementations:**

1. **FaissIndexStore** (Production)
   - FAISS for fast similarity search
   - Supports exact and approximate search
   - CPU and GPU acceleration
   - Quantization for memory efficiency

2. **InMemoryIndexStore** (Development)
   - Simple brute-force search
   - No external dependencies
   - Good for testing
   - Limited to small datasets (<10k)

**Search Metrics:**
- **Cosine**: Best for normalized embeddings
- **L2**: Euclidean distance
- **Inner Product**: For un-normalized vectors

### ModelAdapter

**Purpose**: Generate text from prompts with optional context.

**Interface:**
```python
class ModelAdapter(ABC):
    def generate(prompt, max_tokens, temperature, ...) -> str
    def count_tokens(text) -> int
```

**Implementations:**

1. **LlamaCppAdapter** (Local CPU/GPU)
   - Uses llama.cpp for efficient inference
   - Quantized models (Q4, Q5, Q8)
   - Metal/CUDA acceleration
   - Low memory footprint

2. **OpenAIAdapter** (Cloud)
   - GPT-3.5, GPT-4
   - Reliable and fast
   - Pay-per-token
   - No local setup needed

3. **RemoteAdapter** (Self-hosted)
   - Ollama, vLLM, TGI
   - Custom endpoints
   - Full control
   - Cost-effective at scale

### Retriever

**Purpose**: Orchestrate the complete retrieval workflow.

**Architecture:**

```
Query (string)
    ↓
[Query Preprocessor Hook] ← Optional
    ↓
Embed Query (via EmbeddingService)
    ↓
Search Index (via IndexStore)
    ↓
Fetch Full Docs (from doc_store)
    ↓
[Result Filter Hook] ← Optional
    ↓
[Reranker Hook] ← Optional
    ↓
Apply min_score threshold
    ↓
Return top-k results
```

**Hook System:**

```python
retriever.set_query_preprocessor(lambda q: q.lower())
retriever.set_result_filter(lambda rs: [r for r in rs if r.score > 0.8])
retriever.set_reranker(custom_rerank_function)
retriever.set_prompt_assembler(custom_prompt_builder)
```

**Why Hooks?**
- Extensibility without modifying core code
- Easy A/B testing
- Custom business logic
- Gradual enhancement

## Data Models

### Doc

**Core document model used throughout the system.**

```python
@dataclass
class Doc:
    text: str                    # Document content
    id: str                      # Unique identifier
    metadata: Dict[str, Any]     # Arbitrary metadata
    tokens: Optional[int]        # Token count
    checksum: str                # SHA256 hash
    embedding: Optional[Any]     # Vector (added later)
```

**Design Decisions:**

1. **Immutable**: Use `replace()` to modify (dataclass feature)
2. **Serializable**: `to_dict()`, `from_dict()`, `to_json()`, `from_json()`
3. **Self-describing**: Includes all necessary metadata
4. **Deterministic IDs**: Generated from content hash

**Lifecycle:**

```
Creation → Pipeline Processing → Embedding → Indexing → Retrieval
```

### RetrievalResult

**Wrapper for search results with metadata.**

```python
@dataclass
class RetrievalResult:
    doc: Doc           # Retrieved document
    score: float       # Similarity score
    rank: int          # Result rank (1-indexed)
    metadata: Dict     # Additional context
```

## Configuration System

### Loading Priority

1. **Hardcoded defaults** in code
2. **YAML file** (config/defaults.yaml)
3. **Environment variables** (LLAMA_RAG_*)
4. **Runtime overrides** (function kwargs)

### Implementation

```python
# config.py
class Config(BaseModel):
    chunking: ChunkingConfig
    embedding: EmbeddingConfig
    model: ModelConfig
    # ...

# Singleton pattern
_config = None

def get_config(reload=False) -> Config:
    global _config
    if _config is None or reload:
        _config = load_and_merge_config()
    return _config
```

### Why Pydantic?

- Type validation
- Environment variable parsing
- Nested config structures
- Clear error messages
- JSON schema generation

## Error Handling Strategy

### Fail Fast

```python
def create_doc_array(sources):
    if not sources:
        raise ValueError("sources cannot be empty")
    
    for source in sources:
        if not Path(source).exists():
            raise FileNotFoundError(f"Source not found: {source}")
```

### Graceful Degradation

```python
# Continue processing even if some files fail
for file_path in files:
    try:
        text = load_file(file_path)
        docs.append(process(text))
    except Exception as e:
        logger.error(f"Failed to load {file_path}: {e}")
        # Continue with next file
```

### Structured Logging

```python
logger.info("Processing started", extra={
    "num_sources": len(sources),
    "chunk_size": chunk_size,
    "timestamp": datetime.utcnow().isoformat()
})
```

## Testing Strategy

### Test Pyramid

```
       /\
      /  \    Integration Tests (Few)
     /    \   - End-to-end workflows
    /______\  - Mocked external services
   /        \
  /          \ Unit Tests (Many)
 /            \ - Individual functions
/______________\ - Pure logic
```

### Mock Strategy

**Mock External Services:**
```python
class MockEmbeddingService(EmbeddingService):
    def embed_texts(self, texts):
        # Deterministic embeddings for testing
        return np.array([hash_to_vector(t) for t in texts])
```

**Use Real Implementations:**
- Doc model
- Retriever orchestration
- Configuration loading

### Interface Tests

**Verify all adapters implement required methods:**

```python
def test_adapter_implements_interface():
    adapter = HFEmbeddingAdapter()
    assert isinstance(adapter, EmbeddingService)
    assert hasattr(adapter, 'embed_texts')
    assert callable(adapter.embed_texts)
```

## Performance Considerations

### Embedding Generation

**Bottleneck:** Model inference

**Optimizations:**
- Batch processing (32-128 texts)
- GPU acceleration (10-100x speedup)
- Model caching (load once)
- Quantization (faster inference)

### Vector Search

**Bottleneck:** Distance computation

**Optimizations:**
- FAISS IVF for approximate search
- GPU for parallel distance computation
- Dimension reduction (PCA if needed)
- Quantization (product quantization)

### Document Processing

**Bottleneck:** File I/O

**Optimizations:**
- Parallel file reading
- Stream processing for large files
- Skip binary files early
- Memory-mapped file access

## Security Architecture

### Secrets Management

```
API Keys → Environment Variables → Secret Manager
                ↓
        Application Config
                ↓
        Adapter Initialization
```

**Never:**
- Hardcode secrets
- Log secrets
- Commit .env files
- Pass secrets in URLs

### Input Validation

**Sanitize all user inputs:**

```python
@app.post("/query")
def query(request: QueryRequest):
    # Pydantic validation
    if len(request.query) > 10000:
        raise HTTPException(400, "Query too long")
    
    # Sanitize
    query = request.query.strip()
```

### Rate Limiting

**Protect endpoints:**

```python
# Add rate limiting middleware
app.add_middleware(
    RateLimitMiddleware,
    calls=100,
    period=60  # 100 calls per minute
)
```

## Scalability Path

### Phase 1: Single Machine (Current)

```
Application ← In-memory index ← Local embedder
```

**Suitable for:** <100k documents

### Phase 2: Distributed Components

```
Application → Redis Cache
    ↓
Remote Embedder (GPU cluster)
    ↓
FAISS on large memory machine
```

**Suitable for:** 100k-1M documents

### Phase 3: Microservices

```
Frontend → API Gateway
    ↓
Load Balancer
    ↓
Application Cluster (auto-scaling)
    ↓
Managed Vector DB (Pinecone, Weaviate)
    ↓
Distributed Embedder
```

**Suitable for:** >1M documents, high QPS

## Future Enhancements

### Hybrid Search

Combine vector similarity with keyword search (BM25):

```python
vector_results = index.search(query_vector, k=100)
keyword_results = bm25.search(query, k=100)
combined = reciprocal_rank_fusion(vector_results, keyword_results)
```

### Reranking

Use cross-encoder for better relevance:

```python
initial_results = retriever.retrieve(query, k=100)
reranked = cross_encoder.rerank(query, initial_results)
final_results = reranked[:10]
```

### Multi-modal Support

Index images, tables, and code:

```python
class MultiModalDoc(Doc):
    image_embedding: Optional[np.ndarray]
    code_embedding: Optional[np.ndarray]
    table_data: Optional[Dict]
```

### Conversation History

Maintain context across turns:

```python
class ConversationalRetriever(Retriever):
    def retrieve_with_history(
        self,
        query: str,
        history: List[Message],
        k: int = 10
    ) -> List[RetrievalResult]:
        # Rewrite query based on history
        # Retrieve with context
        # Return results
```

## Conclusion

This architecture provides:

1. **Flexibility**: Easy to swap components
2. **Testability**: Clear interfaces and mocks
3. **Scalability**: Path from prototype to production
4. **Maintainability**: Separation of concerns
5. **Reusability**: Library extraction ready

The key is **progressive enhancement**: Start simple, add complexity as needed.
