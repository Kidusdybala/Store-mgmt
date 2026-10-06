const i18n = {
  en: {
    choose_lang: "Please choose your language / እባክዎ ቋንቋ ይምረጡ",
    welcome: "Welcome to IR Inventory Mgmt Bot!\n\nWhat would you like to do?",
    btn_list: "List Inventory",
    btn_add: "Add Item",
    btn_remove: "Remove Item",
    btn_reports: "Site Reports",
    empty_inventory: "Your inventory is empty.",
    current_inventory: "Current Inventory:\n\n",
    ask_add_name: "What is the name of the item you want to add?",
    ask_model: (name) => `Got it. What is the model for "${name}"?`,
    ask_add_qty: (model) => `Model set to "${model}". How many are you adding? (Enter a number)`,
    invalid_number: "Invalid input. Please enter a valid positive number.",
    success_add: (qty, name, model) => `We have successfully received ${qty}x ${name} (Model: ${model}) into inventory!`,
    select_item_remove: "Select an item from inventory to remove:",
    no_items_to_remove: "There are no items currently in stock. Nothing can be removed.",
    ask_remove_qty: (name, model, max) => `You selected: ${name} (Model: ${model})\nAvailable in store: ${max}\n\nHow many do you want to remove?`,
    err_not_enough: (requested, max) => `Cannot remove ${requested}. Only ${max} available in store. Please enter a number between 1 and ${max}.`,
    err_stock_changed: "The stock level changed while you were processing. Please start again.",
    ask_site: "Where is this item going? (Enter the site name)",
    success_remove: (qty, name, model, site) => `Successfully sent ${qty}x ${name} (Model: ${model}) to ${site}!`,
    no_reports: "No items have been sent to any sites yet.",
    site_reports: "Site Reports (Items Sent):\n\n",
    site_label: "Site",
    qty: "Qty",
    unknown: "I didn't understand that command. Use /help to see the menu or type /cancel to restart.",
  },
  am: {
    choose_lang: "Please choose your language / እባክዎ ቋንቋ ይምረጡ",
    welcome: "ወደ IR እቃ ማስተዳደሪያ ቦት በደህና መጡ!\n\nምን ማድረግ ይፈልጋሉ?",
    btn_list: "እቃዎችን ዘርዝር",
    btn_add: "እቃ አስገባ",
    btn_remove: "እቃ አውጣ",
    btn_reports: "የሳይት ሪፖርቶች",
    empty_inventory: "ማከማቻዎ ባዶ ነው።",
    current_inventory: "አሁን ያለ እቃ፡\n\n",
    ask_add_name: "ማስገባት የሚፈልጉት እቃ ስም ማን ይባላል?",
    ask_model: (name) => `ገብቶኛል። ሞዴሉ ምንድነው ለ "${name}"?`,
    ask_add_qty: (model) => `ሞዴል "${model}" ተመዝግቧል። ስንት እያሰገቡ ነው? (ቁጥር ያስገቡ)`,
    invalid_number: "ትክክል ያልሆነ ቁጥር። እባክዎ አዎንታዊ ቁጥር ያስገቡ።",
    success_add: (qty, name, model) => `${qty}x ${name} (ሞዴል: ${model}) በተሳካ ሁኔታ ተቀብለናል!`,
    select_item_remove: "ማውጣት የሚፈልጉትን እቃ ይምረጡ፡",
    no_items_to_remove: "አሁን ምንም እቃ ክምችት ውስጥ የለም። ምንም ማውጣት አይቻልም።",
    ask_remove_qty: (name, model, max) => `የመረጡት: ${name} (ሞዴል: ${model})\nበክምችት ውስጥ ያለ: ${max}\n\nስንት ማውጣት ይፈልጋሉ?`,
    err_not_enough: (requested, max) => `${requested} ማውጣት አይቻልም። በክምችት ውስጥ ${max} ብቻ አለ። ከ 1 እስከ ${max} ቁጥር ያስገቡ።`,
    err_stock_changed: "ክምችቱ ሲሰሩ ተቀይሯል። እባክዎ እንደገና ይጀምሩ።",
    ask_site: "ይህ እቃ የት ነው የሚሄደው? (የሳይቱን ስም ያስገቡ)",
    success_remove: (qty, name, model, site) => `በተሳካ ሁኔታ ${qty}x ${name} (ሞዴል: ${model}) ወደ ${site} ተልኳል!`,
    no_reports: "ምንም እቃ ወደ ሳይት አልተላከም።",
    site_reports: "የሳይት ሪፖርቶች (የተላኩ እቃዎች)፡\n\n",
    site_label: "ሳይት",
    qty: "ብዛት",
    unknown: "ይህ ትእዛዝ አልገባኝም። /help ይጫኑ ወይም /cancel ብለው ይጀምሩ።",
  }
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const payload = await request.json();
        const chatId = payload.message?.chat?.id || payload.callback_query?.message?.chat?.id;
        if (!chatId) return new Response("OK");

        // Language helpers
        const getUserLang = async () => {
          const { results } = await env.DB.prepare("SELECT language FROM users WHERE chat_id = ?").bind(chatId).all();
          return (results && results.length > 0) ? results[0].language : null;
        };
        const setUserLang = async (lang) => {
          await env.DB.prepare(
            "INSERT INTO users (chat_id, language) VALUES (?, ?) ON CONFLICT(chat_id) DO UPDATE SET language = ?"
          ).bind(chatId, lang, lang).run();
        };

        const langCode = (await getUserLang()) || 'en';
        const t = i18n[langCode];

        // Session helpers
        const getSession = async () => {
          const { results } = await env.DB.prepare("SELECT * FROM sessions WHERE chat_id = ?").bind(chatId).all();
          return results && results.length > 0 ? { step: results[0].step, data: JSON.parse(results[0].data || "{}") } : null;
        };
        const setSession = async (step, data) => {
          await env.DB.prepare(
            "INSERT INTO sessions (chat_id, step, data) VALUES (?, ?, ?) ON CONFLICT(chat_id) DO UPDATE SET step = ?, data = ?"
          ).bind(chatId, step, JSON.stringify(data), step, JSON.stringify(data)).run();
        };
        const clearSession = async () => {
          await env.DB.prepare("DELETE FROM sessions WHERE chat_id = ?").bind(chatId).run();
        };

        const showMenu = async (locale) => {
          const trans = i18n[locale];
          const keyboard = {
            inline_keyboard: [
              [{ text: trans.btn_list, callback_data: "action_list" }],
              [
                { text: trans.btn_add, callback_data: "action_add" },
                { text: trans.btn_remove, callback_data: "action_remove" }
              ],
              [{ text: trans.btn_reports, callback_data: "action_reports" }],
              [{ text: "Change Language / ቋንቋ ቀይር", callback_data: "action_lang" }]
            ]
          };
          await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, trans.welcome, keyboard);
        };

        // Show inventory as buttons for removal
        const showInventoryButtons = async () => {
          const { results } = await env.DB.prepare("SELECT * FROM inventory WHERE quantity > 0 ORDER BY name ASC").all();
          if (!results || results.length === 0) {
            await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.no_items_to_remove);
            return;
          }
          // Build inline keyboard - each item is a button showing name, model, qty
          // Store item id in callback_data for precise selection
          const rows = results.map(row => ([{
            text: `${row.name} | ${row.model} | Qty: ${row.quantity}`,
            callback_data: `remove_item:${row.id}`
          }]));
          const keyboard = { inline_keyboard: rows };
          await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.select_item_remove, keyboard);
        };

        // Handle Callbacks
        if (payload.callback_query) {
          const callbackQueryId = payload.callback_query.id;
          const data = payload.callback_query.data;

          if (data === "action_lang_en") {
            await setUserLang("en");
            await showMenu("en");
          } else if (data === "action_lang_am") {
            await setUserLang("am");
            await showMenu("am");
          } else if (data === "action_lang") {
            const kb = {
              inline_keyboard: [
                [{ text: "English", callback_data: "action_lang_en" }, { text: "አማርኛ", callback_data: "action_lang_am" }]
              ]
            };
            await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, "Choose Language / ቋንቋ ይምረጡ", kb);

          } else if (data === "action_list") {
            const { results } = await env.DB.prepare("SELECT * FROM inventory WHERE quantity > 0 ORDER BY name ASC").all();
            let replyText = t.empty_inventory;
            if (results && results.length > 0) {
              replyText = t.current_inventory + results.map(row => `- ${row.name} (${row.model}) | ${t.qty}: ${row.quantity}`).join("\n");
            }
            await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, replyText);

          } else if (data === "action_add") {
            await clearSession();
            await setSession("ADD_NAME", {});
            await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.ask_add_name);

          } else if (data === "action_remove") {
            await clearSession();
            // Show all in-stock items as buttons
            await showInventoryButtons();

          } else if (data.startsWith("remove_item:")) {
            // User tapped an inventory item button
            const itemId = parseInt(data.split(":")[1], 10);
            const { results } = await env.DB.prepare("SELECT * FROM inventory WHERE id = ? AND quantity > 0").bind(itemId).all();

            if (!results || results.length === 0) {
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.no_items_to_remove);
            } else {
              const item = results[0];
              await setSession("REMOVE_QTY", { id: item.id, name: item.name, model: item.model, maxQty: item.quantity });
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.ask_remove_qty(item.name, item.model, item.quantity));
            }

          } else if (data === "action_reports") {
            const { results } = await env.DB.prepare(
              "SELECT site, name, model, SUM(quantity) as total_qty FROM transactions WHERE action = 'REMOVE' AND site IS NOT NULL GROUP BY site, name, model ORDER BY site ASC"
            ).all();
            let replyText = t.no_reports;
            if (results && results.length > 0) {
              replyText = t.site_reports;
              let currentSite = "";
              for (const row of results) {
                if (currentSite !== row.site) {
                  currentSite = row.site;
                  replyText += `${t.site_label}: ${currentSite}\n`;
                }
                replyText += `   - ${row.name} (${row.model}): ${row.total_qty}\n`;
              }
            }
            await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, replyText);
          }

          await answerCallbackQuery(env.SECRET_TELEGRAM_API_TOKEN, callbackQueryId);
          return new Response("OK");
        }

        // Handle Text Messages
        if (payload.message && payload.message.text) {
          const text = payload.message.text.trim();
          const userLangObj = await getUserLang();

          if (text.startsWith("/start") || text.startsWith("/help") || text === "/cancel") {
            await clearSession();
            if (!userLangObj) {
              const kb = {
                inline_keyboard: [
                  [{ text: "English", callback_data: "action_lang_en" }, { text: "አማርኛ", callback_data: "action_lang_am" }]
                ]
              };
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, "Welcome! Please choose your language / እባክዎ ቋንቋ ይምረጡ", kb);
            } else {
              await showMenu(userLangObj);
            }
            return new Response("OK");
          }

          const session = await getSession();

          if (session) {
            const { step, data } = session;

            // --- ADD FLOW ---
            if (step === "ADD_NAME") {
              data.name = text;
              await setSession("ADD_MODEL", data);
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.ask_model(text));
            }
            else if (step === "ADD_MODEL") {
              data.model = text;
              await setSession("ADD_QTY", data);
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.ask_add_qty(data.model));
            }
            else if (step === "ADD_QTY") {
              const qty = parseInt(text, 10);
              if (isNaN(qty) || qty <= 0) {
                await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.invalid_number);
                return new Response("OK");
              }
              await env.DB.prepare(
                "INSERT INTO inventory (name, model, quantity) VALUES (?, ?, ?) ON CONFLICT(name, model) DO UPDATE SET quantity = quantity + ?"
              ).bind(data.name, data.model, qty, qty).run();
              await env.DB.prepare(
                "INSERT INTO transactions (name, model, quantity, action) VALUES (?, ?, ?, 'ADD')"
              ).bind(data.name, data.model, qty).run();
              await clearSession();
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.success_add(qty, data.name, data.model));
              await showMenu(langCode);
            }

            // --- REMOVE FLOW (after item selected via button) ---
            else if (step === "REMOVE_QTY") {
              const qty = parseInt(text, 10);
              if (isNaN(qty) || qty <= 0) {
                await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.invalid_number);
                return new Response("OK");
              }
              if (qty > data.maxQty) {
                await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.err_not_enough(qty, data.maxQty));
                return new Response("OK");
              }
              data.qty = qty;
              await setSession("REMOVE_SITE", data);
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.ask_site);
            }
            else if (step === "REMOVE_SITE") {
              const site = text;

              // Final re-check: make sure stock hasn't changed since user started
              const { results: freshStock } = await env.DB.prepare(
                "SELECT quantity FROM inventory WHERE id = ?"
              ).bind(data.id).all();

              if (!freshStock || freshStock.length === 0 || freshStock[0].quantity < data.qty) {
                await clearSession();
                const available = freshStock?.[0]?.quantity ?? 0;
                if (available === 0) {
                  await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.no_items_to_remove);
                } else {
                  await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.err_not_enough(data.qty, available));
                }
                return new Response("OK");
              }

              await env.DB.prepare(
                "UPDATE inventory SET quantity = quantity - ? WHERE id = ?"
              ).bind(data.qty, data.id).run();
              await env.DB.prepare(
                "INSERT INTO transactions (name, model, quantity, action, site) VALUES (?, ?, ?, 'REMOVE', ?)"
              ).bind(data.name, data.model, data.qty, site).run();
              await clearSession();
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.success_remove(data.qty, data.name, data.model, site));
              await showMenu(langCode);
            }

            return new Response("OK");
          }

          // Unknown
          await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.unknown);
        }
      } catch (err) {
        console.error("Error handling request", err);
      }
    }
    return new Response("OK");
  }
};

async function sendMessage(token, chatId, text, replyMarkup = null) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = { chat_id: chatId, text: text };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function answerCallbackQuery(token, callbackQueryId) {
  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: callbackQueryId }) });
}
