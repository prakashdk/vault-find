# Configuration Reference

Complete reference for all configuration options in the LLaMA RAG Starter Kit.

## Configuration Sources

### 1. YAML File (config/defaults.yaml)

Default configuration shipped with the project:

```yaml
# config/defaults.yaml
tokenizer: default
persist_intermediate: false

chunking:
  chunk_size: 512
  overlap: 64
  strategy: tokens
  max_tokens_per_doc: 4096

dedupe:
  exact: true
  fuzzy: false
  fuzzy_threshold: 0.95

embedding:
  model: all-MiniLM-L6-v2
  batch_size: 32
  normalize: true

index:
  type: faiss
  metric: cosine
  persist_path: ./data/index

model:
  type: llamacpp
  model_path: ""
  api_base_url: ""
  max_tokens: 512
  temperature: 0.7
  top_p: 0.9

retrieval:
  k: 10
  min_score: 0.0
  rerank: false
  format: numbered

server:
  host: 0.0.0.0
  port: 8000
  reload: false
  workers: 1
```

### 2. Environment Variables

Override any setting with `LLAMA_RAG_` prefix:

```bash
export LLAMA_RAG_EMBEDDING_MODEL="all-mpnet-base-v2"
export LLAMA_RAG_MODEL_PATH="/path/to/model.gguf"
export LLAMA_RAG_INDEX_PERSIST_PATH="./production/index"
```

**Naming Convention:**
- Prefix: `LLAMA_RAG_`
- Nested keys: Use underscore (e.g., `EMBEDDING_MODEL` for `embedding.model`)
- Case insensitive

### 3. Runtime Overrides

Override per function call:

```python
docs = pipeline.create_doc_array(
    sources=["data/"],
    chunk_size=1024,  # Override for this call only
    overlap=128
)
```

## Configuration Options

### Top-Level Options

#### tokenizer

**Type:** `string`  
**Default:** `"default"`  
**Options:** `"default"`, `"tiktoken"`, `"custom"`

Token counting method for chunking.

- `default`: Heuristic (4 chars per token)
- `tiktoken`: OpenAI's tokenizer (requires installation)
- `custom`: Bring your own tokenizer

**Example:**
```yaml
tokenizer: tiktoken
```

```bash
export LLAMA_RAG_TOKENIZER="tiktoken"
```

#### persist_intermediate

**Type:** `boolean`  
**Default:** `false`

Save intermediate pipeline outputs to disk.

**Use cases:**
- Debugging pipeline issues
- Resumable processing
- Audit trail

**Example:**
```yaml
persist_intermediate: true
```

**Output location:** Controlled by `output_path` parameter.

---

### Chunking Configuration

Control how documents are split into chunks.

#### chunking.chunk_size

**Type:** `integer`  
**Default:** `512`  
**Range:** `1` - `8192`

Target size for each chunk in tokens.

**Guidelines:**
- **128-256**: Very small, for precise retrieval
- **512**: Default, good balance
- **1024-2048**: Larger context, may lose precision
- **>2048**: Full documents, minimal chunking

**Example:**
```yaml
chunking:
  chunk_size: 1024
```

#### chunking.overlap

**Type:** `integer`  
**Default:** `64`  
**Range:** `0` - `chunk_size`

Number of tokens to overlap between consecutive chunks.

**Why overlap?**
- Prevents information loss at boundaries
- Improves retrieval recall
- Trade-off: More chunks, larger index

**Recommended:** 10-20% of chunk_size

**Example:**
```yaml
chunking:
  overlap: 128  # For chunk_size=1024
```

#### chunking.strategy

**Type:** `string`  
**Default:** `"tokens"`  
**Options:** `"tokens"`, `"sentences"`, `"paragraphs"`

How to split documents.

- **tokens**: Split by token count (implemented)
- **sentences**: Split on sentence boundaries (TODO)
- **paragraphs**: Split on paragraph breaks (TODO)

**Example:**
```yaml
chunking:
  strategy: tokens
```

#### chunking.max_tokens_per_doc

**Type:** `integer`  
**Default:** `4096`

Maximum tokens per document. Documents exceeding this are split.

**Use cases:**
- Prevent memory issues
- Enforce processing limits
- Skip very large files

**Example:**
```yaml
chunking:
  max_tokens_per_doc: 8192
```

---

### Deduplication Configuration

Remove duplicate content from the index.

#### dedupe.exact

**Type:** `boolean`  
**Default:** `true`

Enable exact deduplication using SHA256 checksums.

**Recommended:** Always enabled

**Example:**
```yaml
dedupe:
  exact: true
```

#### dedupe.fuzzy

