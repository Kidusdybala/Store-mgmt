export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const payload = await request.json();
        
        // Handle Callback Queries (when an inline button is pressed)
        if (payload.callback_query) {
          const callbackQueryId = payload.callback_query.id;
          const chatId = payload.callback_query.message.chat.id;
          const data = payload.callback_query.data;
          
          let replyText = "";
          
          if (data === "action_list") {
            const { results } = await env.DB.prepare("SELECT * FROM inventory").all();
            if (!results || results.length === 0) {
              replyText = "Your inventory is empty.";
            } else {
              replyText = "Current Inventory:\n" + results.map(row => `- ${row.name}: ${row.quantity}`).join("\n");
            }
          } else if (data === "action_add") {
            replyText = "To add an item, type:\n/add <item_name>\n\nExample: /add Laptops";
          } else if (data === "action_remove") {
            replyText = "To remove an item, type:\n/remove <item_name>\n\nExample: /remove Laptops";
          }
          
          await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, replyText);
          await answerCallbackQuery(env.SECRET_TELEGRAM_API_TOKEN, callbackQueryId);
        } 
        // Handle Text Messages
        else if (payload.message && payload.message.text) {
          const chatId = payload.message.chat.id;
          const text = payload.message.text.trim();
          
          if (text.startsWith("/start") || text.startsWith("/help")) {
            const replyText = "Welcome to IR Inventory Mgmt Bot!\n\nWhat would you like to do?";
            const keyboard = {
              inline_keyboard: [
                [{ text: "List Inventory", callback_data: "action_list" }],
                [
                  { text: "Add Item", callback_data: "action_add" },
                  { text: "Remove Item", callback_data: "action_remove" }
                ]
              ]
            };
            await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, replyText, keyboard);
          } 
          else if (text.startsWith("/list")) {
            const { results } = await env.DB.prepare("SELECT * FROM inventory").all();
            let replyText = "Your inventory is empty.";
            if (results && results.length > 0) {
              replyText = "Current Inventory:\n" + results.map(row => `- ${row.name}: ${row.quantity}`).join("\n");
            }
            await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, replyText);
          }
          else if (text.startsWith("/add")) {
            const item = text.replace("/add", "").trim();
            if (item) {
              // Insert or update quantity if it already exists
              await env.DB.prepare(`
                INSERT INTO inventory (name, quantity) 
                VALUES (?, 1) 
                ON CONFLICT(name) DO UPDATE SET quantity = quantity + 1
              `).bind(item).run();
              
              const { results } = await env.DB.prepare("SELECT quantity FROM inventory WHERE name = ?").bind(item).all();
              const newQty = results[0].quantity;
              
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, `Added! You now have ${newQty}x "${item}" in stock.`);
            } else {
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, "Please specify an item to add. Example: /add Laptops");
            }
          } 
          else if (text.startsWith("/remove")) {
            const item = text.replace("/remove", "").trim();
            if (item) {
              // Check current quantity
              const { results } = await env.DB.prepare("SELECT quantity FROM inventory WHERE name = ?").bind(item).all();
              
              if (!results || results.length === 0) {
                await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, `Error: "${item}" is not in the inventory.`);
              } else {
                const currentQty = results[0].quantity;
                if (currentQty > 1) {
                  await env.DB.prepare("UPDATE inventory SET quantity = quantity - 1 WHERE name = ?").bind(item).run();
                  await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, `Removed 1 "${item}". Remaining: ${currentQty - 1}`);
                } else {
                  await env.DB.prepare("DELETE FROM inventory WHERE name = ?").bind(item).run();
                  await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, `Removed the last "${item}". It is now out of stock.`);
                }
              }
            } else {
              await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, "Please specify an item to remove. Example: /remove Laptops");
            }
          } 
          else {
             await sendMessage(env.SECRET_TELEGRAM_API_TOKEN, chatId, "I didn't understand that command. Use /help to see available options.");
          }
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
  const body = {
    chat_id: chatId,
    text: text
  };
  
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

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
    body: JSON.stringify({
      callback_query_id: callbackQueryId
    })
  });
}
