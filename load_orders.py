#!/usr/bin/env python3
"""
Загрузка архивных заказов из Excel в wb_orders.
Файлы:
  - wb_orders.xlsx: Oct 2025 — Mar 2026 (89712 строк)
  - wb_zakaz.xlsx:  Mar 2026 — Jun 2026 (53385 строк)

UNIQUE: (store_id, g_number, nm_id, barcode, date)
"""
import os, sys, hashlib, openpyxl, psycopg2
from datetime import datetime, timezone

STORE_ID  = 'f809c4fb-3ddb-460a-8174-bc872d06571b'
DB_URL    = os.getenv('DATABASE_URL', 'postgresql://wbuser:wbpassword@localhost:5432/wbanalytics')
BATCH     = 500
WB_NULL_DT = datetime(2001, 1, 1)  # WB использует 2001-01-01 вместо NULL

# ────────────────────────────────────────────────────────────────
def make_id(srid, g_number, nm_id, barcode, date):
    """Детерминированный text-id из уникального ключа."""
    key = f"{STORE_ID}|{srid}|{g_number}|{nm_id}|{barcode}|{date}"
    return hashlib.md5(key.encode()).hexdigest()

def to_ts(v):
    if v is None: return None
    if isinstance(v, datetime):
        if v.year == 2001 and v.month == 1 and v.day == 1: return None
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc).isoformat()
        return v.isoformat()
    return None

def to_bool(v):
    if v is None or v == '' or v == 0 or v == 0.0: return False
    return bool(v)

def to_barcode(v):
    if v is None: return None
    try: return str(int(float(str(v))))
    except: return str(v).strip()

def to_int(v):
    if v is None or v == '' or (isinstance(v, float) and v != v): return None
    try: return int(float(str(v)))
    except: return None

def to_float(v):
    if v is None or v == '' or (isinstance(v, float) and v != v): return None
    try: return float(str(v))
    except: return None

def to_str(v):
    if v is None: return None
    s = str(v).strip()
    # убираем мусорные float-хвосты типа "0.0" для числовых srid
    if s.endswith('.0') and s[:-2].lstrip('-').isdigit():
        s = s[:-2]
    return s or None

# ────────────────────────────────────────────────────────────────
def parse_orders_xlsx(path):
    """wb_orders.xlsx: колонки от WB stats API (Oct-Mar)."""
    print(f"Читаем {path}...")
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    headers = [str(h).strip() if h else '' for h in rows[0]]
    h = {v: i for i, v in enumerate(headers)}

    result = []
    for row in rows[1:]:
        if not any(v is not None for v in row): continue

        date_val  = to_ts(row[h['date']])
        g_number  = to_str(row[h.get('gNumber', -1)]) if 'gNumber' in h else None
        nm_id_val = to_int(row[h.get('nmId', -1)]) if 'nmId' in h else None
        barcode   = to_barcode(row[h.get('barcode', -1)]) if 'barcode' in h else None
        srid      = to_str(row[h.get('srid', -1)]) if 'srid' in h else None
        row_hash  = to_str(row[h.get('rowHash', -1)]) if 'rowHash' in h else None

        if not date_val: continue

        result.append({
            'id':               row_hash or make_id(srid, g_number, nm_id_val, barcode, date_val),
            'store_id':         STORE_ID,
            'date':             date_val,
            'last_change_date': to_ts(row[h.get('lastChangeDate', -1)]) if 'lastChangeDate' in h else None,
            'supplier_article': to_str(row[h.get('supplierArticle', -1)]) if 'supplierArticle' in h else None,
            'nm_id':            nm_id_val,
            'barcode':          barcode,
            'category':         to_str(row[h.get('category', -1)]) if 'category' in h else None,
            'subject':          to_str(row[h.get('subject', -1)]) if 'subject' in h else None,
            'brand':            to_str(row[h.get('brand', -1)]) if 'brand' in h else None,
            'techsize':         to_str(row[h.get('techSize', -1)]) if 'techSize' in h else None,
            'income_id':        to_int(row[h.get('incomeID', -1)]) if 'incomeID' in h else None,
            'g_number':         g_number,
            'total_price':      to_float(row[h.get('totalPrice', -1)]) if 'totalPrice' in h else None,
            'discount_percent': to_float(row[h.get('discountPercent', -1)]) if 'discountPercent' in h else None,
            'spp':              to_int(row[h.get('Spp', -1)]) if 'Spp' in h else None,
            'price_after_spp':  to_float(row[h.get('Цена заказа', -1)]) if 'Цена заказа' in h else None,
            'is_cancel':        to_bool(row[h.get('is_cancel', -1)]) if 'is_cancel' in h else False,
            'cancel_dt':        to_ts(row[h.get('cancel_dt', -1)]) if 'cancel_dt' in h else None,
            'warehouse_name':   to_str(row[h.get('warehouseName', -1)]) if 'warehouseName' in h else None,
            'oblast':           to_str(row[h.get('oblast', -1)]) if 'oblast' in h else None,
            'oblast_okrug_name':None,
            'srid':             srid,
            'created_at':       datetime.now(timezone.utc).isoformat(),
        })
    print(f"  Готово: {len(result)} строк")
    return result

