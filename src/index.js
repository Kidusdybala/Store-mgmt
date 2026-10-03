export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const payload = await request.json();
        
        const chatId = payload.message?.chat?.id || payload.callback_query?.message?.chat?.id;
        if (!chatId) return new Response("OK");

        // Helper to get session
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

        // Handle Callbacks
        if (payload.callback_query) {
          const callbackQueryId = payload.callback_query.id;
          const data = payload.callback_query.data;
          
          if (data === "action_list") {
            const { results } = await env.DB.prepare("SELECT * FROM inventory").all();
            let replyText = "Your inventory is empty.";
            if (results && results.length > 0) {
              replyText = "Current Inventory:\n\n" + results.map(row => `- ${row.name} (Model: ${row.model}) | Qty: ${row.quantity}`).join("\n");
            }
            await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, replyText);
          } else if (data === "action_add") {
            await setSession("ADD_NAME", {});
            await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, "What is the name of the item you want to add?");
          } else if (data === "action_remove") {
            await setSession("REMOVE_NAME", {});
            await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, "What is the name of the item you want to remove?");
          } else if (data === "action_reports") {
            const { results } = await env.DB.prepare("SELECT site, name, model, SUM(quantity) as total_qty FROM transactions WHERE action = 'REMOVE' AND site IS NOT NULL GROUP BY site, name, model ORDER BY site ASC").all();
            
            let replyText = "No items have been sent to any sites yet.";
            if (results && results.length > 0) {
              replyText = "Site Reports (Items Sent):\n\n";
              let currentSite = "";
              for (const row of results) {
                if (currentSite !== row.site) {
                  currentSite = row.site;
                  replyText += `📍 Site: ${currentSite}\n`;
                }
                replyText += `   - ${row.name} (Model: ${row.model}): ${row.total_qty}\n`;
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
          
          if (text.startsWith("/start") || text.startsWith("/help") || text === "/cancel") {
            await clearSession();
            const replyText = "Welcome to IR Inventory Mgmt Bot!\n\nWhat would you like to do?";
            const keyboard = {
              inline_keyboard: [
                [{ text: "List Inventory", callback_data: "action_list" }],
                [
                  { text: "Add Item", callback_data: "action_add" },
                  { text: "Remove Item", callback_data: "action_remove" }
                ],
                [{ text: "Site Reports", callback_data: "action_reports" }]
              ]
            };
            await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, replyText, keyboard);
            return new Response("OK");
          }

          // Check if user is in a session
          const session = await getSession();
          
          if (session) {
            const { step, data } = session;

            if (step === "ADD_NAME") {
              data.name = text;
              await setSession("ADD_MODEL", data);
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, `Got it. What is the model for "${text}"?`);
            } 
            else if (step === "ADD_MODEL") {
              data.model = text;
              await setSession("ADD_QTY", data);
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, `Model set to "${text}". How many are you adding? (Enter a number)`);
            } 
            else if (step === "ADD_QTY") {
              const qty = parseInt(text, 10);
              if (isNaN(qty) || qty <= 0) {
                await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, "Please enter a valid positive number for the quantity.");
                return new Response("OK");
              }
              
              await env.DB.prepare(`
                INSERT INTO inventory (name, model, quantity) 
                VALUES (?, ?, ?) 
                ON CONFLICT(name, model) DO UPDATE SET quantity = quantity + ?
              `).bind(data.name, data.model, qty, qty).run();

              await env.DB.prepare(`
                INSERT INTO transactions (name, model, quantity, action) VALUES (?, ?, ?, 'ADD')
              `).bind(data.name, data.model, qty).run();

              await clearSession();
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, `Successfully added ${qty}x ${data.name} (Model: ${data.model}) to the inventory!`);
            }
            
            else if (step === "REMOVE_NAME") {
              data.name = text;
              await setSession("REMOVE_MODEL", data);
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, `Got it. What is the model for "${text}"?`);
            }
            else if (step === "REMOVE_MODEL") {
              data.model = text;
              
              // Verify inventory exists
              const { results } = await env.DB.prepare("SELECT quantity FROM inventory WHERE name = ? AND model = ?").bind(data.name, data.model).all();
              if (!results || results.length === 0 || results[0].quantity === 0) {
                await clearSession();
                await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, `Error: You don't have any ${data.name} (Model: ${data.model}) in stock. Process cancelled.`);
                return new Response("OK");
              }
              
              data.maxQty = results[0].quantity;
              await setSession("REMOVE_QTY", data);
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, `You currently have ${data.maxQty} in stock. How many do you want to remove? (Enter a number)`);
            }
            else if (step === "REMOVE_QTY") {
              const qty = parseInt(text, 10);
              if (isNaN(qty) || qty <= 0) {
                await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, "Please enter a valid positive number.");
                return new Response("OK");
              }
              if (qty > data.maxQty) {
                await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, `You only have ${data.maxQty} in stock. Please enter a smaller number.`);
                return new Response("OK");
              }
              
              data.qty = qty;
              await setSession("REMOVE_SITE", data);
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, `Where is this item going? (Enter the site name)`);
            }
            else if (step === "REMOVE_SITE") {
              const site = text;
              
              await env.DB.prepare("UPDATE inventory SET quantity = quantity - ? WHERE name = ? AND model = ?").bind(data.qty, data.name, data.model).run();
              
              await env.DB.prepare(`
                INSERT INTO transactions (name, model, quantity, action, site) VALUES (?, ?, ?, 'REMOVE', ?)
              `).bind(data.name, data.model, data.qty, site).run();

              await clearSession();
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, `Successfully sent ${data.qty}x ${data.name} (Model: ${data.model}) to ${site}!`);
            }

            return new Response("OK");
          }

          // If not in a session and typed something unknown
          await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, "I didn't understand that command. Use /help to see the menu or type /cancel to restart.");
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

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function answerCallbackQuery(token, callbackQueryId) {
  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  });
}
