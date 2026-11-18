-- 002: precificação por faixa, cardápio do evento, financeiro, cancelamento e histórico.
-- O runner aplica apenas os comandos marcados com @mysql ou @sqlite no banco correspondente.

ALTER TABLE menu_items ADD COLUMN cost DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN adults INT NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN menu_id INT NULL;
ALTER TABLE events ADD COLUMN archived INT NOT NULL DEFAULT 0;
UPDATE events SET adults = guests WHERE adults = 0;

CREATE TABLE IF NOT EXISTS child_bands (
 id INT PRIMARY KEY AUTO_INCREMENT, label VARCHAR(50) NOT NULL,
 min_age INT NOT NULL, max_age INT NOT NULL,
 percent DECIMAL(5,2) NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('ativo','inativo')),
 CHECK(min_age >= 0 AND max_age >= min_age AND percent >= 0 AND percent <= 100)
);
CREATE TABLE IF NOT EXISTS price_bands (
 id INT PRIMARY KEY AUTO_INCREMENT, menu_id INT NOT NULL,
 min_guests INT NOT NULL CHECK(min_guests >= 1), max_guests INT NULL,
 price_per_adult DECIMAL(10,2) NOT NULL CHECK(price_per_adult >= 0),
 min_billing_guests INT NOT NULL DEFAULT 0,
 CHECK(max_guests IS NULL OR max_guests >= min_guests),
 FOREIGN KEY(menu_id) REFERENCES menus(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS event_guests (
 id INT PRIMARY KEY AUTO_INCREMENT, event_id INT NOT NULL, child_band_id INT NOT NULL,
 quantity INT NOT NULL CHECK(quantity >= 0), UNIQUE(event_id,child_band_id),
 FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
 FOREIGN KEY(child_band_id) REFERENCES child_bands(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS event_menu_items (
 id INT PRIMARY KEY AUTO_INCREMENT, event_id INT NOT NULL, item_id INT NOT NULL,
 quantity DECIMAL(12,3) NOT NULL CHECK(quantity >= 0), UNIQUE(event_id,item_id),
 FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
 FOREIGN KEY(item_id) REFERENCES menu_items(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS installments (
 id INT PRIMARY KEY AUTO_INCREMENT, event_id INT NOT NULL, due_date DATE NOT NULL,
 amount DECIMAL(10,2) NOT NULL CHECK(amount >= 0),
 paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK(paid_amount >= 0),
 paid_at DATE NULL, kind VARCHAR(20) NOT NULL CHECK(kind IN ('sinal','parcela')),
 notes TEXT NOT NULL, CHECK(paid_amount <= amount),
 FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS change_history (
 id INT PRIMARY KEY AUTO_INCREMENT, quote_id INT NOT NULL, user_id INT NOT NULL,
 changed_at VARCHAR(30) NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL,
 FOREIGN KEY(quote_id) REFERENCES quotes(id) ON DELETE RESTRICT,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS cancellations (
 id INT PRIMARY KEY AUTO_INCREMENT, event_id INT NOT NULL UNIQUE, user_id INT NOT NULL,
 cancelled_at VARCHAR(30) NOT NULL, penalty_amount DECIMAL(10,2) NOT NULL CHECK(penalty_amount >= 0),
 refund_amount DECIMAL(10,2) NOT NULL CHECK(refund_amount >= 0), reason TEXT NOT NULL,
 FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE RESTRICT,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
);

ALTER TABLE quotes ADD COLUMN menu_id INT NULL;
ALTER TABLE quotes ADD COLUMN price_band_id INT NULL;
ALTER TABLE quotes ADD COLUMN adults INT NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN children INT NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN adult_unit_price DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN child_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN cost_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN margin_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN tax_percent DECIMAL(5,2) NOT NULL DEFAULT 6;
ALTER TABLE quotes ADD COLUMN deposit_percent DECIMAL(5,2) NOT NULL DEFAULT 30;
ALTER TABLE quotes ADD COLUMN deposit_required DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN archived INT NOT NULL DEFAULT 0;
UPDATE quotes SET menu_id = (SELECT menu_id FROM events WHERE events.id = quotes.event_id) WHERE menu_id IS NULL;
UPDATE quotes SET adults = (SELECT adults FROM events WHERE events.id = quotes.event_id) WHERE adults = 0;

CREATE INDEX idx_price_bands_menu ON price_bands(menu_id,min_guests);
CREATE INDEX idx_event_guests_event ON event_guests(event_id);
CREATE INDEX idx_installments_event ON installments(event_id,due_date);
CREATE INDEX idx_change_history_quote ON change_history(quote_id,changed_at);

-- @mysql
ALTER TABLE events ADD CONSTRAINT fk_events_menu FOREIGN KEY(menu_id) REFERENCES menus(id) ON DELETE SET NULL;
-- @mysql
ALTER TABLE quotes ADD CONSTRAINT fk_quotes_menu FOREIGN KEY(menu_id) REFERENCES menus(id) ON DELETE SET NULL;
-- @mysql
ALTER TABLE quotes ADD CONSTRAINT fk_quotes_price_band FOREIGN KEY(price_band_id) REFERENCES price_bands(id) ON DELETE SET NULL;
