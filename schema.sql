DROP TABLE IF EXISTS inventory;

CREATE TABLE inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  quantity INTEGER DEFAULT 0,
  UNIQUE(name, model)
);

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  action TEXT NOT NULL, -- 'ADD' or 'REMOVE'
  site TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  chat_id INTEGER PRIMARY KEY,
  step TEXT,
  data TEXT -- Stores JSON data temporarily during the conversation
);
