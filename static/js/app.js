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
  const detailDataField = detailFieldMap["data"];  // Cache for link behavior
  const linkableDataClasses = ["cursor-pointer", "hover:underline", "underline-offset-4"];

  const importTrigger = document.getElementById("import-trigger");
  const importFileInput = document.getElementById("import-file");
  const importForm = document.getElementById("import-form");
  const copySchemaButton = document.getElementById("copy-schema-button");
  const schemaTemplate = document.getElementById("vault-schema-template");
  const queryForm = document.getElementById("query-form");
  const querySubmitBtn = document.getElementById("query-submit");
  const questionInput = document.getElementById("question");
  const queryResultsContainer = document.getElementById("query-results");
  const entityForm = document.getElementById("entity-form");
  const entityFormSubtitle = document.querySelector("[data-entity-form-subtitle]");
  const entityFormTitle = document.querySelector("[data-entity-form-title]");
  const entityFormSubmitBtn = entityForm?.querySelector("[data-entity-form-submit]");
  const entityFormDefaultLabel = entityFormSubmitBtn?.querySelector("[data-loading-default]");
  const entityFormSpinnerText = entityFormSubmitBtn?.querySelector("[data-loading-spinner-text]");
  const editEntityBtn = document.getElementById("edit-entity-button");
  const titleInput = document.getElementById("title");
  const descriptionInput = document.getElementById("description");
  const folderInput = document.getElementById("folder_name");
  const dataTypeSelect = document.getElementById("data_type");
  const dataInput = document.getElementById("data");
  const themeToggleBtn = document.getElementById("theme-toggle");
  const themeLabel = themeToggleBtn?.querySelector("[data-theme-label]");
  const themeIconLight = themeToggleBtn?.querySelector("[data-icon-light]");
  const themeIconDark = themeToggleBtn?.querySelector("[data-icon-dark]");
  let entityFormMode = "create";
  let currentTheme = "dark";
  initializeTheme();

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
    resetEntityFormMode();
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

    configureDataFieldLink(entity);
  }

  function configureDataFieldLink(entity) {
    if (!detailDataField) return;
    const isLink = entity.data_type === "link" && entity.data;
    linkableDataClasses.forEach((cls) => detailDataField.classList.toggle(cls, isLink));
    if (isLink) {
      detailDataField.dataset.linkHref = entity.data;
      detailDataField.setAttribute("role", "link");
      detailDataField.setAttribute("tabindex", "0");
    } else {
      detailDataField.dataset.linkHref = "";
      detailDataField.removeAttribute("role");
      detailDataField.removeAttribute("tabindex");
    }
  }

  detailDataField?.addEventListener("click", () => {
    const href = detailDataField.dataset.linkHref;
    if (!href) return;
    window.open(href, "_blank", "noopener");
  });

  detailDataField?.addEventListener("keydown", (event) => {
    const href = detailDataField.dataset.linkHref;
    if (!href) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      window.open(href, "_blank", "noopener");
    }
  });

  themeToggleBtn?.addEventListener("click", () => {
    setTheme(currentTheme === "light" ? "dark" : "light");
  });

  function initializeTheme() {
    const preferred = getPreferredTheme();
    setTheme(preferred, false);
  }

  function getPreferredTheme() {
    try {
      const stored = localStorage.getItem("vault-theme");
      if (stored === "light" || stored === "dark") {
        return stored;
      }
    } catch (error) {
      console.warn("Unable to access localStorage", error); // eslint-disable-line no-console
    }
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      return "light";
    }
    return "dark";
  }

  function setTheme(theme, persist = true) {
    currentTheme = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = currentTheme;
    if (persist) {
      try {
        localStorage.setItem("vault-theme", currentTheme);
      } catch (error) {
        console.warn("Unable to persist theme", error); // eslint-disable-line no-console
      }
    }
    syncThemeToggle(currentTheme);
  }

  function syncThemeToggle(theme) {
    const isLight = theme === "light";
    themeLabel && (themeLabel.textContent = isLight ? "Light" : "Dark");
    themeIconLight?.classList.toggle("hidden", !isLight);
    themeIconDark?.classList.toggle("hidden", isLight);
  }

  function setEntityFormMode(mode, entity) {
    if (!entityForm) return;
    const isEdit = mode === "edit" && entity;
    entityFormMode = isEdit ? "edit" : "create";

    if (!isEdit) {
      entityForm.setAttribute("action", "/entities");
      entityForm.removeAttribute("data-entity-id");
      entityFormSubtitle && (entityFormSubtitle.textContent = "New Entry");
      entityFormTitle && (entityFormTitle.textContent = "Capture entity data");
      entityFormDefaultLabel && (entityFormDefaultLabel.textContent = "Save Entity");
      entityFormSpinnerText && (entityFormSpinnerText.textContent = "Saving");
      entityForm.reset();
      return;
    }

    entityForm.setAttribute("action", `/entities/${entity.id}`);
    entityForm.dataset.entityId = entity.id;
    entityFormSubtitle && (entityFormSubtitle.textContent = "Edit Entry");
    entityFormTitle && (entityFormTitle.textContent = "Update entity data");
    entityFormDefaultLabel && (entityFormDefaultLabel.textContent = "Update Entity");
    entityFormSpinnerText && (entityFormSpinnerText.textContent = "Updating");
    titleInput && (titleInput.value = entity.title || "");
    descriptionInput && (descriptionInput.value = entity.description || "");
    folderInput && (folderInput.value = entity.folder_name || "");
    dataTypeSelect && (dataTypeSelect.value = entity.data_type || dataTypeSelect.value);
    dataInput && (dataInput.value = entity.data || "");
  }

  function resetEntityFormMode() {
    setEntityFormMode("create");
  }

  async function startEditEntity(entityId) {
    if (!entityId) return;
    try {
      let entity = entityData[entityId];
      if (!entity) {
        entity = await fetchEntityById(entityId);
      }
      if (!entity) return;
      setEntityFormMode("edit", entity);
      closeDetailModal();
      openCreateModal();
    } catch (error) {
      console.error("Failed to load entity for editing", error); // eslint-disable-line no-console
    }
  }

  openCreateBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    resetEntityFormMode();
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

  editEntityBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    if (activeEntityId) {
      startEditEntity(activeEntityId);
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

  attachLoader("entity-form");

  async function handleQuerySubmit() {
    console.log("handleQuerySubmit called"); // eslint-disable-line no-console
    const question = questionInput?.value?.trim();
    console.log("Question:", question); // eslint-disable-line no-console
    if (!question) return;

    if (!querySubmitBtn) return;

    // Show loading state
    querySubmitBtn.setAttribute("disabled", "disabled");
    querySubmitBtn.classList.add("opacity-80");
    querySubmitBtn.querySelector("[data-loading-default]")?.classList.add("hidden");
    querySubmitBtn.querySelector("[data-loading-spinner]")?.classList.remove("hidden");

    try {
      const response = await fetch(`/api/query?question=${encodeURIComponent(question)}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        alert(error.detail || "Query failed");
        return;
      }

      const data = await response.json();
      displayQueryResults(data);
    } catch (error) {
      console.error("Query failed", error); // eslint-disable-line no-console
      alert("Query failed. Please try again.");
    } finally {
      // Reset loading state
      querySubmitBtn.removeAttribute("disabled");
      querySubmitBtn.classList.remove("opacity-80");
      querySubmitBtn.querySelector("[data-loading-default]")?.classList.remove("hidden");
      querySubmitBtn.querySelector("[data-loading-spinner]")?.classList.add("hidden");
    }
  }

  function displayQueryResults(data) {
    if (!queryResultsContainer) return;

    if (data.matches && data.matches.length > 0) {
      const matchesHtml = data.matches
        .map((match) => {
          const type = match.data_type || "note";
          const typeLabel = type === "link" ? "Link entity" : "Secure note entity";
          const iconMarkup = renderDataTypeIcon(type);
          const titleText = escapeHtml(match.title || "");
          const folderText = escapeHtml(match.folder_name || "");
          const ariaLabel = escapeHtml(`Open ${match.title} from ${match.folder_name}`);
          const srLabel = escapeHtml(typeLabel);
          return `
            <button
              type="button"
              class="flex items-center gap-3 rounded-2xl border border-white/5 bg-slate-950/70 px-3.5 py-2.5 text-left text-sm text-slate-100 hover:border-emerald-400/40 transition"
              data-entity-open
              data-entity-id="${match.entity_id}"
              data-match-open
              aria-label="${ariaLabel}"
              title="${folderText}"
            >
              ${iconMarkup}
              <span class="truncate font-semibold">${titleText}</span>
              <span class="sr-only">${srLabel}</span>
            </button>
          `;
        })
        .join("");

      queryResultsContainer.innerHTML = `
        <div class="rounded-2xl border border-white/10 bg-slate-900/70 p-4 mb-4">
          <p class="text-xs uppercase tracking-[0.4em] text-slate-500">Question</p>
          <p class="text-lg text-slate-100 mt-1">${data.question}</p>
          <p class="text-xs text-slate-500 mt-2">${data.matches.length} match${data.matches.length !== 1 ? "es" : ""}</p>
        </div>
        <div class="flex flex-wrap gap-3">
          ${matchesHtml}
        </div>
      `;

      // Attach click handlers to new match buttons
      queryResultsContainer.querySelectorAll("[data-match-open]").forEach((button) => {
        button.addEventListener("click", () => {
          const { entityId } = button.dataset;
          if (entityId) openDetailModal(entityId);
        });
      });

      queryResultsContainer.classList.remove("hidden");
    } else {
      queryResultsContainer.innerHTML = `
        <div class="rounded-2xl border border-dashed border-white/10 p-6 text-center text-slate-500">
          <p>No matching entities found. Try refining the query.</p>
        </div>
      `;
      queryResultsContainer.classList.remove("hidden");
    }
  }

  function renderDataTypeIcon(type) {
    if (type === "link") {
      return `
        <span class="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200" aria-hidden="true">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.59 13.41a2 2 0 0 1 0-2.82l3.18-3.18a2 2 0 0 1 2.82 0l.18.18a2 2 0 0 1 0 2.82l-3.18 3.18a2 2 0 0 1-2.82 0" />
            <path d="M13.41 10.59a2 2 0 0 1 0 2.82l-3.18 3.18a2 2 0 0 1-2.82 0l-.18-.18a2 2 0 0 1 0-2.82l3.18-3.18a2 2 0 0 1 2.82 0" />
          </svg>
        </span>
      `;
    }

    return `
      <span class="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200" aria-hidden="true">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="10" width="18" height="11" rx="2" />
          <path d="M7 10V7a5 5 0 0 1 10 0v3" />
        </svg>
      </span>
    `;
  }

  function escapeHtml(value) {
    if (value === undefined || value === null) {
      return "";
    }
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function submitQueryForm() {
    if (queryForm && typeof queryForm.requestSubmit === "function") {
      queryForm.requestSubmit();
    } else {
      handleQuerySubmit();
    }
  }

  if (queryForm) {
    queryForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleQuerySubmit();
    });
    console.log("Query form submit handler attached"); // eslint-disable-line no-console
  } else if (querySubmitBtn) {
    querySubmitBtn.addEventListener("click", handleQuerySubmit);
    console.log("Query submit button handler attached (fallback)"); // eslint-disable-line no-console
  } else {
    console.error("Query submit control not found!"); // eslint-disable-line no-console
  }

  if (questionInput) {
    questionInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitQueryForm();
      }
    });
    console.log("Question input Enter key handler attached"); // eslint-disable-line no-console
  } else {
    console.error("Question input not found!"); // eslint-disable-line no-console
  }

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

  document.querySelectorAll("[data-folder-delete]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const folderId = button.dataset.folderId;
      if (!folderId) return;
      const confirmed = window.confirm("Delete this empty folder?");
      if (!confirmed) return;

      const folderContainer = button.closest("[data-folder-container]");
      button.setAttribute("disabled", "disabled");
      button.classList.add("opacity-60", "pointer-events-none");

      try {
        const response = await fetch(`/api/folders/${folderId}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          const message = error.detail || "Failed to delete folder";
          alert(message);
          button.removeAttribute("disabled");
          button.classList.remove("opacity-60", "pointer-events-none");
          return;
        }
        folderContainer?.remove();
      } catch (error) {
        console.error("Failed to delete folder", error); // eslint-disable-line no-console
        alert("Failed to delete folder");
        button.removeAttribute("disabled");
        button.classList.remove("opacity-60", "pointer-events-none");
      }
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
