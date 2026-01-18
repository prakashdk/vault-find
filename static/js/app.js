document.addEventListener("DOMContentLoaded", () => {
  const entityData = window.__VAULT_ENTITIES__ || {};

  // Create modal references
  const createModal = document.getElementById("entity-modal");
  const createOverlay = document.getElementById("entity-modal-overlay");
  const openCreateBtn = document.getElementById("open-entity-modal");
  const closeCreateBtn = document.getElementById("close-entity-modal");
  const closeCreateSecondaryBtn = document.getElementById("close-entity-modal-secondary");

  // Detail modal references
  const detailModal = document.getElementById("entity-detail-modal");
  const detailOverlay = document.getElementById("entity-detail-overlay");
  const closeDetailBtn = document.getElementById("close-entity-detail-modal");
  const copyDataBtn = document.getElementById("copy-entity-data");
  const copyFeedback = document.getElementById("copy-feedback");
  const deleteEntityBtn = document.getElementById("delete-entity-button");
  let activeEntityId = null;

  const detailFieldMap = {};
  document.querySelectorAll("[data-entity-field]").forEach((el) => {
    detailFieldMap[el.dataset.entityField] = el;
  });

  const importTrigger = document.getElementById("import-trigger");
  const importFileInput = document.getElementById("import-file");
  const importForm = document.getElementById("import-form");
  const copySchemaButton = document.getElementById("copy-schema-button");
  const schemaTemplate = document.getElementById("vault-schema-template");

  function modalVisible(modalEl) {
    return modalEl && !modalEl.classList.contains("hidden");
  }

  function syncBodyScrollLock() {
    const shouldLock = modalVisible(createModal) || modalVisible(detailModal);
    document.body.classList.toggle("modal-open", shouldLock);
  }

  function openCreateModal() {
    if (!createModal) return;
    createModal.classList.remove("hidden");
    syncBodyScrollLock();
  }

  function closeCreateModal() {
    if (!createModal) return;
    createModal.classList.add("hidden");
    syncBodyScrollLock();
  }

  function showDetailModal(entity) {
    if (!detailModal || !entity) return;
    activeEntityId = entity.id;
    populateDetail(entity);
    detailModal.classList.remove("hidden");
    syncBodyScrollLock();
  }

  function openDetailModal(entityId) {
    if (!detailModal) return;
    const entity = entityData[entityId];
    if (entity) {
      showDetailModal(entity);
      return;
    }
    fetchEntityById(entityId)
      .then(showDetailModal)
      .catch((error) => {
        console.error("Failed to load entity", error); // eslint-disable-line no-console
      });
  }

  async function fetchEntityById(entityId) {
    const response = await fetch(`/api/entities/${entityId}`);
    if (!response.ok) {
      throw new Error(`Entity ${entityId} not found`);
    }
    const entity = await response.json();
    entityData[entityId] = entity;
    return entity;
  }

  function closeDetailModal() {
    if (!detailModal) return;
    detailModal.classList.add("hidden");
    activeEntityId = null;
    syncBodyScrollLock();
  }

  function populateDetail(entity) {
    const formatDate = (value) => {
      try {
        return new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value));
      } catch (error) {
        return value;
      }
    };

    Object.entries(detailFieldMap).forEach(([field, element]) => {
      if (!element) return;
      let value = entity[field] ?? "";
      if (field === "created_at") {
        value = entity[field] ? formatDate(entity[field]) : "";
      }
      element.textContent = value;
    });
    if (copyFeedback) {
      copyFeedback.classList.add("hidden");
    }
  }

  openCreateBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    openCreateModal();
  });

  closeCreateBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    closeCreateModal();
  });

  closeCreateSecondaryBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    closeCreateModal();
  });

  createOverlay?.addEventListener("click", (event) => {
    if (event.target === createOverlay) {
      closeCreateModal();
    }
  });

  closeDetailBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    closeDetailModal();
  });

  detailOverlay?.addEventListener("click", (event) => {
    if (event.target === detailOverlay) {
      closeDetailModal();
    }
  });

  copyDataBtn?.addEventListener("click", async () => {
    const dataField = detailFieldMap["data"];
    if (!dataField || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(dataField.textContent || "");
      if (copyFeedback) {
        copyFeedback.classList.remove("hidden");
        setTimeout(() => copyFeedback.classList.add("hidden"), 1600);
      }
    } catch (error) {
      console.error("Failed to copy", error); // eslint-disable-line no-console
    }
  });

  deleteEntityBtn?.addEventListener("click", async () => {
    if (!activeEntityId) return;
    const confirmed = window.confirm("Delete this entity permanently?");
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/entities/${activeEntityId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const message = error.detail || "Failed to delete entity";
        alert(message);
        return;
      }
      alert("Entity deleted");
      window.location.reload();
    } catch (error) {
      console.error("Failed to delete entity", error); // eslint-disable-line no-console
      alert("Failed to delete entity");
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCreateModal();
      closeDetailModal();
    }
  });

  function attachLoader(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener("submit", () => {
      const button = form.querySelector("[data-loading-btn]");
      if (!button) return;
      const defaultLabel = button.querySelector("[data-loading-default]");
      const spinnerLabel = button.querySelector("[data-loading-spinner]");
      button.setAttribute("disabled", "disabled");
      button.classList.add("opacity-80");
      defaultLabel?.classList.add("hidden");
      spinnerLabel?.classList.remove("hidden");
    });
  }

  attachLoader("query-form");
  attachLoader("entity-form");

  const queryForm = document.getElementById("query-form");
  const questionInput = document.getElementById("question");
  questionInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      queryForm?.requestSubmit();
    }
  });

  document.querySelectorAll("[data-folder-toggle]").forEach((button) => {
    const targetId = button.dataset.target;
    const icon = button.querySelector("[data-folder-icon]");
    const target = document.getElementById(targetId);
    button.addEventListener("click", () => {
      if (!target) return;
      target.classList.toggle("hidden");
      const expanded = !target.classList.contains("hidden");
      button.setAttribute("aria-expanded", String(expanded));
      icon?.classList.toggle("rotate-90", expanded);
    });
  });

  document.querySelectorAll("[data-entity-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const { entityId } = button.dataset;
      if (entityId) {
        openDetailModal(entityId);
      }
    });
  });

  document.querySelectorAll("[data-match-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const { entityId } = button.dataset;
      if (entityId) {
        openDetailModal(entityId);
      }
    });
  });

  importTrigger?.addEventListener("click", (event) => {
    event.preventDefault();
    importFileInput?.click();
  });

  importFileInput?.addEventListener("change", () => {
    if (importFileInput.files?.length) {
      importForm?.submit();
    }
  });

  copySchemaButton?.addEventListener("click", async () => {
    if (!schemaTemplate?.textContent) return;
    try {
      await navigator.clipboard.writeText(schemaTemplate.textContent.trim());
      copySchemaButton.classList.add("bg-white/10");
      copySchemaButton.textContent = "Schema Copied";
      setTimeout(() => {
        copySchemaButton.classList.remove("bg-white/10");
        copySchemaButton.textContent = "Copy Schema";
      }, 1600);
    } catch (error) {
      console.error("Failed to copy schema", error); // eslint-disable-line no-console
    }
  });
});
