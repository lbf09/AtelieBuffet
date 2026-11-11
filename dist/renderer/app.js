"use strict";
(() => {
  // src/shared/models.ts
  var f = (key, label2, type = "text", extra = {}) => ({ key, label: label2, type, required: true, ...extra });
  var ref = (key, label2, entity) => f(key, label2, "select", { ref: entity });
  var status = (options) => f("status", "Situa\xE7\xE3o", "select", { options });
  var money = (key, label2) => f(key, label2, "money", { min: 0, max: 9999999999e-2, step: "0.01" });
  var entities = {
    clients: { label: "Clientes", singular: "cliente", group: "Relacionamento", columns: ["name", "email", "phone"], fields: [f("name", "Nome"), f("email", "E-mail", "email"), f("phone", "Telefone"), f("notes", "Observa\xE7\xF5es", "textarea", { required: false })] },
    events: { label: "Eventos", singular: "evento", group: "Planejamento", columns: ["name", "client_id", "starts_at", "guests", "status"], fields: [
      f("name", "Nome do evento"),
      ref("client_id", "Cliente", "clients"),
      f("type", "Tipo", "select", { options: ["aniversario", "casamento", "corporativo"] }),
      f("setup_at", "In\xEDcio da montagem", "datetime-local"),
      f("starts_at", "In\xEDcio do evento", "datetime-local"),
      f("ends_at", "Fim do evento", "datetime-local"),
      f("teardown_at", "Fim da desmontagem", "datetime-local"),
      f("guests", "Convidados", "number", { min: 1, max: 1e5 }),
      f("venue", "Local"),
      f("outdoors", "Ambiente", "select", { options: ["fechado", "aberto"] }),
      f("postal_code", "CEP"),
      f("street", "Logradouro"),
      f("number", "N\xFAmero"),
      f("district", "Bairro"),
      f("city", "Cidade"),
      f("state", "UF"),
      f("latitude", "Latitude", "number", { required: false, min: -90, max: 90, step: "any" }),
      f("longitude", "Longitude", "number", { required: false, min: -180, max: 180, step: "any" }),
      status(["rascunho", "orcamento_enviado", "confirmado", "concluido", "cancelado"]),
      f("notes", "Observa\xE7\xF5es", "textarea", { required: false })
    ] },
    menus: { label: "Card\xE1pios", singular: "card\xE1pio", group: "Cat\xE1logo", columns: ["name", "status"], fields: [f("name", "Nome"), f("description", "Descri\xE7\xE3o", "textarea", { required: false }), status(["ativo", "inativo"])] },
    menu_items: { label: "Itens do card\xE1pio", singular: "item", group: "Cat\xE1logo", columns: ["name", "unit", "price", "restrictions"], fields: [f("name", "Nome"), f("description", "Descri\xE7\xE3o", "textarea", { required: false }), f("unit", "Unidade", "select", { options: ["unidade", "porcao", "kg", "litro", "pessoa"] }), money("price", "Pre\xE7o atual (R$)"), f("restrictions", "Al\xE9rgenos / restri\xE7\xF5es", "textarea", { required: false })] },
    menu_compositions: { label: "Composi\xE7\xE3o dos card\xE1pios", singular: "composi\xE7\xE3o", group: "Cat\xE1logo", columns: ["menu_id", "item_id", "quantity"], fields: [ref("menu_id", "Card\xE1pio", "menus"), ref("item_id", "Item", "menu_items"), f("quantity", "Quantidade sugerida", "number", { min: 1e-3, max: 1e5, step: "0.001" })] },
    event_items: { label: "Itens dos eventos", singular: "item contratado", group: "Planejamento", columns: ["event_id", "item_id", "quantity", "unit_price"], fields: [ref("event_id", "Evento", "events"), ref("item_id", "Item", "menu_items"), f("quantity", "Quantidade", "number", { min: 1e-3, max: 1e5, step: "0.001" }), money("unit_price", "Pre\xE7o unit\xE1rio combinado (R$)")] },
    suppliers: { label: "Fornecedores", singular: "fornecedor", group: "Opera\xE7\xE3o", columns: ["name", "category", "phone", "status"], fields: [f("name", "Nome"), f("category", "Categoria"), f("contact", "Contato"), f("phone", "Telefone"), f("email", "E-mail", "email"), status(["ativo", "inativo"])] },
    event_suppliers: { label: "Servi\xE7os contratados", singular: "servi\xE7o contratado", group: "Opera\xE7\xE3o", columns: ["event_id", "supplier_id", "service", "cost", "status"], fields: [ref("event_id", "Evento", "events"), ref("supplier_id", "Fornecedor", "suppliers"), f("service", "Servi\xE7o"), money("cost", "Valor combinado (R$)"), status(["previsto", "confirmado", "cancelado"])] },
    employees: { label: "Equipe", singular: "funcion\xE1rio", group: "Opera\xE7\xE3o", columns: ["name", "job", "phone", "status"], fields: [f("name", "Nome"), f("job", "Fun\xE7\xE3o"), f("phone", "Telefone"), f("email", "E-mail", "email"), status(["ativo", "inativo"])] },
    event_staff: { label: "Escalas", singular: "escala", group: "Opera\xE7\xE3o", columns: ["event_id", "employee_id", "job", "starts_at", "ends_at", "cost"], fields: [ref("event_id", "Evento", "events"), ref("employee_id", "Funcion\xE1rio", "employees"), f("job", "Fun\xE7\xE3o no evento"), f("starts_at", "In\xEDcio da escala", "datetime-local"), f("ends_at", "Fim da escala", "datetime-local"), money("cost", "Custo combinado (R$)")] },
    quotes: { label: "Or\xE7amentos", singular: "or\xE7amento", group: "Financeiro", columns: ["event_id", "version", "valid_until", "total", "status"], fields: [ref("event_id", "Evento", "events"), f("valid_until", "Validade", "date"), money("freight_base", "Frete: taxa base (R$)"), f("distance_km", "Dist\xE2ncia (km)", "number", { min: 0, max: 1e5, step: "0.001" }), money("rate_km", "Tarifa por km (R$)"), f("trips", "Percursos", "select", { options: ["1", "2"] }), f("distance_source", "Origem da dist\xE2ncia", "select", { options: ["manual", "openrouteservice"] }), money("extra", "Outros servi\xE7os (R$)"), money("discount", "Desconto (R$)"), status(["rascunho", "enviado", "aprovado", "recusado", "expirado"]), f("notes", "Condi\xE7\xF5es / observa\xE7\xF5es", "textarea", { required: false })] },
    users: { label: "Usu\xE1rios", singular: "usu\xE1rio", group: "Administra\xE7\xE3o", columns: ["name", "login", "role", "status"], fields: [f("name", "Nome"), f("login", "Login"), f("password", "Senha", "password", { required: false, hint: "8 a 128 caracteres. Obrigat\xF3ria no cadastro; em branco mant\xE9m a senha." }), f("role", "Perfil", "select", { options: ["administrador", "atendimento", "operacoes"] }), status(["ativo", "inativo"])] }
  };
  var entityNames = Object.keys(entities);
  var definition = (entity) => entities[entity];

  // src/renderer/format.ts
  var escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  var money2 = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  var dateTime = (value) => {
    const text = String(value || "");
    if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return "\u2014";
    return `${text.slice(8, 10)}/${text.slice(5, 7)}/${text.slice(0, 4)}${text.length > 10 ? " \xE0s " + text.slice(11, 16) : ""}`;
  };
  var labels = {
    aniversario: "Anivers\xE1rio",
    casamento: "Casamento",
    corporativo: "Corporativo",
    fechado: "Coberto",
    aberto: "Ao ar livre",
    rascunho: "Rascunho",
    orcamento_enviado: "Or\xE7amento enviado",
    confirmado: "Confirmado",
    concluido: "Conclu\xEDdo",
    cancelado: "Cancelado",
    enviado: "Enviado",
    aprovado: "Aprovado",
    recusado: "Recusado",
    expirado: "Expirado",
    ativo: "Ativo",
    inativo: "Inativo",
    previsto: "Previsto",
    administrador: "Administrador",
    atendimento: "Atendimento",
    operacoes: "Opera\xE7\xF5es",
    unidade: "Unidade",
    porcao: "Por\xE7\xE3o",
    kg: "Kg",
    litro: "Litro",
    pessoa: "Pessoa",
    manual: "Manual",
    openrouteservice: "openrouteservice",
    orcamento: "Or\xE7amento",
    confirmacao: "Confirma\xE7\xE3o",
    simulado: "Simulado",
    aceito_provedor: "Aceito pelo provedor",
    pendente: "Pendente",
    resultado_incerto: "Resultado incerto"
  };
  var label = (value) => labels[String(value)] || String(value ?? "\u2014");
  var badge = (value) => `<span class="status status-${escapeHtml(value)}">${escapeHtml(label(value))}</span>`;
  var icon = (name) => {
    const paths = {
      home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2m4 0h2m-8 3h2"/>',
      people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3"/>',
      menu: '<path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M19 3c-4 3-4 8 0 10v8m0-18v10"/>',
      box: '<path d="m3 7 9-4 9 4v11l-9 4-9-4Zm0 0 9 4 9-4M12 11v11M7 5l10 4"/>',
      quote: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h2m2 3h2"/>',
      link: '<path d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0m0 10a4 4 0 0 0 6 0l5-5a4 4 0 0 0-5-5l-2 2"/>',
      mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
      search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
      logout: '<path d="M10 3H4v18h6m3-14 5 5-5 5m-6-5h14"/>',
      check: '<path d="m5 12 4 4L19 6"/>'
    };
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.link}</svg>`;
  };

  // src/renderer/app.ts
  var operations = ["events", "menus", "menu_items", "menu_compositions", "event_items", "suppliers", "event_suppliers", "employees", "event_staff"];
  var descriptions = {
    clients: "Pessoas e empresas que confiam suas celebra\xE7\xF5es a voc\xEA.",
    events: "Do primeiro contato ao \xFAltimo detalhe da desmontagem.",
    menus: "Organize suas propostas gastron\xF4micas.",
    menu_items: "Sabores, pre\xE7os e informa\xE7\xF5es sobre al\xE9rgenos.",
    menu_compositions: "Escolha os itens e as quantidades sugeridas de cada card\xE1pio.",
    event_items: "Itens contratados, com quantidade e pre\xE7o preservados por evento.",
    suppliers: "Parceiros para completar cada celebra\xE7\xE3o.",
    event_suppliers: "Servi\xE7os e valores negociados com seus parceiros.",
    employees: "As pessoas que fazem tudo acontecer.",
    event_staff: "Organize hor\xE1rios e evite conflitos de agenda.",
    quotes: "Re\xFAna os custos e prepare uma proposta para seu cliente.",
    users: "Gerencie quem pode acessar seu ateli\xEA."
  };
  var navIcons = { events: "calendar", clients: "people", menus: "menu", menu_items: "menu", suppliers: "box", employees: "people", quotes: "quote", users: "people" };
  var api = window.buffet;
  var unwrap = (result) => {
    if (!result.ok) throw new Error(result.error);
    return result.data;
  };
  var BuffetApp = class {
    root = document.querySelector("#app");
    editor = document.querySelector("#editor");
    confirm = document.querySelector("#confirm");
    info;
    view = "dashboard";
    rows = [];
    refs = {};
    page = 0;
    scope;
    version = 0;
    toastTimer = 0;
    weatherTimer = 0;
    async start() {
      this.info = unwrap(await api.info());
      if (!this.info.user) this.login();
      else await this.shell();
    }
    async act(work, button, errorBox) {
      if (button?.disabled) return;
      if (button) button.disabled = true;
      if (errorBox) {
        errorBox.hidden = true;
        errorBox.textContent = "";
      }
      try {
        await work();
      } catch (error) {
        const message = error instanceof Error ? error.message : "N\xE3o foi poss\xEDvel concluir a opera\xE7\xE3o.";
        if (errorBox) {
          errorBox.hidden = false;
          errorBox.textContent = message;
          errorBox.scrollIntoView({ block: "nearest" });
        } else this.toast(message, true);
        if (message.includes("sess\xE3o terminou")) {
          this.editor.close();
          this.confirm.close();
          await this.start();
        }
      } finally {
        if (button) button.disabled = false;
      }
    }
    toast(message, error = false) {
      const toast = document.querySelector("#toast");
      window.clearTimeout(this.toastTimer);
      toast.textContent = message;
      toast.classList.toggle("error", error);
      toast.hidden = false;
      this.toastTimer = window.setTimeout(() => toast.hidden = true, error ? 9e3 : 6e3);
    }
    canRead(entity) {
      const role = this.info.user?.role;
      return role === "administrador" || entity !== "users" && (role !== "operacoes" || operations.includes(entity));
    }
    canWrite(entity, creating = false) {
      return this.canRead(entity) && !(this.info.user?.role === "atendimento" && ["employees", "event_staff"].includes(entity)) && !(creating && entity === "events" && this.info.user?.role === "operacoes");
    }
    login() {
      const setup = this.info.needsSetup;
      this.root.innerHTML = `<div class="login-layout"><section class="login-story"><div class="brand">${icon("menu")} Ateli\xEA <span>Buffet</span></div><div><h1>Cada encontro<br>come\xE7a com<br>um bom plano.</h1><p>Clientes, sabores e pessoas.<br>Todos os detalhes, no mesmo lugar.</p></div><span>Gest\xE3o de festas e eventos</span></section><main class="login-panel"><form id="auth-form"><span class="pill">${this.info.mode === "demo" ? "Demonstra\xE7\xE3o local" : "Seu espa\xE7o de trabalho"}</span><h2>${setup ? "Vamos abrir seu ateli\xEA" : "Bom ter voc\xEA aqui"}</h2><p>${setup ? "Cadastre o primeiro administrador para come\xE7ar." : "Entre para acompanhar os pr\xF3ximos encontros."}</p>${setup ? '<label for="auth-name">Seu nome</label><input class="form-control" id="auth-name" name="name" required maxlength="200" autocomplete="name">' : ""}<label for="auth-login">Login</label><input class="form-control" id="auth-login" name="login" required minlength="3" maxlength="80" autocomplete="username"><label for="auth-password">Senha</label><input class="form-control" id="auth-password" name="password" type="password" required ${setup ? 'minlength="8"' : ""} maxlength="128" autocomplete="${setup ? "new-password" : "current-password"}">${setup ? "<small>Use de 8 a 128 caracteres. N\xE3o h\xE1 senha padr\xE3o.</small>" : ""}<p class="form-error" role="alert" hidden></p><button class="btn btn-primary auth-submit" type="submit">${setup ? "Criar administrador" : "Entrar no ateli\xEA"} ${icon("arrow")}</button><p class="login-foot">${this.info.apiMode === "demo" ? "Integra\xE7\xF5es simuladas. Nenhum e-mail ser\xE1 enviado." : "Acesso restrito \xE0 equipe autorizada."}</p></form></main></div>`;
      const form = this.root.querySelector("form");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        void this.act(async () => {
          const data = Object.fromEntries(new FormData(form));
          this.info.user = unwrap(setup ? await api.setup({ name: data.name, login: data.login, password: data.password }) : await api.login({ login: data.login, password: data.password }));
          this.info.needsSetup = false;
          await this.shell();
        }, form.querySelector("button"), form.querySelector(".form-error"));
      });
    }
    async shell() {
      const user = this.info.user;
      const groups = ["Planejamento", "Relacionamento", "Cat\xE1logo", "Opera\xE7\xE3o", "Financeiro", "Administra\xE7\xE3o"];
      this.root.innerHTML = `<div class="workspace"><aside class="sidebar"><div class="brand">${icon("menu")}<div>Ateli\xEA <span>Buffet</span></div></div><nav aria-label="Navega\xE7\xE3o principal"><button data-view="dashboard" class="nav-item">${icon("home")} Vis\xE3o geral</button>${groups.map((group) => {
        const names = entityNames.filter((e) => definition(e).group === group && this.canRead(e));
        return names.length ? `<div class="nav-group">${group}</div>${names.map((e) => `<button data-view="${e}" class="nav-item">${icon(navIcons[e] || "link")} ${escapeHtml(definition(e).label)}</button>`).join("")}` : "";
      }).join("")}${this.canRead("quotes") ? `<button data-view="history" class="nav-item">${icon("mail")} Hist\xF3rico de e-mails</button>` : ""}</nav><div class="profile"><div class="avatar">${escapeHtml(user.name.slice(0, 1).toUpperCase())}</div><div><strong>${escapeHtml(user.name)}</strong><small>${label(user.role)}</small></div><button id="logout" class="icon-button" aria-label="Sair da conta" title="Sair da conta">${icon("logout")}</button></div></aside><div class="workspace-main"><header class="topbar"><span id="breadcrumb">Seu ateli\xEA / Vis\xE3o geral</span><span class="mode-indicator">${this.info.apiMode === "demo" ? "Demonstra\xE7\xE3o \u2022 APIs simuladas" : "Integra\xE7\xF5es reais"}<span class="mode-dot"></span></span></header><main id="content" tabindex="-1"></main><footer class="workspace-footer">Ateli\xEA Buffet <span>Feito para cuidar dos detalhes.</span></footer></div></div>`;
      this.root.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => void this.act(() => this.navigate(button.dataset.view))));
      this.root.querySelector("#logout").addEventListener("click", () => void this.act(async () => {
        window.clearInterval(this.weatherTimer);
        unwrap(await api.logout());
        this.refs = {};
        this.rows = [];
        await this.start();
      }));
      await this.navigate("dashboard");
    }
    content() {
      return this.root.querySelector("#content");
    }
    async navigate(view, scope) {
      const version = ++this.version;
      this.view = view;
      this.scope = scope;
      this.page = 0;
      this.root.querySelectorAll("[data-view]").forEach((b) => {
        b.classList.toggle("active", b.dataset.view === view);
        if (b.dataset.view === view) b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      });
      this.root.querySelector("#breadcrumb").textContent = `Seu ateli\xEA / ${view === "dashboard" ? "Vis\xE3o geral" : view === "history" ? "Hist\xF3rico de e-mails" : definition(view).label}`;
      this.content().innerHTML = '<p class="loading" role="status">Carregando\u2026</p>';
      if (view === "dashboard") {
        await this.dashboard(version);
        return;
      }
      if (view === "history") {
        await this.history(version);
        return;
      }
      const refNames = [...new Set(definition(view).fields.flatMap((f2) => f2.ref && this.canRead(f2.ref) ? [f2.ref] : []))];
      const [rows, ...references] = await Promise.all([api[view].list(), ...refNames.map((e) => api[e].list())]);
      if (version !== this.version) return;
      this.rows = unwrap(rows);
      this.refs = {};
      refNames.forEach((e, i) => this.refs[e] = unwrap(references[i]));
      this.content().innerHTML = `<div class="page-heading"><div><h1>${escapeHtml(definition(view).label)}</h1><p>${escapeHtml(descriptions[view])}</p></div><div class="actions">${view === "quotes" ? '<button class="btn btn-secondary" id="export">Exportar relat\xF3rio</button>' : ""}${this.canWrite(view, true) ? `<button class="btn btn-primary" id="new">${icon("plus")} Novo cadastro</button>` : ""}</div></div>${scope ? `<div class="scope-banner">Exibindo v\xEDnculos de <strong>${escapeHtml(scope.name)}</strong><button id="clear-scope" class="text-button">Mostrar todos</button></div>` : ""}<section class="table-panel"><div class="table-toolbar"><div class="search-box">${icon("search")}<input id="search" type="search" placeholder="Buscar em ${escapeHtml(definition(view).label.toLocaleLowerCase("pt-BR"))}" aria-label="Buscar registros"></div>${definition(view).fields.find((f2) => f2.key === "status") ? `<select id="status-filter" class="form-select" aria-label="Filtrar por situa\xE7\xE3o"><option value="">Todas as situa\xE7\xF5es</option>${definition(view).fields.find((f2) => f2.key === "status").options.map((x) => `<option value="${x}">${label(x)}</option>`).join("")}</select>` : ""}<span id="record-count"></span></div><div id="table-area"></div></section>`;
      this.content().querySelector("#new")?.addEventListener("click", () => void this.act(() => this.edit(view)));
      this.content().querySelector("#export")?.addEventListener("click", (event) => void this.act(async () => this.toast(unwrap(await api.exportReport())), event.currentTarget));
      this.content().querySelector("#clear-scope")?.addEventListener("click", () => void this.act(() => this.navigate(view)));
      this.content().querySelector("#search")?.addEventListener("input", () => {
        this.page = 0;
        this.table(view);
      });
      this.content().querySelector("#status-filter")?.addEventListener("change", () => {
        this.page = 0;
        this.table(view);
      });
      this.table(view);
    }
    display(entity, key, row) {
      const field = definition(entity).fields.find((f2) => f2.key === key), value = row[key];
      if (field?.ref) {
        const related = this.refs[field.ref]?.find((r) => r.id === Number(value));
        return String(related?.name || related?.service || `#${value}`);
      }
      if (field?.type === "money" || key === "total") return money2(value);
      if (field?.type === "date" || field?.type === "datetime-local") return dateTime(value);
      return label(value);
    }
    table(entity) {
      const search = this.content().querySelector("#search").value.toLocaleLowerCase("pt-BR");
      const status2 = this.content().querySelector("#status-filter")?.value || "";
      const columns = definition(entity).columns;
      const filtered = this.rows.filter((row) => (!this.scope || Number(row[this.scope.key]) === this.scope.id) && (!status2 || row.status === status2) && columns.some((k) => this.display(entity, k, row).toLocaleLowerCase("pt-BR").includes(search)));
      this.page = Math.min(this.page, Math.max(0, Math.ceil(filtered.length / 12) - 1));
      this.content().querySelector("#record-count").textContent = `${filtered.length} registro${filtered.length === 1 ? "" : "s"}`;
      this.content().querySelector("#table-area").innerHTML = filtered.length ? `<div class="table-scroll"><table class="data-table"><thead><tr>${columns.map((k) => `<th>${escapeHtml(definition(entity).fields.find((f2) => f2.key === k)?.label || ({ total: "Total", version: "Vers\xE3o" }[k] || k))}</th>`).join("")}<th class="actions-heading">A\xE7\xF5es</th></tr></thead><tbody>${filtered.slice(this.page * 12, this.page * 12 + 12).map((row) => `<tr>${columns.map((k, i) => `<td${i === 0 ? ' class="primary-cell"' : ""}>${k === "status" ? badge(row[k]) : escapeHtml(this.display(entity, k, row))}</td>`).join("")}<td><div class="row-actions">${entity === "events" ? `<button class="text-button" data-action="detail" data-id="${row.id}">Detalhes</button>` : ""}${entity === "quotes" ? `<button class="text-button" data-action="preview" data-id="${row.id}">Ver proposta</button><button class="text-button" data-action="version" data-id="${row.id}">Nova vers\xE3o</button>` : ""}${this.canWrite(entity) ? `<button class="text-button" data-action="edit" data-id="${row.id}">Editar</button><button class="text-button danger" data-action="delete" data-id="${row.id}">Excluir</button>` : ""}</div></td></tr>`).join("")}</tbody></table></div><div class="pagination-bar"><span>P\xE1gina ${this.page + 1} de ${Math.ceil(filtered.length / 12)}</span><div><button class="btn btn-secondary btn-sm" id="prev" ${this.page === 0 ? "disabled" : ""}>Anterior</button><button class="btn btn-secondary btn-sm" id="next" ${(this.page + 1) * 12 >= filtered.length ? "disabled" : ""}>Pr\xF3xima</button></div></div>` : `<div class="empty-state">${icon(navIcons[entity] || "box")}<h2>${search || status2 ? "Nenhum resultado" : "Nenhum cadastro ainda"}</h2><p>${search || status2 ? "Ajuste a busca ou o filtro para encontrar o registro." : "Use \u201CNovo cadastro\u201D para adicionar o primeiro registro."}</p></div>`;
      this.content().querySelector("#prev")?.addEventListener("click", () => {
        this.page--;
        this.table(entity);
      });
      this.content().querySelector("#next")?.addEventListener("click", () => {
        this.page++;
        this.table(entity);
      });
      if (entity === "events" && this.info.user?.role === "operacoes") this.content().querySelectorAll('[data-action="delete"]').forEach((button) => button.remove());
      this.content().querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => void this.act(async () => {
        const row = this.rows.find((r) => r.id === Number(button.dataset.id));
        switch (button.dataset.action) {
          case "edit":
            await this.edit(entity, row);
            break;
          case "delete":
            this.deleteDialog(entity, row);
            break;
          case "detail":
            await this.eventDetail(row);
            break;
          case "preview":
            this.quoteDetail(row);
            break;
          case "version":
            await this.edit(entity, void 0, { ...row, status: "rascunho" });
            break;
        }
      }, button)));
    }
    async dashboard(version) {
      const data = unwrap(await api.dashboard());
      if (version !== this.version) return;
      const events = data.events.slice(0, 5), date = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(/* @__PURE__ */ new Date());
      this.content().innerHTML = `<div class="page-heading"><div><h1>Agenda do buffet</h1><p>Planeje os pr\xF3ximos encontros e acompanhe a opera\xE7\xE3o em ${escapeHtml(date)}.</p></div>${this.canWrite("events", true) ? `<button class="btn btn-primary" id="new-event">${icon("plus")} Criar evento</button>` : ""}</div><section class="overview-strip" aria-label="Resumo do ateli\xEA"><div><span>Eventos em planejamento</span><strong>${data.activeEvents.toLocaleString("pt-BR")}</strong><small>Encontros para preparar</small></div><div><span>Convidados esperados</span><strong>${data.guests.toLocaleString("pt-BR")}</strong><small>Nos eventos em aberto</small></div><div><span>${this.canRead("quotes") ? "Propostas aprovadas" : "Organiza\xE7\xE3o"}</span><strong>${this.canRead("quotes") ? money2(data.approved) : "Tudo em equipe"}</strong><small>${this.canRead("quotes") ? "Soma dos or\xE7amentos aprovados" : "Consulte as escalas e os parceiros"}</small></div></section><div class="dashboard-grid"><section class="agenda"><div class="section-heading"><div><h2>Na agenda</h2><p>Os pr\xF3ximos eventos do seu buffet</p></div><button class="text-button" id="all-events">Ver todos ${icon("arrow")}</button></div>${events.length ? events.map((e) => {
        const date2 = String(e.starts_at), month = (/* @__PURE__ */ new Date(date2.slice(0, 10) + "T12:00:00")).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
        return `<button class="agenda-event" data-event="${e.id}"><div class="date-tile"><strong>${date2.slice(8, 10)}</strong><span>${escapeHtml(month)}</span></div><div class="agenda-copy"><span class="event-type">${escapeHtml(label(e.type))}</span><h3>${escapeHtml(e.name)}</h3><p>${escapeHtml(e.venue)} <span>\u2022</span> ${e.guests} convidados</p></div><div class="agenda-meta">${badge(e.status)}<small>${date2.slice(11, 16)}${e.outdoors === "aberto" ? " \u2022 Ao ar livre" : ""}</small></div>${icon("arrow")}</button>`;
      }).join("") : '<div class="empty-state"><h3>A agenda est\xE1 livre</h3><p>Cadastre um cliente e prepare seu primeiro evento.</p></div>'}</section><aside class="planning-note"><div class="note-icon">${icon("menu")}</div><h2>Prepare o pr\xF3ximo evento</h2><p>Da proposta \xE0 recep\xE7\xE3o, acompanhe o que falta.</p><ol><li>Cadastre o cliente e o evento.</li><li>Escolha os itens e os parceiros.</li><li>Organize a equipe e seus hor\xE1rios.</li><li>Monte e revise o or\xE7amento.</li></ol><div class="note-footer">${this.info.apiMode === "demo" ? "Voc\xEA est\xE1 em uma demonstra\xE7\xE3o. Endere\xE7os, rotas, clima e envios s\xE3o simulados." : "Consulte o clima perto da data e revise a proposta antes de enviar."}</div></aside></div><section class="quick-links"><h2>Cuide dos preparativos</h2><div>${["clients", "menu_items", "event_staff", "quotes"].filter((e) => this.canRead(e)).map((e) => `<button data-quick="${e}">${icon(navIcons[e] || "calendar")}<span><strong>${escapeHtml(definition(e).label)}</strong><small>${e === "quotes" ? "Valores e propostas" : e === "event_staff" ? "Pessoas e hor\xE1rios" : e === "clients" ? "Relacionamentos que ficam" : "Sabores para cada ocasi\xE3o"}</small></span>${icon("arrow")}</button>`).join("")}</div></section>`;
      this.content().querySelector("#all-events")?.addEventListener("click", () => void this.act(() => this.navigate("events")));
      this.content().querySelector("#new-event")?.addEventListener("click", () => void this.act(() => this.edit("events")));
      this.content().querySelectorAll("[data-quick]").forEach((b) => b.addEventListener("click", () => void this.act(() => this.navigate(b.dataset.quick))));
      this.content().querySelectorAll("[data-event]").forEach((b) => b.addEventListener("click", () => void this.act(() => this.eventDetail(events.find((e) => e.id === Number(b.dataset.event))))));
    }
    modal(title, body, footer = '<button type="button" class="btn btn-secondary" data-close>Fechar</button>') {
      this.editor.innerHTML = `<div class="dialog-header"><h2 id="dialog-title">${escapeHtml(title)}</h2><button type="button" class="icon-button" data-close aria-label="Fechar janela">\xD7</button></div><div class="dialog-body">${body}</div><div class="dialog-footer">${footer}</div>`;
      this.editor.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => this.editor.close()));
      if (!this.editor.open) this.editor.showModal();
    }
    field(field, value, old) {
      const id = `field-${field.key}`, required = field.required || field.key === "password" && !old;
      let control = "";
      const common = `id="${id}" name="${field.key}" ${required ? "required" : ""} ${field.min !== void 0 ? `min="${field.min}"` : ""} ${field.max !== void 0 ? `max="${field.max}"` : ""}`;
      if (field.type === "select") {
        const options = field.ref ? (this.refs[field.ref] || []).map((r) => ({ value: String(r.id), text: String(r.name || `#${r.id}`) })) : field.options.map((v) => ({ value: v, text: label(v) }));
        if (field.ref && value && !options.some((o) => o.value === String(value))) options.push({ value: String(value), text: `#${value}` });
        control = `<select class="form-select" ${common}><option value="">Selecione\u2026</option>${options.map((o) => `<option value="${escapeHtml(o.value)}" ${String(value) === o.value ? "selected" : ""}>${escapeHtml(o.text)}</option>`).join("")}</select>`;
      } else if (field.type === "textarea") control = `<textarea class="form-control" ${common} maxlength="2000" rows="3">${escapeHtml(value)}</textarea>`;
      else control = `<input class="form-control" ${common} type="${field.type === "money" ? "number" : field.type}" value="${escapeHtml(field.type === "datetime-local" ? String(value || "").replace(" ", "T").slice(0, 16) : value)}" ${field.type === "password" ? 'minlength="8" maxlength="128" autocomplete="new-password"' : field.type === "text" || field.type === "email" ? 'maxlength="200"' : ""} ${field.step ? `step="${field.step}"` : field.type === "number" ? 'step="1"' : ""}>`;
      return `<div class="field ${field.type === "textarea" ? "wide" : ""}"><label for="${id}">${escapeHtml(field.label)}${required ? ' <span aria-hidden="true">*</span>' : ""}</label>${control}${field.hint ? `<small>${escapeHtml(field.hint)}</small>` : ""}</div>`;
    }
    async edit(entity, old, prefill = {}) {
      const fields = definition(entity).fields;
      for (const ref2 of new Set(fields.flatMap((f2) => f2.ref && this.canRead(f2.ref) ? [f2.ref] : []))) this.refs[ref2] = unwrap(await api[ref2].list());
      const data = { ...prefill, ...old };
      if (!old) {
        for (const field of fields) if (data[field.key] === void 0) {
          data[field.key] = field.options?.[0] ?? (field.type === "money" ? 0 : field.type === "number" && field.required ? field.min ?? 0 : "");
        }
        if (this.scope) data[this.scope.key] = this.scope.id;
      }
      if (entity === "quotes" && !old) data.valid_until = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
      if (entity === "users") data.password = "";
      const tools = entity === "events" ? `<section class="form-tools"><h3>Encontre o endere\xE7o</h3><p>Preencha o CEP e consulte o endere\xE7o. Revise antes de salvar.</p><div class="actions"><button type="button" class="btn btn-secondary btn-sm" id="cep">Consultar CEP</button><button type="button" class="btn btn-secondary btn-sm" id="geocode">Localizar coordenadas</button></div><div id="location-results"></div></section>` : entity === "quotes" ? '<section class="form-tools"><h3>Dist\xE2ncia para o frete</h3><p>Informe as coordenadas de sa\xEDda; o destino vem do evento.</p><div class="form-grid"><div class="field"><label for="origin-lat">Latitude de sa\xEDda</label><input id="origin-lat" type="number" min="-90" max="90" step="any" class="form-control"></div><div class="field"><label for="origin-lon">Longitude de sa\xEDda</label><input id="origin-lon" type="number" min="-180" max="180" step="any" class="form-control"></div></div><button type="button" id="route" class="btn btn-secondary">Consultar dist\xE2ncia</button><div id="route-result"></div></section>' : "";
      this.modal(`${old ? "Editar" : "Cadastrar"} ${definition(entity).singular}`, `<form id="entity-form"><p class="form-note">Campos com * s\xE3o obrigat\xF3rios.${entity === "quotes" ? " O total \xE9 calculado ao salvar, incluindo itens, equipe e fornecedores." : ""}</p>${old && entity === "quotes" ? `<div class="quote-total"><span>Total da vers\xE3o ${old.version}</span><strong>${money2(old.total)}</strong></div>` : ""}<div class="form-grid">${fields.map((f2) => this.field(f2, data[f2.key], old)).join("")}</div>${tools}<div class="form-error" role="alert" hidden></div></form>`, `<button type="button" class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" type="submit" form="entity-form">Salvar cadastro</button>`);
      const form = this.editor.querySelector("form");
      const get = (key) => form.elements.namedItem(key).value;
      const set = (key, value) => {
        form.elements.namedItem(key).value = String(value ?? "");
      };
      const errorBox = form.querySelector(".form-error");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        void this.act(async () => {
          const input = Object.fromEntries(new FormData(form));
          unwrap(await api[entity].save(input, old?.id));
          this.editor.close();
          this.toast("Cadastro salvo.");
          await this.navigate(entity, this.view === entity ? this.scope : void 0);
        }, this.editor.querySelector('[type="submit"]'), errorBox);
      });
      const wire = (selector, work) => this.editor.querySelector(selector)?.addEventListener("click", (event) => void this.act(work, event.currentTarget, errorBox));
      wire("#cep", async () => {
        const result = unwrap(await api.cep(get("postal_code")));
        for (const key of ["street", "district", "city", "state"]) set(key, result[key]);
        this.editor.querySelector("#location-results").innerHTML = `<p class="api-source">${escapeHtml(result.source)}. Revise o endere\xE7o e complete o n\xFAmero.</p>`;
      });
      wire("#geocode", async () => {
        const result = unwrap(await api.geocode(["street", "number", "district", "city", "state"].map(get).join(", ")));
        const candidates = result.candidates;
        const box = this.editor.querySelector("#location-results");
        box.innerHTML = `<p class="api-source">${escapeHtml(result.source)}. Selecione o local correto:</p>${candidates.map((c, i) => `<button type="button" class="candidate" data-candidate="${i}">${escapeHtml(c.label)}<small>${c.coordinates[1]}, ${c.coordinates[0]}</small></button>`).join("")}`;
        box.querySelectorAll("[data-candidate]").forEach((b) => b.addEventListener("click", () => {
          const c = candidates[Number(b.dataset.candidate)];
          set("longitude", c.coordinates[0]);
          set("latitude", c.coordinates[1]);
          box.textContent = "Coordenadas preenchidas. Revise o local antes de salvar.";
        }));
      });
      wire("#route", async () => {
        const event = this.refs.events?.find((e) => e.id === Number(get("event_id")));
        if (!event || event.longitude === null || event.latitude === null) throw new Error("Selecione um evento com latitude e longitude cadastradas.");
        const lat = form.querySelector("#origin-lat"), lon = form.querySelector("#origin-lon");
        if (!lat.value || !lon.value || !lat.checkValidity() || !lon.checkValidity()) throw new Error("Informe coordenadas v\xE1lidas para a sa\xEDda do buffet.");
        const result = unwrap(await api.route({ origin: [Number(lon.value), Number(lat.value)], destination: [Number(event.longitude), Number(event.latitude)] }));
        set("distance_km", result.km);
        set("distance_source", result.demo ? "manual" : "openrouteservice");
        this.editor.querySelector("#route-result").innerHTML = `<p class="api-source">${escapeHtml(result.source)}: ${escapeHtml(result.km)} km, aproximadamente ${escapeHtml(result.minutes)} min. Dist\xE2ncia preenchida; revise a taxa e os percursos.</p>`;
      });
      if (entity === "event_items") form.querySelector('[name="item_id"]')?.addEventListener("change", () => {
        const item = this.refs.menu_items?.find((i) => i.id === Number(get("item_id")));
        if (item) set("unit_price", item.price);
      });
      if (entity === "event_staff") {
        const fill = () => {
          const e = this.refs.events?.find((r) => r.id === Number(get("event_id")));
          if (e) {
            set("starts_at", String(e.setup_at).replace(" ", "T").slice(0, 16));
            set("ends_at", String(e.teardown_at).replace(" ", "T").slice(0, 16));
          }
        };
        form.querySelector('[name="event_id"]')?.addEventListener("change", fill);
        if (!old && get("event_id")) fill();
      }
    }
    deleteDialog(entity, row) {
      this.confirm.innerHTML = `<div class="dialog-header"><h2 id="confirm-title">Excluir ${escapeHtml(definition(entity).singular)}?</h2></div><div class="dialog-body"><p>Excluir ${escapeHtml(row.name || `o registro #${row.id}`)}? Esta a\xE7\xE3o n\xE3o pode ser desfeita. Registros com v\xEDnculos ou hist\xF3rico protegido ser\xE3o preservados.</p><div class="form-error" role="alert" hidden></div></div><div class="dialog-footer"><button class="btn btn-secondary" id="cancel-delete">Cancelar</button><button class="btn btn-danger" id="delete">Excluir registro</button></div>`;
      this.confirm.querySelector("#cancel-delete").addEventListener("click", () => this.confirm.close());
      const button = this.confirm.querySelector("#delete");
      button.addEventListener("click", () => void this.act(async () => {
        unwrap(await api[entity].remove(row.id));
        this.confirm.close();
        this.toast("Registro exclu\xEDdo.");
        await this.navigate(entity, this.scope);
      }, button, this.confirm.querySelector(".form-error")));
      this.confirm.showModal();
    }
    async eventDetail(event) {
      const names = ["event_items", "event_suppliers", "event_staff", "quotes"].filter((e) => this.canRead(e));
      const related = await Promise.all(names.map(async (e) => ({ entity: e, rows: unwrap(await api[e].list()).filter((r) => Number(r.event_id) === event.id) })));
      this.modal(String(event.name), `<div class="detail-heading">${badge(event.status)}<span>${escapeHtml(label(event.type))} \u2022 ${event.guests} convidados</span></div><dl class="detail-grid"><div><dt>Data do evento</dt><dd>${dateTime(event.starts_at)}</dd></div><div><dt>Local</dt><dd>${escapeHtml(event.venue)} \u2022 ${label(event.outdoors)}</dd></div><div><dt>Endere\xE7o</dt><dd>${escapeHtml(event.street)}, ${escapeHtml(event.number)}<br>${escapeHtml(event.city)} / ${escapeHtml(event.state)} \u2022 ${escapeHtml(event.postal_code)}</dd></div><div><dt>Opera\xE7\xE3o</dt><dd>Montagem: ${dateTime(event.setup_at)}<br>Desmontagem: ${dateTime(event.teardown_at)}</dd></div></dl><div class="event-links">${related.map((r) => `<button data-related="${r.entity}"><strong>${r.rows.length}</strong><span>${escapeHtml(definition(r.entity).label)}</span>${icon("arrow")}</button>`).join("")}</div><section class="weather-panel"><div><h3>${icon("sun")} Previs\xE3o para o encontro</h3><p>A previs\xE3o fica dispon\xEDvel perto da data. Use-a para planejar eventos ao ar livre.</p></div><button class="btn btn-secondary" id="weather">Consultar previs\xE3o</button><div id="weather-result" role="status"></div></section>${event.notes ? `<h3>Observa\xE7\xF5es</h3><p class="preserve-lines">${escapeHtml(event.notes)}</p>` : ""}`);
      this.editor.querySelectorAll("[data-related]").forEach((b) => b.addEventListener("click", () => void this.act(async () => {
        this.editor.close();
        await this.navigate(b.dataset.related, { key: "event_id", id: event.id, name: String(event.name) });
      })));
      this.editor.querySelector("#weather").addEventListener("click", (e) => void this.act(async () => {
        const r = unwrap(await api.weather(event.id));
        this.editor.querySelector("#weather-result").innerHTML = r.available ? `<div class="weather-values"><strong>${escapeHtml(r.min)}\xB0 \u2014 ${escapeHtml(r.max)}\xB0</strong><span>Probabilidade de chuva: ${r.rainProbability == null ? "indispon\xEDvel" : escapeHtml(r.rainProbability) + "%"}<br>Precipita\xE7\xE3o: ${r.precipitation == null ? "indispon\xEDvel" : escapeHtml(r.precipitation) + " mm"}</span></div><p class="api-source">${escapeHtml(r.source)} \u2022 ${escapeHtml(new Date(r.queriedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }))}<br>Dados meteorol\xF3gicos: Open-Meteo. Previs\xF5es podem mudar.</p>` : `<p>${escapeHtml(r.message)}</p>`;
      }, e.currentTarget));
    }
    quoteDetail(quote) {
      const snapshot = JSON.parse(String(quote.snapshot));
      this.modal(`Proposta \u2022 vers\xE3o ${quote.version}`, `<div class="detail-heading">${badge(quote.status)}<span>V\xE1lida at\xE9 ${dateTime(quote.valid_until)}</span></div><h3>${escapeHtml(snapshot.event.name)}</h3><p>Para ${escapeHtml(snapshot.client.name)} \u2022 ${escapeHtml(snapshot.client.email)}<br>${dateTime(snapshot.event.starts_at)} \u2022 ${escapeHtml(snapshot.event.venue)}</p><table class="data-table quote-lines"><thead><tr><th>Item</th><th>Quantidade</th><th>Pre\xE7o unit\xE1rio</th></tr></thead><tbody>${snapshot.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.quantity)} ${escapeHtml(label(item.unit))}</td><td>${money2(item.unit_price)}</td></tr>`).join("")}</tbody></table><dl class="totals"><div><dt>Pacote, equipe e fornecedores</dt><dd>${money2(quote.subtotal)}</dd></div><div><dt>Frete estimado</dt><dd>${money2(quote.freight)}</dd></div><div><dt>Outros servi\xE7os</dt><dd>${money2(quote.extra)}</dd></div><div><dt>Desconto</dt><dd>${money2(quote.discount)}</dd></div><div class="total"><dt>Total</dt><dd>${money2(quote.total)}</dd></div></dl><p class="preserve-lines">${escapeHtml(quote.notes || "Condi\xE7\xF5es a combinar com o cliente.")}</p><p class="form-note">Esta proposta usa os dados preservados no momento de sua gera\xE7\xE3o.</p>`, `<button class="btn btn-secondary" data-close>Fechar</button><button class="btn btn-secondary" id="confirm-preview">Pr\xE9via da confirma\xE7\xE3o</button><button class="btn btn-primary" id="email-preview">Pr\xE9via do or\xE7amento</button>`);
      this.editor.querySelector("#email-preview").addEventListener("click", () => void this.act(() => this.email(quote, "orcamento")));
      this.editor.querySelector("#confirm-preview").addEventListener("click", () => void this.act(() => this.email(quote, "confirmacao")));
    }
    async email(quote, kind) {
      const preview = unwrap(await api.emailPreview({ quoteId: quote.id, kind }));
      this.modal("Revise a mensagem antes de enviar", `<dl class="mail-head"><dt>Destinat\xE1rio</dt><dd>${escapeHtml(preview.to)}</dd><dt>Assunto</dt><dd>${escapeHtml(preview.subject)}</dd></dl><pre class="email-body">${escapeHtml(preview.text)}</pre><p class="form-note">${preview.demo ? "Demonstra\xE7\xE3o: o envio ser\xE1 apenas registrado como simulado." : "Ao confirmar, esta mensagem ser\xE1 enviada ao endere\xE7o acima. Confira os dados do cliente."}</p><div class="form-error" role="alert" hidden></div>`, `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" id="send-email">${preview.demo ? "Simular envio" : "Confirmar envio"}</button>`);
      this.editor.querySelector("#send-email").addEventListener("click", (event) => void this.act(async () => {
        const result = unwrap(await api.emailSend(preview.token));
        this.editor.close();
        this.toast(String(result.message));
        await this.navigate("history");
      }, event.currentTarget, this.editor.querySelector(".form-error")));
    }
    async history(version) {
      const rows = unwrap(await api.emailHistory());
      if (version !== this.version) return;
      this.content().innerHTML = `<div class="page-heading"><div><h1>Hist\xF3rico de e-mails</h1><p>\xDAltimas 200 tentativas. Aceite do provedor n\xE3o comprova entrega ou leitura.</p></div></div><section class="table-panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>Or\xE7amento</th><th>Mensagem</th><th>Situa\xE7\xE3o</th><th>Data da tentativa</th></tr></thead><tbody>${rows.map((r) => `<tr><td>#${r.quote_id}</td><td>${escapeHtml(label(r.kind))}</td><td>${badge(r.status)}</td><td>${escapeHtml(new Date(String(r.attempted_at)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }))}</td></tr>`).join("")}</tbody></table></div>${!rows.length ? '<div class="empty-state"><h2>Nenhum envio por aqui</h2><p>Abra uma proposta e revise a mensagem para enviar um or\xE7amento.</p></div>' : ""}</section>`;
    }
  };
  void new BuffetApp().start().catch(() => {
    document.querySelector("#app").innerHTML = '<div class="startup-error"><h1>N\xE3o foi poss\xEDvel abrir o ateli\xEA</h1><p>Reabra o aplicativo. Para executar a demonstra\xE7\xE3o, use npm run demo.</p></div>';
  });
})();
