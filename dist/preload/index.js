"use strict";

// src/preload/index.ts
var import_electron = require("electron");

// src/shared/models.ts
var f = (key, label, type = "text", extra = {}) => ({ key, label, type, required: true, ...extra });
var ref = (key, label, entity) => f(key, label, "select", { ref: entity });
var status = (options) => f("status", "Situa\xE7\xE3o", "select", { options });
var money = (key, label) => f(key, label, "money", { min: 0, max: 9999999999e-2, step: "0.01" });
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

// src/preload/index.ts
var crud = Object.fromEntries(entityNames.map((entity) => [entity, {
  list: () => import_electron.ipcRenderer.invoke(`${entity}:list`),
  save: (data, id) => import_electron.ipcRenderer.invoke(`${entity}:save`, data, id),
  remove: (id) => import_electron.ipcRenderer.invoke(`${entity}:remove`, id)
}]));
var api = {
  ...crud,
  info: () => import_electron.ipcRenderer.invoke("app:info"),
  setup: (data) => import_electron.ipcRenderer.invoke("auth:setup", data),
  login: (data) => import_electron.ipcRenderer.invoke("auth:login", data),
  logout: () => import_electron.ipcRenderer.invoke("auth:logout"),
  dashboard: () => import_electron.ipcRenderer.invoke("dashboard:read"),
  cep: (cep) => import_electron.ipcRenderer.invoke("integration:cep", cep),
  weather: (eventId) => import_electron.ipcRenderer.invoke("integration:weather", eventId),
  geocode: (address) => import_electron.ipcRenderer.invoke("integration:geocode", address),
  route: (data) => import_electron.ipcRenderer.invoke("integration:route", data),
  emailPreview: (data) => import_electron.ipcRenderer.invoke("email:preview", data),
  emailSend: (token) => import_electron.ipcRenderer.invoke("email:send", token),
  emailHistory: () => import_electron.ipcRenderer.invoke("email:history"),
  exportReport: () => import_electron.ipcRenderer.invoke("report:export")
};
import_electron.contextBridge.exposeInMainWorld("buffet", api);