def parse_zakaz_xlsx(path):
    """wb_zakaz.xlsx: колонки от WB analytics API (Mar-Jun)."""
    print(f"Читаем {path}...")
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    headers = [str(h).strip() if h else '' for h in rows[0]]
    h = {v: i for i, v in enumerate(headers)}

    result = []
    for row in rows[1:]:
        if not any(v is not None for v in row): continue

        # В этом файле первая колонка — date, и она уже timestamptz
        date_val  = to_ts(row[h.get('date', 0)])
        g_number  = to_str(row[h.get('gNumber', -1)]) if 'gNumber' in h else None
        nm_id_val = to_int(row[h.get('nmId', -1)]) if 'nmId' in h else None
        barcode   = to_barcode(row[h.get('barcode', -1)]) if 'barcode' in h else None
        srid      = to_str(row[h.get('srid', -1)]) if 'srid' in h else None

        if not date_val: continue

        result.append({
            'id':               make_id(srid, g_number, nm_id_val, barcode, date_val),
            'store_id':         STORE_ID,
            'date':             date_val,
            'last_change_date': to_ts(row[h.get('lastChangeDate', -1)]) if 'lastChangeDate' in h else None,
            'supplier_article': to_str(row[h.get('supplierArticle', -1)]) if 'supplierArticle' in h else None,
            'nm_id':            nm_id_val,
            'barcode':          barcode,
            'category':         to_str(row[h.get('category', -1)]) if 'category' in h else None,
            'subject':          to_str(row[h.get('subject', -1)]) if 'subject' in h else None,
            'brand':            to_str(row[h.get('brand', -1)]) if 'brand' in h else None,
            'techsize':         to_str(row[h.get('techSize', -1)]) if 'techSize' in h else None,
            'income_id':        to_int(row[h.get('incomeID', -1)]) if 'incomeID' in h else None,
            'g_number':         g_number,
            'total_price':      to_float(row[h.get('totalPrice', -1)]) if 'totalPrice' in h else None,
            'discount_percent': to_float(row[h.get('discountPercent', -1)]) if 'discountPercent' in h else None,
            'spp':              to_int(row[h.get('Spp', -1)]) if 'Spp' in h else None,
            'price_after_spp':  to_float(row[h.get('Цена заказа', -1)]) if 'Цена заказа' in h else None,
            'is_cancel':        to_bool(row[h.get('is_cancel', -1)]) if 'is_cancel' in h else False,
            'cancel_dt':        to_ts(row[h.get('cancel_dt', -1)]) if 'cancel_dt' in h else None,
            'warehouse_name':   to_str(row[h.get('warehouseName', -1)]) if 'warehouseName' in h else None,
            'oblast':           to_str(row[h.get('oblast', -1)]) if 'oblast' in h else None,
            'oblast_okrug_name':to_str(row[h.get('region', -1)]) if 'region' in h else None,
            'srid':             srid,
            'created_at':       datetime.now(timezone.utc).isoformat(),
        })
    print(f"  Готово: {len(result)} строк")
    return result

