CREATE TABLE IF NOT EXISTS users (
  chat_id INTEGER PRIMARY KEY,
  language TEXT DEFAULT 'en'
);

CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  quantity INTEGER DEFAULT 0,
  UNIQUE(name, model)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  action TEXT NOT NULL, -- 'ADD' or 'REMOVE'
  site TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  chat_id INTEGER PRIMARY KEY,
  step TEXT,
  data TEXT -- Stores JSON data temporarily during the conversation
);
