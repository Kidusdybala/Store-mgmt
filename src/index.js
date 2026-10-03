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
    ask_remove_name: "What is the name of the item you want to remove?",
    ask_model: (name) => `Got it. What is the model for "${name}"?`,
    ask_add_qty: (model) => `Model set to "${model}". How many are you adding? (Enter a number)`,
    invalid_number: "Please enter a valid positive number.",
    success_add: (qty, name, model) => `✅ Successfully added ${qty}x ${name} (Model: ${model}) to the inventory!`,
    err_not_in_stock: (name, model) => `❌ Error: You don't have any ${name} (Model: ${model}) in stock. Process cancelled.`,
    ask_remove_qty: (max) => `You currently have ${max} in stock. How many do you want to remove? (Enter a number)`,
    err_not_enough: (max) => `You only have ${max} in stock. Please enter a smaller number.`,
    ask_site: "Where is this item going? (Enter the site name)",
    success_remove: (qty, name, model, site) => `✅ Successfully sent ${qty}x ${name} (Model: ${model}) to ${site}!`,
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
    ask_remove_name: "ማውጣት የሚፈልጉት እቃ ስም ማን ይባላል?",
    ask_model: (name) => `ገብቶኛል። ሞዴሉ ምንድነው ለ "${name}"?`,
    ask_add_qty: (model) => `ሞዴል "${model}" ተመዝግቧል። ስንት እያሰገቡ ነው? (ቁጥር ያስገቡ)`,
    invalid_number: "እባክዎ ትክክለኛ አዎንታዊ ቁጥር ያስገቡ።",
    success_add: (qty, name, model) => `✅ በተሳካ ሁኔታ ${qty}x ${name} (ሞዴል: ${model}) ገብቷል!`,
    err_not_in_stock: (name, model) => `❌ ስህተት፡ ምንም ${name} (ሞዴል: ${model}) የለዎትም። ሂደት ተቋርጧል።`,
    ask_remove_qty: (max) => `አሁን ${max} ክምችት አለዎት። ስንት ማውጣት ይፈልጋሉ? (ቁጥር ያስገቡ)`,
    err_not_enough: (max) => `${max} ክምችት ብቻ ነው ያለዎት። ትንሽ ቁጥር ያስገቡ።`,
    ask_site: "ይህ እቃ የት ነው የሚሄደው? (የሳይቱን ስም ያስገቡ)",
    success_remove: (qty, name, model, site) => `✅ በተሳካ ሁኔታ ${qty}x ${name} (ሞዴል: ${model}) ወደ ${site} ተልኳል!`,
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

        // Helper to get user language
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
              [{ text: "🌐 Change Language / ቋንቋ ቀይር", callback_data: "action_lang" }]
            ]
          };
          await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, trans.welcome, keyboard);
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
            const { results } = await env.DB.prepare("SELECT * FROM inventory").all();
            let replyText = t.empty_inventory;
            if (results && results.length > 0) {
              replyText = t.current_inventory + results.map(row => `- ${row.name} (${row.model}) | ${t.qty}: ${row.quantity}`).join("\n");
            }
            await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, replyText);
          } else if (data === "action_add") {
            await setSession("ADD_NAME", {});
            await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.ask_add_name);
          } else if (data === "action_remove") {
            await setSession("REMOVE_NAME", {});
            await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.ask_remove_name);
          } else if (data === "action_reports") {
            const { results } = await env.DB.prepare("SELECT site, name, model, SUM(quantity) as total_qty FROM transactions WHERE action = 'REMOVE' AND site IS NOT NULL GROUP BY site, name, model ORDER BY site ASC").all();
            let replyText = t.no_reports;
            if (results && results.length > 0) {
              replyText = t.site_reports;
              let currentSite = "";
              for (const row of results) {
                if (currentSite !== row.site) {
                  currentSite = row.site;
                  replyText += `📍 ${t.site_label}: ${currentSite}\n`;
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
              // Ask for language on first start
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

          // Check if user is in a session
          const session = await getSession();
          
          if (session) {
            const { step, data } = session;

            if (step === "ADD_NAME") {
              data.name = text;
              await setSession("ADD_MODEL", data);
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.ask_model(text));
            } 
            else if (step === "ADD_MODEL") {
              data.model = text;
              await setSession("ADD_QTY", data);
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.ask_add_qty(text));
            } 
            else if (step === "ADD_QTY") {
              const qty = parseInt(text, 10);
              if (isNaN(qty) || qty <= 0) {
                await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.invalid_number);
                return new Response("OK");
              }
              await env.DB.prepare(`INSERT INTO inventory (name, model, quantity) VALUES (?, ?, ?) ON CONFLICT(name, model) DO UPDATE SET quantity = quantity + ?`).bind(data.name, data.model, qty, qty).run();
              await env.DB.prepare(`INSERT INTO transactions (name, model, quantity, action) VALUES (?, ?, ?, 'ADD')`).bind(data.name, data.model, qty).run();
              await clearSession();
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.success_add(qty, data.name, data.model));
            }
            else if (step === "REMOVE_NAME") {
              data.name = text;
              await setSession("REMOVE_MODEL", data);
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.ask_model(text));
            }
            else if (step === "REMOVE_MODEL") {
              data.model = text;
              const { results } = await env.DB.prepare("SELECT quantity FROM inventory WHERE name = ? AND model = ?").bind(data.name, data.model).all();
              if (!results || results.length === 0 || results[0].quantity === 0) {
                await clearSession();
                await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.err_not_in_stock(data.name, data.model));
                return new Response("OK");
              }
              data.maxQty = results[0].quantity;
              await setSession("REMOVE_QTY", data);
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.ask_remove_qty(data.maxQty));
            }
            else if (step === "REMOVE_QTY") {
              const qty = parseInt(text, 10);
              if (isNaN(qty) || qty <= 0) {
                await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.invalid_number);
                return new Response("OK");
              }
              if (qty > data.maxQty) {
                await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.err_not_enough(data.maxQty));
                return new Response("OK");
              }
              data.qty = qty;
              await setSession("REMOVE_SITE", data);
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.ask_site);
            }
            else if (step === "REMOVE_SITE") {
              const site = text;
              await env.DB.prepare("UPDATE inventory SET quantity = quantity - ? WHERE name = ? AND model = ?").bind(data.qty, data.name, data.model).run();
              await env.DB.prepare(`INSERT INTO transactions (name, model, quantity, action, site) VALUES (?, ?, ?, 'REMOVE', ?)`).bind(data.name, data.model, data.qty, site).run();
              await clearSession();
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, t.success_remove(data.qty, data.name, data.model, site));
            }
            return new Response("OK");
          }

          // Unknown command
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