# ────────────────────────────────────────────────────────────────
def upsert_batch(cur, rows):
    sql = """
    INSERT INTO wb_orders (
        id, store_id, date, last_change_date,
        supplier_article, nm_id, barcode, category, subject, brand, techsize,
        income_id, g_number, total_price, discount_percent, spp,
        price_after_spp, is_cancel, cancel_dt,
        warehouse_name, oblast, oblast_okrug_name, srid, created_at
    ) VALUES (
        %(id)s, %(store_id)s, %(date)s, %(last_change_date)s,
        %(supplier_article)s, %(nm_id)s, %(barcode)s, %(category)s, %(subject)s, %(brand)s, %(techsize)s,
        %(income_id)s, %(g_number)s, %(total_price)s, %(discount_percent)s, %(spp)s,
        %(price_after_spp)s, %(is_cancel)s, %(cancel_dt)s,
        %(warehouse_name)s, %(oblast)s, %(oblast_okrug_name)s, %(srid)s, %(created_at)s
    )
    ON CONFLICT (store_id, g_number, nm_id, barcode, date)
    WHERE g_number IS NOT NULL
    DO UPDATE SET
        last_change_date  = EXCLUDED.last_change_date,
        supplier_article  = EXCLUDED.supplier_article,
        total_price       = EXCLUDED.total_price,
        discount_percent  = EXCLUDED.discount_percent,
        spp               = EXCLUDED.spp,
        price_after_spp   = EXCLUDED.price_after_spp,
        is_cancel         = EXCLUDED.is_cancel,
        cancel_dt         = EXCLUDED.cancel_dt,
        warehouse_name    = EXCLUDED.warehouse_name,
        oblast            = EXCLUDED.oblast,
        oblast_okrug_name = EXCLUDED.oblast_okrug_name,
        srid              = EXCLUDED.srid
    """
    cur.executemany(sql, rows)

def main():
    all_rows = []
    all_rows += parse_orders_xlsx('/Users/glazzki/Downloads/wb_orders.xlsx')
    all_rows += parse_zakaz_xlsx('/Users/glazzki/Downloads/wb_zakaz.xlsx')
    print(f"\nВсего строк для загрузки: {len(all_rows)}")

    # Сортируем по дате
    all_rows.sort(key=lambda r: r['date'] or '')

    print(f"Период: {all_rows[0]['date'][:10]} → {all_rows[-1]['date'][:10]}")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # Текущее кол-во
    cur.execute("SELECT COUNT(*) FROM wb_orders WHERE store_id=%s", (STORE_ID,))
    before = cur.fetchone()[0]
    print(f"Строк в БД до загрузки: {before}")

    inserted = 0
    for i in range(0, len(all_rows), BATCH):
        batch = all_rows[i:i + BATCH]
        upsert_batch(cur, batch)
        inserted += len(batch)
        if inserted % 5000 == 0 or inserted == len(all_rows):
            conn.commit()
            pct = inserted / len(all_rows) * 100
            print(f"  {inserted}/{len(all_rows)} ({pct:.0f}%)")

    conn.commit()

    cur.execute("SELECT COUNT(*) FROM wb_orders WHERE store_id=%s", (STORE_ID,))
    after = cur.fetchone()[0]

    cur.execute("SELECT MIN(date), MAX(date) FROM wb_orders WHERE store_id=%s", (STORE_ID,))
    min_d, max_d = cur.fetchone()

    cur.close()
    conn.close()

    print(f"\n✅ Загружено файлов: {inserted} строк обработано")
    print(f"   Строк в БД: {before} → {after} (+{after - before})")
    print(f"   Период: {str(min_d)[:10]} → {str(max_d)[:10]}")

if __name__ == '__main__':
    main()
