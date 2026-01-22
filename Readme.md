## llama_rag Library

Use the test PyPI release channel when installing the custom retrieval library:

```bash
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ --upgrade --no-cache-dir llama_rag_lib==0.2.0
```

The primary index points to TestPyPI so we can pick up pre-release builds, while `--extra-index-url` falls back to PyPI for transitive dependencies. Run this command inside your virtual environment before starting the FastAPI app.