**Type:** `boolean`  
**Default:** `false`

Enable fuzzy deduplication using similarity matching.

**Status:** Not yet implemented

**Use cases:**
- Near-duplicate detection
- Paraphrased content
- Multiple sources

#### dedupe.fuzzy_threshold

**Type:** `float`  
**Default:** `0.95`  
**Range:** `0.0` - `1.0`

Similarity threshold for fuzzy deduplication.

**Higher values:** More strict (only very similar content)  
**Lower values:** Less strict (more aggressive deduplication)

---

### Embedding Configuration

Configure embedding model and generation.

#### embedding.model

**Type:** `string`  
**Default:** `"all-MiniLM-L6-v2"`

Sentence transformer model name from HuggingFace.

**Recommended models:**

| Model | Dimensions | Speed | Quality |
|-------|-----------|-------|---------|
| all-MiniLM-L6-v2 | 384 | Fast | Good |
| all-mpnet-base-v2 | 768 | Medium | Better |
| multi-qa-mpnet-base-dot-v1 | 768 | Medium | Best for Q&A |

**Example:**
```yaml
embedding:
  model: all-mpnet-base-v2
```

```bash
export LLAMA_RAG_EMBEDDING_MODEL="all-mpnet-base-v2"
```

#### embedding.batch_size

**Type:** `integer`  
**Default:** `32`  
**Range:** `1` - `256`

Number of texts to embed in one batch.

**Guidelines:**
- **CPU**: 16-32
- **GPU**: 64-128
- **Memory constrained**: 8-16

**Trade-off:** Larger batches are faster but use more memory.

**Example:**
```yaml
embedding:
  batch_size: 64
```

#### embedding.normalize

**Type:** `boolean`  
**Default:** `true`

Normalize embeddings to unit length.

**Recommended:** `true` when using cosine similarity

**Example:**
```yaml
embedding:
  normalize: true
```

---

### Index Configuration

Vector index storage and search settings.

#### index.type

**Type:** `string`  
**Default:** `"faiss"`  
**Options:** `"faiss"`, `"annoy"`, `"hnswlib"` (only faiss/inmemory implemented)

Vector index backend.

**Comparison:**

| Backend | Speed | Memory | GPU | Production Ready |
|---------|-------|--------|-----|------------------|
| FAISS | Fast | Medium | Yes | ✅ Yes |
| Annoy | Fast | Low | No | ⚠️ Read-only |
| HNSWLIB | Fastest | Medium | No | ✅ Yes |

**Example:**
```yaml
index:
  type: faiss
```

#### index.metric

**Type:** `string`  
**Default:** `"cosine"`  
**Options:** `"cosine"`, `"l2"`, `"inner_product"`

Distance metric for similarity search.

- **cosine**: Best for normalized embeddings (recommended)
- **l2**: Euclidean distance
- **inner_product**: For un-normalized vectors

**Example:**
```yaml
index:
  metric: cosine
```

#### index.persist_path

**Type:** `string`  
**Default:** `"./data/index"`

Directory path for saving/loading index.

**Example:**
```yaml
index:
  persist_path: /var/lib/rag/index
```

```bash
export LLAMA_RAG_INDEX_PERSIST_PATH="/var/lib/rag/index"
```

---

### Model Configuration

LLM settings for text generation.

#### model.type

**Type:** `string`  
**Default:** `"llamacpp"`  
**Options:** `"llamacpp"`, `"openai"`, `"remote"`

Model adapter type.

**Comparison:**

| Type | Cost | Latency | Privacy | Setup |
|------|------|---------|---------|-------|
| llamacpp | Free | Medium | Full | Complex |
| openai | $$ | Low | None | Simple |
| remote | Varies | Varies | Partial | Medium |

**Example:**
```yaml
model:
  type: openai
```

```bash
export LLAMA_RAG_MODEL_TYPE="openai"
```

#### model.model_path

**Type:** `string`  
**Default:** `""`

Path to local model file (for llamacpp).

**Example:**
```yaml
model:
  model_path: /models/llama-2-7b-chat.Q4_K_M.gguf
```

```bash
export LLAMA_RAG_MODEL_PATH="/models/llama-2-7b-chat.Q4_K_M.gguf"
```

#### model.api_base_url

**Type:** `string`  
**Default:** `""`

Base URL for remote model API (openai, remote types).

**Example:**
```yaml
model:
  api_base_url: http://localhost:11434  # Ollama
```

```bash
export LLAMA_RAG_MODEL_API_BASE_URL="http://localhost:11434"
```

#### model.max_tokens

**Type:** `integer`  
**Default:** `512`  
**Range:** `1` - `4096`

