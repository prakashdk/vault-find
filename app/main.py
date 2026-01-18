import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from llama_rag import RAGService
from pydantic import ValidationError

from .models import ApiMessage, Entity, EntityBase, FolderWithEntities, QueryResponse, VaultExport
from .repository import EntityRepository
from .services import EntityService

DATA_DIR = Path("data")
ENTITIES_PATH = DATA_DIR / "entities.json"
INDEX_PATH = DATA_DIR / "index"

templates = Jinja2Templates(directory="templates")

rag_service = RAGService(index_path=INDEX_PATH, auto_load=True, auto_save=True)
repository = EntityRepository(ENTITIES_PATH)
entity_service = EntityService(repository, rag_service)
entity_service.bootstrap_index()

app = FastAPI(title="Vault Find", version="0.1.0")
app.mount("/static", StaticFiles(directory="static"), name="static")


def get_entity_service() -> EntityService:
    return entity_service


@app.get("/health", response_model=ApiMessage)
async def health_check() -> ApiMessage:
    return ApiMessage(detail="ok")


@app.get("/", response_class=HTMLResponse)
async def home(
    request: Request,
    service: EntityService = Depends(get_entity_service),
) -> HTMLResponse:
    context = _build_page_context(request, service)
    return templates.TemplateResponse("index.html", context)


@app.post("/entities", response_class=HTMLResponse)
async def create_entity_form(
    request: Request,
    title: str = Form(...),
    description: str = Form(...),
    data_type: str = Form(...),
    data: str = Form(...),
    folder_name: str = Form(...),
    service: EntityService = Depends(get_entity_service),
) -> RedirectResponse:
    payload = EntityBase(
        title=title,
        description=description,
        data_type=data_type,
        data=data,
        folder_name=folder_name,
    )
    try:
        service.create_entity(payload)
    except Exception as exc:  # pragma: no cover - surfaced via UI
        context = _build_page_context(
            request,
            service,
            error_message=f"Failed to save entity: {exc}",
        )
        return templates.TemplateResponse("index.html", context, status_code=status.HTTP_400_BAD_REQUEST)
    return RedirectResponse(url=str(request.url_for("home")), status_code=status.HTTP_303_SEE_OTHER)


@app.post("/query", response_class=HTMLResponse)
async def query_form(
    request: Request,
    question: str = Form(...),
    service: EntityService = Depends(get_entity_service),
) -> HTMLResponse:
    try:
        matches = service.search_entities(question)
    except Exception as exc:  # pragma: no cover - surfaced via UI
        context = _build_page_context(
            request,
            service,
            error_message=f"Query failed: {exc}",
        )
        return templates.TemplateResponse("index.html", context, status_code=status.HTTP_400_BAD_REQUEST)
    context = _build_page_context(
        request,
        service,
        query_result=QueryResponse(question=question, matches=matches),
    )
    return templates.TemplateResponse("index.html", context)


@app.get("/export")
async def download_vault(service: EntityService = Depends(get_entity_service)) -> JSONResponse:
    payload = service.export_vault()
    filename = f"vault-export-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.json"
    return JSONResponse(
        content=payload.model_dump(mode="json"),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/import", response_class=HTMLResponse)
async def import_vault_form(
    request: Request,
    file: UploadFile = File(...),
    service: EntityService = Depends(get_entity_service),
) -> HTMLResponse:
    raw = await file.read()
    try:
        data = json.loads(raw)
        payload = VaultExport.model_validate(data)
    except (json.JSONDecodeError, ValidationError) as exc:
        context = _build_page_context(
            request,
            service,
            error_message=f"Invalid import file: {exc}",
        )
        return templates.TemplateResponse("index.html", context, status_code=status.HTTP_400_BAD_REQUEST)

    try:
        service.import_vault(payload)
    except Exception as exc:  # pragma: no cover
        context = _build_page_context(
            request,
            service,
            error_message=f"Import failed: {exc}",
        )
        return templates.TemplateResponse("index.html", context, status_code=status.HTTP_400_BAD_REQUEST)

    context = _build_page_context(
        request,
        service,
        success_message="Vault imported successfully.",
    )
    return templates.TemplateResponse("index.html", context)


@app.get("/api/entities", response_model=List[Entity])
async def list_entities(service: EntityService = Depends(get_entity_service)) -> List[Entity]:
    return service.list_entities()


@app.post("/api/entities", response_model=Entity, status_code=status.HTTP_201_CREATED)
async def create_entity(
    entity: EntityBase,
    service: EntityService = Depends(get_entity_service),
) -> Entity:
    try:
        return service.create_entity(entity)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to save entity: {exc}") from exc


@app.get("/api/query", response_model=QueryResponse)
async def query_api(
    question: str,
    service: EntityService = Depends(get_entity_service),
) -> QueryResponse:
    try:
        matches = service.search_entities(question)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Query failed: {exc}") from exc
    return QueryResponse(question=question, matches=matches)


@app.get("/api/export", response_model=VaultExport)
async def export_api(service: EntityService = Depends(get_entity_service)) -> VaultExport:
    return service.export_vault()


@app.post("/api/import", response_model=ApiMessage)
async def import_api(
    payload: VaultExport,
    service: EntityService = Depends(get_entity_service),
) -> ApiMessage:
    try:
        service.import_vault(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Import failed: {exc}") from exc
    return ApiMessage(detail="Import completed")


@app.get("/api/entities/{entity_id}", response_model=Entity)
async def get_entity_api(
    entity_id: str,
    service: EntityService = Depends(get_entity_service),
) -> Entity:
    try:
        return service.get_entity(entity_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/entities/{entity_id}", response_model=ApiMessage)
async def delete_entity_api(
    entity_id: str,
    service: EntityService = Depends(get_entity_service),
) -> ApiMessage:
    try:
        service.delete_entity(entity_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ApiMessage(detail="Entity deleted")


def _ui_context(
    request: Request,
    entities: List[Entity],
    folders: List[FolderWithEntities],
    *,
    query_result: Optional[QueryResponse] = None,
    error_message: Optional[str] = None,
    success_message: Optional[str] = None,
) -> Dict:
    return {
        "request": request,
        "entities": entities,
        "query_result": query_result,
        "error_message": error_message,
        "success_message": success_message,
        "folders": folders,
        "folder_names": [folder.name for folder in folders],
        "entities_payload": _entities_payload(entities),
    }


def _build_page_context(
    request: Request,
    service: EntityService,
    *,
    query_result: Optional[QueryResponse] = None,
    error_message: Optional[str] = None,
    success_message: Optional[str] = None,
) -> Dict:
    folders = service.list_folders()
    entities: List[Entity] = [entity for folder in folders for entity in folder.entities]
    return _ui_context(
        request,
        entities,
        folders,
        query_result=query_result,
        error_message=error_message,
        success_message=success_message,
    )


def _entities_payload(entities: List[Entity]) -> str:
    payload = {
        entity.id: entity.model_dump(mode="json")
        for entity in entities
    }
    return json.dumps(payload)
