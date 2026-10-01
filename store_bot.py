"""
Telegram store-tracking bot (guided, with item name + model).

Setup:
  pip install "python-telegram-bot>=20"
  export BOT_TOKEN="123456:ABC..."   # from @BotFather
  export ALLOWED_IDS="11111111"      # your Telegram ID (send /myid to the bot to see it)
  python store_bot.py
"""
import os
import re
import math
import sqlite3
import logging
from datetime import datetime

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, ApplicationHandlerStop, CallbackQueryHandler,
    CommandHandler, ContextTypes, ConversationHandler, MessageHandler,
    TypeHandler, filters,
)

logging.basicConfig(level=logging.INFO)

TOKEN = os.environ["BOT_TOKEN"]
ALLOWED = {int(x) for x in os.environ.get("ALLOWED_IDS", "").split(",") if x.strip()}
DB_FILE = os.environ.get("DB_FILE", "store.db")
MAX_NAME = 60
MAX_QTY = 1_000_000

HELP = """📦 Store Bot

/in    – receive items (name + model + quantity)
/out   – send items to a site (asks item, quantity, site)
/stock – what is left in store (per item & model)
/stock cement – one item (all its models)
/site  – choose a site, or: /site Bole Project
/report – all sites, total of each item & model
/where cement – where an item went (per site)
/history – last 15 movements
/undo – delete the last movement
/cancel – cancel what you are doing
/myid – show your Telegram ID
"""

IN_ITEM, IN_MODEL, IN_QTY, IN_CONFIRM = range(4)
OUT_ITEM, OUT_QTY, OUT_SITE, OUT_CONFIRM = range(4, 8)


# ------------------------------------------------------------------ database
def db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with db() as c:
        c.execute(
            """CREATE TABLE IF NOT EXISTS moves (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                item TEXT NOT NULL,
                model TEXT NOT NULL DEFAULT '',
                qty REAL NOT NULL,
                kind TEXT NOT NULL,   -- 'IN' or 'OUT'
                site TEXT,            -- for OUT
                note TEXT,            -- supplier for IN
                user TEXT
            )"""
        )
        # upgrade older databases that don't have the model column yet
        cols = [r["name"] for r in c.execute("PRAGMA table_info(moves)")]
        if "model" not in cols:
            c.execute("ALTER TABLE moves ADD COLUMN model TEXT NOT NULL DEFAULT ''")


def stock_of(c, item, model):
    return c.execute(
        "SELECT COALESCE(SUM(CASE kind WHEN 'IN' THEN qty ELSE -qty END),0) s "
        "FROM moves WHERE item=? AND model=?", (item, model)
    ).fetchone()["s"]


def sent_to_site(c, item, model, site):
    return c.execute(
        "SELECT COALESCE(SUM(qty),0) s FROM moves WHERE kind='OUT' AND item=? AND model=? AND site=?",
        (item, model, site),
    ).fetchone()["s"]


def all_products(c):
    return [(r["item"], r["model"]) for r in
            c.execute("SELECT DISTINCT item, model FROM moves ORDER BY item, model")]


def products_in_stock(c):
    rows = c.execute(
        "SELECT item, model, SUM(CASE kind WHEN 'IN' THEN qty ELSE -qty END) s "
        "FROM moves GROUP BY item, model HAVING s > 0 ORDER BY item, model"
    ).fetchall()
    return [(r["item"], r["model"]) for r in rows]


def all_sites(c):
    return [r["site"] for r in c.execute(
        "SELECT DISTINCT site FROM moves WHERE kind='OUT' ORDER BY LOWER(site)")]


# ------------------------------------------------------------------- helpers
def fmt(n):
    return str(int(n)) if float(n).is_integer() else f"{n:.2f}"


def clean(s):
    return re.sub(r"\s+", " ", s.strip())


def label(item, model):
    return f"{item} – {model}" if model else item


def norm(s):
    """for matching what the user typed against item/model names"""
    return re.sub(r"\s+", " ", re.sub(r"[-–]", " ", s.lower())).strip()


def match_products(products, text):
    t = norm(text)
    exact = [p for p in products if norm(f"{p[0]} {p[1]}") == t]
    if exact:
        return exact
    return [p for p in products if norm(p[0]) == t]


def canon(existing_names, name):
    """reuse the existing spelling if the name already exists (case-insensitive)"""
    for n in existing_names:
        if n.lower() == name.lower():
            return n
    return name