Maximum tokens to generate.

**Guidelines:**
- **50-100**: Short answers
- **256-512**: Paragraph responses (default)
- **1024+**: Long-form content

**Example:**
```yaml
model:
  max_tokens: 256
```

#### model.temperature

**Type:** `float`  
**Default:** `0.7`  
**Range:** `0.0` - `2.0`

Sampling temperature for generation.

**Guidelines:**
- **0.0**: Deterministic, factual
- **0.7**: Balanced (default)
- **1.0+**: Creative, varied

**Example:**
```yaml
model:
  temperature: 0.3  # More deterministic for Q&A
```

#### model.top_p

**Type:** `float`  
**Default:** `0.9`  
**Range:** `0.0` - `1.0`

Nucleus sampling parameter.

**Lower values:** More focused, conservative  
**Higher values:** More diverse

**Example:**
```yaml
model:
  top_p: 0.95
```

---

### Retrieval Configuration

Control retrieval behavior.

#### retrieval.k

**Type:** `integer`  
**Default:** `10`  
**Range:** `1` - `100`

Number of documents to retrieve.

**Guidelines:**
- **3-5**: Focused context, faster generation
- **10**: Default balance
- **20+**: Comprehensive context, may include noise

**Example:**
```yaml
retrieval:
  k: 5
```

#### retrieval.min_score

**Type:** `float`  
**Default:** `0.0`  
**Range:** `0.0` - `1.0`

Minimum similarity score threshold.

**Guidelines:**
- **0.0**: No filtering (default)
- **0.5**: Somewhat relevant
- **0.7+**: Highly relevant only

**Example:**
```yaml
retrieval:
  min_score: 0.7
```

#### retrieval.rerank

**Type:** `boolean`  
**Default:** `false`

Enable reranking of results.

**Status:** Not yet implemented

#### retrieval.format

**Type:** `string`  
**Default:** `"numbered"`  
**Options:** `"context"`, `"numbered"`, `"json"`

How to format retrieved documents.

- **context**: Plain concatenation
- **numbered**: `[1] doc1\n[2] doc2...`
- **json**: JSON array

**Example:**
```yaml
retrieval:
  format: context
```

---

### Server Configuration

FastAPI server settings.

#### server.host

**Type:** `string`  
**Default:** `"0.0.0.0"`

Host to bind the server.

**Options:**
- `0.0.0.0`: All interfaces
- `127.0.0.1`: Localhost only

**Example:**
```yaml
server:
  host: 127.0.0.1  # Development only
```

#### server.port

**Type:** `integer`  
**Default:** `8000`

Port to bind the server.

**Example:**
```yaml
server:
  port: 8080
```

#### server.reload

**Type:** `boolean`  
**Default:** `false`

Enable hot reload for development.

**Warning:** Never use in production

**Example:**
```yaml
server:
  reload: true  # Development only
```

#### server.workers

**Type:** `integer`  
**Default:** `1`

Number of worker processes.

**Guidelines:**
- **1**: Development
- **2-4**: Small production
- **CPU count**: Maximum parallelism

**Note:** Cannot use with `reload=true`

**Example:**
```yaml
server:
  workers: 4
```

---

## Configuration Examples

### Development Setup

```yaml
tokenizer: default
embedding:
  model: all-MiniLM-L6-v2
  batch_size: 16
index:
  type: inmemory
server:
  host: 127.0.0.1
  port: 8000
  reload: true
  workers: 1
```

### Production Setup

```yaml
tokenizer: tiktoken
embedding:
  model: all-mpnet-base-v2
  batch_size: 64
index:
  type: faiss
  metric: cosine
  persist_path: /var/lib/rag/index
model:
  type: openai
  max_tokens: 256
  temperature: 0.3
retrieval:
  k: 5
  min_score: 0.7
server:
  host: 0.0.0.0
  port: 8000
  reload: false
  workers: 4
```

### Privacy-Focused Setup

```yaml
embedding:
  model: all-MiniLM-L6-v2  # Local
model:
  type: llamacpp  # Local
  model_path: /models/llama-2-7b.gguf
index:
  type: faiss
  persist_path: /local/index
```

## Troubleshooting

### Configuration Not Loading

Check file location:
```bash
ls -la config/defaults.yaml
```

### Environment Variables Not Working

Check naming:
```bash
env | grep LLAMA_RAG
```

### Values Not Changing

Check priority:
1. Runtime overrides (highest)
2. Environment variables
3. YAML config
4. Code defaults (lowest)

### Invalid Configuration

Check logs for validation errors:
```
ValidationError: chunking.chunk_size must be positive
```
