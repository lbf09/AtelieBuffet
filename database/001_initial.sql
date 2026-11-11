-- MySQL 8.0.16+. O runner adapta apenas PK autoincremental para SQLite demo.
CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY, applied_at VARCHAR(30) NOT NULL);
CREATE TABLE IF NOT EXISTS users (
 id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(200) NOT NULL,
 login VARCHAR(200) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
 role VARCHAR(20) NOT NULL CHECK(role IN ('administrador','atendimento','operacoes')),
 status VARCHAR(20) NOT NULL CHECK(status IN ('ativo','inativo'))
);
CREATE TABLE IF NOT EXISTS clients (
 id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(200) NOT NULL,
 email VARCHAR(200) NOT NULL, phone VARCHAR(200) NOT NULL, notes TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
 id INT PRIMARY KEY AUTO_INCREMENT, client_id INT NOT NULL, name VARCHAR(200) NOT NULL,
 type VARCHAR(20) NOT NULL CHECK(type IN ('aniversario','casamento','corporativo')),
 setup_at DATETIME NOT NULL, starts_at DATETIME NOT NULL, ends_at DATETIME NOT NULL, teardown_at DATETIME NOT NULL,
 guests INT NOT NULL CHECK(guests>0), venue VARCHAR(200) NOT NULL,
 outdoors VARCHAR(10) NOT NULL CHECK(outdoors IN ('aberto','fechado')),
 postal_code VARCHAR(10) NOT NULL, street VARCHAR(200) NOT NULL, number VARCHAR(200) NOT NULL,
 district VARCHAR(200) NOT NULL, city VARCHAR(200) NOT NULL, state CHAR(2) NOT NULL,
 latitude DECIMAL(10,7), longitude DECIMAL(10,7),
 status VARCHAR(25) NOT NULL CHECK(status IN ('rascunho','orcamento_enviado','confirmado','concluido','cancelado')),
 notes TEXT NOT NULL, FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE RESTRICT,
 CHECK(setup_at<=starts_at AND starts_at<ends_at AND ends_at<=teardown_at)
);
CREATE TABLE IF NOT EXISTS menus (
 id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(200) NOT NULL, description TEXT NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('ativo','inativo'))
);
CREATE TABLE IF NOT EXISTS menu_items (
 id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(200) NOT NULL, description TEXT NOT NULL,
 unit VARCHAR(20) NOT NULL, price DECIMAL(10,2) NOT NULL CHECK(price>=0), restrictions TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS menu_compositions (
 id INT PRIMARY KEY AUTO_INCREMENT, menu_id INT NOT NULL, item_id INT NOT NULL,
 quantity DECIMAL(12,3) NOT NULL CHECK(quantity>0), UNIQUE(menu_id,item_id),
 FOREIGN KEY(menu_id) REFERENCES menus(id) ON DELETE RESTRICT,
 FOREIGN KEY(item_id) REFERENCES menu_items(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS event_items (
 id INT PRIMARY KEY AUTO_INCREMENT, event_id INT NOT NULL, item_id INT NOT NULL,
 quantity DECIMAL(12,3) NOT NULL CHECK(quantity>0), unit_price DECIMAL(10,2) NOT NULL CHECK(unit_price>=0),
 UNIQUE(event_id,item_id), FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE RESTRICT,
 FOREIGN KEY(item_id) REFERENCES menu_items(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS suppliers (
 id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(200) NOT NULL, category VARCHAR(200) NOT NULL,
 contact VARCHAR(200) NOT NULL, phone VARCHAR(200) NOT NULL, email VARCHAR(200) NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('ativo','inativo'))
);
CREATE TABLE IF NOT EXISTS event_suppliers (
 id INT PRIMARY KEY AUTO_INCREMENT, event_id INT NOT NULL, supplier_id INT NOT NULL,
 service VARCHAR(200) NOT NULL, cost DECIMAL(10,2) NOT NULL CHECK(cost>=0),
 status VARCHAR(20) NOT NULL CHECK(status IN ('previsto','confirmado','cancelado')),
 UNIQUE(event_id,supplier_id,service), FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE RESTRICT,
 FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS employees (
 id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(200) NOT NULL, job VARCHAR(200) NOT NULL,
 phone VARCHAR(200) NOT NULL, email VARCHAR(200) NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('ativo','inativo'))
);
CREATE TABLE IF NOT EXISTS event_staff (
 id INT PRIMARY KEY AUTO_INCREMENT, event_id INT NOT NULL, employee_id INT NOT NULL,
 job VARCHAR(200) NOT NULL, starts_at DATETIME NOT NULL, ends_at DATETIME NOT NULL,
 cost DECIMAL(10,2) NOT NULL CHECK(cost>=0), UNIQUE(event_id,employee_id),
 FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE RESTRICT,
 FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
 CHECK(starts_at<ends_at)
);
CREATE TABLE IF NOT EXISTS quotes (
 id INT PRIMARY KEY AUTO_INCREMENT, event_id INT NOT NULL, created_by INT NOT NULL,
 version INT NOT NULL, valid_until DATE NOT NULL, freight_base DECIMAL(10,2) NOT NULL,
 distance_km DECIMAL(12,3) NOT NULL, rate_km DECIMAL(10,2) NOT NULL,
 trips INT NOT NULL CHECK(trips IN (1,2)), distance_source VARCHAR(30) NOT NULL,
 extra DECIMAL(10,2) NOT NULL, discount DECIMAL(10,2) NOT NULL,
 subtotal DECIMAL(10,2) NOT NULL, freight DECIMAL(10,2) NOT NULL, total DECIMAL(10,2) NOT NULL CHECK(total>=0),
 status VARCHAR(20) NOT NULL CHECK(status IN ('rascunho','enviado','aprovado','recusado','expirado')),
 snapshot TEXT NOT NULL, notes TEXT NOT NULL, UNIQUE(event_id,version),
 FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE RESTRICT,
 FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT
);
-- Histórico técnico imutável: confirmar exceção de CRUD com o professor.
CREATE TABLE IF NOT EXISTS email_attempts (
 id INT PRIMARY KEY AUTO_INCREMENT, quote_id INT NOT NULL, user_id INT NOT NULL,
 kind VARCHAR(20) NOT NULL, status VARCHAR(30) NOT NULL, provider_id VARCHAR(200),
 attempted_at VARCHAR(30) NOT NULL,
 FOREIGN KEY(quote_id) REFERENCES quotes(id) ON DELETE RESTRICT,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX idx_events_date ON events(starts_at);
CREATE INDEX idx_staff_conflict ON event_staff(employee_id,starts_at,ends_at);
CREATE INDEX idx_quotes_event ON quotes(event_id,status);
