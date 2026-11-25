-- Repara a coluna ignorada pelo leitor antigo de migrações no SQLite.
-- @sqlite
ALTER TABLE menu_items ADD COLUMN cost DECIMAL(10,2) NOT NULL DEFAULT 0;