def parse_qty(text):
    t = text.replace(",", "").strip()
    q = float(t)
    if not math.isfinite(q) or q <= 0 or q > MAX_QTY:
        raise ValueError
    return q


def valid_name(s):
    return 0 < len(s) <= MAX_NAME


def kb(options, prefix, extra_rows=()):
    rows, row = [], []
    for i, name in enumerate(options):
        row.append(InlineKeyboardButton(name, callback_data=f"{prefix}:{i}"))
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    rows.extend(extra_rows)
    rows.append([InlineKeyboardButton("✖ Cancel", callback_data="cancel")])
    return InlineKeyboardMarkup(rows)


def confirm_kb():
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Confirm", callback_data="confirm:yes"),
        InlineKeyboardButton("✖ Cancel", callback_data="cancel"),
    ]])


async def say(update: Update, text, markup=None):
    if update.callback_query:
        await update.callback_query.answer()
        return await update.callback_query.message.reply_text(text, reply_markup=markup)
    return await update.message.reply_text(text, reply_markup=markup)


async def say_long(update: Update, text):
    for i in range(0, len(text), 3800):
        await say(update, text[i:i + 3800])


# ---------------------------------------------------------------- access gate
async def gatekeeper(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not ALLOWED:
        return
    msg = update.effective_message
    if msg and msg.text and msg.text.startswith("/myid"):
        return
    user = update.effective_user
    if not user or user.id not in ALLOWED:
        if msg:
            await msg.reply_text("⛔ You are not allowed to use this bot.")
        raise ApplicationHandlerStop


async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(HELP)


async def myid(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(f"Your Telegram ID: {update.effective_user.id}")


async def cancel(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data.clear()
    await say(update, "Cancelled. Nothing was saved.")
    return ConversationHandler.END


# ============================================================= /in (receive)
async def in_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data.clear()
    with db() as c:
        products = all_products(c)
    ctx.user_data["choices"] = products
    text = ("⬇️ Receiving items.\nTap an existing item to add stock, or type a NEW item name."
            if products else "⬇️ Receiving items.\nType the item name (e.g. steel bar).")
    await say(update, text, kb([label(*p) for p in products], "item"))
    return IN_ITEM


async def in_ask_qty(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    d = ctx.user_data
    with db() as c:
        now = stock_of(c, d["item"], d["model"])
    await say(update,
              f"Item: {label(d['item'], d['model'])}\n📦 In store now: {fmt(now)}\n"
              "How many are arriving? (number only)")
    return IN_QTY


async def in_item_cb(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    idx = int(update.callback_query.data.split(":")[1])
    try:
        item, model = ctx.user_data["choices"][idx]
    except (KeyError, IndexError):
        return await cancel(update, ctx)
    ctx.user_data.update(item=item, model=model)
    return await in_ask_qty(update, ctx)


async def in_item_text(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    text = clean(update.message.text)
    if not valid_name(text):
        await update.message.reply_text(f"❌ Name must be 1–{MAX_NAME} characters. Try again.")
        return IN_ITEM
    # typed an existing "item model" combination -> use it directly
    found = match_products(ctx.user_data.get("choices", []), text)
    if len(found) == 1 and norm(f"{found[0][0]} {found[0][1]}") == norm(text):
        ctx.user_data.update(item=found[0][0], model=found[0][1])
        return await in_ask_qty(update, ctx)
    with db() as c:
        names = {p[0] for p in all_products(c)}
    ctx.user_data["item"] = canon(names, text)
    skip = InlineKeyboardMarkup([[InlineKeyboardButton("No model", callback_data="nomodel")]])
    await update.message.reply_text(
        f"Item: {ctx.user_data['item']}\nWhat is the MODEL name? (e.g. 12mm, Dangote, XR-200)\n"
        "Or tap 'No model'.", reply_markup=skip)
    return IN_MODEL


async def in_model_text(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    model = clean(update.message.text)
    if not valid_name(model):
        await update.message.reply_text(f"❌ Model must be 1–{MAX_NAME} characters. Try again.")
        return IN_MODEL
    with db() as c:
        models = {p[1] for p in all_products(c) if p[0] == ctx.user_data["item"]}
    ctx.user_data["model"] = canon(models, model)
    return await in_ask_qty(update, ctx)


async def in_model_none(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data["model"] = ""
    return await in_ask_qty(update, ctx)


async def in_qty(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    try:
        qty = parse_qty(update.message.text)
    except ValueError:
        await update.message.reply_text("❌ Please send a number greater than 0 (e.g. 50 or 12.5).")
        return IN_QTY
    ctx.user_data["qty"] = qty
    return await in_ask_confirm(update, ctx)


async def in_ask_confirm(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    d = ctx.user_data
    with db() as c:
        now = stock_of(c, d["item"], d["model"])
    await say(update,
              f"Please confirm:\n⬇️ Receive {fmt(d['qty'])} × {label(d['item'], d['model'])}\n"
              f"📦 Store after: {fmt(now + d['qty'])}", confirm_kb())
    return IN_CONFIRM


async def in_confirm(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    d = ctx.user_data
    if not all(k in d for k in ("item", "model", "qty")):
        return await cancel(update, ctx)
    with db() as c:
        c.execute(
            "INSERT INTO moves (ts,item,model,qty,kind,user) VALUES (?,?,?,?,?,?)",
            (datetime.now().isoformat(timespec="seconds"), d["item"], d["model"], d["qty"], "IN",
             update.effective_user.first_name),
        )
        left = stock_of(c, d["item"], d["model"])
    await say(update, f"✅ Saved. Received {fmt(d['qty'])} × {label(d['item'], d['model'])}\n"
                      f"📦 Now in store: {fmt(left)}")
    ctx.user_data.clear()
    return ConversationHandler.END


# ============================================================ /out (send out)
async def out_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data.clear()
    with db() as c:
        products = products_in_stock(c)
    if not products:
        await say(update, "📭 The store is empty – nothing to send. Use /in first.")
        return ConversationHandler.END
    ctx.user_data["choices"] = products
    await say(update, "⬆️ Sending items out.\nWhich item?", kb([label(*p) for p in products], "item"))
    return OUT_ITEM


async def out_pick(update: Update, ctx: ContextTypes.DEFAULT_TYPE, item, model):
    with db() as c:
        avail = stock_of(c, item, model)
    ctx.user_data.update(item=item, model=model, avail=avail)
    await say(update, f"Item: {label(item, model)}\n📦 Available in store: {fmt(avail)}\n"
                      "How many are you sending? (number only)")
    return OUT_QTY


async def out_item_cb(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    idx = int(update.callback_query.data.split(":")[1])
    try:
        item, model = ctx.user_data["choices"][idx]
    except (KeyError, IndexError):
        return await cancel(update, ctx)
    return await out_pick(update, ctx, item, model)


async def out_item_text(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    found = match_products(ctx.user_data.get("choices", []), update.message.text)
    if len(found) == 1:
        return await out_pick(update, ctx, *found[0])
    if len(found) > 1:
        await update.message.reply_text("That item has several models – please tap the exact one above.")
    else:
        await update.message.reply_text(
            "❌ That item is not in the store (or has 0 left). Tap one of the items above, or /cancel.")
    return OUT_ITEM


async def out_qty(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    d = ctx.user_data
    try:
        qty = parse_qty(update.message.text)
    except ValueError:
        await update.message.reply_text("❌ Please send a number greater than 0 (e.g. 20 or 7.5).")
        return OUT_QTY
    if qty > d["avail"]:
        await update.message.reply_text(
            f"❌ Not enough stock. Available: {fmt(d['avail'])}, you asked for {fmt(qty)}.\n"
            "Send a smaller number or /cancel.")
        return OUT_QTY
    d["qty"] = qty
    with db() as c:
        sites = all_sites(c)
    d["sites"] = sites
    await update.message.reply_text(
        "🏗 Which site / project is it going to?\n"
        + ("Tap an existing site or type a new site name." if sites else "Type the site name."),
        reply_markup=kb(sites, "site"))
    return OUT_SITE


async def out_site_cb(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    idx = int(update.callback_query.data.split(":")[1])
    try:
        site = ctx.user_data["sites"][idx]
    except (KeyError, IndexError):
        return await cancel(update, ctx)
    return await out_ask_confirm(update, ctx, site, new=False)


async def out_site_text(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    site = clean(update.message.text)
    if not valid_name(site):
        await update.message.reply_text(f"❌ Site name must be 1–{MAX_NAME} characters. Try again.")
        return OUT_SITE
    for s in ctx.user_data.get("sites", []):
        if s.lower() == site.lower():
            return await out_ask_confirm(update, ctx, s, new=False)
    return await out_ask_confirm(update, ctx, site, new=True)


async def out_ask_confirm(update: Update, ctx: ContextTypes.DEFAULT_TYPE, site, new):
    d = ctx.user_data
    d["site"] = site
    tag = " (new site)" if new else ""
    await say(update,
              f"Please confirm:\n⬆️ Send {fmt(d['qty'])} × {label(d['item'], d['model'])}\n"
              f"🏗 To: {site}{tag}\n📦 Store after: {fmt(d['avail'] - d['qty'])}", confirm_kb())
    return OUT_CONFIRM


async def out_confirm(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    d = ctx.user_data
    if not all(k in d for k in ("item", "model", "qty", "site")):
        return await cancel(update, ctx)
    with db() as c:
        avail = stock_of(c, d["item"], d["model"])  # re-check before saving
        if d["qty"] > avail:
            await say(update, f"❌ Stock changed – only {fmt(avail)} left. Nothing saved. Start again with /out.")
            ctx.user_data.clear()
            return ConversationHandler.END
        c.execute(
            "INSERT INTO moves (ts,item,model,qty,kind,site,user) VALUES (?,?,?,?,?,?,?)",
            (datetime.now().isoformat(timespec="seconds"), d["item"], d["model"], d["qty"], "OUT",
             d["site"], update.effective_user.first_name),
        )
        at_site = sent_to_site(c, d["item"], d["model"], d["site"])
    lb = label(d["item"], d["model"])
    await say(update,
              f"✅ Saved. Sent {fmt(d['qty'])} × {lb} to {d['site']}\n"
              f"📦 Left in store: {fmt(avail - d['qty'])}\n"
              f"🏗 Total {lb} at {d['site']}: {fmt(at_site)}")
    ctx.user_data.clear()
    return ConversationHandler.END


# ==================================================================== reports
async def cmd_stock(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    with db() as c:
        if ctx.args:
            found = match_products(all_products(c), " ".join(ctx.args))
            if not found:
                return await update.message.reply_text("I have no record of that item.")
            lines = [f"• {label(*p)}: {fmt(stock_of(c, *p))}" for p in found]
            return await update.message.reply_text("📦 In store:\n" + "\n".join(lines))
        rows = c.execute(
            "SELECT item, model, SUM(CASE kind WHEN 'IN' THEN qty ELSE -qty END) s "
            "FROM moves GROUP BY item, model ORDER BY item, model").fetchall()
    if not rows:
        return await update.message.reply_text("Store is empty. Use /in to add items.")
    lines = [f"• {label(r['item'], r['model'])}: {fmt(r['s'])}" for r in rows]
    await say_long(update, "📦 Currently in store:\n" + "\n".join(lines))


def site_text(c, site):
    rows = c.execute(
        "SELECT item, model, SUM(qty) t FROM moves WHERE kind='OUT' AND site=? "
        "GROUP BY item, model ORDER BY item, model", (site,)).fetchall()
    lines = [f"• {label(r['item'], r['model'])}: {fmt(r['t'])}" for r in rows]
    return f"🏗 {site} – total received:\n" + "\n".join(lines)


async def cmd_site(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    with db() as c:
        sites = all_sites(c)
        if not ctx.args:
            if not sites:
                return await update.message.reply_text("Nothing has been sent to any site yet.")
            ctx.user_data["rep_sites"] = sites
            return await update.message.reply_text("Which site?", reply_markup=kb(sites, "rep"))
        wanted = clean(" ".join(ctx.args)).lower()
        match = next((s for s in sites if s.lower() == wanted), None)
        if not match:
            names = ", ".join(sites) or "none yet"
            return await update.message.reply_text(f"❌ No site named '{wanted}'.\nKnown sites: {names}")
        text = site_text(c, match)
    await say_long(update, text)


async def rep_cb(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    idx = int(update.callback_query.data.split(":")[1])
    try:
        site = ctx.user_data["rep_sites"][idx]
    except (KeyError, IndexError):
        await update.callback_query.answer("Please run /site again")
        return
    with db() as c:
        text = site_text(c, site)
    await say_long(update, text)


async def cmd_report(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    with db() as c:
        sites = all_sites(c)
        if not sites:
            return await update.message.reply_text("Nothing has been sent to any site yet.")
        blocks = [site_text(c, s) for s in sites]
    await say_long(update, "\n\n".join(blocks))


async def cmd_where(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not ctx.args:
        return await update.message.reply_text("Example: /where cement   or   /where steel bar 12mm")
    with db() as c:
        found = match_products(all_products(c), " ".join(ctx.args))
        if not found:
            return await update.message.reply_text("I have no record of that item.")
        blocks = []
        for item, model in found:
            rows = c.execute(
                "SELECT site, SUM(qty) t FROM moves WHERE kind='OUT' AND item=? AND model=? "
                "GROUP BY site ORDER BY site", (item, model)).fetchall()
            lines = [f"  • {r['site']}: {fmt(r['t'])}" for r in rows] or ["  (not sent to any site yet)"]
            blocks.append(f"📦 {label(item, model)}\nIn store: {fmt(stock_of(c, item, model))}\nSent to:\n"
                          + "\n".join(lines))
    await say_long(update, "\n\n".join(blocks))


async def cmd_history(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    with db() as c:
        rows = c.execute("SELECT * FROM moves ORDER BY id DESC LIMIT 15").fetchall()
    if not rows:
        return await update.message.reply_text("No movements yet.")
    lines = []
    for r in rows:
        lb = label(r["item"], r["model"])
        if r["kind"] == "IN":
            lines.append(f"⬇️ {r['ts'][:16]}  +{fmt(r['qty'])} {lb}")
        else:
            lines.append(f"⬆️ {r['ts'][:16]}  -{fmt(r['qty'])} {lb} → {r['site']}")
    await say_long(update, "🕘 Last movements:\n" + "\n".join(lines))


async def cmd_undo(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    with db() as c:
        r = c.execute("SELECT * FROM moves ORDER BY id DESC LIMIT 1").fetchone()
        if not r:
            return await update.message.reply_text("Nothing to undo.")
        if r["kind"] == "IN" and stock_of(c, r["item"], r["model"]) - r["qty"] < 0:
            return await update.message.reply_text(
                "❌ Can't undo this receipt: some of it has already been sent out.")
        c.execute("DELETE FROM moves WHERE id=?", (r["id"],))
    await update.message.reply_text(
        f"↩️ Removed last entry: {r['kind']} {fmt(r['qty'])} × {label(r['item'], r['model'])}")


# ======================================================================== main
def main():
    init_db()
    app = ApplicationBuilder().token(TOKEN).build()
    app.add_handler(TypeHandler(Update, gatekeeper), group=-1)

    text_only = filters.TEXT & ~filters.COMMAND
    cancel_handlers = [CommandHandler("cancel", cancel), CallbackQueryHandler(cancel, pattern="^cancel$")]

    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("in", in_start)],
        states={
            IN_ITEM: [CallbackQueryHandler(in_item_cb, pattern=r"^item:\d+$"),
                      MessageHandler(text_only, in_item_text)],
            IN_MODEL: [CallbackQueryHandler(in_model_none, pattern="^nomodel$"),
                       MessageHandler(text_only, in_model_text)],
            IN_QTY: [MessageHandler(text_only, in_qty)],
            IN_CONFIRM: [CallbackQueryHandler(in_confirm, pattern="^confirm:yes$")],
        },
        fallbacks=cancel_handlers,
        allow_reentry=True,
    ))

    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("out", out_start)],
        states={
            OUT_ITEM: [CallbackQueryHandler(out_item_cb, pattern=r"^item:\d+$"),
                       MessageHandler(text_only, out_item_text)],
            OUT_QTY: [MessageHandler(text_only, out_qty)],
            OUT_SITE: [CallbackQueryHandler(out_site_cb, pattern=r"^site:\d+$"),
                       MessageHandler(text_only, out_site_text)],
            OUT_CONFIRM: [CallbackQueryHandler(out_confirm, pattern="^confirm:yes$")],
        },
        fallbacks=cancel_handlers,
        allow_reentry=True,
    ))

    for name, fn in [("start", start), ("help", start), ("myid", myid),
                     ("stock", cmd_stock), ("site", cmd_site), ("sites", cmd_site),
                     ("report", cmd_report), ("where", cmd_where),
                     ("history", cmd_history), ("undo", cmd_undo)]:
        app.add_handler(CommandHandler(name, fn))
    app.add_handler(CallbackQueryHandler(rep_cb, pattern=r"^rep:\d+$"))
    app.add_handler(CommandHandler("cancel", cancel))

    app.run_polling()


if __name__ == "__main__":
    main()
